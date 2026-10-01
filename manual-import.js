(function () {
    const storageKey = "hockeyRanker.manual.2026.14u";
    let pending;
    function download(payload, name) {
        const url = URL.createObjectURL(
            new Blob([JSON.stringify(payload, null, 2)], {
                type: "application/json",
            }),
        );
        const link = document.createElement("a");
        link.href = url;
        link.download = name;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    function collect() {
        const u = new URL(location.href);
        if (
            u.hostname !== "myhockeyrankings.com" ||
            !(
                (u.searchParams.get("y") === "2026" &&
                    u.searchParams.get("v") === "114") ||
                /\/team-info\/\d+\/2026\/math/.test(u.pathname)
            )
        ) {
            alert(
                "Open the 2026–27 USA 14U rankings page or a team’s 2026–27 Math page first.",
            );
            return;
        }
        const tables = Array.from(document.querySelectorAll("table")).map(
            (table) =>
                Array.from(table.rows)
                    .filter((row) => row.getClientRects().length)
                    .map((row) =>
                        Array.from(row.cells).map((cell) =>
                            cell.innerText.trim(),
                        ),
                    ),
        );
        if (!tables.length) {
            alert(
                "No table found. Wait for rankings to load, or copy the table manually.",
            );
            return;
        }
        const payload = {
            format: "mhr-table-v1",
            source: location.href,
            collectedAt: new Date().toISOString(),
            tables,
        };
        const url = URL.createObjectURL(
            new Blob([JSON.stringify(payload)], { type: "application/json" }),
        );
        const a = document.createElement("a");
        a.href = url;
        a.download = "mhr-14u-collection.json";
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    window.readManualRankings = () => {
        try {
            const raw = localStorage.getItem(storageKey);
            return raw ? ManualRankings.validate(JSON.parse(raw)) : null;
        } catch {
            return null;
        }
    };
    window.saveMathTotals = (teamId, totals) => {
        const payload = window.readManualRankings() || window.__RANKINGS_DATA__;
        const updated = structuredClone(payload);
        const team = updated?.teams.find((t) => String(t.teamID) === teamId);
        if (!team) throw new Error("Select an imported team first.");
        Object.assign(team, totals);
        localStorage.setItem(storageKey, JSON.stringify(updated));
        window.__RANKINGS_DATA__ = updated;
        hydrateTeamData(updated);
    };
    document.addEventListener("DOMContentLoaded", () => {
        document.getElementById("batchCollectorLink").href = "javascript:" + encodeURIComponent("void (() => { try { (" + collectBatch.toString() + ")(); } catch (error) { alert(\"Collection could not start: \" + error.message); } })()");
        const message = document.getElementById("importMessage");
        const apply = document.getElementById("applyImport");
        const input = document.getElementById("importText");
        const preview = (text) => {
            pending = null;
            apply.disabled = true;
            try {
                pending = ManualRankings.parse(text);
                document.getElementById("importPreview").textContent =
                    pending.teams
                        .slice(0, 5)
                        .map(
                            (t) =>
                                `#${t.rank} ${t.team} — ${t.rating.toFixed(2)}`,
                        )
                        .join("\n");
                const exact = pending.teams.filter(
                    (t) => t.statsSource === "math",
                ).length;
                message.textContent = `${pending.teams.length} teams found. ${exact} have Math totals. Other teams need their Math table before projections can be calculated. ${pending.skippedRows || 0} rows skipped. Only collected teams will be available; national rank is not inferred from a partial list. This replaces your previous import.`;
                apply.disabled = false;
            } catch (error) {
                message.textContent = error.message;
                document.getElementById("importPreview").textContent = "";
            }
        };
        document.getElementById("useHosted").onclick = () => {
            localStorage.removeItem(storageKey);
            location.reload();
        };
        document.getElementById("collectorLink").href =
            "javascript:" + encodeURIComponent("void (" + collect.toString() + ")()");
        document.getElementById("previewImport").onclick = () =>
            preview(input.value);
        input.addEventListener("input", () => {
            pending = null;
            apply.disabled = true;
        });
        document.getElementById("importFile").onchange = async (event) => {
            pending = null;
            apply.disabled = true;
            const file = event.target.files[0];
            if (!file) return;
            if (file.size > 5000000) {
                message.textContent = "File too large (maximum 5 MB).";
                return;
            }
            preview(await file.text());
        };
        apply.onclick = () => {
            if (!pending) return;
            if (!document.getElementById("confirmSeason").checked) {
                message.textContent =
                    "Confirm the season and division before saving.";
                return;
            }
            try {
                localStorage.setItem(storageKey, JSON.stringify(pending));
                window.__RANKINGS_DATA__ = pending;
                hydrateTeamData(pending);
                message.textContent = `Saved ${pending.teams.length} teams in this browser. Export the data to transfer it to your iPhone.`;
                document.getElementById("exportImport").disabled = false;
            } catch (error) {
                message.textContent = `Could not save: ${error.message}`;
            }
        };
        document.getElementById("exportImport").disabled =
            !window.readManualRankings();
        document.getElementById("exportImport").onclick = () => {
            const payload = window.readManualRankings();
            if (payload) download(payload, "rankings-data.json");
        };
    });
})();
