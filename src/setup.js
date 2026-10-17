import {ROLES,SETUP,alignment,title} from './data.js';
import {pick,sample,shuffle,rngFrom} from './util.js';
export function parseScript(raw){
 const meta=raw.find(x=>typeof x==='object'&&x.id==='_meta')||{name:'Unnamed script'};
 const ids=raw.filter(x=>!(typeof x==='object'&&x.id==='_meta')).map(x=>typeof x==='string'?x:x.id);
 const unknown=ids.filter(id=>!ROLES[id]); if(unknown.length) throw Error(`Unsupported character IDs: ${unknown.join(', ')}`);
 return {meta,ids};
}
export function createGame(script,seats,{seed=Date.now()}={}){
 if(!SETUP[seats]) throw Error('Trouble Brewing supports 5–15 non-Traveller seats in this MVP.');
 const r=rngFrom(seed), pool=t=>script.ids.filter(id=>ROLES[id].team===t);
 let [tf,out,min]=SETUP[seats]; const demons=sample(pool('demon'),1,r); const minions=sample(pool('minion'),min,r);
 if(minions.includes('baron')){tf-=2;out+=2}
 const outsiders=sample(pool('outsider'),out,r), townsfolk=sample(pool('townsfolk'),tf,r);
 if([demons.length,minions.length,outsiders.length,townsfolk.length].join()!=[1,min,out,tf].join()) throw Error('Script lacks enough roles for this seat count.');
 let roles=shuffle([...townsfolk,...outsiders,...minions,...demons],r);
 const goodAt=roles.map((x,i)=>alignment(x)==='good'?i:-1).filter(i=>i>=0); const h=pick(goodAt,r); [roles[0],roles[h]]=[roles[h],roles[0]];
 const inPlay=new Set(roles), unusedTF=pool('townsfolk').filter(x=>!inPlay.has(x));
 const players=roles.map((role,i)=>({id:i,seat:i+1,name:i?'NPC '+i:'You',role,originalRole:role,shownRole:role==='drunk'?pick(unusedTF,r):role,alignment:alignment(role),alive:true,ghostVote:true,claim:null,memories:[],used:{},master:null,poisoned:false,knownClaim:false}));
 const unusedGood=script.ids.filter(id=>alignment(id)==='good'&&!inPlay.has(id));
 const bluffs=sample(unusedGood,Math.min(3,unusedGood.length),r);
 for(const p of players){p.claim=p.alignment==='good'?p.shownRole:(bluffs[p.id%Math.max(1,bluffs.length)]||pick(unusedGood,r)||'chef')}
 const good=players.filter(p=>p.alignment==='good');
 return {script,seats,seed,rng:r,players,humanId:0,bluffs,redHerring:pick(good,r).id,storyChoices:{},day:0,night:0,phase:'night',winner:null,reason:'',executedToday:null,protected:null,publicLog:[],privateLog:[],config:{goodVoteBase:.52,evilVoteForGood:.78,mayorRedirect:.65,impSelfKill:.10}};
}
export function publicPlayer(p){return {id:p.id,seat:p.seat,name:p.name,alive:p.alive,claim:p.knownClaim?title(p.claim):'Unknown'}}
