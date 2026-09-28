# Scraper contract (recorded, not modified)

Source of record: **`packages/scraper/src/index.js`** (repo-relative).

This file is a read-only record of what the existing fetch script does. No
behaviour in `index.js` was changed to produce it. Two places where the script
does not match the approved spec are called out under
[Deviations](#deviations-from-the-approved-spec) and were left alone.

## Entry point

| | |
| --- | --- |
| File | `packages/scraper/src/index.js` |
| Declared entry | `packages/scraper/package.json:4` — `"main": "src/index.js"` |
| Run as | `packages/scraper/package.json:6` — `"start": "node src/index.js"` |
| Also aliased | `packages/scraper/package.json:7` — `"update-data": "node src/index.js"` |
| From repo root | `package.json:8` — `"scraper": "turbo run start --filter=@opr-api/scraper"` |
| Self-invoking | `packages/scraper/src/index.js:188` — `scrape();` runs on import, no export |

From the repo root: `pnpm scraper`. Runtime deps are `axios` and `fs-extra`
(`packages/scraper/package.json:10-12`); `jsdom` is declared but never imported
by `index.js`.

## Arguments

**The script accepts none.** There is no `process.argv` read, no environment
variable read, and no config file anywhere in `index.js`.

The four game systems are hardcoded at `packages/scraper/src/index.js:24-29`:

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

Pagination is hardcoded to a single page: the list URL literal at
`packages/scraper/src/index.js:99` contains `page=1`, and the script never
requests a second page. Army count per system is whatever page 1 returns.

## Output destination

`dataRootDir` is fixed at `packages/scraper/src/index.js:69`:

```js
const dataRootDir = path.join(__dirname, "..", "..", "..", "data");
```

That resolves to the repo-root **`data/`** directory. Three write destinations
exist:

| What | Path | Written at |
| --- | --- | --- |
| One payload per army | `data/<system-slug>/<versionString>/<name> (<uid>).json` | `index.js:114-119`, `index.js:129` |
| Common rules per system | `data/<system-slug>/common-rules.json` | `index.js:82-88` |
| Run summary table | `updates.md` at repo root | `index.js:155`, `index.js:162` |

`/` in an army name is replaced with `-` for the filename
(`index.js:115-118`). Directories are created on demand via `fs.ensureDir`
(`index.js:87`, `index.js:128`).

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
`index.js:129` (per army), `fs.writeJson(commonRulesPath, commonRules, { spaces: 2 })`
at `index.js:88`, and `fs.writeFile(updatePath, content)` at `index.js:162`.

**No change is required to make it persist payloads.** The spec's precondition
— that the script must be able to save to disk — is already satisfied.

## Rate limiting

One delay, 500 ms, at `packages/scraper/src/index.js:141`:

```js
// Respectful delay
await new Promise((resolve) => setTimeout(resolve, 500));
```

Exact behaviour of that single delay:

- It sits at the end of the per-army loop body, so it runs **after** a
  successful army and **before** the next one — roughly 2 requests/second
  against the detail endpoint.
- It does **not** run after the last army of a system, so the next system starts
  immediately.
- It does **not** apply to the common-rules request (`index.js:81`) or the
  army-list request (`index.js:100`). Those are unthrottled, though they are
  only 8 requests per full run (4 systems × 2).
- It does not run at all when an army fetch throws, because the `throw` jumps
  past the delay to the `catch` at `index.js:142`.

There is no concurrency: the loops at `index.js:72` and `index.js:111` are
sequential `for`/`of` loops. No cap on armies per run.

## Retry

**Zero retries. There is no retry logic in the script.** No backoff, no
`axios-retry`, no re-attempt loop, no `setTimeout`-based second pass.

`axios.get` is called directly at `index.js:32`, `index.js:55`, and
`index.js:100`. Axios rejects on any non-2xx status by default, and that
rejection is caught by the surrounding `catch` — so a failed army is skipped and
the run moves on. Nothing is ever retried.

## Error handling

Three nested `try`/`catch` blocks, each logging and continuing. Nothing aborts
the run.

**Per army** — `index.js:112-147`:

```js
} catch (error) {
  console.error(
    `Failed to fetch details for ${armySummary.name}:`,
    error.message,
  );
}
```

**Per system** — `index.js:76` opens it, `index.js:149-151` closes it:

```js
} catch (error) {
  console.error(`Failed to scrape ${system.slug}:`, error.message);
}
```

A failed list request skips that whole system's armies and moves to the next
system.

**Per common-rules fetch** — `index.js:80-97`, a nested `try` whose `catch` at
`index.js:92-97` logs `Failed to fetch common rules for <slug>:` and continues
into the list request.

Two consequences worth recording:

- **The exit code is always 0.** There is no `process.exit(1)` in the file, so
  a run in which every single army failed still reports success to the shell and
  to turbo. A caller cannot detect failure by exit status.
- **No empty/truncated-payload guard.** `index.js:129` writes whatever
  `fetchArmyDetail` returned. If a request returns a truncated or empty body
  without throwing, that payload is written to disk as-is.

`updates.md` is only written when at least one army succeeded
(`if (updates.length > 0)` at `index.js:154`); otherwise the previous
`updates.md` is left untouched and goes stale.

## Caching

**No cache of any kind.** No on-disk reuse, no HTTP conditional requests — no
`ETag`, no `If-Modified-Since`, no cache-control handling, no local/remote
timestamp comparison. The script's own comment at `index.js:121-124` states the
reason:

```js
// Always re-fetch — OPR ships small balance patches that update
// points without bumping versionString or modifiedAt, so we can't
// trust a local-vs-remote timestamp to mean "nothing changed."
// Every army in the current listing gets pulled fresh.
```

Consequence: each run issues 1 list request + 1 common-rules request + 1 detail
request per army, per system. The committed `updates.md` shows the last run was
186 army books.

## Version strings

The version that decides the output directory is read from the **army-list
summary**, not from the detail payload — `index.js:113`:

```js
const version = armySummary.versionString || "unknown";
```

The list URL (`index.js:99`) returns summaries carrying `versionString`; the
detail payload also carries it (confirmed present in the committed payload at
`apps/web/public/data/grimdark-future/3.5.3/Alien Hives (w7qor7b2kuifcyvk).json`),
but `index.js` never cross-checks the two. An army whose detail payload reports
a different version than the list is written under the list's version. The
`"unknown"` fallback at `index.js:113` is a literal directory name, not an
error — an army missing `versionString` lands in `data/<slug>/unknown/`.

## Current state on disk

- Repo-root `data/` **does not exist** (gitignored, `.gitignore:26`) — the last
  run's output is not present in this checkout.
- The tracked release set is `apps/web/public/data/<system>/<version>/`.
  `apps/web/public/data/grimdark-future/` holds `3.5.1`, `3.5.2`, `3.5.3`, plus
  `common-rules.json`; `apps/web/public/data/grimdark-future/index.json` lists
  the three versions newest-first. Latest is `3.5.3`, army `modifiedAt`
  `2026-05-05T08:01:44.383Z`.

The differ therefore reads from `apps/web/public/data/`, not from `data/`.

## Endpoints

All three are plain `axios.get` with a hardcoded Chrome `User-Agent`
(`index.js:41-42`, `:61-62`, `:104-105`).

| Purpose | URL | Line |
| --- | --- | --- |
| Army list (per system) | `https://army-forge.onepagerules.com/api/army-books?filters=official&gameSystemSlug=<slug>&searchText=&page=1&unitCount=0&balanceValid=false&customRules=true&fans=false&sortBy=null` | `index.js:99` |
| Army detail | `https://army-forge.onepagerules.com/api/army-books/<uid>` with `?gameSystem=<id>&simpleMode=false` | `index.js:32-38` |
| Common rules | `https://army-forge.onepagerules.com/api/rules/common/<gameSystemId>` | `index.js:55-57` |

The common-rules endpoint is a fourth data source beyond army books — the
comment at `index.js:49-53` notes it carries the official text of every common
special rule, which the per-army payload stores only by name. Anything
extending capture to rules text should read this file, not re-scrape per army.

## Dead code

`packages/scraper/src/organize.js` is not referenced by any `package.json`
script and is not imported by `index.js`. It is a one-off file mover from a
flat `data/*.json` layout into `data/<system>/<version>/`, and it moves with
`{ overwrite: true }` (`organize.js:36`). Nothing in the current pipeline runs
it.

## Deviations from the approved spec

The script persists payloads, so the spec's stop-and-ask precondition does not
apply and no change is required for it to write to disk. Two behaviours do
conflict with the approved append-only model. **Both are recorded only — no code
was changed.** Each is a change to `index.js` and therefore needs approval
before item 2 proceeds.

1. **A second capture of the same version overwrites the first.** `index.js:129`
   calls `fs.writeJson` with no `flag: "wx"`, no existence check, and no
   collision suffix — so a re-run while OPR is still on `3.5.3` rewrites
   `data/<system>/3.5.3/*.json` in place. The spec requires
   `releases/<version>__<n>/`, incrementing `n` on collision and leaving the
   earlier directory byte-identical.
   Change that would be needed: before writing, resolve the target version
   directory against the ones already on disk and pick the first free
   `n` (starting at 1, no suffix for the first), then write into that directory.
   Note the per-army loop resolves `outputDir` per army (`index.js:114`), so a
   mixed-version listing could currently split across directories — the
   collision logic belongs where the directory is chosen, not where the file is
   written.

2. **No abort-on-truncated-payload guard.** The spec requires a run that gets an
   empty or truncated payload to write nothing at all. The script writes
   unconditionally at `index.js:129` and only skips a payload that *threw*.
   Change that would be needed: validate each fetched payload (non-empty object,
   expected `uid`/`units`) into a staging directory, and only move it into the
   release directory once the whole run succeeds — otherwise discard the
   staging directory and leave the previous release untouched.

The existing `LEGACY-PRESERVATION CONTRACT` comment at `index.js:5-23`
documents the current in-place behaviour as intentional, so change 1 is a
deliberate reversal of a documented decision, not a bug fix.
