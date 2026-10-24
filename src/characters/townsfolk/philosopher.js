import { name } from "../../data.js";
import { ability, works, philosopherInfo, who } from "../../storyteller.js";

// The Philosopher, mixed into Engine.prototype (see characters/index.js),
// so `this` is the Engine.
export const philosopher = {
  // Once per game, an NPC Philosopher gains a good character's ability (on
  // the first night). If that character is in play, its holder is drunk.
  // (You choose when woken: see choose(), which gains it at once, so a night
  // ability you gain wakes you tonight too.)
  philosophers() {
    const s = this.s;

    for (const p of s.players.filter(
      (x) => x.alive && !x.human && x.role === "philosopher" && !x.gained,
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

    p.gained = role;
    p.gainedNight = s.night;

    // A drunk or poisoned Philosopher only thinks they gained it.
    if (!effective) {
      p.drunkFrom = "philosopher";
      p.drunkFromBy = "their own failed Philosopher choice";
    } else if (holder) {
      holder.drunkFrom = "philosopher";
      holder.drunkFromBy = who(p);
    }

    this.audit(
      "philosopher",
      `${p.label} (Philosopher) gained the ${name(role)} ability${
        !effective
          ? ", but it doesn't work"
          : holder
            ? `; ${holder.label} is drunk from now on`
            : ""
      }.`,
      { actorId: p.id, role, effective },
    );

    this.remember(p, philosopherInfo(s, role));
  },
};
