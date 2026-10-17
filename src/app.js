import {parseScript,createGame,publicPlayer} from './setup.js';
import {ROLES,title} from './data.js';import {runNight,askNpc,nominate,noExecution,useSlayer} from './engine.js';import {effectiveRole} from './storyteller.js';
const $=x=>document.querySelector(x);let state,scripts=[];
for(let n=5;n<=15;n++)$('#seats').add(new Option(n,n));
async function load(){try{const names=await fetch('./scripts/index.json').then(r=>{if(!r.ok)throw Error('Could not load scripts/index.json');return r.json()});for(const file of names){const raw=await fetch('./scripts/'+file).then(r=>r.json());scripts.push({file,data:parseScript(raw)})}scripts.forEach((x,i)=>$('#script').add(new Option(x.data.meta.name,i)))}catch(e){$('#error').textContent=e.message+' — serve the folder over HTTP, not file://.'}}
const chooser={one(label,c){const text=c.map(p=>`${p.seat}: ${p.name}`).join('\n');const seat=Number(prompt(label+'\n'+text));return c.find(p=>p.seat===seat)?.id??c[0]?.id},two(label,c){const text=c.map(p=>`${p.seat}: ${p.name}`).join('\n');const raw=prompt(label+' (comma-separated seats)\n'+text)||'';const ids=raw.split(',').map(Number).map(seat=>c.find(p=>p.seat===seat)?.id).filter(x=>x!==undefined);return [...new Set(ids)].slice(0,2).length===2?[...new Set(ids)].slice(0,2):c.slice(0,2).map(p=>p.id)}};
function render(){if(!state)return;const h=state.players[0],shown=effectiveRole(h);$('#role').textContent=`You are the ${title(shown)}`;$('#ability').textContent=ROLES[shown].summary;$('#status').textContent=state.winner?`${state.winner.toUpperCase()} WINS: ${state.reason}`:`${state.phase.toUpperCase()} ${state.day} • ${state.players.filter(p=>p.alive).length} alive`;
 $('#town').innerHTML=state.players.map(p=>{const q=publicPlayer(p);return `<div class="player ${q.alive?'':'dead'}"><span>Seat ${q.seat}: ${q.name}</span><span>${q.alive?'alive':'dead'}${q.claim!=='Unknown'?' • claims '+q.claim:''}</span></div>`}).join('');
 const old=Number($('#target').value);$('#target').innerHTML=state.players.filter(p=>p.id&&p.alive).map(p=>`<option value="${p.id}">Seat ${p.seat}: ${p.name}</option>`).join('');if([...$('#target').options].some(o=>Number(o.value)===old))$('#target').value=old;
 $('#private').innerHTML=state.privateLog.map(x=>`<li>${x}</li>`).join('');$('#log').innerHTML=state.publicLog.map(x=>`<li>${x}</li>`).join('');
 const active=state.phase==='day'&&!state.winner;for(const id of ['ask','nominate','pass'])$('#'+id).disabled=!active;$('#slay').hidden=shown!=='slayer'||h.used.slayer;$('#slay').disabled=!active}
function nextNight(){if(!state.winner)runNight(state,{first:false,chooser});render()}
$('#start').onclick=()=>{try{state=createGame(scripts[Number($('#script').value)].data,Number($('#seats').value),{seed:Number($('#seed').value)||Date.now()});$('#setup').hidden=true;$('#game').hidden=false;runNight(state,{first:true,chooser});render()}catch(e){$('#error').textContent=e.message}};
$('#ask').onclick=()=>{$('#reply').textContent=askNpc(state,Number($('#target').value));render()};
$('#nominate').onclick=()=>{nominate(state,Number($('#target').value));render();nextNight()};
$('#pass').onclick=()=>{noExecution(state);render();nextNight()};
$('#slay').onclick=()=>{useSlayer(state,Number($('#target').value));render()};
$('#restart').onclick=()=>location.reload();load();
