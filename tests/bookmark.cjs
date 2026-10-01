const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
(async () => {
 const browser = await chromium.launch({channel:'msedge',headless:true});
 try {
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:4001');
  const href = await page.locator('#batchCollectorLink').getAttribute('href');
  assert.ok(href.includes('%0A') || href.includes('%0D'), 'Bookmark must preserve line breaks');
  const source = fs.readFileSync('batch-collector.js','utf8');
  const broken = await page.evaluate(source => {const a=document.createElement('a');a.href='javascript:('+source+')()';return a.href.slice(11);}, source);
  assert.throws(()=>new Function(broken), SyntaxError, 'Reproduce old URL stripping newlines after // comment');
  await page.route('https://myhockeyrankings.com/**', route => route.fulfill({contentType:'text/html',body:'<table><tr><th>Rank</th><th>Team</th><th>Rating</th></tr><tr><td>200</td><td><a href="/team-info/123/2026">Included team</a></td><td>90</td></tr><tr><td>201</td><td><a href="/team-info/456/2026">Excluded team</a></td><td>89</td></tr></table>'}));
  await page.goto('https://myhockeyrankings.com/rank.php?y=2026&v=114');
  await page.evaluate(href=>{const a=document.createElement('a');a.href=href;a.id='bookmark-test';a.textContent='Run saved bookmark';document.body.append(a);},href);
  await page.locator('#bookmark-test').click();
  await page.locator('#mhr-collection-panel').waitFor();
  const job=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('mhr-calculator-batch-2026-114')));
  assert.deepEqual(job.queue.map(t=>t.rank),[200]);
  console.log('PASS: reproduced old bookmark syntax failure; encoded bookmark link opens collector and excludes rank 201.');
 } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
