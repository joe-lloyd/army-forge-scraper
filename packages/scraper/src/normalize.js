const crypto = require("crypto");
const fs = require("fs-extra");
const path = require("path");

const { validateArmyPayload } = require("./capture");

// RELEASE NORMALIZER
// ------------------
// `node src/normalize.js [release]` turns one captured release directory into a
// single normalized JSON document:
//
//   releases/<version>__<n>/
//     manifest.json
//     normalized.json        <-- written by this script
//     <system>/<army name> (<uid>).json
//     <system>/common-rules.json
//
// The raw payloads are the full-fidelity record and are never modified. This
// script only *adds* `normalized.json`; it writes it through a temp file and a
// single rename, and it re-verifies every raw payload's SHA-256 against the
// manifest afterwards, so a normalized release can never disagree with the
// capture it came from.
//
// Three properties this file guarantees, each of them tested:
//
//   1. No network. This file reads and writes the filesystem and nothing else.
//      It requires no HTTP client and calls no fetch function; the only reason
//      `axios` is in the process at all is that `capture.js` is required for
//      its `validateArmyPayload` predicate, and requiring a module is not
//      requesting anything. The test suite makes the guarantee real rather than
//      theoretical by replacing `http.request`, `https.request`,
//      `net.Socket.prototype.connect`, `dns.lookup` and `dns.promises.lookup`
//      with traps that fail the run, then normalizing a real 186-army release
//      through them.
//   2. Fixed key order. Every object is written as a literal whose keys are in
//      the order declared in `KEY_ORDER`, and that order is identical in every
//      release. `KEY_ORDER` is the documented contract; a test pins the produced
//      document against a hand-written copy of it, so reordering a literal
//      without updating the contract fails the suite rather than silently
//      reformatting every future diff.
//   3. Documented defaults. A field the payload omits is not dropped. Its key
//      is still present, holding the value in `DEFAULTS`, and the whole
//      `DEFAULTS` tree is embedded in the document under `defaults` so a
//      consumer never has to guess what a `null` means.
//
// WHY A SEPARATE DOCUMENT, AND WHY ORDER MATTERS
// ----------------------------------------------
// The differ compares two releases key by key, and a diff is only readable if
// the two sides line up. Raw payloads are not comparable in that way: their key
// order is whatever the server emitted, they carry per-army bookkeeping that is
// not army data (uploads, popularity, image paths), and a field that simply
// stopped being sent is indistinguishable from a field that was deleted.
// Normalizing once, at capture time, turns "the server reshuffled a JSON object"
// into either nothing at all or a real, localized change.
//
// ORDERING RULES, stated once so they are not guessed at per field:
//
//   * Objects: the fixed order in `KEY_ORDER`, everywhere, always.
//   * Ordered lists that carry meaning keep the payload's order: `units` (the
//     roster order is the unit-count limit), `weapons`, `items`, `rules`,
//     `specialRules`, `upgrade sections/options/gains`, `costs`, `targets`.
//     Reordering these would invent a change that never happened.
//   * Lookup tables and sets are sorted: `armies` by (system, name, uid), and
//     every id-keyed collection (`specialRules` dictionary, `upgradePackages`,
//     `sections`, `options`, `upgradePackageUids`, `disabledSections`,
//     `disabledUpgradeSections`) by id. A dictionary's order is an accident of
//     the server, and an accident must not read as a change.
//
// Every comparison uses code-unit ordering, never `localeCompare`: the output
// has to be byte-identical on every machine that runs it, and locale collation
// is machine-dependent.
const RELEASES_DIR_NAME = "releases";
const MANIFEST_FILE_NAME = "manifest.json";
const COMMON_RULES_FILE_NAME = "common-rules.json";
const NORMALIZED_FILE_NAME = "normalized.json";
// Matches capture.js's staging prefix family: a dotfile this script owns. Any
// left in a release directory is interrupted-write debris, never release
// content, and is swept before the run.
const TEMP_PREFIX = ".normalize-";

// Bumped only for a change that moves a key, renames one, or changes a
// default's value. Adding a key that every older release also had is not a bump.
const SCHEMA_VERSION = 1;

