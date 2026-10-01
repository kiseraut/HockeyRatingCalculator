const test = require("node:test");
const assert = require("node:assert/strict");
const { parse, parseMath } = require("../manual-data");
const table =
    "Rank\tTeam\tRating\tRecord\tAGD\tSCHED\n1\tExample 14U\t91.00\t6-3-1\t1.00\t90.00\n2\tOther 14U\t89.50\t4-4-2\t-0.50\t90.00";
test("copied table preserves ratings without reconstructing totals", () => {
    const p = parse(table);
    assert.equal(p.teams.length, 2);
    assert.equal(p.teams[0].totalGames, null);
    assert.equal(p.teams[0].totalOpponentRating, null);
    assert.equal(p.teams[0].totalGoalDifferential, null);
    assert.equal(p.teams[1].totalGoalDifferential, null);
    assert.equal(p.teams[0].statsSource, "missing");
    assert.equal(p.coverage, "partial");
});
test("collector file retains collection date", () => {
    const p = parse(
        JSON.stringify({
            format: "mhr-table-v1",
            source: "https://myhockeyrankings.com/rank.php?y=2026&v=114",
            collectedAt: "2026-09-30T12:00:00Z",
            tables: [table.split("\n").map((row) => row.split("\t"))],
        }),
    );
    assert.equal(p.scrapedAt, "2026-09-30T12:00:00Z");
});
test("rejects wrong season, duplicate rows, invalid numbers and empty input", () => {
    assert.throws(() => parse(""), /table/);
    assert.throws(
        () => parse(table + "\n1\tExample 14U\t91.00\t6-3-1\t1\t90"),
        /duplicate/,
    );
    assert.throws(() => parse(table.replace("91.00", "999.00")), /rating/);
    assert.throws(
        () =>
            parse(
                JSON.stringify({
                    format: "mhr-table-v1",
                    source: "https://myhockeyrankings.com/rank.php?y=2025&v=125",
                }),
            ),
        /different season/,
    );
});
test("missing averages do not invent zero totals; transferring keeps timestamp", () => {
    const p = parse("Rank\tTeam\tRating\n1\tExample\t90");
    assert.equal(p.teams[0].totalGames, null);
    assert.equal(p.teams[0].totalGoalDifferential, null);
    assert.equal(parse(JSON.stringify(p)).scrapedAt, p.scrapedAt);
});

test("MHR NEW badges do not discard the first 100 teams", () => {
    const rows = [
        ["Rank▲", "Team", "Record", "Rating", "AGD", "Sched", "Links"],
    ];
    for (let rank = 1; rank <= 130; rank++)
        rows.push([
            rank <= 100 ? `${rank}\nNEW` : String(rank),
            `Team ${rank}`,
            "6-3-1",
            "90.00",
            "1.00",
            "89.00",
            "",
        ]);
    const payload = parse(
        JSON.stringify({
            format: "mhr-table-v1",
            source: "https://myhockeyrankings.com/rank.php?y=2026&v=114",
            collectedAt: new Date().toISOString(),
            tables: [rows],
        }),
    );
    assert.equal(payload.count, 130);
    assert.equal(payload.teams[0].rank, 1);
    assert.equal(payload.teams[99].rank, 100);
    assert.equal(payload.teams[100].rank, 101);
    assert.equal(payload.skippedRows, 0);
});

test("Pittsburgh Stars screenshot totals reproduce 92.69 without rounded-average reconstruction", () => {
    const totals = parseMath(
        "Date\tOpponent\tW/L/T\tScore\tGD\tOpp Rating\tPoints\t+/-\nTotals (8 games)\t6 - 1 - 1\t30 - 21\t9\t732.55\t741.55\t0.00",
    );
    assert.equal(totals.totalGoalDifferential, 9);
    assert.equal(totals.totalOpponentRating, 732.55);
    assert.equal(totals.totalGames, 8);
    assert.equal(
        (
            (totals.totalGoalDifferential + totals.totalOpponentRating) /
            totals.totalGames
        ).toFixed(2),
        "92.69",
    );
    assert.throws(
        () =>
            parseMath(
                "Date\tOpponent\tGD\tOpp Rating\nTotals (8 games)\t9\t732.55\t999\t0",
            ),
        /validated/,
    );
});
test("previous approximate imports are invalidated", () => {
    const p = parse(table);
    Object.assign(p.teams[0], {
        estimatedTotals: true,
        totalGames: 10,
        totalGoalDifferential: 10,
        totalOpponentRating: 900,
    });
    const migrated = parse(JSON.stringify(p));
    assert.equal(migrated.teams[0].totalOpponentRating, null);
    assert.equal(migrated.teams[0].totalGames, null);
});
