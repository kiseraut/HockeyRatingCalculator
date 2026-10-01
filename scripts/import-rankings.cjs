const fs = require("node:fs");
const path = require("node:path");
const { parse } = require("../manual-data");
const file = process.argv[2];
if (!file) {
    console.error(
        'Usage: node scripts/import-rankings.cjs "C:\\path\\to\\rankings-data.json"',
    );
    process.exit(1);
}
try {
    const payload = parse(
        fs.readFileSync(path.resolve(file), "utf8").replace(/^\uFEFF/, ""),
    );
    const directory = path.resolve(__dirname, "..");
    const json = JSON.stringify(payload, null, 2);
    fs.writeFileSync(path.join(directory, "rankings-data.json"), json + "\n");
    fs.writeFileSync(
        path.join(directory, "rankings-data.js"),
        "window.__RANKINGS_DATA__ = " + json + ";\n",
    );
    console.log(
        `Imported ${payload.teams.length} teams, collected ${payload.scrapedAt}. No GitHub push performed.`,
    );
} catch (error) {
    console.error(error.message);
    process.exitCode = 1;
}
