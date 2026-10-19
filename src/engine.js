import {ROLES,roleName} from "./data.js";
import {SimpleNpcStrategy} from "./strategies.js";
import {abilityRole,getNightInformation,getRavenkeeperInformation,works} from "./storyteller.js";
import {getTalkStatus,recordTalk,resetDailyTalks} from "./talk-limit.js";
import {pick} from "./util.js";

export class GameEngine{
  constructor(state,strategy=null){this.state=state;this.strategy=strategy??new SimpleNpcStrategy();}
  player(id){return this.state.players.find(p=>p.id===id)??null;}
  human(){return this.player(this.state.humanId);}
  alive(){return this.state.players.filter(p=>p.alive);}
  group(){return this.state.phase==="night"?`Night ${this.state.night}`:`Day ${this.state.day}`;}
  audit(type,summary,data={},group=this.group()){const event={id:this.state.nextAuditId++,group,type,summary,data};this.state.auditEvents.push(event);return event;}
  remember(player,info){const memory={...info,id:`${player.id}-m${player.memories.length+1}`};player.memories.push(memory);player.interactions.push({type:"information",night:info.night,text:info.text});this.audit("storyteller_information",`Seat ${player.seat} received: ${info.text}`,{playerId:player.id,...memory});if(player.isHuman)this.state.privateLog.push(`Night ${info.night}: ${info.text}`);}
  start(){if(!this.state.day&&!this.state.winner)this.resolveNight();return this.state;}

  resolveNight(){
    const state=this.state;if(state.winner)return;state.phase="night";this.audit("night_start",`Night ${state.night} began.`);
    for(const player of state.players)player.protected=false;state.protectedId=null;
    if(state.poisonedId){const old=this.player(state.poisonedId);if(old)old.poisoned=false;state.poisonedId=null;}
    const poisoner=state.players.find(player=>player.alive&&player.role==="poisoner");
    if(poisoner){const target=this.strategy.choosePoison(state,poisoner);if(target&&!target.isHuman){target.poisoned=true;state.poisonedId=target.id;this.audit("poison",`Poisoner seat ${poisoner.seat} selected seat ${target.seat}.`,{actorId:poisoner.id,targetId:target.id});}}
    if(state.night>1)for(const monk of state.players.filter(player=>player.alive&&abilityRole(player)==="monk")){const target=this.strategy.chooseMonk(state,monk);if(target){const effective=works(monk);if(effective){target.protected=true;state.protectedId=target.id;}this.audit("monk_protection",`Monk seat ${monk.seat} selected seat ${target.seat}; ${effective?"protection active":"ability failed"}.`,{actorId:monk.id,targetId:target.id,effective});if(monk.isHuman)state.privateLog.push(`Night ${state.night}: You chose seat ${target.seat} for Monk protection.`);}}
    for(const butler of state.players.filter(player=>player.alive&&abilityRole(player)==="butler")){const master=this.strategy.chooseButler(state,butler);butler.masterId=master?.id??null;this.audit("butler_master",`Butler seat ${butler.seat} chose ${master?`seat ${master.seat}`:"nobody"}.`,{actorId:butler.id,targetId:master?.id??null,effective:works(butler)});if(butler.isHuman&&master)state.privateLog.push(`Night ${state.night}: Your Butler master is seat ${master.seat}.`);}
    for(const spy of state.players.filter(player=>player.alive&&player.role==="spy"))this.audit("spy_view",`Spy seat ${spy.seat} viewed all roles.`,{actorId:spy.id,layout:state.players.map(player=>({id:player.id,role:player.role,alive:player.alive}))});
    if(state.night>1)this.resolveDemonAction();
    if(state.winner)return;
    for(const player of state.players){const info=getNightInformation(state,player,this.strategy);if(info)this.remember(player,info);}
    state.day=state.night;state.phase="day";state.executedToday=null;resetDailyTalks(state);
    const talkLimit=getTalkStatus(state).limit;
    this.audit("day_start",`Day ${state.day} began with a conversation limit of ${talkLimit}.`,{dailyTalkLimit:talkLimit},`Day ${state.day}`);
    state.publicLog.push(`Day ${state.day}: ${this.alive().length} players are alive. You may talk to ${talkLimit} distinct player(s).`);
  }

