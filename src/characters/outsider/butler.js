import { name } from "../../data.js";
import { ability, works, butlerInfo } from "../../storyteller.js";

// The Butler, mixed into Engine.prototype (see characters/index.js),
// so `this` is the Engine.
export const butler = {
  // Each Butler picks a master for tomorrow's vote.
  butlers() {
    const s = this.s;

    for (const b of s.players.filter(
      (x) => x.alive && ability(x) === "butler",
    )) {
      const t = this.humanPicks(b)?.[0] ?? this.strat.butler(s, b);

      if (!t) {
        continue;
      }

      this.woke(b);
      b.master = t.id;

      this.audit(
        "butler",
        `${b.label} (${name(b.role)}) chose ${t.label} as master.`,
        { actorId: b.id, targetId: t.id, effective: works(b) },
      );

      this.remember(b, butlerInfo(s, t));
    }
  },
};
