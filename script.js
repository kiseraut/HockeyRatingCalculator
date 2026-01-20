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

// ---------- Team Data (from rankings-data.json) ----------
const CUSTOM_TEAM_ID = "__custom";

const teamData =
{
    teams: [],
    map: new Map(),
    ready: false,
    error: false
};

function getTeamById(id)
{
    if (!id)
    {
        return null;
    }
    return teamData.map.get(String(id)) || null;
}

function formatTeamOptionLabel(team)
{
    const rank = Number(team.rank);
    const name = team.team || "Team";
    return Number.isFinite(rank) ? `[${rank}] ${name}` : name;
}

function buildTeamOptions(select, selectedValue = "", placeholderText = "Select team")
{
    if (!select)
    {
        return;
    }
    select.dataset.placeholderText = placeholderText;
    const filterQuery = (select.dataset.filterQuery || "").toLowerCase();

    const previousValue = selectedValue ?? select.value ?? CUSTOM_TEAM_ID;
    select.innerHTML = "";

    const customOpt = document.createElement("option");
    customOpt.value = CUSTOM_TEAM_ID;
    customOpt.textContent = "Custom";
    select.appendChild(customOpt);

    if (!teamData.ready)
    {
        const loading = document.createElement("option");
        loading.value = "";
        loading.textContent = teamData.error ? "Unable to load teams" : "Loading teams...";
        select.appendChild(loading);
    }

    if (teamData.ready)
    {
        teamData.teams.forEach((team) =>
        {
            const id = String(team.teamID ?? team.teamId ?? "");
            if (!id)
            {
                return;
            }
            const opt = document.createElement("option");
            opt.value = id;
            const label = formatTeamOptionLabel(team);
            if (filterQuery && !label.toLowerCase().includes(filterQuery))
            {
                return;
            }
            opt.textContent = label;
            select.appendChild(opt);
        });
    }

    const desired = selectedValue ?? previousValue ?? CUSTOM_TEAM_ID;
    select.value = desired || CUSTOM_TEAM_ID;
    select.dataset.lastValue = select.value;
}

function attachTeamSearch(select, input, placeholderText = "Select team")
{
    if (!select || !input)
    {
        return;
    }
    const handler = () =>
    {
        select.dataset.filterQuery = input.value.trim().toLowerCase();
        buildTeamOptions(select, select.value, placeholderText);
    };
    input.value = select.dataset.filterQuery || "";
    input.addEventListener("input", handler);
    buildTeamOptions(select, select.value, placeholderText);
}

// ---------- Storage ----------
const STORAGE_SESSIONS = "hockeyRanker.sessions.v1";
const LEGACY_BASELINE = "hockeyRanker.baseline.v1";
const LEGACY_GAMES = "hockeyRanker.games.v1";

function safeParseJson(raw, fallback = null)
{
    try
    {
        return JSON.parse(raw);
    }
    catch (e)
    {
        return fallback;
    }
}

function loadSessionsFromStorage()
{
    try
    {
        const raw = localStorage.getItem(STORAGE_SESSIONS);
        if (!raw)
        {
            return null;
        }
        return safeParseJson(raw, null);
    }
    catch (e)
    {
        console.warn("Unable to load sessions:", e);
        return null;
    }
}

function saveSessionsToStorage(state)
{
    try
    {
        localStorage.setItem(STORAGE_SESSIONS, JSON.stringify(state));
    }
    catch (e)
    {
        console.warn("Unable to save sessions:", e);
    }
}

function loadLegacySessionData()
{
    const baselineRaw = localStorage.getItem(LEGACY_BASELINE);
    const gamesRaw = localStorage.getItem(LEGACY_GAMES);
    if (!baselineRaw && !gamesRaw)
    {
        return null;
    }

    const baseline = safeParseJson(baselineRaw, null);
    const games = safeParseJson(gamesRaw, []);
    return {
        baseline,
        games
    };
}

