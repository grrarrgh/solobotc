import {
  name,
  team,
  alignment,
  FORBIDDEN_HUMAN,
  DEMON_KILL_PRIORITY,
  COME_CLEAN_ALIVE,
  COME_CLEAN_URGENT_CHANCE,
  COME_CLEAN_NOMINATED_CHANCE,
  COME_CLEAN_NOMINATION_CHANCE,
  FAKE_CLEAN_CHANCE,
  ROUND_ROBIN_ALIVE,
  TRUST_EVIDENCE,
  EVIDENCE_TO_SUSPECT,
  HIDDEN_OUTSIDERS,
  NEAR_FINAL_HUMAN_VOTE_CHANCE,
  VORTOX_VOTE_CHANCE,
  LEVIATHAN_STRONG_EVIDENCE,
  LEVIATHAN_LATE_VOTE_BONUS,
  LEVIATHAN_LAST_DAY_VOTE_CHANCE,
} from "./data.js";
import {
  nightInfo,
  ability,
  works,
  isDemon,
  isDrunk,
  hasCannibal,
  misinformedBy,
  noticeNoise,
  who,
  steer,
  steerWhy,
  killHelps,
  lean,
  leanText,
  bluffing,
  jinxBarred,
  wishBarred,
  nearFinal,
  finalCount,
} from "./storyteller.js";
import {
  SimpleStrategy,
  isTwin,
  twinSafe,
  heard,
  speak,
  abilityUsed,
  tick,
  stanceOn,
  sideOf,
  claimHeard,
  claimTo,
  lied,
  spoken,
  vortoxRisk,
  leviathanRisk,
} from "./strategy.js";
import { byId, bySeat, pick, shuffle } from "./util.js";
import { formatLog, logNames, claimChain } from "./log.js";
import { abilities, living } from "./abilities.js";
import { characters } from "./characters/index.js";
import { STORYTELLER } from "./characters/townsfolk/atheist.js";
import { golemHinge } from "./characters/outsider/golem.js";
import { engineerOptions } from "./characters/townsfolk/engineer.js";
import {
  backStory,
  keepStory,
  hiddenStory,
  bluffState,
  madeUpMemories,
} from "./bluff.js";

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
  "atheist",
  "heretic",
  "politician",
  "advocate",
  "snakecharmer",
  "witch",
  "widow",
  "damsel",
  "huntsman",
  "puzzlemaster",
  "boomdandy",
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
  "ogre",
  "pixie",
  "cannibal",
  "marionette",
  "mezepheles",
  "legion",
  "farmer",
  "engineer",
  "golem",
  "alhadikhia",
  "spiritofivory",
  "game_over",
]);

