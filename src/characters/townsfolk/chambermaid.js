import { ability, infoMode, chambermaidInfo } from "../../storyteller.js";

// The Chambermaid, mixed into Engine.prototype (see characters/index.js),
// so `this` is the Engine.
export const chambermaid = {
  // The Chambermaid wakes late, so she learns about everyone who woke.
  chambermaids() {
    const s = this.s;

    for (const p of s.players.filter(
      (x) => x.alive && ability(x) === "chambermaid",
    )) {
      const picks = this.humanPicks(p) ?? this.strat.chambermaid(s, p);

      if (picks?.length !== 2) {
        continue;
      }

      this.chose(p, picks);
      this.remember(p, chambermaidInfo(s, picks[0], picks[1], infoMode(s, p)));
    }
  },
};
