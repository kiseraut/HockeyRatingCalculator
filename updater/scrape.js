/**
 * Headless scraper for myhockeyrankings.com.
 *
 * This script fetches the rankings page, calls the underlying rankings service
 * (same one the UI uses), enriches each team with math totals, and writes the
 * data to a JSON file that can be consumed by rankings.html.
 *
 * Usage:
 *   node scrape.js                       # defaults to 2026 / v=114, all ranked teams
 *   node scrape.js --limit 50            # override number of rows
 *   node scrape.js --url "<custom-url>"  # scrape a different rankings page
 *   node scrape.js --out data.json       # change output file name
 *
 * Runs inside the persistent Chromium session managed by Docker.
 */

const fs = require("fs");

const path = require("path");

const BASE_URL = "https://myhockeyrankings.com/";
const DEFAULT_URL = `${BASE_URL}rank.php?y=2026&v=114`;
const DEFAULT_LIMIT = 10000;
const DEFAULT_OUTPUT = "rankings-data.json";
const USER_AGENT =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36";

function cleanText(fragment = "") {
    return fragment
        .replace(/<!---->/g, "")
        .replace(/<[^>]*>/g, "")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\s+/g, " ")
        .trim();
}

function parseArgs() {
    const args = process.argv.slice(2);
    const config = {
        url: DEFAULT_URL,
        limit: DEFAULT_LIMIT,
        out: DEFAULT_OUTPUT,
    };

    for (let i = 0; i < args.length; i += 1) {
        const key = args[i];
        const value = args[i + 1];
        switch (key) {
            case "--url":
                config.url = value;
                i += 1;
                break;
            case "--limit":
                config.limit = Number(value);
                i += 1;
                break;
            case "--out":
                config.out = value;
                i += 1;
                break;
            default:
                break;
        }
    }

    return config;
}

async function scrapeTopTeams(options = {}) {
    const {
        url = DEFAULT_URL,
        limit = DEFAULT_LIMIT,
        out = DEFAULT_OUTPUT,
    } = options;
    console.log(`Scraping ${url} (top ${limit}) via rankings service...`);

    const inferredSeason =
        determineSeasonFromRankingsUrl(url) ??
        new Date().getFullYear().toString();
    const division = determineDivisionFromRankingsUrl(url);
    const { html, cookies } = await fetchRankingsPage(url);
    const token = extractRankingsToken(html);
    if (!token) {
        throw new Error("Unable to locate rankings token in page markup.");
    }

    const cookieHeader = formatCookies(cookies);
    const rankingsItems = await fetchRankingsData({
        season: inferredSeason,
        division,
        token,
        referer: url,
        cookieHeader,
    });

    const teams = buildTeamsFromRankings(rankingsItems, limit, inferredSeason);
    await enrichTeams(teams, { season: inferredSeason });
    if (teams.some((team) => team.totalGames === null))
        throw new Error("Incomplete team statistics; keeping previous data.");

    if (teams.length === 0) {
        throw new Error("No teams were parsed from the rendered HTML.");
    }

    const payload = {
        source: url,
        scrapedAt: new Date().toISOString(),
        limit,
        count: teams.length,
        teams,
    };

    const targetPath = path.resolve(process.cwd(), out);
    fs.writeFileSync(targetPath, JSON.stringify(payload, null, 2), "utf-8");
    console.log(`Saved ${teams.length} rows to ${targetPath}`);

    const jsTargetPath = targetPath.match(/\.json$/i)
        ? targetPath.replace(/\.json$/i, ".js")
        : `${targetPath}.js`;
    const jsContents = `window.__RANKINGS_DATA__ = ${JSON.stringify(payload, null, 2)};\n`;
    fs.writeFileSync(jsTargetPath, jsContents, "utf-8");
    console.log(`Hydration helper written to ${jsTargetPath}`);
    return payload;
}

