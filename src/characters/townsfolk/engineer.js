import { COUNTS, name, team } from "../../data.js";
import { ability, works, jinxBarred, who } from "../../storyteller.js";
import { shuffle } from "../../util.js";
import { madeUpMemories } from "../../bluff.js";
import { sideOf } from "../../strategy.js";

// The Engineer, mixed into Engine.prototype (see characters/index.js), so
// `this` is the Engine.
//
// "Once per game, at night, choose which Minions or which Demon is in
// play": the Minions (as many as the setup sheet has for the seats) or the
// Demon, never both, from the script's characters (see engineerOptions()).
// The evil players keep their seats and their team, and learn their new
// character; one whose character was chosen keeps it, and the Engineer
// isn't told. Choosing Minions, any already in play stay, and the rest
// change, as many as there are to change (the Storyteller's "fair and
// feasible"): never the Marionette, who thinks they're good, nor the Evil
// Twin, whose twin is good. The Demon's [Outsider] modifier only changes
// setup. They wake each night until they use it (`engineerUsed`: the
// night); drunk or poisoned, it's used up and nothing happens. In an
// Atheist game nobody is evil, so nothing happens either.
//
// An NPC Engineer uses it by Night 3, on the choice that helps good most
// (see strategy engineer(), ENGINEER_* in data.js), and says so at dawn
// (npcEngineers()), as anyone claiming it does with a made-up choice (see
// `info` below, and bluff.js).
//
// Its jinx with Legion: if the Engineer makes Legion, every evil player
// becomes Legion; if Legion is in play, the Engineer learns it and has no
// ability.
export const engineer = {
  // Tonight's Engineers (in night order: before the Poisoner).
  engineers() {
    const s = this.s;

    for (const p of s.players.filter(
      (x) => x.alive && ability(x) === "engineer" && !x.engineerUsed,
    )) {
      // (Legion's jinx: they learn it, and have no ability.)
      if (s.players.some((x) => x.role === "legion")) {
        p.engineerUsed = s.night;
        this.woke(p);
        this.audit("engineer", `${p.label} (${name(p.role)}) learns Legion is in play, and has no ability (their jinx).`, {
          actorId: p.id,
        });
        this.remember(p, {
          night: s.night,
          role: "engineer",
          text: "Engineer: Legion is in play, so you have no ability.",
          targets: [],
          trigger: "normal",
          functioning: true,
        });
        continue;
      }

      const c = s.humanChoice;
      const choice = p.human
        ? c?.night === s.night && c.engineer
          ? c.engineer
          : null
        : this.strat.engineer(s, p);

      this.woke(p);

      if (choice) {
        this.engineerUses(p, choice);
      } else if (!p.human) {
        this.audit("engineer", `${p.label} (${name(p.role)}) doesn't use the Engineer ability tonight.`, {
          actorId: p.id,
        });
      }
    }
  },

  // Engineer p's choice ({ kind: "demon" or "minions", roles }): the evil
  // players change, logged, and p remembers what they chose (nothing more:
  // not what was already in play, nor that it failed).
  engineerUses(p, choice) {
    const s = this.s;
    const effective = works(p);
    const what = engineerMade(choice);
    const changed = [];

    p.engineerUsed = s.night;

    if (effective && !s.atheist) {
      if (choice.kind === "minions") {
        changed.push(...this.engineerMinions(choice.roles));
      } else if (choice.roles[0] === "legion") {
        // (Legion's jinx: every evil player becomes Legion.)
        for (const x of s.players.filter((y) => y.alignment === "evil" && y.role !== "legion")) {
          changed.push(this.engineerChange(x, "legion"));
        }
      } else {
        // (The living Demon: not Lil' Monsta, who isn't a player. A Zombuul
        // that only registers as dead stays the Zombuul: simplified.)
        for (const x of s.players.filter((y) => (y.alive || y.undead) && team(y.role) === "demon")) {
          if (x.undead) {
            changed.push(`${x.label} (Zombuul), who registers as dead, stays the Zombuul`);
          } else if (x.role !== choice.roles[0]) {
            changed.push(this.engineerChange(x, choice.roles[0]));
          }
        }
      }
    }

    // (An evil Engineer, turned by the Mezepheles, says what a good one
    // would have chosen: see strategy engineerBluff().)
    const said = !p.human && sideOf(p) === "evil" ? this.strat.engineerBluff(this.s, p) : null;

    this.audit(
      "engineer",
      `${p.label} (${name(p.role)}) made ${what}${choice.why ? ` (why: ${choice.why})` : ""}${
        !effective
          ? ", but the Engineer is drunk or poisoned: nothing changes"
          : s.atheist
            ? ", but nobody is evil (the Atheist is in play): nothing changes"
            : changed.length
              ? `: ${changed.join("; ")}`
              : ": already in play, so nothing changes"
      }${said ? `; they'll say they made ${engineerMade(said)}, as a good Engineer would` : ""}.`,
      { actorId: p.id, kind: choice.kind, roles: choice.roles, effective },
    );

    // (Drunk or poisoned, it's misinformation in log.txt: see remember().)
    this.remember(p, said ? { ...engineerInfo(s, said), functioning: false } : { ...engineerInfo(s, choice), functioning: effective });

    // (A new Godfather learns the Outsiders now: Night 1's step has passed.)
    if (s.night > 1) {
      this.godfatherFirstNight();
    }
  },

  // The Engineer's Minions (`roles`): the Minions in play (dead ones too)
  // whose character wasn't chosen (never the Marionette or Evil Twin)
  // become the chosen ones not in play, in a random order, as many as can,
  // so no character is in play twice. Returns what changed, for the log.
  engineerMinions(roles) {
    const s = this.s;
    const minions = s.players.filter((x) => team(x.role) === "minion");
    const want = roles.filter((id) => !minions.some((x) => x.role === id));
    const free = shuffle(
      minions.filter((x) => !roles.includes(x.role) && !["marionette", "eviltwin"].includes(x.role)),
      s.r,
    );

    return want.slice(0, free.length).map((id, i) => this.engineerChange(free[i], id));
  },

  // Evil player x becomes `role` (the Engineer's choice), and learns it.
  // Returns what happened, for the log.
  engineerChange(x, role) {
    const s = this.s;
    const was = x.role;

    // (What the old Demon's ability left behind ends.)
    this.engineerEnds(x, was);

    x.role = role;
    x.shown = role;
    // (A "first night" ability is used tonight: the Widow's, the
    // Godfather's. See startsTonight().)
    x.gainedNight = s.night;

    // (A Lleech no more: its host is free.)
    if (was === "lleech") {
      x.lleechHost = null;
    }

    // (A new Mezepheles turns a good player from tonight, or Night 2.)
    if (role === "mezepheles" && !s.mezepheles) {
      s.mezepheles = { night: Math.max(s.night, 2), used: false };
    }

    return `${x.label} (${name(was)}) is now the ${name(role)}, and learns it`;
  },

  // What Demon x's old character (`was`) left behind, ended as they become
  // another, logged: a Vigormortis's dead Minions lose their abilities and
  // their neighbours' poison ends (as when it dies); a Pukka's victim isn't
  // poisoned, and won't die; a Shabaloth's choices can't be regurgitated;
  // a Po's charge is gone. (A Lleech's host is freed: see engineerChange().
  // An Al-Hadikhia's choice tonight isn't made: see alhadikhia.js.)
  engineerEnds(x, was) {
    const s = this.s;

    if (was === "vigormortis") {
      const kept = s.players.filter((y) => !y.alive && y.vigor);

      for (const y of kept) {
        y.vigor = false;
      }

      for (const { id } of s.lastingPoison ?? []) {
        const y = this.player(id);

        y.poisoned = Boolean(y.lastingPoison) || s.poisoned === id;
      }

      s.lastingPoison = [];
      this.audit(
        "engineer",
        `${x.label} is no longer the Vigormortis: ${
          kept.length ? `${kept.map((y) => y.label).join(", ")} lose their abilities, and ` : ""
        }its Minions' neighbours are no longer poisoned.`,
        { playerId: x.id },
      );
    }

    if (was === "pukka" && s.pukka) {
      const v = this.player(s.pukka.targetId);

      if (v?.poisonedBy === who(x)) {
        v.poisoned = false;
      }

      s.pukka = null;
      this.audit("engineer", `${x.label} is no longer the Pukka: ${v?.label ?? "nobody"} won't die of its poison.`, {
        playerId: x.id,
      });
    }

    if (was === "shabaloth") {
      s.shabaloth = [];
    }

    if (was === "po") {
      x.poCharged = false;
    }
  },

  // At dawn, an NPC who used the Engineer last night (or claims to have:
  // a made-up choice, see `info`) says what they made, in public.
  npcEngineers() {
    const s = this.s;

    for (const p of s.players.filter((x) => x.alive && !x.human)) {
      const m = [...p.memories, ...(madeUpMemories(p, "engineer") ?? [])].find(
        (x) => x.role === "engineer" && x.engineer && x.night === s.day && !x.announced,
      );

      if (!m) {
        continue;
      }

      m.announced = true;

      // (Saying so ends a cover story as another character.)
      if (p.cover && p.cover.as !== "engineer") {
        p.cover = null;
      }

      // (A Cannibal who ate the Engineer, or a Philosopher who gained it,
      // says so as what they claim.)
      const claim = p.cover?.as ?? p.claim;
      const as = claim === "engineer" ? "the Engineer" : `the ${name(claim)}, with the Engineer's ability`;
      const line = `Day ${s.day} — ${p.label}: "I'm ${as}: last night I made ${engineerMade(m.engineer)}."`;

      this.claimPublicly(p);
      s.publicLog.push(line);
      this.audit("engineer", line.replace(/^Day \d+ — /, ""), { playerId: p.id, ...m.engineer });
    }
  },

  // Your choice as the Engineer (`kind`: "demon" or "minions"; `roles`:
  // the characters): checked against what you're offered (see wakeHuman()),
  // and used tonight. ("Not tonight" is choose([]).)
  engineerChoose(kind, roles) {
    const s = this.s;
    const p = s.pending;

    if (p?.role !== "engineer") {
      throw Error("Nothing to choose.");
    }

    const options = kind === "demon" ? p.engineer.demons : kind === "minions" ? p.engineer.minions : null;
    const need = kind === "demon" ? 1 : p.engineer.count;
    const picked = [...new Set(roles ?? [])];

    if (!options || picked.length !== need || picked.some((id) => !options.includes(id))) {
      throw Error(
        kind === "minions"
          ? `Choose ${need} different Minion${need === 1 ? "" : "s"}.`
          : "Choose a Demon on the script.",
      );
    }

    s.pending = null;
    s.humanChoice = { role: "engineer", night: s.night, players: [], engineer: { kind, roles: picked } };
    this.audit("choice", `${this.human().label} chose to make ${engineerMade({ kind, roles: picked })}.`, {
      kind,
      roles: picked,
    });

    this.nightGoesOn();
  },
};

