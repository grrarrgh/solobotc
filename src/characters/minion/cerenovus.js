import { name } from "../../data.js";
import { works } from "../../storyteller.js";
import { acts } from "../../abilities.js";

// The Cerenovus, mixed into Engine.prototype (see characters/index.js),
// so `this` is the Engine.
export const cerenovus = {
  // The Cerenovus makes a good NPC "mad" about another character tomorrow:
  // all day, they claim that character and say nothing else.
  cerenovus() {
    const s = this.s;
    const c = s.players.find((x) => acts(x) && x.role === "cerenovus");
    const choice = c && this.strat.cerenovus(s, c);

    if (!choice) {
      return;
    }

    this.woke(c);
    this.chose(c, choice.target);

    const effective = works(c);

    if (effective) {
      choice.target.mad = { role: choice.role, day: s.night, previous: null };
    }

    this.audit(
      "cerenovus",
      `${c.label} (Cerenovus) made ${choice.target.label} mad that they are the ${name(
        choice.role,
      )}${effective ? "" : ", but it failed"}.`,
      { actorId: c.id, targetId: choice.target.id, role: choice.role, effective },
    );
  },

  // At dusk, yesterday's madness ends: the player goes back to their claim.
  cerenovusLasting() {
    const s = this.s;

    for (const p of s.players) {
      if (p.mad && p.mad.day < s.night) {
        if (p.mad.previous !== null) {
          p.claim = p.mad.previous;
          p.wasMad = p.mad.role;
        }

        p.mad = null;
      }
    }
  },
};
