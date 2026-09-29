const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");

const {
  REQUEST_DELAY_MS,
  captureRelease,
  checksumDir,
  checksumReleaseDirs,
  listReleaseDirNames,
  resolveReleaseDirName,
  resolveReleaseVersion,
  validateArmyPayload,
  withRetry,
} = require("../src/capture");

const SYSTEMS = [
  { id: 2, slug: "grimdark-future" },
  { id: 3, slug: "grimdark-future-firefight" },
];

function tempRoot(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "opr-capture-test-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function armyPayload(uid, name, versionString = "3.5.3", units = 3) {
  return {
    uid,
    name,
    versionString,
    enabledGameSystems: [2, 3],
    units: Array.from({ length: units }, (_, i) => ({
      id: `${uid}-u${i}`,
      name: `${name} Unit ${i}`,
      cost: 100,
      weapons: [{ id: `w${i}`, name: "Rifle", count: 4 }],
    })),
    upgradePackages: [],
    specialRules: [],
  };
}

// A fake army-forge: one listing per system, one detail payload per army.
function fakeFetchers(options = {}) {
  const calls = { detail: [], list: [], commonRules: [] };
  const listings = options.listings ?? {
    "grimdark-future": [
      { uid: "aaa111", name: "Alien Hives", versionString: "3.5.3", modifiedAt: "2026-05-05T08:01:44.383Z" },
      { uid: "bbb222", name: "Battle/Brothers", versionString: "3.5.3", modifiedAt: "2026-05-05T08:01:46.280Z" },
    ],
    "grimdark-future-firefight": [
      { uid: "aaa111", name: "Alien Hives", versionString: "3.5.3", modifiedAt: "2026-05-05T08:01:44.383Z" },
      { uid: "ccc333", name: "Stale Book", versionString: "3.5.2", modifiedAt: "2026-04-01T00:00:00.000Z" },
    ],
  };
  const details = options.details ?? {};
  const failures = options.failures ?? {};
  const nameByUid = {};
  const versionByUid = {};
  for (const list of Object.values(listings)) {
    for (const army of list) {
      nameByUid[army.uid] = army.name;
      versionByUid[army.uid] = army.versionString;
    }
  }

  return {
    calls,
    fetchers: {
      async fetchArmyList(slug) {
        calls.list.push(slug);
        return listings[slug] ?? [];
      },
      async fetchArmyDetail(uid) {
        calls.detail.push(uid);
        const failure = failures[uid];
        if (failure) {
          const remaining = failure.attempts ?? 1;
          if (remaining > 0) {
            failure.attempts = remaining - 1;
            const error = new Error(failure.message ?? "boom");
            error.response = { status: failure.status ?? 500 };
            throw error;
          }
        }
        const payload =
          details[uid] ?? armyPayload(uid, nameByUid[uid] ?? uid, versionByUid[uid]);
        return typeof payload === "function" ? payload() : payload;
      },
      async fetchCommonRules(id) {
        calls.commonRules.push(id);
        return { rules: [{ id: "r1", name: "Rending" }], traits: [] };
      },
    },
  };
}

function runCapture(root, overrides = {}) {
  const { fetchers, calls } = fakeFetchers(overrides);
  const slept = [];
  return {
    calls,
    slept,
    promise: captureRelease({
      releasesRoot: root,
      gameSystems: SYSTEMS,
      sleep: async (ms) => {
        slept.push(ms);
      },
      now: () => "2026-09-29T00:00:00.000Z",
      log: () => {},
      ...fetchers,
      ...overrides.options,
    }),
  };
}

function fileDigests(dir) {
  const digests = {};
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else
        digests[path.relative(dir, full)] = crypto
          .createHash("sha256")
          .update(fs.readFileSync(full))
          .digest("hex");
    }
  };
  walk(dir);
  return digests;
}

test("resolveReleaseDirName takes a __2, __3 suffix on collision", () => {
  assert.equal(resolveReleaseDirName("3.5.3", []), "3.5.3");
  assert.equal(resolveReleaseDirName("3.5.3", ["3.5.2"]), "3.5.3");
  assert.equal(resolveReleaseDirName("3.5.3", ["3.5.3"]), "3.5.3__2");
  assert.equal(resolveReleaseDirName("3.5.3", ["3.5.3", "3.5.3__2"]), "3.5.3__3");
  assert.equal(
    resolveReleaseDirName("3.5.3", ["3.5.3", "3.5.3__2", "3.5.3__4"]),
    "3.5.3__3",
  );
});

