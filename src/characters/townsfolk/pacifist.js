import { PACIFIST_SAVE_CHANCE } from "../../data.js";
import { ability, works, lean, leanNote } from "../../storyteller.js";

// The Pacifist, mixed into Engine.prototype (see characters/index.js),
// so `this` is the Engine.
export const pacifist = {
  // Whether a working Pacifist saves an executed good player.
  pacifistSaves(p) {
    const s = this.s;
    const pacifist = s.players.some(
      (x) => x.alive && ability(x) === "pacifist" && works(x),
    );
    const saves =
      p.alignment === "good" &&
      pacifist &&
      s.r() < ({ good: 1, evil: 0 }[lean(s)] ?? PACIFIST_SAVE_CHANCE);

    // (Only a working Pacifist gives the Storyteller this choice.)
    if (pacifist && lean(s) && p.alignment === "good") {
      leanNote(
        s,
        `the Pacifist ${saves ? "saves" : "doesn't save"} ${p.label}.`,
      );
    }

    if (saves) {
      this.audit(
        "pacifist",
        `${p.label} was executed but survived (Pacifist).`,
        { playerId: p.id },
      );
    }

    return saves;
  },
};
