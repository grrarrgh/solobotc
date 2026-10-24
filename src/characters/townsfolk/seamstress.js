import { ability, infoMode, seamstressInfo } from "../../storyteller.js";

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
