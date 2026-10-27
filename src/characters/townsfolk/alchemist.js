import { name, team } from "../../data.js";
import { ability, works, who, nameable } from "../../storyteller.js";
import { acts } from "../../abilities.js";
import { pick } from "../../util.js";
import { bluffState, gainedRole } from "../../bluff.js";
import { teammate } from "../../strategy.js";

const alchemistText = (id) => `Alchemist: you have the ${name(id)} ability.`;

// The Minion abilities a pretender (see bluff.js) says they have: a quiet
// one, whose use nobody sees, on the script; failing that, one whose use is
// up to them (the Psychopath's kill, the Goblin's claim); never the
// Fearmonger's, whose every choice is announced; never a
// Minion an evil one knows is in play (their own character, and their
// team's, unless the Poppy Grower keeps them apart). The same one each time.
const QUIET = ["poisoner", "wizard"];
const OPTIONAL = ["psychopath", "goblin"];

function pretended(s, p) {
  const said = bluffState(p).said;
  const own =
    p.alignment !== "evil" ? [] : p.poppyBlind ? [p.role] : s.players.filter((x) => x.alignment === "evil").map((x) => x.role);

  said.alchemist ??=
    pick(
      s.script.ids.filter((id) => QUIET.includes(id) && !own.includes(id)),
      s.r,
    ) ??
    pick(s.script.ids.filter((id) => OPTIONAL.includes(id) && !own.includes(id)), s.r) ??
    pick(
      s.script.ids.filter((id) => team(id) === "minion" && id !== "fearmonger" && !own.includes(id)),
      s.r,
    ) ??
    "poisoner";

  return said.alchemist;
}

// The Minion ability Alchemist p has, or (without it) says they have.
export const alchemistAbility = (s, p) => p.alchemist ?? pretended(s, p);

// An Alchemist-Poisoner's choice tonight, as they tell it ("I chose Player 4
// to poison."). It's no information about anyone, so it names no targets
// (see engine clues()).
export const alchemistPoisonInfo = (s, t, functioning = true) => ({
  night: s.night,
  role: "alchemist",
  text: `Alchemist: chose ${t.label} to poison.`,
  targets: [],
  trigger: "normal",
  functioning,
});

// Who a pretend Alchemist-Poisoner says they chose (see bluff.js
// storyNights() and alchemistBluff() below): another living player, at
// random; for an evil bluffer, never a teammate (nor you).
export function pretendPoison(s, p) {
  const pool = nameable(s, p).filter(
    (x) => x.alive && !(p.alignment === "evil" && teammate(p, x)),
  );

  return pick(pool, s.r);
}

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

  // (A drunk or poisoned Alchemist still learns which ability they "have".
  // An evil bluffer makes one up.)
  lie(s, p) {
    return { targets: [], text: alchemistText(p.alchemist ?? pretended(s, p)) };
  },

  random(s, p) {
    return info.lie(s, p);
  },

  // A good pretender's (see pretended()).
  story(s, p) {
    return { targets: [], text: alchemistText(pretended(s, p)) };
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

      // (An NPC tells you who they chose: see alchemistTells(). You know.)
      if (!p.human) {
        p.alchemistChose = { night: s.night, id: t.id, effective };
      }
    }
  },

  // Each Alchemist-Poisoner NPC remembers who they chose tonight (see
  // alchemists()), to tell you, after tonight's information: on Night 1,
  // after which ability they have.
  alchemistTells() {
    const s = this.s;

    for (const p of s.players.filter((x) => x.alchemistChose?.night === s.night)) {
      const { id, effective } = p.alchemistChose;

      this.remember(p, alchemistPoisonInfo(s, this.player(id), effective));
      p.alchemistChose = null;
    }
  },

  // An evil bluffer claiming the Alchemist (or a Philosopher who "gained"
  // it) with the Poisoner's ability says who they chose each night, as a
  // real one does (see alchemists()). After their Night 1 "you have the
  // Poisoner ability" (see engine bluffs()).
  alchemistBluff(p) {
    const s = this.s;
    const role = ["philosopher", "cannibal"].includes(p.claim) ? gainedRole(p) : p.claim;

    if (role !== "alchemist" || alchemistAbility(s, p) !== "poisoner") {
      return;
    }

    const t = pretendPoison(s, p);

    if (t) {
      this.rememberBluff(p, { ...alchemistPoisonInfo(s, t), functioning: false });
    }
  },
};
