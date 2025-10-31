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
    logList: document.getElementById("logList")
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

        // Goal Diff dropdown (-7..7)
        const lblGD = document.createElement("label");
        lblGD.textContent = "Goal Differential";
        const selGD = document.createElement("select");
        selGD.dataset.role = "goalDiff";
        for (let v = -7; v <= 7; v++)
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
        lblSch.textContent = "Opp. Ranking (sched contrib)";
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
                log(`Removed game ${index + 1}`);
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

function log(text)
{
    const div = document.createElement("div");
    div.className = "log-entry";
    div.textContent = `[${new Date().toLocaleTimeString()}] ${text}`;
    els.logList.appendChild(div);
    els.logList.scrollTop = els.logList.scrollHeight;
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
    // If no previous games, use current baseline counts
    const n = prevGames;
    if (n <= 0)
    {
        return { x: 0, note: "Break-even not defined (0 prior games)" };
    }

    // Ideal real-valued x* that keeps rating unchanged after this game:
    // x* = ( (prevGD + prevSched) / n ) - schedThisGame
    const xStar = ((prevGD + prevSched) / n) - schedThisGame;

    // Snap to nearest whole number goal differential
    let best = Math.round(xStar);

    // Build a human-friendly note
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
    // Start from the current baseline inputs each time
    const baseGD = toNum(els.currentGoalDiff.value);
    const baseSched = toNum(els.currentSchedule.value);
    const baseGames = Math.max(0, Math.floor(toNum(els.currentGames.value)));

    let runningGD = baseGD;
    let runningSched = baseSched;
    let runningGames = baseGames;

    games.forEach((g) =>
    {
        // Compute break-even BEFORE applying this game's values
        const be = computeBreakEvenGoal(runningGD, runningSched, runningGames, toNum(g.sched));
        g.breakEvenGoal = be.x;
        g.breakEvenNote = be.note;

        // Now apply this game and compute ratingAfter
        runningGD += toNum(g.goalDiff);
        runningSched += toNum(g.sched);
        runningGames += 1;

        g.ratingAfter = computeRating(runningGD, runningSched, runningGames);
    });

    // Update overall display as rating after last game (or baseline if none)
    const finalRating = games.length > 0
        ? games[games.length - 1].ratingAfter
        : computeRating(baseGD, baseSched, baseGames);

    els.ratingDisplay.textContent = fmt(finalRating);

    // Update the per-game DOM (ratings + break-even note)
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
        recalcAll(); // cascades to all subsequent games
    }
}

// Baseline button — saves current inputs as baseline (informational)
els.setBaseline.addEventListener("click", () =>
{
    baseline.goalDiffSum = toNum(els.currentGoalDiff.value);
    baseline.schedSum = toNum(els.currentSchedule.value);
    baseline.games = Math.max(0, Math.floor(toNum(els.currentGames.value)));
    log(`Baseline set — GD=${fmt(baseline.goalDiffSum)}, Sched=${fmt(baseline.schedSum)}, Games=${baseline.games}`);
    recalcAll();
});

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
