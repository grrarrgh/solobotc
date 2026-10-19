import {ROLES,SETUP_COUNTS,GOOD_TEAMS,HUMAN_FORBIDDEN_ROLES,alignmentOf,roleName} from "./data.js";
import {rngFrom,pick,sample,shuffle} from "./util.js";
export function parseScript(raw){
  if(!Array.isArray(raw))throw Error("Script must be a JSON array.");
  const meta=raw.find(x=>x&&typeof x==="object"&&x.id==="_meta")??{name:"Unnamed"};
  const roleIds=raw.filter(x=>typeof x==="string"),unknown=roleIds.filter(id=>!ROLES[id]);
  if(unknown.length)throw Error(`Unsupported roles: ${unknown.join(", ")}`);
  return {meta,roleIds};
}
const byTeam=(script,team)=>script.roleIds.filter(id=>ROLES[id].team===team);
const validHumanRole=role=>GOOD_TEAMS.has(ROLES[role].team)&&!HUMAN_FORBIDDEN_ROLES.has(role);
export function createGameState(raw,seatCount,seed=Date.now()){
  const script=parseScript(raw),base=SETUP_COUNTS[seatCount];
  if(!base)throw Error("Seat count must be 5–15.");
  const rng=rngFrom(seed);let [tf,outs,mins]=base;
  const minions=sample(byTeam(script,"minion"),mins,rng);
  if(minions.includes("baron")){tf-=2;outs+=2;}
  const townsfolk=sample(byTeam(script,"townsfolk"),tf,rng),outsiders=sample(byTeam(script,"outsider"),outs,rng),demons=sample(byTeam(script,"demon"),1,rng);
  let roles=shuffle([...townsfolk,...outsiders,...minions,...demons],rng);
  if(roles.length!==seatCount)throw Error("Script cannot satisfy this setup.");

  let humanIndexes=roles.map((role,index)=>validHumanRole(role)?index:-1).filter(index=>index>=0);
  if(!humanIndexes.length){
    const replaceIndex=roles.findIndex(role=>GOOD_TEAMS.has(ROLES[role].team));
    const unusedAllowed=byTeam(script,"townsfolk").filter(role=>!roles.includes(role)&&validHumanRole(role));
    const replacement=pick(unusedAllowed,rng);
    if(replaceIndex<0||!replacement)throw Error("No solo-safe human role is available in this setup.");
    roles[replaceIndex]=replacement;
    humanIndexes=[replaceIndex];
  }
  const humanIndex=pick(humanIndexes,rng);[roles[0],roles[humanIndex]]=[roles[humanIndex],roles[0]];

  const inPlay=new Set(roles),unusedTF=shuffle(byTeam(script,"townsfolk").filter(id=>!inPlay.has(id)),rng);
  const players=roles.map((role,i)=>{const shownRole=role==="drunk"?(unusedTF.shift()??"washerwoman"):role;return{id:`p${i+1}`,seat:i+1,name:i?`Player ${i+1}`:"You",isHuman:i===0,startingRole:role,role,shownRole,team:ROLES[role].team,alignment:alignmentOf(role),alive:true,ghostVote:true,poisoned:false,protected:false,masterId:null,claimRole:shownRole,bluffRole:null,claimStatement:null,memories:[],interactions:[],causeOfDeath:null};});
  const unusedGood=script.roleIds.filter(id=>GOOD_TEAMS.has(ROLES[id].team)&&!inPlay.has(id)),bluffs=sample(unusedGood,3,rng);
  players.filter(p=>p.alignment==="evil").forEach((p,i)=>{p.bluffRole=bluffs[i%Math.max(1,bluffs.length)]??"chef";p.claimRole=p.bluffRole;});
  const redHerring=pick(players.filter(p=>p.alignment==="good"&&p.role!=="fortuneteller"),rng)?.id??null;
  const state={version:"2.2.0",seed:String(seed),script,seatCount,rng,players,humanId:players[0].id,phase:"night",day:0,night:1,winner:null,winReason:null,publicLog:[],privateLog:[],auditEvents:[],nextAuditId:1,poisonedId:null,protectedId:null,redHerring,lastExecution:null,executedToday:null,lastVoteResult:null,virginUsed:false,slayerUsed:false,talkedToToday:[],talkDay:0};
  for(const p of players)state.auditEvents.push({id:state.nextAuditId++,group:"Setup",type:"setup_player",summary:`Seat ${p.seat} was ${roleName(p.role)}; shown ${roleName(p.shownRole)}; claim ${roleName(p.claimRole)}.`,data:{playerId:p.id,role:p.role,shownRole:p.shownRole,alignment:p.alignment,claimRole:p.claimRole,bluffRole:p.bluffRole}});
  state.auditEvents.push({id:state.nextAuditId++,group:"Setup",type:"setup_complete",summary:`Created ${seatCount} seats with seed ${seed}${minions.includes("baron")?"; Baron changed the counts":""}.`,data:{baron:minions.includes("baron"),redHerring}});
  return state;
}