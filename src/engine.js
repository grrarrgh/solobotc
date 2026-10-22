import { ARTIST_QUESTIONS, name, team } from "./data.js";
import {
  nightInfo,
  ability,
  works,
  ravenInfo,
  monkInfo,
  butlerInfo,
  gamblerInfo,
  artistInfo,
  isDemon,
  isDrunk,
  infoMode,
  philosopherInfo,
} from "./storyteller.js";
import { SimpleStrategy, isTwin } from "./strategy.js";
import { byId, pick } from "./util.js";
import { formatLog } from "./log.js";
import { sectsAndViolets } from "./sects.js";
import { badMoonRising } from "./bmr.js";

const KEY_MOMENT_TYPES = new Set([
  "poison",
  "monk",
  "demon",
  "death",
  "succession",
  "slayer",
  "virgin",
  "execution",
  "gambler",
  "fool",
  "moonchild",
  "assassin",
  "advocate",
  "snakecharmer",
  "witch",
  "pithag",
  "barber",
  "klutz",
  "sweetheart",
  "philosopher",
  "vigormortis",
  "sailor",
  "innkeeper",
  "exorcist",
  "courtier",
  "professor",
  "gossip",
  "minstrel",
  "pacifist",
  "tinker",
  "goon",
  "lunatic",
  "godfather",
  "mastermind",
  "zombuul",
  "pukka",
  "shabaloth",
  "po",
  "game_over",
]);

// Minions keep acting after death if the Vigormortis killed them.
const acts = (x) => x.alive || x.vigor;

// Really alive: living, or a Zombuul that only registers as dead.
const living = (x) => x.alive || x.undead;

export class Engine {
  constructor(s, strat = new SimpleStrategy()) {
    this.s = s;
    this.strat = strat;
  }

  player(id) {
    return byId(this.s, id);
  }

  alive() {
    return this.s.players.filter((x) => x.alive);
  }

  human() {
    return this.player(this.s.humanId);
  }

  audit(
    type,
    text,
    data = {},
    group = this.s.phase === "night"
      ? `Night ${this.s.night}`
      : `Day ${this.s.day}`,
  ) {
    this.s.audit.push({
      id: this.s.auditId++,
      group,
      type,
      text,
      data,
    });
  }

  // ── Conversations ──────────────────────────────────────────

  talkLimit() {
    return Math.floor(this.alive().length / 2);
  }

  talkStatus(id = null) {
    if (this.s.talkDay !== this.s.day) {
      this.s.talkDay = this.s.day;
      this.s.talked = [];
    }

    return {
      limit: this.talkLimit(),
      used: this.s.talked.length,
      remaining: Math.max(0, this.talkLimit() - this.s.talked.length),
      already: id ? this.s.talked.includes(id) : false,
    };
  }

  remember(p, info) {
    p.memories.push(info);

    this.audit("information", `${name(p.role)} received: ${info.text}`, {
      playerId: p.id,
      ...info,
    });

    // Info carries a `day` when it was learned during the day (the Artist).
    if (p.human && info.day) {
      this.s.privateLog.push(`Day ${info.day}: ${info.text}`);
      this.s.publicLog.push(`Day ${info.day} — You received:\n${info.text}`);
    } else if (p.human) {
      this.s.privateLog.push(`Night ${info.night}: ${info.text}`);
      this.s.publicLog.push(
        `Day ${info.night} — Night ${info.night}: You received:\n${info.text}`,
      );
    }
  }

  // ── Night ──────────────────────────────────────────────────

  start() {
    this.night();
    return this.s;
  }

  // Starts a night. If the human has a night choice, the Storyteller wakes
  // them and the night waits (s.pending) until choose() is called.
  night() {
    const s = this.s;

    if (s.winner) {
      return;
    }

    s.phase = "night";
    s.humanChoice = null;

    // Each player's character and claim at nightfall, so a change in the
    // night can be announced at dawn (see announceClaims()).
    s.players.forEach((x) => {
      x.protected = false;
      x.poisoned = false;
      x.drunkTonight = false;
      x.dusk = { role: x.role, claim: x.claim };
    });
    s.woke = [];
    s.sailorPending = [];

    this.lastingEffects();
    this.bmrLasting();
    this.barberNight();

    s.pending = this.wakeHuman();

    if (s.pending) {
      this.audit(
        "wake",
        `The Storyteller woke ${this.human().label} (${name(
          s.pending.role,
        )}): ${s.pending.prompt}`,
      );
      return;
    }

    this.resolveNight();
  }

