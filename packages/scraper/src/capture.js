const crypto = require("crypto");
const fs = require("fs-extra");
const path = require("path");

const {
  BASE_URL,
  GAME_SYSTEMS,
  delay,
  fetchArmyDetail,
  fetchArmyList,
  fetchCommonRules,
  payloadFileName,
} = require("./lib/army-forge");

// APPEND-ONLY RELEASE CAPTURE
// ----------------------------
// `node src/capture.js` runs once, deliberately, and writes whatever army-forge
// is serving right now into a brand new release directory:
//
//   releases/<version>__<n>/
//     manifest.json
//     <system>/<army name> (<uid>).json
//     <system>/common-rules.json
//
// <version> is the `versionString` carried by the captured JSON payloads, and
// <n> starts at 1 and only appears when that version has been captured before.
// A second capture of the same live version lands in `<version>__2` and the
// first directory is not opened for writing.
//
// Two guarantees this file is responsible for:
//
//   1. Nothing pre-existing is ever modified. Every byte of the capture is
//      staged in a temp directory and moved into place with a single rename
//      once the whole run has succeeded. Existing release directories are
//      checksummed before and after the run and the run fails loudly if a
//      single byte moved.
//   2. A partial run writes nothing at all. If any army payload comes back
//      empty, truncated, or fails to fetch after retries, the staging directory
//      is removed and no release directory is created. A half-written release
//      is worse than a stale one, because a stale one is still a valid old
//      release.
const RELEASES_DIR_NAME = "releases";
const MANIFEST_FILE_NAME = "manifest.json";
const COMMON_RULES_FILE_NAME = "common-rules.json";
const STAGING_PREFIX = ".capture-";

// Appended to the reason every aborted capture throws, so the guarantee travels
// with the error rather than living only in the CLI banner. A caller that
// catches this knows the run stopped and the releases directory is unchanged.
const NOTHING_WRITTEN =
  "No release directory was created, no release directory was modified, and the staging directory was removed.";

// Pacing and retry defaults for this script. The legacy scrape in `index.js`
// runs at 500ms with no retry; this capture is deliberately slower (one
// request/second) and retries transient failures, because a single dropped
// connection out of ~190 requests would otherwise abort the whole release.
const REQUEST_DELAY_MS = 1000;
const MAX_ATTEMPTS = 3;
const BACKOFF_MS = [1000, 2000];
// 404 means the army book is gone, not that we should hammer the endpoint.
const TERMINAL_STATUS = new Set([404]);

function releasesRoot() {
  return path.join(__dirname, "..", "..", "..", RELEASES_DIR_NAME);
}

function isStagingDir(name) {
  return name.startsWith(STAGING_PREFIX);
}

// The release directory name for a capture of `version`. The first capture of
// a version is just `<version>`; every later capture of the same live version
// takes the next free `__<n>` suffix. Only the exact `version` and its own
// `version__<n>` siblings are considered, so unrelated directories in
// `releases/` can never consume a suffix.
function resolveReleaseDirName(version, existingNames) {
  const taken = new Set(existingNames);
  if (!taken.has(version)) return version;
  let n = 2;
  while (taken.has(`${version}__${n}`)) n += 1;
  return `${version}__${n}`;
}

function listReleaseDirNames(root) {
  if (!fs.existsSync(root)) return [];
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !isStagingDir(entry.name))
    .map((entry) => entry.name);
}

// Content hash of a whole directory tree: every file's path and bytes, hashed
// in sorted path order so the result depends on content and layout but not on
// directory iteration order or timestamps.
function checksumDir(dir) {
  const hash = crypto.createHash("sha256");
  const files = [];

  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) files.push(full);
    }
  };
  walk(dir);

  for (const file of files.sort()) {
    hash.update(path.relative(dir, file));
    hash.update("\0");
    hash.update(crypto.createHash("sha256").update(fs.readFileSync(file)).digest());
    hash.update("\0");
  }
  return hash.digest("hex");
}

function checksumReleaseDirs(root) {
  const snapshot = {};
  for (const name of listReleaseDirNames(root).sort()) {
    snapshot[name] = checksumDir(path.join(root, name));
  }
  return snapshot;
}

// Compares the post-run snapshot against the pre-run one. Only the directories
// that existed before the run are compared: the release this run just created
// is new by definition, and a pre-existing directory that is gone or has
// different bytes is a violation.
function assertReleaseDirsUnchanged(before, after) {
  const drifted = Object.keys(before).filter(
    (name) => after[name] !== before[name],
  );
  if (drifted.length === 0) return;
  const detail = drifted
    .map((name) =>
      after[name] === undefined
        ? `  ${name}: disappeared during the run`
        : `  ${name}: ${before[name]} -> ${after[name]}`,
    )
    .join("\n");
  throw new Error(
    `pre-existing release directories changed during the run, which must never happen:\n${detail}`,
  );
}

