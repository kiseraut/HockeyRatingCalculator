// Allman indentation style
// Requires: npm i cheerio node-fetch@3
import fetch from "node-fetch";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import cheerio from "cheerio";

const YEAR = process.env.MHR_YEAR || "2025";
const DIV  = process.env.MHR_DIV  || "125";  // your v= value
const MAX_PAGES = 20;
const OUT_FILE = path.join(process.cwd(), "data", "mhr.json");

function toNumber(text)
{
    const m = String(text).replace(/[, ]+/g, "").match(/-?\d+(\.\d+)?/);
    return m ? parseFloat(m[0]) : NaN;
}

function strip(html)
{
    return String(html)
        .replace(/<[^>]*>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function unique(arr)
{
    return Array.from(new Set(arr));
}

function sameRankingFamily(url, y, v)
{
    try
    {
        const u = new URL(url);
        return u.pathname.endsWith("/rank.php") && u.searchParams.get("y") === y && u.searchParams.get("v") === v;
    }
    catch
    {
        return false;
    }
}

async function fetchHtml(url)
{
    const res = await fetch(url,
    {
        headers:
        {
            "User-Agent": "HockeyRanker-GH-Action/1.0"
        }
    });
    if (!res.ok)
    {
        throw new Error(`Fetch failed ${res.status} for ${url}`);
    }
    return await res.text();
}

function parseRatingsFromHtml(html)
{
    const $ = cheerio.load(html);

    // Find a table whose header has a TH containing “Rating”
    let ratings = [];
    $("table").each((_, table) =>
    {
        const thTexts = $(table).find("thead th, tr th").map((i, th) => $(th).text().trim().toLowerCase()).get();
        const ratingCol = thTexts.findIndex(t => /rating/.test(t));
        if (ratingCol === -1)
        {
            return;
        }

        $(table).find("tbody tr, tr").each((i, tr) =>
        {
            const tds = $(tr).find("td");
            if (tds.length && ratingCol < tds.length)
            {
                const val = toNumber($(tds[ratingCol]).text());
                if (Number.isFinite(val))
                {
                    ratings.push(val);
                }
            }
        });

        if (ratings.length > 0)
        {
            return false; // break out once we parsed a plausible ratings table
        }
    });

    return ratings;
}

function discoverPageLinks(html, y, v, baseUrl)
{
    const $ = cheerio.load(html);
    const links = $("a[href]").map((_, a) => $(a).attr("href")).get()
        .filter(Boolean)
        .map(h => new URL(h, baseUrl).href)
        .filter(href => sameRankingFamily(href, y, v));
    return unique(links);
}

async function main()
{
    const base = `https://www.myhockeyrankings.com/rank.php?y=${YEAR}&v=${DIV}`;
    let allRatings = [];

    const baseHtml = await fetchHtml(base);
    allRatings.push(...parseRatingsFromHtml(baseHtml));

    const pageLinks = discoverPageLinks(baseHtml, YEAR, DIV, base);
    const pages = unique([base, ...pageLinks]).slice(0, MAX_PAGES);

    for (const url of pages)
    {
        if (url === base)
        {
            continue;
        }
        try
        {
            const html = await fetchHtml(url);
            allRatings.push(...parseRatingsFromHtml(html));
        }
        catch (e)
        {
            console.warn("Skipping page due to fetch/parse error:", url, e.message);
        }
    }

    // Clean + sort (desc)
    allRatings = allRatings.filter(Number.isFinite).sort((a, b) => b - a);

    const payload =
    {
        updatedAtUtc: new Date().toISOString(),
        y: YEAR,
        v: DIV,
        ratings: allRatings
    };

    await fs.mkdir(path.dirname(OUT_FILE), { recursive: true });
    await fs.writeFile(OUT_FILE, JSON.stringify(payload, null, 2), "utf8");
    console.log(`Wrote ${allRatings.length} ratings to ${OUT_FILE}`);
}

main().catch(err =>
{
    console.error(err);
    process.exit(1);
});
