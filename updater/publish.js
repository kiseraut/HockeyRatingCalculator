const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
function git(args, cwd) {
    return execFileSync("git", args, {
        cwd,
        encoding: "utf8",
        timeout: 120000,
        env: {
            ...process.env,
            GIT_TERMINAL_PROMPT: "0",
            GIT_ASKPASS: "/app/git-askpass.sh",
            GIT_COMMITTER_NAME:
                process.env.GIT_AUTHOR_NAME || "Hockey Rankings Updater",
            GIT_COMMITTER_EMAIL:
                process.env.GIT_AUTHOR_EMAIL ||
                "rankings-updater@users.noreply.github.com",
        },
    });
}
function publish(state) {
    const repo = path.join(state, "repository");
    const branch = process.env.REPOSITORY_BRANCH || "main";
    if (!fs.existsSync(path.join(repo, ".git")))
        git(
            [
                "clone",
                "--branch",
                branch,
                "--single-branch",
                process.env.REPOSITORY_URL,
                repo,
            ],
            state,
        );
    git(["fetch", "origin", branch], repo);
    git(["reset", "--hard", `origin/${branch}`], repo);
    for (const file of ["rankings-data.json", "rankings-data.js"])
        fs.copyFileSync(path.join(state, file), path.join(repo, file));
    // Publish every successful check, even when ratings are unchanged: this is the heartbeat.
    git(["add", "--", "rankings-data.json", "rankings-data.js"], repo);
    git(
        ["commit", "-m", "chore: refresh 14U rankings and update heartbeat"],
        repo,
    );
    git(["push", "origin", `HEAD:${branch}`], repo);
}
module.exports = { publish };