  // What the human must choose tonight, or null if they don't wake.
  wakeHuman() {
    const s = this.s;
    const h = this.human();
    const role = ability(h);
    const candidates = s.players.filter((x) => x.alive && !x.human);
    const dead = s.players.filter((x) => !x.alive && !x.human);

    const wake = {
      monk:
        s.night > 1 && {
          count: 1,
          prompt: "Choose a player to protect from the Demon tonight.",
        },
      fortuneteller: {
        count: 2,
        prompt: "Choose 2 players: you learn if either is the Demon.",
      },
      butler: {
        count: 1,
        prompt:
          "Choose your master: tomorrow, your vote only counts if they vote too.",
      },
      dreamer: {
        count: 1,
        prompt:
          "Choose a player: you learn 1 good and 1 evil character, 1 of which is correct.",
      },
      seamstress: !h.seamUsed && {
        count: 2,
        optional: true,
        prompt:
          "Once per game: choose 2 players to learn if they are the same alignment, or skip tonight.",
      },
      sailor: {
        count: 1,
        prompt:
          "Choose a player: either you or they are drunk until dusk. You can't die.",
      },
      chambermaid: {
        count: 2,
        prompt:
          "Choose 2 players: you learn how many of them woke tonight due to their ability.",
      },
      exorcist: s.night > 1 && {
        count: 1,
        exclude: h.lastPicks?.exorcist ?? [],
        prompt:
          "Choose a player (not last night's): if they are the Demon, it doesn't wake tonight.",
      },
      innkeeper: s.night > 1 && {
        count: 2,
        prompt:
          "Choose 2 players: they can't die tonight, but 1 of them is drunk until dusk.",
      },
      courtier: !h.courtierUsed && {
        count: 0,
        characters: s.script.ids,
        optional: true,
        prompt:
          "Once per game: choose a character to make drunk for 3 nights and 3 days, or skip tonight.",
      },
      professor: s.night > 1 &&
        !h.professorUsed && {
          count: 1,
          dead: true,
          optional: true,
          prompt:
            "Once per game: choose a dead player to resurrect if they are a Townsfolk, or skip tonight.",
        },
    }[role];

    const pool = (wake?.dead ? dead : candidates).filter(
      (x) => !wake?.exclude?.includes(x.id),
    );

    if (!h.alive || !wake || pool.length < Math.max(1, wake.count)) {
      return null;
    }

    return { role, night: s.night, ...wake };
  }

  // The human's night choice: `ids` are the players they selected (or, for
  // the Courtier, `character` is the character they chose).
  choose(ids, character = null) {
    const s = this.s;
    const p = s.pending;

    const picked = [...new Set(ids)].map((id) => this.player(id));

    if (!p) {
      throw Error("Nothing to choose.");
    }

    if (p.characters && character) {
      if (!p.characters.includes(character)) {
        throw Error("Choose a character on the script.");
      }

      s.pending = null;
      s.humanChoice = { role: p.role, night: s.night, players: [], character };

      this.audit(
        "choice",
        `${this.human().label} chose the ${name(character)}.`,
        { role: character },
      );

      this.resolveNight();
      return;
    }

    if (p.optional && !picked.length) {
      s.pending = null;
      s.humanChoice = { role: p.role, night: s.night, players: [] };

      this.audit(
        "choice",
        `${this.human().label} chose not to use their ability tonight.`,
      );

      this.resolveNight();
      return;
    }

    if (p.characters) {
      throw Error("Choose a character.");
    }

    if (
      picked.length !== p.count ||
      picked.some((x) => !x || x.alive === Boolean(p.dead) || x.human)
    ) {
      throw Error(
        `Select ${p.count} ${p.dead ? "dead" : "living"} player${
          p.count > 1 ? "s" : ""
        }.`,
      );
    }

    if (picked.some((x) => p.exclude?.includes(x.id))) {
      throw Error("You chose that player last night.");
    }

    s.pending = null;
    s.humanChoice = { role: p.role, night: s.night, players: picked };

    this.audit(
      "choice",
      `${this.human().label} chose ${picked.map((x) => x.label).join(" and ")}.`,
      { targetIds: picked.map((x) => x.id) },
    );

    this.resolveNight();
  }

  // The human's choice for tonight, if they made one.
  humanPicks(p) {
    const c = this.s.humanChoice;

    return p.human && c?.night === this.s.night ? c.players : null;
  }

  // The rest of the night, in night order, then dawn.
  resolveNight() {
    const s = this.s;
    const poisoner = s.players.find((x) => acts(x) && x.role === "poisoner");

    if (poisoner) {
      const t = this.strat.poison(s, poisoner);

      if (t) {
        this.woke(poisoner);
        this.chose(poisoner, t);
      }

      if (t && works(poisoner)) {
        t.poisoned = true;
        s.poisoned = t.id;

        this.audit(
          "poison",
          `${poisoner.label} (${name(poisoner.role)}) selected ${t.label}; poisoned.`,
          {
            actorId: poisoner.id,
            targetId: t.id,
            effective: true,
          },
        );
      }
    }

    this.bmrDusk();
    this.sectsDusk();
    this.advocate();

    if (s.night === 1) {
      this.bmrFirstNight();
    }

    if (s.night > 1) {
      for (const m of s.players.filter(
        (x) => x.alive && ability(x) === "monk",
      )) {
        const t = this.humanPicks(m)?.[0] ?? this.strat.monk(s, m);

        if (t) {
          this.woke(m);
          this.chose(m, t);

          const effective = works(m);

          if (effective) {
            t.protected = true;
            t.protectedBy = m.id;
          }

          this.audit(
            "monk",
            `${m.label} (${name(m.role)}) chose ${t.label}; ${
              effective ? "protected" : "protection failed"
            }.`,
            {
              actorId: m.id,
              targetId: t.id,
              effective,
            },
          );

          this.remember(m, monkInfo(s, t, effective));
        }
      }

      this.gamblers();
      this.resolveMoonCurse();
      this.exorcists();

      if (!s.winner) {
        this.demon();
      }

      if (!s.winner) {
        this.assassin();
      }

      if (!s.winner) {
        this.bmrNight();
      }
    }

    if (s.winner) {
      return;
    }

    // Any Sailor choice still open is decided now.
    this.sailorResolve();

    for (const p of s.players) {
      const info = nightInfo(s, p, this.strategyFor(p));

      if (info) {
        this.woke(p);
        this.remember(p, info);
      }
    }

    this.sectsInfo();
    this.butlers();
    // (Last: she learns about everyone who woke tonight.)
    this.chambermaids();
    this.bluffs();
    this.snapshot();

    s.day = s.night;
    s.phase = "day";
    s.talkDay = s.day;
    s.talked = [];
    s.nominated = [];
    s.dayVoters = [];
    s.dayNominators = [];
    s.executedToday = false;
    s.lastExecution = null;
    s.diedToday = false;
    s.outsiderDiedToday = false;
    s.block = null;
    s.lastVote = null;

    this.applyMadness();
    this.announceClaims();

    s.publicLog.push(
      `Day ${s.day}: ${this.alive().length} alive; talk to ${this.talkLimit()} distinct players.`,
    );

    this.audit("day", `Day ${s.day} began.`);

    this.dawnDeaths();

    if (s.winner) {
      return;
    }

    this.shareInfo();
    this.npcShots();
    this.npcArtists();
    this.sectsDawn();
    this.bmrDawn();
  }

