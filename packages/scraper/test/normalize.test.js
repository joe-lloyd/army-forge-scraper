const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const dns = require("node:dns");
const fs = require("node:fs");
const http = require("node:http");
const https = require("node:https");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");

const fsx = require("fs-extra");

const {
  DEFAULTS,
  KEY_ORDER,
  MANIFEST_FILE_NAME,
  NORMALIZED_FILE_NAME,
  SCHEMA_VERSION,
  buildNormalizedDocument,
  latestReleaseDirName,
  main,
  normalizeRelease,
  resolveReleaseDir,
  serialize,
} = require("../src/normalize");

const REPO_ROOT = path.join(__dirname, "..", "..", "..");
const RELEASES_ROOT = path.join(REPO_ROOT, "releases");

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

// One unit per shape that actually occurs in a release: fully populated, with
// items, with a weapon that has rated rules, and bare (every optional field
// absent) so the defaults path is exercised by a real fixture and not only by
// a synthetic `{}`.
function unit(id, name, overrides = {}) {
  return {
    id,
    name,
    genericName: `${name} Chassis`,
    cost: 145,
    size: 3,
    originalSize: 3,
    bases: { round: "40", square: "30" },
    defense: 3,
    quality: 4,
    valid: true,
    hasCustomRule: false,
    hasBalanceInvalid: false,
    isNarrative: false,
    upgrades: ["gIdERs5O", "PzePx"],
    disabledSections: [],
    disabledUpgradeSections: [],
    weapons: [
      {
        id: "h4Ntaf0B",
        name: "CCW",
        type: "ArmyBookWeapon",
        count: 1,
        originalCount: 1,
        range: 0,
        attacks: 4,
        attacksMultiplier: 1,
        weaponId: "KAsYqgPq",
        label: "CCW (A4)",
        specialRules: [
          { id: "w_vX0mi58KKt", name: "Blast", type: "ArmyBookRule", rating: 3 },
        ],
      },
    ],
    items: [
      {
        id: "1jV1R",
        name: "Combat Shield",
        type: "ArmyBookItem",
        count: 1,
        bases: null,
        content: [
          { id: "wsqfB0fq69eG", name: "Shielded", type: "ArmyBookRule" },
        ],
      },
    ],
    rules: [{ id: "6mJw5IdqSqNC", name: "Ambush", label: "Ambush" }],
    ...overrides,
  };
}