  resolveDemonAction(){
    const state=this.state,demon=state.players.find(player=>player.alive&&player.role==="imp");
    if(!demon){this.finish("good","No living Demon remains.");return;}
    let target=this.strategy.chooseDemonTarget(state,demon);
    if(!target||!target.alive||target.isHuman){this.audit("demon_action",`Demon seat ${demon.seat} had no legal target.`,{actorId:demon.id,outcome:"no-target"});return;}
    const original=target,aliveBefore=this.alive().length;let outcome="killed";
    if(target.role==="soldier"&&works(target))outcome="blocked-by-soldier";
    else if(target.protected)outcome="blocked-by-monk";
    else if(target.role==="mayor"&&works(target)){const redirect=pick(state.players.filter(player=>player.alive&&!player.isHuman&&player.id!==target.id&&player.id!==demon.id),state.rng);if(redirect){target=redirect;outcome="redirected-and-killed";}else outcome="no-death";}
    this.audit("demon_action",`Demon seat ${demon.seat} selected seat ${original.seat}; outcome ${outcome}${target!==original?` at seat ${target.seat}`:""}.`,{actorId:demon.id,targetId:original.id,resolvedTargetId:target.id,outcome});
    if(outcome.includes("killed")){this.kill(target,"demon");if(target===demon)this.handleDemonDeath(target,aliveBefore,true);else this.checkWin();}
  }

  kill(player,cause){
    if(!player?.alive)return false;player.alive=false;player.causeOfDeath=cause;
    this.audit("death",`Seat ${player.seat} (${player.name}) died: ${cause}.`,{playerId:player.id,cause});this.state.publicLog.push(`${player.name} died.`);
    if(cause==="demon"&&abilityRole(player)==="ravenkeeper"){const target=this.strategy.chooseRavenkeeperTarget(this.state,player);if(target){const info=getRavenkeeperInformation(this.state,player,target);this.remember(player,info);this.audit("ravenkeeper_trigger",`Dead Ravenkeeper seat ${player.seat} checked seat ${target.seat}: ${info.text}`,{actorId:player.id,targetId:target.id,information:info.text});}}
    return true;
  }

  askNpc(id){
    const player=this.player(id);if(!player||player.isHuman)throw Error("Select an NPC.");
    const talk=recordTalk(this.state,player.id),response=this.strategy.ask(this.state,player);
    player.interactions.push({type:"conversation",day:this.state.day,alive:player.alive,response});
    this.state.publicLog.push(`Day ${this.state.day} — Seat ${player.seat} claimed ${roleName(player.claimRole)}: ${response}`);
    this.audit("conversation",`Human asked seat ${player.seat} (${player.alive?"alive":"dead"}); ${talk.remaining} conversation slot(s) remain.`,{targetId:player.id,actualRole:player.role,claimRole:player.claimRole,bluffRole:player.bluffRole,response,dailyLimit:talk.limit,usedToday:talk.used,remainingToday:talk.remaining});
    return response;
  }

  buildVoteRecords(nominee,skipped=false){
    const state=this.state,intents=new Map(),records=[];
    for(const voter of state.players){const eligible=voter.alive||voter.ghostVote;let attempted=!skipped&&eligible&&(voter.isHuman?true:this.strategy.vote(state,voter,nominee));let reason=skipped?"vote-skipped":!eligible?"ghost-vote-spent":"did-not-attempt";if(voter.alignment==="evil"&&nominee.alignment==="evil"){attempted=false;reason="evil-will-not-vote-for-evil";}intents.set(voter.id,attempted);records.push({playerId:voter.id,seat:voter.seat,name:voter.name,alive:voter.alive,ghostVoteAvailable:!voter.alive&&voter.ghostVote,attempted,butlerRestricted:false,counted:false,ghostVoteConsumed:false,reason});}
    for(const record of records){const voter=this.player(record.playerId);if(!record.attempted)continue;if(voter.alive&&abilityRole(voter)==="butler"&&works(voter)&&(!voter.masterId||!intents.get(voter.masterId))){record.butlerRestricted=true;record.reason="butler-master-did-not-vote";continue;}record.counted=true;record.reason=voter.alive?"counted":"counted-ghost-vote";if(!voter.alive){voter.ghostVote=false;record.ghostVoteConsumed=true;}}
    return records;
  }