// ---------- Session Helpers ----------
function getSessionElements(root)
{
    return {
        sessionName: root.querySelector('[data-role="sessionName"]'),
        removeSession: root.querySelector('[data-role="removeSession"]'),
        baselineTeam: root.querySelector('[data-role="baselineTeam"]'),
        baselineTeamSearch: root.querySelector('[data-role="baselineTeamSearch"]'),
        currentRating: root.querySelector('[data-role="currentRating"]'),
        currentGoalDiff: root.querySelector('[data-role="currentGoalDiff"]'),
        currentSchedule: root.querySelector('[data-role="currentSchedule"]'),
        currentGames: root.querySelector('[data-role="currentGames"]'),
        addGame: root.querySelector('[data-role="addGame"]'),
        gameList: root.querySelector('[data-role="gameList"]'),
        ratingDisplay: root.querySelector('[data-role="ratingDisplay"]'),
        ratingDelta: root.querySelector('[data-role="ratingDelta"]'),
        rankDisplay: root.querySelector('[data-role="rankDisplay"]'),
        toggleGoalDiffSign: root.querySelector('[data-role="toggleGoalDiffSign"]')
    };
}

function normalizeBaselineValue(value)
{
    if (value === null || typeof value === "undefined")
    {
        return "";
    }
    return String(value);
}

function deriveSessionNameFromBaseline(select, fallback)
{
    if (!select)
    {
        return fallback;
    }
    const value = select.value || CUSTOM_TEAM_ID;
    if (value === CUSTOM_TEAM_ID)
    {
        return "Custom Team";
    }
    const option = select.options[select.selectedIndex];
    if (!option)
    {
        return fallback;
    }
    const label = (option.textContent || "").trim();
    if (!label || label.toLowerCase().includes("loading"))
    {
        return fallback;
    }
    return label;
}

function createDefaultGame(id)
{
    return {
        id,
        teamId: CUSTOM_TEAM_ID,
        sched: "",
        goalDiff: null,
        ratingAfter: 0,
        breakEvenGoal: 0,
        breakEvenNote: "",
        expectedGoal: 0,
        expectedNote: ""
    };
}

// ---------- Session Controller ----------
function SessionController(root, data, manager)
{
    this.root = root;
    this.manager = manager;
    this.id = data.id;
    this.name = data.name;
    this.baselineTeamSelection = data?.baseline?.teamId ?? CUSTOM_TEAM_ID;
    this.els = getSessionElements(root);
    this.games = [];
    this.nextId = Number(data.nextId) || 1;

    this.applyBaselineToInputs(data.baseline);
    this.loadGames(data.games);
    this.attachEvents();
    this.updateSessionName(this.name);
}

SessionController.prototype.attachEvents = function()
{
    attachTeamSearch(this.els.baselineTeam, this.els.baselineTeamSearch, "Select baseline team");

    if (this.els.baselineTeam)
    {
        const baselineHandler = (force = false) => this.handleBaselineTeamSelection(force);
        this.els.baselineTeam.addEventListener("change", () => baselineHandler(true));
        this.els.baselineTeam.addEventListener("click", () =>
        {
            if (this.els.baselineTeam.value === (this.els.baselineTeam.dataset.lastValue || ""))
            {
                baselineHandler(true);
            }
        });
    }

    if (this.els.currentGoalDiff)
    {
        this.els.currentGoalDiff.addEventListener("input", () =>
        {
            const pos = this.els.currentGoalDiff.selectionStart;
            this.els.currentGoalDiff.value = sanitizeSignedDecimal(this.els.currentGoalDiff.value);
            try
            {
                this.els.currentGoalDiff.setSelectionRange(pos, pos);
            }
            catch (e) {}
            this.recalcAll();
            this.manager.saveAll();
        });
    }

    if (this.els.currentRating)
    {
        this.els.currentRating.addEventListener("input", () =>
        {
            this.recalcAll();
            this.manager.saveAll();
        });
    }

    if (this.els.currentSchedule)
    {
        this.els.currentSchedule.addEventListener("input", () =>
        {
            this.recalcAll();
            this.manager.saveAll();
        });
    }

    if (this.els.currentGames)
    {
        this.els.currentGames.addEventListener("input", () =>
        {
            this.recalcAll();
            this.manager.saveAll();
        });
    }

    if (this.els.toggleGoalDiffSign)
    {
        this.els.toggleGoalDiffSign.addEventListener("click", () =>
        {
            const v = toNum(this.els.currentGoalDiff.value);
            const flipped = -v;
            this.els.currentGoalDiff.value = String(flipped);
            this.recalcAll();
            this.manager.saveAll();
        });
    }

    if (this.els.addGame)
    {
        this.els.addGame.addEventListener("click", () =>
        {
            this.games.push(createDefaultGame(this.nextId++));
            this.renderGames();
            this.recalcAll();
            this.manager.saveAll();
        });
    }


    if (this.els.removeSession)
    {
        this.els.removeSession.addEventListener("click", () =>
        {
            this.manager.removeSession(this.id);
        });
    }
};

