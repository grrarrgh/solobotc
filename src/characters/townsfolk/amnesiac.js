import { ability, amnesiacKey } from "../../storyteller.js";

// The Amnesiac's secret abilities: at setup, the Storyteller gives each
// Amnesiac one of these. Each night they learn something, said without
// saying what it means ("Amnesiac: YES.", "Amnesiac: Player 5."), and each
// day they may guess their ability from AMNESIAC_GUESSES. `shape` is what
// the information looks like: a guess that's wrong but looks the same (the
// same shape) is "close"; any other wrong guess is "not close".
export const AMNESIAC_ABILITIES = {
  neighbours: {
    text: "Each night, you learn if either of your alive neighbours is evil.",
    shape: "yesno",
  },
  goodplayer: { text: "Each night, you learn a good player.", shape: "player" },
  evilpair: {
    text: "Each night, you learn 2 players, 1 and only 1 of which is evil.",
    shape: "pair",
  },
};

// What an Amnesiac can guess: their real ability is one of these.
export const AMNESIAC_GUESSES = {
  ...AMNESIAC_ABILITIES,
  demonneighbour: {
    text: "Each night, you learn if either of your alive neighbours is the Demon.",
    shape: "yesno",
  },
  evilplayer: { text: "Each night, you learn an evil player.", shape: "player" },
  samealignment: {
    text: "Each night, you learn 2 players of the same alignment.",
    shape: "pair",
  },
};

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

  // The human Amnesiac's daily guess.
  amnesiac(guess) {
    const s = this.s;
    const h = this.human();

    if (
      s.phase !== "day" ||
      s.winner ||
      ability(h) !== "amnesiac" ||
      !h.alive ||
      h.amnesiacDay === s.day
    ) {
      throw Error("Amnesiac unavailable.");
    }

    return this.amnesiacGuess(h, guess).text;
  },
};
