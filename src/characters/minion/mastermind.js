import { works } from "../../storyteller.js";

// The Mastermind, mixed into Engine.prototype (see characters/index.js),
// so `this` is the Engine.
export const mastermind = {
  // The Demon died by execution with a working Mastermind alive (or dead,
  // kept going by the Vigormortis, even once it dies: their jinx): play one
  // more day. Returns whether that happened.
  mastermindContinues() {
    const s = this.s;
    const m = s.players.find(
      (x) => (x.alive || x.vigor) && x.role === "mastermind" && works(x),
    );

    if (!m || s.mastermindDay || s.mastermindDone) {
      return false;
    }

    s.mastermindDay = s.day + 1;

    this.audit(
      "mastermind",
      `The Demon was executed, but ${m.label} (Mastermind) lives: play for 1 more day.`,
      { playerId: m.id },
    );

    return true;
  },

  // The end of the Mastermind's extra day: whoever was executed loses with
  // their team; with nobody executed, good wins.
  mastermindEnd(p) {
    const s = this.s;

    if (s.mastermindDay !== s.day || s.winner) {
      return;
    }

    if (!p) {
      this.finish("good", "Nobody was executed on the Mastermind's extra day.");
    } else if (p.alignment === "good") {
      this.finish("evil", "A good player was executed on the Mastermind's extra day.");
    } else {
      this.finish("good", "An evil player was executed on the Mastermind's extra day.");
    }

    // (Good's win can be held off, while both twins live: the game goes on
    // as usual, without a Demon. Else check() would never end it.)
    if (!s.winner) {
      s.mastermindDay = null;
      s.mastermindDone = true;
      this.audit("mastermind", "The Mastermind's extra day is over, but the game goes on.");
    }
  },
};