SessionController.prototype.updateSessionName = function(name)
{
    const nextName = name || this.name || "Team Session";
    this.name = nextName;
    if (this.els.sessionName)
    {
        this.els.sessionName.textContent = nextName;
    }
    this.manager.updateTabLabel(this.id, nextName);
};

SessionController.prototype.refreshTeamData = function()
{
    buildTeamOptions(this.els.baselineTeam, this.baselineTeamSelection, "Select baseline team");
    this.renderGames();
    this.recalcAll();
    const nextName = deriveSessionNameFromBaseline(this.els.baselineTeam, this.name);
    if (nextName && nextName !== this.name)
    {
        this.updateSessionName(nextName);
    }
};

SessionController.prototype.getBaselineState = function()
{
    return {
        rating: normalizeBaselineValue(this.els.currentRating?.value),
        goalDiff: normalizeBaselineValue(this.els.currentGoalDiff?.value),
        sched: normalizeBaselineValue(this.els.currentSchedule?.value),
        games: normalizeBaselineValue(this.els.currentGames?.value),
        teamId: this.els.baselineTeam?.value || this.baselineTeamSelection || CUSTOM_TEAM_ID
    };
};

SessionController.prototype.applyBaselineToInputs = function(baseline)
{
    if (baseline && typeof baseline === "object")
    {
        if (this.els.currentRating)   { this.els.currentRating.value = normalizeBaselineValue(baseline.rating); }
        if (this.els.currentGoalDiff) { this.els.currentGoalDiff.value = normalizeBaselineValue(baseline.goalDiff); }
        if (this.els.currentSchedule) { this.els.currentSchedule.value = normalizeBaselineValue(baseline.sched); }
        if (this.els.currentGames)    { this.els.currentGames.value = normalizeBaselineValue(baseline.games); }
        this.baselineTeamSelection = baseline.teamId || this.baselineTeamSelection || CUSTOM_TEAM_ID;
    }
    else
    {
        this.baselineTeamSelection = this.baselineTeamSelection || CUSTOM_TEAM_ID;
    }

    buildTeamOptions(this.els.baselineTeam, this.baselineTeamSelection, "Select baseline team");
}

SessionController.prototype.applyTeamStatsToBaseline = function(team)
{
    if (!team)
    {
        return;
    }

    const toFixed = (value) =>
    {
        if (value === null || typeof value === "undefined" || value === "")
        {
            return "";
        }
        return Number(value).toFixed(2);
    };

    if (this.els.currentRating)
    {
        this.els.currentRating.value = toFixed(team.rating);
    }
    if (this.els.currentGoalDiff)
    {
        this.els.currentGoalDiff.value = toFixed(team.totalGoalDifferential);
    }
    if (this.els.currentSchedule)
    {
        this.els.currentSchedule.value = toFixed(team.totalOpponentRating);
    }
    if (this.els.currentGames)
    {
        const gamesVal = Number(team.totalGames);
        this.els.currentGames.value = Number.isFinite(gamesVal) ? gamesVal : "";
    }
    this.recalcAll();
    this.manager.saveAll();
};

SessionController.prototype.applyCustomBaselineDefaults = function()
{
    if (this.els.currentRating)   { this.els.currentRating.value = "0"; }
    if (this.els.currentGoalDiff) { this.els.currentGoalDiff.value = "0"; }
    if (this.els.currentSchedule) { this.els.currentSchedule.value = "0"; }
    if (this.els.currentGames)    { this.els.currentGames.value = "0"; }
    this.recalcAll();
    this.manager.saveAll();
};

SessionController.prototype.handleBaselineTeamSelection = function(force = false)
{
    if (!this.els.baselineTeam)
    {
        return;
    }
    const value = this.els.baselineTeam.value || CUSTOM_TEAM_ID;
    const last = this.els.baselineTeam.dataset.lastValue || "";
    if (!force && value === last)
    {
        return;
    }
    this.els.baselineTeam.dataset.lastValue = value;
    this.baselineTeamSelection = value;

    const nextName = deriveSessionNameFromBaseline(this.els.baselineTeam, this.name);
    if (nextName && nextName !== this.name)
    {
        this.updateSessionName(nextName);
    }

    if (value === CUSTOM_TEAM_ID)
    {
        this.applyCustomBaselineDefaults();
        return;
    }

    const team = getTeamById(value);
    if (team)
    {
        this.applyTeamStatsToBaseline(team);
    }
    else
    {
        this.recalcAll();
        this.manager.saveAll();
    }
};

