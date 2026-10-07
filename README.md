# 14U rating calculator

Personal calculator for 2026–27 USA 14U. Rankings are collected manually in Firefox; Docker Desktop runs the local preview. GitHub Pages hosts the calculator at https://kiseraut.github.io/HockeyRatingCalculator/.

## Preview

Run `docker compose up -d --build`, then open http://127.0.0.1:4001 in Edge or Chrome. The embedded Codex browser has crashed on this PC. The preview serves only public app files from this checkout.

## Manual collection (current workflow)

Use your normal Firefox session. Replace the old bookmark with **Collect MHR data** from **Import rankings > Collect rankings and Math totals**.

1. Open the linked 2026�27 USA 14U rankings page and show all teams.
2. Click the bookmark, then **Start / resume**. Allow the collection tab to open. The rankings tab controls a second ordinary browser tab, visiting Math pages for ranks 1�200 sequentially. Lower-ranked teams are excluded from collection and imports.
3. Check that the panel says **200 teams loaded**. If it shows 25 (or another smaller number), show all teams on MHR and click **Add shown teams**. You can also move through ranking pages and add each shown page. Saved Math progress is retained; a short queue is never marked complete. Keep both tabs open. Collection of hundreds of teams takes time. **Pause** stops after the current check; **Start / resume** continues. Progress is saved in session storage in the rankings tab and survives a reload, but do not close that tab before downloading.
4. If a page is blocked or its totals cannot be read, collection pauses with the team name. Check the collection tab and resolve verification before resuming. It does not bypass Cloudflare. Browser restrictions on cross-tab access may also prevent collection; live MHR compatibility still needs verification.
5. At completion, click **Download**, then import the file in the calculator. Review the team count and Math totals count. Early downloads are named INCOMPLETE and missing totals remain blank.
6. For the next rankings release, reload the rankings page, show all teams, click the bookmark, then **New collection**. This starts a fresh snapshot rather than reusing old Math totals.

The collector reads published ratings from rankings and actual totals from each Math table. It never reconstructs totals from rounded averages. The one-table bookmark and per-team Math import remain available as fallbacks. Only collected teams are imported, and partial lists are labeled accordingly. Each import replaces the prior dataset. Fuzzy team pickers support partial names, misspellings, arrow keys and Enter.

**Export for another device** downloads the validated dataset with its original collection timestamp. Transfer it to your iPhone and select it under Import rankings in the updated calculator. This requires the updated UI to be deployed to the site you open on the phone; desktop localhost is not accessible from an iPhone. Imports are browser-local, not automatically synchronized. **Use hosted data** clears the imported dataset only, retaining scenarios.

To update the repository data from an exported or collected file:

```powershell
node scripts/import-rankings.cjs "C:\path\to\rankings-data.json"
```

The command validates before writing both rankings files. It does not commit or push. GitHub hosting still requires deployment of the UI changes and subsequent data commits.

The automatic scraper is stopped and placed behind the `automatic` Compose profile, so ordinary `docker compose up -d` does not start it. Its persistent session is retained. To explicitly restore it later: `docker compose --profile automatic up -d rankings-updater`. The manual importer does not send failure emails; it shows validation errors immediately and keeps the prior data. Gmail credentials and external watchdog setup below remain unfinished.

## Gmail alerts

Local `.env` is configured for the requested Gmail sender and recipient, using smtp.gmail.com:465 with TLS.

1. Enable Google 2-Step Verification if needed and create an app password at https://myaccount.google.com/apppasswords . Some account policies do not allow app passwords.
2. In a local text editor, save only that app password, without spaces, in `secrets/smtp_password` (UTF-8, no .txt extension). Do not put it in chat or source code. This directory is ignored by Git and excluded from the image.
3. Run `docker compose exec rankings-updater node notify.js` and check the inbox/spam folder for the test message. SMTP acceptance does not guarantee inbox delivery.

Every failed update queues an email with its cause, last successful update/push, and recovery steps. This covers browser verification, navigation, parsing, timeout and GitHub errors. SMTP failures remain queued, retry every five minutes, and make the container unhealthy. Recovery sends another email. If recovery happens before a failure email is delivered, the recovery message replaces it. Startup failures also attempt an alert. Abrupt process/PC shutdown needs the independent check below.

