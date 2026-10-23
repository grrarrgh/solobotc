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

export const byId = (s, id) => s.players.find((x) => x.id === id);

// A counter that orders what's said, in public and in private, so the
// latest word wins (see claimTo(), heardAbout()).
export const tick = (s) => (s.tick = (s.tick ?? 0) + 1);

// The character `viewer` knows player x claims, first-hand: x's latest
// public claim, or what x told them in private (see strategy told()),
// whichever was said last. Null if x hasn't said. With no viewer, only the
// public claim. (You never claim in public: only to the NPCs you tell; see
// engine tell().)
export function claimTo(x, viewer = null) {
  const told = x && viewer?.toldMe?.[x.id];

  if (!x || x.human) {
    return told?.claim ?? null;
  }

  const open = x.claimKnown ? (x.publicClaim ?? x.claim) : null;

  return told && (!open || told.at > (x.publicAt ?? 0)) ? told.claim : open;
}

// What `viewer` has heard player x claims: first-hand (see claimTo()) or,
// failing that, passed on by someone else (see strategy told()). What they
// decide by (who to kill, protect or guess), but not what they weigh as
// evidence.
export const claimHeard = (x, viewer) =>
  claimTo(x, viewer) ?? (x && viewer?.secondHand?.[x.id]?.claim) ?? null;
