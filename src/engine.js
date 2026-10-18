import {ROLES,roleName} from "./data.js";
import {SimpleNpcStrategy} from "./strategies.js";
import {abilityRole,getNightInformation,getRavenkeeperInformation,works} from "./storyteller.js";
import {pick} from "./util.js";
export class GameEngine{
  constructor(state,strategy=null){this.state=state;this.strategy=strategy??new SimpleNpcStrategy();}
  player(id){return this.state.players.find(p=>p.id===id)??null;}
  human(){return this.player(this.state.humanId);}
  alive(){return this.state.players.filter(p=>p.alive);}
  group(){return this.state.phase==="night"?`Night ${this.state.night}`:`Day ${this.state.day}`;}
  audit(type,summary,data={},group=this.group()){const e={id:this.state.nextAuditId++,group,type,summary,data};this.state.auditEvents.push(e);return e;}
  remember(p,info){const m={...info,id:`${p.id}-m${p.memories.length+1}`};p.memories.push(m);p.interactions.push({type:"information",night:info.night,text:info.text});this.audit("storyteller_information",`Seat ${p.seat} received: ${info.text}`,{playerId:p.id,...m});if(p.isHuman)this.state.privateLog.push(`Night ${info.night}: ${info.text}`);}
  start(){if(!this.state.day&&!this.state.winner)this.resolveNight();return this.state;}
  resolveNight(){
    const s=this.state;if(s.winner)return;s.phase="night";this.audit("night_start",`Night ${s.night} began.`);
    for(const p of s.players)p.protected=false;s.protectedId=null;
    if(s.poisonedId){const old=this.player(s.poisonedId);if(old)old.poisoned=false;s.poisonedId=null;}
    const poisoner=s.players.find(p=>p.alive&&p.role==="poisoner");
    if(poisoner){const t=this.strategy.choosePoison(s,poisoner);if(t&&!t.isHuman){t.poisoned=true;s.poisonedId=t.id;this.audit("poison",`Poisoner seat ${poisoner.seat} selected seat ${t.seat}.`,{actorId:poisoner.id,targetId:t.id});}}
    if(s.night>1)for(const monk of s.players.filter(p=>p.alive&&abilityRole(p)==="monk")){const t=this.strategy.chooseMonk(s,monk);if(t){const effective=works(monk);if(effective){t.protected=true;s.protectedId=t.id;}this.audit("monk_protection",`Monk seat ${monk.seat} selected seat ${t.seat}; ${effective?"protection active":"ability failed"}.`,{actorId:monk.id,targetId:t.id,effective});if(monk.isHuman)this.state.privateLog.push(`Night ${s.night}: You chose seat ${t.seat} for Monk protection.`);}}
    for(const b of s.players.filter(p=>p.alive&&abilityRole(p)==="butler")){const m=this.strategy.chooseButler(s,b);b.masterId=m?.id??null;this.audit("butler_master",`Butler seat ${b.seat} chose ${m?`seat ${m.seat}`:"nobody"}.`,{actorId:b.id,targetId:m?.id??null,effective:works(b)});if(b.isHuman&&m)this.state.privateLog.push(`Night ${s.night}: Your Butler master is seat ${m.seat}.`);}
    for(const spy of s.players.filter(p=>p.alive&&p.role==="spy"))this.audit("spy_view",`Spy seat ${spy.seat} viewed all roles.`,{actorId:spy.id,layout:s.players.map(p=>({id:p.id,role:p.role,alive:p.alive}))});
    if(s.night>1)this.resolveDemonAction();
    if(s.winner)return;
    for(const p of s.players){const info=getNightInformation(s,p,this.strategy);if(info)this.remember(p,info);}
    s.day=s.night;s.phase="day";s.executedToday=null;this.audit("day_start",`Day ${s.day} began.`,{},`Day ${s.day}`);s.publicLog.push(`Day ${s.day}: ${this.alive().length} players are alive.`);
  }
  resolveDemonAction(){
    const s=this.state,d=s.players.find(p=>p.alive&&p.role==="imp");if(!d){this.finish("good","No living Demon remains.");return;}
    let t=this.strategy.chooseDemonTarget(s,d);if(!t||!t.alive||t.isHuman){this.audit("demon_action",`Demon seat ${d.seat} had no legal target.`,{actorId:d.id,outcome:"no-target"});return;}
    const original=t,before=this.alive().length;let outcome="killed";
    if(t.role==="soldier"&&works(t))outcome="blocked-by-soldier";
    else if(t.protected)outcome="blocked-by-monk";
    else if(t.role==="mayor"&&works(t)){const r=pick(s.players.filter(p=>p.alive&&!p.isHuman&&p.id!==t.id&&p.id!==d.id),s.rng);if(r){t=r;outcome="redirected-and-killed";}else outcome="no-death";}
    this.audit("demon_action",`Demon seat ${d.seat} selected seat ${original.seat}; outcome ${outcome}${t!==original?` at seat ${t.seat}`:""}.`,{actorId:d.id,targetId:original.id,resolvedTargetId:t.id,outcome});
    if(outcome.includes("killed")){this.kill(t,"demon");if(t===d)this.handleDemonDeath(t,before,true);else this.checkWin();}
  }
  kill(p,cause){if(!p?.alive)return false;p.alive=false;p.causeOfDeath=cause;this.audit("death",`Seat ${p.seat} (${p.name}) died: ${cause}.`,{playerId:p.id,cause});this.state.publicLog.push(`${p.name} died.`);
    if(cause==="demon"&&abilityRole(p)==="ravenkeeper"){const t=this.strategy.chooseRavenkeeperTarget(this.state,p);if(t){const info=getRavenkeeperInformation(this.state,p,t);this.remember(p,info);this.audit("ravenkeeper_trigger",`Dead Ravenkeeper seat ${p.seat} checked seat ${t.seat}: ${info.text}`,{actorId:p.id,targetId:t.id,information:info.text});}}
    return true;
  }
  askNpc(id){const p=this.player(id);if(!p||p.isHuman)throw new Error("Select an NPC.");const response=this.strategy.ask(this.state,p);p.interactions.push({type:"conversation",day:this.state.day,alive:p.alive,response});this.audit("conversation",`Human asked seat ${p.seat} (${p.alive?"alive":"dead"}); claim ${roleName(p.claimRole)}; response: ${response}`,{targetId:p.id,actualRole:p.role,claimRole:p.claimRole,bluffRole:p.bluffRole,response});return response;}
  buildVoteRecords(nominee,skipped=false){
    const s=this.state,intents=new Map(),records=[];
    for(const v of s.players){const eligible=v.alive||v.ghostVote;let attempted=!skipped&&eligible&&(v.isHuman?true:this.strategy.vote(s,v,nominee));let reason=skipped?"vote-skipped":!eligible?"ghost-vote-spent":"did-not-attempt";if(v.alignment==="evil"&&nominee.alignment==="evil"){attempted=false;reason="evil-will-not-vote-for-evil";}intents.set(v.id,attempted);records.push({playerId:v.id,seat:v.seat,name:v.name,alive:v.alive,ghostVoteAvailable:!v.alive&&v.ghostVote,attempted,butlerRestricted:false,counted:false,ghostVoteConsumed:false,reason});}
    for(const r of records){const v=this.player(r.playerId);if(!r.attempted)continue;if(v.alive&&abilityRole(v)==="butler"&&works(v)&&(!v.masterId||!intents.get(v.masterId))){r.butlerRestricted=true;r.reason="butler-master-did-not-vote";continue;}r.counted=true;r.reason=v.alive?"counted":"counted-ghost-vote";if(!v.alive){v.ghostVote=false;r.ghostVoteConsumed=true;}}
    return records;
  }
  nominate(id){
    const s=this.state;if(s.winner||s.phase!=="day")throw new Error("Nominations are unavailable.");if(s.executedToday)throw new Error("This day's nomination has resolved.");const n=this.player(id);if(!n?.alive||n.isHuman)throw new Error("Choose a living NPC.");
    this.audit("nomination",`Human nominated seat ${n.seat}.`,{nominatorId:s.humanId,nomineeId:n.id});
    if(n.role==="virgin"&&!s.virginUsed&&works(n)&&ROLES[this.human().role].team==="townsfolk"){s.virginUsed=true;const result={nomineeId:n.id,count:0,threshold:Math.ceil(this.alive().length/2),executed:false,virginTriggered:true,records:this.buildVoteRecords(n,true)};s.lastVoteResult=result;s.executedToday="virgin";this.audit("virgin_trigger","Virgin triggered; solo safeguard spared the human and ended the day.",result);this.advanceAfterDay();return result;}
    const records=this.buildVoteRecords(n),count=records.filter(r=>r.counted).length,threshold=Math.ceil(this.alive().length/2),executed=count>=threshold;const result={nomineeId:n.id,count,threshold,executed,virginTriggered:false,records};s.lastVoteResult=result;s.executedToday=n.id;this.audit("vote_result",`Seat ${n.seat}: ${count} votes; ${threshold} required; ${executed?"executed":"not executed"}.`,result);
    for(const r of records)this.audit("vote",`Seat ${r.seat} ${r.counted?"voted":"did not vote"} for seat ${n.seat}: ${r.reason}.`,r);
    if(executed){const before=this.alive().length;s.lastExecution=n.id;this.audit("execution",`Seat ${n.seat} was executed.`,{playerId:n.id,count,threshold});this.kill(n,"execution");if(n.role==="saint")this.finish("evil","The Saint was executed.");else if(n.role==="imp")this.handleDemonDeath(n,before,false);else this.checkWin();}
    if(!s.winner)this.advanceAfterDay();return result;
  }
  useSlayer(id){const s=this.state,p=this.human(),t=this.player(id);if(s.phase!=="day"||s.winner||s.slayerUsed||abilityRole(p)!=="slayer"||!t?.alive||t.isHuman)throw new Error("Slayer action is unavailable.");s.slayerUsed=true;let hit=false;if(works(p)&&(t.role==="imp"||t.role==="recluse")){const before=this.alive().length;hit=this.kill(t,"slayer");if(t.role==="imp")this.handleDemonDeath(t,before,false);else this.checkWin();}this.audit("slayer",`Human Slayer chose seat ${t.seat}; ${hit?"the target died":"nothing happened"}.`,{targetId:t.id,hit});return hit;}
  endDayNoExecution(){const s=this.state;if(s.phase!=="day"||s.winner)throw new Error("Cannot end the day now.");this.audit("no_execution","Human ended the day without execution.");if(this.alive().length===3&&this.human().role==="mayor"&&works(this.human()))this.finish("good","Mayor final-three no-execution victory.");else this.advanceAfterDay();}
  advanceAfterDay(){if(this.state.winner)return;this.state.night++;this.resolveNight();}
  handleDemonDeath(dead,before,selfKill){
    const s=this.state;let successor=null;
    if(before>=5)successor=s.players.find(p=>p.alive&&p.role==="scarletwoman");
    if(!successor&&selfKill)successor=s.players.find(p=>p.alive&&ROLES[p.role].team==="minion");
    if(successor){const old=successor.role;successor.role="imp";successor.team="demon";successor.alignment="evil";this.audit("demon_succession",`Seat ${successor.seat} changed from ${roleName(old)} to Imp.`,{playerId:successor.id,from:old,to:"imp"});}
    else this.finish("good","The Demon died and no successor was available.");
  }
  checkWin(){if(this.state.winner)return;if(!this.state.players.some(p=>p.alive&&p.role==="imp"))this.finish("good","No living Demon remains.");else if(this.alive().length<=2)this.finish("evil","Only two players remain alive.");}
  finish(winner,reason){if(this.state.winner)return;this.state.winner=winner;this.state.winReason=reason;this.state.phase="gameover";this.audit("game_over",`${winner.toUpperCase()} wins: ${reason}`,{winner,reason},"Game Over");}
  getReveal(){const s=this.state;if(!s.winner)return null;return {winner:s.winner,reason:s.winReason,players:s.players.map(p=>({seat:p.seat,name:p.name,startingRole:p.startingRole,finalRole:p.role,shownRole:p.shownRole,team:p.team,alignment:p.alignment,claimRole:p.claimRole,bluffRole:p.bluffRole,alive:p.alive,causeOfDeath:p.causeOfDeath,ghostVoteRemaining:p.ghostVote,memories:p.memories,interactions:p.interactions})),events:s.auditEvents};}
}
