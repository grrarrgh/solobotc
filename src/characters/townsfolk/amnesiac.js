import { ability, amnesiacKey } from "../../storyteller.js";

// The Amnesiac's secret abilities: at setup, the Storyteller gives each
// Amnesiac one of these. Each night they learn something, said without
// saying what it means ("Amnesiac: YES.", "Amnesiac: Player 5.",
// "Amnesiac number: 1."), and each day they may guess their ability from
// AMNESIAC_GUESSES, or ask a question about it (AMNESIAC_QUESTIONS).
// `shape` is what the information looks like (AMNESIAC_SHAPES): a guess
// that's wrong but looks the same (the same shape) is "close"; any other
// wrong guess is "not close". `about` is what it's about, for questions.
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
  // if it's correct, close (wrong, but its information looks the same) or
  // not close. (Always truly, even if drunk or poisoned.) Once they're
  // right, they know what their information means.
  amnesiacGuess(p, guess) {
    const s = this.s;
    const g = AMNESIAC_GUESSES[guess];

    if (!g) {
      throw Error("Choose a guess.");
    }

    const key = amnesiacKey(s, p);
    const said =
      guess === key
        ? "correct"
        : g.shape === AMNESIAC_ABILITIES[key].shape
          ? "close"
          : "not close";

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

    this.remember(p, info);

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

  // Good NPC Amnesiacs guess at dawn each day, until they're right.
  npcAmnesiacs() {
    const s = this.s;

    for (const p of s.players.filter(
      (x) =>
        !x.human &&
        x.alive &&
        x.alignment === "good" &&
        ability(x) === "amnesiac" &&
        !x.amnesiacKnown &&
        x.amnesiacDay !== s.day,
    )) {
      amnesiacKey(s, p);

      const guess = this.strat.amnesiacGuess(s, p);

      if (guess) {
        this.amnesiacGuess(p, guess);
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
