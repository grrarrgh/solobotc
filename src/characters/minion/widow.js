import { name } from "../../data.js";
import { works, who, isDrunk } from "../../storyteller.js";
import { acts } from "../../abilities.js";
import { byId, pick } from "../../util.js";

// The Widow, mixed into Engine.prototype (see characters/index.js),
// so `this` is the Engine.
export const widow = {
  // Night 1, after the Poisoner: the Widow looks at the Grimoire, so the
  // evil team knows every character as it is tonight (not any change later:
  // see strategy seenRole()), and poisons a player (never herself) for the
  // rest of the game (see widowLasting()). Then 1 good player learns that a
  // Widow is in play (even if her ability failed).
  widows() {
    const s = this.s;
    const w = s.players.find((x) => acts(x) && x.role === "widow");

    if (s.night !== 1 || !w) {
      return;
    }

    const choice = this.strat.widow(s, w);
    // (Never herself.)
    const t = choice === w ? null : choice;

    this.woke(w);

    if (t) {
      this.chose(w, t);
    }

    if (works(w)) {
      s.widowGrimoire = Object.fromEntries(
        s.players.map((x) => [x.id, x.role]),
      );

      if (t) {
        s.widowPick = { widowId: w.id, targetId: t.id };
        t.poisoned = true;
        t.poisonedBy = who(w);
      }
    }

    if (t) {
      this.audit(
        "widow",
        `${w.label} (${name(w.role)}) looked at the Grimoire and chose ${t.label}; ${
          works(w) ? "poisoned for the rest of the game" : "no effect"
        }.`,
        { actorId: w.id, targetId: t.id, effective: works(w) },
      );
    }

    this.widowKnown();
  },

  // 1 living good player learns that a Widow is in play: on Night 1, or the
  // night the Pit-Hag makes one.
  widowKnown() {
    const s = this.s;
    const k = pick(
      s.players.filter((x) => x.alive && x.alignment === "good"),
      s.r,
    );

    if (k) {
      this.woke(k);
      this.remember(k, {
        night: s.night,
        role: "widow",
        text: "Widow: a Widow is in play.",
        targets: [],
        trigger: "normal",
        functioning: true,
      });
    }
  },

  // At dusk: the Widow's choice stays poisoned while she's alive (and still
  // the Widow) with her ability (not drunk).
  widowLasting() {
    const s = this.s;
    const w = byId(s, s.widowPick?.widowId);
    const t = byId(s, s.widowPick?.targetId);

    if (t && w?.role === "widow" && acts(w) && !isDrunk(w)) {
      t.poisoned = true;
      t.poisonedBy = who(w);
    }
  },
};
