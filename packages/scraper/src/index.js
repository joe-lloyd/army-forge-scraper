const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");

// LEGACY-PRESERVATION CONTRACT
// ----------------------------
// Each army book carries its own `versionString` (e.g. "3.5.3") from OPR. We
// write the scraped JSON to `data/<system>/<versionString>/<name>.json` — so
// the version dir is determined per-army by what OPR reports right now.
//
// We NEVER:
//   - delete files from `data/`
//   - delete files from `apps/web/public/data/`
//   - touch dirs for versionStrings that the API isn't currently returning
//
// Re-scraping while OPR is still on 3.5.2 → updates `data/<system>/3.5.2/...`
// in place (same path, new modifiedAt). Re-scraping after OPR bumps to 3.5.3 →
// writes to `data/<system>/3.5.3/...` and leaves the 3.5.2 directory frozen.
//
// `apps/web/package.json:update-data` uses `cp -R data/. public/data/` (no
// rm -rf) so legacy version dirs already published to public/data also stay.
// If an army is removed from the OPR catalog entirely, its local file remains
// permanently as the last known good snapshot for that version.
const GAME_SYSTEMS = [
  { id: 2, slug: "grimdark-future" },
  { id: 3, slug: "grimdark-future-firefight" },
  { id: 4, slug: "age-of-fantasy" },
  { id: 5, slug: "age-of-fantasy-skirmish" },
];

async function fetchArmyDetail(armyId, gameSystemId) {
  const response = await axios.get(
    `https://army-forge.onepagerules.com/api/army-books/${armyId}`,
    {
      params: {
        gameSystem: gameSystemId,
        simpleMode: false,
      },
      headers: {
        Accept: "application/json, text/plain, */*",
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    },
  );
  return response.data;
}

// `/api/rules/common/{gameSystemId}` carries the official text of every common
// special rule (Rending, AP, Blast, etc.) plus hero traits and their cost
// formulas. The per-army-book payload only stores the rule NAME on each weapon
// — descriptions live exclusively in this endpoint. We scrape it per game
// system so the UI can render tooltips.
async function fetchCommonRules(gameSystemId) {
  const response = await axios.get(
    `https://army-forge.onepagerules.com/api/rules/common/${gameSystemId}`,
    {
      headers: {
        Accept: "application/json, text/plain, */*",
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    },
  );
  return response.data;
}

async function scrape() {
  const dataRootDir = path.join(__dirname, "..", "..", "..", "data");
  const updates = [];

  for (const system of GAME_SYSTEMS) {
    console.log(
      `\n=== Scraping Game System: ${system.slug} (${system.id}) ===`,
    );
    try {
      // Common rules per game system — pulled once, written to
      // `data/<system>/common-rules.json` so the web app can build a name →
      // description map for tooltips at load time.
      try {
        const commonRules = await fetchCommonRules(system.id);
        const commonRulesPath = path.join(
          dataRootDir,
          system.slug,
          "common-rules.json",
        );
        await fs.ensureDir(path.dirname(commonRulesPath));
        await fs.writeJson(commonRulesPath, commonRules, { spaces: 2 });
        console.log(
          `Saved common rules: ${commonRules.rules?.length ?? 0} rules, ${commonRules.traits?.length ?? 0} traits → ${commonRulesPath}`,
        );
      } catch (e) {
        console.error(
          `Failed to fetch common rules for ${system.slug}:`,
          e.message,
        );
      }

      const listUrl = `https://army-forge.onepagerules.com/api/army-books?filters=official&gameSystemSlug=${system.slug}&searchText=&page=1&unitCount=0&balanceValid=false&customRules=true&fans=false&sortBy=null`;
      const listResponse = await axios.get(listUrl, {
        headers: {
          Accept: "application/json",
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
      });

      const armyList = listResponse.data;
      console.log(`Found ${armyList.length} armies.`);

      for (const armySummary of armyList) {
        try {
          const version = armySummary.versionString || "unknown";
          const outputDir = path.join(dataRootDir, system.slug, version);
          const fileName = `${armySummary.name} (${armySummary.uid}).json`.replace(
            /\//g,
            "-",
          );
          const filePath = path.join(outputDir, fileName);

          // Always re-fetch — OPR ships small balance patches that update
          // points without bumping versionString or modifiedAt, so we can't
          // trust a local-vs-remote timestamp to mean "nothing changed."
          // Every army in the current listing gets pulled fresh.
          console.log(`Fetching ${armySummary.name} (${armySummary.uid})...`);
          const data = await fetchArmyDetail(armySummary.uid, system.id);

          await fs.ensureDir(outputDir);
          await fs.writeJson(filePath, data, { spaces: 2 });
          console.log(`Saved to ${filePath}`);
          
          updates.push({
            name: armySummary.name,
            uid: armySummary.uid,
            system: system.slug,
            version: version,
            modifiedAt: armySummary.modifiedAt
          });

          // Respectful delay
          await new Promise((resolve) => setTimeout(resolve, 500));
        } catch (error) {
          console.error(
            `Failed to fetch details for ${armySummary.name}:`,
            error.message,
          );
        }
      }
    } catch (error) {
      console.error(`Failed to scrape ${system.slug}:`, error.message);
    }
  }

  if (updates.length > 0) {
    const updatePath = path.join(__dirname, "..", "..", "..", "updates.md");
    let content = `# OPR Data Updates Detected\n\nFound ${updates.length} updated army books.\n\n`;
    content += "| Game System | Army Name | Version | Modified At |\n";
    content += "| --- | --- | --- | --- |\n";
    updates.forEach(u => {
      content += `| ${u.system} | ${u.name} | ${u.version} | ${u.modifiedAt} |\n`;
    });
    await fs.writeFile(updatePath, content);
    console.log(`\nUpdates summary written to ${updatePath}`);
  }

  // Per-system summary of which version dirs we touched vs left alone. The
  // "touched" set is everything we just wrote into; everything else under
  // `data/<system>/` is legacy and was preserved without any reads or writes.
  console.log("\n=== Version touch report ===");
  for (const system of GAME_SYSTEMS) {
    const systemDir = path.join(dataRootDir, system.slug);
    if (!(await fs.pathExists(systemDir))) continue;
    const onDisk = (await fs.readdir(systemDir, { withFileTypes: true }))
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort()
      .reverse();
    const touched = new Set(
      updates.filter((u) => u.system === system.slug).map((u) => u.version),
    );
    const cols = onDisk.map((v) => (touched.has(v) ? `${v} (updated)` : `${v} (preserved)`));
    console.log(`${system.slug}: ${cols.join(", ") || "(no data yet)"}`);
  }

  console.log("\nScraping complete.");
}

scrape();
