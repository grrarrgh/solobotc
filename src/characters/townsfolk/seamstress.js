import { ability, infoMode, registersEvil, listLabels } from "../../storyteller.js";

// The Seamstress, mixed into Engine.prototype (see characters/index.js),
// so `this` is the Engine.
export const seamstress = {
  // Once per game, a Seamstress learns if two players share an alignment.
  // The human chooses when (or skips); NPCs pick a night at random.
  seamstresses() {
    const s = this.s;

    for (const p of s.players.filter(
      (x) => x.alive && ability(x) === "seamstress" && !x.seamUsed,
    )) {
      const picks = p.human ? this.humanPicks(p) : this.strat.seamstress(s, p);

      if (picks?.length !== 2) {
        continue;
      }

      p.seamUsed = true;
      this.remember(p, seamstressInfo(s, picks[0], picks[1], infoMode(s, p)));
    }
  },
};

// The Seamstress, as told by an evil bluffer (see bluff.js bluffTonight()):
// once per game, on a night of their choosing, 2 players and an answer by
// `mode` (see bluffMode()); null on other nights.
export const info = {
  once(s, p, strat, mode) {
    const picks = !p.seamUsed && strat.seamstress(s, p);

    if (!picks) {
      return null;
    }

    p.seamUsed = true;

    return seamstressInfo(s, picks[0], picks[1], mode);
  },
};

// The Seamstress: are these two players the same alignment?
export function seamstressInfo(s, a, b, mode) {
  const same = registersEvil(a) === registersEvil(b);
  const say = mode === "truth" ? same : mode === "lie" ? !same : s.r() < 0.5;

  return {
    night: s.night,
    role: "seamstress",
    text: `Seamstress: ${listLabels([a, b])} are ${
      say ? "the same alignment" : "different alignments"
    }.`,
    targets: [a.id, b.id],
    trigger: "normal",
    functioning: mode === "truth",
  };
}
