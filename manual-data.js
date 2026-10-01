(function (root) {
    const source = "https://myhockeyrankings.com/rank.php?y=2026&v=114";
    const key = (value) =>
        String(value)
            .toLowerCase()
            .replace(/[^a-z0-9]/g, "");
    function numeric(value) {
        const s = String(value ?? "")
            .trim()
            .replace(/,/g, "")
            .replace(/[\u2212\u2013]/g, "-");
        return /^[+-]?\d+(\.\d+)?$/.test(s) ? Number(s) : null;
    }
    function validSource(value) {
        try {
            const u = new URL(value);
            return (
                u.hostname === "myhockeyrankings.com" &&
                u.searchParams.get("y") === "2026" &&
                u.searchParams.get("v") === "114"
            );
        } catch {
            return false;
        }
    }
    function validate(payload, limit = true) {
        if (!validSource(payload?.source))
            throw new Error(
                "Use the 2026–27 USA 14U rankings page (y=2026, v=114).",
            );
        const stamp = Date.parse(payload.scrapedAt);
        if (!Number.isFinite(stamp) || stamp > Date.now() + 300000)
            throw new Error("Invalid collection date.");
        if (
            !Array.isArray(payload.teams) ||
            !payload.teams.length ||
            payload.teams.length > 10000
        )
            throw new Error("No usable teams found.");
        const ids = new Set();
        for (const team of payload.teams) {
            if (
                !team.team ||
                typeof team.team !== "string" ||
                !team.teamID ||
                ids.has(String(team.teamID))
            )
                throw new Error("Missing or duplicate team name/ID.");
            ids.add(String(team.teamID));
            if (
                !Number.isFinite(team.rating) ||
                team.rating < 0 ||
                team.rating > 150 ||
                !Number.isInteger(team.rank) ||
                team.rank < 1
            )
                throw new Error(`Invalid rank or rating for ${team.team}.`);
            for (const field of [
                "totalGames",
                "totalGoalDifferential",
                "totalOpponentRating",
            ]) {
                if (team[field] !== null && !Number.isFinite(team[field]))
                    throw new Error(`Invalid ${field} for ${team.team}.`);
            }
            if (
                team.totalGames !== null &&
                (!Number.isInteger(team.totalGames) ||
                    team.totalGames < 1 ||
                    team.totalGames > 500)
            )
                throw new Error(`Invalid games played for ${team.team}.`);
            if (
                team.totalOpponentRating !== null &&
                team.totalOpponentRating < 0
            )
                throw new Error("Opponent rating totals cannot be negative.");
        }
        // Retire earlier imports that reconstructed totals from rounded averages.
        for (const team of payload.teams) {
            if (team.estimatedTotals) {
                team.totalGames =
                    team.totalGoalDifferential =
                    team.totalOpponentRating =
                        null;
                team.statsSource = "missing";
                delete team.estimatedTotals;
            }
        }
        if (limit) {
            payload.teams = payload.teams.filter(team => team.rank <= 200);
            payload.count = payload.teams.length;
            if (!payload.count) throw new Error("No teams ranked 1�200 found.");
        }
        return payload;
    }
    function parseRows(rows, collectedAt = new Date().toISOString()) {
        const headerIndex = rows.findIndex(
            (row) =>
                row.some((c) =>
                    ["team", "teamname", "name"].includes(key(c)),
                ) && row.some((c) => key(c) === "rating"),
        );
        if (headerIndex < 0)
            throw new Error(
                "No rankings table found. Include the header row with Team and Rating.",
            );
        const headers = rows[headerIndex].map(key);
        const column = (aliases) =>
            headers.findIndex((h) => aliases.includes(h));
        const name = column(["team", "teamname", "name"]),
            rating = column(["rating"]),
            rank = column(["rank", "ranking", "rk"]);
        const agd = column([
                "agd",
                "avggoaldifferential",
                "averagegoaldifferential",
            ]),
            sched = column(["sched", "sos", "schedulestrength", "schedule"]);
        const gp = column(["gp", "games", "gamesplayed"]),
            record = column(["record", "wl t".replace(/ /g, ""), "wlt"]);
        const teams = [];
        let skipped = 0;
        for (const row of rows.slice(headerIndex + 1)) {
            if (!row.some((c) => String(c).trim())) continue;
            if (row.map(key).join("|") === headers.join("|")) continue;
            // MHR places badges such as NEW below the number in the same cell.
            const rankText = String(row[rank >= 0 ? rank : 0] ?? "").trim();
            const rankValue = numeric(rankText.split(/\r?\n/)[0]);
            if (
                !Number.isInteger(rankValue) ||
                rankValue < 1 ||
                numeric(row[rating]) === null ||
                !row[name]?.trim()
            ) {
                skipped++;
                continue;
            }
            let games = gp >= 0 ? numeric(row[gp]) : null;
            if (games === null && record >= 0) {
                const match = String(row[record]).match(
                    /^\s*(\d+)\s*[-–]\s*(\d+)\s*[-–]\s*(\d+)\s*$/,
                );
                if (match)
                    games =
                        Number(match[1]) + Number(match[2]) + Number(match[3]);
            }
            const teamName = row[name].trim();
            teams.push({
                teamID: "manual:" + encodeURIComponent(teamName.toLowerCase()),
                team: teamName,
                rank: rankValue,
                rating: numeric(row[rating]),
                totalGames: null,
                totalGoalDifferential: null,
                totalOpponentRating: null,
                statsSource: "missing",
            });
        }
        const payload = {
            source,
            scrapedAt: collectedAt,
            collectionMethod: "manual",
            coverage: "partial",
            count: teams.length,
            teams,
            skippedRows: skipped,
        };
        return validate(payload, false);
    }
    function parseAll(text) {
        const trimmed = text.trim();
        if (trimmed.startsWith("{")) {
            const data = JSON.parse(trimmed);
            if (data.format === "mhr-table-v1" || data.format === "mhr-batch-v1") {
                if (!validSource(data.source))
                    throw new Error(
                        "The collection is from a different season or division.",
                    );
                const candidates = [];
                for (const table of data.tables || []) {
                    try {
                        candidates.push(parseRows(table, data.collectedAt));
                    } catch {}
                }
                if (!candidates.length)
                    throw new Error(
                        "No readable rankings table in that file. Try copying the table with its column headings.",
                    );
                const payload = candidates.sort((a, b) => b.count - a.count)[0];
                const seen = new Set();
                for (const entry of data.teamMath || []) {
                    const team = payload.teams.find(t => key(t.team) === key(entry.teamName));
                    if (!team || seen.has(team.teamID)) throw new Error("Unmatched or duplicate Math team: " + entry.teamName);
                    if (new URL(entry.source).pathname !== `/team-info/${entry.teamId}/2026/math`) throw new Error("Math source does not match team ID.");
                    seen.add(team.teamID);
                    Object.assign(team, parseMath(JSON.stringify(entry)), { mathCollectedAt: entry.collectedAt, mhrTeamId: entry.teamId });
                }
                return validate(payload);
            }
            const payload = validate(data);
            return {
                ...payload,
                collectionMethod: "manual",
                coverage: "partial",
            };
        }
        return parseRows(trimmed.split(/\r?\n/).map((row) => row.split("\t")));
    }
    function parse(text) { return validate(parseAll(text)); }
    function parseMath(text) {
        const trimmed = text.trim();
        let tables;
        if (trimmed.startsWith("{")) {
            const data = JSON.parse(trimmed);
            const url = new URL(data.source);
            if (
                url.hostname !== "myhockeyrankings.com" ||
                !(
                    url.pathname.includes("/2026/math") ||
                    url.searchParams.get("y") === "2026"
                )
            )
                throw new Error("Use a 2026–27 team Math page.");
            tables = data.tables;
        } else tables = [trimmed.split(/\r?\n/).map((row) => row.split("\t"))];
        for (const rows of tables || []) {
            if (
                !rows.some(
                    (row) =>
                        row.some((cell) => key(cell) === "gd") &&
                        row.some((cell) => key(cell) === "opprating"),
                )
            )
                continue;
            for (const row of rows) {
                const label = row.join(" ");
                const match = label.match(/Totals\s*\(\s*(\d+)\s+games?\s*\)/i);
                const rankable = /Totals\s*\(\s*for\s+rankable\s+games\s*\)/i.test(label);
                if (!match && !rankable) continue;
                const values = row.filter((cell) => String(cell).trim() !== "");
                // Use the Totals record, never the count of displayed game rows.
                const record = String(values.at(-6) ?? "").match(/^\s*(\d+)\s*[-–−]\s*(\d+)\s*[-–−]\s*(\d+)\s*$/);
                const recordGames = record ? record.slice(1).reduce((sum, n) => sum + Number(n), 0) : null;
                const games = match ? Number(match[1]) : recordGames;
                if (match && recordGames !== null && games !== recordGames)
                    throw new Error("Math game count does not match the Totals record.");
                const gd = numeric(values.at(-4)),
                    opponent = numeric(values.at(-3)),
                    points = numeric(values.at(-2));
                if (
                    !games ||
                    !Number.isInteger(gd) ||
                    Math.abs(gd) > 7 * games ||
                    opponent === null ||
                    opponent < 0 ||
                    points === null ||
                    Math.abs(points - gd - opponent) > 0.021
                )
                    throw new Error(
                        "Math totals could not be validated. Copy the complete Rating Math table including Totals.",
                    );
                return {
                    totalGames: games,
                    totalGoalDifferential: gd,
                    totalOpponentRating: opponent,
                    statsSource: "math",
                    mathCollectedAt: new Date().toISOString(),
                };
            }
        }
        throw new Error(
            "No supported Totals row found. Include the Math table headings and totals.",
        );
    }
    root.ManualRankings = { parse, validate, validSource, parseMath };
    if (typeof module !== "undefined") module.exports = root.ManualRankings;
})(typeof window === "undefined" ? globalThis : window);
