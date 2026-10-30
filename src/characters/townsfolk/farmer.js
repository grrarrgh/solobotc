import { name } from "../../data.js";
import { ability, isDrunk } from "../../storyteller.js";
import { pick } from "../../util.js";

// The Farmer, mixed into Engine.prototype (see characters/index.js), so
// `this` is the Engine.
//
// "When you die at night, an alive good player becomes a Farmer": any death
// at night (or to the Demon) counts, as for the Ravenkeeper (see engine
// kill()); an execution doesn't. The Storyteller chooses the new Farmer at
// random from the living good players (you too). They learn it that night
// and lose their old ability; an NPC says so at dawn, as any good player
// whose character changed does (see abilities.js announceClaims()). A new
// Farmer who dies at night makes another. Farmers don't learn each other.
// (An evil Farmer, one the Mezepheles turned, still makes a good one.)
export const farmer = {
  // p just died (`atNight`: at night, or to the Demon): a sober and healthy
  // Farmer makes another (see farmerUses(): they're dead already, so works()
  // can't be used).
  farmerDeath(p, atNight) {
    if (atNight && ability(p) === "farmer") {
      this.farmerUses(p, "died at night");
    }
  },

  // Farmer p uses their ability (`how`: why now, for the log), unless drunk
  // or poisoned.
  farmerUses(p, how) {
    if (isDrunk(p) || p.poisoned) {
      this.audit("farmer", `${p.label} (${name(p.role)}) ${how}, but the Farmer is drunk or poisoned: nobody becomes a Farmer.`, {
        actorId: p.id,
      });
      return;
    }

    this.farmerMakes(p, how);
  },

  // What new Farmer t's old ability (`was`; `gained`: a Philosopher's) did
  // that ends with it, logged: a Poppy Grower's keeping the evil team apart
  // (see poppygrower.js poppyLost()); a Philosopher's drunkenness, on the
  // player whose character they gained, or on themself for a choice that
  // failed. (Drunk by another Philosopher's choice of their old character,
  // they're no longer that character: that ends too.)
  farmerEnds(t, was, gained) {
    const s = this.s;

    if (was === "poppygrower") {
      this.poppyLost(t, `${t.human ? "you" : "they"} became a Farmer`);
    }

    const sober = s.players.filter(
      (x) =>
        x.drunkFrom === "philosopher" &&
        (x === t || (was === "philosopher" && gained && x.drunkFromId === t.id)),
    );

    for (const x of sober) {
      x.drunkFrom = null;
      x.drunkFromBy = null;
      x.drunkFromId = null;
      this.audit(
        "farmer",
        `${x.label} ${x.human ? "are" : "is"} no longer drunk from ${
          x === t ? "a Philosopher's choice" : `${t.label}'s Philosopher choice`
        }: ${t.label} became a Farmer.`,
        { playerId: x.id },
      );
    }
  },

  // Farmer p's ability (`how`: why it's used now, for the log): a living
  // good player who isn't a Farmer becomes one. Never the Atheist (the
  // Storyteller's rule-breaking hangs on them), nor the Lunatic (who thinks
  // they're the Demon, with a team they imagine).
  farmerMakes(p, how) {
    const s = this.s;
    const t = pick(
      s.players.filter(
        (x) =>
          x.alive &&
          x !== p &&
          x.alignment === "good" &&
          !["farmer", "atheist", "lunatic"].includes(x.role),
      ),
      s.r,
    );

    if (!t) {
      this.audit("farmer", `${p.label} (Farmer) ${how}, but no living good player can become a Farmer.`, {
        actorId: p.id,
      });
      return;
    }

    const was = t.role;
    const shown = t.shown;
    const gained = t.gained;

    // They lose their old ability, and anything it gave them.
    t.role = "farmer";
    t.shown = "farmer";
    t.gained = null;
    t.cannibal = false;
    t.gainedNight = s.night;
    this.woke(t);

    if (!t.human) {
      t.claim = this.claimFor(t);
    }

    // (The Drunk had no ability to lose: only the one they thought they had.)
    const lost =
      was === "drunk"
        ? `the Drunk, who thought they were the ${name(shown)}`
        : `${t.human ? "you lose" : "they lose"} the ${name(was)} ability`;

    this.audit(
      "farmer",
      `${p.label} (Farmer) ${how}: ${t.label} ${t.human ? "become" : "becomes"} a Farmer, and ${
        t.human ? "learn" : "learns"
      } it (${lost}).`,
      { actorId: p.id, playerId: t.id, was },
    );

    this.farmerEnds(t, was, gained);

    // (You learn it as your night's information: see engine remember().)
    if (t.human) {
      this.remember(t, {
        night: s.night,
        role: "farmer",
        text: `You are now the Farmer (you were the ${name(was)}, and no longer have its ability).`,
        targets: [],
        functioning: true,
      });
    }
  },
};
