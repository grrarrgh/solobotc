import { name } from "../../data.js";
import { isDrunk, bluffing } from "../../storyteller.js";

// The Klutz, mixed into Engine.prototype (see characters/index.js),
// so `this` is the Engine.
export const klutz = {
  // The Klutz, "when you learn that you died", publicly picks a living
  // player; if evil, good loses.
  klutzDeath(p) {
    const sober = !p.poisoned && !isDrunk(p);

    if (
      !p.human &&
      (p.role === "klutz" || bluffing(p, "klutz"))
    ) {
      this.klutz(p, p.role === "klutz" && sober);
    }
  },

  klutz(p, real) {
    const s = this.s;
    const t = this.strat.klutz(s, p);

    if (!t) {
      return;
    }

    this.claimPublicly(p);
    s.publicLog.push(`${p.label} claims Klutz and chooses ${t.label}.`);

    this.audit(
      "klutz",
      `${p.label} (${name(p.role)}) chose ${t.label} (${t.alignment})${
        real ? "" : "; no effect"
      }.`,
      { actorId: p.id, targetId: t.id, effective: real },
    );

    if (real && t.alignment === "evil") {
      this.finish("evil", "The Klutz chose an evil player.");
    }
  },
};
