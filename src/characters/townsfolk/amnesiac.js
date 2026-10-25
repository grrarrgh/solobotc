import {
  ability,
  amnesiacKey,
  bluffing,
  registersEvil,
  isDemon,
  neigh,
  nameable,
  covered,
  evilNear,
  framed,
  wrongNumber,
  listLabels,
} from "../../storyteller.js";
import { bySeat, pick, sample } from "../../util.js";
import { chefCount } from "./chef.js";
import { empathCount } from "./empath.js";

// The Amnesiac's secret abilities: at setup, the Storyteller gives each
// Amnesiac one of these. Each night they learn something, said without
// saying what it means ("Amnesiac: YES.", "Amnesiac: Player 5.",
// "Amnesiac number: 1."), and each day they may guess their ability from
// AMNESIAC_GUESSES, or ask a question about it (AMNESIAC_QUESTIONS).
// `shape` is what the information looks like (AMNESIAC_SHAPES), and `about`
// is what it's about, for questions and for how close a guess is: BINGO
// (right), HOT (wrong, but its information looks the same), WARM (it looks
// different, but it's about the same thing) or COLD.
export const AMNESIAC_ABILITIES = {
  neighbours: {
    text: "Each night, you learn if either of your alive neighbours is evil.",
    shape: "yesno",
    about: ["alignment", "neighbours"],
  },
  demonneighbour: {
    text: "Each night, you learn if either of your alive neighbours is the Demon.",
    shape: "yesno",
    about: ["demon", "neighbours"],
  },
  goodplayer: {
    text: "Each night, you learn a good player.",
    shape: "player",
    about: ["alignment"],
  },
  evilpair: {
    text: "Each night, you learn 2 players, 1 and only 1 of which is evil.",
    shape: "pair",
    about: ["alignment"],
  },
  evilneighbours: {
    text: "Each night, you learn how many of your alive neighbours are evil.",
    shape: "number",
    about: ["alignment", "neighbours"],
  },
  evilpairs: {
    text: "Each night, you learn how many pairs of evil players are sitting next to each other.",
    shape: "number",
    about: ["alignment"],
  },
};

// What an Amnesiac can guess: their real ability is one of these. (3 of
// each shape.)
export const AMNESIAC_GUESSES = {
  ...AMNESIAC_ABILITIES,
  demonvoted: {
    text: "Each night, you learn if the Demon voted today.",
    shape: "yesno",
    about: ["demon"],
  },
  evilplayer: {
    text: "Each night, you learn an evil player.",
    shape: "player",
    about: ["alignment"],
  },
  notdemon: {
    text: "Each night, you learn a player who is not the Demon.",
    shape: "player",
    about: ["demon"],
  },
  samealignment: {
    text: "Each night, you learn 2 players of the same alignment.",
    shape: "pair",
    about: ["alignment"],
  },
  demonpair: {
    text: "Each night, you learn 2 players, 1 of which is the Demon.",
    shape: "pair",
    about: ["demon"],
  },
  demonsteps: {
    text: "Each night, you learn how many steps the Demon is from you.",
    shape: "number",
    about: ["demon"],
  },
};

// What each shape of information looks like, for grouping guesses.
export const AMNESIAC_SHAPES = {
  yesno: "YES or NO",
  player: "A player",
  pair: "2 players",
  number: "A number",
};

// The yes/no questions an Amnesiac can ask instead of guessing: is their
// ability about this (see `about` above)?
export const AMNESIAC_QUESTIONS = {
  alignment: "Is my ability about who is good or evil?",
  demon: "Is my ability about the Demon?",
  neighbours: "Is my ability about my neighbours?",
};

// The shape of a night's Amnesiac information, from its text (null for
// anything else, like a guess or "No information.").
export const amnesiacShape = (text) =>
  !/^Amnesiac( number)?: /.test(text) || /^Amnesiac: (guessed|asked) /.test(text)
    ? null
    : / number: /.test(text)
      ? "number"
      : /: (YES|NO)\.$/.test(text)
        ? "yesno"
        : / and /.test(text)
          ? "pair"
          : "player";