test("a version's suffix is independent of other versions", () => {
  // Another version's directories, including its own suffixes, never consume a
  // slot in this version's sequence.
  assert.equal(
    resolveReleaseDirName("3.5.3", ["3.5.2", "3.5.2__2", "3.5.2__3"]),
    "3.5.3",
  );
  assert.equal(
    resolveReleaseDirName("3.5.3", ["3.5.2", "3.5.2__2", "3.5.3", "3.5.3__2"]),
    "3.5.3__3",
  );
});

test("resolveReleaseVersion takes the plurality version and breaks ties high", () => {
  assert.equal(resolveReleaseVersion({ "3.5.3": 178, "3.5.2": 8 }), "3.5.3");
  assert.equal(resolveReleaseVersion({ "3.5.2": 1, "3.5.3": 1 }), "3.5.3");
  assert.equal(resolveReleaseVersion({ "3.6.0": 2, "3.10.0": 2 }), "3.10.0");
  assert.equal(resolveReleaseVersion({ "3.5.3": 1 }), "3.5.3");
  assert.throws(() => resolveReleaseVersion({}), /no versionString/);
});

test("validateArmyPayload rejects empty, truncated and mismatched payloads", () => {
  const expected = { name: "Alien Hives", uid: "aaa111", system: "grimdark-future" };
  const good = armyPayload("aaa111", "Alien Hives");
  assert.equal(validateArmyPayload(good, expected), good);

  assert.throws(() => validateArmyPayload({}, expected), /empty object/);
  assert.throws(() => validateArmyPayload(null, expected), /expected an object/);
  assert.throws(() => validateArmyPayload([], expected), /expected an object/);
  assert.throws(() => validateArmyPayload({ name: "x" }, expected), /no uid/);
  assert.throws(
    () => validateArmyPayload(armyPayload("zzz999", "Alien Hives"), expected),
    /does not match the requested army/,
  );
  assert.throws(
    () => validateArmyPayload({ uid: "aaa111", name: "x" }, expected),
    /no units array/,
  );
  assert.throws(
    () => validateArmyPayload(armyPayload("aaa111", "x", "3.5.3", 0), expected),
    /units array is empty/,
  );
  const noVersion = armyPayload("aaa111", "x");
  delete noVersion.versionString;
  assert.throws(() => validateArmyPayload(noVersion, expected), /no versionString/);
});

test("checksumDir tracks content and layout, not mtime", (t) => {
  const dir = tempRoot(t);
  const a = path.join(dir, "a");
  fs.mkdirSync(a);
  fs.writeFileSync(path.join(a, "one.json"), '{"a":1}');
  fs.writeFileSync(path.join(a, "two.json"), '{"b":2}');
  const first = checksumDir(a);

  fs.utimesSync(path.join(a, "one.json"), new Date(0), new Date(0));
  assert.equal(checksumDir(a), first, "mtime must not affect the checksum");

  fs.writeFileSync(path.join(a, "one.json"), '{"a":2}');
  assert.notEqual(checksumDir(a), first, "changed content must change the checksum");

  fs.writeFileSync(path.join(a, "one.json"), '{"a":1}');
  fs.renameSync(path.join(a, "two.json"), path.join(a, "three.json"));
  assert.notEqual(checksumDir(a), first, "a renamed file must change the checksum");
});

test("withRetry retries a transient failure and gives up after 3 attempts", async () => {
  const slept = [];
  const log = [];
  let attempts = 0;
  await assert.rejects(
    withRetry(
      "army X",
      async () => {
        attempts += 1;
        const error = new Error("gateway");
        error.response = { status: 502 };
        throw error;
      },
      { sleep: async (ms) => slept.push(ms), log: (m) => log.push(m) },
    ),
    /failed after 3 attempt\(s\) \(last status 502\)/,
  );
  assert.equal(attempts, 3);
  assert.deepEqual(slept, [1000, 2000]);
});

test("withRetry treats 404 as terminal without retrying", async () => {
  let attempts = 0;
  await assert.rejects(
    withRetry(
      "army Gone",
      async () => {
        attempts += 1;
        const error = new Error("Not Found");
        error.response = { status: 404 };
        throw error;
      },
      { sleep: async () => {} },
    ),
    /terminal status 404/,
  );
  assert.equal(attempts, 1);
});

