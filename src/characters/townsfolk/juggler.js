import { name } from "../../data.js";
import {
  ability,
  infoMode,
  bluffing,
  range,
  wrongNumber,
} from "../../storyteller.js";
import { byId, pick } from "../../util.js";
import { bluffMode } from "../../bluff.js";

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
        this.rememberBluff(p, jugglerInfo(s, guesses, bluffMode(p)));
      }

      p.juggle = null;
    }

    // By their jinx: the living Cannibal who ate a Juggler on the day they
    // juggled learns how many guesses were right (see cannibals()).
    for (const c of s.players.filter((x) => x.cannibalJuggle?.night === s.night)) {
      const { guesses, fromId } = c.cannibalJuggle;

      c.cannibalJuggle = null;

      if (c.alive && c.role === "cannibal") {
        this.remember(c, jugglerInfo(s, guesses, infoMode(s, c), this.player(fromId)));
      }
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

// The Juggler, the night after juggling: how many guesses were right. (Or,
// by their jinx, the Cannibal who ate the Juggler `juggler`.)
export function jugglerInfo(s, guesses, mode, juggler = null) {
  const n = guesses.filter((g) => byId(s, g.id)?.role === g.role).length;
  const options = range(0, guesses.length);
  const said =
    mode === "truth"
      ? n
      : mode === "lie"
        ? (wrongNumber(s, n, options) ?? n)
        : pick(options, s.r);

  return {
    night: s.night,
    role: juggler ? "cannibal" : "juggler",
    text: `${juggler ? "Cannibal" : "Juggler"}: ${said} of ${
      juggler ? `${juggler.label}'s` : "my"
    } ${guesses.length} guess${
      guesses.length === 1 ? "" : "es"
    } ${said === 1 ? "was" : "were"} correct.`,
    targets: guesses.map((g) => g.id),
    trigger: "normal",
    functioning: mode === "truth",
  };
}
