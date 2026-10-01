const { chromium }=require('playwright');const assert=require('node:assert/strict');const fs=require('node:fs');
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
const page=await browser.newPage();await page.route('https://myhockeyrankings.com/**',r=>r.fulfill({contentType:'text/html',body:'<table><tr><th>Rank</th><th>Team</th><th>Rating</th></tr></table>'}));await page.goto('https://myhockeyrankings.com/rank.php?y=2026&v=114');
const append=async(start,end)=>page.evaluate(({start,end})=>{for(let i=start;i<=end;i++){const row=document.querySelector('table').insertRow();row.innerHTML=`<td>${i}</td><td><a href="/team-info/${i}/2026">Team ${i}</a></td><td>90</td>`;}},{start,end});
await append(1,25);await page.evaluate('(()=>{'+fs.readFileSync('batch-collector.js','utf8')+';collectBatch()})()');
assert.match(await page.locator('#mhr-collection-panel').innerText(),/25 teams loaded.*Missing ranking rows/);
await page.evaluate(()=>{const key='mhr-calculator-batch-2026-114';const job=JSON.parse(sessionStorage.getItem(key));job.teamMath=job.queue.map(t=>({teamId:t.id,teamName:t.name}));sessionStorage.setItem(key,JSON.stringify(job));});
await page.reload();await append(1,200);await page.evaluate('(()=>{'+fs.readFileSync('batch-collector.js','utf8')+';collectBatch()})()');
const job=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('mhr-calculator-batch-2026-114')));assert.equal(job.queue.length,200);assert.equal(job.teamMath.length,25);assert.equal(job.tables[0].length,201);assert.match(await page.locator('#mhr-collection-panel').innerText(),/25 \/ 200.*200 teams loaded/);
console.log('PASS: 25-row page warns of missing ranks; resumed queue expands to 200 and preserves completed 25.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