// The Amnesiac, mixed into Engine.prototype (see characters/index.js),
// so `this` is the Engine. Their secret ability is one of
// AMNESIAC_ABILITIES above (its information is in storyteller.js).
export const amnesiac = {
  // p guesses their ability is AMNESIAC_GUESSES[guess]: the Storyteller says
  // BINGO, HOT, WARM or COLD (see above). (Always truly, even if drunk or
  // poisoned.) Once they're
  // right, they know what their information means. An evil player bluffing
  // the Amnesiac (`bluff`) guesses at the ability they pretend to have.
  amnesiacGuess(p, guess, bluff = false) {
    const s = this.s;
    const g = AMNESIAC_GUESSES[guess];

    if (!g) {
      throw Error("Choose a guess.");
    }

    const key = amnesiacKey(s, p);
    const real = AMNESIAC_ABILITIES[key];
    const said =
      guess === key
        ? "BINGO"
        : g.shape === real.shape
          ? "HOT"
          : g.about.some((x) => real.about.includes(x))
            ? "WARM"
            : "COLD";

    p.amnesiacDay = s.day;
    (p.amnesiacGuessed ??= []).push(guess);
    (p.amnesiacSaid ??= {})[guess] = said;

    if (guess === key) {
      p.amnesiacKnown = true;

      for (const m of p.memories.filter((x) => x.role === "amnesiac")) {
        m.known = true;
      }
    }

    const info = {
      day: s.day,
      night: s.night,
      role: "amnesiac",
      text: `Amnesiac: guessed "${g.text}": ${said}.`,
      targets: [],
      trigger: "day",
      functioning: true,
    };

    if (bluff) {
      this.rememberBluff(p, info);
    } else {
      this.remember(p, info);
    }

    return info;
  },

  // p asks if their ability is about AMNESIAC_QUESTIONS[q] instead of
  // guessing today: the Storyteller says YES or NO (always truly).
  amnesiacAsk(p, q) {
    const s = this.s;

    if (!AMNESIAC_QUESTIONS[q]) {
      throw Error("Choose a question.");
    }

    const yes = AMNESIAC_ABILITIES[amnesiacKey(s, p)].about.includes(q);

    p.amnesiacDay = s.day;
    (p.amnesiacAsked ??= {})[q] = yes;

    const info = {
      day: s.day,
      night: s.night,
      role: "amnesiac",
      text: `Amnesiac: asked "${AMNESIAC_QUESTIONS[q]}": ${yes ? "YES" : "NO"}.`,
      targets: [],
      trigger: "day",
      functioning: true,
    };

    this.remember(p, info);

    return info;
  },

  // Good NPC Amnesiacs guess at dawn each day, until they're right, and so
  // do NPCs bluffing the Amnesiac, so they have guesses to tell too.
  npcAmnesiacs() {
    const s = this.s;

    for (const p of s.players.filter(
      (x) =>
        !x.human &&
        x.alive &&
        ((x.alignment === "good" && ability(x) === "amnesiac") ||
          bluffing(x, "amnesiac")) &&
        !x.amnesiacKnown &&
        x.amnesiacDay !== s.day,
    )) {
      amnesiacKey(s, p);

      const guess = this.strat.amnesiacGuess(s, p);

      if (guess) {
        this.amnesiacGuess(p, guess, ability(p) !== "amnesiac");
      }
    }
  },

  // Whether the human Amnesiac can guess or ask today.
  amnesiacOpen() {
    const s = this.s;
    const h = this.human();

    return (
      s.phase === "day" &&
      !s.winner &&
      ability(h) === "amnesiac" &&
      h.alive &&
      !h.amnesiacKnown &&
      h.amnesiacDay !== s.day
    );
  },

  // The human Amnesiac's daily guess.
  amnesiac(guess) {
    if (!this.amnesiacOpen()) {
      throw Error("Amnesiac unavailable.");
    }

    return this.amnesiacGuess(this.human(), guess).text;
  },

  // Or, instead, the human Amnesiac's daily question.
  amnesiacQuestion(q) {
    if (!this.amnesiacOpen()) {
      throw Error("Amnesiac unavailable.");
    }

    return this.amnesiacAsk(this.human(), q).text;
  },
};

