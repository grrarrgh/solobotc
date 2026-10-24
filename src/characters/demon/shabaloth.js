import { SHABALOTH_REGURGITATE_CHANCE } from "../../data.js";
import { works, lean, leanNote } from "../../storyteller.js";
import { pick } from "../../util.js";

// The Shabaloth, mixed into Engine.prototype (see characters/index.js),
// so `this` is the Engine.
export const shabaloth = {
  // The Shabaloth might regurgitate a dead player it chose last night.
  regurgitate(d) {
    const s = this.s;
    const dead = s.shabaloth
      .map((id) => this.player(id))
      .filter((x) => x && !x.alive && !x.undead);

    s.shabaloth = [];

    const t = pick(dead, s.r);

    const side = lean(s);
    const chance = !side
      ? SHABALOTH_REGURGITATE_CHANCE
      : t?.alignment === side
        ? 1
        : 0;

    if (t && works(d) && side && chance === 1) {
      leanNote(s, `the Shabaloth regurgitates ${t.label}.`);
    }

    if (t && works(d) && s.r() < chance) {
      this.revive(t, "shabaloth");
    }
  },
};
