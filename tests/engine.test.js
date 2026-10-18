import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {ROLES,SETUP_COUNTS,alignmentOf} from "../src/data.js";
import {createGameState,parseScript} from "../src/setup.js";
import {getNightInformation} from "../src/storyteller.js";
import {GameEngine} from "../src/engine.js";
import {SimpleNpcStrategy} from "../src/strategies.js";
const raw=JSON.parse(readFileSync(new URL("../scripts/trouble-brewing.json",import.meta.url),"utf8"));
const setRole=(p,role)=>{p.startingRole=role;p.role=role;p.shownRole=role;p.team=ROLES[role].team;p.alignment=alignmentOf(role);p.claimRole=role;p.poisoned=false;};
const make=(seats=10,seed=42,strategy=null)=>{const state=createGameState(raw,seats,seed);return {state,engine:new GameEngine(state,strategy)};};

test("script contains the complete Trouble Brewing roster",()=>{
  const script=parseScript(raw);
  assert.equal(script.roleIds.length,22);
  for(const id of ["washerwoman","librarian","investigator","chef","empath","fortuneteller","undertaker","monk","ravenkeeper","virgin","slayer","soldier","mayor","butler","drunk","recluse","saint","poisoner","spy","scarletwoman","baron","imp"])assert.ok(script.roleIds.includes(id));
});

test("5-15 seat setup counts, Baron modifier, and human safety are valid",()=>{
  for(let seats=5;seats<=15;seats++)for(let seed=0;seed<40;seed++){
    const state=createGameState(raw,seats,`${seats}-${seed}`),counts={townsfolk:0,outsider:0,minion:0,demon:0};
    state.players.forEach(p=>counts[p.team]++);
    const expected=[...SETUP_COUNTS[seats]],baron=state.players.some(p=>p.role==="baron");
    if(baron){expected[0]-=2;expected[1]+=2;}
    assert.deepEqual([counts.townsfolk,counts.outsider,counts.minion,counts.demon],expected);
    assert.equal(state.players.length,seats);assert.equal(state.players[0].alignment,"good");assert.notEqual(state.players[0].role,"imp");
    const drunk=state.players.find(p=>p.role==="drunk");if(drunk){assert.notEqual(drunk.shownRole,"drunk");assert.equal(ROLES[drunk.shownRole].team,"townsfolk");assert.equal(state.players.filter(p=>p.role===drunk.shownRole).length,0);}
  }
});

test("dead NPC can be asked and gains no new normal night information",()=>{
  const {state,engine}=make();const npc=state.players[2];setRole(npc,"empath");npc.memories.push({id:"old",night:1,text:"Empath number: 1.",trigger:"normal"});npc.alive=false;state.night=2;
  assert.equal(getNightInformation(state,npc,engine.strategy),null);
  const before=npc.memories.length,response=engine.askNpc(npc.id);
  assert.match(response,/Empath number: 1/);assert.equal(npc.memories.length,before);assert.match(state.auditEvents.at(-1).summary,/dead/);
});

test("Ravenkeeper death information persists and is reportable",()=>{
  const strategy=new SimpleNpcStrategy();const {state,engine}=make(10,12,strategy);const rk=state.players[2],target=state.players[3];setRole(rk,"ravenkeeper");setRole(target,"chef");strategy.chooseRavenkeeperTarget=()=>target;
  engine.kill(rk,"demon");assert.equal(rk.memories.length,1);assert.equal(rk.memories[0].trigger,"death");assert.match(engine.askNpc(rk.id),/Chef/);assert.equal(rk.memories.length,1);assert.ok(state.auditEvents.some(e=>e.type==="ravenkeeper_trigger"));
});

test("vote records include every seat and evil refuses an evil nominee",()=>{
  const strategy=new SimpleNpcStrategy();strategy.vote=()=>true;const {state,engine}=make(10,5,strategy);state.phase="day";state.day=1;const nominee=state.players.find(p=>p.alignment==="evil"&&p.role!=="imp");assert.ok(nominee);const result=engine.nominate(nominee.id);
  assert.equal(result.records.length,state.seatCount);for(const r of result.records.filter(r=>engine.player(r.playerId).alignment==="evil"))assert.equal(r.reason,"evil-will-not-vote-for-evil");assert.ok(result.records.some(r=>r.playerId===state.humanId));
});