// How deep a weapon-like node's `content` is normalized. The payload nests one
// level (an item's content holds rules and weapons, which have none of their
// own), so this is a guard against pathological input rather than a real limit.
const MAX_CONTENT_DEPTH = 2;

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------
// The value a key holds when the payload omits it (or sends `null`). Three
// shapes, and the rule for choosing between them:
//
//   null   - scalars: ids, names, labels, numbers. Absent means "the site did
//            not say", and a made-up number would be a lie the differ would
//            then report as a real balance change.
//   []     - lists. Absent means empty, which is true of every list the payload
//            omits.
//   false  - flags, except `valid`, whose default is `true`: an army book that
//            reports nothing about a unit's validity is not reporting that the
//            unit is invalid.
//
// This tree is embedded verbatim in every document under `defaults`, so it is
// the single place a consumer has to look. `bases` is not a scalar and not a
// list: it is always the two-key object `{ round, square }` with `null` for a
// size the payload did not state.
const DEFAULTS = Object.freeze({
  army: Object.freeze({
    factionName: null,
    raceGroup: null,
    official: false,
    balanceValid: false,
    systemId: null,
    specialRules: Object.freeze([]),
    units: Object.freeze([]),
    upgradePackages: Object.freeze([]),
  }),
  unit: Object.freeze({
    genericName: null,
    key: null,
    type: null,
    cost: null,
    size: null,
    originalSize: null,
    defense: null,
    quality: null,
    valid: true,
    hasCustomRule: false,
    hasBalanceInvalid: false,
    isNarrative: false,
    bases: Object.freeze({ round: null, square: null }),
    upgradePackageUids: Object.freeze([]),
    disabledSections: Object.freeze([]),
    disabledUpgradeSections: Object.freeze([]),
    weapons: Object.freeze([]),
    items: Object.freeze([]),
    rules: Object.freeze([]),
  }),
  // One shape for unit weapons, item content entries and upgrade gains: they
  // are the same `ArmyBookWeapon` / `ArmyBookItem` / `ArmyBookRule` node, and
  // the payload only varies which keys it happens to send.
  weaponLike: Object.freeze({
    nameOverride: null,
    label: null,
    count: null,
    originalCount: null,
    range: null,
    attacks: null,
    attacksMultiplier: null,
    weaponId: null,
    rating: null,
    newWeapon: false,
    bases: Object.freeze({ round: null, square: null }),
    specialRules: Object.freeze([]),
    content: Object.freeze([]),
  }),
  item: Object.freeze({
    count: null,
    bases: Object.freeze({ round: null, square: null }),
    content: Object.freeze([]),
  }),
  ruleRef: Object.freeze({
    label: null,
    type: null,
    rating: null,
    additional: false,
  }),
  armyRule: Object.freeze({
    name: null,
    originalName: null,
    aliasedRuleId: null,
    hasRating: false,
    coreType: null,
    targetType: null,
    description: null,
  }),
  upgradePackage: Object.freeze({
    hint: null,
    sections: Object.freeze([]),
  }),
  upgradeSection: Object.freeze({
    label: null,
    variant: null,
    select: null,
    model: false,
    isHeroUpgrade: false,
    isLowPrio: false,
    targets: Object.freeze([]),
    affects: Object.freeze([]),
    options: Object.freeze([]),
  }),
  upgradeOption: Object.freeze({
    label: null,
    cost: null,
    costs: Object.freeze([]),
    gains: Object.freeze([]),
  }),
  upgradeCost: Object.freeze({
    unitId: null,
    cost: null,
    exactCost: null,
  }),
});

