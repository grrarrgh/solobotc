import { name } from "../../data.js";
import { works } from "../../storyteller.js";
import { acts } from "../../abilities.js";

// The Assassin, mixed into Engine.prototype (see characters/index.js),
// so `this` is the Engine.
export const assassin = {
  // Once per game, the Assassin kills a player; nothing can stop it.
  assassin() {
    const s = this.s;
    const a = s.players.find(
      (x) => acts(x) && x.role === "assassin" && !x.assassinUsed,
    );

    if (!a) {
      return;
    }

    // The Assassin wakes each night until they use their ability.
    this.woke(a);

    const t = this.strat.assassin(s, a);

    if (!t) {
      return;
    }

    this.chose(a, t);

    const effective = works(a);

    a.assassinUsed = true;

    this.audit(
      "assassin",
      `${a.label} (${name(a.role)}) chose ${t.label}; ${
        effective ? "killed" : "the kill failed"
      }.`,
      { actorId: a.id, targetId: t.id, effective },
    );

    if (effective && this.kill(t, "assassin")) {
      this.check();
    }
  },
};
