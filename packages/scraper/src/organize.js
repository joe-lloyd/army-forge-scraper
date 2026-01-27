const fs = require("fs-extra");
const path = require("path");

async function organize() {
  const dataDir = path.join(__dirname, "..", "..", "..", "data");
  if (!(await fs.pathExists(dataDir))) {
    console.error(`Data directory ${dataDir} not found.`);
    return;
  }
  const items = await fs.readdir(dataDir);
  const jsonFiles = items.filter((f) => f.endsWith(".json"));

  const gameSystemMap = {
    2: "grimdark-future",
  };

  for (const file of jsonFiles) {
    const filePath = path.join(dataDir, file);
    try {
      const data = await fs.readJson(filePath);
      const version = data.versionString || "unknown";
      const name = data.name || "Unknown";
      const id = data.uid || file.replace(".json", "");
      const gameSystem =
        data.enabledGameSystems && data.enabledGameSystems.includes(2)
          ? "2"
          : "unknown";

      const gameSystemSlug = gameSystemMap[gameSystem] || `game-${gameSystem}`;
      const targetDir = path.join(dataDir, gameSystemSlug, version);
      await fs.ensureDir(targetDir);

      const newFileName = `${name} (${id}).json`.replace(/\//g, "-");
      const targetPath = path.join(targetDir, newFileName);

      await fs.move(filePath, targetPath, { overwrite: true });
      console.log(`Moved ${file} to ${targetPath}`);
    } catch (e) {
      console.error(`Error processing ${file}:`, e.message);
    }
  }
}

organize();
