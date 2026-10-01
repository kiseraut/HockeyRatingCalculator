const { sendAlert } = require("./notify");
function staleReason(payload, now = Date.now()) {
    const source = new URL(payload.source || "https://invalid.local");
    if (
        source.searchParams.get("y") !== "2026" ||
        source.searchParams.get("v") !== "114"
    )
        return "The hosted calculator still has the wrong season or division.";
    const checked = Date.parse(payload.checkedAt || payload.scrapedAt);
    if (
        !Number.isFinite(checked) ||
        now - checked > 30 * 3600000 ||
        checked - now > 300000
    )
        return `No successful published update in the last 30 hours. Last check: ${payload.checkedAt || payload.scrapedAt || "unknown"}.`;
    if (!Array.isArray(payload.teams) || !payload.teams.length)
        return "The published dataset is empty.";
    return null;
}
async function main() {
    let reason;
    try {
        const url =
            process.env.CALCULATOR_DATA_URL ||
            "https://kiseraut.github.io/HockeyRatingCalculator/rankings-data.json";
        const response = await fetch(`${url}?check=${Date.now()}`, {
            signal: AbortSignal.timeout(30000),
            cache: "no-store",
        });
        if (!response.ok)
            throw new Error(`Hosted data returned HTTP ${response.status}`);
        reason = staleReason(await response.json());
    } catch (error) {
        reason = error.message;
    }
    if (reason) {
        await sendAlert(
            "Hockey calculator: published data is overdue",
            `${reason}\n\nCheck the PC, Docker Desktop, the browser session, and GitHub publishing. This independent check runs even when your PC is off.`,
        );
        console.error(reason);
        process.exitCode = 1;
    } else console.log("Published rankings are current.");
}
module.exports = { staleReason };
if (require.main === module)
    main().catch((error) => {
        console.error(`WATCHDOG EMAIL FAILED: ${error.message}`);
        process.exitCode = 1;
    });
