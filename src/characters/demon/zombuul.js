import { works } from "../../storyteller.js";

// The Zombuul, mixed into Engine.prototype (see characters/index.js),
// so `this` is the Engine.
export const zombuul = {
  // The Zombuul's first death: it lives, but registers as dead. Returns
  // whether that happened (the death still looks real to everyone).
  zombuulLives(p) {
    if (p.role !== "zombuul" || p.zombuulUsed || !works(p)) {
      return false;
    }

    p.zombuulUsed = true;
    p.undead = true;

    this.audit(
      "zombuul",
      `${p.label} (Zombuul) seems to die, but lives on, registering as dead.`,
      { playerId: p.id },
    );

    return true;
  },

  // A Zombuul that registers as dead, killed again (executed, usually): this
  // time it dies.
  zombuulDies(p, cause) {
    p.undead = false;
    p.death = cause;

    this.audit("zombuul", `${p.label} (Zombuul) died for good: ${cause}.`, {
      playerId: p.id,
      cause,
    });

    return true;
  },
};