SessionController.prototype.applyTeamSelectionToGame = function(select, game, force = false)
{
    if (!select || !game)
    {
        return;
    }

    const teamId = select.value || CUSTOM_TEAM_ID;
    const last = select.dataset.lastValue || "";
    if (!force && teamId === last)
    {
        return;
    }
    select.dataset.lastValue = teamId;
    game.teamId = teamId;

    const schedInput = select.closest(".row")?.querySelector('input[data-role="sched"]');

    if (teamId === CUSTOM_TEAM_ID)
    {
        game.sched = 0;
        if (schedInput)
        {
            schedInput.value = "0";
        }
        this.recalcAll();
        this.manager.saveAll();
        return;
    }

    const team = getTeamById(teamId);
    if (!team)
    {
        this.recalcAll();
        this.manager.saveAll();
        return;
    }

    const ratingValue = Number(team.rating);
    if (Number.isFinite(ratingValue))
    {
        game.sched = ratingValue;
        if (schedInput)
        {
            schedInput.value = ratingValue.toFixed(2);
        }
    }

    this.recalcAll();
    this.manager.saveAll();
};

SessionController.prototype.loadGames = function(list)
{
    if (Array.isArray(list) && list.length > 0)
    {
        const normalized = list.map((g) =>
        {
            const idVal = Number(g.id);
            const id = Number.isFinite(idVal) ? idVal : this.nextId++;

            let schedValue = g.sched;
            if (schedValue === "" || schedValue === null || typeof schedValue === "undefined")
            {
                schedValue = "";
            }
            else
            {
                const asNum = Number(schedValue);
                schedValue = Number.isFinite(asNum) ? asNum : "";
            }

            return {
                id,
                teamId: g.teamId ?? CUSTOM_TEAM_ID,
                sched: schedValue,
                goalDiff: (typeof g.goalDiff === "number" && Number.isFinite(g.goalDiff)) ? g.goalDiff : null,
                ratingAfter: g.ratingAfter ?? 0,
                breakEvenGoal: g.breakEvenGoal ?? 0,
                breakEvenNote: g.breakEvenNote ?? "",
                expectedGoal: g.expectedGoal ?? 0,
                expectedNote: g.expectedNote ?? ""
            };
        });

        this.games = normalized;
        const maxId = normalized.reduce((m, g) => Math.max(m, Number(g.id) || 0), 0);
        this.nextId = Math.max(this.nextId, maxId + 1);
    }
    else
    {
        this.games = [createDefaultGame(this.nextId++)];
    }
};