  nominate(id){
    const state=this.state;if(state.winner||state.phase!=="day")throw Error("Nominations are unavailable.");if(state.executedToday)throw Error("This day's nomination has resolved.");const nominee=this.player(id);if(!nominee?.alive||nominee.isHuman)throw Error("Choose a living NPC.");
    this.audit("nomination",`Human nominated seat ${nominee.seat}.`,{nominatorId:state.humanId,nomineeId:nominee.id});
    if(nominee.role==="virgin"&&!state.virginUsed&&works(nominee)&&ROLES[this.human().role].team==="townsfolk"){state.virginUsed=true;const result={nomineeId:nominee.id,count:0,threshold:Math.ceil(this.alive().length/2),executed:false,virginTriggered:true,records:this.buildVoteRecords(nominee,true)};state.lastVoteResult=result;state.executedToday="virgin";this.audit("virgin_trigger","Virgin triggered; solo safeguard spared the human and ended the day.",result);this.advanceAfterDay();return result;}
    const records=this.buildVoteRecords(nominee),count=records.filter(record=>record.counted).length,threshold=Math.ceil(this.alive().length/2),executed=count>=threshold,result={nomineeId:nominee.id,count,threshold,executed,virginTriggered:false,records};
    state.lastVoteResult=result;state.executedToday=nominee.id;
    this.audit("vote_result",`Seat ${nominee.seat}: ${count} votes; ${threshold} required; ${executed?"executed":"not executed"}.`,result);
    for(const record of records)this.audit("vote",`Seat ${record.seat} ${record.counted?"voted":"did not vote"} for seat ${nominee.seat}: ${record.reason}.`,record);
    if(executed){const aliveBefore=this.alive().length;state.lastExecution=nominee.id;this.audit("execution",`Seat ${nominee.seat} was executed.`,{playerId:nominee.id,count,threshold});this.kill(nominee,"execution");if(nominee.role==="saint")this.finish("evil","The Saint was executed.");else if(nominee.role==="imp")this.handleDemonDeath(nominee,aliveBefore,false);else this.checkWin();}
    if(!state.winner)this.advanceAfterDay();return result;
  }

  useSlayer(id){const state=this.state,human=this.human(),target=this.player(id);if(state.phase!=="day"||state.winner||state.slayerUsed||abilityRole(human)!=="slayer"||!target?.alive||target.isHuman)throw Error("Slayer action is unavailable.");state.slayerUsed=true;let hit=false;if(works(human)&&(target.role==="imp"||target.role==="recluse")){const aliveBefore=this.alive().length;hit=this.kill(target,"slayer");if(target.role==="imp")this.handleDemonDeath(target,aliveBefore,false);else this.checkWin();}this.audit("slayer",`Human Slayer chose seat ${target.seat}; ${hit?"the target died":"nothing happened"}.`,{targetId:target.id,hit});return hit;}
  endDayNoExecution(){const state=this.state;if(state.phase!=="day"||state.winner)throw Error("Cannot end the day now.");this.audit("no_execution","Human ended the day without execution.");if(this.alive().length===3&&this.human().role==="mayor"&&works(this.human()))this.finish("good","Mayor final-three no-execution victory.");else this.advanceAfterDay();}
  advanceAfterDay(){if(this.state.winner)return;this.state.night++;this.resolveNight();}
  handleDemonDeath(dead,aliveBefore,selfKill){const state=this.state;let successor=null;if(aliveBefore>=5)successor=state.players.find(player=>player.alive&&player.role==="scarletwoman");if(!successor&&selfKill)successor=state.players.find(player=>player.alive&&ROLES[player.role].team==="minion");if(successor){const old=successor.role;successor.role="imp";successor.team="demon";successor.alignment="evil";this.audit("demon_succession",`Seat ${successor.seat} changed from ${roleName(old)} to Imp.`,{playerId:successor.id,from:old,to:"imp"});}else this.finish("good","The Demon died and no successor was available.");}
  checkWin(){if(this.state.winner)return;if(!this.state.players.some(player=>player.alive&&player.role==="imp"))this.finish("good","No living Demon remains.");else if(this.alive().length<=2)this.finish("evil","Only two players remain alive.");}
  finish(winner,reason){if(this.state.winner)return;this.state.winner=winner;this.state.winReason=reason;this.state.phase="gameover";this.audit("game_over",`${winner.toUpperCase()} wins: ${reason}`,{winner,reason},"Game Over");}
  getReveal(){const state=this.state;if(!state.winner)return null;return {winner:state.winner,reason:state.winReason,players:state.players.map(player=>({seat:player.seat,name:player.name,startingRole:player.startingRole,finalRole:player.role,shownRole:player.shownRole,team:player.team,alignment:player.alignment,claimRole:player.claimRole,bluffRole:player.bluffRole,alive:player.alive,causeOfDeath:player.causeOfDeath,ghostVoteRemaining:player.ghostVote,memories:player.memories,interactions:player.interactions})),events:state.auditEvents.filter(event=>!['vote','vote_result'].includes(event.type))};}
}
