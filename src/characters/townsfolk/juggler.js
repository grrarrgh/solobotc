import { name } from "../../data.js";
import {
  ability,
  works,
  infoMode,
  jugglerInfo,
  bluffing,
} from "../../storyteller.js";

// The Juggler, mixed into Engine.prototype (see characters/index.js),
// so `this` is the Engine.
export const juggler = {
  // The night after juggling, the Juggler learns how many guesses were
  // right. A Juggler bluffer "learns" a number too.
  jugglerNight() {
    const s = this.s;

    for (const p of s.players.filter((x) => x.juggle?.night === s.night)) {
      const { guesses } = p.juggle;

      // (A bluffer, even a good one such as a mad Pixie, makes it up.)
      if (ability(p) === "juggler" && p.alignment === "good") {
        this.remember(p, jugglerInfo(s, guesses, infoMode(s, p)));
      } else {
        const spy = p.role === "spy" && works(p);

        this.rememberBluff(p, jugglerInfo(s, guesses, spy ? "truth" : "lie"));
      }

      p.juggle = null;
    }
  },

  // On Day 1, NPC Jugglers (and Juggler bluffers) publicly guess up to 5
  // players' characters.
  npcJugglers() {
    const s = this.s;

    // Each Juggler juggles once, on their first day as the Juggler (Day 1,
    // unless they became the Juggler later).
    for (const p of s.players.filter(
      (x) =>
        !x.human &&
        x.alive &&
        !x.juggled &&
        (ability(x) === "juggler" || bluffing(x, "juggler")),
    )) {
      const guesses = this.strat.juggle(s, p);

      if (!guesses.length) {
        continue;
      }

      p.juggled = true;
      this.claimPublicly(p);
      p.juggle = { night: s.day + 1, guesses };

      // One guess per line.
      const list = guesses
        .map((g) => `${this.player(g.id).label} is the ${name(g.role)}`)
        .join("\n");

      s.publicLog.push(
        `Day ${s.day} — ${p.label} claims Juggler and guesses:\n${list}`,
      );

      this.audit(
        "juggler",
        `${p.label} (${name(p.role)}) claims Juggler and guesses:\n${list}`,
        { actorId: p.id, guesses },
      );
    }
  },
};