// "a Poisoner", "an Imp".
const a = (id) => `${/^[AEIOU]/.test(name(id)) ? "an" : "a"} ${name(id)}`;

// What an Engineer's choice made: "the Demon a Vigormortis", "the Minions a
// Poisoner and a Pit-Hag".
export const engineerMade = (c) =>
  `the ${c.kind === "demon" ? "Demon" : "Minions"} ${
    c.roles.length > 1 ? `${c.roles.slice(0, -1).map(a).join(", ")} and ${a(c.roles.at(-1))}` : a(c.roles[0])
  }`;

// What the Engineer remembers of their choice `c` (and says, as "I made the
// Demon a Vigormortis").
export const engineerInfo = (s, c) => ({
  night: s.night,
  role: "engineer",
  text: `Engineer: made ${engineerMade(c)}.`,
  targets: [],
  engineer: { kind: c.kind, roles: [...c.roles] },
  trigger: "normal",
  functioning: true,
});

// What an Engineer can choose tonight: the script's Demons and Minions, and
// how many Minions (the setup sheet's, or as many as there are). Never Lil'
// Monsta (not a player), the Marionette or the Evil Twin (they need a
// neighbour or a twin from setup), the Leviathan after Day 5 (as for the
// Pit-Hag: their jinx), nor anything a jinx keeps out of play with what's
// in it. `npc`: an NPC's own options, without Legion (which makes every
// evil player Legion) or the Leviathan.
export function engineerOptions(s, npc = false) {
  const barred = jinxBarred(s);
  const never = [
    "lilmonsta",
    "marionette",
    "eviltwin",
    ...(npc ? ["legion", "leviathan"] : s.night > 5 ? ["leviathan"] : []),
  ];
  const ok = (t) => (id) => team(id) === t && !never.includes(id) && !barred.has(id);
  const minions = s.script.ids.filter(ok("minion"));

  return {
    demons: s.script.ids.filter(ok("demon")),
    minions,
    count: Math.min(COUNTS[s.players.length]?.[2] ?? 1, minions.length),
  };
}

// The Engineer, as told by someone claiming it without its ability (see
// bluff.js bluffTonight(), backStory()): once, on a night of their choosing
// (by Night 3, as a real one), what they "made": an evil bluffer's choice
// misleads (see strategy engineerBluff()), a good pretender's is what a
// real Engineer would choose. Null on other nights.
export const info = {
  once(s, p, strat, mode) {
    if (p.engineerUsed || !strat.engineerTonight(s)) {
      return null;
    }

    // (An evil bluffer's mode is "lie", or a Spy's "truth": either way, a
    // choice that helps evil.)
    const c = mode === "random" ? strat.engineerPick(s, p) : strat.engineerBluff(s, p);

    if (!c) {
      return null;
    }

    p.engineerUsed = s.night;

    return { ...engineerInfo(s, c), functioning: false };
  },
};
