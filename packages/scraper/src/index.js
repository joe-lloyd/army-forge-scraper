const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");

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

const args = process.argv.slice(2);
const force = args.includes("--force");

async function scrape() {
  const dataRootDir = path.join(__dirname, "..", "..", "..", "data");
  const updates = [];

  if (force) {
    console.log("Force mode enabled: All armies will be re-scraped.");
  }

  for (const system of GAME_SYSTEMS) {
    console.log(
      `\n=== Scraping Game System: ${system.slug} (${system.id}) ===`,
    );
    try {
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

          // Check if we already have this version up to date
          if (!force && (await fs.pathExists(filePath))) {
            const localData = await fs.readJson(filePath);
            if (localData.modifiedAt === armySummary.modifiedAt) {
              console.log(
                `Skipping ${armySummary.name} (${armySummary.uid}) - already up to date (${armySummary.modifiedAt})`,
              );
              continue;
            }
          }

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

  console.log("\nScraping complete.");
}

scrape();
