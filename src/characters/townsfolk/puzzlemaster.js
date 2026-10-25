import { name } from "../../data.js";
import {
  ability,
  isDemon,
  isMinion,
  infoMode,
  bluffing,
  who,
  nameable,
  framed,
} from "../../storyteller.js";
import { untwinned } from "../../strategy.js";
import { pick } from "../../util.js";

// The Puzzlemaster, mixed into Engine.prototype (see characters/index.js),
// so `this` is the Engine.
export const puzzlemaster = {
  // Night 1, before anyone acts (or the night someone gains the ability:
  // see startsTonight()): the Storyteller makes 1 player drunk for
  // the rest of the game, even once the Puzzlemaster dies (s.puzzle). Always
  // a good player: never the Puzzlemaster, a Minion or Demon (whose lost
  // ability would give the game away), or a twin.
  puzzleDrunk() {
    const s = this.s;
    const pm = s.players.find(
      (x) => ability(x) === "puzzlemaster" && this.startsTonight(x),
    );

    if (s.puzzle || !pm) {
      return;
    }

    const pool = untwinned(
      s,
      s.players.filter(
        (x) =>
          x !== pm && x.alignment === "good" && !isMinion(x) && !isDemon(x),
      ),
    );
    const t = pick(pool, s.r);

    if (!t) {
      return;
    }

    s.puzzle = { byId: pm.id, drunkId: t.id };
    t.drunkFrom = "puzzlemaster";
    t.drunkFromBy = who(pm);

    this.audit(
      "puzzlemaster",
      `The Puzzlemaster's puzzle: ${t.label} (${name(t.role)}) is drunk for the rest of the game.`,
      { actorId: pm.id, targetId: t.id },
    );
  },

  // p's one guess at who the puzzle made drunk: they learn "the Demon" (see
  // puzzleInfo()). A bluffer's is always false.
  puzzleGuess(p, t) {
    const s = this.s;
    const real = ability(p) === "puzzlemaster" && !bluffing(p, "puzzlemaster");
    const info = puzzleInfo(s, p, t, real ? infoMode(s, p) : "lie");

    p.puzzleUsed = true;

    if (real) {
      this.remember(p, info);
    } else {
      this.rememberBluff(p, info);
    }

    this.audit(
      "puzzlemaster",
      `${p.label} (${name(p.role)}) guessed ${t.label} is the puzzle's drunk: ${
        info.right ? "right" : "wrong, so false information"
      }.`,
      { actorId: p.id, targetId: t.id, right: info.right },
    );

    return info;
  },

  // At dawn, NPC Puzzlemasters (and Puzzlemaster bluffers) may guess, once
  // (see strategy puzzle()).
  npcPuzzlemasters() {
    const s = this.s;

    for (const p of s.players.filter(
      (x) =>
        !x.human &&
        x.alive &&
        !x.puzzleUsed &&
        (ability(x) === "puzzlemaster" || bluffing(x, "puzzlemaster")),
    )) {
      const t = this.strat.puzzle(s, p);

      if (t) {
        this.puzzleGuess(p, t);
      }
    }
  },

  // The human Puzzlemaster's one guess: player `id`.
  puzzlemaster(id) {
    const s = this.s;
    const h = this.human();
    const t = this.player(id);

    if (
      s.phase !== "day" ||
      s.winner ||
      ability(h) !== "puzzlemaster" ||
      !h.alive ||
      h.puzzleUsed
    ) {
      throw Error("Puzzlemaster unavailable.");
    }

    if (!t || t.human) {
      throw Error("Select another player.");
    }

    return this.puzzleGuess(h, t).text;
  },
};

// The Puzzlemaster's guess (once): `t` is who they think their puzzle made
// drunk (s.puzzle; see characters/townsfolk/puzzlemaster.js). A right guess
// (working: `mode` "truth") learns the Demon; a wrong one, or a misinformed
// Puzzlemaster's, a player who isn't the Demon (the evil team's scapegoat
// first); "random", anyone. Never the human as the "Demon".
export function puzzleInfo(s, p, t, mode) {
  const right = s.puzzle?.drunkId === t.id;
  const named = nameable(s, p).filter((x) => !x.human);
  const d = s.players.find((x) => (x.alive || x.undead) && isDemon(x));
  const goat = framed(s, p);
  const wrong = named.filter((x) => !isDemon(x));
  const shown =
    mode === "truth" && right && d
      ? d
      : mode === "random"
        ? pick(named, s.r)
        : wrong.includes(goat)
          ? goat
          : pick(wrong, s.r);

  return {
    day: s.day,
    night: s.night,
    role: "puzzlemaster",
    text: shown
      ? `Puzzlemaster: guessed ${t.human ? "you are" : `${t.label} is`} drunk; the Demon is ${shown.label}.`
      : `Puzzlemaster: guessed ${t.human ? "you are" : `${t.label} is`} drunk.`,
    // (Only the "Demon": the guess says nothing about anyone.)
    targets: shown ? [shown.id] : [],
    guessId: t.id,
    right,
    trigger: "day",
    functioning: mode === "truth",
  };
}
