import { name, team } from "../../data.js";
import {
  ability,
  works,
  bluffing,
  choiceInfo,
} from "../../storyteller.js";
import { claimTo } from "../../strategy.js";
import { byId, pick } from "../../util.js";

// The Huntsman, mixed into Engine.prototype (see characters/index.js),
// so `this` is the Engine.
export const huntsman = {
  // Once per game, at night: the Huntsman chooses a living player (you, by
  // your night choice; an NPC, see strategy huntsman()). A working
  // Huntsman's choice, if the Damsel (never you), becomes a Townsfolk not in
  // play, and learns it. (A Huntsman bluffer "chooses" too, to no effect.)
  huntsmen() {
    const s = this.s;

    for (const p of s.players.filter(
      (x) =>
        x.alive &&
        !x.huntsmanUsed &&
        (ability(x) === "huntsman" || bluffing(x, "huntsman")),
    )) {
      const t = p.human ? this.humanPicks(p)?.[0] : this.strat.huntsman(s, p);

      if (!t) {
        continue;
      }

      const fake = bluffing(p, "huntsman");

      p.huntsmanUsed = true;
      this.woke(p);
      this.chose(p, t);

      const info = choiceInfo(s, "huntsman", "chose", [t]);

      if (fake) {
        this.rememberBluff(p, info);
      } else {
        this.remember(p, info);
      }

      const effective = !fake && works(p) && t.role === "damsel";

      this.audit(
        "huntsman",
        `${p.label} (${name(p.role)}) chose ${t.label}${
          t.role !== "damsel" ? ", who isn't the Damsel" : effective ? ", the Damsel" : ", the Damsel, but it failed"
        }.`,
        { actorId: p.id, targetId: t.id, effective },
      );

      if (effective) {
        this.huntsmanSaves(t, p);
      }
    }
  },

  // The Damsel t becomes a Townsfolk that isn't in play (her cover claim
  // too), chosen by Huntsman h. An NPC says so at dawn (see
  // announceClaims(), damselSaved()).
  huntsmanSaves(t, h) {
    const s = this.s;
    const used = new Set(s.players.flatMap((x) => [x.role, x.shown]));
    const role = pick(
      s.script.ids.filter(
        (id) =>
          team(id) === "townsfolk" &&
          !used.has(id) &&
          id !== t.claim,
      ),
      s.r,
    );

    if (!role) {
      return;
    }

    t.role = role;
    t.shown = role;
    t.huntsmanSaved = { night: s.night, byId: h.id };

    if (t.alignment === "good") {
      t.claim = this.claimFor(t);
    }

    this.audit("huntsman", `${t.label} (Damsel) became the ${name(role)}.`, {
      playerId: t.id,
      role,
    });
  },

  // At dawn, the Damsel p the Huntsman found has said so in public: the
  // Minions stop guessing (there's no Damsel left), and the town counts it
  // for her, and for the player claiming the Huntsman in public who chose
  // her (see confirm()).
  damselSaved(p) {
    const s = this.s;
    const h = byId(s, p.huntsmanSaved.byId);

    s.damselGone = true;
    this.confirm(p, "maybe", `they say the Huntsman turned them from the Damsel into the ${name(p.claim)}`);

    if (h && !h.human && claimTo(h) === "huntsman") {
      this.confirm(h, "maybe", `they claim the Huntsman, and ${p.label} says the Huntsman found them as the Damsel`);
    }
  },
};