// ---------- Rendering ----------
SessionController.prototype.renderGames = function()
{
    this.els.gameList.innerHTML = "";

    this.games.forEach((g, index) =>
    {
        const wrapper = document.createElement("div");
        wrapper.className = "game";
        wrapper.dataset.id = String(g.id);

        const row = document.createElement("div");
        row.className = "row";

        // Team selector
        const lblTeam = document.createElement("label");
        lblTeam.textContent = "Select Team";
        const teamWrapper = document.createElement("div");
        teamWrapper.className = "team-selector";
        const searchInput = document.createElement("input");
        searchInput.type = "search";
        searchInput.className = "team-search";
        searchInput.placeholder = "Search team";
        searchInput.autocomplete = "off";
        const selTeam = document.createElement("select");
        selTeam.dataset.role = "teamSelect";
        buildTeamOptions(selTeam, g.teamId ?? "", "Select opponent");
        const applySelection = (force = false) => this.applyTeamSelectionToGame(selTeam, g, force);
        selTeam.addEventListener("change", () => applySelection(true));
        selTeam.addEventListener("click", () =>
        {
            if (selTeam.value === (selTeam.dataset.lastValue || ""))
            {
                applySelection(true);
            }
        });
        attachTeamSearch(selTeam, searchInput);
        teamWrapper.appendChild(searchInput);
        teamWrapper.appendChild(selTeam);
        lblTeam.appendChild(teamWrapper);

        // Opp. Rating input
        const lblSch = document.createElement("label");
        lblSch.textContent = "Opp. Rating";
        const inpSch = document.createElement("input");
        inpSch.type = "number";
        inpSch.step = "0.01";
        inpSch.inputMode = "decimal";
        inpSch.placeholder = "Rating";
        const schedValue = (g.sched === "" || g.sched === null || typeof g.sched === "undefined")
            ? ""
            : (typeof g.sched === "number" ? g.sched.toFixed(2) : String(g.sched));
        inpSch.value = schedValue;
        inpSch.dataset.role = "sched";
        inpSch.addEventListener("input", (ev) => this.onGameInput(ev));
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

        if (typeof g.goalDiff === "number" && Number.isFinite(g.goalDiff))
        {
            selGD.value = String(Math.round(g.goalDiff));
        }
        else
        {
            selGD.value = "";
        }

        selGD.addEventListener("change", (ev) => this.onGameInput(ev));
        lblGD.appendChild(selGD);

        // After rating
        const after = document.createElement("div");
        after.className = "after";
        const ratingText = (typeof g.ratingAfter === "number" && Number.isFinite(g.ratingAfter))
            ? fmt(g.ratingAfter)
            : "--";
        after.innerHTML = `Rating after game ${index + 1}: <span class="val">${ratingText}</span>`;

        // Break-even lines
        const expected = document.createElement("div");
        expected.className = "muted small breakeven expected";
        expected.textContent = g.expectedNote || "";

        const be = document.createElement("div");
        be.className = "muted small breakeven cumulative";
        be.textContent = g.breakEvenNote || "";

        // Remove button
        const removeBtn = document.createElement("button");
        removeBtn.className = "btn";
        removeBtn.textContent = "Remove";
        removeBtn.addEventListener("click", () =>
        {
            const idx = this.games.findIndex(x => x.id === g.id);
            if (idx !== -1)
            {
                this.games.splice(idx, 1);
                this.renderGames();
                this.recalcAll();
                this.manager.saveAll();
            }
        });

        row.appendChild(lblTeam);
        row.appendChild(lblSch);
        row.appendChild(lblGD);
        row.appendChild(after);
        row.appendChild(removeBtn);

        wrapper.appendChild(row);
        wrapper.appendChild(expected);
        wrapper.appendChild(be);
        this.els.gameList.appendChild(wrapper);
    });
};

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
        return { x: 0, defined: false };
    }

    const gamesTotal = n + 1;
    const schedTotal = prevSched + schedThisGame;
    const baseTotal = prevGD + schedTotal;
    const targetRounded = Number(fmt(targetRating));
    const roundedRatingForGoal = (goalDiff) =>
    {
        const rating = computeRating(prevGD + goalDiff, schedTotal, gamesTotal);
        return Number(fmt(rating));
    };

    let candidate = Math.floor((targetRounded * gamesTotal) - baseTotal);
    if (roundedRatingForGoal(candidate) < targetRounded)
    {
        candidate += 1;
    }
    while (roundedRatingForGoal(candidate - 1) >= targetRounded)
    {
        candidate -= 1;
    }

    return { x: candidate, defined: true };
}

function formatCumulativeBreakEvenNote(goalDiff, defined)
{
    if (!defined)
    {
        return "Cumulative break-even: not defined (0 prior games)";
    }
    if (goalDiff > 0)
    {
        return `Cumulative break-even: win by ${goalDiff}`;
    }
    if (goalDiff < 0)
    {
        return `Cumulative break-even: can lose by ${Math.abs(goalDiff)}`;
    }
    return "Cumulative break-even: tie";
}

function formatExpectedNote(goalDiff, defined)
{
    if (!defined)
    {
        return "Should win/lose by: not defined (0 prior games)";
    }
    if (goalDiff > 0)
    {
        return `Should win by ${goalDiff}`;
    }
    if (goalDiff < 0)
    {
        return `Should lose by ${Math.abs(goalDiff)}`;
    }
    return "Should tie";
}