test("withRetry resolves as soon as a request succeeds", async () => {
  let attempts = 0;
  const result = await withRetry(
    "army Flaky",
    async () => {
      attempts += 1;
      if (attempts < 2) {
        const error = new Error("reset");
        error.response = { status: 500 };
        throw error;
      }
      return "payload";
    },
    { sleep: async () => {} },
  );
  assert.equal(result, "payload");
  assert.equal(attempts, 2);
});

test("a capture writes a new release directory with payloads and a manifest", async (t) => {
  const root = tempRoot(t);
  const { promise } = runCapture(root);
  const { releaseDir, releaseDirName, manifest } = await promise;

  assert.equal(releaseDirName, "3.5.3");
  assert.equal(releaseDir, path.join(root, "3.5.3"));
  assert.equal(listReleaseDirNames(root).join(","), "3.5.3");

  // One payload per listed army, kept per system because the same army book
  // is served with different units in different game systems.
  assert.deepEqual(
    fs.readdirSync(path.join(releaseDir, "grimdark-future")).sort(),
    [
      "Alien Hives (aaa111).json",
      "Battle-Brothers (bbb222).json",
      "common-rules.json",
    ],
  );
  assert.ok(
    fs.existsSync(
      path.join(releaseDir, "grimdark-future-firefight", "common-rules.json"),
    ),
  );

  assert.equal(manifest.version, "3.5.3");
  assert.equal(manifest.armyCount, 4);
  assert.equal(manifest.capturedAt, "2026-09-29T00:00:00.000Z");
  assert.match(manifest.versionStringSource, /versionString field of the captured army-book JSON/);
  assert.deepEqual(manifest.armiesBySystem, {
    "grimdark-future": 2,
    "grimdark-future-firefight": 2,
  });
  // The capture is mixed-version; the plurality version names the release and
  // the full distribution is kept.
  assert.deepEqual(manifest.versionHistogram, { "3.5.3": 3, "3.5.2": 1 });

  const onDisk = fs.readFileSync(path.join(releaseDir, "manifest.json"), "utf8");
  assert.deepEqual(JSON.parse(onDisk), manifest);
  assert.equal(manifest.payloads.length, 4);
  assert.ok(manifest.payloads.every((p) => /^[0-9a-f]{64}$/.test(p.sha256)));
});

test("manifest records a list/payload version mismatch instead of hiding it", async (t) => {
  const root = tempRoot(t);
  const { promise } = runCapture(root, {
    details: {
      ccc333: armyPayload("ccc333", "Stale Book", "3.5.1"),
    },
  });
  const { manifest } = await promise;
  assert.equal(manifest.version, "3.5.3");
  assert.deepEqual(manifest.versionHistogram, { "3.5.3": 3, "3.5.1": 1 });
  assert.deepEqual(manifest.versionMismatches, [
    {
      system: "grimdark-future-firefight",
      uid: "ccc333",
      name: "Stale Book",
      listedVersionString: "3.5.2",
      payloadVersionString: "3.5.1",
    },
  ]);
});

test("capturing twice leaves the first release byte-identical and adds __2", async (t) => {
  const root = tempRoot(t);
  const first = await runCapture(root).promise;
  const firstBytes = fileDigests(first.releaseDir);
  const firstChecksum = checksumDir(first.releaseDir);

  const second = await runCapture(root).promise;
  assert.equal(first.releaseDirName, "3.5.3");
  assert.equal(second.releaseDirName, "3.5.3__2");
  assert.deepEqual(listReleaseDirNames(root).sort(), ["3.5.3", "3.5.3__2"]);

  assert.deepEqual(fileDigests(first.releaseDir), firstBytes);
  assert.equal(checksumDir(first.releaseDir), firstChecksum);

  const third = await runCapture(root).promise;
  assert.equal(third.releaseDirName, "3.5.3__3");
  assert.deepEqual(listReleaseDirNames(root).sort(), ["3.5.3", "3.5.3__2", "3.5.3__3"]);
  assert.equal(checksumDir(first.releaseDir), firstChecksum);
});

