# Scraper contract (recorded, not modified)

Source of record for the legacy scrape: **`packages/scraper/src/index.js`**
(repo-relative).

This file is a read-only record of what the existing fetch script does, plus a
record of the release capture added alongside it. No behaviour in `index.js`
was changed when the capture was added: its endpoints, headers, pacing, retry
behaviour, output layout and error handling are all as they were. The only edit
to `index.js` was to move the HTTP calls into a shared module so that
`index.js` and `capture.js` cannot drift apart on URLs and headers. See
[Shared fetch layer](#shared-fetch-layer) and
[Release capture](#release-capture-append-only).

## Entry point

| | |
| --- | --- |
| File | `packages/scraper/src/index.js` |
| Declared entry | `packages/scraper/package.json:4` — `"main": "src/index.js"` |
| Run as | `packages/scraper/package.json:6` — `"start": "node src/index.js"` |
| Also aliased | `packages/scraper/package.json:7` — `"update-data": "node src/index.js"` |
| From repo root | `package.json:8` — `"scraper": "turbo run start --filter=@opr-api/scraper"` |
| Self-invoking | `packages/scraper/src/index.js:145` — `scrape();` runs on import, no export |

From the repo root: `pnpm scraper`. Runtime deps are `axios` and `fs-extra`
(`packages/scraper/package.json:10-12`); `jsdom` is declared but never imported
by `index.js`.

## Arguments

**The script accepts none.** There is no `process.argv` read, no environment
variable read, and no config file anywhere in `index.js`.

The four game systems are hardcoded, now in the shared fetch module
(`packages/scraper/src/lib/army-forge.js:17-22`):

```js
const GAME_SYSTEMS = [
  { id: 2, slug: "grimdark-future" },
  { id: 3, slug: "grimdark-future-firefight" },
  { id: 4, slug: "age-of-fantasy" },
  { id: 5, slug: "age-of-fantasy-skirmish" },
];
```

Every run scrapes all four systems end to end. There is no flag to scrape one
system, one page, or one army, and no way to redirect the output directory.

Pagination is hardcoded to a single page: the list URL built by
`fetchArmyList` (`lib/army-forge.js:57-65`) contains `page=1`, and neither
script ever requests a second page. Army count per system is whatever page 1
returns.

## Output destination

`dataRootDir` is fixed at `packages/scraper/src/index.js:38`:

```js
const dataRootDir = path.join(__dirname, "..", "..", "..", "data");
```

That resolves to the repo-root **`data/`** directory. Three write destinations
exist:

| What | Path | Written at |
| --- | --- | --- |
| One payload per army | `data/<system-slug>/<versionString>/<name> (<uid>).json` | `index.js:74-76`, `index.js:86` |
| Common rules per system | `data/<system-slug>/common-rules.json` | `index.js:52-57` |
| Run summary table | `updates.md` at repo root | `index.js:112`, `index.js:119` |

`/` in an army name is replaced with `-` for the filename
(`lib/army-forge.js:67-69`). Directories are created on demand via
`fs.ensureDir` (`index.js:56`, `index.js:85`).

`data/` is gitignored (`.gitignore:26`). The published copy that *is* tracked is
`apps/web/public/data/`, un-ignored at `.gitignore:27` and populated by
`apps/web` `update-data` (`apps/web/package.json`):

```
mkdir -p public/data && cp -R ../../data/. public/data/ && node ../../scripts/generate-manifests.js public/data
```

That copy is `cp -R` with no `rm -rf`, and `scripts/generate-manifests.js` only
ever writes `index.json` manifests (`generate-manifests.js:40-43`, `:54-57`,
`:89-92`) — it takes the data root as `process.argv[2]`
(`generate-manifests.js:8-11`) and deletes nothing.

## Does it write files or print to stdout?

**It writes files.** Payloads are persisted to disk, not printed. It also logs
progress to stdout, but there is no stdout-only or dry-run mode.

The three writes are `fs.writeJson(filePath, data, { spaces: 2 })` at
`index.js:86` (per army), `fs.writeJson(commonRulesPath, commonRules, { spaces: 2 })`
at `index.js:57`, and `fs.writeFile(updatePath, content)` at `index.js:119`.

**No change is required to make it persist payloads.** The spec's precondition
— that the script must be able to save to disk — is already satisfied.

## Rate limiting

One delay, 500 ms, at `packages/scraper/src/index.js:98`:

```js
// Respectful delay
await delay(500);
```

Exact behaviour of that single delay:

- It sits at the end of the per-army loop body, so it runs **after** a
  successful army and **before** the next one — roughly 2 requests/second
  against the detail endpoint.
- It does **not** run after the last army of a system, so the next system starts
  immediately.
- It does **not** apply to the common-rules request (`index.js:50`) or the
  army-list request (`index.js:68`). Those are unthrottled, though they are
  only 8 requests per full run (4 systems × 2).
- It does not run at all when an army fetch throws, because the `throw` jumps
  past the delay to the `catch` at `index.js:99`.

There is no concurrency: the loops at `index.js:41` and `index.js:71` are
sequential `for`/`of` loops. No cap on armies per run.

## Retry

**Zero retries. There is no retry logic in the script.** No backoff, no
`axios-retry`, no re-attempt loop, no `setTimeout`-based second pass.

`fetchArmyDetail`, `fetchCommonRules` and `fetchArmyList` each make a single
`axios.get` (`lib/army-forge.js:31-45`, `:47-55`, `:57-65`). Axios rejects on
any non-2xx status by default, and that rejection is caught by the surrounding
`catch` — so a failed army is skipped and the run moves on. Nothing is ever
retried.

`capture.js` is the exception: it wraps those same fetch functions in its own
retry loop. See [Release capture](#release-capture-append-only).

## Error handling

Three nested `try`/`catch` blocks, each logging and continuing. Nothing aborts
the run.

**Per army** — `index.js:70-107`:

```js
} catch (error) {
  console.error(
    `Failed to fetch details for ${armySummary.name}:`,
    error.message,
  );
}
```

**Per system** — `index.js:42` opens it, `index.js:106-108` closes it:

```js
} catch (error) {
  console.error(`Failed to scrape ${system.slug}:`, error.message);
}
```

A failed list request skips that whole system's armies and moves to the next
system.

**Per common-rules fetch** — `index.js:46-64`, a nested `try` whose `catch` at
`index.js:58-63` logs `Failed to fetch common rules for <slug>:` and continues
into the list request.

Two consequences worth recording:

- **The exit code is always 0.** There is no `process.exit(1)` in the file, so
  a run in which every single army failed still reports success to the shell and
  to turbo. A caller cannot detect failure by exit status.
- **No empty/truncated-payload guard.** `index.js:86` writes whatever
  `fetchArmyDetail` returned. If a request returns a truncated or empty body
  without throwing, that payload is written to disk as-is.

`updates.md` is only written when at least one army succeeded
(`if (updates.length > 0)` at `index.js:111`); otherwise the previous
`updates.md` is left untouched and goes stale.

## Caching

**No cache of any kind.** No on-disk reuse, no HTTP conditional requests — no
`ETag`, no `If-Modified-Since`, no cache-control handling, no local/remote
timestamp comparison. The script's own comment at `index.js:78-81` states the
reason:

```js
// Always re-fetch — OPR ships small balance patches that update
// points without bumping versionString or modifiedAt, so we can't
// trust a local-vs-remote timestamp to mean "nothing changed."
// Every army in the current listing gets pulled fresh.
```

Consequence: each run issues 1 list request + 1 common-rules request + 1 detail
request per army, per system. The committed `updates.md` shows the last run was
186 army books — the same count the release capture below produced.

## Version strings

The version that decides the output directory is read from the **army-list
summary**, not from the detail payload — `index.js:73`:

```js
const version = armySummary.versionString || "unknown";
```

The list URL returns summaries carrying `versionString`; the detail payload also
carries it, but `index.js` never cross-checks the two. An army whose detail
payload reports a different version than the list is written under the list's
version. The `"unknown"` fallback is a literal directory name, not an error — an
army missing `versionString` lands in `data/<slug>/unknown/`.

`capture.js` reverses the priority: the release is named from the `versionString`
**inside the captured payload**, with the list summary kept alongside it as a
recorded cross-check.

## Shared fetch layer

`packages/scraper/src/lib/army-forge.js` holds every URL, header and request
param in the package, and is the only file that talks to
`army-forge.onepagerules.com`. It exports `BASE_URL`, `GAME_SYSTEMS`,
`USER_AGENT`, `delay`, `fetchArmyDetail`, `fetchArmyList`, `fetchCommonRules`
and `payloadFileName`.

`index.js` requires them (`index.js:8-15`); `capture.js` requires the same set
(`capture.js:5-13`). The only behavioural change to `index.js` from the
extraction: the inlined list URL at old `index.js:99` is now the `fetchArmyList`
call, with the same query string including `page=1`.

## Endpoints

All three are plain `axios.get` with a hardcoded Chrome `User-Agent`
(`lib/army-forge.js:14-15`, `:26-29`).

| Purpose | URL | Line |
| --- | --- | --- |
| Army list (per system) | `https://army-forge.onepagerules.com/api/army-books?filters=official&gameSystemSlug=<slug>&searchText=&page=1&unitCount=0&balanceValid=false&customRules=true&fans=false&sortBy=null` | `lib/army-forge.js:58` |
| Army detail | `https://army-forge.onepagerules.com/api/army-books/<uid>` with `?gameSystem=<id>&simpleMode=false` | `lib/army-forge.js:32-34` |
| Common rules | `https://army-forge.onepagerules.com/api/rules/common/<gameSystemId>` | `lib/army-forge.js:48` |

The common-rules endpoint is a fourth data source beyond army books — the
comment at `lib/army-forge.js:41-46` notes it carries the official text of every
common special rule, which the per-army payload stores only by name. Anything
extending capture to rules text should read this file, not re-scrape per army.

## Dead code

`packages/scraper/src/organize.js` is not referenced by any `package.json`
script and is not imported by `index.js`. It is a one-off file mover from a
flat `data/*.json` layout into `data/<system>/<version>/`, and it moves with
`{ overwrite: true }` (`organize.js:36`). Nothing in the current pipeline runs
it.

# Release capture (append-only)

`packages/scraper/src/capture.js` is the second entry point. It runs the same
fetch functions as `index.js` and writes the result into a **new** release
directory. Nothing it does can modify a release directory that already exists.

| | |
| --- | --- |
| File | `packages/scraper/src/capture.js` |
| Run as | `packages/scraper/package.json:8` — `"capture": "node src/capture.js"` |
| From repo root | `package.json:9` — `"capture": "turbo run capture --filter=@opr-api/scraper"` |
| Tests | `packages/scraper/test/capture.test.js`, `node --test` |
| Arguments | None. Same as `index.js`: no flags, no env vars. |

## Layout it writes

```
releases/<version>__<n>/
  manifest.json
  <system>/<army name> (<uid>).json
  <system>/common-rules.json
```

- `<version>` is the version string from the JSON payloads, as required.
- `<n>` is omitted for the first capture of a version and increments from 2
  (`capture.js:88-96`) on every later capture of the same live version.
- `<system>` subdirectories are required, not cosmetic: 77 of the 186 army books
  are served in more than one game system and the payloads differ per system
  (the same `uid` returned with different `units`, `upgradePackages` and
  `gameSystemId`).

## How nothing gets overwritten

1. Every release directory that already exists is checksummed before the run
   (`capture.js:249-251`, `checksumDir` at `:99-121`).
2. All payloads are written into a staging directory `releases/.capture-<ts>-<pid>/`
   (`capture.js:257-260`).
3. Each payload is validated before it is accepted (`validateArmyPayload`,
   `capture.js:124-155`): it must be a non-empty object, carry the `uid` that
   was requested, have a name, a non-empty `units` array and a `versionString`.
4. The release directory is created by a single `fs.move` of the staging
   directory with `overwrite: false` (`capture.js:377-386`). That is the only
   moment a release comes into existence, and it refuses to run if the target
   name is somehow already taken.
5. The pre-existing directories are checksummed again and compared to the
   pre-run snapshot (`capture.js:390-393`). A mismatch fails the run.
6. On any failure, the staging directory is removed and the pre-run checksum
   comparison runs again (`capture.js:397-400`). A failed capture creates no
   release directory at all.

The checksum is a SHA-256 over every file's relative path and content in sorted
path order, so it depends on bytes and layout but not on mtimes or directory
iteration order.

## Pacing and retry

| | `index.js` (legacy) | `capture.js` |
| --- | --- | --- |
| Delay between army requests | 500 ms (`index.js:98`) | 1000 ms (`capture.js:39`) |
| Attempts per request | 1 | 3 (`capture.js:40`) |
| Backoff | none | 1000 ms, then 2000 ms (`capture.js:41`) |
| Terminal statuses | none | 404 (`capture.js:44`) |
| Army cap | none | none (`capture.js:386`) |

The capture is deliberately slower and more defensive than the legacy scrape:
with the abort-on-any-failure rule below, a single dropped connection out of ~190
requests would otherwise throw away the whole run.

## Abort on an unusable payload

A release is all-or-nothing. If any army payload fails validation, any request
still failing after 3 attempts, the army list is not an array, or a capture ends
up with zero armies, the staging directory is deleted, no release directory is
created, and the process exits 1 (`capture.js:496-508`, `capture.js:515-523`).

Every payload is validated before the release directory exists, not just before
it is written: the release comes into existence in a single `fs.move` of the
staging directory after the last payload has been fetched and checked
(`capture.js:477-483`). A payload that fails can therefore never reach a release
directory, partial or otherwise.

### An unusable payload that is not JSON

The validation distinguishes *empty or unparseable* from *wrong shape*, because
the two mean different things when a run aborts.

axios' default `transformResponse` **swallows the `JSON.parse` SyntaxError** and
returns the unparsed body as a string, rather than throwing. Verified against a
local server: a truncated body, an empty body and a 200 carrying an HTML error
page all reach the caller as `typeof data === "string"`, with no error raised.
`unparseableBodyReason` (`capture.js:146-159`) is written for that case, and
both `validateArmyPayload` and `validateCommonRules` check it first.

| Response body | Reported as |
| --- | --- |
| `""` or whitespace only | `payload failed JSON parse: empty response body` |
| `{"uid":"x","units":[` | `payload failed JSON parse: body is not JSON (25 bytes starting …)` |
| `<!DOCTYPE html>…` | `payload failed JSON parse: body is not JSON (43 bytes starting …)` |
| `{}` | `empty object` |
| `null` / `[]` / `42` | `expected an object, got null` / `array` / `number` |

Without that first check all four string cases collapse into a single
`expected an object, got string`, which reads like the site changed its payload
shape rather than like a truncated transfer. A test
(`axios hands back an unparseable body as a string instead of throwing`) pins
the axios behaviour itself against a local HTTP server, so the string branch
cannot be deleted on the assumption that a bad body always throws.

### The abort error states what happened

A capture that aborts throws an error whose message is the specific reason,
newline, and then the guarantee (`NOTHING_WRITTEN`, `capture.js:47-51`):

```
payload for Battle/Brothers (bbb222) in grimdark-future is unusable: payload failed JSON parse: body is not JSON (25 bytes starting "{\"uid\":\"bbb222\",\"units\":[")
No release directory was created, no release directory was modified, and the staging directory was removed.
```

The reason names the army by list name, uid and system. The guarantee is part of
the error rather than only the CLI banner, so a caller that catches it knows the
`releases/` directory is untouched. The original error is preserved as `cause`.

`main` returns an exit code instead of calling `process.exit` itself, so the
abort path is testable without a network run; the `require.main` wrapper assigns
it to `process.exitCode` rather than exiting, so a run that aborts late still
flushes the stderr naming the army that failed.

## Manifest

`manifest.json` records:

| Field | Meaning |
| --- | --- |
| `capturedAt` | ISO timestamp of the capture |
| `version` | the version string the release directory is named after |
| `versionStringSource` | where that string came from, in words |
| `armyCount` | number of army payloads captured |
| `armiesBySystem` | per-system payload counts |
| `versionHistogram` | every `versionString` seen, with counts |
| `versionMismatches` | armies where the payload and the list summary disagree |
| `commonRules` | per-system rule/trait counts and checksums |
| `request` | endpoints, pacing, retry and cap parameters used for this run |
| `payloads[]` | per army: system, uid, name, version, file path, size, SHA-256 |

`version` is the `versionString` reported by the plurality of captured payloads.
A capture is genuinely mixed-version — the live listing served 178 payloads on
`3.5.3` and 8 stragglers still on `3.5.2` — so the histogram is kept rather than
flattened, and the stragglers are not hidden.

## Captures recorded in this checkout

Three consecutive runs of `pnpm capture` against the live site, all landing on
the same live version and each producing a new sibling directory:

| Release | `capturedAt` | Army payloads | Directory checksum |
| --- | --- | --- | --- |
| `releases/3.5.3/` | `2026-09-28T22:29:03.477Z` | 186 | `79abdb28a38468ad…` |
| `releases/3.5.3__2/` | `2026-09-28T22:33:46.284Z` | 186 | `754d5d3a7a09e63a…` |
| `releases/3.5.3__3/` | `2026-09-28T22:38:04.085Z` | 186 | — |

Each is 191 JSON files (186 army payloads + 4 `common-rules.json` + 1 manifest)
across the four game systems (47 / 53 / 40 / 46), 39 MB, at version `3.5.3`
with histogram `{"3.5.3": 178, "3.5.2": 8}`. The three directories are distinct
snapshots with distinct checksums — the site serves live data, so a second
capture of the same version is a new observation, not a duplicate copy.

`releases/` is **not** gitignored, so these captures are part of the change and
can be committed. The spec calls for release directories to be kept and never
rewritten, which means they belong in history, not a build artifact.

# Release normalization

`packages/scraper/src/normalize.js` turns one captured release directory into a
single normalized JSON document. The raw payloads stay exactly as captured; this
script only *adds* a file.

| | |
| --- | --- |
| File | `packages/scraper/src/normalize.js` |
| Run as | `packages/scraper/package.json:9` — `"normalize": "node src/normalize.js"` |
| From repo root | `package.json:10` — `"normalize": "turbo run normalize --filter=@opr-api/scraper"` |
| Tests | `packages/scraper/test/normalize.test.js`, `node --test` |
| Arguments | Optional. A release directory name under `releases/`, or a path to one. Bare, it targets the most recently captured release, by the manifest's `capturedAt`. |
| Network | None. See [No network](#no-network-access-is-tested-not-promised). |

## Layout

```
releases/<version>__<n>/
  manifest.json
  normalized.json                              <-- added by the normalizer
  <system>/<army name> (<uid>).json
  <system>/common-rules.json
```

One document per release, not one per army, so a consumer loads the release
once. Each of the three recorded captures now has one:

| Release | `version` | Armies | Units | Weapons | Upgrade options | `normalized.json` | SHA-256 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `releases/3.5.3/` | `3.5.3` | 186 | 3200 | 5381 | 19042 | 56 799 889 B | `a5e9b29133b5b3ea…` |
| `releases/3.5.3__2/` | `3.5.3` | 186 | 3200 | 5381 | 19042 | 56 799 892 B | `f6becb3c44651ee6…` |
| `releases/3.5.3__3/` | `3.5.3` | 186 | 3200 | 5381 | 19042 | 56 799 892 B | `8a746e68fde20f94…` |

`versionHistogram` is `{"3.5.3": 178, "3.5.2": 8}` in all three, and
`armiesBySystem` is `{"age-of-fantasy": 40, "age-of-fantasy-skirmish": 46,
"grimdark-future": 47, "grimdark-future-firefight": 53}` — recomputed from the
normalized armies, so the document can never disagree with its own contents.

The document is **larger than the raw payloads it replaces** (57 MB against
40 MB), and that is deliberate. It is indented with two spaces at a nesting
depth of 15 so a `git diff` between two releases is a diff of army data rather
than of re-indentation; minified, the same content is 22 MB. The differ that
consumes this is what decides how much of it ships in the static bundle.

## Why the document is pruned, and what it is not

The raw payload is the full-fidelity record and is never modified. The
normalized document carries army data and drops per-army bookkeeping that is
not army data, so a diff is about armies:

| Dropped | Why |
| --- | --- |
| `userId`, `username`, `creator`, `isCreator`, `popularity`, `downvotes`, `voted` | Account and vote state, not army data. |
| `coverImagePath`, `bannerImagePath`, `loreUrl`, `visibility` | Presentation and access flags. |
| `hint`, `background`, `backgroundFull`, `partnerSettings` | Army blurb prose. Editing a blurb is not a rules change. |
| `balanceValidReason` | Prose. `balanceValid` itself is carried. |
| `modifiedAt`, `editedAt`, `enabledGameSystems` | The capture's own bookkeeping; `capturedAt` on the document covers the when. |
| `spells`, `transforms` | 1116 spells and 410 transforms in one release. They are real army rules that no unit, weapon or upgrade list references, so they would sit outside every comparison the spec asks for. Out of scope, and named here rather than dropped silently. `customRules` and `customWeapons` are also omitted, and those really are empty in all 558 captured payloads. |
| `unit.sync`, `unit.loadout`, `unit.product` | Client-side sync marker, and a 3D-model store link on 2 and 6 units out of 9600 across the three captures. |
| `aliasedRuleId` on rule references | The army's rule dictionary carries it, which is where a reference resolves. |

## Key order

The order is fixed, and identical in every release. `KEY_ORDER` in
`normalize.js` is the contract; `normalize.test.js` hard-codes its own copy and
walks a produced document against it, so reordering a literal without changing
the contract fails the suite instead of silently reformatting every future
diff.

| Node | Key order |
| --- | --- |
| document | `schemaVersion`, `version`, `releaseDir`, `capturedAt`, `defaults`, `gameSystems`, `armyCount`, `armiesBySystem`, `versionHistogram`, `armies` |
| army | `uid`, `name`, `system`, `systemId`, `versionString`, `factionName`, `raceGroup`, `official`, `balanceValid`, `specialRules`, `units`, `upgradePackages` |
| army rule | `id`, `name`, `originalName`, `aliasedRuleId`, `hasRating`, `coreType`, `targetType`, `description` |
| unit | `id`, `name`, `genericName`, `key`, `type`, `cost`, `size`, `originalSize`, `bases`, `defense`, `quality`, `valid`, `hasCustomRule`, `hasBalanceInvalid`, `isNarrative`, `upgradePackageUids`, `disabledSections`, `disabledUpgradeSections`, `weapons`, `items`, `rules` |
| bases | `round`, `square` |
| weapon-like | `type`, `id`, `name`, `nameOverride`, `label`, `count`, `originalCount`, `range`, `attacks`, `attacksMultiplier`, `weaponId`, `rating`, `newWeapon`, `bases`, `specialRules`, `content` |
| item | `id`, `name`, `type`, `count`, `bases`, `content` |
| rule reference | `id`, `name`, `label`, `type`, `rating`, `additional` |
| upgrade package | `uid`, `hint`, `sections` |
| upgrade section | `id`, `uid`, `label`, `variant`, `select`, `model`, `isHeroUpgrade`, `isLowPrio`, `targets`, `affects`, `options` |
| upgrade option | `id`, `uid`, `label`, `cost`, `costs`, `gains` |
| upgrade cost | `unitId`, `cost`, `exactCost` |
| selection | `type`, `value` |

One `weapon-like` shape covers unit weapons, item content entries and upgrade
gains, because the payload uses one `ArmyBookWeapon` / `ArmyBookItem` /
`ArmyBookRule` node for all three and only varies which keys it fills in. The
`type` key is what tells a consumer which of the rest carry meaning.

### List order, and which lists are sorted

| List | Order | Why |
| --- | --- | --- |
| `units` | payload order | Roster order is the unit-count limit. Reordering it would invent a change. |
| `weapons`, `items`, `rules`, `specialRules`, `sections`, `options`, `gains`, `costs`, `targets` | payload order | Order is data — an upgrade section's options are the alternatives, in the order the book lists them. |
| `armies` | `(system, name, uid)` | A directory walk or a manifest order is an accident; the differ needs a stable one. |
| `specialRules` (army dictionary), `upgradePackages`, `sections`, `options` | by `id` / `uid` | Lookup tables. Their order is an accident of the server and must not read as a change. |
| `upgradePackageUids`, `disabledSections`, `disabledUpgradeSections` | sorted strings | Sets of ids. |

Every comparison is by UTF-16 code unit, never `localeCompare`: two machines
with different locale collation would otherwise emit different bytes for the
same capture, and this file is compared and committed as bytes.

## Defaults for absent fields

A field the payload omits is **not dropped**. Its key is still present, holding
the value below, and the whole table is embedded in every document under
`defaults` (`DEFAULTS` in `normalize.js`, deep-cloned so a consumer cannot
reach the module's constants). The rule for choosing a default:

- **`null`** for scalars — ids, names, labels, and numbers. Absent means "the
  site did not say", and a made-up number would be a lie the differ then reports
  as a real balance change.
- **`[]`** for lists. Absent means empty, which is true of every list the
  payload omits. A `null` list in the payload becomes `[]`, never `null`, so a
  consumer never has to null-check a list.
- **`false`** for flags — with one exception, below.
- **`{ "round": null, "square": null }`** for `bases`, which is always the
  two-key object.

`unit.valid` defaults to **`true`**, not `false`: an army book that reports
nothing about a unit's validity is not reporting that the unit is invalid.

Defaults that resolve a real question in the data:

| Field | Default | Why |
| --- | --- | --- |
| `unit.key` | `null` | Absent on 8991 of 9600 units; only narrative-style units send it. |
| `unit.type` | `null` | Absent on 9048 of 9600. |
| `unit.originalSize` | `null` | Absent on 5451 of 9600. |
| `unit.isNarrative` | `false` | Absent on 9267 of 9600. |
| `unit.bases` | `{round: null, square: null}` | Sent on all 9600 captured units, with 8 distinct size pairs. Never assumed: both sizes are carried exactly as sent, and a unit that sends neither gets both `null`. |
| `army.factionName` | `null` | Non-null on only 276 of 558 captured payloads. An army that declares no faction — Beastmen, for one — normalizes to `null` rather than to an empty string. |
| `army.raceGroup` | `null` | Null on all 558 captured payloads, so this key is present in every document and always `null`. Kept because the payload has the field and a future release may populate it. |
| `upgradeSection.select` | `null` | Absent on 13865 of 21111 sections. When present it is `{"type", "value"}` and `value` is `null` for `any` and `all`. |
| `upgradeOption.cost` | `null` | Present on 30327 of 57126 options. The other half still prices itself through `costs[]`, which is always sent, so `null` is the honest value rather than `0`. |
| `weaponLike.rating` | `null` | Absent on most weapons. **Never coerced**: the payload sends a number for a numeric rule and a string for a bespoke one (`"Spores [5]"`), and both are carried verbatim. |
| `weaponLike.bases`, `item.bases` | `{round: null, square: null}` | A weapon's bases describe the model it is mounted on, and are absent on most. |

A falsy value the payload really sends is never replaced by a default: `0`,
`""` and `false` all survive. Only `undefined` and `null` fall back.

### Two payload fields that do not mean what they look like

- `units[].upgrades` holds the uids of the army's upgrade **packages** a unit
  may draw from, not section ids. It is normalized to `upgradePackageUids` for
  that reason: none of the 14289 entries in the three captures matches a section
  `uid` or `id`, and all of them match a package uid.
- `unit.quality` is the unit's stat-tier (3, 4, 5 …), not a data-quality flag.
  `valid` is the data-quality flag.

## How the raw payloads are protected

The normalizer re-checks the capture's own integrity before and after writing,
so "the raw data was not touched" is verified rather than promised:

1. Every payload's SHA-256 is compared against `manifest.json`. A payload edited
   after capture fails the run.
2. Every file in the release directory is compared against the manifest's
   payload list. An army payload in the directory that the manifest does not
   list means the release was edited by hand, which the append-only contract
   forbids, so the run stops rather than quietly dropping that army.
3. A payload the manifest lists but the directory does not hold fails the run.
4. Every payload goes through the same `validateArmyPayload` predicate the
   capture used, so a payload that would have been rejected at fetch time is not
   normalized from whatever survived on disk.
5. The document is written to `.normalize-<pid>-<ts>` and moved into place with
   a single rename, so an interrupted run leaves the previous document intact
   rather than a truncated one. A leftover temp file from a killed run is swept
   before the next one.
6. The whole sequence runs again after the write, and every raw payload in all
   three recorded releases was confirmed byte-identical (573 files, SHA-256
   before and after).

## No network access is tested, not promised

Nothing in `normalize.js` requires an HTTP client or calls a fetch function.
`axios` is in the process only because `validateArmyPayload` is imported from
`capture.js`, and requiring a module is not requesting anything.

The test makes that real rather than theoretical: it replaces `http.request`,
`http.get`, `https.request`, `https.get`, `net.connect`,
`net.Socket.prototype.connect`, `dns.lookup` and `dns.promises.lookup` with
traps that fail the run, then normalizes a release through them. Any socket or
any DNS lookup fails the suite.

## Deviations from the approved spec
Both deviations recorded for `index.js` are resolved by `capture.js`, which is
the entry point the release pipeline uses. `index.js` itself is unchanged in
behaviour, including its documented in-place rewrite of `data/<system>/<version>/`.

1. **A second capture of the same version overwrites the first.** Resolved.
   `capture.js` resolves the release directory name against the directories
   already on disk and takes the next free `__<n>` suffix, and it stages the
   whole capture before moving it into place, so the earlier release keeps its
   bytes. `index.js` still rewrites `data/<system>/<versionString>/` in place,
   which is what its `LEGACY-PRESERVATION CONTRACT` documents.
2. **No abort-on-truncated-payload guard.** Resolved.
   `validateArmyPayload` plus the staging directory mean a truncated or empty
   payload aborts the run before any release directory exists. `index.js` still
   writes unconditionally and exits 0.
