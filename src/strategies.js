import {fakeInfo} from './storyteller.js';
import {title,valueRoles} from './data.js';
import {pick} from './util.js';
export class SimpleNpcStrategy{
 ask(s,p){p.knownClaim=true;if(p.alignment==='good'){const info=p.memories.at(-1)||'I have no result to add.';return `I claim ${title(p.claim)}. ${info}`;}p.fake??=fakeInfo(s,p.claim);return `I claim ${title(p.claim)}. ${p.fake}`}
 vote(s,voter,nominee){
  if(!voter.alive&&!voter.ghostVote)return false;
  if(voter.alignment==='evil'&&nominee.alignment==='evil')return false;
  if(voter.alignment==='evil')return s.rng()<s.config.evilVoteForGood;
  const duplicate=s.players.filter(x=>x.alive&&x.knownClaim&&x.claim===nominee.claim).length>1;
  let chance=s.config.goodVoteBase+(duplicate?.22:0)+(nominee.knownClaim&&valueRoles.has(nominee.claim)?.05:0)+Math.min(.12,s.day*.02);
  return s.rng()<chance;
 }
 choosePoison(s){return pick(s.players.filter(p=>p.alive&&p.id!==s.humanId&&p.alignment==='good'),s.rng)}
 chooseMonk(s,p){return pick(s.players.filter(x=>x.alive&&x.id!==p.id&&x.alignment==='good'),s.rng)}
 chooseButler(s,p){return pick(s.players.filter(x=>x.id!==p.id),s.rng)}
 chooseDemonTarget(s){const candidates=s.players.filter(p=>p.alive&&p.id!==s.humanId&&p.alignment==='good');return pick(candidates,s.rng)}
 chooseRaven(s){return pick(s.players.filter(p=>p.id!==s.humanId),s.rng)}
}
export const strategy=new SimpleNpcStrategy();
