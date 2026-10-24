import { name } from "../../data.js";
import {
  ability,
  isDemon,
  infoMode,
  bluffing,
  steer,
  who,
  puzzleInfo,
} from "../../storyteller.js";
import { untwinned } from "../../strategy.js";
import { pick } from "../../util.js";

// The Puzzlemaster, mixed into Engine.prototype (see characters/index.js),
// so `this` is the Engine.
export const puzzlemaster = {
  // Night 1, before anyone acts: the Storyteller makes 1 player drunk for
  // the rest of the game, even once the Puzzlemaster dies (s.puzzle). Never
  // the Puzzlemaster, the Demon (who could never kill again) or a twin. A
  // drunk evil player helps good, a drunk good one helps evil (see steer()).
  puzzleDrunk() {
    const s = this.s;
    const pm = s.players.find((x) => x.role === "puzzlemaster");

    if (s.night !== 1 || s.puzzle || !pm) {
      return;
    }

    const pool = untwinned(
      s,
      s.players.filter((x) => x !== pm && !isDemon(x)),
    );
    const t = pick(
      steer(
        s,
        pool,
        (x) => (x.alignment === "evil" ? "good" : "evil"),
        "who the Puzzlemaster's puzzle makes drunk",
      ),
      s.r,
    );

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
