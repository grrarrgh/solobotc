import { name, alignment, team } from "../../data.js";
import { ability, who, bluffing, works, isDemon } from "../../storyteller.js";
import { claimHeard } from "../../strategy.js";
import { bluffState } from "../../bluff.js";
import { bySeat, pick, sample, shuffle, whose } from "../../util.js";

// The Cannibal, mixed into Engine.prototype (see characters/index.js),
// so `this` is the Engine.
export const cannibal = {
  // A player died by execution: each living Cannibal gains their ability.
  // If they were evil, the Cannibal is told a good ability (the one the
  // executee claimed, if any) and is poisoned until a good player dies by
  // execution. They don't learn the character, only whose ability it is,
  // except the Butler (their jinx). By the Cannibal and Juggler jinx, a
  // Juggler executed on the day they juggled leaves their count to the
  // living Cannibal tonight (see jugglerNight()).
  //
  // An evil player bluffing the Cannibal "gains" it too, so their made-up
  // information follows it from tonight (see bluff.js bluffTonight()): the executee's
  // character as best they know it (see eatenAs()).
  //
  // So does every other living good NPC, in case they claim the Cannibal
  // without its ability (a cover story, madness, a mad Pixie, a hiding
  // Mutant or Damsel): the character they heard the executee claim, if
  // any, for their made-up (random) information (see storyteller
  // bluff.js storyGained()).
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
      const said = this.eatenAs(b, dead);

      const gained = {
        role: goods.includes(said) ? said : pick(goods, s.r),
        night: s.night + 1,
        fromId: dead.id,
      };

      bluffState(b).gained = gained;

      this.audit(
        "cannibal",
        `${b.label} (bluffing Cannibal) says they have ${whose(dead)} ability: ${name(
          gained.role,
        )}.`,
        { playerId: b.id, fromId: dead.id, role: gained.role, bluff: true },
      );
    }

    for (const x of s.players.filter(
      (y) =>
        y.alive && y !== dead && !y.human && y.alignment === "good" && y.role !== "cannibal",
    )) {
      bluffState(x).eaten.push({
        night: s.night + 1,
        fromId: dead.id,
        as: claimHeard(dead, x),
      });
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

      const butler = !evil && c.gained === "butler";

      if (!evil && dead.juggle && ability(dead) === "juggler") {
        c.cannibalJuggle = { ...dead.juggle, fromId: dead.id };
      }

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
        }${butler ? " (and learns it: the Cannibal and Butler jinx)" : ""}.`,
        { playerId: c.id, fromId: dead.id, role: c.gained, poisoned: evil },
      );

      if (c.gained === "lunatic") {
        this.cannibalLunatic(c);
      }

      if (c.human) {
        s.privateLog.push(
          `Day ${s.day}: You now have the ability of ${dead.label}, who was executed${
            butler ? ": the Butler" : ""
          }.`,
        );
      }
    }
  },

  // A Cannibal who gains the Lunatic's ability is told what a Lunatic is:
  // that they're a Demon (one not in play), with "Minions" (the real Demon
  // and good players, as many as there are Minions, at least 2) and 3 good
  // characters to bluff. They stay good, and play as the Cannibal.
  cannibalLunatic(c) {
    const s = this.s;
    const demon = s.players.find((x) => x.alive && isDemon(x));
    const shown =
      pick(
        s.script.ids.filter(
          (id) => team(id) === "demon" && !s.players.some((x) => x.role === id),
        ),
        s.r,
      ) ?? demon?.role;
    const minions = s.players.filter((x) => team(x.role) === "minion").length;
    const others = s.players.filter(
      (x) => x.alive && x !== c && x !== demon && x.alignment === "good",
    );
    const mates = shuffle(
      [demon, ...sample(others, Math.max(2, minions) - 1, s.r)].filter(Boolean),
      s.r,
    );
    const bluffs = sample(
      s.script.ids.filter(
        (id) => alignment(id) === "good" && !["drunk", "lunatic", "cannibal"].includes(id),
      ),
      3,
      s.r,
    );
    const labels = bySeat(mates).map((x) => x.label);
    const list =
      labels.length < 2
        ? labels.join("")
        : `${labels.slice(0, -1).join(", ")} and ${labels.at(-1)}`;
    const text = `Lunatic: you are the ${name(shown)}. Your Minions are ${list}. Your bluffs are ${bluffs
      .map(name)
      .join(", ")}.`;

    this.remember(c, {
      night: s.night + 1,
      role: "lunatic",
      text,
      targets: mates.map((x) => x.id),
      trigger: "normal",
      functioning: true,
    });

    if (c.human) {
      s.privateLog.push(`Day ${s.day}: ${text} (You are still good.)`);
    }
  },

  // The character evil Cannibal bluffer b says executee `dead` was, as best
  // they know it, as a real Cannibal would gain it: a good player's real
  // character if b has seen it in the Grimoire (a working Spy now, or the
  // Widow on Night 1); a teammate's bluff (what a real Cannibal is told);
  // else what they heard them claim. Null if they know nothing.
  eatenAs(b, dead) {
    if (dead.alignment === "good") {
      if (b.role === "spy" && works(b)) {
        return dead.role;
      }

      if (b.role === "widow") {
        return dead.startRole;
      }
    } else {
      return dead.claim;
    }

    return claimHeard(dead, b);
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
