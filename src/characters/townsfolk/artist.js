import { ARTIST_QUESTIONS, HUMAN_ARTIST_QUESTIONS, team } from "../../data.js";
import {
  ability,
  infoMode,
  bluffing,
  registersEvil,
  isDemon,
  listLabels,
  lean,
  leanRegistersEvil,
} from "../../storyteller.js";
import { dayBluff } from "../../bluff.js";

// The Artist, mixed into Engine.prototype (see characters/index.js),
// so `this` is the Engine.
export const artist = {
  // At dawn, NPC Artists (and NPCs bluffing Artist; see bluffing()) ask their question.
  npcArtists() {
    const s = this.s;

    for (const p of s.players) {
      const claimsArtist = ability(p) === "artist" || bluffing(p, "artist");

      if (s.winner || p.human || !p.alive || p.artistUsed || !claimsArtist) {
        continue;
      }

      const ask = this.strat.artist(s, p);

      if (!ask) {
        continue;
      }

      p.artistUsed = true;

      if (ability(p) === "artist" && p.alignment === "good") {
        this.remember(
          p,
          artistInfo(s, ask.targets, ask.question, infoMode(s, p)),
        );
      } else {
        this.rememberBluff(
          p,
          dayBluff(s, p, "artist", this.strat, (mode) =>
            artistInfo(s, ask.targets, ask.question, mode),
          ),
        );
      }
    }
  },

  // Once per game, the human Artist asks the Storyteller a yes/no question
  // about one or more players, dead or alive (`ids`): "Is there a ...
  // among them?" (see HUMAN_ARTIST_QUESTIONS).
  artist(ids, question) {
    const s = this.s;
    const h = this.human();
    const ts = [].concat(ids).map((id) => this.player(id));

    if (
      s.phase !== "day" ||
      s.winner ||
      ability(h) !== "artist" ||
      h.artistUsed ||
      !h.alive ||
      !ts.length ||
      ts.some((t) => !t || t.human) ||
      !HUMAN_ARTIST_QUESTIONS[question]
    ) {
      throw Error("Artist unavailable.");
    }

    h.artistUsed = true;

    const info = artistInfo(s, ts, question, infoMode(s, h));

    // (log.txt has it: see engine remember().)
    this.remember(h, info);

    return info.text;
  },
};

// Whether "t is <evil / the Demon / a Minion / ...>" is true (as t
// registers): an Artist's question, or a Gossip's statement. With `s`, the
// Artist's question: how a Recluse or Spy registers goes by the
// Storyteller's lean (see leanRegistersEvil()).
export const artistTruth = (t, q, s = null) =>
  q === "good"
    ? !artistTruth(t, "evil", s)
    : q === "evil"
    ? s
      ? leanRegistersEvil(s, t)
      : registersEvil(t)
    : q === "demon"
      ? isDemon(t)
      : team(t.role) === q;

// The Storyteller's yes/no answer to an Artist asking about one or more
// players ("is any of them ...?"). `mode` is "truth", "lie" (an evil bluffer,
// or a Drunk or poisoned Artist) or "random".
export function artistInfo(s, targets, q, mode) {
  const ts = [].concat(targets);
  const truth = ts.some((t) => artistTruth(t, q, s));
  // (A Recluse or Spy the lean decided, for the log.)
  const decided = q === "evil" && ts.filter((t) => artistTruth(t, q, s) !== registersEvil(t));
  const yes =
    mode === "truth" ? truth : mode === "lie" ? !truth : s.r() < 0.5;
  const who = ts.length > 1 ? `any of ${listLabels(ts)}` : ts[0].label;

  return {
    day: s.day,
    night: s.night,
    role: "artist",
    text: `Artist: asked if ${who} is ${(ARTIST_QUESTIONS[q] ?? HUMAN_ARTIST_QUESTIONS[q])}: ${
      yes ? "YES" : "NO"
    }.`,
    targets: ts.map((t) => t.id),
    trigger: "day",
    functioning: mode === "truth",
    logNote: decided.length
      ? `the Storyteller, leaning ${lean(s)}, has ${listLabels(decided)} register as ${
          decided[0].alignment
        }`
      : null,
  };
}

// How the Artist's answer reads (see strategy stanceOn()).
export const info = {
  stance(m) {
    const yes = /: YES\.$/.test(m.text);

    if (/ is (evil|the Demon|a Minion):/.test(m.text)) {
      return yes ? "suspicious" : "trust";
    }

    // (Asked if they're good: a NO says they're all evil; a YES vouches
    // for a player asked about alone.)
    if (/ is good:/.test(m.text)) {
      return yes ? ((m.targets ?? []).length === 1 ? "trust" : null) : "suspicious";
    }

    return / is a Townsfolk:/.test(m.text) ? (yes ? "trust" : "suspicious") : null;
  },
};