test("a dead counted vote consumes its single ghost vote",()=>{
  const strategy=new SimpleNpcStrategy();strategy.vote=()=>true;const {state,engine}=make(10,8,strategy);state.phase="day";state.day=1;const ghost=state.players.find(p=>!p.isHuman&&p.alignment==="good"),nominee=state.players.find(p=>p.alive&&!p.isHuman&&p.id!==ghost.id&&p.alignment==="good");ghost.alive=false;ghost.causeOfDeath="test";
  const result=engine.nominate(nominee.id),record=result.records.find(r=>r.playerId===ghost.id);assert.equal(record.ghostVoteAvailable,true);assert.equal(record.counted,true);assert.equal(record.ghostVoteConsumed,true);assert.equal(ghost.ghostVote,false);
  state.phase="day";state.winner=null;state.executedToday=null;const other=state.players.find(p=>p.alive&&!p.isHuman&&p.id!==nominee.id);const later=engine.buildVoteRecords(other,false).find(r=>r.playerId===ghost.id);assert.equal(later.ghostVoteAvailable,false);assert.equal(later.counted,false);assert.equal(later.reason,"ghost-vote-spent");
});

test("functioning Butler vote is blocked when the master does not attempt",()=>{
  const {state}=make(10,13);state.phase="day";state.day=1;const butler=state.players[2],master=state.players[3],nominee=state.players[4];setRole(butler,"butler");setRole(master,"chef");setRole(nominee,"empath");butler.masterId=master.id;
  const strategy=new SimpleNpcStrategy();strategy.vote=(s,v)=>v.id!==master.id;const engine=new GameEngine(state,strategy),result=engine.nominate(nominee.id),record=result.records.find(r=>r.playerId===butler.id);assert.equal(record.attempted,true);assert.equal(record.butlerRestricted,true);assert.equal(record.counted,false);assert.equal(record.reason,"butler-master-did-not-vote");
});

test("death keeps every player in the same fixed seat",()=>{
  const {state,engine}=make(12,20);const ids=state.players.map(p=>p.id),seats=state.players.map(p=>p.seat);engine.kill(state.players[6],"test");assert.deepEqual(state.players.map(p=>p.id),ids);assert.deepEqual(state.players.map(p=>p.seat),seats);assert.equal(state.players[6].alive,false);
});

test("audit records poison, protection, Demon target, and information",()=>{
  const {state}=make(10,21);setRole(state.players[0],"empath");setRole(state.players[1],"poisoner");setRole(state.players[2],"monk");setRole(state.players[3],"imp");setRole(state.players[4],"chef");setRole(state.players[5],"soldier");setRole(state.players[6],"librarian");
  const strategy=new SimpleNpcStrategy();strategy.choosePoison=()=>state.players[6];strategy.chooseMonk=()=>state.players[5];strategy.chooseDemonTarget=()=>state.players[4];const engine=new GameEngine(state,strategy);state.night=2;state.phase="night";engine.resolveNight();const types=new Set(state.auditEvents.map(e=>e.type));for(const type of ["poison","monk_protection","demon_action","storyteller_information"])assert.ok(types.has(type),type);
});

test("full reveal is gated until game over",()=>{
  const {state,engine}=make();assert.equal(engine.getReveal(),null);engine.finish("good","test victory");const reveal=engine.getReveal();assert.equal(reveal.players.length,state.seatCount);assert.ok(reveal.events.some(e=>e.type==="game_over"));assert.equal(reveal.reason,"test victory");
});

test("even a hostile Demon strategy cannot target the human",()=>{
  const {state}=make(10,99);const demon=state.players.find(p=>p.role==="imp");const strategy=new SimpleNpcStrategy();strategy.chooseDemonTarget=()=>state.players[0];const engine=new GameEngine(state,strategy);state.night=2;engine.resolveDemonAction();assert.equal(state.players[0].alive,true);assert.equal(state.auditEvents.at(-1).data.outcome,"no-target");assert.equal(demon.alive,true);
});
