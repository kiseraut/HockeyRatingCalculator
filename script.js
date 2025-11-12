// ---------- Utilities ----------
function toNum(value)
{
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
}

function fmt(n)
{
    return toNum(n).toFixed(2);
}

function sanitizeSignedDecimal(str)
{
    // Allow optional leading '-', digits, optional single decimal point, digits
    // Strip invalid chars while user types
    if (typeof str !== "string") return "";
    // Remove all but digits, '-', '.' then fix duplicates / misplaced signs
    let s = str.replace(/[^0-9\-.]/g, "");
    // Keep only first '-' at start
    s = s.replace(/(?!^)-/g, "");
    // Keep only first '.'
    const firstDot = s.indexOf(".");
    if (firstDot !== -1)
    {
        s = s.slice(0, firstDot + 1) + s.slice(firstDot + 1).replace(/\./g, "");
    }
    return s;
}

// ---------- State ----------
const els =
{
    currentRating: document.getElementById("currentRating"),
    currentGoalDiff: document.getElementById("currentGoalDiff"),
    currentSchedule: document.getElementById("currentSchedule"),
    currentGames: document.getElementById("currentGames"),
    setBaseline: document.getElementById("setBaseline"),
    addGame: document.getElementById("addGame"),
    gameList: document.getElementById("gameList"),
    ratingDisplay: document.getElementById("ratingDisplay"),
    ratingDelta: document.getElementById("ratingDelta"),
    toggleGoalDiffSign: document.getElementById("toggleGoalDiffSign")
};

const baseline =
{
    goalDiffSum: toNum(els.currentGoalDiff.value),
    schedSum: toNum(els.currentSchedule.value),
    games: Math.max(0, Math.floor(toNum(els.currentGames.value)))
};

/**
 * Each game:
 * {
 *   id,
 *   opponent,        // string (purely visual)
 *   sched,           // number or "" (blank shows in input; "" counts as 0 in math)
 *   goalDiff,        // number when chosen; null/undefined/"" means "--" and EXCLUDE from calcs
 *   ratingAfter,     // number
 *   breakEvenGoal,   // number
 *   breakEvenNote    // string
 * }
 */
let games = [];
let nextId = 1;

// ---------- Persistence (Baseline + Games) ----------
const STORAGE_BASELINE = "hockeyRanker.baseline.v1";
const STORAGE_GAMES    = "hockeyRanker.games.v1";

function saveBaselineToStorage()
{
    const obj =
    {
        rating:   toNum(els.currentRating?.value),
        goalDiff: toNum(els.currentGoalDiff?.value),
        sched:    toNum(els.currentSchedule?.value),
        games:    Math.max(0, Math.floor(toNum(els.currentGames?.value)))
    };

    try
    {
        localStorage.setItem(STORAGE_BASELINE, JSON.stringify(obj));
    }
    catch (e)
    {
        console.warn("Unable to save baseline:", e);
    }
}

function loadBaselineFromStorage()
{
    try
    {
        const raw = localStorage.getItem(STORAGE_BASELINE);
        if (!raw)
        {
            return null;
        }
        return JSON.parse(raw);
    }
    catch (e)
    {
        console.warn("Unable to load baseline:", e);
        return null;
    }
}

function applyBaselineToInputs(b)
{
    if (!b) { return; }
    if (els.currentRating)   { els.currentRating.value   = (b.rating   ?? "").toString(); }
    if (els.currentGoalDiff) { els.currentGoalDiff.value = (b.goalDiff ?? "").toString(); }
    if (els.currentSchedule) { els.currentSchedule.value = (b.sched    ?? "").toString(); }
    if (els.currentGames)    { els.currentGames.value    = (b.games    ?? "").toString(); }
}

function saveGamesToStorage(list)
{
    try
    {
        localStorage.setItem(STORAGE_GAMES, JSON.stringify(Array.isArray(list) ? list : []));
    }
    catch (e)
    {
        console.warn("Unable to save games:", e);
    }
}