function armyPayload(uid, name, overrides = {}) {
  return {
    uid,
    name,
    gameSystemId: 2,
    versionString: "3.5.3",
    factionName: "Battle Brothers",
    raceGroup: "Human",
    official: true,
    balanceValid: true,
    specialRules: [
      {
        id: "wsqfB0fq69eG",
        name: "Shielded",
        aliasedRuleId: null,
        description: "Units where all models have this rule get +1 defense.",
        hasRating: false,
        coreType: null,
        targetType: 1,
        originalName: "Shielded",
      },
    ],
    units: [unit(`${uid}-u0`, "Master Destroyer"), unit(`${uid}-u1`, "Battle Brother")],
    upgradePackages: [
      {
        uid: "PzePx",
        hint: "Master Destroyer",
        sections: [
          {
            id: "vkBXDgv",
            uid: "3LJ6Wjx",
            label: "Replace CCW",
            variant: "replace",
            targets: ["CCW"],
            affects: { type: "exactly", value: 1 },
            select: { type: "exactly", value: 1 },
            options: [
              {
                id: "ZRJfU6E",
                uid: "ZRJfU6E",
                label: "Energy Sword (A2, Rending)",
                cost: 10,
                costs: [
                  { unitId: "FJRVn9S", cost: 10, exactCost: 9.14 },
                ],
                gains: [
                  {
                    id: "0-erIAQg",
                    name: "Energy Sword",
                    type: "ArmyBookWeapon",
                    count: 1,
                    range: 0,
                    attacks: 2,
                    weaponId: "0-erIAQg",
                    attacksMultiplier: 1,
                    label: "Energy Sword (A2, Rending)",
                    specialRules: [
                      { id: "cavWDboL4ubs", name: "Rending", type: "ArmyBookRule" },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
    ...overrides,
  };
}

function tempRoot(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "opr-normalize-test-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

// Writes a release directory whose manifest is generated from the payloads, so
// a fixture can never disagree with its own index.
function writeRelease(root, releaseDirName, entries) {
  const dir = path.join(root, releaseDirName);
  const payloads = [];
  for (const { system, file, payload } of entries) {
    const full = path.join(dir, ...file.split("/"));
    fs.mkdirSync(path.dirname(full), { recursive: true });
    const json = `${JSON.stringify(payload, null, 2)}\n`;
    fs.writeFileSync(full, json);
    payloads.push({
      system,
      uid: payload.uid,
      name: payload.name,
      versionString: payload.versionString,
      file,
      bytes: Buffer.byteLength(json),
      sha256: crypto.createHash("sha256").update(json).digest("hex"),
    });
  }
  fs.writeFileSync(
    path.join(dir, MANIFEST_FILE_NAME),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        capturedAt: "2026-09-28T22:29:03.477Z",
        version: "3.5.3",
        releaseDir: releaseDirName,
        armyCount: payloads.length,
        payloads,
      },
      null,
      2,
    )}\n`,
  );
  return dir;
}

function sampleRelease(root) {
  return writeRelease(root, "9.9.9", [
    {
      system: "grimdark-future",
      file: "grimdark-future/Battle Brothers (aaa111).json",
      payload: armyPayload("aaa111", "Battle Brothers"),
    },
    {
      system: "grimdark-future-firefight",
      file: "grimdark-future-firefight/Battle Brothers (aaa111).json",
      payload: armyPayload("aaa111", "Battle Brothers", { gameSystemId: 3 }),
    },
    {
      system: "age-of-fantasy",
      file: "age-of-fantasy/Goblins (bbb222).json",
      payload: armyPayload("bbb222", "Goblins", {
        gameSystemId: 4,
        versionString: "9.9.8",
        units: [unit("bbb222-u0", "Grot")],
      }),
    },
  ]);
}

// Recursively asserts that every object in the document is written in the
// declared key order, and that it declares no key that the contract omits. The
// expected orders are written out by hand here rather than read from
// `KEY_ORDER`, so editing the contract to match a breaking change fails the
// suite instead of silently reformatting every future diff.
const EXPECTED_KEY_ORDER = {
  document: [
    "schemaVersion",
    "version",
    "releaseDir",
    "capturedAt",
    "defaults",
    "gameSystems",
    "armyCount",
    "armiesBySystem",
    "versionHistogram",
    "armies",
  ],
  army: [
    "uid",
    "name",
    "system",
    "systemId",
    "versionString",
    "factionName",
    "raceGroup",
    "official",
    "balanceValid",
    "specialRules",
    "units",
    "upgradePackages",
  ],
  armyRule: [
    "id",
    "name",
    "originalName",
    "aliasedRuleId",
    "hasRating",
    "coreType",
    "targetType",
    "description",
  ],
  unit: [
    "id",
    "name",
    "genericName",
    "key",
    "type",
    "cost",
    "size",
    "originalSize",
    "bases",
    "defense",
    "quality",
    "valid",
    "hasCustomRule",
    "hasBalanceInvalid",
    "isNarrative",
    "upgradePackageUids",
    "disabledSections",
    "disabledUpgradeSections",
    "weapons",
    "items",
    "rules",
  ],
  bases: ["round", "square"],
  weaponLike: [
    "type",
    "id",
    "name",
    "nameOverride",
    "label",
    "count",
    "originalCount",
    "range",
    "attacks",
    "attacksMultiplier",
    "weaponId",
    "rating",
    "newWeapon",
    "bases",
    "specialRules",
    "content",
  ],
  item: ["id", "name", "type", "count", "bases", "content"],
  ruleRef: ["id", "name", "label", "type", "rating", "additional"],
  upgradePackage: ["uid", "hint", "sections"],
  upgradeSection: [
    "id",
    "uid",
    "label",
    "variant",
    "select",
    "model",
    "isHeroUpgrade",
    "isLowPrio",
    "targets",
    "affects",
    "options",
  ],
  upgradeOption: ["id", "uid", "label", "cost", "costs", "gains"],
  upgradeCost: ["unitId", "cost", "exactCost"],
  selection: ["type", "value"],
};

function keysOf(value) {
  return Object.keys(value);
}

function assertOrder(actual, expected, where) {
  assert.deepEqual(
    keysOf(actual),
    expected,
    `key order at ${where} does not match the documented order`,
  );
}

function assertDocumentKeyOrder(document) {
  assertOrder(document, EXPECTED_KEY_ORDER.document, "document");
  for (const army of document.armies) {
    const at = `army ${army.system}/${army.name}`;
    assertOrder(army, EXPECTED_KEY_ORDER.army, at);
    for (const rule of army.specialRules) {
      assertOrder(rule, EXPECTED_KEY_ORDER.armyRule, `${at} specialRules`);
    }
    for (const u of army.units) {
      const unitAt = `${at} unit ${u.name}`;
      assertOrder(u, EXPECTED_KEY_ORDER.unit, unitAt);
      assertOrder(u.bases, EXPECTED_KEY_ORDER.bases, `${unitAt} bases`);
      for (const weapon of u.weapons) {
        assertOrder(weapon, EXPECTED_KEY_ORDER.weaponLike, `${unitAt} weapon`);
        assertOrder(weapon.bases, EXPECTED_KEY_ORDER.bases, `${unitAt} weapon bases`);
        for (const ref of weapon.specialRules) {
          assertOrder(ref, EXPECTED_KEY_ORDER.ruleRef, `${unitAt} weapon rule`);
        }
      }
      for (const item of u.items) {
        assertOrder(item, EXPECTED_KEY_ORDER.item, `${unitAt} item`);
        assertOrder(item.bases, EXPECTED_KEY_ORDER.bases, `${unitAt} item bases`);
        for (const content of item.content) {
          assertOrder(content, EXPECTED_KEY_ORDER.weaponLike, `${unitAt} item content`);
        }
      }
      for (const ref of u.rules) {
        assertOrder(ref, EXPECTED_KEY_ORDER.ruleRef, `${unitAt} rule`);
      }
    }
    for (const pkg of army.upgradePackages) {
      const pkgAt = `${at} package ${pkg.uid}`;
      assertOrder(pkg, EXPECTED_KEY_ORDER.upgradePackage, pkgAt);
      for (const section of pkg.sections) {
        const sectionAt = `${pkgAt} section ${section.uid}`;
        assertOrder(section, EXPECTED_KEY_ORDER.upgradeSection, sectionAt);
        if (section.select !== null) {
          assertOrder(section.select, EXPECTED_KEY_ORDER.selection, `${sectionAt} select`);
        }
        for (const affects of section.affects) {
          assertOrder(affects, EXPECTED_KEY_ORDER.selection, `${sectionAt} affects`);
        }
        for (const option of section.options) {
          const optionAt = `${sectionAt} option ${option.uid}`;
          assertOrder(option, EXPECTED_KEY_ORDER.upgradeOption, optionAt);
          for (const cost of option.costs) {
            assertOrder(cost, EXPECTED_KEY_ORDER.upgradeCost, `${optionAt} cost`);
          }
          for (const gain of option.gains) {
            assertOrder(gain, EXPECTED_KEY_ORDER.weaponLike, `${optionAt} gain`);
          }
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Acceptance: fixed key order, identical in every release
// ---------------------------------------------------------------------------

test("the produced document writes every object in the documented key order", (t) => {
  const root = tempRoot(t);
  const document = buildNormalizedDocument(sampleRelease(root));
  assertDocumentKeyOrder(document);
});

test("the hand-written key order and the exported KEY_ORDER agree", () => {
  assert.deepEqual(KEY_ORDER, EXPECTED_KEY_ORDER);
});

test("two different releases produce the same key order", (t) => {
  const root = tempRoot(t);
  const rich = buildNormalizedDocument(sampleRelease(root));
  // A second release of the same version, captured from a payload that carries
  // none of the optional fields, must not shift a single key.
  const sparse = buildNormalizedDocument(
    writeRelease(root, "9.9.9__2", [
      {
        system: "grimdark-future",
        file: "grimdark-future/Bare (ccc333).json",
        payload: {
          uid: "ccc333",
          name: "Bare",
          versionString: "9.9.9",
          units: [{ id: "u0", name: "Only Unit" }],
        },
      },
    ]),
  );
  assertDocumentKeyOrder(sparse);
  assert.deepEqual(
    keysOf(rich.armies[0]),
    keysOf(sparse.armies[0]),
    "a sparse payload reordered the army object relative to a rich one",
  );
  assert.deepEqual(
    keysOf(rich.armies[0].units[0]),
    keysOf(sparse.armies[0].units[0]),
    "a sparse payload reordered the unit object relative to a rich one",
  );
});

// ---------------------------------------------------------------------------
// Acceptance: every unit appears, with stats, weapons and upgrades
// ---------------------------------------------------------------------------

test("every unit in the raw payload appears with its stats, weapons and upgrades", (t) => {
  const root = tempRoot(t);
  const raw = armyPayload("aaa111", "Battle Brothers");
  const document = buildNormalizedDocument(sampleRelease(root));
  const normalized = document.armies.find(
    (a) => a.system === "grimdark-future" && a.uid === "aaa111",
  );

  assert.equal(normalized.units.length, raw.units.length);
  raw.units.forEach((source, index) => {
    const unit = normalized.units[index];
    assert.equal(unit.id, source.id);
    assert.equal(unit.name, source.name);
    // Stat values, by value rather than by key list, so a stat that silently
    // stops being carried fails here.
    assert.equal(unit.cost, source.cost);
    assert.equal(unit.size, source.size);
    assert.equal(unit.defense, source.defense);
    assert.equal(unit.quality, source.quality);
    assert.deepEqual(unit.bases, source.bases);
    // Weapons, down to the rated rules on them.
    assert.equal(unit.weapons.length, source.weapons.length);
    assert.equal(unit.weapons[0].name, "CCW");
    assert.equal(unit.weapons[0].attacks, 4);
    assert.equal(unit.weapons[0].range, 0);
    assert.deepEqual(
      unit.weapons[0].specialRules.map((r) => r.name),
      ["Blast"],
    );
    assert.equal(unit.weapons[0].specialRules[0].rating, 3);
    // Items and their content.
    assert.equal(unit.items.length, source.items.length);
    assert.equal(unit.items[0].name, "Combat Shield");
    assert.equal(unit.items[0].content[0].name, "Shielded");
    // Rules.
    assert.deepEqual(unit.rules.map((r) => r.name), ["Ambush"]);
    // Upgrades: the packages the unit may draw from.
    assert.deepEqual(unit.upgradePackageUids, ["PzePx", "gIdERs5O"]);
  });

  // And the army's upgrade packages, with every section, option and gain.
  const pkg = normalized.upgradePackages[0];
  assert.equal(pkg.uid, "PzePx");
  assert.equal(pkg.hint, "Master Destroyer");
  assert.equal(pkg.sections[0].uid, "3LJ6Wjx");
  assert.equal(pkg.sections[0].variant, "replace");
  assert.deepEqual(pkg.sections[0].targets, ["CCW"]);
  assert.deepEqual(pkg.sections[0].select, { type: "exactly", value: 1 });
  assert.deepEqual(pkg.sections[0].affects, [{ type: "exactly", value: 1 }]);
  const option = pkg.sections[0].options[0];
  assert.equal(option.uid, "ZRJfU6E");
  assert.equal(option.cost, 10);
  assert.deepEqual(option.costs, [
    { unitId: "FJRVn9S", cost: 10, exactCost: 9.14 },
  ]);
  assert.equal(option.gains[0].name, "Energy Sword");
  assert.equal(option.gains[0].attacks, 2);
  assert.deepEqual(
    option.gains[0].specialRules.map((r) => r.name),
    ["Rending"],
  );
});

test("a unit with no weapons, items, rules or upgrades keeps every key", (t) => {
  const root = tempRoot(t);
  const document = buildNormalizedDocument(
    writeRelease(root, "9.9.9", [
      {
        system: "grimdark-future",
        file: "grimdark-future/Bare (ccc333).json",
        payload: {
          uid: "ccc333",
          name: "Bare",
          versionString: "9.9.9",
          units: [{ id: "u0", name: "Naked" }],
        },
      },
    ]),
  );
  const unit = document.armies[0].units[0];
  assert.deepEqual(keysOf(unit), EXPECTED_KEY_ORDER.unit);
  assert.deepEqual(unit.weapons, []);
  assert.deepEqual(unit.items, []);
  assert.deepEqual(unit.rules, []);
  assert.deepEqual(unit.upgradePackageUids, []);
  // Every stat resolves to its documented default.
  assert.equal(unit.cost, null);
  assert.equal(unit.size, null);
  assert.equal(unit.originalSize, null);
  assert.equal(unit.defense, null);
  assert.equal(unit.quality, null);
  assert.equal(unit.genericName, null);
  assert.equal(unit.key, null);
  assert.equal(unit.type, null);
  assert.deepEqual(unit.bases, { round: null, square: null });
  assert.equal(unit.valid, true);
  assert.equal(unit.isNarrative, false);
});

test("an explicit null in the payload resolves to the same default as an absent field", (t) => {
  const root = tempRoot(t);
  const document = buildNormalizedDocument(
    writeRelease(root, "9.9.9", [
      {
        system: "grimdark-future",
        file: "grimdark-future/Nulls (ccc333).json",
        payload: {
          uid: "ccc333",
          name: "Nulls",
          versionString: "9.9.9",
          units: [
            {
              id: "u0",
              name: "Explicit",
              cost: null,
              weapons: null,
              items: null,
              rules: null,
              upgrades: null,
              disabledSections: null,
              bases: null,
            },
          ],
        },
      },
    ]),
  );
  const unit = document.armies[0].units[0];
  assert.equal(unit.cost, null);
  assert.deepEqual(unit.weapons, []);
  assert.deepEqual(unit.items, []);
  assert.deepEqual(unit.rules, []);
  assert.deepEqual(unit.upgradePackageUids, []);
  assert.deepEqual(unit.bases, { round: null, square: null });
  // A `null` list is not a list; it must not reach a consumer as `null`.
  assert.ok(!("null" in unit));
});

test("falsy values a payload really sends are not replaced by defaults", (t) => {
  const root = tempRoot(t);
  const document = buildNormalizedDocument(
    writeRelease(root, "9.9.9", [
      {
        system: "grimdark-future",
        file: "grimdark-future/Falsy (ccc333).json",
        payload: {
          uid: "ccc333",
          name: "Falsy",
          versionString: "9.9.9",
          units: [
            {
              id: "u0",
              name: "Zeroes",
              cost: 0,
              defense: 0,
              quality: 0,
              size: 0,
              valid: false,
              hasBalanceInvalid: true,
              weapons: [
                {
                  id: "w0",
                  name: "Empty",
                  count: 0,
                  range: 0,
                  attacks: 0,
                  specialRules: [
                    { id: "r0", name: "Lacerate", rating: 0, additional: false },
                  ],
                },
              ],
            },
          ],
        },
      },
    ]),
  );
  const unit = document.armies[0].units[0];
  assert.equal(unit.cost, 0);
  assert.equal(unit.defense, 0);
  assert.equal(unit.quality, 0);
  assert.equal(unit.size, 0);
  assert.equal(unit.valid, false);
  assert.equal(unit.hasBalanceInvalid, true);
  assert.equal(unit.weapons[0].count, 0);
  assert.equal(unit.weapons[0].attacks, 0);
  assert.equal(unit.weapons[0].specialRules[0].rating, 0);
});

test("a non-numeric rule rating is carried verbatim, not coerced", (t) => {
  const root = tempRoot(t);
  const document = buildNormalizedDocument(
    writeRelease(root, "9.9.9", [
      {
        system: "grimdark-future",
        file: "grimdark-future/Ratings (ccc333).json",
        payload: {
          uid: "ccc333",
          name: "Ratings",
          versionString: "9.9.9",
          units: [
            {
              id: "u0",
              name: "Spawner",
              upgradePackages: undefined,
              weapons: [],
            },
          ],
          upgradePackages: [
            {
              uid: "A1",
              sections: [
                {
                  id: "s0",
                  uid: "s0uid",
                  options: [
                    {
                      id: "o0",
                      uid: "o0uid",
                      gains: [
                        {
                          name: "Spawn",
                          type: "ArmyBookRule",
                          rating: "Spores [5]",
                          label: "Spawn(Spores [5])",
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      },
    ]),
  );
  const gain = document.armies[0].upgradePackages[0].sections[0].options[0]
    .gains[0];
  assert.equal(gain.rating, "Spores [5]");
});

// ---------------------------------------------------------------------------
// Acceptance: defaults are recorded, not implied
// ---------------------------------------------------------------------------

test("the document embeds the defaults it actually applied", (t) => {
  const root = tempRoot(t);
  const document = buildNormalizedDocument(sampleRelease(root));
  assert.deepEqual(document.defaults, JSON.parse(JSON.stringify(DEFAULTS)));
  // The embedded tree has to be the same object the normalizer defaults from,
  // or it is documentation that can rot.
  assert.deepEqual(document.defaults.unit.cost, DEFAULTS.unit.cost);
  assert.deepEqual(document.defaults.unit.weapons, DEFAULTS.unit.weapons);
});

test("the defaults tree is cloned, so a consumer cannot reach the module's constants", (t) => {
  const root = tempRoot(t);
  const document = buildNormalizedDocument(sampleRelease(root));
  document.defaults.unit.cost = 999;
  document.defaults.unit.weapons.push("mutated");
  assert.equal(DEFAULTS.unit.cost, null);
  assert.equal(DEFAULTS.unit.weapons.length, 0);
});

// ---------------------------------------------------------------------------
// Determinism: same bytes on every machine, every run
// ---------------------------------------------------------------------------

test("normalizing the same release twice produces identical bytes", (t) => {
  const root = tempRoot(t);
  const dir = sampleRelease(root);
  const first = normalizeRelease({ releasesRoot: root, releaseDir: dir, log() {} });
  const firstBytes = fs.readFileSync(first.outputFile);
  const second = normalizeRelease({ releasesRoot: root, releaseDir: dir, log() {} });
  assert.equal(first.sha256, second.sha256);
  assert.deepEqual(fs.readFileSync(second.outputFile), firstBytes);
});

test("the order the payloads are listed in does not reach the document", (t) => {
  const root = tempRoot(t);
  const dir = sampleRelease(root);
  const manifestPath = path.join(dir, MANIFEST_FILE_NAME);
  const manifest = fsx.readJsonSync(manifestPath);
  fs.writeFileSync(
    manifestPath,
    `${JSON.stringify({ ...manifest, payloads: manifest.payloads.slice().reverse() }, null, 2)}\n`,
  );
  const shuffled = serialize(buildNormalizedDocument(dir));
  const again = serialize(buildNormalizedDocument(dir));
  assert.equal(shuffled, again);

  // And the restored order gives the same document as before the shuffle.
  fs.writeFileSync(
    manifestPath,
    `${JSON.stringify({ ...manifest, payloads: manifest.payloads }, null, 2)}\n`,
  );
  assert.equal(serialize(buildNormalizedDocument(dir)), shuffled);
});

test("ordered lists keep the payload's order, id-keyed collections are sorted", (t) => {
  const root = tempRoot(t);
  const document = buildNormalizedDocument(
    writeRelease(root, "9.9.9", [
      {
        system: "grimdark-future",
        file: "grimdark-future/Ordered (ccc333).json",
        payload: {
          uid: "ccc333",
          name: "Ordered",
          versionString: "9.9.9",
          units: [
            { id: "u0", name: "Zeta", upgrades: ["zzz", "aaa"], disabledSections: ["zz", "aa"] },
            { id: "u1", name: "Alpha" },
          ],
          upgradePackages: [
            { uid: "Z9", sections: [{ uid: "z", id: "z", options: [] }, { uid: "a", id: "a", options: [] }] },
            { uid: "A1", sections: [] },
          ],
        },
      },
    ]),
  );
  const army = document.armies[0];
  // Roster order is meaningful and is preserved.
  assert.deepEqual(army.units.map((u) => u.name), ["Zeta", "Alpha"]);
  // Sets of ids are sorted, so a server-side reordering is not a change.
  assert.deepEqual(army.units[0].upgradePackageUids, ["aaa", "zzz"]);
  assert.deepEqual(army.units[0].disabledSections, ["aa", "zz"]);
  assert.deepEqual(army.upgradePackages.map((p) => p.uid), ["A1", "Z9"]);
  assert.deepEqual(army.upgradePackages[1].sections.map((s) => s.uid), ["a", "z"]);
});

// ---------------------------------------------------------------------------
// Acceptance: the document lands beside the raw payloads, and the raw payloads
// are untouched
// ---------------------------------------------------------------------------

test("the release directory ends up with the document beside the raw payloads", (t) => {
  const root = tempRoot(t);
  const dir = sampleRelease(root);
  const result = normalizeRelease({ releasesRoot: root, releaseDir: dir, log() {} });
  assert.equal(path.join(dir, NORMALIZED_FILE_NAME), result.outputFile);
  assert.ok(fs.existsSync(result.outputFile));
  assert.equal(result.document.releaseDir, "9.9.9");
  assert.equal(result.document.version, "3.5.3");
  assert.equal(result.document.armyCount, 3);
});

test("raw payloads are byte-identical after a normalize run", (t) => {
  const root = tempRoot(t);
  const dir = sampleRelease(root);
  const before = new Map();
  const walk = (current, into) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full, into);
      else into.set(path.relative(dir, full), fs.readFileSync(full));
    }
  };
  walk(dir, before);

  normalizeRelease({ releasesRoot: root, releaseDir: dir, log() {} });

  for (const [file, bytes] of before) {
    assert.deepEqual(
      fs.readFileSync(path.join(dir, file)),
      bytes,
      `${file} changed during normalization`,
    );
  }
  // The only new file is the normalized document.
  const after = new Map();
  walk(dir, after);
  assert.equal(after.size, before.size + 1);
  assert.deepEqual(
    [...after.keys()].filter((file) => !before.has(file)),
    [NORMALIZED_FILE_NAME],
  );
});

test("a release whose payload was edited after capture is refused", (t) => {
  const root = tempRoot(t);
  const dir = sampleRelease(root);
  const victim = path.join(dir, "grimdark-future", "Battle Brothers (aaa111).json");
  const payload = fsx.readJsonSync(victim);
  payload.units[0].cost = 1;
  fs.writeFileSync(victim, `${JSON.stringify(payload, null, 2)}\n`);

  assert.throws(
    () => normalizeRelease({ releasesRoot: root, releaseDir: dir, log() {} }),
    /does not match the SHA-256 in manifest\.json/,
  );
  assert.ok(
    !fs.existsSync(path.join(dir, NORMALIZED_FILE_NAME)),
    "a refused run left a normalized document behind",
  );
});

test("a payload the manifest lists but the directory does not hold is refused", (t) => {
  const root = tempRoot(t);
  const dir = sampleRelease(root);
  fs.rmSync(path.join(dir, "age-of-fantasy", "Goblins (bbb222).json"));
  assert.throws(
    () => buildNormalizedDocument(dir),
    /lists age-of-fantasy\/Goblins \(bbb222\)\.json, which is not in the directory/,
  );
});

test("an army payload added to the directory but not to the manifest is refused", (t) => {
  const root = tempRoot(t);
  const dir = sampleRelease(root);
  fs.writeFileSync(
    path.join(dir, "grimdark-future", "Smuggled (ddd444).json"),
    `${JSON.stringify(armyPayload("ddd444", "Smuggled"), null, 2)}\n`,
  );
  assert.throws(
    () => buildNormalizedDocument(dir),
    /contains 1 file\(s\) that manifest\.json does not list/,
  );
});

test("a payload with no units is refused rather than normalized as an empty army", (t) => {
  const root = tempRoot(t);
  const dir = writeRelease(root, "9.9.9", [
    {
      system: "grimdark-future",
      file: "grimdark-future/Empty (ccc333).json",
      payload: { uid: "ccc333", name: "Empty", versionString: "9.9.9", units: [] },
    },
  ]);
  assert.throws(() => buildNormalizedDocument(dir), /units array is empty/);
});

test("a directory that is not a release is refused", (t) => {
  const root = tempRoot(t);
  assert.throws(
    () => buildNormalizedDocument(root),
    new RegExp(`is not a release directory: no ${MANIFEST_FILE_NAME}`),
  );
});

test("an interrupted write's temp file is swept and never treated as content", (t) => {
  const root = tempRoot(t);
  const dir = sampleRelease(root);
  const litter = path.join(dir, ".normalize-999-1");
  fs.writeFileSync(litter, "{ truncated");
  const swept = [];
  normalizeRelease({
    releasesRoot: root,
    releaseDir: dir,
    log: (line) => swept.push(line),
  });
  assert.ok(!fs.existsSync(litter));
  assert.ok(swept.some((line) => line.includes(".normalize-999-1")));
  assert.ok(fs.existsSync(path.join(dir, NORMALIZED_FILE_NAME)));
});

// ---------------------------------------------------------------------------
// Release selection and CLI behaviour
// ---------------------------------------------------------------------------

test("a bare run targets the most recently captured release", (t) => {
  const root = tempRoot(t);
  writeRelease(root, "1.0.0", [
    {
      system: "grimdark-future",
      file: "grimdark-future/Old (aaa111).json",
      payload: armyPayload("aaa111", "Old", { versionString: "1.0.0" }),
    },
  ]);
  const newer = writeRelease(root, "2.0.0", [
    {
      system: "grimdark-future",
      file: "grimdark-future/New (bbb222).json",
      payload: armyPayload("bbb222", "New", { versionString: "2.0.0" }),
    },
  ]);
  // The newer release was captured first, so the older directory's name must not
  // be what decides.
  const manifestPath = path.join(newer, MANIFEST_FILE_NAME);
  const manifest = fsx.readJsonSync(manifestPath);
  fs.writeFileSync(
    manifestPath,
    `${JSON.stringify({ ...manifest, capturedAt: "2020-01-01T00:00:00.000Z" }, null, 2)}\n`,
  );

  assert.equal(latestReleaseDirName(root), "1.0.0");
  assert.equal(resolveReleaseDir(undefined, root).dir, path.join(root, "1.0.0"));
  // A name is resolved under the releases root; a path is taken as given.
  assert.equal(resolveReleaseDir("2.0.0", root).dir, path.join(root, "2.0.0"));
  assert.equal(resolveReleaseDir(newer, root).name, "2.0.0");
});

test("sibling captures of one version each get a document", (t) => {
  const root = tempRoot(t);
  for (const name of ["3.5.3", "3.5.3__2", "3.5.3__3"]) {
    writeRelease(root, name, [
      {
        system: "grimdark-future",
        file: "grimdark-future/Battle Brothers (aaa111).json",
        payload: armyPayload("aaa111", "Battle Brothers"),
      },
    ]);
  }
  for (const name of ["3.5.3", "3.5.3__2", "3.5.3__3"]) {
    const result = normalizeRelease({
      releasesRoot: root,
      releaseDir: name,
      log() {},
    });
    assert.equal(result.document.releaseDir, name);
    assert.ok(fs.existsSync(path.join(root, name, NORMALIZED_FILE_NAME)));
  }
});

test("main returns a non-zero exit code and writes nothing on failure", (t) => {
  const root = tempRoot(t);
  const dir = sampleRelease(root);
  const victim = path.join(dir, "age-of-fantasy", "Goblins (bbb222).json");
  fs.rmSync(victim);

  const errors = [];
  const original = console.error;
  console.error = (line) => errors.push(line);
  let code;
  try {
    code = main({ releasesRoot: root, releaseDir: dir });
  } finally {
    console.error = original;
  }

  assert.equal(code, 1);
  assert.ok(errors.join("\n").startsWith("\nNormalize failed."));
  assert.ok(!fs.existsSync(path.join(dir, NORMALIZED_FILE_NAME)));
});

test("main returns zero on success", (t) => {
  const root = tempRoot(t);
  const dir = sampleRelease(root);
  const original = console.log;
  console.log = () => {};
  let code;
  try {
    code = main({ releasesRoot: root, releaseDir: dir });
  } finally {
    console.log = original;
  }
  assert.equal(code, 0);
  assert.ok(fs.existsSync(path.join(dir, NORMALIZED_FILE_NAME)));
});

// ---------------------------------------------------------------------------
// Acceptance: single command, no network
// ---------------------------------------------------------------------------

// Replaces every way this process could open a socket or resolve a hostname,
// runs `fn`, and returns the names of the traps that fired. `axios` goes
// through `http`/`https`, `net.Socket.prototype.connect` catches a raw socket,
// and `dns.lookup` catches the name resolution both of them need.
function withNetworkTraps(fn) {
  const fired = [];
  const trap = (name) =>
    function trapped() {
      fired.push(name);
      throw new Error(`network access attempted via ${name}`);
    };
  const originals = {
    httpRequest: http.request,
    httpGet: http.get,
    httpsRequest: https.request,
    httpsGet: https.get,
    netConnect: net.connect,
    socketConnect: net.Socket.prototype.connect,
    dnsLookup: dns.lookup,
    dnsPromisesLookup: dns.promises.lookup,
  };
  http.request = trap("http.request");
  http.get = trap("http.get");
  https.request = trap("https.request");
  https.get = trap("https.get");
  net.connect = trap("net.connect");
  net.Socket.prototype.connect = trap("net.Socket#connect");
  dns.lookup = trap("dns.lookup");
  dns.promises.lookup = trap("dns.promises.lookup");
  try {
    fn();
  } finally {
    Object.assign(http, { request: originals.httpRequest, get: originals.httpGet });
    Object.assign(https, {
      request: originals.httpsRequest,
      get: originals.httpsGet,
    });
    net.connect = originals.netConnect;
    net.Socket.prototype.connect = originals.socketConnect;
    dns.lookup = originals.dnsLookup;
    dns.promises.lookup = originals.dnsPromisesLookup;
  }
  return fired;
}

test("normalizing a release opens no socket and resolves no hostname", (t) => {
  const root = tempRoot(t);
  const dir = sampleRelease(root);
  const fired = withNetworkTraps(() => {
    const result = normalizeRelease({ releasesRoot: root, releaseDir: dir, log() {} });
    assert.equal(result.document.armyCount, 3);
  });
  assert.deepEqual(fired, []);
});

// ---------------------------------------------------------------------------
// The real captures in this checkout
// ---------------------------------------------------------------------------

test("the recorded releases normalize, if they are present in the checkout", (t) => {
  const names = fs.existsSync(RELEASES_ROOT)
    ? fs.readdirSync(RELEASES_ROOT, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort()
    : [];
  if (names.length === 0) {
    t.skip("no release directory in this checkout");
    return;
  }
  const real = path.join(RELEASES_ROOT, names[names.length - 1]);
  // Copied, so the run writes its document into a temp tree and cannot touch
  // the checkout's release.
  const root = tempRoot(t);
  const copy = path.join(root, path.basename(real));
  fs.cpSync(real, copy, { recursive: true });
  fs.rmSync(path.join(copy, NORMALIZED_FILE_NAME), { force: true });

  const result = normalizeRelease({ releasesRoot: root, releaseDir: copy, log() {} });
  const manifest = fsx.readJsonSync(path.join(copy, MANIFEST_FILE_NAME));
  const document = result.document;

  assert.equal(document.armyCount, manifest.payloads.length);
  assert.equal(document.version, manifest.version);
  assert.equal(document.capturedAt, manifest.capturedAt);
  assert.equal(document.schemaVersion, SCHEMA_VERSION);
  assert.deepEqual(
    Object.keys(document.armiesBySystem).sort(),
    Object.keys(manifest.armiesBySystem).sort(),
  );
  // The summary is recomputed from the armies, so it must still match what the
  // capture recorded.
  for (const [system, count] of Object.entries(manifest.armiesBySystem)) {
    assert.equal(document.armiesBySystem[system], count, `count for ${system}`);
  }
  assertDocumentKeyOrder(document);

  // Every captured unit reaches the document, and every army-keyed unit id is
  // present. Checked across the whole release, not a sample.
  const unitsByArmy = new Map();
  for (const entry of manifest.payloads) {
    const payload = fsx.readJsonSync(
      path.join(copy, ...entry.file.split("/")),
    );
    unitsByArmy.set(`${entry.system}/${entry.uid}`, payload.units.length);
  }
  let totalUnits = 0;
  for (const army of document.armies) {
    const expected = unitsByArmy.get(`${army.system}/${army.uid}`);
    assert.notEqual(expected, undefined, `no manifest entry for ${army.system}/${army.uid}`);
    assert.equal(army.units.length, expected, `unit count for ${army.system}/${army.name}`);
    totalUnits += army.units.length;
  }
  assert.ok(totalUnits > 0);
  t.diagnostic(
    `${names.length} release(s); normalized ${path.basename(real)}: ${document.armyCount} armies, ${totalUnits} units, ${result.bytes} bytes`,
  );
});
