import { name, team, LEGION_MINSTREL_CHANCE } from "../../data.js";
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

    // By their jinx, an executed Legion might register as a Minion
    // (LEGION_MINSTREL_CHANCE): Legion keep their ability, and the Minstrel
    // learns it was Legion.
    const legion = p.role === "legion";

    if (
      !m ||
      (team(p.role) !== "minion" && !legion) ||
      (legion && s.r() >= LEGION_MINSTREL_CHANCE)
    ) {
      return;
    }

    s.minstrelUntil = s.night + 1;
    s.minstrelBy = `${who(m)}, after ${whose(p)} execution`;
    s.minstrelSparesLegion = legion;
    this.minstrelLasting();

    if (legion) {
      this.remember(m, {
        day: s.day,
        night: s.night,
        role: "minstrel",
        text: `Minstrel: ${p.label}, executed today, was Legion.`,
        targets: [p.id],
        trigger: "day",
        functioning: true,
      });
    }

    this.audit(
      "minstrel",
      `${p.label} (${name(p.role)}) died by execution: everyone but the Minstrel${
        legion ? " and Legion" : ""
      } is drunk until dusk tomorrow.`,
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

    for (const p of s.players.filter(
      (x) => x.role !== "minstrel" && !(s.minstrelSparesLegion && x.role === "legion"),
    )) {
      p.drunkTonight = true;
      p.drunkBy = s.minstrelBy;
    }
  },
};