  // The strategy used for p's night info: for the human, the Fortune Teller's
  // two players are the ones they selected (even if drunk or poisoned, in
  // which case only the answer may be wrong).
  strategyFor(p) {
    const picks = this.humanPicks(p);

    if (!picks) {
      return this.strat;
    }

    const strat = Object.create(this.strat);
    strat.ft = () => picks;
    strat.dream = () => picks[0];

    return strat;
  }

  // Each Butler picks a master for tomorrow's vote.
  butlers() {
    const s = this.s;

    for (const b of s.players.filter(
      (x) => x.alive && ability(x) === "butler",
    )) {
      const t = this.humanPicks(b)?.[0] ?? this.strat.butler(s, b);

      if (!t) {
        continue;
      }

      this.woke(b);
      b.master = t.id;

      this.audit(
        "butler",
        `${b.label} (${name(b.role)}) chose ${t.label} as master.`,
        { actorId: b.id, targetId: t.id, effective: works(b) },
      );

      this.remember(b, butlerInfo(s, t));
    }
  }

  // ── Night actions: Everyone Can Play ──────────────────────

  // The Devil's Advocate picks someone (not last night's pick) who survives
  // execution tomorrow.
  advocate() {
    const s = this.s;
    const lastId = s.advocate?.targetId ?? null;
    const da = s.players.find((x) => acts(x) && x.role === "devilsadvocate");

    s.advocate = null;

    if (!da) {
      return;
    }

    const t = this.strat.advocate(s, da, lastId);

    if (!t) {
      return;
    }

    this.woke(da);
    this.chose(da, t);

    const effective = works(da);

    s.advocate = { targetId: t.id, day: s.night, effective };

    this.audit(
      "advocate",
      `${da.label} (${name(da.role)}) chose ${t.label}; ${
        effective ? "protected from execution" : "protection failed"
      }.`,
      { actorId: da.id, targetId: t.id, effective },
    );
  }

  // Whether the Devil's Advocate saves p from execution today.
  advocated(p) {
    const a = this.s.advocate;

    return Boolean(a?.effective && a.targetId === p.id && a.day === this.s.day);
  }

  // Each Gambler guesses a player's character; a wrong guess kills them.
  gamblers() {
    const s = this.s;

    for (const g of s.players.filter(
      (x) => x.alive && ability(x) === "gambler",
    )) {
      const guess = this.strat.gamble(s, g);

      if (!guess) {
        continue;
      }

      this.woke(g);
      this.chose(g, guess.target);

      const wrong = guess.target.role !== guess.role;
      const dies = wrong && works(g);

      this.audit(
        "gambler",
        `${g.label} (${name(g.role)}) guessed ${guess.target.label} is ${name(
          guess.role,
        )}; ${wrong ? "wrong" : "right"}${dies ? ", and died" : ""}.`,
        { actorId: g.id, targetId: guess.target.id, guess: guess.role, wrong },
      );

      this.remember(g, gamblerInfo(s, guess.target, guess.role));

      if (dies) {
        this.kill(g, "gambler");
        this.check();
      }
    }
  }

  // Last night's (or today's) Moonchild choice dies tonight if good.
  resolveMoonCurse() {
    const s = this.s;
    const t = this.player(s.moonCurse);

    s.moonCurse = null;

    if (!t?.alive || t.alignment !== "good" || t.protected) {
      return;
    }

    this.kill(t, "moonchild");
    this.check();
  }

  // Once per game, the Assassin kills a player; nothing can stop it.
  assassin() {
    const s = this.s;
    const a = s.players.find(
      (x) => acts(x) && x.role === "assassin" && !x.assassinUsed,
    );

    if (!a) {
      return;
    }

    // The Assassin wakes each night until they use their ability.
    this.woke(a);

    const t = this.strat.assassin(s, a);

    if (!t) {
      return;
    }

    this.chose(a, t);

    const effective = works(a);

    a.assassinUsed = true;

    this.audit(
      "assassin",
      `${a.label} (${name(a.role)}) chose ${t.label}; ${
        effective ? "killed" : "the kill failed"
      }.`,
      { actorId: a.id, targetId: t.id, effective },
    );

    if (effective && this.kill(t, "assassin")) {
      this.check();
    }
  }

  // A dying Moonchild publicly picks a living player to curse. An evil NPC
  // bluffing Moonchild makes the same show, with no effect.
  moonchild(p) {
    const s = this.s;
    const t = this.strat.moonchild(s, p);

    if (!t) {
      return;
    }

    const real = p.role === "moonchild" && !p.poisoned;

    this.claimPublicly(p);

    if (real) {
      s.moonCurse = t.id;
    }

    s.publicLog.push(`${p.label} claims Moonchild and chooses ${t.label}.`);

    this.audit(
      "moonchild",
      `${p.label} (${name(p.role)}) chose ${t.label}; ${
        real ? "cursed" : "no effect"
      }.`,
      { actorId: p.id, targetId: t.id, effective: real },
    );
  }

