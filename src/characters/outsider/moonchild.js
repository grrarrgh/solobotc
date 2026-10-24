import { name } from "../../data.js";

// The Moonchild, mixed into Engine.prototype (see characters/index.js),
// so `this` is the Engine.
export const moonchild = {
  // Last night's (or today's) Moonchild choice dies tonight if good.
  resolveMoonCurse() {
    const s = this.s;
    const t = this.player(s.moonCurse);

    s.moonCurse = null;

    if (!t?.alive || t.alignment !== "good" || t.protected) {
      return;
    }

    // (The town sees the pick die: maybe a Demon kill, maybe the curse.)
    if (this.kill(t, "moonchild")) {
      this.confirm(
        this.player(s.moonCurseBy),
        "maybe",
        `the player they chose as the Moonchild, ${t.label}, died that night`,
      );
    }

    this.check();
  },

  // A dying Moonchild publicly picks a living player to curse. An evil NPC
  // bluffing Moonchild makes the same show, with no effect.
  moonchild(p) {
    const s = this.s;
    const t = this.strat.moonchild(s, p);

    if (!t) {
      return;
    }

    const real = p.role === "moonchild" && !p.poisoned;

    this.claimPublicly(p);

    if (real) {
      s.moonCurse = t.id;
      s.moonCurseBy = p.id;
    }

    s.publicLog.push(`${p.label} claims Moonchild and chooses ${t.label}.`);

    this.audit(
      "moonchild",
      `${p.label} (${name(p.role)}) chose ${t.label}; ${
        real ? "cursed" : "no effect"
      }.`,
      { actorId: p.id, targetId: t.id, effective: real },
    );
  },
};
