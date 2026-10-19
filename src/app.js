import {roleName,ROLES} from "./data.js";
import {createGameState} from "./setup.js";
import {GameEngine} from "./engine.js";
import {getTalkStatus} from "./talk-limit.js";

const $=id=>document.getElementById(id);
const esc=value=>String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
let scripts=[],state=null,engine=null;

async function loadScripts(){
  try{
    const names=await fetch("./scripts/index.json").then(response=>{if(!response.ok)throw Error("Cannot load script manifest");return response.json();});
    scripts=await Promise.all(names.map(async filename=>({filename,raw:await fetch(`./scripts/${filename}`).then(response=>{if(!response.ok)throw Error(`Cannot load ${filename}`);return response.json();})})));
    $("script").innerHTML=scripts.map((script,index)=>`<option value="${index}">${esc(script.raw.find(item=>item?.id==="_meta")?.name??script.filename)}</option>`).join("");
  }catch(error){$("error").textContent=`${error.message}. Use an HTTP server, not file://.`;}
}

function start(){
  try{
    const selected=scripts[Number($("script").value)];
    if(!selected)throw Error("No script selected.");
    state=createGameState(selected.raw,Number($("seats").value),$("seed").value||Date.now());
    engine=new GameEngine(state);engine.start();$("setup").hidden=true;$("game").hidden=false;render();
  }catch(error){$("error").textContent=error.message;}
}

function renderTargets(){
  const old=$("target").value,npcs=state.players.filter(player=>!player.isHuman);
  $("target").innerHTML=npcs.map(player=>`<option value="${player.id}">Seat ${player.seat}: ${esc(player.name)} — ${player.alive?"alive":"dead"}</option>`).join("");
  if(npcs.some(player=>player.id===old))$("target").value=old;
}

function latestVoterIds(){
  return new Set((state.lastVoteResult?.records??[]).filter(record=>record.counted).map(record=>record.playerId));
}

function renderCircle(){
  const selected=$("target").value,voters=latestVoterIds();
  $("circle").innerHTML=state.players.map((player,index)=>{
    const hand=voters.has(player.id)?'<span class="vote-hand" aria-label="Voted">✋</span>':"";
    return `<button class="seat ${player.isHuman?"human":""} ${player.alive?"":"dead"} ${player.id===selected?"selected":""}" style="--a:${index/state.players.length*360}deg" data-id="${player.id}" ${player.isHuman?"disabled":""}>${hand}<strong>${player.seat}</strong><span>${esc(player.name)}</span><small>${player.alive?"alive":"DEAD"}</small></button>`;
  }).join("");
  $("circle").querySelectorAll("[data-id]:not(:disabled)").forEach(button=>button.onclick=()=>{$("target").value=button.dataset.id;render();});
}

function renderReveal(){
  const reveal=engine.getReveal();$("reveal").hidden=!reveal;if(!reveal)return;
  $("result").innerHTML=`<strong>${reveal.winner.toUpperCase()} wins.</strong> ${esc(reveal.reason)}`;
  $("characters").innerHTML=reveal.players.map(player=>`<article class="card"><b>Seat ${player.seat}: ${esc(player.name)}</b><br>True: ${esc(roleName(player.startingRole))}${player.finalRole!==player.startingRole?`<br>Final: ${esc(roleName(player.finalRole))}`:""}${player.shownRole!==player.startingRole?`<br>Shown: ${esc(roleName(player.shownRole))}`:""}<br>Alignment: ${player.alignment}<br>Claim: ${esc(roleName(player.claimRole))}${player.bluffRole?`<br>Bluff: ${esc(roleName(player.bluffRole))}`:""}<br>${player.alive?"Alive":`Dead (${esc(player.causeOfDeath)})`}<br>Ghost vote: ${player.ghostVoteRemaining?"remaining":"spent"}<br>Memories: ${player.memories.length?esc(player.memories.map(memory=>memory.text).join(" | ")):"none"}<br>Conversations: ${player.interactions.filter(item=>item.type==="conversation").length}</article>`).join("");
  let current="";
  $("audit").innerHTML=reveal.events.map(event=>{const heading=event.group!==current?(current=event.group,`<h3>${esc(event.group)}</h3>`):"";return `${heading}<div class="event"><b>${esc(event.type.replaceAll("_"," "))}</b><span>${esc(event.summary)}</span></div>`;}).join("");
}

function render(){
  const human=engine.human();
  $("role").innerHTML=`<b>${esc(roleName(human.shownRole))}</b><p>${esc(ROLES[human.shownRole]?.summary)}</p>${human.role==="drunk"?"<p>You believe this is your role.</p>":""}`;
  $("status").innerHTML=state.winner?`<b>${state.winner.toUpperCase()} wins</b><p>${esc(state.winReason)}</p>`:`<b>${state.phase==="day"?`Day ${state.day}`:`Night ${state.night}`}</b><p>${engine.alive().length} alive</p>`;
  renderTargets();
  const target=engine.player($("target").value),talk=getTalkStatus(state,target?.id);
  $("talk-status").textContent=`Conversations today: ${talk.used}/${talk.limit}. ${talk.remaining} remaining.${talk.alreadyTalkedToTarget?" You already spoke to this player today.":""}`;
  renderCircle();
  $("private").innerHTML=state.privateLog.map(item=>`<li>${esc(item)}</li>`).join("");
  $("public").innerHTML=state.publicLog.map(item=>`<li>${esc(item)}</li>`).join("");
  $("actions").hidden=Boolean(state.winner);
  $("ask").disabled=!target||state.phase!=="day"||talk.remaining===0||talk.alreadyTalkedToTarget;
  $("nominate").disabled=!target?.alive||Boolean(state.winner);
  $("slay").hidden=!(human.shownRole==="slayer"&&!state.slayerUsed);
  renderReveal();
}

$("start").onclick=start;
$("target").onchange=render;
$("ask").onclick=()=>{try{$("answer").textContent=engine.askNpc($("target").value);render();}catch(error){$("answer").textContent=error.message;}};
$("nominate").onclick=()=>{try{engine.nominate($("target").value);render();}catch(error){$("answer").textContent=error.message;}};
$("slay").onclick=()=>{try{engine.useSlayer($("target").value);render();}catch(error){$("answer").textContent=error.message;}};
$("pass").onclick=()=>{try{engine.endDayNoExecution();render();}catch(error){$("answer").textContent=error.message;}};
$("seats").innerHTML=Array.from({length:11},(_,index)=>`<option>${index+5}</option>`).join("");$("seats").value="10";loadScripts();