  // At dawn, NPC Artists (and evil NPCs bluffing Artist) ask their question.
  npcArtists() {
    const s = this.s;

    for (const p of s.players) {
      const claimsArtist =
        ability(p) === "artist" ||
        (p.alignment === "evil" && p.claim === "artist");

      if (s.winner || p.human || !p.alive || p.artistUsed || !claimsArtist) {
        continue;
      }

      const ask = this.strat.artist(s, p);

      if (!ask) {
        continue;
      }

      p.artistUsed = true;

      if (p.alignment === "good") {
        this.remember(
          p,
          artistInfo(s, ask.targets, ask.question, infoMode(s, p)),
        );
      } else {
        const spy = p.role === "spy" && works(p);

        this.rememberBluff(
          p,
          artistInfo(s, ask.targets, ask.question, spy ? "truth" : "lie"),
        );
      }
    }
  }

  // Evil NPCs gather night info to report for the role they are bluffing.
  bluffs() {
    const s = this.s;

    // (The Lunatic, who thinks they're the Demon, bluffs too.)
    for (const p of s.players) {
      const bluffer = p.alignment === "evil" || p.role === "lunatic";

      if (p.human || !p.alive || !bluffer) {
        continue;
      }

      // A Philosopher bluffer "gains" an in-play Townsfolk on their first
      // night (implying its real holder is drunk), then bluffs as it.
      if (p.claim === "philosopher" && !p.bluffGained) {
        const role = this.strat.philosopherBluff(s, p);

        if (role) {
          p.bluffGained = role;
          this.rememberBluff(p, philosopherInfo(s, role));
        }
      }

      const info = this.strat.bluff(s, p);

      if (info) {
        this.rememberBluff(p, info);
      }
    }
  }

  // Bluffed info is stored for the NPC to repeat, but is not real information.
  rememberBluff(p, info) {
    p.memories.push(info);

    this.audit(
      "bluff",
      `${p.label} (${name(p.role)}) bluffed: ${info.text}`,
      { playerId: p.id, ...info },
    );
  }

  demon() {
    const s = this.s;
    const d = s.players.find((x) => living(x) && isDemon(x));

    // (On the Mastermind's extra day, the game goes on without a Demon.)
    if (!d) {
      if (!s.mastermindDay) {
        this.finish("good", "No Demon remains.");
      }

      return;
    }

    // The Pit-Hag made a Demon tonight: a random death instead.
    if (this.arbitraryDeath()) {
      return;
    }

    this.lunatics();

    if (this.demonSleeps(d)) {
      return;
    }

    this.woke(d);

    if (d.role === "pukka") {
      this.pukka(d);
      return;
    }

    if (this.sinkKill(d)) {
      return;
    }

    if (d.role === "shabaloth") {
      this.regurgitate(d);
    }

    const targets = this.strat.demonTargets(s, d);

    // The Po may choose no-one, to choose 3 players tomorrow night.
    if (d.role === "po") {
      d.poCharged = !targets.length;

      if (!targets.length) {
        this.audit(
          "po",
          `${d.label} (Po) chose no-one: tomorrow night they choose 3 players.`,
          { actorId: d.id },
        );
      }
    }

    for (const t of targets) {
      if (!s.winner) {
        this.attack(d, t);
      }
    }

    if (d.role === "shabaloth") {
      s.shabaloth = targets.filter(Boolean).map((x) => x.id);
    }
  }

  // The Demon attacks t: `chosen` tonight (false for the Pukka's victim from
  // last night, who dies now), described by `verb` in the log.
  attack(d, t, { chosen = true, verb = "chose" } = {}) {
    const s = this.s;

    if (!t || t.human || !t.alive) {
      this.audit(
        "demon",
        `${d.label} (${name(d.role)}) had no legal target.`,
        {
          actorId: d.id,
          targetId: null,
          outcome: "no_target",
        },
      );

      return;
    }

    const before = this.alive().length;
    const original = t;

    this.sailorResolve({ demon: d, victim: t });

    if (chosen) {
      this.chose(d, t);
    }

    let outcome = "killed";
    let detail = "";
    let guard = null;
    // Blocked by the Soldier, Sailor, Tea Lady or Innkeeper: the Demon avoids
    // that player from now on, and goes after whoever protected them (see
    // strategy demon()).
    let foiled = false;
    let protector = null;

    if (!works(d)) {
      outcome = "blocked";
      detail = "the attack failed (the Demon is drunk or poisoned)";
    } else if (t.role === "soldier" && works(t)) {
      outcome = "blocked";
      detail = "blocked by the Soldier ability";
      foiled = true;
    } else if (t.protected) {
      outcome = "blocked";
      detail = "blocked by Monk protection";
      protector = t.protectedBy;
    } else if ((guard = this.guard(t, "demon"))) {
      outcome = "blocked";
      detail = `blocked: ${guard.text}`;
      foiled = true;
      protector = guard.by;
    } else if (t.role === "mayor" && works(t)) {
      // (Never onto the human, the Demon or either twin.)
      const alt = pick(
        s.players.filter(
          (x) =>
            x.alive &&
            !x.human &&
            x.id !== t.id &&
            x.id !== d.id &&
            !isTwin(s, x),
        ),
        s.r,
      );

      if (alt) {
        t = alt;
        outcome = "redirected";
        detail = `redirected to ${t.label}`;

        if ((guard = this.cantDie(t, "demon"))) {
          outcome = "blocked";
          detail = `redirected to ${t.label}, but ${guard}`;
        }
      }
    }

    if (foiled) {
      d.foiled = [...new Set([...(d.foiled ?? []), original.id])];
    }

    if (protector) {
      d.protectors = [...new Set([...(d.protectors ?? []), protector])];
    }

    if (outcome !== "blocked" && this.foolSaves(t, "demon")) {
      outcome = "fool";
      detail = `${t.label} survived as the Fool`;
    }

    const result = outcome === "killed" ? `${t.label} was killed` : detail;

    this.audit(
      "demon",
      `${d.label} (${name(d.role)}) ${verb} ${original.label}; attack ${result}.`,
      {
        actorId: d.id,
        targetId: original.id,
        actualTargetId: t.id,
        outcome,
      },
    );

    if (outcome !== "blocked") {
      if (this.fangGuJump(d, t)) {
        this.check();
        return;
      }

      if (this.kill(t, "demon")) {
        this.grandmother(t);
        this.vigormortisKill(d, t);
      }

      if (t === d) {
        this.successor(d, before, true);
      } else {
        this.check();
      }
    }
  }

