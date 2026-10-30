import { COUNTS, name } from "../../data.js";

// The Spirit of Ivory (a Fabled: the Storyteller's rule, never dealt),
// mixed into Engine.prototype (see characters/index.js), so `this` is the
// Engine.
//
// "There can't be more than 1 extra evil player": once there's 1 more evil
// player (alive or dead) than the setup sheet's count for the seats (its
// Minions and Demon), anyone who would turn evil stays good. Asked wherever
// a player turns evil (the Mezepheles, the Fang Gu's jump, the Goon, the
// Ogre, a Philosopher-Bounty Hunter's evil Townsfolk). The Snake Charmer's
// swap turns one evil and one good, so it adds none and isn't asked; nor is
// the Bounty Hunter's evil Townsfolk at setup, the first extra.
export const spiritofivory = {
  // Whether the Spirit of Ivory keeps good player p good as `by` would turn
  // them evil (logged when it does). Only with it on the script. (Never
  // draws from s.r.)
  ivoryKeepsGood(p, by) {
    const s = this.s;

    if (!s.script?.fabled?.includes("spiritofivory") || p.alignment === "evil") {
      return false;
    }

    // (Below 8 seats, as in tests, the setup sheet's 1 Minion.)
    const normal = (COUNTS[s.players.length]?.[2] ?? 1) + 1;
    const evil = s.players.filter((x) => x.alignment === "evil").length;

    if (evil <= normal) {
      return false;
    }

    this.audit(
      "spiritofivory",
      `${p.label} (${name(p.role)}) would have turned evil (${by}), but stays good: there are already ${evil} evil players, 1 more than the ${normal} the setup sheet has for ${s.players.length} seats (Spirit of Ivory).`,
      { playerId: p.id, evil, normal },
    );

    return true;
  },
};
