import { name, team } from "../../data.js";
import { ability, works, who } from "../../storyteller.js";
import { acts } from "../../abilities.js";
import { pick } from "../../util.js";
import { bluffState } from "../../bluff.js";

const alchemistText = (id) => `Alchemist: you have the ${name(id)} ability.`;

// The Minion characters on the script an Alchemist bluffer could say they
// have the ability of.
const minions = (s) => s.script.ids.filter((id) => team(id) === "minion");

// The Alchemist: a Minion ability (one on the script, not in play: see
// ALCHEMIST_ABILITIES and setup.js), learned on Night 1. It works for the
// good team: see minionAbility() in storyteller.js, which the Fearmonger,
// Psychopath, Goblin and Wizard go by, and alchemists() below for the
// Poisoner's.
export const info = {
  nights: "first",
  truth(s, p) {
    return { targets: [], text: alchemistText(p.alchemist) };
  },

  // (A drunk or poisoned Alchemist still learns which ability they "have".)
  lie(s, p) {
    return {
      targets: [],
      text: alchemistText(p.alchemist ?? pick(minions(s), s.r) ?? "poisoner"),
    };
  },

  random(s, p) {
    return info.lie(s, p);
  },

  // A pretender's (see bluff.js): one of the script's Minions, kept.
  story(s, p) {
    const said = bluffState(p).said;

    said.alchemist ??= pick(minions(s), s.r) ?? "poisoner";

    return { targets: [], text: alchemistText(said.alchemist) };
  },
};

// The Alchemist, mixed into Engine.prototype (see characters/index.js),
// so `this` is the Engine.
export const alchemist = {
  // After the Poisoner, an Alchemist with the Poisoner's ability poisons a
  // player tonight and tomorrow: an NPC, the player they suspect most (see
  // strategy alchemistPoison()); you, whoever you choose.
  alchemists() {
    const s = this.s;

    for (const p of s.players.filter(
      (x) => acts(x) && ability(x) === "alchemist" && x.alchemist === "poisoner",
    )) {
      const t = p.human ? this.humanPicks(p)?.[0] : this.strat.alchemistPoison(s, p);

      if (!t) {
        continue;
      }

      this.woke(p);
      this.chose(p, t);

      const effective = works(p);

      if (effective) {
        t.poisoned = true;
        t.poisonedBy = who(p);
      }

      this.audit(
        "poison",
        `${p.label} (Alchemist-Poisoner) chose ${t.label}; ${effective ? "poisoned" : "it fails (drunk or poisoned)"}.`,
        { actorId: p.id, targetId: t.id, effective },
      );
    }
  },
};