// A body that is not JSON reaches us as a raw string, never as a thrown
// SyntaxError: axios' default `transformResponse` swallows the parse error and
// falls back to the unparsed text unless `strictJSONParsing` is set. So a
// truncated response, an empty body and a 200 carrying an HTML error page all
// arrive as strings. Report that as the parse failure it is, because
// "expected an object" is indistinguishable from the site changing its payload
// shape. Returns null for anything that is not a string.
function unparseableBodyReason(payload) {
  if (typeof payload !== "string") return null;
  const body = payload.trim();
  return body.length === 0
    ? "payload failed JSON parse: empty response body"
    : `payload failed JSON parse: body is not JSON (${body.length} bytes starting ${JSON.stringify(body.slice(0, 40))})`;
}

// A payload is only accepted if it looks like the army book we asked for. This
// is the guard that stops a truncated or empty response from being captured:
// axios resolves on any 2xx, including a 200 with a truncated body.
function validateArmyPayload(payload, expected) {
  const fail = (reason) =>
    new Error(`payload for ${expected.name} (${expected.uid}) in ${expected.system} is unusable: ${reason}`);

  const parseFailure = unparseableBodyReason(payload);
  if (parseFailure) throw fail(parseFailure);

  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    throw fail(`expected an object, got ${payload === null ? "null" : Array.isArray(payload) ? "array" : typeof payload}`);
  }
  if (Object.keys(payload).length === 0) {
    throw fail("empty object");
  }
  if (!payload.uid) {
    throw fail("no uid");
  }
  if (payload.uid !== expected.uid) {
    throw fail(`uid ${payload.uid} does not match the requested army ${expected.uid}`);
  }
  if (!payload.name) {
    throw fail("no name");
  }
  if (!Array.isArray(payload.units)) {
    throw fail("no units array");
  }
  if (payload.units.length === 0) {
    throw fail("units array is empty");
  }
  if (typeof payload.versionString !== "string" || payload.versionString.length === 0) {
    throw fail("no versionString");
  }
  return payload;
}

function validateCommonRules(payload, system) {
  const fail = (reason) =>
    new Error(`common rules payload for ${system} is unusable: ${reason}`);
  const parseFailure = unparseableBodyReason(payload);
  if (parseFailure) throw fail(parseFailure);
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    throw fail(`expected an object, got ${typeof payload}`);
  }
  if (!Array.isArray(payload.rules) || !Array.isArray(payload.traits)) {
    throw fail("no rules/traits arrays");
  }
  return payload;
}

function statusOf(error) {
  if (!error) return null;
  if (typeof error.status === "number") return error.status;
  if (error.response && typeof error.response.status === "number") {
    return error.response.status;
  }
  return null;
}

// Retries a transient failure with exponential backoff. A terminal status (404)
// is rethrown on the first attempt, because the army book does not exist and
// re-requesting it will not change that.
async function withRetry(label, fn, options = {}) {
  const maxAttempts = options.maxAttempts ?? MAX_ATTEMPTS;
  const backoffMs = options.backoffMs ?? BACKOFF_MS;
  const sleep = options.sleep ?? delay;
  const log = options.log ?? console.log;

  for (let attempt = 1; ; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      const status = statusOf(error);
      const terminal = status !== null && TERMINAL_STATUS.has(status);
      if (terminal) {
        throw new Error(
          `${label} failed with terminal status ${status}: ${error.message}`,
        );
      }
      if (attempt >= maxAttempts) {
        throw new Error(
          `${label} failed after ${attempt} attempt(s)${status ? ` (last status ${status})` : ""}: ${error.message}`,
        );
      }
      const wait = backoffMs[Math.min(attempt - 1, backoffMs.length - 1)];
      log(
        `  ! ${label} failed (${status ?? error.message}), retrying in ${wait}ms [attempt ${attempt + 1}/${maxAttempts}]`,
      );
      await sleep(wait);
    }
  }
}

// The release version is the `versionString` reported by the captured payloads
// themselves. A listing can carry more than one version at a time (armies that
// have not been re-published yet), so the release takes the version the
// plurality of payloads report, and the full distribution is kept in the
// manifest. Ties break towards the higher version string, which is the one the
// site is actively moving to.
function resolveReleaseVersion(versionCounts) {
  const entries = Object.entries(versionCounts);
  if (entries.length === 0) {
    throw new Error("no versionString was reported by any captured payload");
  }
  entries.sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return b[0].localeCompare(a[0], undefined, { numeric: true });
  });
  return entries[0][0];
}

