import { name, team } from "./data.js";
import {
  ability,
  works,
  isDemon,
  isDrunk,
  infoMode,
  vortoxActive,
  seamstressInfo,
  sageInfo,
  jugglerInfo,
  savantInfo,
  evilTwinInfo,
  philosopherInfo,
  snakeInfo,
  madInfo,
} from "./storyteller.js";
import { pick } from "./util.js";

// Minions keep acting after death if the Vigormortis killed them.
const acts = (x) => x.alive || x.vigor;

// Sects & Violets characters, mixed into Engine.prototype (see engine.js), so
// `this` is the Engine.
export const sectsAndViolets = {
  // ── Lasting effects (applied at dusk) ─────────────────────

  // Effects that outlast a single night, reapplied after night() clears
  // everyone's poison: the Snake Charmer's swapped (now poisoned) Demon, the
  // Vigormortis's poisoned neighbours (while it lives) and the No Dashii's
  // two Townsfolk neighbours. Also ends yesterday's Cerenovus madness.
  lastingEffects() {
    const s = this.s;

    for (const p of s.players) {
      if (p.mad && p.mad.day < s.night) {
        if (p.mad.previous !== null) {
          p.claim = p.mad.previous;
        }

        p.mad = null;
      }

      if (p.lastingPoison) {
        p.poisoned = true;
      }
    }

    if (s.players.some((x) => x.alive && x.role === "vigormortis")) {
      for (const { id } of s.lastingPoison) {
        this.player(id).poisoned = true;
      }
    }

    for (const d of s.players.filter((x) => x.alive && x.role === "nodashii")) {
      for (const x of this.townsfolkNeighbours(d)) {
        x.poisoned = true;
      }
    }
  },

  // The nearest living Townsfolk on each side of p.
  townsfolkNeighbours(p) {
    const a = this.s.players;
    const n = a.length;
    const i = a.indexOf(p);
    const out = [];

    for (const d of [-1, 1]) {
      for (let k = 1; k < n; k++) {
        const q = a[(i + d * k + n) % n];

        if (q.alive && team(q.role) === "townsfolk") {
          if (!out.includes(q)) {
            out.push(q);
          }

          break;
        }
      }
    }

    return out;
  },

  // ── Night actions, in night order ──────────────────────────

  // Everything that happens before the Demon: Philosopher, Snake Charmer,
  // the good twin's information, Witch, Cerenovus and Pit-Hag.
  sectsDusk() {
    this.philosophers();
    this.snakeCharmers();
    this.twinInfo();
    this.witch();
    this.cerenovus();
    this.pitHag();
  },

  // Once per game, an NPC Philosopher gains a good character's ability (on
  // the first night). If that character is in play, its holder is drunk.
  philosophers() {
    const s = this.s;

    for (const p of s.players.filter(
      (x) => x.alive && !x.human && x.role === "philosopher" && !x.gained,
    )) {
      const role = this.strat.philosopher(s, p);

      if (!role) {
        continue;
      }

      const effective = works(p);
      const holder = s.players.find((x) => x !== p && x.role === role);

      p.gained = role;

      // A drunk or poisoned Philosopher only thinks they gained it.
      if (!effective) {
        p.drunkFrom = "philosopher";
      } else if (holder) {
        holder.drunkFrom = "philosopher";
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
    }
  },

  // A Snake Charmer who picks the Demon swaps characters and alignments with
  // them; the old Demon becomes a good Snake Charmer, poisoned from now on.
  snakeCharmers() {
    const s = this.s;

    for (const c of s.players.filter(
      (x) => x.alive && ability(x) === "snakecharmer",
    )) {
      const t = this.humanPicks(c)?.[0] ?? this.strat.snake(s, c);

      if (!t) {
        continue;
      }

      const swap = isDemon(t) && works(c);

      this.audit(
        "snakecharmer",
        `${c.label} (${name(c.role)}) chose ${t.label}; ${
          swap ? "swapped with the Demon" : "no effect"
        }.`,
        { actorId: c.id, targetId: t.id, effective: swap },
      );

      this.remember(c, snakeInfo(s, t));

      if (swap) {
        this.snakeSwap(c, t);
      }
    }
  },

  snakeSwap(c, d) {
    const demon = d.role;

    // The charmer becomes the Demon (keeping their Snake Charmer claim as a
    // bluff); the Demon becomes a poisoned, good Snake Charmer.
    c.role = demon;
    c.shown = demon;
    c.alignment = "evil";
    c.bluffs = d.bluffs;
    c.suspicion = null;

    d.role = "snakecharmer";
    d.shown = "snakecharmer";
    d.claim = "snakecharmer";
    d.alignment = "good";
    d.bluffs = [];
    d.suspicion = null;
    d.lastingPoison = true;
    d.poisoned = true;

    this.audit(
      "succession",
      `${c.label} became the ${name(demon)}; ${d.label} is now a poisoned Snake Charmer.`,
      { playerId: c.id, previousDemonId: d.id },
    );
  },

  // On the first night, the good twin learns who their Evil Twin is.
  twinInfo() {
    const s = this.s;

    if (s.night !== 1 || !s.twins) {
      return;
    }

    this.remember(
      this.player(s.twins.goodId),
      evilTwinInfo(s, this.player(s.twins.evilId)),
    );
  },

  // The Witch curses a player: if they nominate tomorrow, they die. With just
  // 3 players alive, the Witch loses this ability.
  witch() {
    const s = this.s;
    const w = s.players.find((x) => acts(x) && x.role === "witch");

    s.witched = null;

    if (!w || this.alive().length <= 3) {
      return;
    }

    const t = this.strat.witch(s, w);

    if (!t) {
      return;
    }

    const effective = works(w);

    s.witched = { targetId: t.id, day: s.night, effective };

    this.audit(
      "witch",
      `${w.label} (Witch) cursed ${t.label}; ${
        effective ? "they die if they nominate tomorrow" : "the curse failed"
      }.`,
      { actorId: w.id, targetId: t.id, effective },
    );
  },

  // A cursed nominator dies as they nominate (the nomination still happens).
  witchCurse(nominator) {
    const s = this.s;
    const w = s.witched;

    if (
      w?.effective &&
      w.targetId === nominator.id &&
      w.day === s.day &&
      this.alive().length > 3 &&
      this.kill(nominator, "witch")
    ) {
      this.audit(
        "witch",
        `${nominator.label} nominated while cursed by the Witch, and died.`,
        { playerId: nominator.id },
      );
      this.check();
    }
  },

  // The Cerenovus makes a good NPC "mad" about another character tomorrow:
  // all day, they claim that character and say nothing else.
  cerenovus() {
    const s = this.s;
    const c = s.players.find((x) => acts(x) && x.role === "cerenovus");
    const choice = c && this.strat.cerenovus(s, c);

    if (!choice) {
      return;
    }

    const effective = works(c);

    if (effective) {
      choice.target.mad = { role: choice.role, day: s.night, previous: null };
    }

    this.audit(
      "cerenovus",
      `${c.label} (Cerenovus) made ${choice.target.label} mad that they are the ${name(
        choice.role,
      )}${effective ? "" : ", but it failed"}.`,
      { actorId: c.id, targetId: choice.target.id, role: choice.role, effective },
    );
  },

  // At dawn, a "mad" NPC switches their claim for the day, and makes up
  // plausible information to go with it.
  applyMadness() {
    const s = this.s;

    for (const p of s.players) {
      if (p.mad?.day === s.day && p.mad.previous === null) {
        p.mad.previous = p.claim;
        p.mad.memories = madInfo(s, p, p.mad.role, this.strat);
        p.claim = p.mad.role;
      }
    }
  },

  // The Pit-Hag (from Night 2) turns a good NPC into a character not in play.
  pitHag() {
    const s = this.s;
    const h = s.players.find((x) => acts(x) && x.role === "pithag");
    const choice = s.night > 1 && h && this.strat.pithag(s, h);

    if (!choice) {
      return;
    }

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
      // They learn their new character, and claim it.
      target.role = role;
      target.shown = role;
      target.claim = role;
    }
  },

  // ── Demon variants ─────────────────────────────────────────

  // The first Outsider a Fang Gu kills becomes an evil Fang Gu instead, and
  // the old Fang Gu dies. Returns whether that happened.
  fangGuJump(d, t) {
    const s = this.s;

    if (
      d.role !== "fanggu" ||
      s.fangGuJumped ||
      t.human ||
      team(t.role) !== "outsider"
    ) {
      return false;
    }

    s.fangGuJumped = true;
    t.role = "fanggu";
    t.shown = "fanggu";
    t.alignment = "evil";
    t.bluffs = d.bluffs;
    t.suspicion = null;

    this.audit(
      "succession",
      `${t.label} became an evil Fang Gu; ${d.label} died instead.`,
      { playerId: t.id, previousDemonId: d.id },
    );

    this.kill(d, "fanggu");

    return true;
  },

  // A Minion the Vigormortis kills keeps their ability, and poisons one of
  // their Townsfolk neighbours (for as long as the Vigormortis lives).
  vigormortisKill(d, t) {
    const s = this.s;

    if (d.role !== "vigormortis" || team(t.role) !== "minion") {
      return;
    }

    const n = pick(this.townsfolkNeighbours(t), s.r);

    t.vigor = true;

    if (n) {
      s.lastingPoison.push({ id: n.id });
      n.poisoned = true;
    }

    this.audit(
      "vigormortis",
      `${t.label} (${name(t.role)}) keeps their ability${
        n ? `; ${n.label} is poisoned` : ""
      }.`,
      { playerId: t.id, poisonedId: n?.id ?? null },
    );
  },

  // The Vortox: a day with no execution means evil wins. Returns whether the
  // game ended.
  vortoxDay() {
    if (vortoxActive(this.s) && !this.s.executedToday) {
      this.finish("evil", "Nobody was executed while the Vortox lives.");
      return true;
    }

    return false;
  },

  // ── Evil Twin ─────────────────────────────────────────────

  // While both twins live (and the Evil Twin works), good can't win.
  twinsBlockGood() {
    const t = this.s.twins;
    const evil = t && this.player(t.evilId);
    const good = t && this.player(t.goodId);

    return Boolean(
      evil?.role === "eviltwin" && works(evil) && good?.alive,
    );
  },

  // If the good twin is executed while the Evil Twin works, evil wins.
  goodTwinExecuted(n) {
    const t = this.s.twins;
    const evil = t && this.player(t.evilId);

    if (t?.goodId === n.id && evil?.role === "eviltwin" && works(evil)) {
      this.finish("evil", "The good twin was executed.");
      return true;
    }

    return false;
  },

  // ── Information after the Demon ───────────────────────────

  // The Seamstress and Juggler, after the night's other information.
  sectsInfo() {
    this.seamstresses();
    this.jugglerNight();
  },

  // Once per game, a Seamstress learns if two players share an alignment.
  // The human chooses when (or skips); NPCs pick a night at random.
  seamstresses() {
    const s = this.s;

    for (const p of s.players.filter(
      (x) => x.alive && ability(x) === "seamstress" && !x.seamUsed,
    )) {
      const picks = p.human ? this.humanPicks(p) : this.strat.seamstress(s, p);

      if (picks?.length !== 2) {
        continue;
      }

      p.seamUsed = true;
      this.remember(p, seamstressInfo(s, picks[0], picks[1], infoMode(s, p)));
    }
  },

  // The night after juggling, the Juggler learns how many guesses were
  // right. An evil Juggler bluffer "learns" a number too.
  jugglerNight() {
    const s = this.s;

    for (const p of s.players.filter((x) => x.juggle?.night === s.night)) {
      const { guesses } = p.juggle;

      if (p.alignment === "good") {
        this.remember(p, jugglerInfo(s, guesses, infoMode(s, p)));
      } else {
        const spy = p.role === "spy" && works(p);

        this.rememberBluff(p, jugglerInfo(s, guesses, spy ? "truth" : "lie"));
      }

      p.juggle = null;
    }
  },

  // ── Dawn and day ───────────────────────────────────────────

  // At dawn: Savants visit the Storyteller, and on Day 1 Jugglers juggle.
  sectsDawn() {
    this.npcSavants();
    this.npcJugglers();
  },

  // NPC Savants (and evil Savant bluffers) visit the Storyteller each day.
  npcSavants() {
    const s = this.s;

    for (const p of s.players.filter(
      (x) =>
        !x.human &&
        x.alive &&
        x.savantDay !== s.day &&
        (ability(x) === "savant" ||
          (x.alignment === "evil" && x.claim === "savant")),
    )) {
      p.savantDay = s.day;

      if (p.alignment === "good") {
        this.remember(p, savantInfo(s, p, infoMode(s, p)));
      } else {
        const spy = p.role === "spy" && works(p);

        this.rememberBluff(p, savantInfo(s, p, spy ? "truth" : "lie"));
      }
    }
  },

  // The human Savant's daily visit to the Storyteller.
  savant() {
    const s = this.s;
    const h = this.human();

    if (
      s.phase !== "day" ||
      s.winner ||
      ability(h) !== "savant" ||
      !h.alive ||
      h.savantDay === s.day
    ) {
      throw Error("Savant unavailable.");
    }

    h.savantDay = s.day;

    const info = savantInfo(s, h, infoMode(s, h));

    this.remember(h, info);

    return info.text;
  },

  // On Day 1, NPC Jugglers (and evil Juggler bluffers) publicly guess up to 5
  // players' characters.
  npcJugglers() {
    const s = this.s;

    if (s.day !== 1) {
      return;
    }

    for (const p of s.players.filter(
      (x) =>
        !x.human &&
        x.alive &&
        (ability(x) === "juggler" ||
          (x.alignment === "evil" && x.claim === "juggler")),
    )) {
      const guesses = this.strat.juggle(s, p);

      if (!guesses.length) {
        continue;
      }

      p.claimKnown = true;
      p.juggle = { night: s.day + 1, guesses };

      // One guess per line.
      const list = guesses
        .map((g) => `${this.player(g.id).label} is the ${name(g.role)}`)
        .join("\n");

      s.publicLog.push(
        `Day ${s.day} — ${p.label} claims Juggler and guesses:\n${list}`,
      );

      this.audit(
        "juggler",
        `${p.label} (${name(p.role)}) claims Juggler and guesses:\n${list}`,
        { actorId: p.id, guesses },
      );
    }
  },

  // ── Death triggers ─────────────────────────────────────────

  // Sects & Violets abilities that trigger when p dies.
  sectsDeath(p, cause) {
    const s = this.s;
    const sober = !p.poisoned && !isDrunk(p);

    // The Sage, killed by the Demon, learns the Demon is 1 of 2 players.
    if (cause === "demon" && ability(p) === "sage") {
      this.remember(p, sageInfo(s, p, infoMode(s, p, true)));
    }

    // The Sweetheart: someone is drunk from now on.
    if (p.role === "sweetheart" && sober) {
      const t = this.strat.sweetheart(s, p);

      if (t) {
        t.drunkFrom = "sweetheart";

        this.audit(
          "sweetheart",
          `${p.label} (Sweetheart) died; ${t.label} is drunk from now on.`,
          { playerId: p.id, drunkId: t.id },
        );
      }
    }

    // The Barber: the Demon may swap two players' characters.
    if (p.role === "barber" && sober) {
      this.barberSwap(p);
    }

    // The Klutz publicly picks a living player; if evil, good loses.
    if (
      !p.human &&
      (p.role === "klutz" || (p.alignment === "evil" && p.claim === "klutz"))
    ) {
      this.klutz(p, p.role === "klutz" && sober);
    }
  },

  barberSwap(p) {
    const s = this.s;
    const d = s.players.find((x) => x.alive && isDemon(x));
    const pair = d && this.strat.barber(s, d);

    if (!pair) {
      return;
    }

    const [a, b] = pair;

    // Each learns (and claims) their new character.
    [a.role, b.role] = [b.role, a.role];

    for (const x of [a, b]) {
      x.shown = x.role;
      x.claim = x.role;
      x.gained = null;
    }

    this.audit(
      "barber",
      `${p.label} (Barber) died; the Demon swapped ${a.label} (now ${name(
        a.role,
      )}) and ${b.label} (now ${name(b.role)}).`,
      { playerId: p.id, swapped: [a.id, b.id] },
    );
  },

  klutz(p, real) {
    const s = this.s;
    const t = this.strat.klutz(s, p);

    if (!t) {
      return;
    }

    p.claimKnown = true;
    s.publicLog.push(`${p.label} claims Klutz and chooses ${t.label}.`);

    this.audit(
      "klutz",
      `${p.label} (${name(p.role)}) chose ${t.label} (${t.alignment})${
        real ? "" : "; no effect"
      }.`,
      { actorId: p.id, targetId: t.id, effective: real },
    );

    if (real && t.alignment === "evil") {
      this.finish("evil", "The Klutz chose an evil player.");
    }
  },
};
