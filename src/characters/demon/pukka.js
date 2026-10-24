import { works, who } from "../../storyteller.js";

// The Pukka, mixed into Engine.prototype (see characters/index.js),
// so `this` is the Engine.
export const pukka = {
  // The Pukka poisons a player; last night's victim dies, then is healthy.
  pukka(d) {
    const s = this.s;
    const prev = s.pukka && this.player(s.pukka.targetId);
    const t = this.strat.demon(s, d, prev ? [prev] : []);

    if (t) {
      this.chose(d, t);
    }

    const effective = works(d);

    s.pukka = null;

    if (t) {
      if (effective) {
        t.poisoned = true;
        t.poisonedBy = who(d);
        s.pukka = { targetId: t.id };
      }

      this.audit(
        "pukka",
        `${d.label} (Pukka) chose ${t.label}; ${
          effective ? "poisoned" : "the poison failed"
        }.`,
        { actorId: d.id, targetId: t.id, effective },
      );
    }

    // A drunk or poisoned Pukka's last victim doesn't die, and is healthy.
    if (prev && effective) {
      this.attack(d, prev, { chosen: false, verb: "poisoned last night" });
    }
  },

  // An exorcised Pukka's last victim still dies (and nobody new is poisoned).
  pukkaVictim(d) {
    const s = this.s;
    const prev = s.pukka && this.player(s.pukka.targetId);

    s.pukka = null;

    if (prev && works(d)) {
      this.attack(d, prev, { chosen: false, verb: "poisoned last night" });
    }
  },

  // At dusk: the Pukka's victim stays poisoned until they die.
  pukkaLasting() {
    const s = this.s;
    const pukka = s.players.find((x) => x.alive && x.role === "pukka");
    const victim = pukka && s.pukka && this.player(s.pukka.targetId);

    if (victim?.alive) {
      victim.poisoned = true;
      victim.poisonedBy = who(pukka);
    }
  },

  // On Night 1, the Pukka poisons its first victim.
  pukkaFirstNight() {
    const d = this.s.players.find((x) => x.alive && x.role === "pukka");

    if (d) {
      this.woke(d);
      this.pukka(d);
    }
  },
};