function buildManifest({
  version,
  capturedAt,
  payloads,
  commonRules,
  versionCounts,
  versionStringSource,
  releaseDirName,
  requestConfig,
}) {
  const armiesBySystem = {};
  for (const entry of payloads) {
    armiesBySystem[entry.system] = (armiesBySystem[entry.system] ?? 0) + 1;
  }

  return {
    schemaVersion: 1,
    capturedAt,
    version,
    versionStringSource,
    releaseDir: releaseDirName,
    armyCount: payloads.length,
    armiesBySystem,
    versionHistogram: versionCounts,
    versionMismatches: payloads
      .filter((entry) => entry.listedVersionString !== entry.versionString)
      .map((entry) => ({
        system: entry.system,
        uid: entry.uid,
        name: entry.name,
        listedVersionString: entry.listedVersionString,
        payloadVersionString: entry.versionString,
      })),
    commonRules,
    request: requestConfig,
    payloads: payloads.map((entry) => ({
      system: entry.system,
      uid: entry.uid,
      name: entry.name,
      versionString: entry.versionString,
      modifiedAt: entry.modifiedAt,
      file: entry.file,
      bytes: entry.bytes,
      sha256: entry.sha256,
    })),
  };
}

const VERSION_STRING_SOURCE =
  "versionString field of the captured army-book JSON payloads " +
  "(`GET /api/army-books/<uid>`), resolved to the value reported by the " +
  "plurality of payloads in the capture; the army-list summary `versionString` " +
  "is recorded per army in payloads[].listedVersionString as a cross-check " +
  "but is never used to name the release";

/**
 * Run one capture. Everything it touches is injectable so the tests can drive
 * it with fake fetchers and a temp releases root.
 */
