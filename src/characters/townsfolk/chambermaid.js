import { ability, infoMode, wrongNumber, listLabels } from "../../storyteller.js";
import { pick } from "../../util.js";

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

// The Chambermaid, as told by someone claiming it without its ability (see
// bluff.js madeUpChoice()): their 2 "choices", with a number by
// `mode` (see infoMode()).
export const info = {
  choice(s, p, strat, mode) {
    const picks = strat.chambermaid(s, p);

    return picks ? chambermaidInfo(s, picks[0], picks[1], mode) : null;
  },
};

// The Chambermaid: how many of two players woke tonight due to their
// ability.
export function chambermaidInfo(s, a, b, mode) {
  const n = [a, b].filter((x) => (s.woke ?? []).includes(x.id)).length;
  const said =
    mode === "truth"
      ? n
      : mode === "lie"
        ? wrongNumber(s, n)
        : pick([0, 1, 2], s.r);

  return {
    night: s.night,
    role: "chambermaid",
    text: `Chambermaid: ${said} of ${listLabels([a, b])} woke tonight.`,
    targets: [a.id, b.id],
    trigger: "normal",
    functioning: mode === "truth",
  };
}