if (require.main === module) {
    const options = parseArgs();
    scrapeTopTeams(options).catch((err) => {
        console.error(err.message || err);
        process.exit(1);
    });
}

function resolveUrl(href) {
    if (!href) {
        return null;
    }
    try {
        const decoded = decodeEntities(href);
        return new URL(decoded, BASE_URL).toString();
    } catch {
        return null;
    }
}

function extractTeamId(href = "") {
    if (!href) {
        return null;
    }

    try {
        const candidate = new URL(href, BASE_URL);
        const fromQuery = candidate.searchParams.get("t");
        if (fromQuery) {
            return fromQuery;
        }

        const infoMatch = candidate.pathname.match(/\/team-info\/(\d+)/i);
        if (infoMatch) {
            return infoMatch[1];
        }
    } catch {
        // Ignore parse errors and fall through
    }

    const fallbackMatch = href.match(/t=(\d+)/i);
    return fallbackMatch ? fallbackMatch[1] : null;
}

function decodeEntities(str = "") {
    return str
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
}

async function fetchRankingsPage(targetUrl) {
    const response = await httpRequest(targetUrl, {
        headers: {
            Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
    });

    if (response.statusCode !== 200) {
        throw new Error(
            `Rankings page responded with HTTP ${response.statusCode}`,
        );
    }

    return {
        html: response.body,
        cookies: extractCookiesFromHeaders(response.headers["set-cookie"]),
    };
}

function extractRankingsToken(html = "") {
    const match = html.match(/MHRv5\.rankings\([\s\S]*?"token":"([^"]+)"/);
    return match ? match[1] : null;
}

async function fetchRankingsData({
    season,
    division,
    token,
    referer,
    cookieHeader,
}) {
    const params = new URLSearchParams({ y: season });
    if (division) {
        params.set("v", division);
    }
    const serviceUrl = `${BASE_URL}rank/service?${params.toString()}`;
    const headers = {
        Accept: "application/json, text/javascript, */*; q=0.01",
        "Accept-Language": "en-US,en;q=0.9",
        "X-Requested-With": "XMLHttpRequest",
        Origin: "https://myhockeyrankings.com",
        Referer: referer,
        "X-Mhr-Token": token,
        ...(cookieHeader ? { Cookie: cookieHeader } : {}),
    };

    const response = await httpRequest(serviceUrl, { headers });
    if (response.statusCode !== 200) {
        throw new Error(
            `Rankings service responded with HTTP ${response.statusCode}`,
        );
    }

    let payload;
    try {
        payload = JSON.parse(response.body);
    } catch {
        throw new Error("Unable to parse rankings service response");
    }

    if (!Array.isArray(payload)) {
        throw new Error("Unexpected rankings payload");
    }

    return payload;
}

function buildTeamsFromRankings(items, limit, season) {
    if (!Array.isArray(items) || items.length === 0) {
        return [];
    }

    return items.slice(0, limit).map((item) => {
        const teamNumber = item.team_nbr ?? item.teamNbr ?? item.teamId ?? null;
        const ranking = Number(item.ranking);
        const rating = Number(item.rating);
        return {
            rank: Number.isFinite(ranking) ? ranking : null,
            team: item.name ? cleanText(item.name) : null,
            rating: Number.isFinite(rating) ? rating : null,
            url: teamNumber
                ? `${BASE_URL}team_info.php?y=${season}&t=${teamNumber}`
                : null,
            teamID: teamNumber ? String(teamNumber) : null,
            totalGames: null,
            totalOpponentRating: null,
            totalGoalDifferential: null,
        };
    });
}

async function enrichTeams(teams, options = {}) {
    if (!Array.isArray(teams) || teams.length === 0) {
        return;
    }

    const { season = String(new Date().getFullYear()), concurrency = 1 } =
        options;
    console.log(
        `Fetching team math stats for ${teams.length} teams (season ${season})...`,
    );

    let cursor = 0;
    const workers = Array.from(
        { length: Math.min(concurrency, teams.length) || 1 },
        () => worker(),
    );

    await Promise.all(workers);

    async function worker() {
        for (;;) {
            const index = cursor;
            cursor += 1;
            if (index >= teams.length) {
                break;
            }
            await enrichSingleTeam(teams[index], season);
            await new Promise((resolve) => setTimeout(resolve, 750));
        }
    }
}

async function enrichSingleTeam(team, season) {
    if (!team) {
        return;
    }

    if (!team.teamID) {
        attachEmptyStats(team);
        return;
    }

    try {
        const totals = await fetchTeamMathTotals(team.teamID, season);
        team.totalGames = totals.totalGames;
        team.totalOpponentRating = totals.totalOpponentRating;
        team.totalGoalDifferential = totals.totalGoalDifferential;
    } catch (error) {
        throw new Error(`Stats unavailable for ${team.team ?? team.teamID}: ${error.message}`);
    }
}

function attachEmptyStats(team) {
    if (!team) {
        return;
    }
    team.totalGames = null;
    team.totalOpponentRating = null;
    team.totalGoalDifferential = null;
}

async function fetchTeamMathTotals(teamID, season) {
    const detailUrl = `${BASE_URL}team-info/${teamID}/${season}/math`;
    const detailResponse = await httpRequest(detailUrl);

    if (detailResponse.statusCode !== 200) {
        throw new Error(
            `Team page responded with HTTP ${detailResponse.statusCode}`,
        );
    }

    const config = extractTeamMathConfig(detailResponse.body);
    if (!config || !config.token) {
        throw new Error("Could not locate team math token");
    }

    const cookies = extractCookiesFromHeaders(
        detailResponse.headers["set-cookie"],
    );
    const cookieHeader = formatCookies(cookies);
    const serviceSeason = String(config.yr ?? season);
    const serviceTeamId = String(config.team_nbr ?? teamID);
    const serviceKind = config.last10 ? "last10" : "math";
    const serviceUrl = `${BASE_URL}team-info/service/${serviceSeason}/${serviceTeamId}/${serviceKind}`;

    const serviceResponse = await httpRequest(serviceUrl, {
        headers: {
            Accept: "application/json",
            Referer: detailUrl,
            "X-Mhr-Token": config.token,
            ...(cookieHeader ? { Cookie: cookieHeader } : {}),
        },
    });

    if (serviceResponse.statusCode !== 200) {
        throw new Error(
            `Team service responded with HTTP ${serviceResponse.statusCode}`,
        );
    }

    let payload;
    try {
        payload = JSON.parse(serviceResponse.body);
    } catch {
        throw new Error("Unable to parse team math response");
    }

    if (!Array.isArray(payload)) {
        const message =
            typeof payload === "object" && payload !== null
                ? payload.message
                : null;
        throw new Error(message || "Unexpected team math payload");
    }

    const totals = computeTeamMathTotals(payload, {
        teamNumber: Number(serviceTeamId),
        minGoalDiff: typeof config.min_gd === "number" ? config.min_gd : -7,
        maxGoalDiff: typeof config.max_gd === "number" ? config.max_gd : 7,
    });

    return {
        totalGames: totals.totalGames,
        totalOpponentRating: truncateDecimals(totals.totalOpponentRating, 2),
        totalGoalDifferential: truncateDecimals(
            totals.totalGoalDifferential,
            2,
        ),
    };
}

function computeTeamMathTotals(games, options = {}) {
    const skipAges = new Set(["z", "m", "n"]);
    const teamNumber = Number(options.teamNumber);
    const minGoalDiff =
        typeof options.minGoalDiff === "number" ? options.minGoalDiff : -7;
    const maxGoalDiff =
        typeof options.maxGoalDiff === "number" ? options.maxGoalDiff : 7;

    let totalGames = 0;
    let totalOpponentRating = 0;
    let totalGoalDifferential = 0;

    for (const game of games) {
        if (!game || game.kind !== "game") {
            continue;
        }

        const age = String(game.game_age ?? "")
            .trim()
            .toLowerCase();
        if (skipAges.has(age)) {
            continue;
        }

        const perspective = deriveGamePerspective(game, teamNumber);
        if (!perspective) {
            continue;
        }

        const goalDiff = clamp(
            perspective.selfScore - perspective.oppScore,
            minGoalDiff,
            maxGoalDiff,
        );
        totalGames += 1;
        totalOpponentRating += perspective.oppRating;
        totalGoalDifferential += goalDiff;
    }

    return { totalGames, totalOpponentRating, totalGoalDifferential };
}

function deriveGamePerspective(game, teamNumber) {
    const homeTeam = Number(game.game_home_team);
    const visitorTeam = Number(game.game_visitor_team);
    const target = Number(teamNumber);

    if (
        !Number.isFinite(homeTeam) ||
        !Number.isFinite(visitorTeam) ||
        !Number.isFinite(target)
    ) {
        return null;
    }

    if (homeTeam === target) {
        const selfScore = Number(game.game_home_score);
        const oppScore = Number(game.game_visitor_score);
        const oppRating = Number(game.visitor_rating);
        return Number.isFinite(selfScore) &&
            Number.isFinite(oppScore) &&
            Number.isFinite(oppRating)
            ? { selfScore, oppScore, oppRating }
            : null;
    }

    if (visitorTeam === target) {
        const selfScore = Number(game.game_visitor_score);
        const oppScore = Number(game.game_home_score);
        const oppRating = Number(game.home_rating);
        return Number.isFinite(selfScore) &&
            Number.isFinite(oppScore) &&
            Number.isFinite(oppRating)
            ? { selfScore, oppScore, oppRating }
            : null;
    }

    return null;
}

function extractTeamMathConfig(html = "") {
    const match = html.match(/MHRv5\.teamMath\([^,]+,\s*(\{[^)]+\})\)/);
    if (!match) {
        return null;
    }

    try {
        return JSON.parse(match[1]);
    } catch {
        return null;
    }
}

