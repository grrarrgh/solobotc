import { TINKER_DEATH_CHANCE } from "../../data.js";
import { works, lean, leanNote, leanText } from "../../storyteller.js";
import { isTwin } from "../../strategy.js";

// The Tinker, mixed into Engine.prototype (see characters/index.js),
// so `this` is the Engine.
export const tinker = {
  // The Tinker might die at any time (at night, at TINKER_DEATH_CHANCE).
  tinkers() {
    const s = this.s;

    for (const p of s.players.filter(
      (x) =>
        x.alive && !x.human && x.role === "tinker" && works(x) && !isTwin(s, x),
    )) {
      // (Never while the Storyteller is helping good.)
      if (!s.winner && lean(s) === "good") {
        leanNote(s, `${p.label} (Tinker) doesn't die.`);
      }

      if (s.winner || lean(s) === "good" || s.r() >= TINKER_DEATH_CHANCE) {
        continue;
      }

      this.audit(
        "tinker",
        `${p.label} (Tinker) dies (why: the Storyteller's ${Math.round(
          TINKER_DEATH_CHANCE * 100,
        )}% chance tonight came up; Storyteller ${leanText(s).replace(/\.$/, "")}).`,
        { playerId: p.id },
      );

      if (this.kill(p, "tinker")) {
        this.check();
      }
    }
  },
};
