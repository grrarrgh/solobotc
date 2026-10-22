import {
  name,
  team,
  PITHAG_NO_DEATH_CHANCE,
  PUBLIC_INFO_MIN_SEATS,
  PUBLIC_INFO_CHANCE,
} from "./data.js";
import { speak, heard, untwinned } from "./strategy.js";
import {
  ability,
  works,
  isDemon,
  isDrunk,
  infoMode,
  vortoxActive,
  steer,
  killHelps,
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
          p.wasMad = p.mad.role;
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

      this.woke(p);

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

      this.woke(c);
      this.chose(c, t);

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

    this.woke(w);
    this.chose(w, t);

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

    this.woke(c);
    this.chose(c, choice.target);

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

  // At dawn, a living NPC whose claim no longer matches what they last
  // claimed in public says so (nothing is said if they never claimed in
  // public):
  // - publicly mad as X yesterday, and no longer (or now mad about something
  //   else): "Yesterday the Cerenovus made me mad as the X, I am actually the
  //   Y" (their real character, an evil player's bluff, or the new madness);
  // - newly mad: "now claims to be the X" (the madness isn't given away);
  // - changed by the Pit-Hag, Barber or Snake Charmer: "woke up as the X".
  //
  // Every good NPC whose character changed in the night says so, and what
  // they were before, whether or not they'd claimed in public. (Evil players
  // say nothing about a change: it wouldn't help them.)
  announceClaims() {
    const s = this.s;

    for (const p of s.players) {
      const before = p.publicClaim;
      const wasMad = p.wasMad;
      const dusk = p.dusk;

      p.wasMad = null;
      p.dusk = null;

      if (
        !p.human &&
        p.alive &&
        p.alignment === "good" &&
        dusk &&
        dusk.role !== p.role &&
        dusk.claim !== p.claim
      ) {
        const said = ` says they woke up as the ${name(
          p.claim,
        )}; they were the ${name(dusk.claim)}.`;

        p.changes = [
          ...(p.changes ?? []),
          { night: s.night, from: dusk.claim, to: p.claim, told: false },
        ];
        this.claimPublicly(p);
        s.publicLog.push(`Day ${s.day} — ${p.label}${said}`);
        this.audit("claim", `${p.label}${said}`, {
          playerId: p.id,
          from: dusk.claim,
          to: p.claim,
        });
        continue;
      }

      if (p.human || !p.alive || !before || before === p.claim) {
        continue;
      }

      const said =
        wasMad && before === wasMad
          ? `: "Yesterday the Cerenovus made me mad as the ${name(
              wasMad,
            )}, I am actually the ${name(p.claim)}."`
          : p.mad?.day === s.day
            ? ` now claims to be the ${name(p.claim)}.`
            : ` says they woke up as the ${name(p.claim)}.`;

      this.claimPublicly(p);
      s.publicLog.push(`Day ${s.day} — ${p.label}${said}`);
      this.audit("claim", `${p.label}${said}`, {
        playerId: p.id,
        from: before,
        to: p.claim,
      });
    }
  },

  // In bigger games (PUBLIC_INFO_MIN_SEATS+), an NPC with first-night (or
  // spent) information may share it in public the morning they get it, at
  // PUBLIC_INFO_CHANCE for their character. Evil bluffers share their bluffed
  // information the same way. Sharing it reveals their claim.
  shareInfo() {
    const s = this.s;

    if (s.players.length < PUBLIC_INFO_MIN_SEATS) {
      return;
    }

    for (const p of s.players) {
      const news = p.memories.filter(
        (m) =>
          m.night === s.night && !m.day && PUBLIC_INFO_CHANCE[m.role] !== undefined,
      );

      if (p.human || p.mad?.day === s.day || !news.length) {
        continue;
      }

      const m = news.at(-1);

      if (s.r() >= PUBLIC_INFO_CHANCE[m.role]) {
        continue;
      }

      const said = ` says: "I am the ${name(p.claim)}. Night ${m.night}: ${speak(
        m.text,
      )}"`;

      this.claimPublicly(p);
      heard(s, p, [m]);
      p.shared = [...(p.shared ?? []), `Night ${m.night}: ${speak(m.text)}`];
      s.publicLog.push(`Day ${s.day} — ${p.label}${said}`);
      this.audit("share", `${p.label}${said}`, { playerId: p.id });
    }
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

  // What a player who just learned their (new) character claims: that
  // character, except that a Mutant claims a Townsfolk not in play.
  claimFor(p) {
    const s = this.s;

    if (p.role !== "mutant") {
      return p.role;
    }

    const used = new Set(s.players.flatMap((x) => [x.role, x.shown, x.claim]));
    const townsfolk = s.script.ids.filter((id) => team(id) === "townsfolk");

    return (
      pick(
        townsfolk.filter((id) => !used.has(id)),
        s.r,
      ) ??
      pick(townsfolk, s.r) ??
      p.claim
    );
  },

  // ── Demon variants ─────────────────────────────────────────

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
    let t =
      s.r() < PITHAG_NO_DEATH_CHANCE
        ? null
        : pick(steer(s, pool, killHelps, "who dies at random"), s.r);

    // "If you die at night, another player might die instead": the Mayor.
    if (t?.role === "mayor" && works(t)) {
      t =
        pick(
          pool.filter((x) => x !== t),
          s.r,
        ) ?? t;
    }

    this.audit(
      "pithag",
      t
        ? `Random death (a Demon was made): ${t.label}.`
        : "Random death (a Demon was made): nobody died.",
      { targetId: t?.id ?? null },
    );

    if (t && this.kill(t, "pithag")) {
      this.check();
    }

    return true;
  },

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

  // At dawn: Savants visit the Storyteller, Jugglers juggle (on their first
  // day), and on Day 1 the twins speak up.
  sectsDawn() {
    this.npcSavants();
    this.npcJugglers();
    this.twinsAnnounce();
  },

  // On Day 1, each NPC twin says publicly that the other is their twin and
  // that they are the good one.
  twinsAnnounce() {
    const s = this.s;
    const t = s.twins;

    if (s.day !== 1 || !t) {
      return;
    }

    for (const [id, otherId] of [
      [t.evilId, t.goodId],
      [t.goodId, t.evilId],
    ]) {
      const p = this.player(id);
      const other = this.player(otherId);

      if (!p.human && p.alive) {
        s.publicLog.push(
          `Day ${s.day} — ${p.label} says ${other.label} is their twin, and that they are the good twin.`,
        );
      }
    }
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

    // Each Juggler juggles once, on their first day as the Juggler (Day 1,
    // unless they became the Juggler later).
    for (const p of s.players.filter(
      (x) =>
        !x.human &&
        x.alive &&
        !x.juggled &&
        (ability(x) === "juggler" ||
          (x.alignment === "evil" && x.claim === "juggler")),
    )) {
      const guesses = this.strat.juggle(s, p);

      if (!guesses.length) {
        continue;
      }

      p.juggled = true;
      this.claimPublicly(p);
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

    // The Sage, killed by the Demon, learns the Demon is 1 of 2 players. An
    // evil Sage bluffer "learns" a false pair (true for the Spy).
    if (cause === "demon" && ability(p) === "sage") {
      this.remember(p, sageInfo(s, p, infoMode(s, p, true)));
    } else if (
      cause === "demon" &&
      p.alignment === "evil" &&
      p.claim === "sage"
    ) {
      this.rememberBluff(
        p,
        sageInfo(s, p, p.role === "spy" && !p.poisoned ? "truth" : "lie"),
      );
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

    // The Barber: the Demon may swap two players' characters. Swaps happen
    // at night: straight away for a night death, or that night for a death
    // in the day (see barberNight()).
    if (p.role === "barber" && sober) {
      if (s.phase === "night") {
        this.barberSwap(p);
      } else {
        s.barberPending = p.id;
      }
    }

    // The Vigormortis dies: the dead Minions it kept going lose their
    // abilities, and their neighbours' poison ends.
    if (p.role === "vigormortis") {
      const kept = s.players.filter((x) => !x.alive && x.vigor);

      for (const x of kept) {
        x.vigor = false;
      }

      // (Unless the Poisoner or a Snake Charmer swap poisoned them too.)
      for (const { id } of s.lastingPoison) {
        const x = this.player(id);

        x.poisoned = Boolean(x.lastingPoison) || s.poisoned === id;
      }

      s.lastingPoison = [];

      if (kept.length) {
        this.audit(
          "vigormortis",
          `${p.label} (Vigormortis) died; ${kept
            .map((x) => `${x.label} (${name(x.role)})`)
            .join(", ")} lost their abilities.`,
          { playerId: p.id },
        );
      }
    }
  },

  // The Klutz, "when you learn that you died", publicly picks a living
  // player; if evil, good loses.
  klutzDeath(p) {
    const sober = !p.poisoned && !isDrunk(p);

    if (
      !p.human &&
      (p.role === "klutz" || (p.alignment === "evil" && p.claim === "klutz"))
    ) {
      this.klutz(p, p.role === "klutz" && sober);
    }
  },

  // The night after a Barber died in the day, the Demon makes their swap.
  barberNight() {
    const s = this.s;
    const p = s.barberPending && this.player(s.barberPending);

    s.barberPending = null;

    if (p) {
      this.barberSwap(p);
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
      x.claim = this.claimFor(x);
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

    this.claimPublicly(p);
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
