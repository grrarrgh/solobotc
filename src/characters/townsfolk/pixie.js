import { name } from "../../data.js";
import { works } from "../../storyteller.js";
import { claimHeard } from "../../strategy.js";

// An NPC pretending to be the Pixie: an evil player, or the Lunatic, whose
// bluff it is.
const pixieBluffer = (x) =>
  !x.human && (x.alignment === "evil" || x.role === "lunatic") && x.bluff === "pixie";

// The Pixie, mixed into Engine.prototype (see characters/index.js),
// so `this` is the Engine.
export const pixie = {
  // An NPC Pixie becomes "mad" about the Townsfolk they learned on Night 1:
  // from Day 1 they claim it (with made-up information to match; see
  // strategy ask()), so they can gain its ability. An evil Pixie bluffer
  // does the same with the one they "learned", so they act like one.
  // Either way, they never claim the Pixie while alive (see strategy
  // revealsWhenDead()).
  pixieMadness() {
    const s = this.s;

    for (const p of s.players.filter(
      (x) =>
        x.alive &&
        !x.human &&
        (x.role === "pixie" || pixieBluffer(x)) &&
        x.pixieRole &&
        !x.pixieMad,
    )) {
      p.pixieMad = true;

      // (Made mad by the Cerenovus today too: that claim stands, and they go
      // back to the Pixie's character when it ends, never to the Pixie.)
      if (p.mad?.day === s.day && p.mad.previous) {
        p.mad.previous = p.pixieRole;
      } else {
        p.claim = p.pixieRole;
      }

      this.audit(
        "pixie",
        `${p.label} (${
          p.role === "pixie" ? "Pixie" : `${name(p.role)}, bluffing Pixie`
        }) is mad that they are the ${name(p.pixieRole)}, and claims it.`,
        { playerId: p.id, role: p.pixieRole },
      );
    }
  },

  // When the holder of a mad Pixie's character dies, a working Pixie gains
  // their ability. They keep claiming that character (now truly theirs),
  // and say nothing of the Pixie.
  pixieGains(dead) {
    for (const p of this.s.players.filter(
      (x) =>
        x.alive &&
        x.role === "pixie" &&
        x.pixieMad &&
        !x.gained &&
        x.pixieRole === dead.role &&
        works(x),
    )) {
      p.gained = dead.role;

      this.audit(
        "pixie",
        `${dead.label} (${name(dead.role)}) died: ${p.label} (Pixie) gains the ${name(
          dead.role,
        )} ability.`,
        { playerId: p.id, role: dead.role },
      );
    }

    // An evil Pixie bluffer "gains" it too, when someone they know claimed
    // (or was) that character dies, and goes on bluffing it.
    for (const p of this.s.players.filter(
      (x) =>
        x.alive &&
        pixieBluffer(x) &&
        x.pixieMad &&
        !x.bluffGained &&
        (dead.role === x.pixieRole || claimHeard(dead, x) === x.pixieRole),
    )) {
      p.bluffGained = p.pixieRole;

      this.audit(
        "pixie",
        `${dead.label} died: ${p.label} (${name(p.role)}, bluffing the Pixie) "gains" the ${name(
          p.pixieRole,
        )} ability.`,
        { playerId: p.id, role: p.pixieRole },
      );
    }
  },
};
