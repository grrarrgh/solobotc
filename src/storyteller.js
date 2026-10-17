import {ROLES,title} from './data.js';
import {pick,sample} from './util.js';
export const effectiveRole=p=>p.role==='drunk'?p.shownRole:p.role;
export const works=p=>p.alive&&p.role!=='drunk'&&!p.poisoned;
function decide(s,key,chance=.5){if(!(key in s.storyChoices))s.storyChoices[key]=s.rng()<chance;return s.storyChoices[key]}
export function regEvil(s,p,ctx){if(p.role==='recluse')return decide(s,ctx+':recluse:'+p.id,.55);if(p.role==='spy')return !decide(s,ctx+':spyGood:'+p.id,.35);return p.alignment==='evil'}
export function regRole(s,p,ctx){if(p.role==='recluse'&&decide(s,ctx+':recluseRole:'+p.id,.45))return pick(['poisoner','spy','scarletwoman','baron','imp'],s.rng);if(p.role==='spy'&&decide(s,ctx+':spyRole:'+p.id,.4))return p.claim;return p.role}
const alive=s=>s.players.filter(p=>p.alive);
export function neighbours(s,p){const n=s.players.length;for(let d=1;d<n;d++){const l=s.players[(p.id-d+n)%n],r=s.players[(p.id+d)%n];if(l.alive&&r.alive)return[l,r];if(l.alive){for(let e=d+1;e<n;e++){const x=s.players[(p.id+e)%n];if(x.alive)return[l,x]}}if(r.alive){for(let e=d+1;e<n;e++){const x=s.players[(p.id-e+n)%n];if(x.alive)return[x,r]}}}return[]}
function pairInfo(s,kind){
 let candidates=s.players.filter(p=>ROLES[regRole(s,p,'pair:'+kind)].team===kind);
 if(!candidates.length&&kind==='outsider')return 'The Storyteller indicates that no Outsider is in play.';
 if(!candidates.length)return 'No valid result.'; const real=pick(candidates,s.rng),wrong=pick(s.players.filter(p=>p.id!==real.id),s.rng),role=regRole(s,real,'pairRole:'+kind);
 return `${title(role)} is one of Seat ${real.seat} or Seat ${wrong.seat}.`;
}
export function chefNumber(s){let n=0;for(let i=0;i<s.players.length;i++)if(regEvil(s,s.players[i],'chef:'+i)&&regEvil(s,s.players[(i+1)%s.players.length],'chef:'+(i+1)))n++;return n}
export function infoFor(s,p,choice=[]){
 const role=effectiveRole(p), bad=!works(p); let out='';
 if(role==='washerwoman')out=pairInfo(s,'townsfolk');
 if(role==='librarian')out=pairInfo(s,'outsider');
 if(role==='investigator')out=pairInfo(s,'minion');
 if(role==='chef')out=`There ${chefNumber(s)===1?'is':'are'} ${chefNumber(s)} adjacent evil pair${chefNumber(s)===1?'':'s'}.`;
 if(role==='empath')out=`${neighbours(s,p).filter(x=>regEvil(s,x,'empath:'+s.night+':'+p.id+':'+x.id)).length} of your two living neighbours registers evil.`;
 if(role==='fortuneteller'){const chosen=choice.map(id=>s.players[id]);const yes=chosen.some(x=>x&&(x.role==='imp'||x.id===s.redHerring||(x.role==='recluse'&&decide(s,'ft:'+s.night+':'+x.id,.45))));out=yes?'YES: at least one selected seat registers as a Demon.':'NO: neither selected seat registers as a Demon.'}
 if(role==='undertaker')out=s.executedToday==null?'Nobody died by execution today.':`The executed player registers as ${title(regRole(s,s.players[s.executedToday],'undertaker:'+s.night))}.`;
 if(role==='ravenkeeper'){const x=s.players[choice[0]];out=x?`Seat ${x.seat} registers as ${title(regRole(s,x,'raven:'+s.night))}.`:'No seat selected.'}
 if(bad&&out){const nums=['0','1','2'];if(['chef','empath'].includes(role))out=`The Storyteller gives you ${pick(nums,s.rng)}.`;else if(role==='fortuneteller')out=s.rng()<.5?'YES: at least one selected seat registers as a Demon.':'NO: neither selected seat registers as a Demon.';else{const ids=Object.keys(ROLES);out=`The Storyteller indicates ${title(pick(ids,s.rng))} involving Seat ${pick(s.players,s.rng).seat}.`}}
 return out;
}
export function fakeInfo(s,claim){
 if(['washerwoman','librarian','investigator'].includes(claim)){const q=sample(s.players,2,s.rng);return `My first-night result involved ${title(pick(s.script.ids,s.rng))}, Seat ${q[0].seat} or Seat ${q[1].seat}.`}
 if(['chef','empath'].includes(claim))return `My latest number is ${Math.floor(s.rng()*3)}.`;
 if(claim==='fortuneteller'){const q=sample(s.players,2,s.rng);return `I checked Seats ${q[0].seat} and ${q[1].seat}: ${s.rng()<.55?'NO':'YES'}.`}
 if(claim==='undertaker')return s.executedToday==null?'There was no execution to read.':`I learned ${title(pick(s.script.ids,s.rng))}.`;
 return 'I have no shareable information yet.';
}
