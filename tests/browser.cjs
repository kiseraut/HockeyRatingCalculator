const { chromium } = require("playwright");
const assert = require("node:assert/strict");
(async () => {
    const browser = await chromium.launch({
        channel: "msedge",
        headless: true,
    });
    const page = await browser.newPage({
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 1,
    });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/rankings-data.json", (route) =>
        route.fulfill({
            json: {
                source: "https://myhockeyrankings.com/rank.php?y=2025&v=125",
                teams: [],
            },
        }),
    );
    await page.goto(process.env.PREVIEW_URL || "http://localhost:4000");
    await page
        .locator("#dataStatus")
        .filter({ hasText: "unavailable" })
        .waitFor();
    assert.equal(
        await page.locator("[data-role=ratingDisplay]").innerText(),
        "—",
    );
    await page.screenshot({
        path: "artifacts/iphone-empty.png",
        fullPage: true,
    });
    // Explicit fixtures exercise the UI independently from MHR network availability.
    await page.route("**/rankings-data.json", (route) =>
        route.fulfill({
            json: {
                source: "https://myhockeyrankings.com/rank.php?y=2026&v=114",
                scrapedAt: new Date().toISOString(),
                teams: [
                    {
                        teamID: "1",
                        team: "Test Home 14U",
                        rank: 1,
                        rating: 91,
                        totalGames: 10,
                        totalGoalDifferential: 10,
                        totalOpponentRating: 900,
                    },
                    {
                        teamID: "2",
                        team: "Test Opponent 14U",
                        rank: 2,
                        rating: 90,
                        totalGames: 10,
                        totalGoalDifferential: 0,
                        totalOpponentRating: 900,
                    },
                ],
            },
        }),
    );
    await page.reload();
    await page.locator("[data-role=baselineTeam]").selectOption("1", { force: true });
    assert.equal(
        await page.locator("[data-role=ratingDisplay]").innerText(),
        "91.00",
    );
    await page.locator("[data-role=baselineTeamSearch]").fill("Opponent");
    assert.equal(
        await page.locator("[data-role=baselineTeam]").inputValue(),
        "1",
    );
    await page.locator("[data-role=baselineTeamSearch]").fill("");
    await page.locator("[data-role=addGame]").click();
    await page.locator("[data-role=goalDiff]").selectOption("3");
    assert.equal(
        await page.locator("[data-role=ratingDisplay]").innerText(),
        "91.00",
    );
    await page.locator("[data-role=teamSelect]").selectOption("2", { force: true });
    assert.equal(
        await page.locator("[data-role=ratingDisplay]").innerText(),
        "91.18",
    );
    await page.reload();
    assert.equal(
        await page.locator("[data-role=ratingDisplay]").innerText(),
        "91.18",
    );
    await page.locator("[data-role=addGame]").click();
    await page.locator("[data-role=teamSelect]").nth(1).selectOption("2", { force: true });
    await page.locator("[data-role=goalDiff]").nth(1).selectOption("-2");
    assert.equal(
        await page.locator("[data-role=ratingDisplay]").innerText(),
        "90.92",
    );
    assert.equal(
        await page.locator("[data-role=rankDisplay]").innerText(),
        "Projected rank stays at #1",
    );
    for (const width of [320, 375, 390, 430, 768, 1280]) {
        await page.setViewportSize({ width, height: 844 });
        assert.ok(
            await page.evaluate(
                () => document.documentElement.scrollWidth <= innerWidth,
            ),
            `Overflow at ${width}`,
        );
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
        path: "artifacts/iphone-scenario.png",
        fullPage: true,
    });
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.screenshot({
        path: "artifacts/desktop-scenario.png",
        fullPage: true,
    });
    await page.locator("#addTab").click();
    assert.equal(
        await page
            .locator(".session.active [data-role=ratingDisplay]")
            .innerText(),
        "—",
    );
    await page.evaluate(() => {
        window.__RANKINGS_DATA__.scrapedAt = new Date(Date.now() - (7 * 24 + 1) * 3600000).toISOString();
        updateFreshness(window.__RANKINGS_DATA__);
    });
    assert.match(await page.locator("#dataStatus").innerText(), /Updates overdue/);
    assert.ok(await page.locator("#dataStatus").evaluate(el => el.classList.contains("stale")));
    assert.deepEqual(errors, []);
    await browser.close();
    console.log(
        "Passed: mobile widths, baseline, search, incomplete game, two-game math, persistence, multiple teams, no JS errors.",
    );
})().catch((error) => {
    console.error(error);
    process.exit(1);
});
