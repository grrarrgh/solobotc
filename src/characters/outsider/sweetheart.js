import { isDrunk, who } from "../../storyteller.js";

// The Sweetheart, mixed into Engine.prototype (see characters/index.js),
// so `this` is the Engine.
export const sweetheart = {
  // The Sweetheart dies: someone is drunk from now on.
  sweetheartDeath(p) {
    const s = this.s;

    if (p.role !== "sweetheart" || p.poisoned || isDrunk(p)) {
      return;
    }

    const t = this.strat.sweetheart(s, p);

    if (t) {
      t.drunkFrom = "sweetheart";
      t.drunkFromBy = who(p);

      this.audit(
        "sweetheart",
        `${p.label} (Sweetheart) died; ${t.label} is drunk from now on.`,
        { playerId: p.id, drunkId: t.id },
      );
    }
  },
};
