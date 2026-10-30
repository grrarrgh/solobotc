import { name } from "../../data.js";
import { works } from "../../storyteller.js";
import { untwinned } from "../../strategy.js";
import { pick } from "../../util.js";
import { acts } from "../../abilities.js";

// The Mezepheles, mixed into Engine.prototype (see characters/index.js),
// so `this` is the Engine.
//
// Simplified: there's no secret word. On the night set at setup (one of
// MEZEPHELES_NIGHTS), if the Mezepheles is alive, a random living good NPC
// becomes evil (never you, nor a twin). They learn it, and play for the
// evil team from then on, knowing who it is (see strategy teammate()).
// A drunk or poisoned Mezepheles fails, and has used the ability. (So does
// one whose player the Spirit of Ivory keeps good.)
export const mezepheles = {
  mezepheles() {
    const s = this.s;
    const m = s.players.find((x) => acts(x) && x.role === "mezepheles");
    const plan = s.mezepheles;

    if (!m || !plan || plan.used || s.night !== plan.night) {
      return;
    }

    plan.used = true;

    const t = pick(
      untwinned(
        s,
        s.players.filter((x) => x.alive && !x.human && x.alignment === "good"),
      ),
      s.r,
    );

    if (!t) {
      return;
    }

    const effective = works(m);

    // (With the Spirit of Ivory on the script, they might stay good: see
    // characters/fabled/spiritofivory.js.)
    if (effective && this.ivoryKeepsGood(t, `the Mezepheles, ${m.label}`)) {
      return;
    }

    if (effective) {
      t.alignment = "evil";
      t.turnedEvil = s.night;
      t.suspicion = null;
    }

    this.audit(
      "mezepheles",
      effective
        ? `${t.label} (${name(t.role)}) becomes evil (Mezepheles: ${m.label}), and learns it: they play for the evil team from now on.`
        : `${m.label} (Mezepheles) would have turned ${t.label} evil, but is drunk or poisoned: the ability is used up.`,
      { actorId: m.id, targetId: t.id, effective },
    );
  },
};