test("an unrelated pre-existing release directory is untouched by a capture", async (t) => {
  const root = tempRoot(t);
  const old = path.join(root, "3.5.2");
  fs.mkdirSync(old);
  fs.writeFileSync(path.join(old, "manifest.json"), '{"version":"3.5.2"}');
  fs.mkdirSync(path.join(old, "grimdark-future"));
  fs.writeFileSync(
    path.join(old, "grimdark-future", "Old Army (old1).json"),
    "{}",
  );
  const before = fileDigests(old);

  const { releaseDirName } = await runCapture(root).promise;
  assert.equal(releaseDirName, "3.5.3");
  assert.deepEqual(fileDigests(old), before);
  assert.deepEqual(Object.keys(checksumReleaseDirs(root)).sort(), ["3.5.2", "3.5.3"]);
});

test("a truncated payload aborts the run and writes no release at all", async (t) => {
  const root = tempRoot(t);
  const old = path.join(root, "3.5.2");
  fs.mkdirSync(old);
  fs.writeFileSync(path.join(old, "manifest.json"), '{"version":"3.5.2"}');
  const before = fileDigests(old);

  await assert.rejects(
    runCapture(root, { details: { bbb222: {} } }).promise,
    /unusable: empty object/,
  );

  assert.deepEqual(listReleaseDirNames(root), ["3.5.2"]);
  assert.deepEqual(fileDigests(old), before);
  // No staging leftovers.
  assert.deepEqual(fs.readdirSync(root).sort(), ["3.5.2"]);
});

test("a payload with no units aborts the run", async (t) => {
  const root = tempRoot(t);
  await assert.rejects(
    runCapture(root, { details: { bbb222: armyPayload("bbb222", "Battle/Brothers", "3.5.3", 0) } }).promise,
    /units array is empty/,
  );
  assert.deepEqual(fs.readdirSync(root), []);
});

test("an army that 404s aborts the run without retrying", async (t) => {
  const root = tempRoot(t);
  const { promise, calls } = runCapture(root, {
    failures: { bbb222: { status: 404, attempts: 1 } },
  });
  await assert.rejects(promise, /terminal status 404/);
  assert.deepEqual(fs.readdirSync(root), []);
  assert.equal(calls.detail.filter((c) => c.startsWith("bbb222")).length, 1);
});

test("a transient failure that never clears aborts the run and writes nothing", async (t) => {
  const root = tempRoot(t);
  const { promise, calls } = runCapture(root, {
    failures: { bbb222: { status: 503, attempts: 99 } },
  });
  await assert.rejects(promise, /failed after 3 attempt\(s\) \(last status 503\)/);
  assert.deepEqual(fs.readdirSync(root), []);
  assert.equal(calls.detail.filter((c) => c.startsWith("bbb222")).length, 3);
});

test("a capture paces itself at one request per second and never caps army count", async (t) => {
  const root = tempRoot(t);
  const many = Array.from({ length: 25 }, (_, i) => ({
    uid: `u${String(i).padStart(3, "0")}`,
    name: `Army ${i}`,
    versionString: "3.5.3",
    modifiedAt: null,
  }));
  const { promise, slept } = runCapture(root, {
    listings: { "grimdark-future": many, "grimdark-future-firefight": [] },
  });
  const { manifest } = await promise;

  assert.equal(manifest.armyCount, 25, "no hard cap on armies per run");
  // One pacing delay per captured army.
  assert.equal(slept.length, 25);
  assert.ok(
    slept.every((ms) => ms === REQUEST_DELAY_MS),
    "every delay must be the 1s capture pacing",
  );
});

test("a capture of zero armies refuses to write a release", async (t) => {
  const root = tempRoot(t);
  await assert.rejects(
    runCapture(root, {
      listings: { "grimdark-future": [], "grimdark-future-firefight": [] },
    }).promise,
    /no army payloads/,
  );
  assert.deepEqual(fs.readdirSync(root), []);
});

test("staging directories are not mistaken for releases", (t) => {
  const root = tempRoot(t);
  fs.mkdirSync(path.join(root, ".capture-123-456"));
  fs.mkdirSync(path.join(root, "3.5.3"));
  assert.deepEqual(listReleaseDirNames(root), ["3.5.3"]);
  assert.equal(resolveReleaseDirName("3.5.3", listReleaseDirNames(root)), "3.5.3__2");
});
