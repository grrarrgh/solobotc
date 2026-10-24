import { name, team } from "../../data.js";
import { ability, works, who } from "../../storyteller.js";
import { whose } from "../../util.js";

// The Minstrel, mixed into Engine.prototype (see characters/index.js),
// so `this` is the Engine.
export const minstrel = {
  // A Minion died by execution: with a working Minstrel alive, everyone else
  // is drunk until dusk tomorrow.
  minstrel(p) {
    const s = this.s;
    const m = s.players.find(
      (x) => x.alive && ability(x) === "minstrel" && works(x),
    );

    if (!m || team(p.role) !== "minion") {
      return;
    }

    s.minstrelUntil = s.night + 1;
    s.minstrelBy = `${who(m)}, after ${whose(p)} execution`;

    for (const x of s.players.filter((y) => y.role !== "minstrel")) {
      x.drunkTonight = true;
      x.drunkBy = s.minstrelBy;
    }

    this.audit(
      "minstrel",
      `${p.label} (${name(p.role)}) died by execution: everyone but the Minstrel is drunk until dusk tomorrow.`,
      { playerId: p.id },
    );
  },

  // At dusk, after a Minion was executed: everyone but the Minstrel is drunk
  // until dusk tomorrow.
  minstrelLasting() {
    const s = this.s;

    if (!(s.minstrelUntil >= s.night)) {
      return;
    }

    for (const p of s.players.filter((x) => x.role !== "minstrel")) {
      p.drunkTonight = true;
      p.drunkBy = s.minstrelBy;
    }
  },
};