function loadGamesFromStorage()
{
    try
    {
        const raw = localStorage.getItem(STORAGE_GAMES);
        if (!raw)
        {
            return [];
        }
        return JSON.parse(raw);
    }
    catch (e)
    {
        console.warn("Unable to load games:", e);
        return [];
    }
}

// ---------- Rendering ----------
function renderGames()
{
    els.gameList.innerHTML = "";

    games.forEach((g, index) =>
    {
        const wrapper = document.createElement("div");
        wrapper.className = "game";
        wrapper.dataset.id = String(g.id);

        const row = document.createElement("div");
        row.className = "row";

        // Opponent name (NEW, first)
        const lblOpp = document.createElement("label");
        lblOpp.textContent = "Opponent";
        const inpOpp = document.createElement("input");
        inpOpp.type = "text";
        inpOpp.placeholder = "Name";
        inpOpp.value = g.opponent ?? "";
        inpOpp.dataset.role = "opponent";
        inpOpp.addEventListener("input", onGameInput);
        lblOpp.appendChild(inpOpp);

        // Opp. Ranking (second) — starts BLANK (not 0)
        const lblSch = document.createElement("label");
        lblSch.textContent = "Opp. Ranking";
        const inpSch = document.createElement("input");
        inpSch.type = "number";
        inpSch.step = "0.01";
        inpSch.inputMode = "decimal";
        inpSch.placeholder = "Rank";
        // if stored as "" keep it blank; otherwise show the number
        inpSch.value = (g.sched === "" || g.sched === null || g.sched === undefined) ? "" : String(g.sched);
        inpSch.dataset.role = "sched";
        inpSch.addEventListener("input", onGameInput);
        lblSch.appendChild(inpSch);

        // Goal Diff dropdown (third) with top "--" that EXCLUDES from calcs by default
        const lblGD = document.createElement("label");
        lblGD.textContent = "Goal Differential";
        const selGD = document.createElement("select");
        selGD.dataset.role = "goalDiff";

        // Top sentinel option
        const optNone = document.createElement("option");
        optNone.value = "";
        optNone.textContent = "--";
        selGD.appendChild(optNone);

        // Then numeric options 7..-7
        for (let v = 7; v >= -7; v--)
        {
            const opt = document.createElement("option");
            opt.value = String(v);
            opt.textContent = (v > 0 ? "+" : "") + v;
            selGD.appendChild(opt);
        }

        // Select current value (blank if null/undefined/"")
        if (typeof g.goalDiff === "number" && Number.isFinite(g.goalDiff))
        {
            selGD.value = String(Math.round(g.goalDiff));
        }
        else
        {
            selGD.value = ""; // "--" selected
        }

        selGD.addEventListener("change", onGameInput);
        lblGD.appendChild(selGD);

        // After rating
        const after = document.createElement("div");
        after.className = "after";
        after.innerHTML = `Rating after game ${index + 1}: <span class="val">${fmt(g.ratingAfter)}</span>`;

        // Break-even line
        const be = document.createElement("div");
        be.className = "muted small breakeven";
        be.textContent = g.breakEvenNote || "";
        
        // Remove button
        const removeBtn = document.createElement("button");
        removeBtn.className = "btn";
        removeBtn.textContent = "Remove";
        removeBtn.addEventListener("click", () =>
        {
            const idx = games.findIndex(x => x.id === g.id);
            if (idx !== -1)
            {
                games.splice(idx, 1);
                renderGames();
                recalcAll();
                saveGamesToStorage(games);
            }
        });

        // New order: Opponent -> Opp. Ranking -> Goal Differential -> After/Remove
        row.appendChild(lblOpp);
        row.appendChild(lblSch);
        row.appendChild(lblGD);
        row.appendChild(after);
        row.appendChild(removeBtn);

        wrapper.appendChild(row);
        wrapper.appendChild(be);
        els.gameList.appendChild(wrapper);
    });
}

