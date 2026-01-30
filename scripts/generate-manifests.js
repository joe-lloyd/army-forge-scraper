const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "../data");

function getDirectories(source) {
  return fs
    .readdirSync(source, { withFileTypes: true })
    .filter((dirent) => dirent.isDirectory())
    .map((dirent) => dirent.name);
}

function getFiles(source) {
  return fs
    .readdirSync(source, { withFileTypes: true })
    .filter(
      (dirent) =>
        dirent.isFile() &&
        dirent.name.endsWith(".json") &&
        dirent.name !== "index.json",
    )
    .map((dirent) => dirent.name);
}

// 1. Root level: Systems
const systems = getDirectories(DATA_DIR);
fs.writeFileSync(
  path.join(DATA_DIR, "index.json"),
  JSON.stringify(systems, null, 2),
);
console.log("Generated root index.json");

systems.forEach((system) => {
  const systemPath = path.join(DATA_DIR, system);

  // 2. System level: Versions
  const versions = getDirectories(systemPath);
  // Sort versions desc
  versions.sort().reverse();

  fs.writeFileSync(
    path.join(systemPath, "index.json"),
    JSON.stringify(versions, null, 2),
  );
  console.log(`Generated index.json for ${system}`);

  versions.forEach((version) => {
    const versionPath = path.join(systemPath, version);

    // 3. Version level: Armies (Files)
    // The API returned [{ id: filename, name: filename_without_ext }]
    // We should replicate that structure or simplified.
    // Let's replicate it so the frontend needs fewer changes.
    const files = getFiles(versionPath);
    const armies = files.map((file) => ({
      id: file,
      name: file.replace(".json", ""),
    }));

    fs.writeFileSync(
      path.join(versionPath, "index.json"),
      JSON.stringify(armies, null, 2),
    );
    console.log(`  Generated index.json for ${system}/${version}`);
  });
});

console.log("Manifest generation complete.");
