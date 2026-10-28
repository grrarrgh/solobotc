import { name, alignment, team, FACE_DOWN_OUTSIDERS } from "../../data.js";
import { demonBluffSet } from "../../setup.js";
import {
  ability,
  who,
  bluffing,
  works,
  isDemon,
  alchemistOptions,
  hasCannibal,
} from "../../storyteller.js";
import { claimHeard } from "../../strategy.js";
import { bluffState } from "../../bluff.js";
import { bySeat, pick, sample, shuffle, whose } from "../../util.js";

// Each once-per-game ability's "used" flag (and the Virgin's and Fool's
// "first time"). A Cannibal who gains one has it afresh, even if they used
// it before, as a player who becomes a new character does (see the wiki's
// Abilities page). (Not the Juggler's: by their jinx the Cannibal learns
// the eaten Juggler's count instead; see jugglerNight().)
const ONCE_USED = {
  slayer: "shotUsed",
  artist: "artistUsed",
  seamstress: "seamUsed",
  courtier: "courtierUsed",
  professor: "professorUsed",
  fisherman: "fishermanUsed",
  huntsman: "huntsmanUsed",
  puzzlemaster: "puzzleUsed",
  virgin: "virginUsed",
  fool: "foolUsed",
};

// The Cannibal, mixed into Engine.prototype (see characters/index.js),
// so `this` is the Engine.
export const cannibal = {
  // A player died by execution: each living Cannibal (or Philosopher with
  // the Cannibal ability: see hasCannibal()) gains their ability.
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
        y.alive && y !== dead && !y.human && y.alignment === "good" && !hasCannibal(y),
    )) {
      bluffState(x).eaten.push({
        night: s.night + 1,
        fromId: dead.id,
        as: claimHeard(dead, x),
      });
    }

    for (const c of s.players.filter(
      (x) => x.alive && x !== dead && hasCannibal(x),
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

      // An Alchemist's ability is a Minion ability, as for a Philosopher
      // (see philosopher.js): one on the script, neither in play nor
      // another Alchemist's (so never the one the eaten Alchemist had).
      c.alchemist = null;

      if (c.gained === "alchemist") {
        c.alchemist = pick(alchemistOptions(s), s.r) ?? null;
      }

      const butler = !evil && c.gained === "butler";
      // (Poisoned or not: a poisoned Cannibal is woken as if they had it.)
      const used = ONCE_USED[c.gained];
      const fresh = Boolean(used && c[used]);

      if (fresh) {
        c[used] = false;
      }

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
        `${c.label} (${
          c.role === "cannibal" ? "Cannibal" : `${name(c.role)} with the Cannibal ability`
        }) has ${whose(dead)} ability: ${name(c.gained)}${
          c.alchemist ? ` (the ${name(c.alchemist)} ability)` : ""
        }${
          evil ? ", poisoned until a good player dies by execution" : ""
        }${butler ? " (and learns it: the Cannibal and Butler jinx)" : ""}${
          fresh ? "; they may use it again, though they used it before" : ""
        }.`,
        { playerId: c.id, fromId: dead.id, role: c.gained, poisoned: evil, fresh },
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
          (id) =>
            team(id) === "demon" &&
            // (Nor the Leviathan, which everyone would know isn't in play.)
            !["lilmonsta", "leviathan"].includes(id) &&
            !s.players.some((x) => x.role === id),
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
    // (Shaped like a real Demon's: see setup.js demonBluffSet(). A
    // face-down Outsider is in play if the Lunatic they ate was one.)
    const bluffs = demonBluffSet(
      s.script.ids.filter(
        (id) => alignment(id) === "good" && !["drunk", "lunatic", "cannibal"].includes(id),
      ),
      s.players.some((x) => FACE_DOWN_OUTSIDERS.includes(x.role)),
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
