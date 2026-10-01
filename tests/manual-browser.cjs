const { chromium } = require("playwright");
const assert = require("node:assert/strict");
(async () => {
    const browser = await chromium.launch({
        channel: "msedge",
        headless: true,
    });
    try {
        const page = await browser.newPage({
            viewport: { width: 390, height: 844 },
        });
        await page.goto("http://127.0.0.1:4001");
        await page.locator("#manualImport[open]").waitFor();
        await page
            .locator("#importText")
            .fill(
                "Rank\tTeam\tRating\tRecord\tAGD\tSCHED\n1\tExample 14U\t91.00\t6-3-1\t1.00\t90.00\n2\tOther 14U\t89.50\t4-4-2\t-0.50\t90.00",
            );
        await page.locator("#previewImport").click();
        assert.match(
            await page.locator("#importMessage").innerText(),
            /2 teams found/,
        );
        await page.locator("#confirmSeason").check();
        await page.locator("#applyImport").click();
        await page
            .locator("[data-role=baselineTeam]")
            .selectOption({ label: "[1] Example 14U" }, { force: true });
        assert.equal(
            await page.locator("[data-role=ratingDisplay]").innerText(),
            "—",
        );
        await page.locator(".math-import summary").click();
        await page
            .locator('[data-role="mathText"]')
            .fill(
                "Date\tOpponent\tW/L/T\tScore\tGD\tOpp Rating\tPoints\t+/-\nTotals (10 games)\t6-3-1\t30-20\t10\t900\t910\t0",
            );
        await page.locator('[data-role="applyMath"]').click();
        assert.equal(
            await page.locator("[data-role=ratingDisplay]").innerText(),
            "91.00",
        );
        assert.match(
            await page.locator("[data-role=rankDisplay]").innerText(),
            /not a national rank/,
        );
        await page.reload();
        assert.equal(
            await page.locator("[data-role=ratingDisplay]").innerText(),
            "91.00",
        );
        assert.match(
            await page.locator("#dataStatus").innerText(),
            /Collected/,
        );
        await page.locator("#manualImport summary").first().click();
        const download = page.waitForEvent("download");
        await page.locator("#exportImport").click();
        assert.equal(
            (await download).suggestedFilename(),
            "rankings-data.json",
        );
        await page.locator("#importText").fill("invalid");
        await page.locator("#previewImport").click();
        assert.ok(await page.locator("#applyImport").isDisabled());
        for (const width of [320, 390, 1280]) {
            await page.setViewportSize({ width, height: 844 });
            assert.ok(
                await page.evaluate(
                    () => document.documentElement.scrollWidth <= innerWidth,
                ),
            );
        }
        await page.setViewportSize({ width: 390, height: 844 });
        await page.screenshot({
            path: "artifacts/manual-import.png",
            fullPage: true,
        });
        const bookmark = await page
            .locator("#collectorLink")
            .getAttribute("href");
        const collectedPage = await browser.newPage();
        await collectedPage.route("**/*", (route) =>
            route.fulfill({
                contentType: "text/html",
                body: "<table><tr><th>Rank</th><th>Team</th><th>Rating</th><th>Record</th><th>AGD</th><th>SCHED</th></tr><tr><td>1</td><td>Collected Example</td><td>91</td><td>6-3-1</td><td>1</td><td>90</td></tr></table>",
            }),
        );
        await collectedPage.goto(
            "https://myhockeyrankings.com/rank.php?y=2026&v=114",
        );
        const saved = collectedPage.waitForEvent("download");
        await collectedPage.evaluate(
            (code) => (0, eval)(code.slice("javascript:".length)),
            bookmark,
        );
        const collection = JSON.parse(
            require("node:fs").readFileSync(await (await saved).path(), "utf8"),
        );
        const parsed = require("../manual-data").parse(
            JSON.stringify(collection),
        );
        assert.equal(parsed.teams[0].team, "Collected Example");
        assert.equal(parsed.teams[0].totalGames, null);
        console.log(
            "Passed: manual import preview, validation, exact Math totals, partial ranks, persistence, export and mobile layout.",
        );
    } finally {
        await browser.close();
    }
})().catch((e) => {
    console.error(e);
    process.exitCode = 1;
});
