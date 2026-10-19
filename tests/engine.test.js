import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {ROLES,SETUP_COUNTS,HUMAN_FORBIDDEN_ROLES,alignmentOf} from "../src/data.js";
import {createGameState,parseScript} from "../src/setup.js";
import {getNightInformation} from "../src/storyteller.js";
import {getDailyTalkLimit,getTalkStatus,recordTalk,resetDailyTalks} from "../src/talk-limit.js";
import {GameEngine} from "../src/engine.js";
import {SimpleNpcStrategy} from "../src/strategies.js";

const raw=JSON.parse(readFileSync(new URL("../scripts/trouble-brewing.json",import.meta.url),"utf8"));
const make=(seats=10,seed=42,strategy=null)=>{const state=createGameState(raw,seats,seed);return {state,engine:new GameEngine(state,strategy)};};
const setRole=(player,role)=>{player.startingRole=role;player.role=role;player.shownRole=role;player.team=ROLES[role].team;player.alignment=alignmentOf(role);player.claimRole=role;player.poisoned=false;};

test("complete Trouble Brewing roster loads",()=>assert.equal(parseScript(raw).roleIds.length,22));

test("setup counts hold and human is always solo-safe",()=>{
  for(let seats=5;seats<=15;seats++)for(let seed=0;seed<100;seed++){
    const state=createGameState(raw,seats,`${seats}-${seed}`),counts={townsfolk:0,outsider:0,minion:0,demon:0};
    state.players.forEach(player=>counts[player.team]++);
    const expected=[...SETUP_COUNTS[seats]];
    if(state.players.some(player=>player.role==="baron")){expected[0]-=2;expected[1]+=2;}
    assert.deepEqual([counts.townsfolk,counts.outsider,counts.minion,counts.demon],expected);
    assert.equal(state.players[0].alignment,"good");
    assert.equal(HUMAN_FORBIDDEN_ROLES.has(state.players[0].role),false);
  }
});

test("conversation information is stored in the public log",()=>{
  const {state,engine}=make(7,15);state.phase="day";state.day=1;resetDailyTalks(state);
  const target=state.players[1],before=state.publicLog.length,response=engine.askNpc(target.id);
  assert.equal(state.publicLog.length,before+1);
  assert.match(state.publicLog.at(-1),new RegExp(`Seat ${target.seat}`));
  assert.ok(state.publicLog.at(-1).includes(ROLES[target.claimRole].name));
  assert.ok(state.publicLog.at(-1).includes(response));
});

test("daily conversation limit counts distinct alive or dead targets",()=>{
  const {state,engine}=make(5,22);state.phase="day";state.day=1;resetDailyTalks(state);
  state.players[2].alive=false;
  assert.equal(getDailyTalkLimit(state),2);
  engine.askNpc(state.players[1].id);engine.askNpc(state.players[2].id);
  assert.equal(getTalkStatus(state).remaining,0);
  assert.throws(()=>engine.askNpc(state.players[3].id),/used today's 2/);
});

test("same NPC cannot be asked twice in one day",()=>{
  const {state,engine}=make(6,23);state.phase="day";state.day=1;resetDailyTalks(state);
  engine.askNpc(state.players[1].id);
  assert.throws(()=>engine.askNpc(state.players[1].id),/already spoken/);
});

test("new day resets conversation list",()=>{
  const {state}=make(6,24);state.phase="day";state.day=1;recordTalk(state,state.players[1].id);state.day=2;resetDailyTalks(state);assert.equal(getTalkStatus(state).used,0);
});

test("dead NPC reports stored information and gets no normal post-death information",()=>{
  const {state,engine}=make();const player=state.players[2];setRole(player,"empath");player.memories.push({id:"memory",night:1,text:"Empath number: 1."});player.alive=false;state.phase="day";state.day=1;resetDailyTalks(state);
  assert.equal(getNightInformation(state,player,engine.strategy),null);
  assert.match(engine.askNpc(player.id),/Empath number: 1/);
});

test("Ravenkeeper death information persists for an NPC",()=>{
  const strategy=new SimpleNpcStrategy(),{state,engine}=make(10,25,strategy),ravenkeeper=state.players[2],target=state.players[3];setRole(ravenkeeper,"ravenkeeper");setRole(target,"chef");strategy.chooseRavenkeeperTarget=()=>target;engine.kill(ravenkeeper,"demon");assert.equal(ravenkeeper.memories[0].trigger,"death");state.phase="day";state.day=1;resetDailyTalks(state);assert.match(engine.askNpc(ravenkeeper.id),/Chef/);
});

test("latest vote result contains counted voters for hand markers",()=>{
  const strategy=new SimpleNpcStrategy();strategy.vote=()=>true;
  const {state,engine}=make(10,26,strategy);state.phase="day";state.day=1;
  const nominee=state.players.find(player=>player.alive&&!player.isHuman&&player.alignment==="good");
  const result=engine.nominate(nominee.id);
  assert.ok(result.records.some(record=>record.counted));
  assert.equal(state.lastVoteResult,result);
});

test("final reveal excludes per-player votes and vote result",()=>{
  const {state,engine}=make();
  state.auditEvents.push({id:state.nextAuditId++,group:"Day 1",type:"vote",summary:"hidden vote",data:{}});
  state.auditEvents.push({id:state.nextAuditId++,group:"Day 1",type:"vote_result",summary:"hidden result",data:{}});
  state.auditEvents.push({id:state.nextAuditId++,group:"Day 1",type:"execution",summary:"kept execution",data:{}});
  engine.finish("good","test");
  const types=engine.getReveal().events.map(event=>event.type);
  assert.equal(types.includes("vote"),false);
  assert.equal(types.includes("vote_result"),false);
  assert.equal(types.includes("execution"),true);
});

test("app renders hand emoji rather than a vote table",()=>{
  const html=readFileSync(new URL("../index.html",import.meta.url),"utf8"),app=readFileSync(new URL("../src/app.js",import.meta.url),"utf8");
  assert.equal(html.includes('id="votes"'),false);
  assert.ok(app.includes("vote-hand"));
  assert.ok(app.includes("✋"));
});