// The Amnesiac's information, said without saying what it means:
// "Amnesiac: YES.", "Amnesiac: Player 5.", "Amnesiac: Player 3 and Player 7.".
const amnesiacYes = (yes, ts) => ({
  targets: ts.map((x) => x.id),
  text: `Amnesiac: ${yes ? "YES" : "NO"}.`,
});
const amnesiacPlayers = (ts) =>
  ts.length
    ? { targets: ts.map((x) => x.id), text: `Amnesiac: ${listLabels(ts)}.` }
    : { targets: [], text: "No information." };
const amnesiacNumber = (n, ts = []) => ({
  targets: ts.map((x) => x.id),
  text: `Amnesiac number: ${n}.`,
});
// Whether a player registers as the Demon (as the Recluse might).
const demonish = (x) => isDemon(x) || x.role === "recluse";

// The Amnesiac: each night, what their secret ability (amnesiacKey()) tells
// them.
export const info = {
  truth(s, p) {
    const key = amnesiacKey(s, p);
    const named = nameable(s, p);

    if (key === "neighbours") {
      return amnesiacYes(neigh(s, p).some(registersEvil), neigh(s, p));
    }

    if (key === "demonneighbour") {
      return amnesiacYes(neigh(s, p).some(demonish), neigh(s, p));
    }

    if (key === "evilneighbours") {
      return amnesiacNumber(empathCount(s, p), neigh(s, p));
    }

    if (key === "evilpairs") {
      return amnesiacNumber(chefCount(s));
    }

    if (key === "goodplayer") {
      return amnesiacPlayers([pick(named.filter((x) => !registersEvil(x)), s.r)].filter(Boolean));
    }

    const bad = pick(named.filter(registersEvil), s.r);
    const good = pick(named.filter((x) => !registersEvil(x)), s.r);

    return amnesiacPlayers(bad && good ? [bad, good] : []);
  },

  // The wrong answer: vouching for an evil player, or framing good ones (the
  // scapegoat first).
  lie(s, p) {
    const key = amnesiacKey(s, p);
    const named = nameable(s, p);
    const good = named.filter((x) => !covered(p, x) && !isDemon(x));
    const mates = p.alignment === "evil" && evilNear(s, p).length > 0;

    // (An evil bluffer next to a teammate says NO, or 0.)
    if (key === "neighbours") {
      return amnesiacYes(!mates && !neigh(s, p).some(registersEvil), neigh(s, p));
    }

    if (key === "demonneighbour") {
      return amnesiacYes(!mates && !neigh(s, p).some(demonish), neigh(s, p));
    }

    if (key === "evilneighbours") {
      return amnesiacNumber(mates ? 0 : wrongNumber(s, empathCount(s, p)), neigh(s, p));
    }

    if (key === "evilpairs") {
      const n = chefCount(s);

      return amnesiacNumber(n > 0 ? n - 1 : n + 1);
    }

    if (key === "goodplayer") {
      const t =
        pick(named.filter((x) => x.alignment === "evil"), s.r) ??
        pick(named, s.r);

      return amnesiacPlayers(t ? [t] : []);
    }

    const goat = framed(s, p);
    const pair = good.includes(goat)
      ? [goat, pick(good.filter((x) => x !== goat), s.r)]
      : sample(good, 2, s.r);

    return amnesiacPlayers(pair.every(Boolean) && pair.length === 2 ? bySeat(pair) : []);
  },

  random(s, p) {
    const key = amnesiacKey(s, p);
    const others = s.players.filter((x) => x.id !== p.id);

    const shape = AMNESIAC_ABILITIES[key].shape;

    return shape === "yesno"
      ? amnesiacYes(s.r() < 0.5, neigh(s, p))
      : shape === "number"
        ? amnesiacNumber(Math.floor(s.r() * 3), key === "evilneighbours" ? neigh(s, p) : [])
        : amnesiacPlayers(sample(others, shape === "player" ? 1 : 2, s.r));
  },
};
