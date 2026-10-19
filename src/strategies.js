import {roleName} from "./data.js";
import {pick,sample} from "./util.js";
export class SimpleNpcStrategy{
  ask(state,npc){if(npc.alignment==="good"){const info=npc.memories.length?npc.memories.map(m=>`Night ${m.night}: ${m.text}`).join(" "):"I have no stored information.";return `I claim ${roleName(npc.claimRole)}. ${info}`;}if(!npc.claimStatement)npc.claimStatement=`I claim ${roleName(npc.claimRole)}. My information suggests seat ${pick(state.players.filter(p=>p.id!==npc.id),state.rng)?.seat??"?"} is suspicious.`;return npc.claimStatement;}
  vote(state,voter,nominee){if(voter.alignment==="evil"&&nominee.alignment==="evil")return false;return state.rng()<(voter.alignment==="evil"?.85:.62);}
  choosePoison(state){return pick(state.players.filter(p=>p.alive&&!p.isHuman&&p.alignment==="good"),state.rng);}
  chooseMonk(state,monk){return pick(state.players.filter(p=>p.alive&&!p.isHuman&&p.id!==monk.id),state.rng);}
  chooseButler(state,butler){return pick(state.players.filter(p=>p.alive&&p.id!==butler.id),state.rng);}
  chooseDemonTarget(state,demon){if(state.rng()<.06)return demon;return pick(state.players.filter(p=>p.alive&&!p.isHuman&&p.id!==demon.id),state.rng);}
  chooseRavenkeeperTarget(state,rk){return pick(state.players.filter(p=>p.id!==rk.id),state.rng);}
  chooseFortuneTellerTargets(state,p){return sample(state.players.filter(q=>q.id!==p.id),2,state.rng);}
}