async function captureRelease(options = {}) {
  const root = options.releasesRoot ?? releasesRoot();
  const systems = options.gameSystems ?? GAME_SYSTEMS;
  const log = options.log ?? console.log;
  const sleep = options.sleep ?? delay;
  const fetchers = {
    fetchArmyList: options.fetchArmyList ?? fetchArmyList,
    fetchArmyDetail: options.fetchArmyDetail ?? fetchArmyDetail,
    fetchCommonRules: options.fetchCommonRules ?? fetchCommonRules,
  };
  const now = options.now ?? (() => new Date().toISOString());

  await fs.ensureDir(root);

  // Snapshot before: every release directory that already exists, hashed. The
  // run is not allowed to change any of them.
  const before = checksumReleaseDirs(root);
  const existingNames = Object.keys(before);
  log(
    `Pre-existing release directories: ${existingNames.length === 0 ? "(none)" : existingNames.join(", ")}`,
  );

  const stagingDir = path.join(
    root,
    `${STAGING_PREFIX}${Date.now()}-${process.pid}`,
  );
  await fs.ensureDir(stagingDir);

  const payloads = [];
  const commonRules = {};
  const versionCounts = {};

  try {
    for (const system of systems) {
      log(`\n=== Capturing ${system.slug} (id ${system.id}) ===`);

      const label = `common rules for ${system.slug}`;
      const rules = validateCommonRules(
        await withRetry(label, () => fetchers.fetchCommonRules(system.id), {
          sleep,
          log,
        }),
        system.slug,
      );
      const rulesFile = path.join(stagingDir, system.slug, COMMON_RULES_FILE_NAME);
      await fs.ensureDir(path.dirname(rulesFile));
      const rulesJson = `${JSON.stringify(rules, null, 2)}\n`;
      await fs.writeFile(rulesFile, rulesJson);
      commonRules[system.slug] = {
        file: path.posix.join(system.slug, COMMON_RULES_FILE_NAME),
        ruleCount: rules.rules.length,
        traitCount: rules.traits.length,
        sha256: crypto.createHash("sha256").update(rulesJson).digest("hex"),
      };
      log(
        `  common rules: ${rules.rules.length} rules, ${rules.traits.length} traits`,
      );

      const armyList = await withRetry(
        `army list for ${system.slug}`,
        () => fetchers.fetchArmyList(system.slug),
        { sleep, log },
      );
      if (!Array.isArray(armyList)) {
        throw new Error(
          `army list for ${system.slug} is not an array (${typeof armyList})`,
        );
      }
      log(`  ${armyList.length} armies listed`);

      for (const armySummary of armyList) {
        const expected = {
          name: armySummary.name,
          uid: armySummary.uid,
          system: system.slug,
        };
        const label = `army ${armySummary.name} (${armySummary.uid})`;
        const payload = validateArmyPayload(
          await withRetry(label, () =>
            fetchers.fetchArmyDetail(armySummary.uid, system.id),
          { sleep, log }),
          expected,
        );

        const file = path.posix.join(
          system.slug,
          payloadFileName(payload.name, payload.uid),
        );
        const json = `${JSON.stringify(payload, null, 2)}\n`;
        const fullPath = path.join(stagingDir, ...file.split("/"));
        await fs.ensureDir(path.dirname(fullPath));
        await fs.writeFile(fullPath, json);

        versionCounts[payload.versionString] =
          (versionCounts[payload.versionString] ?? 0) + 1;
        payloads.push({
          system: system.slug,
          uid: payload.uid,
          name: payload.name,
          versionString: payload.versionString,
          listedVersionString: armySummary.versionString ?? null,
          modifiedAt: armySummary.modifiedAt ?? null,
          file,
          bytes: Buffer.byteLength(json),
          sha256: crypto.createHash("sha256").update(json).digest("hex"),
        });
        log(`  captured ${file} (${versionCounts[payload.versionString]} on ${payload.versionString})`);

        await sleep(REQUEST_DELAY_MS);
      }
    }

    if (payloads.length === 0) {
      throw new Error("capture produced no army payloads; refusing to write a release");
    }

    const version = resolveReleaseVersion(versionCounts);
    const releaseDirName = resolveReleaseDirName(version, listReleaseDirNames(root));
    const capturedAt = now();
    const manifest = buildManifest({
      version,
      capturedAt,
      payloads,
      commonRules,
      versionCounts,
      versionStringSource: VERSION_STRING_SOURCE,
      releaseDirName,
      requestConfig: {
        baseUrl: BASE_URL,
        gameSystems: systems.map((system) => system.slug),
        detailMs: REQUEST_DELAY_MS,
        maxAttempts: MAX_ATTEMPTS,
        backoffMs: BACKOFF_MS,
        terminalStatuses: [...TERMINAL_STATUS],
        armyCap: null,
      },
    });
    await fs.writeJson(
      path.join(stagingDir, MANIFEST_FILE_NAME),
      manifest,
      { spaces: 2 },
    );

    // The one and only moment a release directory comes into existence. Until
    // here nothing outside `stagingDir` has been created or modified.
    const releaseDir = path.join(root, releaseDirName);
    if (fs.existsSync(releaseDir)) {
      throw new Error(
        `refusing to write into existing release directory ${releaseDir}`,
      );
    }
    await fs.move(stagingDir, releaseDir, { overwrite: false });
    log(
      `\nCaptured ${payloads.length} army payloads at version ${version} → ${releaseDir}`,
    );

    // Verify after: the pre-existing set must be byte-identical.
    const after = checksumReleaseDirs(root);
    assertReleaseDirsUnchanged(before, after);
    log(
      `Verified ${Object.keys(before).length} pre-existing release directory/ies unchanged by checksum.`,
    );

    return { releaseDir, releaseDirName, manifest, checksums: after };
  } catch (error) {
    // Nothing partial survives a failed run.
    await fs.remove(stagingDir);
    const after = checksumReleaseDirs(root);
    assertReleaseDirsUnchanged(before, after);
    // Re-thrown with the guarantee spelled out, so a caller reading the error
    // is told both which army failed and that the filesystem was left alone.
    // The original message is kept verbatim at the front: it is the specific
    // reason, this is the consequence. Newline-separated so the two read as two
    // sentences in the CLI banner rather than running together.
    throw new Error(`${error.message}\n${NOTHING_WRITTEN}`, { cause: error });
  }
}

// Runs one capture and reports the process exit code rather than calling
// `process.exit` itself, so the abort path is testable without a real network
// run. `captureRelease` rejects with a message that already names the failing
// army and states that nothing was written, so the banner only has to mark it
// as an abort.
async function main(options = {}) {
  try {
    await captureRelease(options);
    return 0;
  } catch (error) {
    console.error(`\nCapture aborted. ${error.message}`);
    return 1;
  }
}

module.exports = {
  COMMON_RULES_FILE_NAME,
  MANIFEST_FILE_NAME,
  MAX_ATTEMPTS,
  NOTHING_WRITTEN,
  RELEASES_DIR_NAME,
  REQUEST_DELAY_MS,
  TERMINAL_STATUS,
  buildManifest,
  captureRelease,
  checksumDir,
  checksumReleaseDirs,
  listReleaseDirNames,
  main,
  releasesRoot,
  resolveReleaseDirName,
  resolveReleaseVersion,
  validateArmyPayload,
  validateCommonRules,
  withRetry,
};

if (require.main === module) {
  // `process.exitCode` rather than `process.exit(1)`: a run that aborts late has
  // buffered stderr to flush, and truncating it would hide the army that failed.
  main().then((code) => {
    process.exitCode = code;
  });
}
