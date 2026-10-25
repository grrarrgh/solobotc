import { name, team } from "../../data.js";
import { works } from "../../storyteller.js";
import { claimHeard } from "../../strategy.js";
import { pick } from "../../util.js";
import { bluffState, gainedRole } from "../../bluff.js";

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
        // (Or a Drunk or Marionette shown the Pixie: they think they are.)
        (x.role === "pixie" || x.shown === "pixie" || pixieBluffer(x)) &&
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
          p.role === "pixie"
            ? "Pixie"
            : p.shown === "pixie"
              ? `${name(p.role)}, who thinks they're the Pixie`
              : `${name(p.role)}, bluffing Pixie`
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
        !gainedRole(x) &&
        (dead.role === x.pixieRole || claimHeard(dead, x) === x.pixieRole),
    )) {
      bluffState(p).gained = { role: p.pixieRole };

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

const pixieText = (role) => `Pixie: the ${name(role)} is in play.`;

// The Townsfolk a Pixie can learn: those in play, or (`notInPlay`) those
// that aren't. Never the Pixie, nor, for an evil Pixie bluffer, one a
// teammate claims: they'd claim it too once "mad" about it, and two evil
// players claiming one character gives them away.
const pixieOptions = (s, p, notInPlay = false) => {
  const inPlay = new Set(
    s.players.filter((x) => x !== p).map((x) => x.role),
  );
  const teamClaims = new Set(
    p.alignment === "evil"
      ? s.players.filter((x) => x !== p && x.alignment === "evil").map((x) => x.claim)
      : [],
  );

  return s.script.ids.filter(
    (id) =>
      team(id) === "townsfolk" &&
      id !== "pixie" &&
      !teamClaims.has(id) &&
      inPlay.has(id) !== notInPlay,
  );
};

// The Pixie: a Townsfolk in play, to be "mad" about. (They remember which,
// as p.pixieRole.)
export const info = {
  truth(s, p) {
    const id = pick(pixieOptions(s, p), s.r);

    p.pixieRole = id;

    return id
      ? { targets: [], text: pixieText(id) }
      : { targets: [], text: "No information." };
  },

  // A misinformed Pixie learns a Townsfolk that isn't in play (and is mad
  // about it, to no effect).
  lie(s, p) {
    const id =
      pick(pixieOptions(s, p, true), s.r) ?? pick(pixieOptions(s, p), s.r);

    p.pixieRole = id;

    return id
      ? { targets: [], text: pixieText(id) }
      : { targets: [], text: "No information." };
  },

  // (A Pixie bluffer goes mad about it, as a real one would: see
  // pixieMadness() above.)
  random(s, p) {
    const id = pick(
      s.script.ids.filter((x) => team(x) === "townsfolk" && x !== "pixie"),
      s.r,
    );

    p.pixieRole = id;

    return { targets: [], text: id ? pixieText(id) : "No information." };
  },
};