// Whether you can pick player x for night choice `c` (see wakeHuman()): by
// its ability's wording, living players ("choose an alive player"), dead
// ones (`dead`: "choose a dead player") or anyone (`any`: "choose a
// player"). Never yourself, nor a player the choice excludes.
// (`self`: you can pick yourself, where the ability doesn't say "not
// yourself": see wakeHuman().)
export const canPick = (c, x) =>
  (!x.human || Boolean(c.self)) && (c.any || x.alive !== Boolean(c.dead)) && !c.exclude?.includes(x.id);

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
      // (How log.txt names players, as things stand now.)
      names: logNames(this.s),
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

  // Information that isn't working says why in the log (never to the human):
  // "(misinformation: poisoned by Player 4, the Poisoner)". Some add a note
  // for the log too, such as the Mathematician's true count.
  remember(p, info) {
    if (info.functioning === false) {
      info.misinfo = misinformedBy(this.s, p) || null;
    }

    // (With the Atheist on the script, false information is marked, so
    // whoever hears it may notice: see storyteller.js doubted(), and
    // falseNoise() for random information.)
    noticeNoise(this.s, p, info);

    if (this.s.falseNext?.playerId === p.id) {
      const s = this.s;

      s.doubtful = (s.doubtful ?? 0) + 1;
      info.doubtful = { id: s.doubtful, broken: s.falseNext.broken };
      s.falseNext = null;
    }

    p.memories.push(info);

    this.audit(
      "information",
      `${p.label} received: ${info.text}${
        info.misinfo ? ` (misinformation: ${info.misinfo})` : ""
      }${info.logNote ? ` [${info.logNote}]` : ""}`,
      {
        playerId: p.id,
        ...info,
      },
    );

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
    // Where tonight's public log starts, for the dawn card (see phaseCard()).
    s.nightLog = s.publicLog.length;

    // Each player's character and claim at nightfall, so a change in the
    // night can be announced at dawn (see announceClaims()).
    s.players.forEach((x) => {
      x.protected = false;
      x.poisoned = false;
      x.drunkTonight = false;
      x.drunkBy = null;
      x.poisonedBy = null;
      x.dusk = { role: x.role, claim: x.claim };
    });
    s.woke = [];
    s.sailorPending = [];

    // Effects that outlast a single night, reapplied now everyone's poison
    // and drunkenness has been cleared (and yesterday's madness ends).
    this.cerenovusLasting();
    this.snakeCharmerLasting();
    this.vigormortisLasting();
    this.noDashiiLasting();
    this.lleechLasting();
    this.courtierLasting();
    this.minstrelLasting();
    this.pukkaLasting();
    this.cannibalLasting();
    this.widowLasting();
    this.damselLasting();
    this.puzzleDrunk();
    this.barberNight();

    // (An Atheist game: the rule-break ramp holds while the town comes to
    // believe the Atheist. See atheist.js.)
    if (s.atheist) {
      this.atheistSafe();
    }

    if (this.wakeChoice()) {
      return;
    }

    this.nightGoesOn();
  }

  // After your night choice (or with none): if the Al-Hadikhia chose you,
  // you choose to live or die (see alhadikhia.js); then the night goes on.
  nightGoesOn() {
    this.alhadikhiaPlan();

    if (this.alhadikhiaWake()) {
      return;
    }

    this.resolveNight();
  }

  // Wakes the human if they have a choice to make tonight (see wakeHuman()):
  // true if they do, and the night waits for it.
  wakeChoice() {
    const s = this.s;

    s.pending = this.wakeHuman();

    if (s.pending) {
      this.audit(
        "wake",
        `The Storyteller woke ${this.human().label} (${name(
          s.pending.role,
        )}): ${s.pending.prompt}`,
      );
    }

    return Boolean(s.pending);
  }

  // What the human must choose tonight, or null if they don't wake. Who
  // they can pick goes by the ability's wording (see canPick()): `any` for
  // "choose a player", living players for "choose an alive (or living)
  // player", `dead` for "choose a dead player"; and `self`, yourself too,
  // unless it says "not yourself" (the Monk, Butler, Dreamer, Seamstress,
  // Chambermaid).
  wakeHuman() {
    const s = this.s;
    const h = this.human();
    const role = ability(h);

    const wake = {
      monk:
        s.night > 1 && {
          count: 1,
          any: true,
          prompt: "Choose a player to protect from the Demon tonight.",
        },
      fortuneteller: {
        count: 2,
        any: true,
        self: true,
        prompt: "Choose 2 players: you learn if either is the Demon.",
      },
      // (The Alchemist's Minion ability: see alchemist.js.)
      alchemist:
        h.alchemist === "poisoner"
          ? { count: 1, any: true, self: true, prompt: "Poisoner ability: choose a player to poison tonight and tomorrow." }
          : h.alchemist === "fearmonger"
            ? {
                count: 1,
                any: true,
                self: true,
                prompt:
                  "Fearmonger ability: choose a player. If you nominate and execute them, their team loses.",
              }
            : false,
      butler: {
        count: 1,
        any: true,
        prompt:
          "Choose your master: tomorrow, your vote only counts if they vote too.",
      },
      dreamer: {
        count: 1,
        any: true,
        prompt:
          "Choose a player: you learn 1 good and 1 evil character, 1 of which is correct.",
      },
      villageidiot: {
        count: 1,
        any: true,
        self: true,
        prompt: "Choose a player: you learn their alignment.",
      },
      seamstress: !h.seamUsed && {
        count: 2,
        any: true,
        optional: true,
        prompt:
          "Once per game: choose 2 players to learn if they are the same alignment, or skip tonight.",
      },
      sailor: {
        count: 1,
        self: true,
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
        any: true,
        self: true,
        exclude: h.lastPicks?.exorcist ?? [],
        prompt:
          "Choose a player (not last night's): if they are the Demon, it doesn't wake tonight.",
      },
      innkeeper: s.night > 1 && {
        count: 2,
        any: true,
        self: true,
        prompt:
          "Choose 2 players: they can't die tonight, but 1 of them is drunk until dusk.",
      },
      // (Not a character whose ability needs what you never face: see
      // FORBIDDEN_HUMAN. Nor one jinxed with a character in play: see
      // jinxBarred(). Nor the Atheist, whose ability is about setup, so a
      // Philosopher would gain nothing, nor the Farmer: see
      // PHILOSOPHER_AVOID.) (A Cannibal
      // who ate a Philosopher has it too: see philosophers().)
      philosopher: (!h.gained || hasCannibal(h)) && {
        count: 0,
        characters: s.script.ids.filter(
          (id) =>
            alignment(id) === "good" &&
            id !== "philosopher" &&
            id !== "atheist" &&
            id !== "farmer" &&
            !FORBIDDEN_HUMAN.has(id) &&
            !jinxBarred(s).has(id),
        ),
        optional: true,
        prompt:
          "Once per game: choose a good character to gain its ability (if a player has it, they are drunk), or skip tonight.",
      },
      // (Legion in play: no ability, their jinx. See engineer.js.)
      engineer: !h.engineerUsed &&
        !s.players.some((x) => x.role === "legion") && {
          count: 0,
          engineer: engineerOptions(s),
          optional: true,
          prompt: `Once per game: choose which Demon is in play, or which ${engineerOptions(s).count} Minion${
            engineerOptions(s).count === 1 ? "" : "s"
          }, or not tonight.`,
        },
      courtier: !h.courtierUsed && {
        count: 0,
        characters: s.script.ids,
        optional: true,
        prompt:
          "Once per game: choose a character to make drunk for 3 nights and 3 days, or skip tonight.",
      },
      huntsman: !h.huntsmanUsed && {
        count: 1,
        self: true,
        optional: true,
        prompt:
          "Once per game: choose a living player: if they are the Damsel, they become a Townsfolk not in play. Or skip tonight.",
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

    const pool = wake ? s.players.filter((x) => canPick(wake, x)) : [];

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

    // (The Al-Hadikhia chose you: to live or die. See alhadikhia.js.)
    if (p.liveOrDie) {
      if (!["live", "die"].includes(character)) {
        throw Error("Choose to live or to die.");
      }

      this.alhadikhiaAnswer(character === "live");
      this.resolveNight();
      return;
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

      // The Philosopher gains it now: if it wakes them, they use it tonight.
      if (p.role === "philosopher") {
        this.philosopherGain(this.human(), character);

        if (this.wakeChoice()) {
          return;
        }
      }

      this.nightGoesOn();
      return;
    }

    if (p.optional && !picked.length) {
      s.pending = null;
      s.humanChoice = { role: p.role, night: s.night, players: [] };

      this.audit(
        "choice",
        `${this.human().label} chose not to use their ability tonight.`,
      );

      this.nightGoesOn();
      return;
    }

    if (p.characters) {
      throw Error("Choose a character.");
    }

    if (picked.some((x) => p.exclude?.includes(x.id))) {
      throw Error("You chose that player last night.");
    }

    if (picked.length !== p.count || picked.some((x) => !x || !canPick(p, x))) {
      throw Error(
        `Select ${p.count} ${p.any ? "" : p.dead ? "dead " : "living "}player${
          p.count > 1 ? "s" : ""
        }.`,
      );
    }

    s.pending = null;
    s.humanChoice = { role: p.role, night: s.night, players: picked };

    this.audit(
      "choice",
      `${this.human().label} chose ${bySeat(picked).map((x) => x.label).join(" and ")}.`,
      { targetIds: picked.map((x) => x.id) },
    );

    this.nightGoesOn();
  }

  // The human's choice for tonight, if they made one.
  humanPicks(p) {
    const c = this.s.humanChoice;

    return p.human && c?.night === this.s.night ? c.players : null;
  }

  // The rest of the night, in night order, then dawn.
  resolveNight() {
    const s = this.s;
    // (The Poppy Grower died today: the evil team learns each other now.)
    this.poppyWakes();
    // (Before the Poisoner: a Minion the Engineer makes acts tonight.)
    this.engineers();
    this.poisoners();
    this.alchemists();
    this.lleechHosts();
    this.widows();
    this.sailors();
    this.innkeepers();
    this.courtiers();
    this.huntsmen();
    this.ogres();
    this.philosophers();
    this.snakeCharmers();
    this.twinInfo();
    this.witch();
    this.cerenovus();
    this.atheistCerenovus();
    this.fearmonger();
    this.pitHag();
    this.mezepheles();
    this.advocate();

    if (s.night === 1) {
      this.damselFirstNight();
      this.godfatherFirstNight();
      this.pukkaFirstNight();
    }

    if (s.night > 1) {
      this.monks();
      this.gamblers();
      this.resolveMoonCurse();
      this.exorcists();
      this.lilMonsta();

      if (!s.winner) {
        this.demon();
      }

      if (!s.winner) {
        this.assassin();
      }

      if (!s.winner) {
        this.wizardNight();
      }

      if (!s.winner) {
        this.godfather();
        this.gossipDeaths();
        this.professors();
        this.tinkers();
      }
    }

    if (s.winner) {
      return;
    }

    // (Or tonight.)
    this.poppyWakes();

    // Any Sailor choice still open is decided now.
    this.sailorResolve();

    for (const p of s.players) {
      const info = nightInfo(s, p, this.strategyFor(p));

      // (A good character the Mezepheles turned evil gets their information,
      // but says what helps the evil team: see bluffs().)
      if (info && p.turnedEvil && !p.human) {
        this.woke(p);
        continue;
      }

      // (So does the Bounty Hunter's evil Townsfolk, who keeps it to
      // themself: it tells them whom to suspect of being on their team, see
      // strategy hunches().)
      if (info && p.evilTownsfolk) {
        this.woke(p);
        (p.ownInfo ??= []).push(info);
        this.audit(
          "information",
          `${p.label} (${name(p.role)}), the evil Townsfolk, received, and keeps to themself: ${info.text}`,
          { playerId: p.id, ...info, secret: true },
        );
        continue;
      }

      if (info) {
        this.woke(p);
        this.remember(p, info);
      }
    }

    this.seamstresses();
    this.jugglerNight();
    this.butlers();
    // (Last: she learns about everyone who woke tonight.)
    this.chambermaids();
    this.alchemistTells();
    this.bluffs();
    this.refreshSuspicions();
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
    s.nominationsOpen = false;
    s.npcNominations = 0;
    s.toldToday = [];

    this.applyMadness();
    this.announceClaims();

    s.publicLog.push(
      `Day ${s.day}: ${this.alive().length} alive; talk to ${this.talkLimit()} distinct players.`,
    );

    this.audit("day", `Day ${s.day} began.`);

    this.dawnDeaths();
    this.alhadikhiaDawn();
    this.leviathanDawn();

    if (!s.winner) {
      this.coverStories();
      this.madRavenkeeperClean();
      this.ravenkeeperReveal();
      this.shareInfo();
      this.npcEngineers();
      this.npcShots();
      this.npcArtists();
      this.moonchildDawn();
      this.npcSavants();
      this.npcFishermen();
      this.npcPuzzlemasters();
      this.npcAmnesiacs();
      this.npcJugglers();
      this.twinsAnnounce();
      this.revivedDawn();
      this.professorReveals();
      this.lunaticReveals();
      this.hereticReveals();
      this.npcGossips();
      this.pixieMadness();
      this.marionetteDawn();
      this.npcDamselGuesses();
      this.dawnComeClean();
      this.fearmongerDawn();
      this.wizardDawn();
      this.psychopathKills();
      this.npcWishes();
      this.npcTalks();
    }

    this.phaseCard("dawn", s.nightLog ?? 0);
  }

  // A public log line the Storyteller announces (a death, an execution and
  // what came of it), as opposed to what a player said. Returns its index.
  announce(text) {
    const s = this.s;
    const i = s.publicLog.push(text) - 1;

    (s.announced ??= []).push(i);

    return i;
  }

  // A dawn or dusk card for the UI: what the Storyteller announced since
  // public log line `from`, word for word as the Public Log has it. (None
  // if there was nothing, as at the first dawn.)
  phaseCard(kind, from) {
    const s = this.s;
    const lines = (s.announced ?? [])
      .filter((i) => i >= from)
      .map((i) => s.publicLog[i]);

    if (lines.length) {
      (s.phaseCards ??= []).push({ kind, day: s.day, lines });
    }
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
    strat.villageIdiot = () => picks[0];

    return strat;
  }

  // ── Night actions: Everyone Can Play ──────────────────────

  // Evil NPCs gather night info to report for the role they are bluffing
  // (see bluff.js bluffTonight(); a Philosopher's or Professor's bluff is in
  // its own module). A good player's cover story uses its Professor too.
  bluffs() {
    const s = this.s;

    // (The Lunatic, who thinks they're the Demon, bluffs too; the Marionette
    // and an evil Ogre, who think they're good, don't.)
    for (const p of s.players) {
      const bluffer =
        (p.alignment === "evil" || p.role === "lunatic") &&
        !["marionette", "ogre"].includes(p.role);

      if (p.human || !p.alive) {
        continue;
      }

      if (!bluffer) {
        this.professorBluff(p);
        continue;
      }

      this.philosopherBluff(p);
      this.professorBluff(p);

      const info = this.strat.bluff(s, p);

      if (info) {
        this.rememberBluff(p, info);
      }

      this.alchemistBluff(p);
    }
  }

  // Bluffed info is stored for the NPC to repeat, but is not real information.
  // (Where it's kept: see bluff.js madeUpMemories(). Nowhere, for a good
  // player who no longer acts that character out.)
  rememberBluff(p, info) {
    const into = madeUpMemories(p, info.role);

    if (!into) {
      return;
    }

    into.push(info);

    this.audit(
      "bluff",
      `${p.label} (${name(p.role)}) ${
        sideOf(p) === "good" && !p.pixieMad ? "made up" : "bluffed"
      }: ${info.text}`,
      { playerId: p.id, ...info },
    );
  }

  demon() {
    const s = this.s;
    const d = s.players.find((x) => living(x) && isDemon(x));

    // (With the Atheist in play, the Storyteller pretends there's a Demon:
    // see atheist.js.)
    if (s.atheist) {
      this.atheistNight();
      return;
    }

    // (The executed Al-Hadikhia's jinx with the Mastermind: see
    // alhadikhia.js.)
    if (s.alhadikhia?.final && s.alhadikhia.night === s.night) {
      this.alhadikhiaFinal();
      return;
    }

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

    // (The Leviathan doesn't kill: see leviathan.js.)
    if (d.role === "leviathan") {
      this.leviathanNight(d);
      return;
    }

    // (Lil' Monsta: the Storyteller chooses who might die.)
    if (d.babysitting) {
      this.lilMonstaKill(d);
      return;
    }

    // (Legion: the Storyteller chooses who might die.)
    if (d.role === "legion") {
      this.legionNight();
      return;
    }

    if (this.demonSleeps(d)) {
      return;
    }

    this.woke(d);
    this.marionetteReveal(d);

    // (Up to 3 players choose to live or die: see alhadikhia.js.)
    if (d.role === "alhadikhia") {
      this.alhadikhiaNight(d);
      return;
    }

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
  // last night, who dies now), described by `verb` in the log. (You, only
  // when it has nobody else but its own team: see strategy demon().)
  attack(d, t, { chosen = true, verb = "chose" } = {}) {
    const s = this.s;

    if (!t || !t.alive) {
      this.audit(
        "demon",
        `${this.demonName(d)} had no legal target.`,
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

    // (Lil' Monsta's kill can't fail that way: it isn't its babysitter's.)
    if (!works(d) && !d.babysitting) {
      outcome = "blocked";
      detail = "failed (the Demon is drunk or poisoned)";
    } else if (t.role === "soldier" && works(t)) {
      outcome = "blocked";
      detail = "was blocked by the Soldier ability";
      foiled = true;
    } else if (s.revived.includes(t.id)) {
      outcome = "blocked";
      detail = "was blocked: they came back to life tonight";
    } else if (t.protected) {
      outcome = "blocked";
      detail = "was blocked by Monk protection";
      protector = t.protectedBy;
    } else if ((guard = this.guard(t, "demon"))) {
      outcome = "blocked";
      detail = `was blocked: ${guard.text}`;
      foiled = true;
      protector = guard.by;
    } else if (t.role === "mayor" && works(t)) {
      // (Never onto the human, the Demon or either twin. Legion's kill was
      // steered to a good player or a Legion, for a close finish: see
      // legionWant(). The bounce lands on the same kind, when it can.)
      const anyone = s.players.filter(
        (x) =>
          x.alive &&
          !x.human &&
          x.id !== t.id &&
          x.id !== d.id &&
          !twinSafe(s, x),
      );
      const same = anyone.filter((x) => (x.role === "legion") === (t.role === "legion"));
      const bounce = d.role === "legion" && same.length ? same : anyone;
      const alt = pick(
        steer(s, bounce, killHelps, "where the Mayor's bounce lands"),
        s.r,
      );

      if (alt) {
        t = alt;
        outcome = "redirected";
        detail = `was redirected to ${t.label} by the Mayor (why: ${steerWhy(
          s,
          bounce,
          killHelps,
        )})`;

        if ((guard = this.cantDie(t, "demon"))) {
          outcome = "blocked";
          detail = `was redirected to ${t.label}, but ${guard}`;
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

    const result =
      outcome === "killed"
        ? `${t.label} was killed`
        : outcome === "fool"
          ? detail
          : `the attack ${detail}`;
    // Why it chose them (see strategy demon()).
    const why = chosen && d.killWhy?.[original.id];

    if (d.killWhy) {
      delete d.killWhy[original.id];
    }

    // (Lil' Monsta's victims are the Storyteller's choice, not its
    // babysitter's: see lilMonstaKill().)
    this.audit(
      "demon",
      `${
        d.babysitting && chosen
          ? `The Storyteller chose ${original.label} to die to ${this.demonName(d)}`
          : `${this.demonName(d)} ${verb} ${original.label}`
      }${
        why ? ` (why: ${why})` : ""
      }; ${result}.`,
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

  // Returns whether p actually died.
  kill(p, cause) {
    if (!p?.alive) {
      // A Zombuul that registers as dead can still die for good.
      return Boolean(p?.undead) && this.zombuulDies(p, cause);
    }

    // Nobody dies the night they come back to life.
    if (this.s.phase === "night" && this.s.revived.includes(p.id)) {
      this.audit(
        "death",
        `${p.label} would have died (${cause}), but came back to life tonight.`,
        { playerId: p.id, cause },
      );

      return false;
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
      this.announce(`${p.label} died.`);
    }

    // "If you die at night": any death at night wakes the Ravenkeeper (the
    // Demon's kill, the Assassin, a Moonchild curse, a random death...), and
    // makes a new Farmer. A Demon kill always counts as a night death.
    const atNight = this.s.phase === "night" || cause === "demon";

    this.ravenkeeperDeath(p, atNight);
    this.sageDeath(p, cause);
    this.sweetheartDeath(p);
    this.barberDeath(p);
    this.vigormortisDeath(p);
    this.pixieGains(p);
    this.lleechHostDied(p, cause);
    this.poppyDeath(p);
    this.farmerDeath(p, atNight);

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
    // and a dead mad Pixie's madness no longer matters, so they reveal it.
    // (Not a Lunatic who'll say they were the Lunatic: see lunaticReveals().)
    const reveal =
      !p.human &&
      !(p.role === "lunatic" && p.lunaticTeam) &&
      this.strat.revealsWhenDead?.(p);

    if (reveal && p.claim !== reveal) {
      // (A Pixie says what they were mad about being.)
      const what = `the ${name(reveal)}${
        reveal === "pixie" ? `, mad about being the ${name(p.pixieRole)}` : ""
      }`;

      p.claim = reveal;
      p.cover = null;

      // (Made mad today, they go back to this claim when it ends, and say
      // so to anyone who heard the madness: see explainMadness().)
      if (p.mad?.previous) {
        p.mad.previous = reveal;
      }

      this.claimPublicly(p);
      this.s.publicLog.push(`Day ${this.s.day} — ${p.label} reveals they were ${what}.`);
      this.audit(reveal, `${p.label} revealed they were ${what}.`, {
        playerId: p.id,
      });
    }

    if (
      !p.human &&
      (p.role === "moonchild" || bluffing(p, "moonchild"))
    ) {
      this.moonchild(p);
    }

    this.klutzDeath(p);
    this.gamblerReveal(p);
  }

  // At dawn: who died in the night (and the human learns if it was them),
  // then "when you learn that you died" abilities.
  dawnDeaths() {
    const s = this.s;
    const dead = s.nightDeaths.map((id) => this.player(id));

    for (const p of dead) {
      this.announce(`Day ${s.day} — ${p.label} died in the night.`);

      if (p.human) {
        s.privateLog.push(`Day ${s.day}: You died in the night.`);
      }
    }

    if (!dead.length && s.night > 1) {
      this.announce(`Day ${s.day} — Nobody died in the night.`);
    }

    s.nightDeaths = [];

    for (const id of s.dawnLearn.splice(0)) {
      this.learnsDeath(this.player(id));
    }
  }

  // ── Day ────────────────────────────────────────────────────

  // p has now said their current claim in public, to everyone; later
  // changes to it get announced (see announceClaims()). The town square
  // flags it (⚠, see claimAlert).
  // (A cover story is what they claim in public, too.)
  claimPublicly(p) {
    p.claimKnown = true;
    p.publicClaim = p.cover?.as ?? p.claim;
    p.publicAt = tick(this.s);

    if (!p.human) {
      this.s.claimAlerts = (this.s.claimAlerts ?? 0) + 1;
      p.claimAlert = this.s.claimAlerts;
    }
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

    if (s.nominationsOpen) {
      throw Error("Nominations are open: no more conversations today.");
    }

    if (st.already) {
      throw Error("Already asked today.");
    }

    if (!st.remaining) {
      throw Error("No conversation slots remain.");
    }

    s.talked.push(id);

    // A dead Mutant (or Mutant bluffer, or mad Pixie) now says so.
    const reveal = this.strat.revealsWhenDead?.(p);

    if (reveal) {
      p.claim = reveal;
    }

    // (In private: only you learn their claim; see claimTo().)
    const firstWithCover = p.cover && p.cover.human === undefined;
    const response = this.strat.ask(s, p);

    // Whether someone with a cover story drops it for you is decided the
    // first time you talk (see strategy truthTo()): the log says which.
    if (firstWithCover && p.cover?.human !== undefined) {
      this.audit(
        "cover",
        p.cover.human
          ? `${p.label} tells you the truth: they're the ${name(p.claim)}, not the ${name(
              p.cover.as,
            )} (decided once, at COVER_TELL_HUMAN_CHANCE).`
          : `${p.label} keeps their cover story with you: the ${name(p.cover.as)} (decided once, at COVER_TELL_HUMAN_CHANCE).`,
        { playerId: p.id },
      );
    }

    p.talks.push({
      day: s.day,
      response,
    });

    // (In your log, but no NPC hears it.)
    s.publicLog.push(
      `Day ${s.day} — ${p.label}\n${response}`,
    );

    this.audit(
      "conversation",
      `${p.label}\n${response}`,
      { target: id },
    );

    // How they decided who they trust and suspect (log only).
    const rows = p.workings ?? [];

    if (rows.length) {
      this.audit(
        "workings",
        `${p.label}'s evidence scores (trust at ${TRUST_EVIDENCE} or less, suspect at ${EVIDENCE_TO_SUSPECT} or more; they tell you the strongest one):\n${rows
          .map(
            (r) =>
              `${r.x.label}: ${Math.round(r.score * 10) / 10}${
                r.stance ? `, ${r.stance === "trust" ? "trusted" : "suspected"}` : ""
              }${r.note ? ` (${r.note})` : ""}${
                r.reasons.length ? ` — ${r.reasons.join("; ")}` : ""
              }`,
          )
          .join("\n")}`,
        { target: id },
      );
    }

    return response;
  }

  // In a conversation (once a day, with an NPC you've asked today, before
  // nominations open), you tell them, in private, that you're the `claim`
  // (the truth, or a bluff) and, with `info`, what you learned. They weigh
  // it like anything else they're told (see strategy evidence()), and pass
  // your claim on (see strategy told()).
  tell(id, claim, info = false) {
    const s = this.s;
    const h = this.human();
    const p = this.player(id);

    if (!p || p.human || s.phase !== "day") {
      throw Error("Select an NPC during the day.");
    }

    if (s.nominationsOpen) {
      throw Error("Nominations are open: no more conversations today.");
    }

    if (!this.talkStatus(id).already) {
      throw Error("Ask them first: telling them is part of the conversation.");
    }

    if ((s.toldToday ??= []).includes(id)) {
      throw Error("You've already told them today.");
    }

    if (!s.script.ids.includes(claim)) {
      throw Error("Choose a character on the script.");
    }

    s.toldToday.push(id);

    const before = p.toldMe?.[h.id];

    (p.toldMe ??= {})[h.id] = {
      claim,
      day: s.day,
      at: tick(s),
      was: before && before.claim !== claim ? before.claim : (before?.was ?? null),
    };

    const memories = info ? h.memories : [];
    // (How it changes what they think of the players it names, for log.txt.)
    const named = [...new Set(memories.flatMap((m) => m.targets ?? []))]
      .map((x) => this.player(x))
      .filter((x) => x && !x.human && x !== p);
    const was = new Map(named.map((x) => [x, this.strat.evidence(s, p, x).score]));

    heard(s, h, memories, null, p);

    const said = [
      `I am the ${name(claim)}.`,
      ...memories.map(
        (m) => `${m.day ? `Day ${m.day}` : `Night ${m.night}`}: ${speak(m.text)}`,
      ),
    ].join("\n");

    s.publicLog.push(`Day ${s.day} — You told ${p.label}:\n${said}`);
    this.audit("tell", `You told ${p.label}:\n${said}`, { target: id, claim, info });

    if (named.length) {
      const round = (n) => Math.round(n * 10) / 10;

      this.audit(
        "workings",
        `What ${p.label} thinks of the players your information names (evidence score, before → after; suspect at 1 or more):\n${bySeat(
          named,
        )
          .map((x) => `${x.label}: ${round(was.get(x))} → ${round(this.strat.evidence(s, p, x).score)}`)
          .join("\n")}`,
      );
    }

    return said;
  }

  // ── Nominations ────────────────────────────────────────────

  // Nominations open (once a day, when you press Start Nominations; the
  // first nomination opens them too): no more conversations today. A card
  // says so.
  openNominations() {
    const s = this.s;

    if (s.nominationsOpen || s.phase !== "day" || s.winner) {
      return;
    }

    s.nominationsOpen = true;

    const i = this.announce(`Day ${s.day} — Nominations are open.`);

    (s.phaseCards ??= []).push({
      kind: "nominations",
      day: s.day,
      lines: [s.publicLog[i]],
    });
    this.audit("nominations", "Nominations opened.");

    // (With the Atheist on the script, what each NPC believes: see
    // atheist.js.)
    if (s.script.ids.includes("atheist")) {
      this.atheistBeliefs();
    }

    this.countNpcNominations();
  }

  // The NPCs who want to nominate now, strongest case first (see strategy
  // nomination()): living NPCs who haven't nominated today, each with a
  // nominee nobody has nominated (one NPC per nominee); none once the
  // day's NPC nominations (half the living players, rounded down) are
  // used.
  npcNominators() {
    const s = this.s;

    if (!s.nominationsOpen || s.phase !== "day" || s.winner) {
      return [];
    }

    const left = Math.floor(this.alive().length / 2) - (s.npcNominations ?? 0);
    const seen = new Set();

    return s.players
      .filter(
        (x) => x.alive && !x.human && !s.dayNominators.includes(x.id) && !wishBarred(s, x),
      )
      .map((p) => ({ p, n: this.strat.nomination(s, p) }))
      .filter((o) => o.n && !this.nominatedToday(o.n.target.id))
      .sort((a, b) => b.n.score - a.n.score)
      .filter((o) => !seen.has(o.n.target.id) && seen.add(o.n.target.id))
      .slice(0, Math.max(0, left));
  }

  // How many NPCs want to nominate (s.npcWanting, for the "NPC nominations"
  // button): counted when nominations open and after each vote.
  countNpcNominations() {
    this.s.npcWanting = this.npcNominators().length;

    return this.s.npcWanting;
  }

  // The next NPC nomination, when you ask for one ("NPC nominations"): the
  // strongest case first (see npcNominators()). They say why, on the card
  // before the vote, and the vote waits for your hand (see runNomination()).
  // Null if nobody nominates, or nominations aren't open (see
  // openNominations()). NPCs never nominate by themselves.
  npcNomination() {
    const s = this.s;

    if (!s.nominationsOpen || s.phase !== "day" || s.winner || s.pendingVote) {
      return null;
    }

    const best = this.npcNominators()[0];

    if (!best) {
      s.npcWanting = 0;
      return null;
    }

    const { p, n } = best;
    const why = n.reasons.length ? n.reasons.join("; ") : "I suspect them";
    const line = `Day ${s.day} — ${p.label} nominates ${n.target.label}: "${
      why.charAt(0).toUpperCase() + why.slice(1)
    }."`;

    s.npcNominations = (s.npcNominations ?? 0) + 1;
    s.publicLog.push(line);
    // (\`why\`: what the nominee doesn't hear, for log.txt: see strategy
    // nomination().)
    this.audit("npc_nomination", `${line.replace(/^Day \d+ — /, "")}${n.why ? ` (why: ${n.why})` : ""}`, {
      actorId: p.id,
      targetId: n.target.id,
    });

    // (The Storyteller, with the Atheist on the script: see atheist.js.)
    if (n.target.storyteller) {
      return this.nominateStoryteller(p, null, line);
    }

    return this.runNomination(p, n.target, false, null, line);
  }

  // At dawn, every NPC (living or dead) talks in private to as many other
  // NPCs as you can (talkLimit()): those they've never talked to first, then
  // those they talked to longest ago, so over the days they fill in their
  // own picture of the town. Each learns what the other would tell you
  // (their claim, information and opinion; see strategy told()), and only
  // they hear it: who they suspect, protect or kill comes from what they've
  // heard, in private or in public. (Nobody talks to you: you talk to them.)
  npcTalks() {
    const s = this.s;
    const limit = this.talkLimit();
    const npcs = s.players.filter((x) => !x.human);
    const lines = [];

    for (const p of npcs) {
      const last = (p.talkedTo ??= {});
      // (A High Priestess talks first to the player she was shown last night.)
      const priestess = p.memories.findLast(
        (m) => m.role === "highpriestess" && m.night === s.night && !m.day,
      )?.targets?.[0];
      const picks = shuffle(
        npcs.filter((x) => x !== p),
        s.r,
      )
        .sort(
          (a, b) =>
            (b.id === priestess) - (a.id === priestess) ||
            (last[a.id] ?? 0) - (last[b.id] ?? 0),
        )
        .slice(0, limit);

      for (const t of picks) {
        // (A dead Mutant, or mad Pixie, now says so, as they would to you.)
        const reveal = this.strat.revealsWhenDead?.(t);

        if (reveal) {
          t.claim = reveal;
        }

        this.strat.told(s, t, p);
        last[t.id] = s.day;
      }

      // (A line for each player: whom they talked to, in seat order.)
      if (picks.length) {
        lines.push(`${p.label} → ${bySeat(picks).map((x) => x.label).join(", ")}`);
      }
    }

    if (lines.length) {
      this.audit("talks", lines.join("\n"));
    }
  }

  // ── Abilities seen to work or fail ─────────────────────────

  // p's claimed ability visibly worked (`why`), so the town has reason to
  // think they're good, at a `level` of how sure:
  // - "certain" (confirmedGood) and "likely" (confirmedLikely): good NPCs
  //   trust them and never suspect them, and the evil team stops framing
  //   them;
  // - "maybe" (confirmedMaybe): it only counts for them.
  // (See strategy evidence().) A surer level replaces a less sure one.
  confirm(p, level, why) {
    if (!p || p.human) {
      return;
    }

    const rank = { maybe: 1, likely: 2, certain: 3 };
    const was = this.s.confirmed?.[p.id];

    if (was && rank[was.level] >= rank[level]) {
      return;
    }

    (this.s.confirmed ??= {})[p.id] = { level, why };
    this.audit(
      "confirmed",
      `${p.label} is ${
        { certain: "confirmed good", likely: "almost certainly good", maybe: "maybe good" }[level]
      }: ${why}.`,
      { playerId: p.id, level },
    );
  }

  // p showed they're evil in public (`why`: a Psychopath's kill, a Goblin
  // claim): good NPCs count it against them (see strategy evidence()).
  outed(p, why) {
    const s = this.s;

    if (!(s.outed ??= []).some((x) => x.id === p.id)) {
      s.outed.push({ id: p.id, day: s.day, why });
    }
  }

  // p's claimed ability visibly failed (`why`): good NPCs count it against
  // them (see strategy evidence()).
  failed(p, why) {
    (this.s.failures ??= []).push({ id: p.id, day: this.s.day, text: why });
    this.audit("failed", `${p.label}: ${why}.`, { playerId: p.id });
  }

  // p was executed and didn't die: the town can guess why, from the
  // characters claimed in public (each "maybe": a Devil's Advocate, or
  // something else, could have saved them): p's own Fool or Sailor, a
  // Pacifist, or a Tea Lady next to p (and p, a good neighbour of hers).
  survivedExecution(p) {
    const s = this.s;
    const claim = claimTo(p);

    if (["fool", "sailor"].includes(claim)) {
      this.confirm(p, "maybe", `they claim the ${name(claim)}, and survived execution`);
    }

    // With the Lleech on the script (and no Devil's Advocate), surviving
    // with no claim to explain it says they're the Lleech: good NPCs know
    // it, and stop nominating them (only the host's death kills it).
    const explained =
      ["fool", "sailor"].includes(claim) ||
      s.players.some(
        (x) =>
          x.alive &&
          x !== p &&
          (claimTo(x) === "pacifist" ||
            (claimTo(x) === "tealady" && this.aliveNeighbours(x).includes(p))),
      );

    if (
      s.script.ids.includes("lleech") &&
      !s.script.ids.includes("devilsadvocate") &&
      !explained
    ) {
      this.outed(p, "they survived execution with nothing to explain it: they must be the Lleech");
      (s.lleechSuspects ??= []).push(p.id);
      this.audit("lleech", `${p.label} survived execution with nothing to explain it: the town takes them for the Lleech.`, {
        playerId: p.id,
      });
    }

    for (const x of s.players.filter((y) => y.alive && y !== p)) {
      if (claimTo(x) === "pacifist") {
        this.confirm(x, "maybe", `they claim the Pacifist, and ${p.label} survived execution`);
      }

      if (claimTo(x) === "tealady" && this.aliveNeighbours(x).includes(p)) {
        this.confirm(
          x,
          "maybe",
          `they claim the Tea Lady, and their neighbour ${p.label} survived execution`,
        );
        this.confirm(p, "maybe", `they survived execution next to ${x.label}, who claims the Tea Lady`);
      }
    }
  }

  // ── Cover stories ──────────────────────────────────────────

  // On Day 1, good NPCs may take a cover story: hiding a valuable character,
  // or baiting the Demon with one (see strategy coverFor()). Each morning a
  // baiter makes up their cover character's information for last night.
  coverStories() {
    const s = this.s;

    for (const p of s.players.filter((x) => !x.human && x.alive)) {
      if (s.day === 1 && !p.cover) {
        p.cover = this.strat.coverFor?.(s, p) ?? null;

        if (p.cover) {
          this.audit(
            "cover",
            `${p.label} (${name(p.claim)}) ${
              { hide: "hides as", bait: "baits the Demon as", decoy: "is a decoy as" }[
                p.cover.kind
              ]
            } the ${name(p.cover.as)}.`,
            { playerId: p.id, ...p.cover },
          );
        }
      }

      if (p.cover) {
        keepStory(s, p, p.cover, this.strat);
      }

      // (A good Mutant or Damsel makes up their Townsfolk's information.)
      if (
        HIDDEN_OUTSIDERS.includes(p.role) &&
        sideOf(p) === "good" &&
        team(p.claim) === "townsfolk"
      ) {
        hiddenStory(s, p, this.strat);
      }
    }
  }

  // At dawn, players with a cover story come clean (see comeClean()): once
  // they're dead, or late in the game (COME_CLEAN_ALIVE), or (a hider)
  // when last night's information points at a living player, at
  // COME_CLEAN_URGENT_CHANCE.
  dawnComeClean() {
    const s = this.s;
    const late = this.alive().length <= COME_CLEAN_ALIVE;

    for (const p of s.players.filter((x) => x.cover)) {
      const urgent =
        p.cover.kind === "hide" &&
        p.alive &&
        p.memories.some(
          (m) =>
            m.night === s.night &&
            !m.day &&
            m.night > p.cover.night &&
            (m.targets ?? []).some((id) => {
              const t = this.player(id);

              return t?.alive && t !== p && stanceOn(s, m, t, p) === "suspicious";
            }),
        );

      // (A hiding Poppy Grower only comes clean once dead: alive, saying so
      // would get them killed.)
      const poppy = p.claim === "poppygrower" && p.cover.kind === "hide";

      if (!p.alive || (!poppy && (late || (urgent && s.r() < COME_CLEAN_URGENT_CHANCE)))) {
        this.comeClean(p);
      }
    }
  }

  // p drops their cover story and says in public what they really are,
  // with all their information. Returns the Public Log line.
  comeClean(p) {
    const s = this.s;
    const { kind, as } = p.cover;
    const info = p.memories.map(
      (m) => `${m.day ? `Day ${m.day}` : `Night ${m.night}`}: ${speak(m.text)}`,
    );
    const why =
      kind === "hide"
        ? `I was hiding as the ${name(as)}; I'm really the ${name(p.claim)}.`
        : kind === "decoy"
          ? `I said I was the ${name(as)} to draw a Minion's guess; I'm really the ${name(p.claim)}.`
          : `I said I was the ${name(as)} to bait the Demon; I'm really the ${name(p.claim)}.`;
    // (Each sentence on its own line.)
    const line = `Day ${s.day} — ${p.label} comes clean: "${[why, ...info].join("\n")}"`;

    p.cover = null;
    p.cameClean = { day: s.day, from: as };
    this.claimPublicly(p);
    heard(s, p, p.memories);
    s.publicLog.push(line);
    this.audit("come_clean", line.replace(/^Day \d+ — /, ""), { playerId: p.id, from: as });

    return line;
  }

  // An evil NPC fakes coming clean (once): they say they were hiding a
  // "high" good character (a Demon bluff nobody claims, if there is one;
  // else one that isn't in play), with made-up information, and claim it
  // from now on. Returns the Public Log line, or null if there's no
  // character to fake. (Never a teammate's claim, heard or not: the team
  // knows each other's bluffs.)
  fakeClean(p) {
    const s = this.s;
    const claimed = new Set(
      s.players
        .flatMap((x) => [
          claimHeard(x, p),
          x !== p && x.alignment === "evil" && !p.poppyBlind ? x.claim : null,
        ])
        .filter(Boolean),
    );
    const inPlay = new Set(s.players.flatMap((x) => [x.role, x.shown]));
    const fits = (id) =>
      DEMON_KILL_PRIORITY[id] === "high" &&
      alignment(id) === "good" &&
      !claimed.has(id) &&
      id !== p.claim;
    // (Kept apart by the Poppy Grower, they were never told the bluffs.)
    const role =
      pick((p.poppyBlind ? [] : (s.demonBluffs ?? [])).filter(fits), s.r) ??
      pick(
        s.script.ids.filter((id) => fits(id) && !inPlay.has(id)),
        s.r,
      );

    if (!role) {
      return null;
    }

    const was = p.claim;
    const memories = backStory(s, p, role, this.strat);
    const info = memories.map(
      (m) => `${m.day ? `Day ${m.day}` : `Night ${m.night}`}: ${speak(m.text)}`,
    );
    const line = `Day ${s.day} — ${p.label} comes clean: "${[
      `I was hiding as the ${name(was)}; I'm really the ${name(role)}.`,
      ...info,
    ].join("\n")}"`;

    p.claim = role;
    p.bluff = role;
    p.memories = memories;
    p.cameClean = { day: s.day, from: was, fake: true };

    // (Made mad today, they go back to this claim when it ends.)
    if (p.mad?.previous) {
      p.mad.previous = role;
    }

    // (A Pixie bluffer "mad" about a character drops it: they answer as
    // the new claim from now on, not the old one. See strategy pixieMad().)
    const pixieWas = p.pixieMad ? p.pixieRole : null;

    p.pixieMad = false;
    p.pixieRole = null;
    bluffState(p).pixie = null;
    lied(s, { kind: "fake", byId: p.id, said: role, truth: p.role });
    this.claimPublicly(p);
    heard(s, p, memories);
    s.publicLog.push(line);
    this.audit(
      "come_clean",
      `${line.replace(/^Day \d+ — /, "")} (fake: they're the ${name(p.role)}${
        pixieWas ? `; no longer "mad" about the ${name(pixieWas)}` : ""
      })`,
      { playerId: p.id, from: was, fake: true },
    );

    return line;
  }

  // Whether you can press Round Robin now (see ROUND_ROBIN_ALIVE): once per
  // game, by day, once nominations are open and no vote or countdown waits.
  roundRobinReady() {
    const s = this.s;

    return (
      s.phase === "day" &&
      !s.winner &&
      !s.roundRobinDay &&
      !!s.nominationsOpen &&
      !s.pendingVote &&
      !s.boom &&
      this.alive().length <= ROUND_ROBIN_ALIVE
    );
  }

  // Round Robin (once per game; see ROUND_ROBIN_ALIVE): from Seat 1, every
  // player, living or dead, says in public their character and information.
  // You (always good) say your claim and what you've learned, which the
  // NPCs weigh like anything said in public. A good NPC tells the truth,
  // coming clean if they have a cover story (see comeClean()), except a
  // living Damsel; she and evil NPCs say what they'd say in public (see
  // strategy answer()): their bluff. It all goes on a card for you, and in
  // the Public Log as one entry, in seat order.
  roundRobin() {
    const s = this.s;

    if (!this.roundRobinReady()) {
      throw Error(
        s.roundRobinDay
          ? "The Round Robin has been used."
          : `The Round Robin needs nominations open and ${ROUND_ROBIN_ALIVE} or fewer players alive.`,
      );
    }

    s.roundRobinDay = s.day;

    const lines = [
      `Day ${s.day} — Round Robin: from Seat 1, every player says their character and information.`,
    ];
    // (Coming clean adds its own Public Log line: gathered up below.)
    const from = s.publicLog.length;
    const said = (claim, memories) =>
      [
        `I am the ${name(claim)}.`,
        ...memories.map(
          (m) => `${m.day ? `Day ${m.day}` : `Night ${m.night}`}: ${speak(m.text)}`,
        ),
      ].join("\n");

    for (const p of [...s.players].sort((a, b) => a.seat - b.seat)) {
      const truthful =
        !p.human &&
        sideOf(p) === "good" &&
        !(p.role === "damsel" && p.alive);

      if (truthful && p.cover) {
        lines.push(this.comeClean(p));
        continue;
      }

      let claim;
      let memories;

      if (p.human) {
        claim = p.claim;
        memories = p.memories;
      } else if ((truthful && p.pixieMad && p.alive) || (truthful && p.mad?.day === s.day)) {
        // (A living Pixie claims their character, never the Pixie; a player
        // the Cerenovus made mad today, the character they're mad about, as
        // they do when asked.)
        ({ claim, memories } = this.strat.answer(s, p));
      } else if (truthful) {
        claim = this.strat.revealsWhenDead?.(p) ?? p.claim;
        memories = spoken(p);
      } else {
        const a = this.strat.answer(s, p);

        ({ claim, memories } = a);

        // For the final reveal: a cover story, or an evil player's bluff.
        if (a.hidden) {
          lied(s, { kind: p.cover.kind, byId: p.id, said: claim, truth: p.claim });
        } else if (!a.mad && sideOf(p) === "evil" && p.alignment === "evil" && claim !== p.role) {
          lied(s, { kind: "bluff", byId: p.id, said: claim, truth: p.role });
        }
      }

      const line = `Day ${s.day} — ${p.human ? "You" : p.label}: "${said(claim, memories)}"`;

      // (You're always good: what you share helps the NPCs' suspicions.)
      this.claimPublicly(p);
      heard(s, p, memories);
      lines.push(line);
    }

    s.publicLog.splice(from);
    s.publicLog.push(
      [lines[0], ...lines.slice(1).map((x) => x.replace(/^Day \d+ — /, ""))].join("\n"),
    );

    this.audit(
      "round_robin",
      `Round Robin, with ${this.alive().length} alive:\n${lines
        .slice(1)
        .map((x) => x.replace(/^Day \d+ — /, ""))
        .join("\n")}`,
    );
    (s.phaseCards ??= []).push({ kind: "roundrobin", day: s.day, lines });

    return lines;
  }

  // Before the vote on nominee n: n comes clean if they have a cover story
  // (at COME_CLEAN_NOMINATED_CHANCE), or, if evil, may fake it
  // (FAKE_CLEAN_CHANCE, once); then each other player with a cover story
  // whose own information vouches for or points at n does, at
  // COME_CLEAN_NOMINATION_CHANCE. Whatever was said goes on a card for you
  // (s.phaseCards), shown before you decide on your hand.
  // (`intro`: an NPC's nomination and why, first on the card.)
  nominationReveals(n, intro = null) {
    const s = this.s;
    const lines = intro ? [intro] : [];
    // (A Goblin, or a player mad that they're one, may say so: see goblin.js.
    // It gets a card of its own, after this one.)
    const goblin = this.goblinClaim(n);

    // (Said instead of coming clean.)
    if (!goblin && n.cover) {
      if (s.r() < COME_CLEAN_NOMINATED_CHANCE) {
        lines.push(this.comeClean(n));
      }
    } else if (
      !goblin &&
      !n.cover &&
      !n.human &&
      n.alive &&
      n.alignment === "evil" &&
      sideOf(n) === "evil" &&
      !n.cameClean &&
      !isTwin(s, n) &&
      // (Nor an Atheist claim, a trap they keep up: see setup.js.)
      n.claim !== "atheist" &&
      DEMON_KILL_PRIORITY[n.claim] !== "high" &&
      s.r() < FAKE_CLEAN_CHANCE
    ) {
      const line = this.fakeClean(n);

      if (line) {
        lines.push(line);
      }
    }

    for (const p of s.players.filter((x) => x.cover && x !== n)) {
      if (
        this.strat.ownStance(s, p, n) &&
        s.r() < COME_CLEAN_NOMINATION_CHANCE
      ) {
        lines.push(this.comeClean(p));
      }
    }

    if (lines.length) {
      (s.phaseCards ??= []).push({ kind: "nomination", day: s.day, lines });
    }

    if (goblin) {
      (s.phaseCards ??= []).push({ kind: "goblin", day: s.day, lines: [goblin] });
    }

    return goblin ? [...lines, goblin] : lines;
  }

  // Your Good / Evil mark on a player ("good", "evil", or "" to clear it).
  // Good NPCs weigh it like your stated view (see strategy evidence()).
  mark(id, guess) {
    const marks = (this.s.marks ??= {});

    if (guess === "good" || guess === "evil") {
      marks[id] = guess;
    } else {
      delete marks[id];
    }
  }

  // Who means to vote for nominee n, by id. Good players decide first, then
  // evil players, who see how the vote is going (see strategy vote()).
  // `humanChoice`: the human picked the nominee (nominated, or asked for it).
  // `hand`: whether your hand is up (if you can vote).
  intents(n, nominator = null, humanChoice = Boolean(nominator?.human), hand = true) {
    const s = this.s;
    const intents = {};
    const tally = {
      yes: 0,
      needed: n.storyteller ? this.storytellerNeeded() : this.votesNeeded(),
      nominator,
      humanChoice,
      // (Whether your hand is up, and whether you can vote at all: see
      // strategy vote(), on a Golem's nominee.)
      hand: Boolean(hand),
      youVote: this.canVote(),
    };
    // (On the Storyteller, each decides as the clock hand comes round to
    // them, clockwise from the Sun: you first, then seat by seat, counting
    // the hands already counted. See app.js runVote().)
    const order = n.storyteller
      ? s.players
      : [
          ...s.players.filter((v) => v.alignment !== "evil"),
          ...s.players.filter((v) => v.alignment === "evil"),
        ];

    for (const v of order) {
      // (Nor the Wizard in the second round they wished for: see wizard.js.)
      const eligible = (v.alive || v.ghost) && !wishBarred(s, v);
      const attempted = Boolean(
        eligible &&
          (v.human
            ? hand
            : n.storyteller
              ? this.strat.storytellerVote(s, v, { ...tally })
              : this.strat.vote(s, v, n, { ...tally })),
      );

      intents[v.id] = attempted;
      tally.yes += attempted ? 1 : 0;
    }

    return intents;
  }

  // The vote records for `intents`, in seat order: who raised a hand, and
  // whose vote counts (a working Butler's only if their master voted).
  tallied(intents) {
    return this.s.players.map((v) => ({
      playerId: v.id,
      attempted: intents[v.id],
      counted:
        intents[v.id] &&
        !(v.alive && ability(v) === "butler" && works(v) && !intents[v.master]),
    }));
  }

  // Everyone's vote on nominee n, in seat order (see intents()), cast: the
  // voters are on record, and dead voters spend their ghost vote. With
  // `decided` (the NPCs' intents, from openVote()), they stand, and only
  // your hand is new.
  votes(
    n,
    nominator = null,
    humanChoice = Boolean(nominator?.human),
    hand = true,
    decided = null,
  ) {
    const s = this.s;
    const intents = decided
      ? { ...decided, [s.humanId]: Boolean(hand) }
      : this.intents(n, nominator, humanChoice, hand);
    const records = this.tallied(intents);

    for (const r of records) {
      const v = this.player(r.playerId);

      if (r.attempted && !s.dayVoters.includes(v.id)) {
        s.dayVoters.push(v.id);
      }

      // Dead players spend their one ghost vote.
      if (r.counted && !v.alive) {
        v.ghost = false;
      }
    }

    return records;
  }

  // The waiting vote's count starts: the NPCs decide now (seeing your hand
  // as it is), and their votes stand (kept for castVotes()). Your hand can
  // still change until the clock hand reaches you: call again with it to
  // see the records as they'd be. Nothing is cast yet.
  openVote(hand = false, locked = false) {
    const s = this.s;
    const pending = s.pendingVote;

    if (!pending) {
      throw Error("No vote is waiting.");
    }

    const n = pending.storyteller ? this.storytellerNominee() : this.player(pending.nomineeId);
    const nominator = this.player(pending.nominatorId);
    // (On the Storyteller, your hand is counted first, then each NPC decides
    // by the hands counted before them: so nobody has decided until yours
    // is `locked`, as the clock hand reaches you, and then it stands. See
    // intents(), app.js runVote().)
    const up = pending.storyteller && pending.intents ? pending.hand : Boolean(hand) && this.canVote();

    if (pending.storyteller && !pending.intents && !locked) {
      return this.tallied({ [s.humanId]: up });
    }

    pending.hand ??= up;
    pending.intents ??= this.intents(n, nominator, nominator.human || pending.requested, up);

    return this.tallied({ ...pending.intents, [s.humanId]: up });
  }

  // Each player can only be nominated once per day.
  nominatedToday(id) {
    return this.s.nominated.includes(id);
  }

  // The player that can be nominated right now, or an error: an NPC, or
  // you (you can nominate yourself, or ask to be nominated). (Dead players
  // can be nominated too: executing one does nothing, unless it's a Zombuul
  // that only registers as dead.)
  nominee(id) {
    const s = this.s;
    const n = this.player(id);

    if (s.phase !== "day" || s.winner || !n) {
      throw Error("Choose a player.");
    }

    if (this.nominatedToday(id)) {
      throw Error("Already nominated today.");
    }

    if (s.roshambo) {
      throw Error("Throw first.");
    }

    return n;
  }

  // The human nominates a player (once per day): an NPC, or themself.
  // `hand`: whether your hand is up for the vote, or null to wait for you
  // to decide (see castVotes()).
  nominate(id, hand = true) {
    const s = this.s;
    const h = this.human();

    if (!h.alive) {
      throw Error("Dead players cannot nominate. Request a nomination instead.");
    }

    // (The Golem nominates once per game: see golem.js.)
    const golem = this.golemBarred(h);

    if (golem) {
      throw Error(golem);
    }

    // (With the Atheist on the script: see atheist.js.)
    if (id === STORYTELLER) {
      return this.nominateStoryteller(h, hand);
    }

    const n = this.nominee(id);

    if (s.dayNominators.includes(h.id)) {
      throw Error("You have already nominated today.");
    }

    if (wishBarred(s, h)) {
      throw Error("Your wish's price: you can't nominate in the second round.");
    }

    if (n === h) {
      s.publicLog.push(`Day ${s.day} — You nominate yourself.`);
      this.audit("nomination", "You nominated yourself.", { actorId: h.id, targetId: h.id });
    }

    return this.runNomination(h, n, false, hand);
  }

  // The human asks the town for a nomination (of an NPC, themself, or the
  // Storyteller: see atheist.js requestStoryteller()); a living NPC who
  // hasn't nominated today makes it. (A dead human can still do this.)
  // `hand` as for nominate().
  requestNomination(id, hand = true) {
    const s = this.s;

    if (id === STORYTELLER) {
      return this.requestStoryteller(hand);
    }

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

    return this.runNomination(nominator, n, true, hand);
  }

  // Whether you can vote now: alive, or dead with your ghost vote left.
  canVote() {
    const h = this.human();

    return Boolean((h.alive || h.ghost) && !wishBarred(this.s, h));
  }

  // A nomination and its vote. Nobody is executed yet: if at least half the
  // living players vote, and that's more votes than any nomination so far
  // today, the nominee is marked for execution (s.block) instead. A tie with
  // the highest count so far (official rules) leaves nobody marked, and a
  // later nomination must beat that count. Ending the day executes whoever
  // is marked. (`requested`: the human asked for this nomination.)
  //
  // With `hand` null, the vote waits (s.pendingVote) until castVotes() says
  // whether your hand is up, and this returns { pending: true, ... }. (No
  // wait when there's no vote: the Virgin, or a Witch curse ending the
  // game.)
  runNomination(nominator, n, requested = false, hand = true, intro = null) {
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

    // The first nomination of a player claiming the Virgin, in public (see
    // below).
    const virginClaim =
      claimTo(n) === "virgin" && !(s.virginTested ??= []).includes(n.id);

    if (virginClaim) {
      s.virginTested.push(n.id);
    }

    // A working Virgin's first nomination executes a Townsfolk nominator:
    // the town now knows they're the real Virgin (good). (Or so it thinks:
    // a Demon a Wizard's wish gave the Virgin ability does it too.)
    if ((n.role === "virgin" || n.wishGift === "virgin") && !n.virginUsed) {
      n.virginUsed = true;

      if (works(n) && team(nominator.role) === "townsfolk") {
        this.confirm(n, "certain", `their Virgin ability executed ${nominator.label}`);

        const result = this.virgin(n, nominator, base);

        this.countNpcNominations();
        return result;
      }
    }

    // A player claiming a Townsfolk nominated them, and nothing happened:
    // one of the two is lying (or drunk or poisoned).
    if (virginClaim && team(claimTo(nominator)) === "townsfolk") {
      this.failed(
        n,
        `they claim the Virgin, but nothing happened when ${nominator.label} (who claims the ${name(
          claimTo(nominator),
        )}) nominated them`,
      );
      this.failed(
        nominator,
        `they claim the ${name(claimTo(nominator))}, but nominating ${n.label} (who claims the Virgin) did nothing`,
      );
    }

    this.openNominations();

    // The Golem's one nomination: unless they're the Demon, the nominee dies
    // now, and the vote goes on (see characters/outsider/golem.js).
    if (ability(nominator) === "golem" && !nominator.golemUsed) {
      if (!nominator.human && nominator.claim === "golem" && !nominator.cover) {
        this.claimPublicly(nominator);
      }

      this.golemNominates(nominator, n);

      if (s.winner) {
        this.countNpcNominations();
        return base;
      }
    }

    this.nominationReveals(n, intro);

    // (Why good NPCs hold back, or don't: see strategy vote().)
    if (golemHinge(s, n) && this.canVote()) {
      this.audit(
        "workings",
        `${n.label} lived through the Golem's nomination: good NPCs vote for them only if your hand is up (whether to execute them is your call).`,
      );
    } else if (s.mastermindDay === s.day) {
      this.audit(
        "workings",
        `Mastermind's extra day: the evil team votes for ${n.label} unless they're a teammate; good players only if they suspect them.`,
      );
    } else if (n.alive && vortoxRisk(s)) {
      this.audit(
        "workings",
        `The Vortox is on the script and nobody is marked for execution yet (a day with nobody executed may lose): good players vote for ${n.label} unless they trust them, at ${Math.round(VORTOX_VOTE_CHANCE * 100)}% at least.`,
      );
    } else if (n.alive && leviathanRisk(s)) {
      const risk = leviathanRisk(s);

      this.audit(
        "workings",
        risk === "last"
          ? `The Leviathan is in play and it's Day ${s.day} (it wins at dusk unless it's executed), with nobody marked for execution yet: good players vote for ${n.label} unless they trust them, at ${Math.round(LEVIATHAN_LAST_DAY_VOTE_CHANCE * 100)}% at least.`
          : risk === "early"
            ? `The Leviathan is in play and it's Day ${s.day} (a 2nd good execution loses): good NPCs only vote for ${n.label} with strong suspicion (evidence of ${LEVIATHAN_STRONG_EVIDENCE} or more against them).`
            : `The Leviathan is in play and it's Day ${s.day} (it wins after Day 5): good NPCs vote more readily, their usual chance raised by ${Math.round(LEVIATHAN_LATE_VOTE_BONUS * 100)}%.`,
      );
    } else if (!n.alive) {
      this.audit(
        "workings",
        `${n.label} is dead: good players don't vote to execute them${
          s.script.ids.includes("zombuul") ? " (unless they suspect them: the Zombuul might only register as dead)" : ""
        }.`,
      );
    }

    // (Your pick, one execution from the final 3: see strategy vote().)
    if ((nominator.human || requested) && nearFinal(s) && s.mastermindDay !== s.day) {
      this.audit(
        "workings",
        `${this.alive().length} alive, one execution from the final ${finalCount(s)}: good NPCs vote for your pick, ${n.label}, at ${Math.round(
          NEAR_FINAL_HUMAN_VOTE_CHANCE * 100,
        )}% at least, whatever they think of them.`,
      );
    }

    s.pendingVote = { nominatorId: nominator.id, nomineeId: id, requested };

    if (hand === null) {
      return { ...base, needed: this.votesNeeded(), pending: true };
    }

    return this.castVotes(hand);
  }

  // The vote on the pending nomination (see runNomination()), with your
  // hand up or not (`hand`; ignored if you can't vote).
  castVotes(hand = true) {
    const s = this.s;
    const pending = s.pendingVote;

    if (!pending) {
      throw Error("No vote is waiting.");
    }

    s.pendingVote = null;

    // (The Storyteller nominated: see atheist.js.)
    if (pending.storyteller) {
      return this.storytellerVoteCast(pending, pending.intents ? pending.hand : hand);
    }

    const nominator = this.player(pending.nominatorId);
    const n = this.player(pending.nomineeId);
    const id = n.id;
    const base = {
      nominatorId: nominator.id,
      nomineeId: id,
    };
    const needed = this.votesNeeded();
    // (The NPCs' votes stand, if the count has started: see openVote().)
    const records = this.votes(
      n,
      nominator,
      nominator.human || pending.requested,
      hand && this.canVote(),
      pending.intents ?? null,
    );
    const threshold = Math.ceil(this.alive().length / 2);

    // (Executions fail if only evil voted: Legion. Only a vote that would
    // mark the nominee is counted as 0, and the town hears it failed.)
    const hands = records.filter((x) => x.counted).length;
    const failed = this.legionVeto(records, needed);
    const count = records.filter((x) => x.counted).length;

    if (failed) {
      (s.failedExecutions ??= []).push({
        day: s.day,
        nomineeId: id,
        voterIds: records.filter((x) => x.attempted).map((x) => x.playerId),
      });
    }

    // Who nominated and voted for whom is public: good NPCs weigh it. (With
    // the votes it got and needed: see politicianBlame().)
    (s.voteHistory ??= []).push({
      day: s.day,
      nominatorId: nominator.id,
      nomineeId: id,
      voterIds: records.filter((x) => x.attempted).map((x) => x.playerId),
      count,
      needed,
    });
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

    const outcome = failed
      ? "Execution failed"
      : marked
      ? `${n.label} is marked for execution`
      : !enough
        ? "not enough votes"
        : tied
          ? `a tie${leader ? ` with ${leader.label}` : ""}, so nobody is marked`
          : `fewer than the ${previous.count} votes to beat`;

    const result = { ...base, count, threshold, needed, marked, records, failed };

    s.lastVote = result;

    this.audit(
      "vote_result",
      `${nominator.label} nominated ${n.label}: ${count}/${threshold}; ${outcome}.`,
      result,
    );

    // (A failed execution says how many hands went up.)
    const shown = failed ? hands : count;

    s.publicLog.push(
      `Day ${s.day} — ${nominator.label} nominated ${n.label}: ${shown} vote${
        shown === 1 ? "" : "s"
      } (${threshold} needed); ${outcome}.`,
    );

    // (Who still wants to nominate, after this vote.)
    this.countNpcNominations();

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

    // (A Zombuul that only registers as dead isn't really dead.)
    const dead = !living(p);
    // (Whether the Boomdandy has their ability, before dying takes it.)
    const boom = p.role === "boomdandy" && works(p);

    if (!dead) {
      s.lastExecution = p.id;
    }

    s.executedToday = true;
    // (While it's under way, a game it ends was lost by it: see
    // politicianBlame().)
    s.executing = p.id;

    // What happened is added to this line once it's known (see below).
    const line = this.announce(`Day ${s.day} — ${p.label} is executed.`);
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
    // (A Psychopath only dies if they lose roshambo: against you, it waits
    // for your throw. See psychopath.js.)
    const rosh = !advocated && !spared && !dead ? this.psychopathExecuted(p) : null;
    const execution = { line, dead, before, boom, saved: advocated || spared };

    if (rosh === "pending") {
      s.roshambo.execution = execution;
      return;
    }

    this.executionEnds(p, { ...execution, survives: rosh === "survives" });
  }

  // The rest of p's execution: whether they die, and what that does.
  executionEnds(p, { line, dead, before, boom, saved, survives }) {
    const s = this.s;
    const died = !saved && !survives && this.kill(p, "execution");
    const nominatorId = (s.voteHistory ?? []).findLast(
      (x) => x.day === s.day && x.nomineeId === p.id,
    )?.nominatorId;

    if (dead) {
      s.publicLog[line] += " And nothing happens because they are already dead.";
    } else if (!died) {
      s.publicLog[line] += " But does not die.";

      // (A Psychopath's roshambo explains it.)
      if (!survives) {
        this.survivedExecution(p);
      }
    }

    if (died) {
      this.minstrel(p);
      this.cannibals(p);
    }

    // (Executed, dead or not: a Goblin who claimed it today, or the
    // Fearmonger's chosen player whom they nominated, ends the game.)
    const lost = !dead && (this.goblinWins(p) || this.fearmongerWins(p, nominatorId));

    // (goodTwinExecuted() ends the game if the good twin was executed.)
    if (lost) {
      s.executing = null;
      return;
    }

    // (With the Leviathan in play, a second good execution wins for evil:
    // see leviathan.js.)
    if (this.leviathanExecuted(p, nominatorId, died)) {
      s.executing = null;
      return;
    }

    if (died && p.role === "saint") {
      this.finish("evil", "Saint executed.");
    } else if (died && isDemon(p)) {
      this.successor(p, before, false, true);
    } else if (died && boom && s.mastermindDay !== s.day) {
      // (On the Mastermind's extra day, the execution decides the game
      // instead: see mastermindEnd().)
      this.boom(p);
    } else if (died && !this.goodTwinExecuted(p)) {
      this.check();
    }

    s.executing = null;
  }

  // Ends the day: whoever is marked for execution is executed; with nobody
  // marked, nobody is (and the Vortox or a Mayor may decide the game).
  endDay() {
    const s = this.s;

    if (s.phase !== "day" || s.winner) {
      throw Error("Cannot end day.");
    }

    if (s.pendingVote) {
      throw Error("Finish the vote first.");
    }

    if (s.boom) {
      throw Error("Point at a player first.");
    }

    if (s.roshambo) {
      throw Error("Throw first.");
    }

    this.audit("end_day", `You ended Day ${s.day}.`);

    const from = s.publicLog.length;

    // (Any Gossip yet to speak today does so now.)
    this.npcGossips(true);

    const p = this.marked();

    s.block = null;

    // (With their Demon about to be executed, a Minion guesses the Damsel
    // first: a last chance. Right, and evil wins before the execution.)
    if (p && isDemon(p) && p.alignment === "evil") {
      this.npcDamselGuesses(p);

      if (s.winner) {
        this.phaseCard("dusk", from);
        return;
      }
    }

    if (!p) {
      this.announce(`Day ${s.day} — Nobody was executed.`);
    }

    if (p) {
      this.execute(p);

      // (Your roshambo against a Psychopath waits for your throw: see
      // roshambo(), which ends the day.)
      if (s.roshambo) {
        s.roshambo.from = from;
        return;
      }
    }

    this.dayEnds(p, from);
  }

  // The day's end, once its execution (of p, if anyone) is done.
  dayEnds(p, from) {
    const s = this.s;

    if (p) {
      // (The Boomdandy's countdown waits for you: see boomPoint().)
      if (s.boom) {
        this.phaseCard("dusk", from);
        return;
      }
    }

    // A Wizard's wish for a second execution: nominations open again (see
    // wizard.js secondRound()), and the day ends after that round.
    if (this.secondRound(from)) {
      return;
    }

    // (After Day 5, the Leviathan wins: see leviathan.js.)
    if (this.leviathanDusk()) {
      this.phaseCard("dusk", from);
      return;
    }

    if (p) {
      // (Executed: the checks below are for a day without one.)
    } else if (this.vortoxDay()) {
      this.phaseCard("dusk", from);
      return;
    } else if (this.alive().length === 3 && !s.executedToday) {
      // ("Your team wins": a Mayor the Mezepheles turned evil wins for evil.)
      const mayor = s.players.find((x) => x.alive && ability(x) === "mayor" && works(x));

      if (mayor) {
        this.finish(mayor.alignment, "Mayor final-three victory.");
      } else {
        // (Anyone claiming the Mayor isn't one: see lunaticReveals().)
        s.mayorFailed = s.day;
      }
    }

    this.mastermindEnd(p);
    this.phaseCard("dusk", from);

    if (!s.winner) {
      s.night++;
      this.night();
    }
  }

  // ── Demon succession & game end ───────────────────────────

  // The Scarlet Woman takes over if 5+ players were alive; on an Imp
  // self-kill, any living minion can take over instead. The new Demon is the
  // same character as the old one. With no successor, good wins, unless the
  // Demon was `executed` while the Mastermind lives.
  successor(dead, before, self, executed = false) {
    // A Zombuul that only registers as dead isn't dead, and another Demon
    // (Legion) carries on.
    if (dead.undead || this.s.players.some((x) => x !== dead && living(x) && isDemon(x))) {
      this.check();
      return;
    }

    // (Lil' Monsta died with its babysitter: only the Scarlet Woman's jinx
    // saves it, see lilmonsta.js. Nobody becomes a copy of their Minion.)
    if (dead.babysitting) {
      if (this.lilMonstaSuccessor(dead, before)) {
        this.check();
        return;
      }

      // (Dead with them: nobody babysits it again, see lilMonsta().)
      this.s.lilMonsta.dead = true;

      if (!(executed && this.mastermindContinues())) {
        this.finish("good", "Lil' Monsta's babysitter died.");
      }

      return;
    }

    let next =
      before >= 5
        ? this.s.players.find((x) => x.role === "scarletwoman" && works(x))
        : null;

    if (!next && self && dead.role === "imp") {
      next = this.s.players.find(
        (x) => x.alive && team(x.role) === "minion",
      );
    }

    if (next) {
      // (For the Al-Hadikhia's jinx with her: see alhadikhia.js.)
      if (next.role === "scarletwoman") {
        next.wasScarletWoman = true;
      }

      next.role = dead.role;
      next.alignment = "evil";

      this.audit("succession", `${next.label} became ${name(dead.role)}.`, {
        playerId: next.id,
        previousDemonId: dead.id,
      });
    } else if (!(executed && this.mastermindContinues(dead))) {
      this.finish("good", "Demon died.");
    }
  }

  // A Zombuul that registers as dead still counts as alive here. On the
  // Mastermind's extra day, only the day's execution decides the game.
  // (With the Atheist in play there's no Demon to die: see atheist.js.)
  check() {
    const alive = this.s.players.filter(living);

    if (this.s.mastermindDay) {
      return;
    }

    if (!alive.some(isDemon) && !this.s.atheist) {
      this.finish("good", this.s.lilMonsta ? "Lil' Monsta's babysitter died." : "No Demon remains.");
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

    // (The Heretic turns the result around; then a Politician who lost it
    // for their team joins the winners.)
    ({ winner, reason } = this.hereticFlip(winner, reason));
    this.politicianEnd(winner);

    this.s.winner = winner;
    this.s.reason = reason;
    this.s.phase = "over";

    this.audit(
      "game_over",
      `${winner.toUpperCase()}: ${reason}`,
      {},
      "Game Over",
    );

    this.refreshSuspicions();
    this.snapshot("Game Over");
  }

  // Records every player's full state (and what they learned tonight) for
  // the debug log.
  snapshot(group) {
    const s = this.s;
    // (Tonight's information is only listed once: the Game Over table
    // leaves it out if tonight's table already has it.)
    const listed = Boolean(group) && s.snapshotNight === s.night;

    if (!group) {
      s.snapshotNight = s.night;
    }

    const players = s.players.map((p) => {
      // (A Philosopher whose choice failed only thinks they gained it: see
      // philosopherGain(). They're "drunk" for it, but the table says so in
      // their character.)
      const failed = p.drunkFrom === "philosopher" && p.gained && p.role === "philosopher";

      return {
        seat: p.seat,
        label: p.label,
        role: p.role,
        shown: p.shown,
        gained: p.gained,
        cannibal: p.cannibal,
        gainFailed: Boolean(failed),
        // (While mad: the claim they had, and go back to.)
        claim: p.mad?.previous ?? p.claim,
        // (That claim, with what it says they have since: "Alchemist",
        // "Fearmonger". See log.js claimChain().)
        claims: claimChain({ ...p, cover: null, claim: p.mad?.previous ?? p.claim }),
        alchemist: p.alchemist ?? null,
        cover: p.cover ? { kind: p.cover.kind, as: p.cover.as } : null,
        mad: p.mad?.role ?? null,
        alignment: p.alignment,
        alive: p.alive,
        drunk: failed ? Boolean(p.drunkTonight) : isDrunk(p),
        poisoned: p.poisoned,
        // (A Lleech's host is poisoned by it: the table says "Lleech's host".)
        host: Boolean(this.lleechOf(p)),
        babysitting: Boolean(p.babysitting),
        protected: p.protected,
        suspects: p.human ? null : (this.player(p.suspicion?.targetId)?.label ?? null),
        why: p.human ? [] : (p.suspicion?.reasons ?? []),
        score: p.human ? null : (p.suspicion?.score ?? null),
        used: abilityUsed(p, ability(p)),
        info: p.memories
          .filter((m) => !listed && !m.day && m.night === s.night)
          .map(
            (m) => `${m.text}${m.misinfo ? ` (misinformation: ${m.misinfo})` : ""}`,
          ),
      };
    });

    this.audit(
      "state",
      "Player states",
      {
        players,
        scapegoat: s.scapegoat ?? null,
        scapegoatWhy: s.scapegoatWhy ?? null,
        lean: leanText(s),
        clues: this.clues(listed),
      },
      group,
    );
  }

  // For log.txt, under each player table: what could lead the town to the
  // evil team since the last table.
  // - Tonight's true information (a good player's, working) that points at
  //   an evil player: "Player 8 (Fortune Teller): ... points at Player 2
  //   (the Imp)."
  // - Each living evil player claiming a character a good player really
  //   has (or thinks they have): one of the two is lying.
  // - Each lie an evil NPC told you (see strategy lied()). (A good player's
  //   cover story isn't a clue.)
  // (`listed`: tonight's information is already in an earlier table.)
  clues(listed = false) {
    const s = this.s;
    const lines = [];
    const evil = (x) => x?.alignment === "evil";
    const as = (x) => `${x.label} (the ${name(x.role)})`;

    for (const p of s.players.filter((x) => x.alignment === "good" && !listed)) {
      for (const m of p.memories) {
        const tonight = m.day ? m.day === s.day : m.night === s.night;

        if (!tonight || m.functioning === false) {
          continue;
        }

        const named = (m.targets ?? [])
          .map((id) => this.player(id))
          .filter((x) => evil(x) && stanceOn(s, m, x, p) !== "trust");

        if (named.length) {
          lines.push(
            `${p.label} (${name(p.role)}): "${m.text}" points at ${named.map(as).join(", ")}.`,
          );
        }
      }
    }

    for (const x of s.players.filter((y) => y.alive && evil(y) && !y.human)) {
      const holder = s.players.find(
        (y) => y !== x && y.alignment === "good" && y.shown === x.claim,
      );

      if (holder) {
        lines.push(
          `${as(x)} claims the ${name(x.claim)}, which ${holder.human ? "you" : holder.label} ${
            holder.role !== holder.shown
              ? holder.human ? "think you are" : "thinks they are"
              : holder.human ? "really are" : "really is"
          }${holder.alive ? "" : " (dead)"}.`,
        );
      }
    }

    const lies = s.liesToYou ?? [];

    for (const lie of lies.slice(s.cluesLies ?? 0)) {
      const by = this.player(lie.byId);

      if (!evil(by)) {
        continue;
      }

      lines.push(
        `Day ${lie.day}: ${as(by)} lied to you: ${
          lie.kind === "fake" ? "faked coming clean as" : "said they're"
        } the ${name(lie.said)}.`,
      );
    }

    s.cluesLies = lies.length;

    return lines;
  }

  // Every NPC, alive or dead, reconsiders who they suspect (for the log,
  // and a dead player's ghost vote).
  refreshSuspicions() {
    for (const p of this.s.players.filter((x) => !x.human)) {
      this.strat.suspicion(this.s, p);
    }
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
    // (Not the per-conversation workings: those are for log.txt.)
    const events = this.s.audit.filter(
      (e) => e.type !== "state" && e.type !== "workings",
    );

    return {
      winner: this.s.winner,
      reason: this.s.reason,
      script: this.s.script.meta.name,
      seats: this.s.seats,
      seed: this.s.seed,
      twins: this.s.twins,
      bluffs: this.s.demonBluffs ?? [],
      // (The Fortune Teller's red herring, if anyone had their ability: see
      // app.js playerNotes().)
      red: this.s.players.some((p) =>
        [p.role, p.startRole, p.shown, p.gained].includes("fortuneteller"),
      )
        ? (this.s.red ?? null)
        : null,
      players: this.s.players,
      events,
      keyMoments: events.filter((e) => KEY_MOMENT_TYPES.has(e.type)),
      lies: this.s.liesToYou ?? [],
    };
  }
}

// Shared ability mechanics and each character's own (see abilities.js and
// characters/).
Object.assign(Engine.prototype, abilities, ...Object.values(characters));