// ---------------------------------------------------------------------------
// Key order
// ---------------------------------------------------------------------------
// The documented contract, mirrored from the literals below. Exported so the
// README, the test suite and any future consumer read one definition. The
// `test` suite hard-codes its own copy and compares, so this object cannot be
// edited into agreement with a breaking change.
const KEY_ORDER = Object.freeze({
  document: Object.freeze([
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
  ]),
  army: Object.freeze([
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
  ]),
  // The army's rule dictionary. Descriptions are carried because this is the
  // only place an army's custom rule text exists; dropping them would lose data
  // that is in no other file in the release.
  armyRule: Object.freeze([
    "id",
    "name",
    "originalName",
    "aliasedRuleId",
    "hasRating",
    "coreType",
    "targetType",
    "description",
  ]),
  unit: Object.freeze([
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
  ]),
  bases: Object.freeze(["round", "square"]),
  weaponLike: Object.freeze([
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
  ]),
  item: Object.freeze(["id", "name", "type", "count", "bases", "content"]),
  ruleRef: Object.freeze([
    "id",
    "name",
    "label",
    "type",
    "rating",
    "additional",
  ]),
  upgradePackage: Object.freeze(["uid", "hint", "sections"]),
  upgradeSection: Object.freeze([
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
  ]),
  upgradeOption: Object.freeze([
    "id",
    "uid",
    "label",
    "cost",
    "costs",
    "gains",
  ]),
  upgradeCost: Object.freeze(["unitId", "cost", "exactCost"]),
  // `select` and `affects` are `{ type, value }`; `value` is absent for `any`
  // and `all`, which is the case the null default exists for.
  selection: Object.freeze(["type", "value"]),
});

// ---------------------------------------------------------------------------
// Field readers
// ---------------------------------------------------------------------------

// Reads one field, substituting `fallback` when it is absent or `null`.
// Deliberately not `??` on a truthiness test: `0`, `""` and `false` are real
// values a payload can send, and turning a `0` rating into `null` would show up
// as a rules change in the diff.
function field(raw, key, fallback) {
  if (raw === null || typeof raw !== "object") return fallback;
  const value = raw[key];
  return value === undefined || value === null ? fallback : value;
}

