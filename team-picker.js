(function(root) {
 const normalize = s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim();
 function distance(a,b) { let row=Array.from({length:b.length+1},(_,i)=>i); for(let i=1;i<=a.length;i++){const next=[i];for(let j=1;j<=b.length;j++)next[j]=Math.min(next[j-1]+1,row[j]+1,row[j-1]+(a[i-1]!==b[j-1]));row=next;}return row[b.length]; }
 function score(label,query) { const name=normalize(label), q=normalize(query);if(!q)return 0;if(name.includes(q))return 0;let score=0;for(const token of q.split(' ')){const best=Math.min(...name.split(' ').map(word=>word.startsWith(token)?0:distance(word,token)));if(best>Math.floor(token.length/4))return Infinity;score+=best+1;}return score; }
 let counter=0;
 function attach(select,input) {
 const wrapper=input.parentElement;wrapper.classList.add('team-picker');select.hidden=true;
 const list=document.createElement('div');list.className='team-options';list.id='team-options-'+(++counter);list.setAttribute('role','listbox');list.hidden=true;wrapper.append(list);
 input.setAttribute('role','combobox');input.setAttribute('aria-autocomplete','list');input.setAttribute('aria-controls',list.id);input.setAttribute('aria-expanded','false');input.placeholder='Search teams…';
 let results=[],active=-1,touch=null;
 const sync=()=>{input.value=select.selectedOptions[0]?.textContent||'';};
 const close=()=>{list.hidden=true;input.setAttribute('aria-expanded','false');input.removeAttribute('aria-activedescendant');sync();};
 function choose(index){if(!results[index])return;select.value=results[index].value;select.dispatchEvent(new Event('change',{bubbles:true}));close();}
 function highlight(){Array.from(list.children).forEach((node,i)=>node.setAttribute('aria-selected',String(i===active)));if(active>=0){input.setAttribute('aria-activedescendant',list.children[active].id);list.children[active].scrollIntoView({block:'nearest'});}}
 function render(query){results=Array.from(select.options).map(o=>({value:o.value,label:o.textContent,score:score(o.textContent,query)})).filter(o=>Number.isFinite(o.score)).sort((a,b)=>a.score-b.score).slice(0,50);list.replaceChildren();active=-1;for(const [i,result] of results.entries()){const item=document.createElement('div');item.textContent=result.label;item.id=list.id+'-'+i;item.setAttribute('role','option');item.onpointerdown=e=>{if(e.pointerType==='mouse')e.preventDefault();};
 item.addEventListener('touchstart',e=>{const t=e.touches[0];touch={x:t.clientX,y:t.clientY,moved:false};},{passive:true});
 item.addEventListener('touchmove',e=>{if(touch){const t=e.touches[0];if(Math.hypot(t.clientX-touch.x,t.clientY-touch.y)>10)touch.moved=true;}},{passive:true});
 item.addEventListener('touchend',e=>{const tapped=touch&&!touch.moved;touch=null;if(tapped){e.preventDefault();choose(i);input.blur();}},{passive:false});
 item.addEventListener('touchcancel',()=>{touch=null;close();});
 item.onclick=()=>choose(i);list.append(item);}if(!results.length)list.textContent='No matching teams';list.hidden=false;input.setAttribute('aria-expanded','true');input.removeAttribute('aria-activedescendant');}
 input.onfocus=()=>{input.select();render('');};input.oninput=()=>render(input.value);input.onblur=()=>{if(!touch)close();};
 input.onkeydown=e=>{if(e.key==='Escape'){close();return;}if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();if(list.hidden)render('');active=Math.max(0,Math.min(results.length-1,active+(e.key==='ArrowDown'?1:-1)));highlight();}if(e.key==='Enter'&&!list.hidden){e.preventDefault();choose(active<0?0:active);}};
 select.addEventListener('change',sync);select._syncPicker=sync;sync();
 }
 root.TeamPicker={score,attach};if(typeof module!=='undefined')module.exports=root.TeamPicker;
})(typeof window==='undefined'?globalThis:window);
