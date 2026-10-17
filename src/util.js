export function rngFrom(seed=Date.now()){let a=seed>>>0;return()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
export const pick=(a,r)=>a[Math.floor(r()*a.length)];
export function shuffle(a,r){a=[...a];for(let i=a.length-1;i;i--){const j=Math.floor(r()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
export function sample(a,n,r){return shuffle(a,r).slice(0,n)}