// A list field. A non-array (the payload sends `null` for some) is empty, and
// the empty list is the documented default, so this never invents data.
function list(raw, key) {
  const value = field(raw, key, []);
  return Array.isArray(value) ? value : [];
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

// Code-unit comparison. Not `localeCompare`: two machines with different locale
// collation would emit different bytes for the same capture, and this document
// is compared and committed as bytes.
function compareStrings(a, b) {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

function sortedByKey(values, key) {
  return values.slice().sort((a, b) => compareStrings(a[key], b[key]));
}

function sortedStrings(values) {
  return values.slice().sort(compareStrings);
}

// A count of entries keyed by a string, with the keys in code-unit order so the
// object's own key order is deterministic too.
function tally(values, key) {
  const counts = {};
  for (const value of values) {
    const bucket = value[key];
    counts[bucket] = (counts[bucket] ?? 0) + 1;
  }
  return Object.fromEntries(
    Object.keys(counts).sort(compareStrings).map((k) => [k, counts[k]]),
  );
}

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

// ---------------------------------------------------------------------------
// Node normalizers
//
// Each returns an object literal written in its `KEY_ORDER` sequence. The
// duplication between the literal and the constant is deliberate: the literal
// is what a reader of this file follows, and the test suite is what keeps the
// two in step.
// ---------------------------------------------------------------------------

function normalizeBases(raw) {
  const source = isObject(raw) ? raw : {};
  return {
    round: field(source, "round", null),
    square: field(source, "square", null),
  };
}

// A reference to a special rule: the `{id, name, rating}` triple the payload
// attaches to weapons, units and upgrade gains. `rating` is left exactly as
// sent — the payload uses a number for a numeric rule and a string for a
// bespoke one (`"Spores [5]"`), and coercing either would be a fabrication.
function normalizeRuleRef(raw) {
  return {
    id: field(raw, "id", null),
    name: field(raw, "name", null),
    label: field(raw, "label", null),
    type: field(raw, "type", null),
    rating: field(raw, "rating", null),
    additional: field(raw, "additional", false),
  };
}

function normalizeRuleRefs(values) {
  return values.map(normalizeRuleRef);
}

// A weapon, an item's content entry, or an upgrade gain. The payload uses one
// node type for all three and only varies which keys it fills in, so one
// normalizer covers them and the `type` key is what tells a consumer which keys
// carry meaning.
function normalizeWeaponLike(raw, depth = 0) {
  return {
    type: field(raw, "type", null),
    id: field(raw, "id", null),
    name: field(raw, "name", null),
    nameOverride: field(raw, "nameOverride", null),
    label: field(raw, "label", null),
    count: field(raw, "count", null),
    originalCount: field(raw, "originalCount", null),
    range: field(raw, "range", null),
    attacks: field(raw, "attacks", null),
    attacksMultiplier: field(raw, "attacksMultiplier", null),
    weaponId: field(raw, "weaponId", null),
    rating: field(raw, "rating", null),
    newWeapon: field(raw, "newWeapon", false),
    bases: normalizeBases(field(raw, "bases", null)),
    specialRules: normalizeRuleRefs(list(raw, "specialRules")),
    content:
      depth >= MAX_CONTENT_DEPTH
        ? []
        : list(raw, "content").map((entry) =>
            normalizeWeaponLike(entry, depth + 1),
          ),
  };
}

function normalizeItem(raw) {
  return {
    id: field(raw, "id", null),
    name: field(raw, "name", null),
    type: field(raw, "type", null),
    count: field(raw, "count", null),
    bases: normalizeBases(field(raw, "bases", null)),
    content: list(raw, "content").map((entry) =>
      normalizeWeaponLike(entry, 1),
    ),
  };
}

function normalizeUnit(raw) {
  return {
    id: field(raw, "id", null),
    name: field(raw, "name", null),
    genericName: field(raw, "genericName", null),
    key: field(raw, "key", null),
    type: field(raw, "type", null),
    cost: field(raw, "cost", null),
    size: field(raw, "size", null),
    originalSize: field(raw, "originalSize", null),
    bases: normalizeBases(field(raw, "bases", null)),
    defense: field(raw, "defense", null),
    quality: field(raw, "quality", null),
    valid: field(raw, "valid", true),
    hasCustomRule: field(raw, "hasCustomRule", false),
    hasBalanceInvalid: field(raw, "hasBalanceInvalid", false),
    isNarrative: field(raw, "isNarrative", false),
    // `units[].upgrades` holds the uids of the army's upgrade PACKAGES a unit
    // may draw from, not section ids. The name says so, because reading it as
    // a section reference is the easy mistake and it silently yields nothing.
    upgradePackageUids: sortedStrings(list(raw, "upgrades")),
    disabledSections: sortedStrings(list(raw, "disabledSections")),
    disabledUpgradeSections: sortedStrings(list(raw, "disabledUpgradeSections")),
    weapons: list(raw, "weapons").map((weapon) => normalizeWeaponLike(weapon, 1)),
    items: list(raw, "items").map(normalizeItem),
    rules: normalizeRuleRefs(list(raw, "rules")),
  };
}

function normalizeArmyRule(raw) {
  return {
    id: field(raw, "id", null),
    name: field(raw, "name", null),
    originalName: field(raw, "originalName", null),
    aliasedRuleId: field(raw, "aliasedRuleId", null),
    hasRating: field(raw, "hasRating", false),
    coreType: field(raw, "coreType", null),
    targetType: field(raw, "targetType", null),
    description: field(raw, "description", null),
  };
}

function normalizeSelection(raw) {
  if (!isObject(raw)) return null;
  return {
    type: field(raw, "type", null),
    value: field(raw, "value", null),
  };
}

function normalizeUpgradeCost(raw) {
  return {
    unitId: field(raw, "unitId", null),
    cost: field(raw, "cost", null),
    exactCost: field(raw, "exactCost", null),
  };
}

function normalizeUpgradeOption(raw) {
  return {
    id: field(raw, "id", null),
    uid: field(raw, "uid", null),
    label: field(raw, "label", null),
    // `cost` is present on roughly half the options. The others still price
    // themselves through `costs[]`, which is always sent, so the absence is
    // real and the null is the honest value rather than 0.
    cost: field(raw, "cost", null),
    costs: list(raw, "costs").map(normalizeUpgradeCost),
    gains: list(raw, "gains").map((gain) => normalizeWeaponLike(gain, 1)),
  };
}

function normalizeUpgradeSection(raw) {
  return {
    id: field(raw, "id", null),
    uid: field(raw, "uid", null),
    label: field(raw, "label", null),
    variant: field(raw, "variant", null),
    select: normalizeSelection(field(raw, "select", null)),
    model: field(raw, "model", false),
    isHeroUpgrade: field(raw, "isHeroUpgrade", false),
    isLowPrio: field(raw, "isLowPrio", false),
    targets: list(raw, "targets"),
    affects: [normalizeSelection(field(raw, "affects", null))].filter(
      (entry) => entry !== null,
    ),
    options: list(raw, "options").map(normalizeUpgradeOption),
  };
}

function normalizeUpgradePackage(raw) {
  return {
    uid: field(raw, "uid", null),
    hint: field(raw, "hint", null),
    sections: sortedByKey(
      list(raw, "sections").map(normalizeUpgradeSection),
      "uid",
    ),
  };
}

// `system` comes from the directory the payload was captured into, not from
// the payload: 77 of 186 army books are served in more than one game system,
// and the same uid in two systems is two entries in this document.
function normalizeArmy(raw, system) {
  return {
    uid: field(raw, "uid", null),
    name: field(raw, "name", null),
    system,
    systemId: field(raw, "gameSystemId", null),
    versionString: field(raw, "versionString", null),
    factionName: field(raw, "factionName", null),
    raceGroup: field(raw, "raceGroup", null),
    official: field(raw, "official", false),
    balanceValid: field(raw, "balanceValid", false),
    specialRules: sortedByKey(
      list(raw, "specialRules").map(normalizeArmyRule),
      "id",
    ),
    // Roster order, not sorted: the order the payload lists units in is the
    // order the unit-count limit is read against.
    units: list(raw, "units").map(normalizeUnit),
    upgradePackages: sortedByKey(
      list(raw, "upgradePackages").map(normalizeUpgradePackage),
      "uid",
    ),
  };
}

// ---------------------------------------------------------------------------
// Document
// ---------------------------------------------------------------------------

function buildDocument({ manifest, releaseDirName, armies }) {
  // Summaries are recomputed from the normalized armies rather than copied out
  // of the manifest, so the document can never disagree with its own contents.
  // `versionHistogram` keeps the capture's genuine plurality split: a capture
  // is really 178 armies on one version and 8 stragglers on the previous one,
  // and flattening that to a single number would hide it.
  return {
    schemaVersion: SCHEMA_VERSION,
    version: field(manifest, "version", null),
    releaseDir: releaseDirName,
    capturedAt: field(manifest, "capturedAt", null),
    defaults: structuredClone(DEFAULTS),
    gameSystems: sortedStrings([...new Set(armies.map((army) => army.system))]),
    armyCount: armies.length,
    armiesBySystem: tally(armies, "system"),
    versionHistogram: tally(armies, "versionString"),
    armies,
  };
}

function sortArmies(armies) {
  return armies.sort(
    (a, b) =>
      compareStrings(a.system, b.system) ||
      compareStrings(a.name, b.name) ||
      compareStrings(a.uid, b.uid),
  );
}

// ---------------------------------------------------------------------------
// Reading a release directory
// ---------------------------------------------------------------------------

function releasesRoot() {
  return path.join(__dirname, "..", "..", "..", RELEASES_DIR_NAME);
}

function isTempName(name) {
  return name.startsWith(TEMP_PREFIX);
}

function listReleaseDirNames(root) {
  if (!fs.existsSync(root)) return [];
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !isTempName(entry.name))
    .map((entry) => entry.name);
}

// The release a bare `node src/normalize.js` acts on: the most recently
// captured one, by the manifest's own `capturedAt`. Directory names sort
// correctly for the common case (`3.5.3` before `3.5.3__2` before `3.5.3__3`)
// but cannot order two different versions, so the timestamp decides and the
// name only breaks a tie.
function latestReleaseDirName(root) {
  const names = listReleaseDirNames(root);
  if (names.length === 0) return null;
  let best = null;
  for (const name of names) {
    const manifestPath = path.join(root, name, MANIFEST_FILE_NAME);
    if (!fs.existsSync(manifestPath)) continue;
    const capturedAt = fs.readJsonSync(manifestPath).capturedAt ?? "";
    if (
      best === null ||
      compareStrings(capturedAt, best.capturedAt) > 0 ||
      (capturedAt === best.capturedAt && compareStrings(name, best.name) > 0)
    ) {
      best = { name, capturedAt };
    }
  }
  return best === null ? null : best.name;
}

// Turns a CLI argument into a release directory path. Accepts either a
// directory name under `releases/` or a path to a release directory anywhere.
function resolveReleaseDir(argument, root) {
  if (!argument) {
    const name = latestReleaseDirName(root);
    if (name === null) {
      throw new Error(
        `no release directory with a ${MANIFEST_FILE_NAME} was found under ${root}`,
      );
    }
    return { dir: path.join(root, name), name };
  }
  if (path.isAbsolute(argument) || argument.includes(path.sep)) {
    return {
      dir: path.resolve(argument),
      name: path.basename(path.resolve(argument)),
    };
  }
  return { dir: path.join(root, argument), name: argument };
}

// Every file in a release directory that is not release content: anything that
// is neither a per-system subdirectory, nor a `common-rules.json` (captured
// once per system, and not an army book), nor the manifest, nor this script's
// own output. The manifest's payload list is compared against it so a
// hand-added army cannot slip past the document.
function listForeignFiles(releaseDir) {
  const foreign = [];
  for (const entry of fs.readdirSync(releaseDir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      const systemDir = path.join(releaseDir, entry.name);
      for (const file of fs.readdirSync(systemDir, { withFileTypes: true })) {
        if (file.isFile() && file.name !== COMMON_RULES_FILE_NAME) {
          foreign.push(path.posix.join(entry.name, file.name));
        }
      }
      continue;
    }
    if (
      entry.isFile() &&
      entry.name !== MANIFEST_FILE_NAME &&
      entry.name !== NORMALIZED_FILE_NAME
    ) {
      foreign.push(entry.name);
    }
  }
  return foreign.sort(compareStrings);
}

/**
 * Reads a release directory and returns its normalized document. Pure with
 * respect to the filesystem: nothing is written.
 */
function buildNormalizedDocument(releaseDir) {
  const manifestPath = path.join(releaseDir, MANIFEST_FILE_NAME);
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`${releaseDir} is not a release directory: no ${MANIFEST_FILE_NAME}`);
  }
  const manifest = fs.readJsonSync(manifestPath);
  const payloads = list(manifest, "payloads");
  if (payloads.length === 0) {
    throw new Error(
      `${MANIFEST_FILE_NAME} in ${releaseDir} lists no payloads, so there is nothing to normalize`,
    );
  }

  // The manifest is the index of the release. A file in the directory that the
  // manifest does not list means the directory was edited by hand, which the
  // append-only contract forbids, so this stops rather than quietly dropping
  // the unlisted army from the document.
  const listed = new Set(payloads.map((entry) => entry.file));
  const unlisted = listForeignFiles(releaseDir).filter(
    (file) => !listed.has(file),
  );
  if (unlisted.length > 0) {
    throw new Error(
      `${releaseDir} contains ${unlisted.length} file(s) that ${MANIFEST_FILE_NAME} does not list, which means the release was edited after capture:\n${unlisted
        .map((file) => `  ${file}`)
        .join("\n")}`,
    );
  }

  const armies = [];
  for (const entry of payloads) {
    const file = entry.file;
    const fullPath = path.join(releaseDir, ...file.split("/"));
    if (!fs.existsSync(fullPath)) {
      throw new Error(
        `${MANIFEST_FILE_NAME} in ${releaseDir} lists ${file}, which is not in the directory`,
      );
    }
    const bytes = fs.readFileSync(fullPath);
    // The capture checksummed every payload as it wrote it. Re-checking it here
    // means the document can only ever describe the bytes that were captured,
    // and a payload edited since is caught before it is normalized.
    const digest = sha256(bytes);
    if (entry.sha256 && digest !== entry.sha256) {
      throw new Error(
        `${file} in ${releaseDir} does not match the SHA-256 in ${MANIFEST_FILE_NAME} (${entry.sha256} expected, ${digest} on disk); the raw payload was modified after capture`,
      );
    }
    // The same predicate the capture used, so a payload that would have been
    // rejected at fetch time is rejected here too rather than normalized from
    // whatever survived on disk.
    const payload = validateArmyPayload(JSON.parse(bytes.toString("utf8")), {
      uid: entry.uid,
      name: entry.name,
      system: entry.system,
    });
    armies.push(normalizeArmy(payload, entry.system));
  }

  return buildDocument({
    manifest,
    releaseDirName: path.basename(releaseDir),
    armies: sortArmies(armies),
  });
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