function determineSeasonFromRankingsUrl(rankingsUrl = "") {
    if (!rankingsUrl) {
        return null;
    }

    try {
        const parsed = new URL(rankingsUrl);
        return parsed.searchParams.get("y");
    } catch {
        return null;
    }
}

function determineDivisionFromRankingsUrl(rankingsUrl = "") {
    if (!rankingsUrl) {
        return null;
    }

    try {
        const parsed = new URL(rankingsUrl);
        return parsed.searchParams.get("v");
    } catch {
        return null;
    }
}

async function httpRequest(targetUrl, options = {}) {
    return require("./browser-session").browserRequest(targetUrl, options);
}

function extractCookiesFromHeaders(rawCookies) {
    if (!rawCookies) {
        return {};
    }

    const cookies = Array.isArray(rawCookies) ? rawCookies : [rawCookies];
    return cookies.reduce((jar, entry) => {
        if (typeof entry !== "string") {
            return jar;
        }
        const [pair] = entry.split(";");
        if (!pair) {
            return jar;
        }
        const [name, ...rest] = pair.split("=");
        if (!name || rest.length === 0) {
            return jar;
        }
        jar[name.trim()] = rest.join("=").trim();
        return jar;
    }, {});
}

function formatCookies(cookieJar = {}) {
    return Object.entries(cookieJar)
        .filter(([_, value]) => typeof value === "string" && value.length > 0)
        .map(([key, value]) => `${key}=${value}`)
        .join("; ");
}

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

function truncateDecimals(value, precision = 2) {
    if (!Number.isFinite(value)) {
        return null;
    }
    if (precision <= 0) {
        return Math.trunc(value);
    }
    const factor = 10 ** precision;
    return Math.trunc(value * factor) / factor;
}

module.exports = { scrapeTopTeams };