SessionController.prototype.recalcAll = function()
{
    this.els.currentGoalDiff.value = sanitizeSignedDecimal(this.els.currentGoalDiff.value);
    const baseGD = toNum(this.els.currentGoalDiff.value);
    const baseSched = toNum(this.els.currentSchedule.value);
    const baseGames = Math.max(0, Math.floor(toNum(this.els.currentGames.value)));
    const baselineRating = computeRating(baseGD, baseSched, baseGames);

    let runningGD = baseGD;
    let runningSched = baseSched;
    let runningGames = baseGames;

    this.games.forEach((g) =>
    {
        const hasSchedInput = !(g.sched === "" || g.sched === null || typeof g.sched === "undefined");
        const schedVal = hasSchedInput ? toNum(g.sched) : 0;
        const hasGD = (typeof g.goalDiff === "number") && Number.isFinite(g.goalDiff);

        if (hasSchedInput)
        {
            const be = computeBreakEvenGoal(runningGD, runningSched, runningGames, schedVal, baselineRating);
            g.breakEvenGoal = be.x;
            g.breakEvenNote = formatCumulativeBreakEvenNote(be.x, be.defined);

            const expected = computeBreakEvenGoal(baseGD, baseSched, baseGames, schedVal, baselineRating);
            g.expectedGoal = expected.x;
            g.expectedNote = formatExpectedNote(expected.x, expected.defined);
        }
        else
        {
            g.breakEvenGoal = null;
            g.breakEvenNote = "";
            g.expectedGoal = null;
            g.expectedNote = "";
        }

        if (hasGD)
        {
            runningGD += toNum(g.goalDiff);
            runningSched += schedVal;
            runningGames += 1;

            g.ratingAfter = computeRating(runningGD, runningSched, runningGames);
        }
        else
        {
            g.ratingAfter = null;
        }
    });

    let finalRating = baselineRating;
    for (let i = this.games.length - 1; i >= 0; i -= 1)
    {
        const rating = this.games[i].ratingAfter;
        if (typeof rating === "number" && Number.isFinite(rating))
        {
            finalRating = rating;
            break;
        }
    }

    const delta = finalRating - baselineRating;

    const finalText = fmt(finalRating);
    const baseText = fmt(baselineRating);
    this.els.ratingDisplay.textContent = finalText;
    const isPositive = parseFloat(finalText) > parseFloat(baseText);
    const isNegative = parseFloat(finalText) < parseFloat(baseText);
    this.els.ratingDisplay.classList.toggle("positive", isPositive);
    this.els.ratingDisplay.classList.toggle("negative", isNegative);

    const sign = delta > 0 ? "+" : (delta < 0 ? "-" : "+/-");
    this.els.ratingDelta.textContent = `${sign}${fmt(Math.abs(delta))} vs current`;
    this.updateRankDisplay(finalRating, baselineRating);

    Array.from(this.els.gameList.querySelectorAll(".game")).forEach((node, i) =>
    {
        const span = node.querySelector(".val");
        if (span)
        {
            const ratingValue = this.games[i].ratingAfter;
            const ratingText = (typeof ratingValue === "number" && Number.isFinite(ratingValue))
                ? fmt(ratingValue)
                : "--";
            span.textContent = ratingText;
            const isUp = ratingText !== "--" && parseFloat(ratingText) > parseFloat(baseText);
            const isDown = ratingText !== "--" && parseFloat(ratingText) < parseFloat(baseText);
            span.classList.toggle("positive", isUp);
            span.classList.toggle("negative", isDown);
        }

        const be = node.querySelector(".breakeven.cumulative");
        if (be)
        {
            be.textContent = this.games[i].breakEvenNote || "";
        }

        const expected = node.querySelector(".breakeven.expected");
        if (expected)
        {
            expected.textContent = this.games[i].expectedNote || "";
        }
    });
};

SessionController.prototype.updateRankDisplay = function(finalRating, baselineRating)
{
    if (!this.els.rankDisplay)
    {
        return;
    }
    const teamId = this.els.baselineTeam?.value || CUSTOM_TEAM_ID;
    this.els.rankDisplay.textContent = computeRankText(finalRating, baselineRating, teamId);
};

function computeRankText(finalRating, baselineRating, teamId)
{
    if (!teamData.ready)
    {
        return "Rank data loading...";
    }

    const finalValue = parseFloat(fmt(finalRating));
    const baselineValue = parseFloat(fmt(baselineRating));

    const rows = teamData.teams
        .map((team) =>
        {
            const rating = Number(team.rating);
            if (!Number.isFinite(rating))
            {
                return null;
            }
            return { rank: Number(team.rank), rating, id: String(team.teamID ?? team.teamId ?? "") };
        })
        .filter(Boolean)
        .sort((a, b) =>
        {
            if (b.rating !== a.rating)
            {
                return b.rating - a.rating;
            }
            return a.rank - b.rank;
        });

    const target = finalValue;
    let projectedRank = rows.length + 1;
    for (const row of rows)
    {
        if (target > row.rating || (Math.abs(target - row.rating) < 0.005 && baselineValue > row.rating))
        {
            projectedRank = row.rank;
            break;
        }
        if (Math.abs(target - row.rating) < 0.005 && teamId !== CUSTOM_TEAM_ID && row.id === teamId)
        {
            projectedRank = row.rank;
            break;
        }
        if (target >= row.rating)
        {
            projectedRank = row.rank;
            break;
        }
    }

    if (teamId === CUSTOM_TEAM_ID)
    {
        return `Projected rank ~= #${projectedRank}`;
    }

    const team = getTeamById(teamId);
    if (!team)
    {
        return `Projected rank ~= #${projectedRank}`;
    }

    const baselineRank = Number(team.rank);
    if (!Number.isFinite(baselineRank))
    {
        return `Projected rank ~= #${projectedRank}`;
    }

    if (Math.abs(finalValue - baselineValue) < 0.005)
    {
        return `Projected rank ~= #${baselineRank}`;
    }

    if (projectedRank < baselineRank)
    {
        return `Projected rank up #${projectedRank}`;
    }
    if (projectedRank > baselineRank)
    {
        return `Projected rank down #${projectedRank}`;
    }

    return `Projected rank ~= #${baselineRank}`;
}