  // A working Fool survives their first death, unless it is the Assassin's.
  foolSaves(p, cause) {
    return (
      p.role === "fool" && works(p) && !p.foolUsed && cause !== "assassin"
    );
  }

  // If the Demon kills a working Grandmother's grandchild, she dies too.
  grandmother(t) {
    for (const g of this.s.players) {
      if (g.role === "grandmother" && g.grandchild === t.id && works(g)) {
        this.kill(g, "grandmother");
      }
    }
  }

  // Returns whether p actually died.
  kill(p, cause) {
    if (!p?.alive) {
      // A Zombuul that registers as dead can still die for good.
      return Boolean(p?.undead) && this.zombuulDies(p, cause);
    }

    this.sailorResolve({ victim: p });

    const guard = this.cantDie(p, cause);

    if (guard) {
      this.audit("death", `${p.label} would have died (${cause}): ${guard}.`, {
        playerId: p.id,
        cause,
      });

      return false;
    }

    if (this.foolSaves(p, cause)) {
      p.foolUsed = true;

      this.audit(
        "fool",
        `${p.label} (Fool) would have died (${cause}) but survived.`,
        { playerId: p.id, cause },
      );

      return false;
    }

    // (The Zombuul's first death only looks real.)
    this.zombuulLives(p);
    this.dayDeath(p);

    p.alive = false;
    p.death = cause;

    this.audit("death", `${p.label} died: ${cause}.`, {
      playerId: p.id,
      cause,
    });

    // Night deaths are announced in the morning (see dawnDeaths()). That
    // they died in the night is public: good NPCs weigh it.
    if (this.s.phase === "night") {
      p.diedAtNight = this.s.night;
      this.s.nightDeaths.push(p.id);
    } else {
      this.s.publicLog.push(`${p.label} died.`);
    }

    // "If you die at night": any death at night wakes the Ravenkeeper (the
    // Demon's kill, the Assassin, a Moonchild curse, a random death...). A
    // Demon kill always counts as a night death.
    const atNight = this.s.phase === "night" || cause === "demon";

    if (atNight && ability(p) === "ravenkeeper") {
      const t = this.strat.raven(this.s, p);

      if (t) {
        this.remember(p, ravenInfo(this.s, p, t));
      }
    } else if (
      atNight &&
      p.alignment === "evil" &&
      p.claim === "ravenkeeper"
    ) {
      // An evil Ravenkeeper bluffer "learns" a character too; only the Spy's is true.
      const t = this.strat.raven(this.s, p);

      if (t) {
        const lie = p.role !== "spy";

        this.rememberBluff(p, ravenInfo(this.s, p, t, lie, lie));
      }
    }

    this.sectsDeath(p, cause);

    // "When you learn that you died" (Moonchild, Klutz): at night, that's in
    // the morning.
    if (this.s.phase === "night") {
      this.s.dawnLearn.push(p.id);
    } else {
      this.learnsDeath(p);
    }

    return true;
  }

  // Abilities that trigger "when you learn that you died".
  learnsDeath(p) {
    // A dead Mutant (or Mutant bluffer) is no longer at risk of execution,
    // so they reveal it.
    if (!p.human && this.strat.revealsWhenDead?.(p) && p.claim !== "mutant") {
      p.claim = "mutant";
      this.claimPublicly(p);
      this.s.publicLog.push(
        `Day ${this.s.day} — ${p.label} reveals they were the Mutant.`,
      );
      this.audit("mutant", `${p.label} revealed they were the Mutant.`, {
        playerId: p.id,
      });
    }

    if (
      !p.human &&
      (p.role === "moonchild" ||
        (p.alignment === "evil" && p.claim === "moonchild"))
    ) {
      this.moonchild(p);
    }

    this.klutzDeath(p);
  }

  // At dawn: who died in the night (and the human learns if it was them),
  // then "when you learn that you died" abilities.
  dawnDeaths() {
    const s = this.s;
    const dead = s.nightDeaths.map((id) => this.player(id));

    for (const p of dead) {
      s.publicLog.push(`Day ${s.day} — ${p.label} died in the night.`);

      if (p.human) {
        s.privateLog.push(`Day ${s.day}: You died in the night.`);
      }
    }

    if (!dead.length && s.night > 1) {
      s.publicLog.push(`Day ${s.day} — Nobody died in the night.`);
    }

    s.nightDeaths = [];

    for (const id of s.dawnLearn.splice(0)) {
      this.learnsDeath(this.player(id));
    }
  }

  // ── Day ────────────────────────────────────────────────────

