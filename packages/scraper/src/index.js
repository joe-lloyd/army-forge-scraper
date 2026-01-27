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

async function scrape() {
  const dataRootDir = path.join(__dirname, "..", "..", "..", "data");

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
          console.log(`Fetching ${armySummary.name} (${armySummary.uid})...`);
          const data = await fetchArmyDetail(armySummary.uid, system.id);

          const version = data.versionString || "unknown";
          const outputDir = path.join(dataRootDir, system.slug, version);
          await fs.ensureDir(outputDir);

          const fileName = `${data.name} (${data.uid}).json`.replace(
            /\//g,
            "-",
          );
          const filePath = path.join(outputDir, fileName);

          await fs.writeJson(filePath, data, { spaces: 2 });
          console.log(`Saved to ${filePath}`);

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

  console.log("\nScraping complete.");
}

scrape();
