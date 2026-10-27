import {
  name,
  SAILOR_DRUNK_SELF_CHANCE,
  SAILOR_LATE_ALIVE,
  SAILOR_LATE_DRUNK_CHANCE,
} from "../../data.js";
import {
  ability,
  works,
  steer,
  killHelps,
  who,
  choiceInfo,
} from "../../storyteller.js";
import { twinSafe } from "../../strategy.js";
import { whose } from "../../util.js";

// The Sailor, mixed into Engine.prototype (see characters/index.js),
// so `this` is the Engine.
export const sailor = {
  // Each night, the Sailor chooses a player: the Storyteller makes one of
  // them drunk until dusk, deciding which when it first matters (see
  // sailorResolve()).
  sailors() {
    const s = this.s;

    for (const p of s.players.filter(
      (x) => x.alive && ability(x) === "sailor",
    )) {
      const t = this.humanPicks(p)?.[0] ?? this.strat.sailor(s, p);

      if (!t) {
        continue;
      }

      this.woke(p);
      this.chose(p, t);

      const effective = works(p);

      if (effective) {
        s.sailorPending.push({ sailorId: p.id, targetId: t.id });
      }

      this.audit(
        "sailor",
        `${p.label} (${name(p.role)}) chose ${t.label}${
          effective ? "" : "; no effect"
        }.`,
        { actorId: p.id, targetId: t.id, effective },
      );

      this.remember(p, choiceInfo(s, "sailor", "chose", [t]));
    }
  },

  // The Storyteller decides who a Sailor's choice makes drunk, the first time
  // it matters: when `actor` (the Sailor's pick) uses an ability, when
  // `victim` (either of them, or anyone the Demon attacks if the Sailor
  // chose the Demon) is attacked by `demon` (or anyone, without one), or at
  // dawn (no arguments: every choice still open).
  sailorResolve({ actor = null, demon = null, victim = null } = {}) {
    const s = this.s;

    for (const c of [...s.sailorPending]) {
      const sailor = this.player(c.sailorId);
      const target = this.player(c.targetId);
      const pair = [sailor, target];
      const now =
        !actor && !victim
          ? true
          : pair.includes(actor) || pair.includes(victim) || pair.includes(demon);

      if (!now) {
        continue;
      }

      s.sailorPending = s.sailorPending.filter((x) => x !== c);

      const { drunk, why } = this.sailorDrunk(sailor, target, demon, victim);

      if (drunk) {
        drunk.drunkTonight = true;
        drunk.drunkBy = who(sailor);
      }

      this.audit(
        "sailor",
        `The Storyteller makes ${
          drunk ? drunk.label : "nobody"
        } drunk until dusk (${whose(sailor)} Sailor choice)${why}.`,
        { actorId: sailor.id, targetId: target.id, drunkId: drunk?.id ?? null },
      );
    }
  },

  // Who the Storyteller makes drunk for a Sailor's choice, and why:
  // - never their choice if that's a twin (see twinSafe()), but the Sailor
  //   themself, twin or not: it's their own ability (else a good twin
  //   Sailor could never die, nor a Demon they chose ever act);
  // - with fewer than SAILOR_LATE_ALIVE alive, or the Sailor the last good
  //   NPC alive (the Demon, never killing you while it has an NPC to kill,
  //   would attack them for ever), the Sailor more often than not
  //   (SAILOR_LATE_DRUNK_CHANCE);
  // - when it decides whether an attack on `victim` kills, the choice that
  //   saves a good victim, or lets an evil one die;
  // - otherwise the Sailor at SAILOR_DRUNK_SELF_CHANCE.
  sailorDrunk(sailor, target, demon, victim) {
    const s = this.s;
    const options = [sailor, target].filter((x) => x === sailor || !twinSafe(s, x));

    if (options.length < 2) {
      return { drunk: options[0] ?? null, why: "" };
    }

    const last =
      !sailor.human &&
      !s.players.some((x) => x !== sailor && x.alive && !x.human && x.alignment === "good");

    if (
      (this.alive().length < SAILOR_LATE_ALIVE || last) &&
      s.r() < SAILOR_LATE_DRUNK_CHANCE
    ) {
      return {
        drunk: sailor,
        why: this.alive().length < SAILOR_LATE_ALIVE ? ": few players are left" : ": they're the last good NPC alive",
      };
    }

    if (victim) {
      const lands = (x) => {
        const was = x.drunkTonight;

        x.drunkTonight = true;

        const died = this.wouldDie(victim, demon);

        x.drunkTonight = was;

        return died;
      };
      const ifSailor = lands(sailor);

      if (ifSailor !== lands(target)) {
        const want = victim.alignment === "evil";

        return {
          drunk: ifSailor === want ? sailor : target,
          why: `, so ${victim.label} ${want ? "dies" : "lives"}`,
        };
      }
    }

    // Nothing at stake: the Storyteller may still lean (a drunk evil pick
    // helps good; a drunk good pick helps evil; the Sailor spares them).
    const options2 = steer(
      s,
      [sailor, target],
      (x) => (x === target ? killHelps(target) : target.alignment),
      `who ${whose(sailor)} Sailor choice makes drunk`,
    );

    return {
      drunk:
        options2.length < 2
          ? options2[0]
          : s.r() < SAILOR_DRUNK_SELF_CHANCE
            ? sailor
            : target,
      why: "",
    };
  },
};

// The Sailor, as told by someone claiming it without its ability (see
// bluff.js madeUpChoice()): the player they "chose" tonight.
export const info = {
  choice(s, p, strat) {
    const t = strat.sailor(s, p);

    return t ? choiceInfo(s, "sailor", "chose", [t]) : null;
  },
};
