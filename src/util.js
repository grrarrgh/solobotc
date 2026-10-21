// Seeded PRNG: FNV-1a hash of the seed feeding a mulberry32 generator.
export function rng(seed) {
  let h = 2166136261;
  for (const c of String(seed)) {
    h ^= c.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }

  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const pick = (a, r = Math.random) =>
  a.length ? a[Math.floor(r() * a.length)] : null;

export function shuffle(a, r = Math.random) {
  a = [...a];
  // `i > 0`, not just `i`: for an empty array i starts at -1, which would
  // count down forever.
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const sample = (a, n, r = Math.random) => shuffle(a, r).slice(0, n);
