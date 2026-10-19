import {ROLES,roleName} from "./data.js";
import {pick,sample} from "./util.js";
export const abilityRole=p=>p.role==="drunk"?p.shownRole:p.role;
export const works=p=>p.alive&&p.role!=="drunk"&&!p.poisoned;
export function livingNeighbours(state,p){const a=state.players,n=a.length,i=a.indexOf(p),out=[];for(const d of [-1,1])for(let s=1;s<n;s++){const q=a[(i+d*s+n)%n];if(q.alive){out.push(q);break;}}return out;}
export const registersEvil=p=>p.role==="recluse"?true:p.role==="spy"?false:p.alignment==="evil";
const pairWith=(state,target)=>[target,pick(state.players.filter(p=>p.id!==target.id),state.rng)].filter(Boolean);
function truthful(state,p,role,strategy){
  if(["washerwoman","librarian","investigator"].includes(role)){
    const team=role==="washerwoman"?"townsfolk":role==="librarian"?"outsider":"minion";
    let target=pick(state.players.filter(q=>ROLES[q.role].team===team),state.rng);
    if(role==="investigator")target=pick(state.players.filter(q=>ROLES[q.role].team==="minion"||q.role==="recluse"),state.rng);
    if(!target)return {text:"No matching character is in play.",targets:[]};
    const pair=pairWith(state,target);return {text:`One of seats ${pair.map(x=>x.seat).join(" and ")} is ${roleName(target.role)}.`,targets:pair.map(x=>x.id),value:target.role};
  }
  if(role==="chef"){let n=0;state.players.forEach((q,i)=>{if(registersEvil(q)&&registersEvil(state.players[(i+1)%state.players.length]))n++;});return {text:`Chef number: ${n}.`,targets:[],value:n};}
  if(role==="empath"){const ns=livingNeighbours(state,p),n=ns.filter(registersEvil).length;return {text:`Empath number: ${n}.`,targets:ns.map(x=>x.id),value:n};}
  if(role==="fortuneteller"){const ts=strategy.chooseFortuneTellerTargets(state,p),yes=ts.some(x=>x.role==="imp"||x.id===state.redHerring||x.role==="recluse");return {text:`Fortune Teller: ${yes?"YES":"NO"} for seats ${ts.map(x=>x.seat).join(" and ")}.`,targets:ts.map(x=>x.id),value:yes};}
  if(role==="undertaker"){const q=state.lastExecution?state.players.find(x=>x.id===state.lastExecution):null;return q?{text:`Yesterday's executed player was ${roleName(q.role)}.`,targets:[q.id],value:q.role}:{text:"Nobody was executed yesterday.",targets:[]};}
  return null;
}
function falseInfo(state,p,role,strategy){
  if(["chef","empath"].includes(role)){const n=Math.floor(state.rng()*3);return {text:`${roleName(role)} number: ${n}.`,targets:[],value:n};}
  if(role==="fortuneteller"){const ts=strategy.chooseFortuneTellerTargets(state,p),yes=state.rng()<.5;return {text:`Fortune Teller: ${yes?"YES":"NO"} for seats ${ts.map(x=>x.seat).join(" and ")}.`,targets:ts.map(x=>x.id),value:yes};}
  if(role==="undertaker"){const fake=pick(Object.keys(ROLES),state.rng);return {text:`Yesterday's executed player was ${roleName(fake)}.`,targets:state.lastExecution?[state.lastExecution]:[],value:fake};}
  const seats=sample(state.players.filter(x=>x.id!==p.id),2,state.rng),fake=pick(Object.keys(ROLES),state.rng);return {text:`One of seats ${seats.map(x=>x.seat).join(" and ")} is ${roleName(fake)}.`,targets:seats.map(x=>x.id),value:fake};
}
export function infoTiming(role){if(["washerwoman","librarian","investigator","chef"].includes(role))return "first";if(["empath","fortuneteller"].includes(role))return "each";if(role==="undertaker")return "other";return null;}
export function getNightInformation(state,p,strategy){if(!p.alive)return null;const role=abilityRole(p),timing=infoTiming(role);if(!timing||state.night===1&&timing==="other"||state.night>1&&timing==="first")return null;const result=works(p)?truthful(state,p,role,strategy):falseInfo(state,p,role,strategy);return result?{...result,role,night:state.night,trigger:"normal",functioning:works(p)}:null;}
export function getRavenkeeperInformation(state,p,target){const functioning=p.role!=="drunk"&&!p.poisoned,seen=functioning?target.role:pick(Object.keys(ROLES),state.rng);return {role:"ravenkeeper",night:state.night,trigger:"death",functioning,targets:[target.id],value:seen,text:`Seat ${target.seat} is ${roleName(seen)}.`};}
