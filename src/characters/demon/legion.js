import {
  LEGION_NO_DEATH_CHANCE,
  LEGION_SELF_CHANCE,
} from "../../data.js";
import { works, lean, leanNote } from "../../storyteller.js";
import { untwinned } from "../../strategy.js";
import { pick } from "../../util.js";

// Legion, mixed into Engine.prototype (see characters/index.js), so `this`
// is the Engine. Most players are Legion (see setup.js), each of them a
// Demon (and registering as a Minion too).
export const legion = {
  // Each night*, a player might die: the Storyteller chooses. Helping the
  // side lean() names (good: a Legion, never the last one; evil: a good
  // NPC); else nobody at LEGION_NO_DEATH_CHANCE; else a Legion at
  // LEGION_SELF_CHANCE; else a good NPC. Never you, as with any night
  // death. The kill is Legion's: the Monk, Soldier, Mayor and the rest
  // apply, and it fails if no living Legion's ability works (or every one
  // left was chosen by the Exorcist).
  legionNight() {
    const s = this.s;
    const all = s.players.filter((x) => x.alive && x.role === "legion");
    const awake = all.filter((x) => x.exorcised !== s.night);
    const pool = untwinned(
      s,
      s.players.filter((x) => x.alive && !x.human && !s.revived.includes(x.id)),
    );
    // (Never the last Legion: that would end the game for nothing.)
    const legion = all.length > 1 ? pool.filter((x) => x.role === "legion") : [];
    const good = pool.filter((x) => x.alignment === "good");
    const side = lean(s);
    let t = null;
    let why;

    if (side === "good" && legion.length) {
      t = pick(legion, s.r);
      why = "helping good: a Legion";
    } else if (side === "evil" && good.length) {
      t = pick(good, s.r);
      why = "helping evil: a good player";
    } else if (s.r() < LEGION_NO_DEATH_CHANCE) {
      why = `nobody, on the ${Math.round(LEGION_NO_DEATH_CHANCE * 100)}% chance`;
    } else if (legion.length && s.r() < LEGION_SELF_CHANCE) {
      t = pick(legion, s.r);
      why = `a Legion, on the ${Math.round(LEGION_SELF_CHANCE * 100)}% chance`;
    } else {
      t = pick(good, s.r) ?? pick(legion, s.r) ?? null;
      why = t ? `a ${t.alignment} player` : "nobody (no one to choose)";
    }

    if (side) {
      leanNote(s, `who Legion kills: ${t ? t.label : "nobody"}.`);
    }

    // The Legion it comes from: one whose ability works (not the victim,
    // if there's another).
    const by =
      pick(
        awake.filter((x) => works(x) && x !== t),
        s.r,
      ) ??
      pick(awake.filter(works), s.r) ??
      pick(awake, s.r);

    if (!t || !by) {
      this.audit(
        "legion",
        `Legion: nobody dies tonight (why: ${by ? why : "every Legion left was chosen by the Exorcist"}).`,
      );
      return;
    }

    this.audit("legion", `Legion: the Storyteller chooses ${t.label} (why: ${why}).`, {
      targetId: t.id,
    });
    this.woke(by);
    this.attack(by, t);
  },

  // Executions fail if only evil voted: with a living Legion whose ability
  // works, a vote with enough hands to mark the nominee, all of them evil,
  // is counted as 0. Returns whether it was.
  legionVeto(records, threshold) {
    const s = this.s;
    const counted = records.filter((x) => x.counted);

    if (
      counted.length < threshold ||
      !s.players.some((x) => x.alive && x.role === "legion" && works(x)) ||
      !counted.every((x) => this.player(x.playerId).alignment === "evil")
    ) {
      return false;
    }

    for (const x of counted) {
      x.counted = false;
    }

    this.audit(
      "legion",
      `Only evil players voted (${counted.length}), so the Storyteller counts 0 (Legion).`,
    );

    return true;
  },
};
