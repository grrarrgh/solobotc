import { name, team, PITHAG_NO_DEATH_CHANCE } from "../../data.js";
import {
  works,
  isDemon,
  steer,
  steerWhy,
  killHelps,
  who,
} from "../../storyteller.js";
import { untwinned } from "../../strategy.js";
import { pick } from "../../util.js";
import { acts } from "../../abilities.js";

// The Pit-Hag, mixed into Engine.prototype (see characters/index.js),
// so `this` is the Engine.
export const pithag = {
  // The Pit-Hag (from Night 2) turns a good NPC into a character not in play.
  pitHag() {
    const s = this.s;
    const h = s.players.find((x) => acts(x) && x.role === "pithag");
    const choice = s.night > 1 && h && this.strat.pithag(s, h);

    if (!choice) {
      return;
    }

    this.woke(h);
    this.chose(h, choice.target);

    const effective = works(h);
    const { target, role } = choice;

    this.audit(
      "pithag",
      `${h.label} (Pit-Hag) chose ${target.label} to become the ${name(role)}${
        effective ? "" : ", but it failed"
      }.`,
      { actorId: h.id, targetId: target.id, role, effective },
    );

    if (effective) {
      // They learn their new character. A good player claims it (a Mutant
      // claims a Townsfolk instead); an evil one keeps their bluff.
      const demon = team(role) === "demon";

      target.role = role;
      target.shown = role;

      if (target.alignment === "good") {
        target.claim = this.claimFor(target);
      }

      // A good player learns a Widow is in play (see characters/minion/widow.js).
      if (role === "widow") {
        this.widowKnown();
      }

      // Deaths tonight are arbitrary (see arbitraryDeath()).
      if (demon) {
        s.arbitraryNight = s.night;

        this.audit(
          "pithag",
          `A Demon was made (${target.label} is now the ${name(role)}): tonight's death is random.`,
          { playerId: target.id, role },
        );
      }
    }
  },

  // On a night the Pit-Hag made a Demon, the Demon doesn't choose: a random
  // living NPC other than the Demon dies (never the human, as with any night
  // death), or (at PITHAG_NO_DEATH_CHANCE) nobody does. Returns whether this
  // replaced the Demon's kill.
  arbitraryDeath() {
    const s = this.s;

    if (s.arbitraryNight !== s.night) {
      return false;
    }

    const pool = untwinned(
      s,
      s.players.filter((x) => x.alive && !x.human && !isDemon(x)),
    );
    const none = s.r() < PITHAG_NO_DEATH_CHANCE;
    let t = none
      ? null
      : pick(steer(s, pool, killHelps, "who dies at random"), s.r);
    let why = none
      ? `no death, on the ${Math.round(PITHAG_NO_DEATH_CHANCE * 100)}% chance`
      : steerWhy(s, pool, killHelps);

    // "If you die at night, another player might die instead": the Mayor.
    if (t?.role === "mayor" && works(t)) {
      const mayor = t;

      t =
        pick(
          pool.filter((x) => x !== t),
          s.r,
        ) ?? t;
      why += t === mayor ? "" : `; it fell on ${mayor.label} (Mayor), who bounced it`;
    }

    this.audit(
      "pithag",
      `${
        t
          ? `Random death (a Demon was made): ${t.label}.`
          : "Random death (a Demon was made): nobody died."
      } (why: ${why})`,
      { targetId: t?.id ?? null },
    );

    if (t && this.kill(t, "pithag")) {
      this.check();
    }

    return true;
  },
};
