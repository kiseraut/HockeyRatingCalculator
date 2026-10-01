const path = require("node:path");
const { chromium } = require("playwright");
let context;
let page;
let serviceResponse;
async function browserRequest(url, options = {}) {
    if (!context) {
        context = await chromium.launchPersistentContext(
            path.join(
                process.env.STATE_DIRECTORY || "/state",
                "browser-profile",
            ),
            {
                headless: false,
                viewport: { width: 1280, height: 900 },
                ...(process.env.BROWSER_CHANNEL
                    ? { channel: process.env.BROWSER_CHANNEL }
                    : {}),
            },
        );
        context.on("close", () => {
            context = null;
            page = null;
        });
        page = context.pages()[0] || (await context.newPage());
    }
    if (!page || page.isClosed()) page = await context.newPage();
    const target = new URL(url);
    if (target.origin !== "https://myhockeyrankings.com")
        throw new Error("Unexpected rankings origin");
    if (!options.headers?.["X-Mhr-Token"]) {
        // Observe the response requested by MHR's own page scripts. This avoids
        // replaying one-use tokens or racing the page's session initialization.
        const servicePath = target.pathname.includes("/team-info/")
            ? `/team-info/service/${target.pathname.split("/")[3]}/${target.pathname.split("/")[2]}/math`
            : "/rank/service";
        serviceResponse = page.waitForResponse(response => {
            const actual = new URL(response.url());
            return actual.origin === target.origin && actual.pathname === servicePath;
        }, {timeout:60000}).then(async response => ({
            statusCode:response.status(), headers:response.headers(), body:await response.text()
        })).catch(() => null);
        const response = await page.goto(url, {
            waitUntil: "domcontentloaded",
            timeout: 60000,
        });
        if (
            response?.headers()["cf-mitigated"] === "challenge" ||
            (await page.title()).includes("Just a moment")
        ) {
            throw new Error(
                "MHR needs browser verification. Open http://127.0.0.1:6080/vnc.html and complete the check, then request a retry.",
            );
        }
        return {
            statusCode: response?.status() || 0,
            headers: {},
            body: await page.content(),
        };
    }
    const captured = await serviceResponse;
    if (!captured) throw new Error("MHR's browser page did not load its rankings/statistics response. Inspect the browser session at http://127.0.0.1:6080/vnc.html and retry.");
    if (captured.headers["cf-mitigated"] === "challenge") throw new Error("MHR needs browser verification. Open http://127.0.0.1:6080/vnc.html, then retry.");
    return captured;
}
async function closeBrowser() {
    if (context) await context.close();
}
module.exports = { browserRequest, closeBrowser };
