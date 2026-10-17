import {ROLES,title} from './data.js';
import {effectiveRole,works,infoFor} from './storyteller.js';
import {strategy as defaultStrategy} from './strategies.js';
import {pick,sample} from './util.js';
const living=s=>s.players.filter(p=>p.alive);
function log(s,x){s.publicLog.push(x)}
function privateLog(s,x){if(x)s.privateLog.push(x)}
export function finish(s,winner,reason){s.winner=winner;s.reason=reason;s.phase='ended';log(s,`${winner==='good'?'Good':'Evil'} wins — ${reason}`)}
function promote(s,before,allowAnyMinion){
 const sw=s.players.find(p=>p.alive&&p.role==='scarletwoman'&&works(p));
 const mins=s.players.filter(p=>p.alive&&ROLES[p.role].team==='minion');
 const successor=before>=5&&sw?sw:(allowAnyMinion?pick(mins,s.rng):null);
 if(successor){successor.role='imp';successor.alignment='evil';return true}return false;
}
export function kill(s,p,cause){
 if(!p?.alive||s.winner)return false;const before=living(s).length;p.alive=false;log(s,`Seat ${p.seat} died ${cause==='night'?'during the night':'by '+cause}.`);
 if(p.role==='saint'&&cause==='execution'&&works({...p,alive:true}))finish(s,'evil','the Saint died by execution');
 if(p.role==='imp'&&!s.winner){if(cause==='self-kill'){if(!promote(s,before,true))finish(s,'good','the Demon died with no successor');}else if(!promote(s,before,false))finish(s,'good','the Demon died');}
 if(!s.winner&&living(s).length<=2)finish(s,'evil','only two players remain alive');return true;
}
function chooseOne(cb,label,candidates){return cb?.one?cb.one(label,candidates):candidates[0]?.id}
function chooseTwo(cb,label,candidates){return cb?.two?cb.two(label,candidates):candidates.slice(0,2).map(x=>x.id)}
function humanRole(s){return effectiveRole(s.players[0])}
function addNpcInfo(s,p,choice=[]){const x=infoFor(s,p,choice);if(x)p.memories.push(x)}
export function runNight(s,{first=false,chooser,strategy=defaultStrategy}={}){
 if(s.winner)return;s.phase='night';s.night++;s.protected=null;
 for(const p of s.players)p.poisoned=false;
 const poisoner=s.players.find(p=>p.alive&&p.role==='poisoner');if(poisoner){const t=strategy.choosePoison(s);if(t)t.poisoned=true}
 const human=s.players[0],hrole=humanRole(s);
 if(!first&&hrole==='monk'&&human.alive){const id=chooseOne(chooser,'Choose another living player to protect',s.players.filter(p=>p.alive&&p.id));if(works(human))s.protected=id}
 for(const p of s.players.filter(p=>p.id&&p.alive&&effectiveRole(p)==='monk'&&!first)){const t=strategy.chooseMonk(s,p);if(works(p)&&t)s.protected=t.id}
 if(!first){
  const imp=s.players.find(p=>p.alive&&p.role==='imp');
  if(imp){
   const mins=s.players.filter(p=>p.alive&&ROLES[p.role].team==='minion');
   const target=mins.length&&s.rng()<s.config.impSelfKill?imp:strategy.chooseDemonTarget(s);
   if(target===imp){
    kill(s,imp,'self-kill');
   }else if(target){
    if(target.id===s.protected||target.role==='soldier'){
     log(s,'Nobody died during the night.');
    }else if(target.role==='mayor'&&works(target)&&s.rng()<s.config.mayorRedirect){
     const alt=pick(s.players.filter(p=>p.alive&&p.id!==0&&p.id!==target.id&&p.role!=='imp'),s.rng);
     if(!alt||alt.id===s.protected||alt.role==='soldier')log(s,'Nobody died during the night.');
     else kill(s,alt,'night');
    }else{
     kill(s,target,'night');
    }
    if(!target.alive&&target.originalRole==='ravenkeeper'){
     const q=strategy.chooseRaven(s);if(q)target.memories.push(infoFor(s,target,[q.id]));
    }
   }
  }
 }
 if(s.winner)return;
 const firstRoles=['washerwoman','librarian','investigator','chef'];
 if(first&&firstRoles.includes(hrole))privateLog(s,infoFor(s,human));
 if(human.alive&&hrole==='empath')privateLog(s,infoFor(s,human));
 if(human.alive&&hrole==='fortuneteller'){const ids=chooseTwo(chooser,'Choose two players for Fortune Teller',s.players);privateLog(s,infoFor(s,human,ids))}
 if(!first&&human.alive&&hrole==='undertaker')privateLog(s,infoFor(s,human));
 for(const p of s.players.filter(p=>p.id&&p.alive)){
   const r=effectiveRole(p);if(first&&firstRoles.includes(r))addNpcInfo(s,p);if(r==='empath')addNpcInfo(s,p);if(r==='fortuneteller')addNpcInfo(s,p,sample(s.players,2,s.rng).map(x=>x.id));if(!first&&r==='undertaker')addNpcInfo(s,p);
 }
 if(human.alive&&hrole==='butler'){const id=chooseOne(chooser,'Choose your Butler master',s.players.filter(p=>p.id));human.master=id}
 for(const p of s.players.filter(p=>p.id&&p.alive&&effectiveRole(p)==='butler'))p.master=strategy.chooseButler(s,p)?.id;
 s.executedToday=null;s.day++;s.phase='day';log(s,`Day ${s.day} begins. ${living(s).length} players are alive.`)
}
export function askNpc(s,id,strategy=defaultStrategy){const p=s.players[id];if(!p||!id)return'';return strategy.ask(s,p)}
function resolveVirgin(s,nominee){const h=s.players[0];if(nominee.role!=='virgin'||nominee.used.virgin)return false;nominee.used.virgin=true;if(ROLES[effectiveRole(h)].team==='townsfolk'&&works(h)){log(s,'The Virgin triggered. Solo safeguard prevents the human from dying; the nomination phase ends with no execution.');return true}return false}
export function nominate(s,id,strategy=defaultStrategy){
 if(s.phase!=='day'||s.winner)return null;const n=s.players[id];if(!n?.alive||id===0)return null;
 if(resolveVirgin(s,n))return {ended:true,votes:0,threshold:Math.ceil(living(s).length/2),executed:false};
 const map=new Map([[0,true]]);for(const p of s.players.filter(x=>x.id))map.set(p.id,strategy.vote(s,p,n));
 for(const p of s.players.filter(x=>effectiveRole(x)==='butler'&&x.alive))if(map.get(p.id)&&!map.get(p.master))map.set(p.id,false);
 for(const p of s.players.filter(x=>!x.alive&&map.get(x.id)))p.ghostVote=false;
 const votes=[...map.values()].filter(Boolean).length,threshold=Math.ceil(living(s).length/2),executed=votes>=threshold;
 log(s,`Seat ${n.seat} received ${votes} vote(s); ${threshold} required.`);if(executed){s.executedToday=n.id;kill(s,n,'execution')}else log(s,'No execution occurred.');
 return {ended:true,votes,threshold,executed};
}
export function noExecution(s){if(s.phase!=='day'||s.winner)return;const mayor=s.players.find(p=>p.alive&&p.role==='mayor'&&works(p));if(living(s).length===3&&mayor)finish(s,'good','the Mayor reached three alive with no execution');else log(s,'The day ends without an execution.')}
export function useSlayer(s,id){const h=s.players[0],t=s.players[id];if(s.phase!=='day'||h.used.slayer||effectiveRole(h)!=='slayer'||!t?.alive)return false;h.used.slayer=true;if(works(h)&&(t.role==='imp'||(t.role==='recluse'&&s.rng()<.45))){kill(s,t,'the Slayer ability');return true}log(s,'The Slayer shot had no effect.');return false}
export function aliveCount(s){return living(s).length}
