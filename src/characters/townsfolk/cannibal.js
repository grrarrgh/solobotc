import { name, alignment } from "../../data.js";
import { ability, who, bluffing } from "../../storyteller.js";
import { claimHeard } from "../../strategy.js";
import { pick, whose } from "../../util.js";

// The Cannibal, mixed into Engine.prototype (see characters/index.js),
// so `this` is the Engine.
export const cannibal = {
  // A player died by execution: each living Cannibal gains their ability.
  // If they were evil, the Cannibal is told a good ability (the one the
  // executee claimed, if any) and is poisoned until a good player dies by
  // execution. They don't learn the character, only whose ability it is.
  //
  // An evil player bluffing the Cannibal "gains" it too: the good character
  // the executee claimed, as far as they know (else any good one), so their
  // made-up information follows it from tonight (see bluffInfo()).
  cannibals(dead) {
    const s = this.s;
    const goods = s.script.ids.filter(
      (id) => alignment(id) === "good" && id !== "cannibal",
    );

    for (const b of s.players.filter(
      (x) =>
        x.alive &&
        x !== dead &&
        !x.human &&
        x.alignment === "evil" &&
        x.role !== "cannibal" &&
        x.claim === "cannibal",
    )) {
      const said = claimHeard(dead, b);

      b.bluffGained = goods.includes(said) ? said : pick(goods, s.r);
      b.bluffGainedNight = s.night + 1;
      b.cannibalFrom = dead.id;

      this.audit(
        "cannibal",
        `${b.label} (bluffing Cannibal) says they have ${whose(dead)} ability: ${name(
          b.bluffGained,
        )}.`,
        { playerId: b.id, fromId: dead.id, role: b.bluffGained, bluff: true },
      );
    }

    for (const c of s.players.filter(
      (x) => x.alive && x !== dead && x.role === "cannibal",
    )) {
      const evil = dead.alignment === "evil";
      const was = c.cannibalPoison;

      c.gained = evil
        ? goods.includes(dead.claim)
          ? dead.claim
          : pick(goods, s.r)
        : dead.role;
      // A first-night ability (the Chef, the Librarian...) is used tonight.
      c.gainedNight = s.night + 1;
      c.cannibalPoison = evil ? `eating ${who(dead)}` : null;
      c.cannibalFrom = dead.id;

      // Poisoned now; or, with a good player executed, no longer (unless
      // something else poisoned them).
      if (evil) {
        c.poisoned = true;
        c.poisonedBy = c.cannibalPoison;
      } else if (was && c.poisonedBy === was) {
        c.poisoned = false;
        c.poisonedBy = null;
      }

      this.audit(
        "cannibal",
        `${c.label} (Cannibal) has ${whose(dead)} ability: ${name(c.gained)}${
          evil ? ", poisoned until a good player dies by execution" : ""
        }.`,
        { playerId: c.id, fromId: dead.id, role: c.gained, poisoned: evil },
      );

      if (c.human) {
        s.privateLog.push(
          `Day ${s.day}: You now have the ability of ${dead.label}, who was executed.`,
        );
      }
    }
  },

  // At dusk: a Cannibal who ate an evil player is poisoned until a good
  // player dies by execution.
  cannibalLasting() {
    for (const p of this.s.players.filter((x) => x.cannibalPoison)) {
      p.poisoned = true;
      p.poisonedBy = p.cannibalPoison;
    }
  },
};
