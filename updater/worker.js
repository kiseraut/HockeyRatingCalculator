const fs = require("node:fs");
const path = require("node:path");
const { scrapeTopTeams } = require("./scrape");
const { publish } = require("./publish");
const { sendAlert } = require("./notify");
const { closeBrowser } = require("./browser-session");
const log = (message) => console.log(`${new Date().toISOString()} ${message}`);
function readStatus(state) {
    try {
        return JSON.parse(
            fs.readFileSync(path.join(state, "status.json"), "utf8"),
        );
    } catch {
        return {};
    }
}
function writeStatus(state, status) {
    fs.writeFileSync(
        path.join(state, "status.json.tmp"),
        JSON.stringify(status, null, 2),
    );
    fs.renameSync(
        path.join(state, "status.json.tmp"),
        path.join(state, "status.json"),
    );
}
async function deliverPending(state, mail = sendAlert) {
    const status = readStatus(state);
    if (!status.pendingAlert) return;
    try {
        await mail(status.pendingAlert.subject, status.pendingAlert.text);
        status.lastEmailAt = new Date().toISOString();
        delete status.pendingAlert;
        delete status.emailError;
    } catch (error) {
        status.emailError = error.message;
        log(`EMAIL NOT SENT: ${error.message}`);
    }
    writeStatus(state, status);
}
async function runUpdate({
    state,
    scrape = scrapeTopTeams,
    publishData = publish,
    mail = sendAlert,
    publishing = process.env.PUBLISH === "true",
}) {
    fs.mkdirSync(state, { recursive: true });
    const previous = readStatus(state);
    const attempt = new Date().toISOString();
    writeStatus(state, { ...previous, lastAttempt: attempt, running: true });
    try {
        await scrape({ out: path.join(state, "rankings-data.json") });
        if (publishing) await publishData(state);
        const success = new Date().toISOString();
        const next = {
            ...previous,
            lastAttempt: attempt,
            lastSuccess: success,
            running: false,
            ok: true,
            publishing,
            error: null,
        };
        if (publishing) next.lastPublishedAt = success;
        if (previous.ok === false)
            next.pendingAlert = {
                subject: "Hockey calculator: updates recovered",
                text: `Update succeeded at ${success}. ${publishing ? "Data was pushed to GitHub." : "Publishing is disabled; the hosted calculator was NOT updated."}`,
            };
        writeStatus(state, next);
        log(
            publishing
                ? "Rankings refreshed and pushed to GitHub."
                : "Rankings refreshed locally. WARNING: publishing is disabled.",
        );
    } catch (error) {
        const text = `The 14U rankings update failed at ${attempt}.\n\nReason: ${error.message}\nLast successful scrape/update: ${previous.lastSuccess || "Never"}\nLast successful GitHub push: ${previous.lastPublishedAt || "Never"}\n\nThe hosted calculator may be using old data.\nBrowser session: http://127.0.0.1:6080/vnc.html (on your PC)\nAfter correcting the problem, run: docker compose exec rankings-updater touch /state/retry\nLogs: docker compose logs --tail 50 rankings-updater`;
        writeStatus(state, {
            ...previous,
            lastAttempt: attempt,
            running: false,
            ok: false,
            error: error.message,
            pendingAlert: { subject: "Hockey calculator: update FAILED", text },
        });
        log(`Update failed: ${error.message}`);
    }
    await deliverPending(state, mail);
    return readStatus(state);
}
async function main() {
    const state = process.env.STATE_DIRECTORY || "/state";
    const interval = Number(process.env.UPDATE_INTERVAL_HOURS || 24);
    if (!Number.isFinite(interval) || interval < 1 || interval > 168)
        throw new Error("UPDATE_INTERVAL_HOURS must be between 1 and 168");
    let nextRun = 0;
    let nextEmail = 0;
    for (;;) {
        const retryFile = path.join(state, "retry");
        if (Date.now() >= nextRun || fs.existsSync(retryFile)) {
            if (fs.existsSync(retryFile)) fs.unlinkSync(retryFile);
            // Deadline kills a stuck browser and reports failure through the normal path.
            const scrapeWithDeadline = async (options) => {
                let timer;
                try {
                    return await Promise.race([
                        scrapeTopTeams(options),
                        new Promise((_, reject) => {
                            timer = setTimeout(() => {
                                reject(
                                    new Error(
                                        "Browser update exceeded 45 minutes",
                                    ),
                                );
                                closeBrowser().catch(() => {});
                            }, 45 * 60000);
                        }),
                    ]);
                } finally {
                    clearTimeout(timer);
                }
            };
            const result = await runUpdate({
                state,
                scrape: scrapeWithDeadline,
            });
            nextRun = Date.now() + interval * 3600000;
            nextEmail = Date.now() + 5 * 60000;
            if (process.argv.includes("--once")) {
                await closeBrowser();
                process.exitCode = result.ok && !result.emailError ? 0 : 1;
                return;
            }
        }
        if (Date.now() >= nextEmail) {
            await deliverPending(state);
            nextEmail = Date.now() + 5 * 60000;
        }
        await new Promise((resolve) => setTimeout(resolve, 5000));
    }
}
module.exports = { runUpdate, readStatus, deliverPending };
if (require.main === module) {
    for (const signal of ["SIGTERM", "SIGINT"])
        process.on(signal, async () => {
            await closeBrowser().catch(() => {});
            process.exit(0);
        });
    main().catch(async (error) => {
        console.error(error.message);
        try {
            await sendAlert(
                "Hockey calculator: updater stopped",
                error.message,
            );
        } catch (mailError) {
            console.error(`EMAIL NOT SENT: ${mailError.message}`);
        }
        await closeBrowser().catch(() => {});
        process.exit(1);
    });
}
