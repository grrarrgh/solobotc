import { works } from "../../storyteller.js";
import { acts } from "../../abilities.js";

// The Witch, mixed into Engine.prototype (see characters/index.js),
// so `this` is the Engine.
export const witch = {
  // The Witch curses a player: if they nominate tomorrow, they die. With just
  // 3 players alive, the Witch loses this ability.
  witch() {
    const s = this.s;
    const w = s.players.find((x) => acts(x) && x.role === "witch");

    s.witched = null;

    if (!w || this.alive().length <= 3) {
      return;
    }

    const t = this.strat.witch(s, w);

    if (!t) {
      return;
    }

    this.woke(w);
    this.chose(w, t);

    const effective = works(w);

    s.witched = { targetId: t.id, day: s.night, effective };

    this.audit(
      "witch",
      `${w.label} (Witch) cursed ${t.label}; ${
        effective ? "they die if they nominate tomorrow" : "the curse failed"
      }.`,
      { actorId: w.id, targetId: t.id, effective },
    );
  },

  // A cursed nominator dies as they nominate (the nomination still happens).
  witchCurse(nominator) {
    const s = this.s;
    const w = s.witched;

    if (
      w?.effective &&
      w.targetId === nominator.id &&
      w.day === s.day &&
      this.alive().length > 3 &&
      this.kill(nominator, "witch")
    ) {
      this.audit(
        "witch",
        `${nominator.label} nominated while cursed by the Witch, and died.`,
        { playerId: nominator.id },
      );
      this.check();
    }
  },
};
