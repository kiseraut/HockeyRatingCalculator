function collectBatch() {
 const key='mhr-calculator-batch-2026-114', url=new URL(location.href);
 if(url.hostname!=='myhockeyrankings.com'||url.searchParams.get('y')!=='2026'||url.searchParams.get('v')!=='114'){alert('Open the 2026 USA 14U rankings page first.');return;}
 if(document.getElementById('mhr-collection-panel'))return;
 const tables=doc=>Array.from(doc.querySelectorAll('table')).map(t=>Array.from(t.rows).map(r=>Array.from(r.cells).map(c=>c.innerText.trim())));
 let job;try{job=JSON.parse(sessionStorage.getItem(key));}catch{}
 function readRankings(){
 const queue=[],seen=new Set();
 for(const row of document.querySelectorAll('table tr')){
 const rank=Number(row.cells[0]?.innerText.trim().split(/\r?\n/)[0]);
 if(!Number.isInteger(rank)||rank<1||rank>200)continue;
 const links=Array.from(row.querySelectorAll('a[href]'));
 const identify=a=>a.href.match(/\/team-info\/(\d+)/)?.[1] || new URL(a.href).searchParams.get('t');
 const link=links.find(a=>identify(a)&&a.innerText.trim())||links.find(identify);if(!link)continue;
 const id=identify(link);if(seen.has(id))continue;seen.add(id);
 queue.push({id,rank,name:link.closest('td').innerText.trim(),url:new URL('/team-info/'+id+'/2026/math',location.origin).href});
 }
 return {queue,tables:tables(document)};
 }
 const loaded=readRankings();
 if(!job){
 if(!loaded.queue.length){alert('No team links found. Load the rankings table first.');return;}
 job={format:'mhr-batch-v1',source:location.href,collectedAt:new Date().toISOString(),tables:loaded.tables,queue:loaded.queue,teamMath:[]};
 }
 // Restrict saved jobs from older bookmarks without discarding completed top-200 pages.
 const ranks=new Map();
 for(const table of job.tables||[])for(const row of table){const rank=Number(String(row[0]).trim().split(/\r?\n/)[0]);if(Number.isInteger(rank)&&rank>0)ranks.set(String(row[1]).trim(),rank);}
 job.queue=job.queue.filter(t=>(t.rank||ranks.get(t.name))<=200);
 const allowed=new Set(job.queue.map(t=>String(t.id)));
 job.teamMath=job.teamMath.filter(t=>allowed.has(String(t.teamId)));
 let child=null,running=false,busy=false;
 const panel=document.createElement('div');panel.id='mhr-collection-panel';panel.style.cssText='position:fixed;bottom:16px;right:16px;z-index:2147483647;background:white;color:#17212b;padding:18px;border:2px solid #276452;border-radius:10px;max-width:380px;font:16px system-ui';
 const status=document.createElement('p');panel.append(status);document.body.append(panel);
 const save=()=>sessionStorage.setItem(key,JSON.stringify(job));
 const missing=()=>Array.from({length:200},(_,i)=>i+1).filter(rank=>!job.queue.some(t=>Number(t.rank||ranks.get(t.name))===rank));
 const complete=()=>!missing().length && job.teamMath.length===job.queue.length;
 const progress=()=>job.teamMath.length+' / 200 Math pages collected. '+job.queue.length+' teams loaded.';
 function addLoaded(){
 const loaded=readRankings();
 const known=new Set(job.queue.map(t=>String(t.id)));
 for(const team of loaded.queue)if(!known.has(String(team.id))){job.queue.push(team);known.add(String(team.id));}
 job.queue.sort((a,b)=>(a.rank||ranks.get(a.name))-(b.rank||ranks.get(b.name)));
 const merged=new Map();let header;
 for(const table of [...job.tables,...loaded.tables]){
 const hi=table.findIndex(row=>row.some(c=>/^Team$/i.test(c.trim()))&&row.some(c=>/^Rating$/i.test(c.trim())));
 if(hi<0)continue;header=table[hi];
 for(const row of table.slice(hi+1)){const rank=Number(String(row[0]).trim().split(/\r?\n/)[0]);if(Number.isInteger(rank)&&rank>0&&rank<=200&&!merged.has(rank))merged.set(rank,row);}
 }
 if(header)job.tables=[[header,...Array.from(merged).sort((a,b)=>a[0]-b[0]).map(item=>item[1])]];
 save();
 status.textContent=progress()+(missing().length?' Missing ranking rows: show all teams on MHR, then click Add shown teams.':' Ready to collect.');
 }
 status.textContent=progress()+' Keep both tabs open. Start opens a collection tab.';
 function button(label,fn){const b=document.createElement('button');b.textContent=label;b.style.cssText='margin:4px;padding:10px';b.onclick=fn;panel.append(b);}
 const sleep=ms=>new Promise(r=>setTimeout(r,ms));
 function extract(doc){
 let reason='The page loaded, but no Rating Math table with GD and Opp Rating headings was found.';
 for(const rows of tables(doc)){
 const normalize=s=>s.replace(/\s+/g,'').toLowerCase();
 if(!rows.some(r=>r.some(c=>normalize(c)==='gd')&&r.some(c=>normalize(c)==='opprating')))continue;
 reason='The Rating Math table loaded, but its Totals row is missing.';
 for(const row of rows){
 const label=row.join(' '),match=label.match(/Totals\s*\(\s*(\d+)\s+games?\s*\)/i);
 const rankable=/Totals\s*\(\s*for\s+rankable\s+games\s*\)/i.test(label);if(!match&&!rankable)continue;
 const vals=row.filter(c=>c.trim());
 const num=s=>{const value=String(s??'').trim().replace(/,/g,'').replace(/[\u2212\u2013]/g,'-');return /^[+-]?\d+(\.\d+)?$/.test(value)?Number(value):NaN;};
 const record=String(vals.at(-6)??'').match(/^\s*(\d+)\s*[-–−]\s*(\d+)\s*[-–−]\s*(\d+)\s*$/);
 const recordGames=record?record.slice(1).reduce((sum,n)=>sum+Number(n),0):null;
 const games=match?Number(match[1]):recordGames;
 const gd=num(vals.at(-4)),opp=num(vals.at(-3)),points=num(vals.at(-2));
 if(games>0&&(!match||recordGames===null||games===recordGames)&&Number.isInteger(gd)&&Math.abs(gd)<=7*games&&opp>=0&&Math.abs(points-gd-opp)<.021)return {data:{tables:[rows]}};
 reason='The Totals row was found but failed validation: '+row.join(' | ')+'.';
 }
 }
 return {reason};
 }
 function samePage(actual,target){const a=new URL(actual),b=new URL(target);return a.origin===b.origin&&a.pathname.replace(/\/+$/,'')===b.pathname.replace(/\/+$/,'');}
 button('Start / resume',async()=>{
 if(busy)return;
 addLoaded();
 if(!child||child.closed)child=window.open('about:blank','mhr-calculator-collection');
 if(!child){status.textContent='Allow popups for MHR, then resume.';return;}
 running=true;busy=true;
 try{
 while(running&&job.teamMath.length<job.queue.length){
 const completed=new Set(job.teamMath.map(t=>String(t.teamId)));
 const team=job.queue.find(t=>!completed.has(String(t.id)));status.textContent=progress()+' Reading '+team.name;
 let already=false;try{already=samePage(child.location.href,team.url);}catch{}
 if(!already)child.location.href=team.url;
 let data=null,reason='The collection page did not finish loading.';const deadline=Date.now()+60000;
 while(running&&Date.now()<deadline){
 await sleep(750);
 if(child.closed)throw new Error('Collection tab closed. Resume to reopen it.');
 try{
 const actual=child.location.href;
 if(!samePage(actual,team.url)){reason='The collection tab is at '+actual+' instead of '+team.url;continue;}
 if(child.document.readyState!=='complete')continue;
 const result=extract(child.document);data=result.data;reason=result.reason;
 }catch(error){reason='The browser prevented access to the collection tab ('+error.name+'): '+error.message;}
 if(data)break;
 }
 if(!running)break;
 if(!data)throw new Error(team.name+': '+reason+' Resume to retry this team.');
 job.teamMath.push({teamName:team.name,teamId:team.id,source:team.url,collectedAt:new Date().toISOString(),...data});save();await sleep(1500);
 }
 status.textContent=progress()+(complete()?' Complete. Download and import the file.':missing().length?' More ranking rows needed. Show all teams on MHR, click Add shown teams, then resume.':' Paused.');
 }catch(error){status.textContent=progress()+' Paused: '+error.message;}finally{running=false;busy=false;}
 });
 button('Add shown teams',()=>{if(!busy)addLoaded();});
 button('Pause',()=>{running=false;status.textContent=progress()+' Pausing...';});
 button('Download',()=>{const a=document.createElement('a'),u=URL.createObjectURL(new Blob([JSON.stringify(job)],{type:'application/json'}));a.href=u;a.download=complete()?'mhr-complete.json':'mhr-INCOMPLETE.json';a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);});
 button('New collection',()=>{if(busy){status.textContent='Pause before starting a new collection.';return;}sessionStorage.removeItem(key);panel.remove();collectBatch();});
 try{addLoaded();}catch(error){status.textContent='Cannot save progress: '+error.message;}
}