// Sweeps this script's own interrupted-write debris. These are dotfiles it owns,
// not release content: a leftover one means a previous run was killed between
// the write and the rename. Removing them is not a modification of the release,
// and leaving them would make the next `listForeignFiles` run fail.
function sweepTempFiles(releaseDir, log) {
  for (const entry of fs.readdirSync(releaseDir, { withFileTypes: true })) {
    if (entry.isFile() && isTempName(entry.name)) {
      fs.removeSync(path.join(releaseDir, entry.name));
      log(`  removed leftover temp file ${entry.name}`);
    }
  }
}

function serialize(document) {
  return `${JSON.stringify(document, null, 2)}\n`;
}

/**
 * Normalizes one release directory and writes `normalized.json` into it.
 *
 * The only file this function creates or replaces is `normalized.json`. Every
 * raw payload is checksummed before the write and again after it, and a
 * mismatch fails the run — so "the normalizer never touched the raw data" is
 * checked rather than promised.
 */
function normalizeRelease(options = {}) {
  const root = options.releasesRoot ?? releasesRoot();
  const log = options.log ?? console.log;
  const { dir, name } = resolveReleaseDir(options.releaseDir, root);
  if (!fs.existsSync(dir)) {
    throw new Error(`release directory ${dir} does not exist`);
  }

  sweepTempFiles(dir, log);
  log(`Normalizing ${name}`);
  const document = buildNormalizedDocument(dir);
  const out = path.join(dir, NORMALIZED_FILE_NAME);
  const json = serialize(document);

  // Same discipline as capture.js: stage inside the destination directory,
  // then one rename. A crash leaves the previous `normalized.json` intact
  // rather than a truncated one.
  const temp = path.join(dir, `${TEMP_PREFIX}${process.pid}-${Date.now()}`);
  try {
    fs.writeFileSync(temp, json);
    fs.renameSync(temp, out);
  } finally {
    if (fs.existsSync(temp)) fs.removeSync(temp);
  }

  // Re-read the release's own index: every payload must still be exactly what
  // the manifest says it was, and must not have gained a file.
  buildNormalizedDocument(dir);

  const result = {
    releaseDir: dir,
    releaseDirName: name,
    outputFile: out,
    document,
    bytes: Buffer.byteLength(json),
    sha256: sha256(Buffer.from(json)),
  };
  log(
    `  ${document.armyCount} armies across ${document.gameSystems.length} game system(s) → ${NORMALIZED_FILE_NAME} (${result.bytes} bytes, sha256 ${result.sha256})`,
  );
  return result;
}

// Reports the process exit code rather than calling `process.exit`, so the
// abort path is testable. `normalizeRelease` throws a message that names the
// release and the reason; the banner only has to mark it as a failure.
function main(options = {}) {
  try {
    normalizeRelease(options);
    return 0;
  } catch (error) {
    console.error(`\nNormalize failed. ${error.message}`);
    return 1;
  }
}

module.exports = {
  DEFAULTS,
  KEY_ORDER,
  MANIFEST_FILE_NAME,
  NORMALIZED_FILE_NAME,
  SCHEMA_VERSION,
  buildNormalizedDocument,
  buildDocument,
  compareStrings,
  latestReleaseDirName,
  main,
  normalizeArmy,
  normalizeArmyRule,
  normalizeItem,
  normalizeRelease,
  normalizeRuleRef,
  normalizeUnit,
  normalizeUpgradeCost,
  normalizeUpgradeOption,
  normalizeUpgradePackage,
  normalizeUpgradeSection,
  normalizeWeaponLike,
  releasesRoot,
  resolveReleaseDir,
  serialize,
};

if (require.main === module) {
  process.exitCode = main({ releaseDir: process.argv[2] });
}
