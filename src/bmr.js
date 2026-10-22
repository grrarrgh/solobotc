import {
  name,
  team,
  ARTIST_QUESTIONS,
  SAILOR_DRUNK_SELF_CHANCE,
  SAILOR_LATE_ALIVE,
  SAILOR_LATE_DRUNK_CHANCE,
  PROTECTION_ROLES,
  SINK_KILL_CHANCE,
  PACIFIST_SAVE_CHANCE,
  TINKER_DEATH_CHANCE,
  SHABALOTH_REGURGITATE_CHANCE,
} from "./data.js";
import { heard, isTwin, untwinned } from "./strategy.js";
import {
  ability,
  works,
  isDemon,
  infoMode,
  artistTruth,
  chambermaidInfo,
  choiceInfo,
  gossipInfo,
} from "./storyteller.js";
import { pick } from "./util.js";

// Minions keep acting after death if the Vigormortis killed them.
const acts = (x) => x.alive || x.vigor;

// Bad Moon Rising characters, mixed into Engine.prototype (see engine.js), so
// `this` is the Engine.
export const badMoonRising = {
  // ── Bookkeeping ────────────────────────────────────────────

  // p woke tonight due to their ability (what the Chambermaid learns about).
  woke(p) {
    const s = this.s;

    if (p && !s.woke.includes(p.id)) {
      s.woke.push(p.id);
    }
  },

  // `actor` chose `targets` with their ability. The first player each night
  // to choose a working Goon is drunk until dusk, and the Goon joins their
  // team. Call this before checking whether the actor's ability works.
  chose(actor, targets) {
    const s = this.s;

    this.sailorResolve({ actor });

    for (const t of [].concat(targets ?? [])) {
      if (
        !t ||
        t === actor ||
        t.role !== "goon" ||
        !works(t) ||
        t.goonNight === s.night
      ) {
        continue;
      }

      const turned = t.alignment !== actor.alignment;

      t.goonNight = s.night;
      t.alignment = actor.alignment;
      actor.drunkTonight = true;

      if (turned) {
        t.suspicion = null;
      }

      this.audit(
        "goon",
        `${actor.label} (${name(actor.role)}) chose ${t.label} (Goon): ${
          actor.label
        } is drunk until dusk${turned ? `; ${t.label} turns ${t.alignment}` : ""}.`,
        { actorId: actor.id, targetId: t.id, alignment: t.alignment },
      );
    }
  },

  // The living players either side of p.
  aliveNeighbours(p) {
    const a = this.s.players;
    const n = a.length;
    const i = a.indexOf(p);
    const out = [];

    for (const d of [-1, 1]) {
      for (let k = 1; k < n; k++) {
        const q = a[(i + d * k + n) % n];

        if (q.alive) {
          if (q !== p && !out.includes(q)) {
            out.push(q);
          }

          break;
        }
      }
    }

    return out;
  },

  // Why p can't die right now (null if they can).
  cantDie(p, cause) {
    return this.guard(p, cause)?.text ?? null;
  },

  // What stops p dying right now, if anything: { text, by }, where `by` is
  // the player protecting them (none for a Sailor, who protects themself).
  // A working Sailor, the Innkeeper's protection tonight, or a working Tea
  // Lady whose two living neighbours (p among them) are both good. Nothing
  // stops the Assassin.
  guard(p, cause) {
    const s = this.s;

    if (cause === "assassin") {
      return null;
    }

    if (ability(p) === "sailor" && works(p)) {
      return { text: "the Sailor can't die", by: null };
    }

    if (s.phase === "night" && p.safeNight === s.night) {
      return { text: "protected by the Innkeeper", by: p.safeBy };
    }

    for (const t of s.players.filter(
      (x) => x.alive && x !== p && ability(x) === "tealady" && works(x),
    )) {
      const near = this.aliveNeighbours(t);

      if (
        near.length === 2 &&
        near.includes(p) &&
        near.every((x) => x.alignment === "good")
      ) {
        return { text: "protected by the Tea Lady", by: t.id };
      }
    }

    return null;
  },

  // Brings a dead player back to life (the Professor, the Shabaloth). They're
  // announced at dawn.
  revive(p, by) {
    const s = this.s;

    p.alive = true;
    p.ghost = true;
    p.death = null;
    p.diedAtNight = null;
    s.nightDeaths = s.nightDeaths.filter((id) => id !== p.id);
    s.revived.push(p.id);

    this.audit(by, `${p.label} (${name(p.role)}) came back to life.`, {
      playerId: p.id,
    });
  },

  // ── Dusk ───────────────────────────────────────────────────

  // Effects that last more than one night, reapplied at dusk: the Courtier's
  // 3 nights and days of drunkenness, the Minstrel's drunk town, and the
  // Pukka's victim, poisoned until they die.
  bmrLasting() {
    const s = this.s;

    for (const p of s.players) {
      if (p.drunkTill >= s.night) {
        p.drunkTonight = true;
      }

      if (s.minstrelUntil >= s.night && p.role !== "minstrel") {
        p.drunkTonight = true;
      }
    }

    const pukka = s.players.find((x) => x.alive && x.role === "pukka");
    const victim = pukka && s.pukka && this.player(s.pukka.targetId);

    if (victim?.alive) {
      victim.poisoned = true;
    }
  },

  // ── Night actions, in night order ──────────────────────────

  // Early in the night: the Sailor, Innkeeper and Courtier.
  bmrDusk() {
    this.sailors();
    this.innkeepers();
    this.courtiers();
  },

  // Each night, the Sailor chooses a player: the Storyteller makes one of
  // them drunk until dusk, deciding which when it first matters (see
  // sailorResolve()).
  sailors() {
    const s = this.s;

    for (const p of s.players.filter(
      (x) => x.alive && ability(x) === "sailor",
    )) {
      const t = this.humanPicks(p)?.[0] ?? this.strat.sailor(s, p);

      if (!t) {
        continue;
      }

      this.woke(p);
      this.chose(p, t);

      const effective = works(p);

      if (effective) {
        s.sailorPending.push({ sailorId: p.id, targetId: t.id });
      }

      this.audit(
        "sailor",
        `${p.label} (${name(p.role)}) chose ${t.label}${
          effective ? "" : "; no effect"
        }.`,
        { actorId: p.id, targetId: t.id, effective },
      );

      this.remember(p, choiceInfo(s, "sailor", "chose", [t]));
    }
  },

  // The Storyteller decides who a Sailor's choice makes drunk, the first time
  // it matters: when `actor` (the Sailor's pick) uses an ability, when
  // `victim` (either of them, or anyone the Demon attacks if the Sailor
  // chose the Demon) is attacked by `demon` (or anyone, without one), or at
  // dawn (no arguments: every choice still open).
  sailorResolve({ actor = null, demon = null, victim = null } = {}) {
    const s = this.s;

    for (const c of [...s.sailorPending]) {
      const sailor = this.player(c.sailorId);
      const target = this.player(c.targetId);
      const pair = [sailor, target];
      const now =
        !actor && !victim
          ? true
          : pair.includes(actor) || pair.includes(victim) || pair.includes(demon);

      if (!now) {
        continue;
      }

      s.sailorPending = s.sailorPending.filter((x) => x !== c);

      const { drunk, why } = this.sailorDrunk(sailor, target, demon, victim);

      if (drunk) {
        drunk.drunkTonight = true;
      }

      this.audit(
        "sailor",
        `The Storyteller makes ${
          drunk ? drunk.label : "nobody"
        } drunk until dusk (${sailor.label}'s Sailor choice)${why}.`,
        { actorId: sailor.id, targetId: target.id, drunkId: drunk?.id ?? null },
      );
    }
  },

  // Who the Storyteller makes drunk for a Sailor's choice, and why:
  // - never a twin;
  // - with fewer than SAILOR_LATE_ALIVE alive, the Sailor more often than
  //   not (SAILOR_LATE_DRUNK_CHANCE);
  // - when it decides whether an attack on `victim` kills, the choice that
  //   saves a good victim, or lets an evil one die;
  // - otherwise the Sailor at SAILOR_DRUNK_SELF_CHANCE.
  sailorDrunk(sailor, target, demon, victim) {
    const s = this.s;
    const options = untwinned(s, [sailor, target]);

    if (options.length < 2) {
      return { drunk: options[0] ?? null, why: "" };
    }

    if (this.alive().length < SAILOR_LATE_ALIVE && s.r() < SAILOR_LATE_DRUNK_CHANCE) {
      return { drunk: sailor, why: ": few players are left" };
    }

    if (victim) {
      const lands = (x) => {
        const was = x.drunkTonight;

        x.drunkTonight = true;

        const died = this.wouldDie(victim, demon);

        x.drunkTonight = was;

        return died;
      };
      const ifSailor = lands(sailor);

      if (ifSailor !== lands(target)) {
        const want = victim.alignment === "evil";

        return {
          drunk: ifSailor === want ? sailor : target,
          why: `, so ${victim.label} ${want ? "dies" : "lives"}`,
        };
      }
    }

    return {
      drunk: s.r() < SAILOR_DRUNK_SELF_CHANCE ? sailor : target,
      why: "",
    };
  },

  // Whether an attack on `victim` (by `demon`, or by anyone else without
  // one) would kill them as things stand.
  wouldDie(victim, demon = null) {
    if (demon) {
      if (!works(demon)) {
        return false;
      }

      if ((victim.role === "soldier" && works(victim)) || victim.protected) {
        return false;
      }
    }

    return (
      !this.guard(victim, demon ? "demon" : "attack") &&
      !this.foolSaves(victim, demon ? "demon" : "attack")
    );
  },

  // An evil player is publicly claiming a protection character (the Monk,
  // Soldier, Sailor, Innkeeper or Tea Lady): at SINK_KILL_CHANCE the Demon
  // kills nobody tonight, so the claim looks real. Returns whether it did.
  // (A Po that sinks a kill has chosen no-one, so kills 3 tomorrow night.)
  sinkKill(d) {
    const s = this.s;
    const bluffer = pick(
      s.players.filter(
        (x) =>
          x.alive &&
          !x.human &&
          x.alignment === "evil" &&
          x.claimKnown &&
          PROTECTION_ROLES.includes(x.claim),
      ),
      s.r,
    );

    if (!bluffer || s.r() >= SINK_KILL_CHANCE) {
      return false;
    }

    if (d.role === "po") {
      d.poCharged = true;
    }

    this.audit(
      "demon",
      `${d.label} (${name(d.role)}) sank tonight's kill, so ${bluffer.label}'s ${name(
        bluffer.claim,
      )} claim looks real.`,
      { actorId: d.id, bluffId: bluffer.id, outcome: "sunk" },
    );

    return true;
  },

  // From Night 2, the Innkeeper protects 2 players from dying tonight; one
  // of them is drunk until dusk.
  innkeepers() {
    const s = this.s;

    if (s.night < 2) {
      return;
    }

    for (const p of s.players.filter(
      (x) => x.alive && ability(x) === "innkeeper",
    )) {
      const picks = this.humanPicks(p) ?? this.strat.innkeeper(s, p);

      if (picks?.length !== 2) {
        continue;
      }

      this.woke(p);
      this.chose(p, picks);

      const effective = works(p);
      const drunk = effective ? pick(untwinned(s, picks), s.r) : null;

      if (effective) {
        for (const x of picks) {
          x.safeNight = s.night;
          x.safeBy = p.id;
        }

        if (drunk) {
          drunk.drunkTonight = true;
        }
      }

      this.audit(
        "innkeeper",
        `${p.label} (${name(p.role)}) protected ${picks
          .map((x) => x.label)
          .join(" and ")}; ${
          effective
            ? `they can't die tonight${
                drunk ? `, and ${drunk.label} is drunk until dusk` : ""
              }`
            : "the protection failed"
        }.`,
        { actorId: p.id, targetIds: picks.map((x) => x.id), effective },
      );

      this.remember(p, choiceInfo(s, "innkeeper", "protected", picks));
    }
  },

  // Once per game, the Courtier chooses a character: whoever has it is drunk
  // for 3 nights and 3 days. (They wake each night until they use it.)
  courtiers() {
    const s = this.s;

    for (const p of s.players.filter(
      (x) => x.alive && ability(x) === "courtier" && !x.courtierUsed,
    )) {
      const c = s.humanChoice;
      const role = p.human
        ? c?.night === s.night
          ? c.character
          : null
        : this.strat.courtier(s, p);

      this.woke(p);

      if (!role) {
        continue;
      }

      const effective = works(p);
      const holders = s.players.filter((x) => x.role === role);

      p.courtierUsed = true;

      if (effective) {
        for (const x of holders) {
          x.drunkTill = s.night + 2;
          x.drunkTonight = true;
        }
      }

      this.audit(
        "courtier",
        `${p.label} (${name(p.role)}) chose the ${name(role)}; ${
          !effective
            ? "it failed"
            : holders.length
              ? `${holders
                  .map((x) => x.label)
                  .join(", ")} drunk for 3 nights and 3 days`
              : "not in play"
        }.`,
        { actorId: p.id, role, effective },
      );

      this.remember(p, choiceInfo(s, "courtier", "chose", role));
    }
  },

  // Night 1 for Bad Moon Rising's evil team: the Godfather learns which
  // Outsiders are in play, and the Pukka poisons its first victim.
  bmrFirstNight() {
    const s = this.s;

    for (const g of s.players.filter(
      (x) => x.alive && x.role === "godfather",
    )) {
      const outsiders = s.players.filter((x) => team(x.role) === "outsider");

      this.woke(g);
      g.knownOutsiders = outsiders.map((x) => x.role);

      this.audit(
        "godfather",
        `${g.label} (Godfather) learns the Outsiders in play: ${
          outsiders.map((x) => name(x.role)).join(", ") || "none"
        }.`,
        { actorId: g.id },
      );
    }

    const d = s.players.find((x) => x.alive && x.role === "pukka");

    if (d) {
      this.woke(d);
      this.pukka(d);
    }
  },

  // From Night 2, the Exorcist chooses a player (not last night's): a chosen
  // Demon learns who the Exorcist is, and doesn't wake tonight.
  exorcists() {
    const s = this.s;

    for (const p of s.players.filter(
      (x) => x.alive && ability(x) === "exorcist",
    )) {
      const t = this.humanPicks(p)?.[0] ?? this.strat.exorcist(s, p);

      if (!t) {
        continue;
      }

      p.lastPicks = { ...p.lastPicks, exorcist: [t.id] };
      this.woke(p);
      this.chose(p, t);

      const hit = works(p) && isDemon(t);

      if (hit) {
        t.exorcised = s.night;
        t.exorcistId = p.id;
      }

      this.audit(
        "exorcist",
        `${p.label} (${name(p.role)}) chose ${t.label}; ${
          hit ? "the Demon learns who they are, and doesn't wake" : "no effect"
        }.`,
        { actorId: p.id, targetId: t.id, effective: hit },
      );

      this.remember(p, choiceInfo(s, "exorcist", "chose", [t]));
    }
  },

  // The Lunatic thinks they're the Demon: each night they "kill" someone,
  // with no effect. The Demon learns who they chose.
  lunatics() {
    const s = this.s;

    s.lunaticPick = null;

    for (const p of s.players.filter(
      (x) => x.alive && !x.human && x.role === "lunatic",
    )) {
      const t = this.strat.lunatic(s, p);

      if (!t) {
        continue;
      }

      this.woke(p);
      s.lunaticPick = t.id;

      this.audit(
        "lunatic",
        `${p.label} (Lunatic) chose ${t.label} to "kill"; no effect, but the Demon learns it.`,
        { actorId: p.id, targetId: t.id },
      );
    }
  },

  // Whether the Demon sleeps tonight: chosen by the Exorcist, or a Zombuul
  // after a day when someone died. (The Pukka's last victim still dies.)
  demonSleeps(d) {
    const s = this.s;

    if (d.exorcised === s.night) {
      this.audit(
        "exorcist",
        `${d.label} (${name(d.role)}) was chosen by the Exorcist and doesn't wake tonight.`,
        { actorId: d.id },
      );

      if (d.role === "pukka") {
        this.pukkaVictim(d);
      }

      return true;
    }

    if (d.role === "zombuul" && s.diedToday) {
      this.audit(
        "zombuul",
        `Someone died today, so ${d.label} (Zombuul) doesn't wake.`,
        { actorId: d.id },
      );

      return true;
    }

    return false;
  },

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

  // The Shabaloth might regurgitate a dead player it chose last night.
  regurgitate(d) {
    const s = this.s;
    const dead = s.shabaloth
      .map((id) => this.player(id))
      .filter((x) => x && !x.alive && !x.undead);

    s.shabaloth = [];

    const t = pick(dead, s.r);

    if (t && works(d) && s.r() < SHABALOTH_REGURGITATE_CHANCE) {
      this.revive(t, "shabaloth");
    }
  },

  // After the Demon: the Godfather's revenge, a true Gossip statement's
  // death, the Professor and the Tinker.
  bmrNight() {
    this.godfather();
    this.gossipDeaths();
    this.professors();
    this.tinkers();
  },

  // If an Outsider died today, the Godfather kills a player tonight.
  godfather() {
    const s = this.s;
    const g = s.players.find((x) => acts(x) && x.role === "godfather");

    if (!g || !s.outsiderDiedToday || s.winner) {
      return;
    }

    const t = this.strat.godfather(s, g);

    if (!t) {
      return;
    }

    this.woke(g);
    this.chose(g, t);

    const effective = works(g);

    this.audit(
      "godfather",
      `${g.label} (Godfather) chose ${t.label}; ${
        effective ? "attacked" : "the kill failed"
      }.`,
      { actorId: g.id, targetId: t.id, effective },
    );

    if (effective && this.kill(t, "godfather")) {
      this.check();
    }
  },

  // A working Gossip's true statement yesterday: the Storyteller kills a
  // player tonight: any living NPC other than the Demon, the Gossip
  // included (but never the human, even as the Gossip).
  gossipDeaths() {
    const s = this.s;
    const said = s.gossip.filter((g) => g.day === s.night - 1);

    s.gossip = s.gossip.filter((g) => g.day >= s.night);

    for (const g of said) {
      const p = this.player(g.byId);
      const real = g.effective && ability(p) === "gossip" && works(p);

      if (!real || !g.truth || s.winner) {
        continue;
      }

      const t = pick(
        untwinned(
          s,
          s.players.filter((x) => x.alive && !x.human && !isDemon(x)),
        ),
        s.r,
      );

      this.audit(
        "gossip",
        `${p.label}'s Gossip statement was true: ${
          t ? `${t.label} dies` : "nobody can die"
        }.`,
        { actorId: p.id, targetId: t?.id ?? null },
      );

      if (t && this.kill(t, "gossip")) {
        this.check();
      }
    }
  },

  // Once per game, from Night 2, the Professor chooses a dead player: a
  // Townsfolk comes back to life. (They wake each night until they use it.)
  professors() {
    const s = this.s;

    if (s.night < 2 || s.winner) {
      return;
    }

    for (const p of s.players.filter(
      (x) => x.alive && ability(x) === "professor" && !x.professorUsed,
    )) {
      const t = p.human
        ? this.humanPicks(p)?.[0]
        : this.strat.professor(s, p);

      this.woke(p);

      if (!t) {
        continue;
      }

      const revived =
        works(p) && !t.alive && !t.undead && team(t.role) === "townsfolk";

      p.professorUsed = true;

      this.audit(
        "professor",
        `${p.label} (${name(p.role)}) chose ${t.label}; ${
          revived ? "resurrected" : "no effect"
        }.`,
        { actorId: p.id, targetId: t.id, effective: revived },
      );

      if (revived) {
        this.revive(t, "professor");
      }

      this.remember(p, choiceInfo(s, "professor", "chose", [t]));
    }
  },

  // The Tinker might die at any time (at night, at TINKER_DEATH_CHANCE).
  tinkers() {
    const s = this.s;

    for (const p of s.players.filter(
      (x) =>
        x.alive && !x.human && x.role === "tinker" && works(x) && !isTwin(s, x),
    )) {
      if (s.winner || s.r() >= TINKER_DEATH_CHANCE) {
        continue;
      }

      this.audit("tinker", `${p.label} (Tinker) dies.`, { playerId: p.id });

      if (this.kill(p, "tinker")) {
        this.check();
      }
    }
  },

  // ── Information after the Demon ───────────────────────────

  // The Chambermaid wakes late, so she learns about everyone who woke.
  chambermaids() {
    const s = this.s;

    for (const p of s.players.filter(
      (x) => x.alive && ability(x) === "chambermaid",
    )) {
      const picks = this.humanPicks(p) ?? this.strat.chambermaid(s, p);

      if (picks?.length !== 2) {
        continue;
      }

      this.chose(p, picks);
      this.remember(p, chambermaidInfo(s, picks[0], picks[1], infoMode(s, p)));
    }
  },

  // ── Dawn and day ───────────────────────────────────────────

  // At dawn: anyone who came back to life is seen to, and NPC Gossips (and
  // Gossip bluffers) may make their statement.
  bmrDawn() {
    const s = this.s;

    for (const id of s.revived.splice(0)) {
      const p = this.player(id);

      s.publicLog.push(
        `Day ${s.day} — ${p.human ? "You are" : `${p.label} is`} alive again.`,
      );
    }

    for (const p of s.players.filter(
      (x) =>
        !x.human &&
        x.alive &&
        x.gossipDay !== s.day &&
        (ability(x) === "gossip" ||
          (x.alignment === "evil" && x.claim === "gossip")),
    )) {
      const said = this.strat.gossip(s, p);

      if (s.winner || !said) {
        continue;
      }

      this.gossipSays(p, said.target, said.question);
    }
  },

  // p makes a Gossip's public statement: "t is <evil / the Demon / ...>".
  gossipSays(p, t, q) {
    const s = this.s;
    const truth = artistTruth(t, q);
    const quote = `"${t.label} is ${ARTIST_QUESTIONS[q]}."`;
    const info = gossipInfo(s, t, q);

    p.gossipDay = s.day;
    s.gossip.push({
      byId: p.id,
      day: s.day,
      truth,
      effective: ability(p) === "gossip" && works(p),
    });
    p.memories.push(info);
    heard(s, p, [info]);

    if (p.human) {
      s.privateLog.push(`Day ${s.day}: You said ${quote}`);
      s.publicLog.push(`Day ${s.day} — You say: ${quote}`);
    } else {
      this.claimPublicly(p);
      s.publicLog.push(`Day ${s.day} — ${p.label} claims Gossip and says: ${quote}`);
    }

    this.audit(
      "gossip",
      `${p.label} (${name(p.role)}) said ${quote} (${truth ? "true" : "false"}).`,
      { actorId: p.id, targetId: t.id, truth },
    );
  },

  // The human Gossip's statement for the day.
  gossip(id, question) {
    const s = this.s;
    const h = this.human();
    const t = this.player(id);

    if (
      s.phase !== "day" ||
      s.winner ||
      ability(h) !== "gossip" ||
      !h.alive ||
      h.gossipDay === s.day ||
      !t ||
      t.human ||
      !ARTIST_QUESTIONS[question]
    ) {
      throw Error("Gossip unavailable.");
    }

    this.gossipSays(h, t, question);

    return `You said "${t.label} is ${ARTIST_QUESTIONS[question]}."`;
  },

  // ── Deaths and executions ──────────────────────────────────

  // A day death is public: the Zombuul and Godfather go by it tonight.
  dayDeath(p) {
    const s = this.s;

    if (s.phase === "day") {
      s.diedToday = true;
      s.outsiderDiedToday ||= team(p.role) === "outsider";
    }
  },

  // The Zombuul's first death: it lives, but registers as dead. Returns
  // whether that happened (the death still looks real to everyone).
  zombuulLives(p) {
    if (p.role !== "zombuul" || p.zombuulUsed || !works(p)) {
      return false;
    }

    p.zombuulUsed = true;
    p.undead = true;

    this.audit(
      "zombuul",
      `${p.label} (Zombuul) seems to die, but lives on, registering as dead.`,
      { playerId: p.id },
    );

    return true;
  },

  // A Zombuul that registers as dead, killed again (executed, usually): this
  // time it dies.
  zombuulDies(p, cause) {
    p.undead = false;
    p.death = cause;

    this.audit("zombuul", `${p.label} (Zombuul) died for good: ${cause}.`, {
      playerId: p.id,
      cause,
    });

    return true;
  },

  // Whether a working Pacifist saves an executed good player.
  pacifistSaves(p) {
    const s = this.s;
    const saves =
      p.alignment === "good" &&
      s.players.some((x) => x.alive && ability(x) === "pacifist" && works(x)) &&
      s.r() < PACIFIST_SAVE_CHANCE;

    if (saves) {
      this.audit(
        "pacifist",
        `${p.label} was executed but survived (Pacifist).`,
        { playerId: p.id },
      );
    }

    return saves;
  },

  // A Minion died by execution: with a working Minstrel alive, everyone else
  // is drunk until dusk tomorrow.
  minstrel(p) {
    const s = this.s;
    const m = s.players.find(
      (x) => x.alive && ability(x) === "minstrel" && works(x),
    );

    if (!m || team(p.role) !== "minion") {
      return;
    }

    s.minstrelUntil = s.night + 1;

    for (const x of s.players.filter((y) => y.role !== "minstrel")) {
      x.drunkTonight = true;
    }

    this.audit(
      "minstrel",
      `${p.label} (${name(p.role)}) died by execution: everyone but the Minstrel is drunk until dusk tomorrow.`,
      { playerId: p.id },
    );
  },

  // The Demon died by execution with a working Mastermind alive: play one
  // more day. Returns whether that happened.
  mastermindContinues() {
    const s = this.s;
    const m = s.players.find(
      (x) => x.alive && x.role === "mastermind" && works(x),
    );

    if (!m || s.mastermindDay) {
      return false;
    }

    s.mastermindDay = s.day + 1;

    this.audit(
      "mastermind",
      `The Demon was executed, but ${m.label} (Mastermind) lives: play for 1 more day.`,
      { playerId: m.id },
    );

    return true;
  },

  // The end of the Mastermind's extra day: whoever was executed loses with
  // their team; with nobody executed, good wins.
  mastermindEnd(p) {
    const s = this.s;

    if (s.mastermindDay !== s.day || s.winner) {
      return;
    }

    if (!p) {
      this.finish("good", "Nobody was executed on the Mastermind's extra day.");
    } else if (p.alignment === "good") {
      this.finish("evil", "A good player was executed on the Mastermind's extra day.");
    } else {
      this.finish("good", "An evil player was executed on the Mastermind's extra day.");
    }
  },
};
