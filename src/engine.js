import { ARTIST_QUESTIONS, name, team } from "./data.js";
import {
  nightInfo,
  ability,
  works,
  ravenInfo,
  monkInfo,
  gamblerInfo,
  artistInfo,
} from "./storyteller.js";
import { SimpleStrategy } from "./strategy.js";
import { pick } from "./util.js";

const KEY_MOMENT_TYPES = new Set([
  "poison",
  "monk",
  "demon",
  "death",
  "succession",
  "slayer",
  "virgin",
  "gambler",
  "fool",
  "moonchild",
  "assassin",
  "advocate",
  "game_over",
]);

export class Engine {
  constructor(s, strat = new SimpleStrategy()) {
    this.s = s;
    this.strat = strat;
  }

  player(id) {
    return this.s.players.find((x) => x.id === id);
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
      this.s.publicLog.push(`Day ${info.day} — You received: ${info.text}`);
    } else if (p.human) {
      this.s.privateLog.push(`Night ${info.night}: ${info.text}`);
      this.s.publicLog.push(
        `Day ${info.night} — Night ${info.night}: You received: ${info.text}`,
      );
    }
  }

  // ── Night ──────────────────────────────────────────────────

  start() {
    this.night();
    return this.s;
  }

  night() {
    const s = this.s;

    if (s.winner) {
      return;
    }

    s.phase = "night";

    s.players.forEach((x) => {
      x.protected = false;
      x.poisoned = false;
    });

    const poisoner = s.players.find((x) => x.alive && x.role === "poisoner");

    if (poisoner) {
      const t = this.strat.poison(s);

      if (t) {
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

    this.advocate();

    if (s.night > 1) {
      for (const m of s.players.filter(
        (x) => x.alive && ability(x) === "monk",
      )) {
        const t = this.strat.monk(s, m);

        if (t) {
          const effective = works(m);

          if (effective) {
            t.protected = true;
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

      if (!s.winner) {
        this.demon();
      }

      if (!s.winner) {
        this.assassin();
      }
    }

    if (s.winner) {
      return;
    }

    for (const p of s.players) {
      const info = nightInfo(s, p, this.strat);

      if (info) {
        this.remember(p, info);
      }
    }

    this.bluffs();

    s.day = s.night;
    s.phase = "day";
    s.talkDay = s.day;
    s.talked = [];

    s.publicLog.push(
      `Day ${s.day}: ${this.alive().length} alive; talk to ${this.talkLimit()} distinct players.`,
    );

    this.audit("day", `Day ${s.day} began.`);

    this.npcShots();
    this.npcArtists();
  }

  // ── Night actions: Everyone Can Play ──────────────────────

  // The Devil's Advocate picks someone (not last night's pick) who survives
  // execution tomorrow.
  advocate() {
    const s = this.s;
    const lastId = s.advocate?.targetId ?? null;
    const da = s.players.find((x) => x.alive && x.role === "devilsadvocate");

    s.advocate = null;

    if (!da) {
      return;
    }

    const t = this.strat.advocate(s, da, lastId);

    if (!t) {
      return;
    }

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
      (x) => x.alive && x.role === "assassin" && !x.assassinUsed,
    );

    if (!a) {
      return;
    }

    const t = this.strat.assassin(s, a);

    if (!t) {
      return;
    }

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

    p.claimKnown = true;

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
          artistInfo(s, ask.target, ask.question, works(p) ? "truth" : "random"),
        );
      } else {
        const spy = p.role === "spy" && works(p);

        this.rememberBluff(
          p,
          artistInfo(s, ask.target, ask.question, spy ? "truth" : "lie"),
        );
      }
    }
  }

  // Evil NPCs gather night info to report for the role they are bluffing.
  bluffs() {
    const s = this.s;

    for (const p of s.players) {
      if (p.human || !p.alive || p.alignment !== "evil") {
        continue;
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
    const d = s.players.find((x) => x.alive && x.role === "imp");

    if (!d) {
      this.finish("good", "No Demon remains.");
      return;
    }

    let t = this.strat.demon(s, d);

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

    let outcome = "killed";
    let detail = "";

    if (t.role === "soldier" && works(t)) {
      outcome = "blocked";
      detail = "blocked by the Soldier ability";
    } else if (t.protected) {
      outcome = "blocked";
      detail = "blocked by Monk protection";
    } else if (t.role === "mayor" && works(t)) {
      const alt = pick(
        s.players.filter(
          (x) => x.alive && !x.human && x.id !== t.id && x.id !== d.id,
        ),
        s.r,
      );

      if (alt) {
        t = alt;
        outcome = "redirected";
        detail = `redirected to ${t.label}`;
      }
    }

    if (outcome !== "blocked" && this.foolSaves(t, "demon")) {
      outcome = "fool";
      detail = `${t.label} survived as the Fool`;
    }

    const result = outcome === "killed" ? `${t.label} was killed` : detail;

    this.audit(
      "demon",
      `${d.label} (${name(d.role)}) chose ${original.label}; attack ${result}.`,
      {
        actorId: d.id,
        targetId: original.id,
        actualTargetId: t.id,
        outcome,
      },
    );

    if (outcome !== "blocked") {
      if (this.kill(t, "demon")) {
        this.grandmother(t);
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

    p.alive = false;
    p.death = cause;

    this.audit("death", `${p.label} died: ${cause}.`, {
      playerId: p.id,
      cause,
    });

    this.s.publicLog.push(`${p.label} died.`);

    if (cause === "demon" && ability(p) === "ravenkeeper") {
      const t = this.strat.raven(this.s, p);

      if (t) {
        this.remember(p, ravenInfo(this.s, p, t));
      }
    } else if (
      cause === "demon" &&
      p.alignment === "evil" &&
      p.claim === "ravenkeeper"
    ) {
      // An evil Ravenkeeper bluffer "learns" a character too; only the Spy's is true.
      const t = this.strat.raven(this.s, p);

      if (t) {
        this.rememberBluff(p, ravenInfo(this.s, p, t, p.role !== "spy"));
      }
    }

    if (
      !p.human &&
      (p.role === "moonchild" ||
        (p.alignment === "evil" && p.claim === "moonchild"))
    ) {
      this.moonchild(p);
    }

    return true;
  }

  // ── Day ────────────────────────────────────────────────────

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

    const response = this.strat.ask(s, p);

    p.talks.push({
      day: s.day,
      response,
    });

    s.publicLog.push(
      `Day ${s.day} — ${p.label} claimed ${name(p.claim)}: ${response}`,
    );

    this.audit(
      "conversation",
      `${p.label} claimed ${name(p.claim)}: ${response}`,
      { target: id },
    );

    return response;
  }

  votes(n) {
    const s = this.s;
    const intents = new Map();

    const records = s.players.map((v) => {
      const eligible = v.alive || v.ghost;

      let attempted =
        eligible && (v.human || this.strat.vote(s, v, n));

      if (v.alignment === "evil" && n.alignment === "evil") {
        attempted = false;
      }

      intents.set(v.id, attempted);

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

  nominate(id) {
    const s = this.s;
    const n = this.player(id);
    const h = this.human();

    if (s.phase !== "day" || s.winner || !n?.alive || n.human) {
      throw Error("Choose a living NPC.");
    }

    if (!h.alive) {
      throw Error("Dead players cannot nominate.");
    }

    // A working Virgin's first nomination executes a Townsfolk nominator.
    if (n.role === "virgin" && !n.virginUsed) {
      n.virginUsed = true;

      if (works(n) && team(h.role) === "townsfolk") {
        return this.virgin(n, h);
      }
    }

    const records = this.votes(n);
    const count = records.filter((x) => x.counted).length;
    const threshold = Math.ceil(this.alive().length / 2);
    const executed = count >= threshold;

    const result = {
      nomineeId: id,
      count,
      threshold,
      executed,
      records,
    };

    s.lastVote = result;

    this.audit(
      "vote_result",
      `${n.label}: ${count}/${threshold}; ${
        executed ? "executed" : "vote failed"
      }.`,
      result,
    );

    s.publicLog.push(
      `Day ${s.day} — Vote on ${n.label} ${
        executed ? "passed" : "failed"
      }: ${count}/${threshold}; ${executed ? "execution" : "no execution"}.`,
    );

    if (executed) {
      const before = this.alive().length;

      s.lastExecution = id;

      // The Devil's Advocate's pick (or a Fool) is executed but doesn't die.
      const advocated = this.advocated(n);

      if (advocated) {
        this.audit(
          "advocate",
          `${n.label} was executed but survived (Devil's Advocate).`,
          { playerId: n.id },
        );
      }

      const died = !advocated && this.kill(n, "execution");

      if (died && n.role === "saint") {
        this.finish("evil", "Saint executed.");
      } else if (died && n.role === "imp") {
        this.successor(n, before, false);
      } else if (died) {
        this.check();
      }

      if (!s.winner) {
        s.night++;
        this.night();
      }
    }

    return result;
  }

  virgin(n, h) {
    const s = this.s;

    s.lastExecution = h.id;
    s.lastVote = null;

    this.audit(
      "virgin",
      `${h.label} nominated ${n.label} (${name(n.role)}) and was executed.`,
      { actorId: h.id, targetId: n.id },
    );

    s.publicLog.push(
      `Day ${s.day} — You nominated ${n.label} and were executed immediately.`,
    );

    if (!this.advocated(h)) {
      this.kill(h, "execution");
      this.check();
    }

    if (!s.winner) {
      s.night++;
      this.night();
    }

    return {
      nomineeId: n.id,
      count: 0,
      threshold: 0,
      executed: false,
      virgin: true,
      records: [],
    };
  }

  endDay() {
    if (this.s.phase !== "day" || this.s.winner) {
      throw Error("Cannot end day.");
    }

    if (
      this.alive().length === 3 &&
      this.human().role === "mayor" &&
      works(this.human())
    ) {
      this.finish("good", "Mayor final-three victory.");
    } else {
      this.s.night++;
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

    return this.shoot(p, t);
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

    const info = artistInfo(s, t, question, works(h) ? "truth" : "random");

    this.remember(h, info);

    return info.text;
  }

  // Resolves a Slayer shot; only a working Slayer can kill, and only the
  // Imp (or the Recluse, who registers as one).
  shoot(p, t) {
    if (
      ability(p) === "slayer" &&
      works(p) &&
      (t.role === "imp" || t.role === "recluse")
    ) {
      const before = this.alive().length;

      this.kill(t, "slayer");

      if (t.role === "imp") {
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
      p.claimKnown = true;

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
  // self-kill, any living minion can take over instead.
  successor(dead, before, self) {
    let next =
      before >= 5
        ? this.s.players.find((x) => x.alive && x.role === "scarletwoman")
        : null;

    if (!next && self) {
      next = this.s.players.find(
        (x) => x.alive && team(x.role) === "minion",
      );
    }

    if (next) {
      next.role = "imp";
      next.alignment = "evil";

      this.audit("succession", `${next.label} became Imp.`, {
        playerId: next.id,
        previousDemonId: dead.id,
      });
    } else {
      this.finish("good", "Demon died.");
    }
  }

  check() {
    if (!this.s.players.some((x) => x.alive && x.role === "imp")) {
      this.finish("good", "No Demon remains.");
    } else if (this.alive().length <= 2) {
      this.finish("evil", "Two alive remain.");
    }
  }

  finish(winner, reason) {
    this.s.winner = winner;
    this.s.reason = reason;
    this.s.phase = "over";

    this.audit(
      "game_over",
      `${winner.toUpperCase()}: ${reason}`,
      {},
      "Game Over",
    );
  }

  reveal() {
    if (!this.s.winner) {
      return null;
    }

    const events = this.s.audit.filter(
      (e) => !["vote", "vote_result"].includes(e.type),
    );

    return {
      winner: this.s.winner,
      reason: this.s.reason,
      players: this.s.players,
      events,
      keyMoments: events.filter((e) => KEY_MOMENT_TYPES.has(e.type)),
    };
  }
}