// ---------- Calculations ----------
function computeRating(goalDiffSum, schedSum, gamesCount)
{
    if (gamesCount <= 0)
    {
        return 0;
    }

    const avgGD = goalDiffSum / gamesCount;
    const avgSched = schedSum / gamesCount;
    return avgGD + avgSched;
}

function computeBreakEvenGoal(prevGD, prevSched, prevGames, schedThisGame, targetRating)
{
    const n = prevGames;
    if (n <= 0)
    {
        return { x: 0, note: "Break-even not defined (0 prior games)" };
    }

    const desiredTotal = targetRating * (n + 1);
    const currentWithoutGoal = prevGD + prevSched + schedThisGame;
    const xStar = desiredTotal - currentWithoutGoal;
    const best = Math.ceil(xStar);

    let note;
    if (best > 0)
    {
        note = `Break-even ≈ win by ${best}`;
    }
    else if (best < 0)
    {
        note = `Break-even ≈ can lose by ${Math.abs(best)}`;
    }
    else
    {
        note = "Break-even ≈ tie";
    }

    return { x: best, note };
}

function recalcAll()
{
    // Baseline (current inputs)
    els.currentGoalDiff.value = sanitizeSignedDecimal(els.currentGoalDiff.value);
    const baseGD = toNum(els.currentGoalDiff.value);
    const baseSched = toNum(els.currentSchedule.value);
    const baseGames = Math.max(0, Math.floor(toNum(els.currentGames.value)));
    const baselineRating = computeRating(baseGD, baseSched, baseGames);

    // Running totals
    let runningGD = baseGD;
    let runningSched = baseSched;
    let runningGames = baseGames;

    games.forEach((g) =>
    {
        const hasSchedInput = !(g.sched === "" || g.sched === null || typeof g.sched === "undefined");
        const schedVal = hasSchedInput ? toNum(g.sched) : 0;
        // Include only if goalDiff is a chosen number (not "--")
        const hasGD = (typeof g.goalDiff === "number") && Number.isFinite(g.goalDiff);

        if (hasSchedInput)
        {
            // Break-even BEFORE applying this included game
            const be = computeBreakEvenGoal(runningGD, runningSched, runningGames, schedVal, baselineRating);
            g.breakEvenGoal = be.x;
            g.breakEvenNote = be.note;
        }
        else
        {
            g.breakEvenGoal = null;
            g.breakEvenNote = "";
        }

        if (hasGD)
        {
            // Apply this game
            runningGD += toNum(g.goalDiff);
            runningSched += schedVal;
            runningGames += 1;

            g.ratingAfter = computeRating(runningGD, runningSched, runningGames);
        }
        else
        {
            // Game not yet applied: keep running totals as-is
            g.ratingAfter = computeRating(runningGD, runningSched, runningGames);
        }
    });

    // Final rating vs baseline
    const finalRating = games.length > 0
        ? games[games.length - 1].ratingAfter
        : baselineRating;

    const delta = finalRating - baselineRating;

    // Update main display with sign/color
    els.ratingDisplay.textContent = fmt(finalRating);
    els.ratingDisplay.classList.toggle("positive", delta > 0.00001);
    els.ratingDisplay.classList.toggle("negative", delta < -0.00001);

    const sign = delta > 0 ? "+" : (delta < 0 ? "−" : "±");
    document.getElementById("ratingDelta").textContent = `${sign}${fmt(Math.abs(delta))} vs current`;

    // Update per-game DOM bits
    Array.from(els.gameList.querySelectorAll(".game")).forEach((node, i) =>
    {
        const span = node.querySelector(".val");
        if (span)
        {
            span.textContent = fmt(games[i].ratingAfter);
        }

        const be = node.querySelector(".breakeven");
        if (be)
        {
            be.textContent = games[i].breakEvenNote || "";
        }
    });
}

