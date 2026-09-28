const axios = require("axios");

// Source of record for everything that talks to army-forge.onepagerules.com.
// `index.js` (the legacy `pnpm scraper` scrape into `data/`) and `capture.js`
// (the append-only release capture into `releases/`) both go through this
// module, so there is exactly one set of endpoint URLs, one set of headers and
// one set of request params in the repo.
//
// Behaviour here is deliberately the behaviour the original `index.js` had:
// one `axios.get` per request, no retry, no backoff, no concurrency. Anything
// that retries lives in the caller, not here.
const BASE_URL = "https://army-forge.onepagerules.com";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const GAME_SYSTEMS = [
  { id: 2, slug: "grimdark-future" },
  { id: 3, slug: "grimdark-future-firefight" },
  { id: 4, slug: "age-of-fantasy" },
  { id: 5, slug: "age-of-fantasy-skirmish" },
];

function jsonHeaders() {
  return {
    Accept: "application/json, text/plain, */*",
    "User-Agent": USER_AGENT,
  };
}

async function fetchArmyDetail(armyId, gameSystemId) {
  const response = await axios.get(`${BASE_URL}/api/army-books/${armyId}`, {
    params: {
      gameSystem: gameSystemId,
      simpleMode: false,
    },
    headers: jsonHeaders(),
  });
  return response.data;
}

// `/api/rules/common/{gameSystemId}` carries the official text of every common
// special rule (Rending, AP, Blast, etc.) plus hero traits and their cost
// formulas. The per-army-book payload only stores the rule NAME on each weapon
// — descriptions live exclusively in this endpoint. Anything extending capture
// to rules text reads this payload rather than re-scraping per army.
async function fetchCommonRules(gameSystemId) {
  const response = await axios.get(`${BASE_URL}/api/rules/common/${gameSystemId}`, {
    headers: jsonHeaders(),
  });
  return response.data;
}

// `index.js` inlined this URL as a template literal. It is a function here so
// `capture.js` can hit the same endpoint with the same hardcoded `page=1`
// pagination instead of guessing at a second, divergent list URL.
async function fetchArmyList(gameSystemSlug) {
  const listUrl = `${BASE_URL}/api/army-books?filters=official&gameSystemSlug=${gameSystemSlug}&searchText=&page=1&unitCount=0&balanceValid=false&customRules=true&fans=false&sortBy=null`;
  const response = await axios.get(listUrl, {
    headers: jsonHeaders(),
  });
  return response.data;
}

// `/` in an army name is replaced with `-` for the filename, so the file can
// never escape the directory it is written into.
function payloadFileName(armyName, armyUid) {
  return `${armyName} (${armyUid}).json`.replace(/\//g, "-");
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = {
  BASE_URL,
  GAME_SYSTEMS,
  USER_AGENT,
  delay,
  fetchArmyDetail,
  fetchArmyList,
  fetchCommonRules,
  payloadFileName,
};
