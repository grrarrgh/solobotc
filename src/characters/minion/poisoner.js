import { name } from "../../data.js";
import { works, who } from "../../storyteller.js";
import { acts } from "../../abilities.js";

// The Poisoner, mixed into Engine.prototype (see characters/index.js),
// so `this` is the Engine.
export const poisoner = {
  // First in the night, the Poisoner poisons a player tonight and tomorrow.
  poisoners() {
    const s = this.s;
    const poisoner = s.players.find((x) => acts(x) && x.role === "poisoner");

    if (!poisoner) {
      return;
    }

    const t = this.strat.poison(s, poisoner);

    if (t) {
      this.woke(poisoner);
      this.chose(poisoner, t);
    }

    if (t && works(poisoner)) {
      t.poisoned = true;
      t.poisonedBy = who(poisoner);
      s.poisoned = t.id;

      this.audit(
        "poison",
        `${poisoner.label} (${name(poisoner.role)}) selected ${t.label}; poisoned.`,
        {
          actorId: poisoner.id,
          targetId: t.id,
          effective: true,
        },
      );
    }
  },
};