// ---------- Event Handlers ----------
function onGameInput(ev)
{
    const input = ev.target;
    const role = input.dataset.role;
    const wrapper = input.closest(".game");
    const id = Number(wrapper?.dataset.id);
    const idx = games.findIndex(x => x.id === id);

    if (idx < 0)
    {
        return;
    }

    if (role === "opponent")
    {
        games[idx].opponent = input.value;
        saveGamesToStorage(games);
        // no recalc needed (visual only)
        return;
    }

    if (role === "sched")
    {
        // keep blank visually if empty; treat as 0 in math
        const s = String(input.value ?? "").trim();
        games[idx].sched = (s === "") ? "" : toNum(s);
        recalcAll();
        saveGamesToStorage(games);
        return;
    }

    if (role === "goalDiff")
    {
        // "" => EXCLUDE ("--"), else numeric
        const s = String(input.value ?? "");
        if (s === "")
        {
            games[idx].goalDiff = null;
        }
        else
        {
            games[idx].goalDiff = parseInt(s, 10);
        }
        recalcAll();
        saveGamesToStorage(games);
        return;
    }
}

// Baseline control: sanitize on input for currentGoalDiff (text)
els.currentGoalDiff.addEventListener("input", () =>
{
    const pos = els.currentGoalDiff.selectionStart;
    els.currentGoalDiff.value = sanitizeSignedDecimal(els.currentGoalDiff.value);
    // try to preserve caret position (best-effort)
    try
    {
        els.currentGoalDiff.setSelectionRange(pos, pos);
    }
    catch (e) {}
    recalcAll();
});

// Toggle +/- for currentGoalDiff
els.toggleGoalDiffSign.addEventListener("click", () =>
{
    const v = toNum(els.currentGoalDiff.value);
    const flipped = -v;
    els.currentGoalDiff.value = String(flipped);
    recalcAll();
});

// Baseline button — snapshot current inputs (and persist)
els.setBaseline.addEventListener("click", () =>
{
    els.currentGoalDiff.value = sanitizeSignedDecimal(els.currentGoalDiff.value);

    baseline.goalDiffSum = toNum(els.currentGoalDiff.value);
    baseline.schedSum    = toNum(els.currentSchedule.value);
    baseline.games       = Math.max(0, Math.floor(toNum(els.currentGames.value)));

    saveBaselineToStorage();
    recalcAll();
});

// Add game (and persist)
// New row defaults: opponent "", sched "", goalDiff null (--> "--" by default)
els.addGame.addEventListener("click", () =>
{
    games.push(
    {
        id: nextId++,
        opponent: "",
        sched: "",
        goalDiff: null,
        ratingAfter: 0,
        breakEvenGoal: 0,
        breakEvenNote: ""
    });
    renderGames();
    recalcAll();
    saveGamesToStorage(games);
});

// ---------- Init ----------
document.addEventListener("DOMContentLoaded", () =>
{
    // 1) Load baseline and apply
    const savedBaseline = loadBaselineFromStorage();
    if (savedBaseline)
    {
        applyBaselineToInputs(savedBaseline);
    }

    // 2) Load games; seed if empty
    const savedGames = loadGamesFromStorage();
    if (Array.isArray(savedGames) && savedGames.length > 0)
    {
        // Back-compat: ensure new fields exist
        games = savedGames.map(g =>
        {
            return {
                id: g.id,
                opponent: g.opponent ?? "",
                sched: (g.sched === 0 && String(g.schedRaw) === "") ? "" : (g.sched ?? ""), // be forgiving
                goalDiff: (typeof g.goalDiff === "number" && Number.isFinite(g.goalDiff)) ? g.goalDiff : null,
                ratingAfter: g.ratingAfter ?? 0,
                breakEvenGoal: g.breakEvenGoal ?? 0,
                breakEvenNote: g.breakEvenNote ?? ""
            };
        });

        // Rebuild nextId to avoid collisions after refresh
        const maxId = games.reduce((m, g) => Math.max(m, Number(g.id) || 0), 0);
        nextId = Math.max(1, maxId + 1);
    }
    else
    {
        games = [
            { id: nextId++, opponent: "", sched: "", goalDiff: null, ratingAfter: 0, breakEvenGoal: 0, breakEvenNote: "" }
        ];
    }

    renderGames();
    recalcAll();
});
