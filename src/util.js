export function rngFrom(seed){
  let h=2166136261;
  for(const c of String(seed)){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}
  return ()=>{h+=0x6D2B79F5;let t=h;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};
}
export const pick=(items,rng)=>items.length?items[Math.floor(rng()*items.length)]:null;
export function shuffle(items,rng){const a=[...items];for(let i=a.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
export const sample=(items,n,rng)=>shuffle(items,rng).slice(0,n);