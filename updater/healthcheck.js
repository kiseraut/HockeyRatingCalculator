const fs = require("node:fs");
try {
    const status = JSON.parse(fs.readFileSync("/state/status.json", "utf8"));
    const maxAge =
        (Number(process.env.UPDATE_INTERVAL_HOURS || 24) + 2) * 3600000;
    if (
        !status.ok ||
        status.emailError ||
        Date.now() - Date.parse(status.lastSuccess) > maxAge
    )
        process.exit(1);
} catch {
    process.exit(1);
}