// ---------- Session Input Handling ----------
SessionController.prototype.onGameInput = function(ev)
{
    const input = ev.target;
    const role = input.dataset.role;
    const wrapper = input.closest(".game");
    const id = Number(wrapper?.dataset.id);
    const idx = this.games.findIndex(x => x.id === id);

    if (idx < 0)
    {
        return;
    }

    if (role === "teamSelect")
    {
        this.applyTeamSelectionToGame(input, this.games[idx], true);
        return;
    }

    if (role === "sched")
    {
        const s = String(input.value ?? "").trim();
        this.games[idx].sched = (s === "") ? "" : toNum(s);
        this.recalcAll();
        this.manager.saveAll();
        return;
    }

    if (role === "goalDiff")
    {
        const s = String(input.value ?? "");
        if (s === "")
        {
            this.games[idx].goalDiff = null;
        }
        else
        {
            this.games[idx].goalDiff = parseInt(s, 10);
        }
        this.recalcAll();
        this.manager.saveAll();
    }
};

// ---------- Session Manager ----------
const sessionManager =
{
    sessions: new Map(),
    order: [],
    activeId: null,
    nextSessionNumber: 1,
    tabsEl: null,
    addTabButton: null,
    sessionsRoot: null,
    template: null,

    init()
    {
        this.tabsEl = document.getElementById("tabs");
        this.addTabButton = document.getElementById("addTab");
        this.sessionsRoot = document.getElementById("sessions");
        this.template = document.getElementById("sessionTemplate");

        const stored = loadSessionsFromStorage();
        if (stored && stored.sessions)
        {
            this.order = Array.isArray(stored.order) ? stored.order.slice() : Object.keys(stored.sessions);
            this.activeId = stored.activeId || this.order[0] || null;
            this.nextSessionNumber = Number(stored.nextSessionNumber) || 1;
            this.order.forEach((id) =>
            {
                const data = stored.sessions[id];
                if (data)
                {
                    this.createSessionFromData(data);
                }
            });
        }
        else
        {
            const legacy = loadLegacySessionData();
            if (legacy)
            {
                const name = "Team 1";
                const data =
                {
                    id: this.createSessionId(),
                    name,
                    baseline: legacy.baseline || null,
                    games: legacy.games || [],
                    nextId: 1
                };
                this.order = [data.id];
                this.activeId = data.id;
                this.nextSessionNumber = 2;
                this.createSessionFromData(data);
            }
            else
            {
                const data = this.createEmptySessionData();
                this.order = [data.id];
                this.activeId = data.id;
                this.createSessionFromData(data);
            }
        }

        if (this.addTabButton)
        {
            this.addTabButton.addEventListener("click", () => this.addSession());
        }

        if (this.activeId)
        {
            this.setActive(this.activeId);
        }

        this.saveAll();
    },

    createSessionId()
    {
        return `session-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
    },

    createEmptySessionData()
    {
        const name = `Team ${this.nextSessionNumber}`;
        const data =
        {
            id: this.createSessionId(),
            name,
            baseline: null,
            games: [],
            nextId: 1
        };
        this.nextSessionNumber += 1;
        return data;
    },

    createSessionFromData(data)
    {
        const fragment = this.template.content.cloneNode(true);
        const root = fragment.querySelector("[data-session]");
        root.dataset.sessionId = data.id;
        this.sessionsRoot.appendChild(fragment);
        const controller = new SessionController(root, data, this);
        this.sessions.set(data.id, controller);
        this.createTab(data.id, data.name);
    },

    createTab(id, name)
    {
        const tab = document.createElement("button");
        tab.type = "button";
        tab.className = "tab";
        tab.dataset.sessionId = id;
        tab.textContent = name || "Team Session";
        tab.addEventListener("click", () => this.setActive(id));
        this.tabsEl.appendChild(tab);
    },

    updateTabLabel(id, label)
    {
        const tab = this.tabsEl.querySelector(`[data-session-id="${id}"]`);
        if (tab)
        {
            tab.textContent = label || "Team Session";
        }
    },

    setActive(id)
    {
        this.activeId = id;
        this.sessions.forEach((session, sessionId) =>
        {
            const isActive = sessionId === id;
            session.root.classList.toggle("active", isActive);
        });
        Array.from(this.tabsEl.querySelectorAll(".tab")).forEach((tab) =>
        {
            tab.classList.toggle("active", tab.dataset.sessionId === id);
        });
        this.saveAll();
    },

    addSession()
    {
        const data = this.createEmptySessionData();
        this.order.push(data.id);
        this.createSessionFromData(data);
        this.setActive(data.id);
    },

    removeSession(id)
    {
        const controller = this.sessions.get(id);
        if (!controller)
        {
            return;
        }

        const wasActive = this.activeId === id;
        controller.root.remove();
        this.sessions.delete(id);
        this.order = this.order.filter(sessionId => sessionId !== id);
        const tab = this.tabsEl.querySelector(`[data-session-id="${id}"]`);
        if (tab)
        {
            tab.remove();
        }

        if (this.order.length === 0)
        {
            const data = this.createEmptySessionData();
            this.order = [data.id];
            this.createSessionFromData(data);
        }

        const nextActive = wasActive ? this.order[0] : (this.activeId || this.order[0]);
        if (nextActive)
        {
            this.setActive(nextActive);
        }
    },

    refreshTeamData()
    {
        this.sessions.forEach((session) => session.refreshTeamData());
    },

    saveAll()
    {
        const sessionsData = {};
        this.order.forEach((id) =>
        {
            const session = this.sessions.get(id);
            if (session)
            {
                sessionsData[id] = session.exportData();
            }
        });

        saveSessionsToStorage(
        {
            activeId: this.activeId,
            order: this.order,
            nextSessionNumber: this.nextSessionNumber,
            sessions: sessionsData
        });
    }
};

SessionController.prototype.exportData = function()
{
    return {
        id: this.id,
        name: this.name,
        baseline: this.getBaselineState(),
        games: this.games,
        nextId: this.nextId
    };
};

// ---------- Team Data Loading ----------
function hydrateTeamData(payload)
{
    if (!payload)
    {
        return false;
    }
    const teams = Array.isArray(payload?.teams) ? [...payload.teams] : [];
    teams.sort((a, b) =>
    {
        const rankA = Number(a.rank);
        const rankB = Number(b.rank);
        if (Number.isFinite(rankA) && Number.isFinite(rankB))
        {
            return rankA - rankB;
        }
        if (Number.isFinite(rankA)) { return -1; }
        if (Number.isFinite(rankB)) { return 1; }
        return 0;
    });

    teamData.teams = teams;
    teamData.map.clear();
    teamData.source = payload?.source || teamData.source;
    teams.forEach((team) =>
    {
        const id = String(team.teamID ?? team.teamId ?? "");
        if (id)
        {
            teamData.map.set(id, team);
        }
    });
    teamData.ready = true;
    teamData.error = false;

    sessionManager.refreshTeamData();
    return true;
}

function loadTeamData()
{
    if (window.__RANKINGS_DATA__)
    {
        hydrateTeamData(window.__RANKINGS_DATA__);
        return;
    }

    fetch("rankings-data.json")
        .then((res) =>
        {
            if (!res.ok)
            {
                throw new Error(`HTTP ${res.status}`);
            }
            return res.json();
        })
        .then((data) =>
        {
            window.__RANKINGS_DATA__ = data;
            hydrateTeamData(data);
        })
        .catch((err) =>
        {
            console.warn("Unable to load rankings data:", err);
            teamData.error = true;
            sessionManager.refreshTeamData();
        });
}

// ---------- Init ----------
document.addEventListener("DOMContentLoaded", () =>
{
    sessionManager.init();
    sessionManager.refreshTeamData();
    loadTeamData();
});
