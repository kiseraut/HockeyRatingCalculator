const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const {parse} = require('../manual-data');
const root = path.resolve(__dirname, '..');
function validateCollection(file) {
    const data = parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
    const ranks = new Set(data.teams.map(t => t.rank));
    if (data.teams.length !== 200 || ranks.size !== 200 ||
        data.teams.some(t => t.statsSource !== 'math' || !Number.isInteger(t.totalGames) || t.totalGames < 1 || !Number.isFinite(t.totalGoalDifferential) || !Number.isFinite(t.totalOpponentRating)))
        throw new Error('Collection is incomplete. Finish ranks 1–200 with Math totals before publishing.');
    if (Date.now() - Date.parse(data.scrapedAt) > 7 * 24 * 3600000)
        throw new Error('This collection is over a week old. Choose the new completed download.');
    const current = JSON.parse(fs.readFileSync(path.join(root, 'rankings-data.json'), 'utf8'));
    if (Date.parse(data.scrapedAt) < Date.parse(current.scrapedAt))
        throw new Error('This collection is older than the current data. Choose the newest file.');
    return data;
}
function main(args) {
    const check = args.includes('--check');
    let file = args.find(a => a !== '--check');
    if (!file) {
        file = execFileSync('powershell.exe', ['-NoProfile', '-STA', '-Command',
            "Add-Type -AssemblyName System.Windows.Forms; $picker = New-Object System.Windows.Forms.OpenFileDialog; $picker.Title = 'Choose your completed MHR collection'; $picker.Filter = 'JSON collections (*.json)|*.json'; $picker.InitialDirectory = Join-Path $env:USERPROFILE 'Downloads'; if ($picker.ShowDialog() -eq 'OK') { [Console]::Write($picker.FileName) }"
        ], {encoding:'utf8', windowsHide:true}).trim();
        if (!file) { console.log('Cancelled. Nothing changed.'); return; }
    }
    file = path.resolve(file);
    const data = validateCollection(file);
    console.log(`Validated 200 teams with Math totals. Collected ${data.scrapedAt}.`);
    if (check) return;
    const git = (...args) => execFileSync('git', args, {cwd:root, encoding:'utf8', stdio:['ignore','pipe','pipe']}).trim();
    if (git('branch','--show-current') !== 'main') throw new Error('Switch this repository to main before publishing.');
    if (git('status','--porcelain','--untracked-files=no')) throw new Error('There are uncommitted changes in the repository. Commit or resolve them before publishing.');
    git('fetch','origin');
    const ahead = git('log','--format=%s','origin/main..HEAD').split('\n').filter(Boolean);
    if (ahead.some(subject => !subject.startsWith('Update 14U rankings: ')))
        throw new Error('There are unpublished app commits. Publish or resolve those before running this data-only update.');
    git('merge','--ff-only','origin/main');
    validateCollection(file);
    const json = JSON.stringify(data,null,2);
    fs.writeFileSync(path.join(root,'rankings-data.json'),json+'\n');
    fs.writeFileSync(path.join(root,'rankings-data.js'),'window.__RANKINGS_DATA__ = '+json+';\n');
    git('add','--','rankings-data.json','rankings-data.js');
    if (git('diff','--cached','--name-only')) git('commit','-m','Update 14U rankings: '+data.scrapedAt.slice(0,10));
    console.log('Uploading rankings to GitHub…');
    git('push','origin','main');
    console.log('Uploaded successfully. GitHub Pages will deploy in a few minutes.');
    console.log('https://kiseraut.github.io/HockeyRatingCalculator/');
}
module.exports = {validateCollection};
if (require.main === module) {
    try { main(process.argv.slice(2)); }
    catch (error) { console.error('NOT PUBLISHED: '+(error.stderr?.toString().trim() || error.message)); console.error('Your downloaded collection is unchanged. Resolve the error and run this again.'); process.exitCode=1; }
}