  // p has now said their current claim in public (to the human, or to
  // everyone); later changes to it get announced (see announceClaims()).
  claimPublicly(p) {
    p.claimKnown = true;
    p.publicClaim = p.claim;
  }

  ask(id) {
    const s = this.s;
    const p = this.player(id);
    const st = this.talkStatus(id);

    if (!p || p.human) {
      throw Error("Select an NPC.");
    }

    if (s.phase !== "day") {
      throw Error("Talk during the day.");
    }

    if (st.already) {
      throw Error("Already asked today.");
    }

    if (!st.remaining) {
      throw Error("No conversation slots remain.");
    }

    s.talked.push(id);
    p.claimKnown = true;

    // A dead Mutant (or Mutant bluffer) now claims the Mutant.
    if (this.strat.revealsWhenDead?.(p)) {
      p.claim = "mutant";
    }

    this.claimPublicly(p);

    const response = this.strat.ask(s, p);

    p.talks.push({
      day: s.day,
      response,
    });

    s.publicLog.push(
      `Day ${s.day} — ${p.label}\n${response}`,
    );

    this.audit(
      "conversation",
      `${p.label}\n${response}`,
      { target: id },
    );

    return response;
  }

  // Everyone's vote on nominee n, in seat order. Good players decide first,
  // then evil players, who see how the vote is going (see strategy vote()).
  votes(n, nominator = null) {
    const s = this.s;
    const intents = new Map();
    const tally = { yes: 0, needed: this.votesNeeded(), nominator };
    const order = [
      ...s.players.filter((v) => v.alignment !== "evil"),
      ...s.players.filter((v) => v.alignment === "evil"),
    ];

    for (const v of order) {
      const eligible = v.alive || v.ghost;
      const attempted = Boolean(
        eligible && (v.human || this.strat.vote(s, v, n, { ...tally })),
      );

      intents.set(v.id, attempted);
      tally.yes += attempted ? 1 : 0;
    }

    const records = s.players.map((v) => {
      const attempted = intents.get(v.id);

      if (attempted && !s.dayVoters.includes(v.id)) {
        s.dayVoters.push(v.id);
      }

      return {
        playerId: v.id,
        attempted,
        counted: false,
      };
    });

    for (const r of records) {
      const v = this.player(r.playerId);

      if (!r.attempted) {
        continue;
      }

      // A working Butler's vote only counts if their master voted.
      if (
        v.alive &&
        ability(v) === "butler" &&
        works(v) &&
        !intents.get(v.master)
      ) {
        continue;
      }

      r.counted = true;

      // Dead players spend their one ghost vote.
      if (!v.alive) {
        v.ghost = false;
      }
    }

    return records;
  }

  // Each player can only be nominated once per day.
  nominatedToday(id) {
    return this.s.nominated.includes(id);
  }

  // The NPC that can be nominated right now, or an error. (Dead players can
  // be nominated too: executing one does nothing, unless it's a Zombuul
  // that only registers as dead.)
  nominee(id) {
    const s = this.s;
    const n = this.player(id);

    if (s.phase !== "day" || s.winner || !n || n.human) {
      throw Error("Choose an NPC.");
    }

    if (this.nominatedToday(id)) {
      throw Error("Already nominated today.");
    }

    return n;
  }

  // The human nominates a living NPC (once per day).
  nominate(id) {
    const s = this.s;
    const h = this.human();

    if (!h.alive) {
      throw Error("Dead players cannot nominate. Request a nomination instead.");
    }

    const n = this.nominee(id);

    if (s.dayNominators.includes(h.id)) {
      throw Error("You have already nominated today.");
    }

    return this.runNomination(h, n);
  }

  // The human asks the town for a nomination; a living NPC who hasn't
  // nominated today makes it. (A dead human can still do this.)
  requestNomination(id) {
    const s = this.s;
    const n = this.nominee(id);
    const nominator = this.strat.nominator(s, n);

    if (!nominator) {
      throw Error("Nobody is able to nominate.");
    }

    s.publicLog.push(
      `Day ${s.day} — You asked for a nomination: ${nominator.label} nominates ${n.label}.`,
    );

    this.audit(
      "request",
      `You asked for a nomination of ${n.label}; ${nominator.label} (${name(
        nominator.role,
      )}) nominated.`,
      { actorId: nominator.id, targetId: n.id },
    );

    return this.runNomination(nominator, n);
  }

