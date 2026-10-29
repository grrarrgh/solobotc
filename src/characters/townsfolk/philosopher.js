import { name } from "../../data.js";
import { ability, works, who, alchemistOptions, hasCannibal } from "../../storyteller.js";
import { bluffState } from "../../bluff.js";
import { pick } from "../../util.js";
import { ONCE_USED } from "./cannibal.js";

// The Philosopher, mixed into Engine.prototype (see characters/index.js),
// so `this` is the Engine.
export const philosopher = {
  // Once per game, an NPC Philosopher gains a good character's ability (on
  // the first night). If that character is in play, its holder is drunk.
  // So does a Cannibal who ate a Philosopher (the night after; see
  // cannibals()), which they then have until they eat again.
  // (You choose when woken: see choose(), which gains it at once, so a night
  // ability you gain wakes you tonight too.)
  philosophers() {
    const s = this.s;

    for (const p of s.players.filter(
      (x) =>
        x.alive &&
        !x.human &&
        ((x.role === "philosopher" && !x.gained) ||
          (hasCannibal(x) && x.gained === "philosopher")),
    )) {
      const role = this.strat.philosopher(s, p);

      if (role) {
        this.philosopherGain(p, role);
      }
    }
  },

  // Philosopher p gains `role`'s ability from tonight (a first-night one is
  // used tonight: see startsTonight()).
  philosopherGain(p, role) {
    const s = this.s;

    this.woke(p);

    const effective = works(p);
    const holder = s.players.find((x) => x !== p && x.role === role);
    // (A Cannibal using the Philosopher ability they ate: see philosophers().)
    const eater = hasCannibal(p);

    p.gained = role;
    p.gainedNight = s.night;

    // (The Cannibal's ability is kept apart, as "gained" becomes what they
    // eat: see cannibals(). A Cannibal keeps eating.)
    if (!eater) {
      p.cannibal = role === "cannibal";
    }

    // (A once-per-game ability they gain is theirs afresh, as when they eat
    // it: see cannibals().)
    if (eater && ONCE_USED[role]) {
      p[ONCE_USED[role]] = false;
    }

    // (The Alchemist's ability is a Minion's, as a real Alchemist is given at
    // setup: one on the script that isn't in play. See alchemist.js.)
    if (role === "alchemist") {
      p.alchemist = pick(alchemistOptions(s), s.r);
    }

    // A drunk or poisoned Philosopher only thinks they gained it. (A
    // Cannibal's lasts only until they eat again, so they aren't made drunk
    // by it: eating an evil player keeps them poisoned meanwhile.)
    if (!effective && !eater) {
      p.drunkFrom = "philosopher";
      p.drunkFromBy = "their own failed Philosopher choice";
    } else if (holder) {
      holder.drunkFrom = "philosopher";
      holder.drunkFromBy = who(p);
    }

    const minion =
      role !== "alchemist"
        ? ""
        : p.alchemist
          ? ` (the ${name(p.alchemist)} ability)`
          : " (but no Minion ability: every one they could have is in play)";

    const as = !eater
      ? "Philosopher"
      : `${
          p.role === "cannibal" ? "Cannibal" : `${name(p.role)} with the Cannibal ability`
        }, using the Philosopher ability they ate`;

    this.audit(
      "philosopher",
      `${p.label} (${as}) gained the ${name(role)} ability${minion}${
        p.philosopherWhy ? ` (why: ${p.philosopherWhy})` : ""
      }${
        !effective
          ? ", but it doesn't work"
          : holder
            ? `; ${holder.label} is drunk from now on`
            : ""
      }.`,
      { actorId: p.id, role, effective, alchemist: p.alchemist ?? null },
    );

    this.remember(p, philosopherInfo(s, role));

    // (Their jinx: a Townsfolk might turn evil. See bountyhunter.js.)
    if (effective && role === "bountyhunter") {
      this.bountyEvil(p);
    }
  },

  // A Philosopher bluffer "gains" an in-play Townsfolk on their first night
  // (implying its real holder is drunk), then bluffs as it (see bluff.js
  // bluffTonight()). (A Philosopher or Cannibal the Mezepheles turned evil
  // bluffs what they really gained, and from when: a Cannibal's changes with
  // each execution, and a first-night ability is used the night it's gained.)
  philosopherBluff(p) {
    const s = this.s;
    const state = bluffState(p);

    if (["philosopher", "cannibal"].includes(p.claim) && p.turnedEvil && p.gained) {
      state.gained = { ...state.gained, role: p.gained, night: p.gainedNight };
    }

    if (p.claim !== "philosopher" || state.gained?.role) {
      return;
    }

    const role = this.strat.philosopherBluff(s, p);

    if (role) {
      state.gained = { ...state.gained, role };
      this.rememberBluff(p, philosopherInfo(s, role));
    }
  },
};

export const philosopherInfo = (s, role) => ({
  night: s.night,
  role: "philosopher",
  text: `Philosopher: gained the ${name(role)} ability.`,
  targets: [],
  trigger: "normal",
  functioning: true,
});