## Independent missed-update check

A stopped PC cannot send email. `.github/workflows/rankings-watchdog.yml` runs in GitHub every six hours and checks the hosted JSON. It alerts if data is unavailable, has the wrong season, is empty, or is over 7 days old. This detects missed runs and data that never reached GitHub Pages. Alerts repeat each check while stale.

To activate, push the workflow to the default branch and configure repository Actions secrets `ALERT_EMAIL` (Gmail sender and recipient) and `SMTP_PASSWORD` (preferably a separate app password). Run **Rankings freshness check** manually in GitHub Actions to test it. It is NOT active until deployed and configured. Docker secrets are not transferred automatically. Scheduled Actions can be delayed or disabled; enable GitHub workflow-failure notifications as a backup if SMTP fails.

## Publishing

Save a GitHub fine-grained token with Contents read/write for this repository in `secrets/github_token` (plain UTF-8 without BOM). Set `PUBLISH=true` in `.env`, then run `docker compose up -d rankings-updater`.

The container uses a separate checkout and ordinary, non-force pushes. Only the two rankings files are committed. Every successful run publishes a fresh timestamp even if ratings are unchanged; this is the freshness heartbeat. GitHub Pages deploys those commits. Publishing-disabled runs update only the Docker volume, not the hosted app or working checkout.

## Status

```powershell
docker compose ps
docker compose exec rankings-updater cat /state/status.json
docker compose logs --tail 50 rankings-updater
```

At setup, MHR still required verification, Gmail awaited an app password, publishing was disabled, and the independent watchdog was not deployed. No new-season live dataset had been fetched successfully. Validate the entire scrape/push/email flow before relying on it.

The UI rejects last-season data and warns after 7 days without a successful check, including while an open page ages. Old scenarios remain stored separately. The former Windows task remains disabled. `updater/scrape.js` is the maintained scraper; the older backend copy is no longer the update path.

## Tests

```powershell
npm ci --prefix updater
node --test tests/updater.cjs tests/manual.cjs
npm install --no-save --package-lock=false playwright
$env:PREVIEW_URL='http://127.0.0.1:4001'
node tests/browser.cjs
node tests/manual-browser.cjs
```

Edge tests use explicit synthetic teams to check calculations, persistence and widths from 320–1280px; screenshots go into ignored `artifacts/`. Updater tests simulate scrape/Git/SMTP failure, retries, recovery and freshness checks. They do not replace a live integration test.

Rating = (total capped goal differential + total opponent ratings) / games played. Results are capped at +/-7. Enter totals, not averages. Only add games absent from the baseline. Ranking estimates hold other teams fixed and are unofficial.

For the provided Pittsburgh Stars screenshot, 8 games, GD 9 and opponent ratings 732.55 yield 92.69. The displayed published rating 92.69 was correct; the former approximation caused the incorrect 92.68 projection. `artifacts/rankings-corrected.json` contains the original 730 rankings with these screenshot-sourced totals for Pittsburgh only. Other teams require their Math tables.


## Weekly refresh

1. Run the collection bookmark on MHR, choose **New collection**, finish ranks 1–200, and download the completed JSON.
2. Double-click **Publish rankings.cmd** in this repository folder and choose the downloaded JSON file.
3. Wait for **Uploaded successfully**. Allow a few minutes for GitHub Pages to deploy, then reload the calculator on your iPhone and check the collection date.

The publisher checks for 200 teams with Math totals, rejects incomplete or older data, updates the two data files, commits, and pushes using your existing Git login. Node.js and Git are required and already installed on this PC. If sign-in expires, use Git's normal sign-in prompt. On failure, the window shows NOT PUBLISHED and preserves your download. Resolve the displayed error and rerun.

Importing inside the website only saves to that browser. To use published updates, choose **Data & import tools > Use hosted data** once on any browser with an old local import. Saved scenarios remain local.

Command-line alternative: `node scripts/publish-rankings.cjs "C:/Users/Dave/Downloads/mhr-complete.json"`.

The stale warning appears after more than seven days. Email alerts still require Gmail credentials and activation.
