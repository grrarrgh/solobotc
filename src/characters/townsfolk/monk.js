import { name } from "../../data.js";
import { ability, works, monkInfo } from "../../storyteller.js";

// The Monk, mixed into Engine.prototype (see characters/index.js),
// so `this` is the Engine.
export const monk = {
  // From Night 2, the Monk protects a player (not themself) from the Demon.
  monks() {
    const s = this.s;

    for (const m of s.players.filter(
      (x) => x.alive && ability(x) === "monk",
    )) {
      const t = this.humanPicks(m)?.[0] ?? this.strat.monk(s, m);

      if (!t) {
        continue;
      }

      this.woke(m);
      this.chose(m, t);

      const effective = works(m);

      if (effective) {
        t.protected = true;
        t.protectedBy = m.id;
      }

      this.audit(
        "monk",
        `${m.label} (${name(m.role)}) chose ${t.label}; ${
          effective ? "protected" : "protection failed"
        }.`,
        {
          actorId: m.id,
          targetId: t.id,
          effective,
        },
      );

      this.remember(m, monkInfo(s, t, effective));
    }
  },
};