  // A nomination and its vote. Nobody is executed yet: if at least half the
  // living players vote, and that's more votes than any nomination so far
  // today, the nominee is marked for execution (s.block) instead. A tie with
  // the highest count so far (official rules) leaves nobody marked, and a
  // later nomination must beat that count. Ending the day executes whoever
  // is marked.
  runNomination(nominator, n) {
    const s = this.s;
    const id = n.id;
    const base = {
      nominatorId: nominator.id,
      nomineeId: id,
      count: 0,
      threshold: 0,
      needed: 0,
      marked: false,
      records: [],
    };

    s.nominated.push(id);
    s.dayNominators.push(nominator.id);

    // A nominator cursed by the Witch dies; the nomination still goes ahead
    // unless that ended the game.
    this.witchCurse(nominator);

    if (s.winner) {
      return base;
    }

    // A working Virgin's first nomination executes a Townsfolk nominator.
    if (n.role === "virgin" && !n.virginUsed) {
      n.virginUsed = true;

      if (works(n) && team(nominator.role) === "townsfolk") {
        return this.virgin(n, nominator, base);
      }
    }

    const needed = this.votesNeeded();
    const records = this.votes(n, nominator);
    const count = records.filter((x) => x.counted).length;

    // Who nominated and voted for whom is public: good NPCs weigh it.
    (s.voteHistory ??= []).push({
      day: s.day,
      nominatorId: nominator.id,
      nomineeId: id,
      voterIds: records.filter((x) => x.attempted).map((x) => x.playerId),
    });
    const threshold = Math.ceil(this.alive().length / 2);
    const previous = s.block;
    const enough = count >= threshold;
    const marked = enough && count > (previous?.count ?? 0);
    const tied = enough && count === previous?.count;
    const leader = previous?.nomineeId && this.player(previous.nomineeId);

    if (marked) {
      s.block = { nomineeId: id, count };
    } else if (tied) {
      s.block = { nomineeId: null, count };
    }

    const outcome = marked
      ? `${n.label} is marked for execution`
      : !enough
        ? "not enough votes"
        : tied
          ? `a tie${leader ? ` with ${leader.label}` : ""}, so nobody is marked`
          : `fewer than the ${previous.count} votes to beat`;

    const result = { ...base, count, threshold, needed, marked, records };

    s.lastVote = result;

    this.audit(
      "vote_result",
      `${nominator.label} nominated ${n.label}: ${count}/${threshold}; ${outcome}.`,
      result,
    );

    s.publicLog.push(
      `Day ${s.day} — ${nominator.label} nominated ${n.label}: ${count} vote${
        count === 1 ? "" : "s"
      } (${threshold} needed); ${outcome}.`,
    );

    return result;
  }

  // The player currently marked for execution, if any.
  // The votes a nomination needs now to mark the nominee for execution: half
  // the living players (rounded up), and more than any earlier nominee got
  // today. (Exactly that many is a tie, so nobody is marked.)
  votesNeeded() {
    const s = this.s;

    return Math.max(
      Math.ceil(this.alive().length / 2),
      (s.block?.count ?? 0) + 1,
    );
  }

  marked() {
    const id = this.s.block?.nomineeId;

    return id ? this.player(id) : null;
  }

  // Executes p at the end of the day. (Executing a dead player still counts
  // as an execution, for the Vortox, but they don't die again, so the
  // Undertaker learns nothing.)
  execute(p) {
    const s = this.s;
    const before = this.alive().length;

    if (living(p)) {
      s.lastExecution = p.id;
    }

    s.executedToday = true;

    s.publicLog.push(`Day ${s.day} — ${p.label} is executed.`);
    this.audit("execution", `${p.label} was executed.`, { playerId: p.id });

    // The Devil's Advocate's pick (or a Fool) is executed but doesn't die.
    const advocated = this.advocated(p);

    if (advocated) {
      this.audit(
        "advocate",
        `${p.label} was executed but survived (Devil's Advocate).`,
        { playerId: p.id },
      );
    }

    // ...and so can a good player while the Pacifist lives.
    const spared = !advocated && p.alive && this.pacifistSaves(p);
    const died = !advocated && !spared && this.kill(p, "execution");

    if (died) {
      this.minstrel(p);
    }

    // (goodTwinExecuted() ends the game if the good twin was executed.)
    if (died && p.role === "saint") {
      this.finish("evil", "Saint executed.");
    } else if (died && isDemon(p)) {
      this.successor(p, before, false, true);
    } else if (died && !this.goodTwinExecuted(p)) {
      this.check();
    }
  }

  // The Virgin's ability: the Townsfolk who nominated them (`by`, the human
  // or an NPC) is executed immediately, and the day ends.
  virgin(n, by, base) {
    const s = this.s;

    s.lastExecution = by.id;
    s.lastVote = null;
    s.block = null;
    s.executedToday = true;

    this.audit(
      "virgin",
      `${by.label} nominated ${n.label} (${name(n.role)}) and was executed.`,
      { actorId: by.id, targetId: n.id },
    );

    s.publicLog.push(
      by.human
        ? `Day ${s.day} — You nominated ${n.label} and were executed immediately.`
        : `Day ${s.day} — ${by.label} nominated ${n.label} and was executed immediately.`,
    );

    if (!this.advocated(by)) {
      this.kill(by, "execution");
      this.check();
    }

    if (!s.winner) {
      s.night++;
      this.night();
    }

    return { ...base, virgin: true };
  }

  // Ends the day: whoever is marked for execution is executed; with nobody
  // marked, nobody is (and the Vortox or a Mayor may decide the game).
  endDay() {
    const s = this.s;

    if (s.phase !== "day" || s.winner) {
      throw Error("Cannot end day.");
    }

    this.audit("end_day", `You ended Day ${s.day}.`);

    const p = this.marked();

    s.block = null;

    if (p) {
      this.execute(p);
    } else if (this.vortoxDay()) {
      return;
    } else if (
      this.alive().length === 3 &&
      this.human().role === "mayor" &&
      works(this.human())
    ) {
      this.finish("good", "Mayor final-three victory.");
    }

    this.mastermindEnd(p);

    if (!s.winner) {
      s.night++;
      this.night();
    }
  }

  slay(id) {
    const p = this.human();
    const t = this.player(id);

    if (
      this.s.slayerUsed ||
      ability(p) !== "slayer" ||
      !p.alive ||
      !t?.alive
    ) {
      throw Error("Slayer unavailable.");
    }

    this.s.slayerUsed = true;

    const killed = this.shoot(p, t);

    this.audit(
      "slayer",
      `${p.label} (${name(p.role)}) shot ${t.label}; ${
        killed ? "killed" : "no effect"
      }.`,
      { actorId: p.id, targetId: t.id, killed },
    );

    return killed;
  }

