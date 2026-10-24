import { name, team } from "../../data.js";
import { works } from "../../storyteller.js";
import { acts } from "../../abilities.js";

// The Godfather, mixed into Engine.prototype (see characters/index.js),
// so `this` is the Engine.
export const godfather = {
  // If an Outsider died today, the Godfather kills a player tonight.
  godfather() {
    const s = this.s;
    const g = s.players.find((x) => acts(x) && x.role === "godfather");

    if (!g || !s.outsiderDiedToday || s.winner) {
      return;
    }

    const t = this.strat.godfather(s, g);

    if (!t) {
      return;
    }

    this.woke(g);
    this.chose(g, t);

    const effective = works(g);

    this.audit(
      "godfather",
      `${g.label} (Godfather) chose ${t.label}; ${
        effective ? "attacked" : "the kill failed"
      }.`,
      { actorId: g.id, targetId: t.id, effective },
    );

    if (effective && this.kill(t, "godfather")) {
      this.check();
    }
  },

  // On Night 1, the Godfather learns which Outsiders are in play.
  godfatherFirstNight() {
    const s = this.s;

    for (const g of s.players.filter(
      (x) => x.alive && x.role === "godfather",
    )) {
      const outsiders = s.players.filter((x) => team(x.role) === "outsider");

      this.woke(g);
      g.knownOutsiders = outsiders.map((x) => x.role);

      this.audit(
        "godfather",
        `${g.label} (Godfather) learns the Outsiders in play: ${
          outsiders.map((x) => name(x.role)).join(", ") || "none"
        }.`,
        { actorId: g.id },
      );
    }
  },
};
