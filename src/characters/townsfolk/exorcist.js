import { name } from "../../data.js";
import { ability, works, isDemon, who, choiceInfo } from "../../storyteller.js";

// The Exorcist, mixed into Engine.prototype (see characters/index.js),
// so `this` is the Engine.
export const exorcist = {
  // From Night 2, the Exorcist chooses a player (not last night's): a chosen
  // Demon learns who the Exorcist is, and doesn't wake tonight.
  exorcists() {
    const s = this.s;

    for (const p of s.players.filter(
      (x) => x.alive && ability(x) === "exorcist",
    )) {
      const t = this.humanPicks(p)?.[0] ?? this.strat.exorcist(s, p);

      if (!t) {
        continue;
      }

      p.lastPicks = { ...p.lastPicks, exorcist: [t.id] };
      this.woke(p);
      this.chose(p, t);

      const hit = works(p) && isDemon(t);

      if (hit) {
        t.exorcised = s.night;
        t.exorcistId = p.id;
      }

      this.audit(
        "exorcist",
        `${p.label} (${name(p.role)}) chose ${t.label}; ${
          hit ? "the Demon learns who they are, and doesn't wake" : "no effect"
        }.`,
        { actorId: p.id, targetId: t.id, effective: hit },
      );

      this.remember(p, choiceInfo(s, "exorcist", "chose", [t]));
    }
  },
};

// The Exorcist, as told by someone claiming it without its ability (see
// storyteller.js madeUpChoice()): the player they "chose" tonight (not on
// Night 1).
export const info = {
  choice(s, p, strat) {
    const t = s.night > 1 ? strat.exorcist(s, p) : null;

    return t ? choiceInfo(s, "exorcist", "chose", [t]) : null;
  },
};