  // Once per game, the human Artist asks the Storyteller a yes/no question
  // about a player.
  artist(id, question) {
    const s = this.s;
    const h = this.human();
    const t = this.player(id);

    if (
      s.phase !== "day" ||
      s.winner ||
      ability(h) !== "artist" ||
      h.artistUsed ||
      !h.alive ||
      !t ||
      !ARTIST_QUESTIONS[question]
    ) {
      throw Error("Artist unavailable.");
    }

    h.artistUsed = true;

    const info = artistInfo(s, t, question, infoMode(s, h));

    this.remember(h, info);

    return info.text;
  }

  // Resolves a Slayer shot; only a working Slayer can kill, and only the
  // Imp (or the Recluse, who registers as one).
  shoot(p, t) {
    if (
      ability(p) === "slayer" &&
      works(p) &&
      (isDemon(t) || t.role === "recluse")
    ) {
      const before = this.alive().length;

      this.kill(t, "slayer");

      if (isDemon(t)) {
        this.successor(t, before, false);
      } else {
        this.check();
      }

      return true;
    }

    return false;
  }

  // At dawn, NPC Slayers (and evil NPCs bluffing Slayer) may shoot once.
  npcShots() {
    const s = this.s;

    for (const p of s.players) {
      if (s.winner) {
        return;
      }

      const claimsSlayer =
        ability(p) === "slayer" ||
        (p.alignment === "evil" && p.claim === "slayer");

      if (p.human || !p.alive || p.shotUsed || !claimsSlayer) {
        continue;
      }

      const t = this.strat.slay(s, p);

      if (!t) {
        continue;
      }

      p.shotUsed = true;
      this.claimPublicly(p);

      s.publicLog.push(
        `Day ${s.day} — ${p.label} claims Slayer and shoots ${t.label}.`,
      );

      const killed = this.shoot(p, t);

      if (!killed) {
        s.publicLog.push(`Day ${s.day} — Nothing happens.`);
      }

      this.audit(
        "slayer",
        `${p.label} (${name(p.role)}) shot ${t.label}; ${
          killed ? "killed" : "no effect"
        }.`,
        { actorId: p.id, targetId: t.id, killed },
      );
    }
  }

  // ── Demon succession & game end ───────────────────────────

  // The Scarlet Woman takes over if 5+ players were alive; on an Imp
  // self-kill, any living minion can take over instead. The new Demon is the
  // same character as the old one. With no successor, good wins, unless the
  // Demon was `executed` while the Mastermind lives.
  successor(dead, before, self, executed = false) {
    // A Zombuul that only registers as dead isn't dead.
    if (dead.undead) {
      this.check();
      return;
    }

    let next =
      before >= 5
        ? this.s.players.find((x) => x.alive && x.role === "scarletwoman")
        : null;

    if (!next && self && dead.role === "imp") {
      next = this.s.players.find(
        (x) => x.alive && team(x.role) === "minion",
      );
    }

    if (next) {
      next.role = dead.role;
      next.alignment = "evil";

      this.audit("succession", `${next.label} became ${name(dead.role)}.`, {
        playerId: next.id,
        previousDemonId: dead.id,
      });
    } else if (!(executed && this.mastermindContinues())) {
      this.finish("good", "Demon died.");
    }
  }

  // A Zombuul that registers as dead still counts as alive here. On the
  // Mastermind's extra day, only the day's execution decides the game.
  check() {
    const alive = this.s.players.filter(living);

    if (this.s.mastermindDay) {
      return;
    }

    if (!alive.some(isDemon)) {
      this.finish("good", "No Demon remains.");
    } else if (alive.length <= 2) {
      this.finish("evil", "Two alive remain.");
    }
  }

  finish(winner, reason) {
    if (this.s.winner) {
      return;
    }

    if (winner === "good" && this.twinsBlockGood()) {
      this.audit(
        "eviltwin",
        `Good would win (${reason}), but can't while both twins live.`,
      );
      return;
    }

    this.s.winner = winner;
    this.s.reason = reason;
    this.s.phase = "over";

    this.audit(
      "game_over",
      `${winner.toUpperCase()}: ${reason}`,
      {},
      "Game Over",
    );

    this.snapshot("Game Over");
  }

  // Records every player's full state (and what they learned tonight) for
  // the debug log.
  snapshot(group) {
    const s = this.s;
    const players = s.players.map((p) => ({
      seat: p.seat,
      label: p.label,
      role: p.role,
      shown: p.shown,
      claim: p.claim,
      alignment: p.alignment,
      alive: p.alive,
      drunk: isDrunk(p),
      poisoned: p.poisoned,
      protected: p.protected,
      info: p.memories
        .filter((m) => !m.day && m.night === s.night)
        .map((m) => m.text),
    }));

    this.audit(
      "state",
      "Player states",
      { players, scapegoat: s.scapegoat ?? null },
      group,
    );
  }

  // The whole game as human-readable text (downloaded as log.txt).
  debugLog() {
    return formatLog(this.s);
  }

  reveal() {
    if (!this.s.winner) {
      return null;
    }

    // Everything that happened, in order (the per-night player tables stay
    // in log.txt).
    const events = this.s.audit.filter((e) => e.type !== "state");

    return {
      winner: this.s.winner,
      reason: this.s.reason,
      script: this.s.script.meta.name,
      seats: this.s.seats,
      seed: this.s.seed,
      twins: this.s.twins,
      bluffs: this.s.demonBluffs ?? [],
      players: this.s.players,
      events,
      keyMoments: events.filter((e) => KEY_MOMENT_TYPES.has(e.type)),
    };
  }
}

// Sects & Violets and Bad Moon Rising characters (see sects.js and bmr.js).
Object.assign(Engine.prototype, sectsAndViolets, badMoonRising);
