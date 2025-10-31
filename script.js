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
 * Each game: { id, goalDiff, sched, ratingAfter, breakEvenGoal, breakEvenNote } — all numbers except note
 */
let games = [];
let nextId = 1;

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

        // Goal Diff dropdown (7..-7, positives first)
        const lblGD = document.createElement("label");
        lblGD.textContent = "Goal Differential";
        const selGD = document.createElement("select");
        selGD.dataset.role = "goalDiff";
        for (let v = 7; v >= -7; v--)
        {
            const opt = document.createElement("option");
            opt.value = String(v);
            opt.textContent = (v > 0 ? "+" : "") + v;
            if (v === Math.round(g.goalDiff))
            {
                opt.selected = true;
            }
            selGD.appendChild(opt);
        }
        selGD.addEventListener("change", onGameInput);
        lblGD.appendChild(selGD);

        // Schedule strength input (opponent ranking contribution)
        const lblSch = document.createElement("label");
        lblSch.textContent = "Opp. Ranking";
        const inpSch = document.createElement("input");
        inpSch.type = "number";
        inpSch.step = "0.01";
        inpSch.value = String(g.sched);
        inpSch.dataset.role = "sched";
        inpSch.inputMode = "decimal";
        inpSch.addEventListener("input", onGameInput);
        lblSch.appendChild(inpSch);

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
            }
        });

        row.appendChild(lblGD);
        row.appendChild(lblSch);
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

function computeBreakEvenGoal(prevGD, prevSched, prevGames, schedThisGame)
{
    const n = prevGames;
    if (n <= 0)
    {
        return { x: 0, note: "Break-even not defined (0 prior games)" };
    }

    const xStar = ((prevGD + prevSched) / n) - schedThisGame;
    let best = Math.round(xStar);

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
    // sanitize currentGoalDiff (text) before parsing
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
        // Break-even BEFORE applying this game
        const be = computeBreakEvenGoal(runningGD, runningSched, runningGames, toNum(g.sched));
        g.breakEvenGoal = be.x;
        g.breakEvenNote = be.note;

        // Apply this game
        runningGD += toNum(g.goalDiff);
        runningSched += toNum(g.sched);
        runningGames += 1;

        g.ratingAfter = computeRating(runningGD, runningSched, runningGames);
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

    if (idx >= 0 && (role === "goalDiff" || role === "sched"))
    {
        if (role === "goalDiff")
        {
            games[idx][role] = parseInt(input.value, 10);
        }
        else
        {
            games[idx][role] = toNum(input.value);
        }
        recalcAll();
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

// Baseline button — snapshot current inputs
els.setBaseline.addEventListener("click", () =>
{
    els.currentGoalDiff.value = sanitizeSignedDecimal(els.currentGoalDiff.value);
    baseline.goalDiffSum = toNum(els.currentGoalDiff.value);
    baseline.schedSum = toNum(els.currentSchedule.value);
    baseline.games = Math.max(0, Math.floor(toNum(els.currentGames.value)));
    recalcAll();
});

// Add game
els.addGame.addEventListener("click", () =>
{
    games.push(
    {
        id: nextId++,
        goalDiff: 0,
        sched: 0,
        ratingAfter: 0,
        breakEvenGoal: 0,
        breakEvenNote: ""
    });
    renderGames();
    recalcAll();
});

// ---------- Init ----------
document.addEventListener("DOMContentLoaded", () =>
{
    games = [
        { id: nextId++, goalDiff: 0, sched: 0, ratingAfter: 0, breakEvenGoal: 0, breakEvenNote: "" }
    ];

    renderGames();
    recalcAll();
});
