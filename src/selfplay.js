// Self-play, for testing only: something makes your choices for you, so a
// whole game can be watched (open the page with ?selfplay, see app.js) or
// played out headless (play()). Its decisions are simple: night picks are
// random, it asks NPCs until it runs out of conversations, uses any day
// ability once it can, and nominates and votes for whoever the town suspects
// most. They draw from their own seeded RNG, not s.r, so a game you play by
// hand and one played for you share the same deal. Every decision is logged
// ("selfplay" in log.txt).
import { name, ARTIST_QUESTIONS, HUMAN_ARTIST_QUESTIONS, ATHEIST_VOTE_BELIEF } from "./data.js";
import { canPick } from "./engine.js";
import { ability, wishBarred } from "./storyteller.js";
import { AMNESIAC_GUESSES } from "./characters/townsfolk/amnesiac.js";
import { STORYTELLER } from "./characters/townsfolk/atheist.js";
import { rng, pick, sample, claimTo } from "./util.js";

// How likely self-play is to use an optional night ability (the Seamstress,
// Courtier, Philosopher, Huntsman or Professor) on any night it can.
const SELF_PLAY_OPTIONAL_CHANCE = 0.5;

const THROWS = ["rock", "paper", "scissors"];

export class SelfPlay {
  constructor(e) {
    this.e = e;
    this.r = rng(`${e.s.seed}:selfplay`);
    // What it's done today (so a day ability or nomination that failed
    // isn't tried again).
    this.day = null;
    this.done = new Set();
  }

  note(text, data = {}) {
    this.e.audit("selfplay", `Self-play: ${text}`, data);
  }

  // What it's done today, cleared each new day.
  today() {
    if (this.day !== this.e.s.day) {
      this.day = this.e.s.day;
      this.done.clear();
    }

    return this.done;
  }

  // Once per day: true the first time `key` is asked about today.
  once(key) {
    if (this.today().has(key)) {
      return false;
    }

    this.done.add(key);
    return true;
  }

  // How many living NPCs suspect each player (their suspicion.targetId).
  heat() {
    const counts = new Map();

    for (const x of this.e.s.players) {
      const id = x.alive && !x.human ? x.suspicion?.targetId : null;

      if (id) {
        counts.set(id, (counts.get(id) ?? 0) + 1);
      }
    }

    return counts;
  }

  // The living NPC the town suspects most (ties broken at random), or any
  // living NPC if nobody suspects anyone. `ok` filters who it can be.
  suspect(ok = () => true) {
    const heat = this.heat();
    const pool = this.e.s.players.filter((x) => x.alive && !x.human && ok(x));
    const top = Math.max(0, ...pool.map((x) => heat.get(x.id) ?? 0));

    return pick(
      pool.filter((x) => (heat.get(x.id) ?? 0) === top),
      this.r,
    );
  }

  // Whether they've told you they're the Saint (executing them would lose
  // the game, if it's true).
  saint(x) {
    return claimTo(x, this.e.human()) === "saint";
  }

  // Whether your hand goes up for `nomineeId`: never for yourself; always
  // for your own nomination (`yours`); otherwise for the town's top suspects
  // (at least half as suspected as the most suspected player), but never
  // for someone who told you they're the Saint, and a dead player's one
  // ghost vote only for the top suspect.
  hand(nomineeId, yours = false) {
    const e = this.e;

    // (The Storyteller: as the Atheist, for your own nomination, or if you
    // believe an Atheist claim as a good NPC would. See
    // characters/townsfolk/atheist.js, strategy atheistBelief().)
    if (nomineeId === STORYTELLER) {
      const belief = e.strat.atheistBelief(e.s, e.human())?.belief ?? 0;
      const up = e.canVote() && (yours || e.human().shown === "atheist" || belief >= ATHEIST_VOTE_BELIEF);

      this.note(`hand ${up ? "up" : "down"} for the Storyteller (belief ${Math.round(belief * 100)}%).`);

      return up;
    }

    const n = e.player(nomineeId);
    const heat = this.heat();
    const top = Math.max(0, ...heat.values());
    const mine = heat.get(nomineeId) ?? 0;
    const up =
      !n.human &&
      e.canVote() &&
      (yours ||
        (mine > 0 &&
          !this.saint(n) &&
          (e.human().alive ? mine * 2 >= top : mine === top)));
    const why = n.human
      ? "you"
      : !e.canVote()
        ? "no vote left"
        : yours
          ? "your nomination"
          : this.saint(n)
            ? "they told you they're the Saint"
            : `${mine} of the town suspect them`;

    this.note(`hand ${up ? "up" : "down"} for ${n.label} (${why}).`);

    return up;
  }

  // Tonight's choice (s.pending): { ids, character }. Random picks among
  // whoever the ability allows, other players first.
  nightChoice() {
    const s = this.e.s;
    const c = s.pending;

    if (c.optional && this.r() >= SELF_PLAY_OPTIONAL_CHANCE) {
      this.note(`skipped the ${name(c.role)}'s ability tonight.`);
      return { ids: [], character: null };
    }

    // (As the Engineer: the Demon or the Minions, at random. See
    // settle().)
    if (c.engineer) {
      const kind = c.engineer.minions.length && (!c.engineer.demons.length || this.r() < 0.5) ? "minions" : "demon";
      const roles = kind === "demon" ? [pick(c.engineer.demons, this.r)] : sample(c.engineer.minions, c.engineer.count, this.r);

      this.note(`chose to make the ${kind === "demon" ? "Demon" : "Minions"} ${roles.map(name).join(" and ")} (Engineer).`);
      return { ids: [], character: null, engineer: { kind, roles } };
    }

    if (c.characters) {
      const character = pick(c.characters, this.r);

      // (The Al-Hadikhia chose you: to live or die.)
      this.note(
        c.liveOrDie ? `chose to ${character} (Al-Hadikhia).` : `chose the ${name(character)} (${name(c.role)}).`,
      );
      return { ids: [], character };
    }

    const pool = s.players.filter((x) => canPick(c, x) && !c.exclude?.includes(x.id));
    const others = pool.filter((x) => !x.human);
    const picks = sample(others.length >= c.count ? others : pool, c.count, this.r);

    this.note(
      `chose ${picks.map((x) => x.label).join(" and ")} (${name(c.role)}).`,
      { targetIds: picks.map((x) => x.id) },
    );

    return { ids: picks.map((x) => x.id), character: null };
  }

  // A throw against the Psychopath.
  roshambo() {
    const t = pick(THROWS, this.r);

    this.note(`threw ${t} against the Psychopath.`);
    return t;
  }

  // Who you point at in the Boomdandy's countdown.
  boomPoint() {
    const t = this.suspect();

    this.note(`pointed at ${t?.label ?? "nobody"}.`);
    return t?.id ?? null;
  }

  // The next thing to do by day, or null at night or once the game is over:
  //   { kind: "ask", id }         ask an NPC
  //   { kind: "tell", id }        tell an NPC you asked that you're the Atheist
  //   { kind: "ability", run }    use a day ability (run() calls the engine)
  //   { kind: "open" }            start nominations
  //   { kind: "nominate", id }    your nomination (or, dead, your request)
  //   { kind: "npc" }             the next NPC nomination
  //   { kind: "end" }             end the day
  next() {
    const e = this.e;
    const s = e.s;
    const h = e.human();

    if (s.winner || s.phase !== "day" || s.pending || s.pendingVote) {
      return null;
    }

    if (!s.nominationsOpen) {
      // (As the Atheist, you tell everyone you ask that you are: each once a
      // day, so one you couldn't tell doesn't stop you telling the rest.)
      const told =
        h.shown === "atheist" &&
        s.talked.find((id) => !(s.toldToday ?? []).includes(id) && !this.today().has(`tell:${id}`));

      if (told && this.once(`tell:${told}`)) {
        this.note(`told ${e.player(told).label} you're the Atheist.`);
        return { kind: "tell", id: told };
      }

      const asked = e.talkStatus();
      const t = asked.remaining
        ? pick(
            s.players.filter(
              (x) =>
                x.alive && !x.human && !s.talked.includes(x.id) && !this.today().has(`ask:${x.id}`),
            ),
            this.r,
          )
        : null;

      if (t && this.once(`ask:${t.id}`)) {
        this.note(`asked ${t.label}.`);
        return { kind: "ask", id: t.id };
      }

      const run = this.dayAbility();

      if (run) {
        return { kind: "ability", run };
      }

      this.note("started nominations.");
      return { kind: "open" };
    }

    // (Not someone who told you they're the Saint, unless there's nobody
    // else.)
    const t =
      this.suspect((x) => !e.nominatedToday(x.id) && !this.saint(x)) ??
      this.suspect((x) => !e.nominatedToday(x.id));
    const canNominate = h.alive
      ? !s.dayNominators.includes(h.id) && !wishBarred(s, h)
      : true;
    // (A Wizard's wish can open a second round of nominations today.)
    const round = s.secondRound?.open && s.secondRound.day === s.day ? 2 : 1;

    // (As the Atheist, you nominate the Storyteller once enough NPCs would
    // vote for it.)
    if (
      h.shown === "atheist" &&
      !e.storytellerBarred(h) &&
      e.strat.believers(s).length + 1 >= e.storytellerNeeded() &&
      this.once("storyteller")
    ) {
      this.note("nominated the Storyteller.");
      return { kind: "nominate", id: STORYTELLER };
    }

    if (t && canNominate && this.once(`nominate:${round}`)) {
      this.note(`${h.alive ? "nominated" : "asked for a nomination of"} ${t.label}.`, {
        targetId: t.id,
      });
      return { kind: "nominate", id: t.id };
    }

    if (s.npcWanting) {
      return { kind: "npc" };
    }

    this.note("ended the day.");
    return { kind: "end" };
  }

  // A day ability you can use now, once per day: a function that uses it
  // (and returns what you learn), or null. (Never the Alchemist's Minion
  // abilities: the Psychopath's kill, the Wizard's wish, the Goblin's
  // self-nomination.)
  dayAbility() {
    const e = this.e;
    const s = e.s;
    const h = e.human();
    const role = ability(h);

    if (!h.alive) {
      return null;
    }

    const t = this.suspect();
    const question = (list = ARTIST_QUESTIONS) => pick(Object.keys(list), this.r);
    const uses = {
      savant: h.savantDay !== s.day && (() => e.savant()),
      fisherman: !h.fishermanUsed && (() => e.fisherman()),
      puzzlemaster: !h.puzzleUsed && t && (() => e.puzzlemaster(t.id)),
      slayer: !s.slayerUsed && t && (() => e.slay(t.id)),
      artist: !h.artistUsed && t && (() => e.artist([t.id], question(HUMAN_ARTIST_QUESTIONS))),
      gossip: h.gossipDay !== s.day && t && (() => e.gossip(t.id, question())),
      amnesiac:
        e.amnesiacOpen() &&
        (() => e.amnesiac(pick(Object.keys(AMNESIAC_GUESSES), this.r))),
    };
    const use = uses[role];

    if (!use || !this.once(`ability:${role}`)) {
      return null;
    }

    this.note(`used the ${name(role)}'s ability.`);
    return use;
  }

  // Settles anything waiting on you now: a night choice, a throw, a point.
  // True if there was something.
  settle() {
    const e = this.e;
    const s = e.s;

    if (s.boom) {
      e.boomPoint(this.boomPoint());
      return true;
    }

    if (s.roshambo) {
      e.roshambo(this.roshambo());
      return true;
    }

    if (s.pending) {
      const { ids, character, engineer } = this.nightChoice();

      if (engineer) {
        e.engineerChoose(engineer.kind, engineer.roles);
      } else {
        e.choose(ids, character);
      }

      return true;
    }

    return false;
  }

  // One step of the game, synchronously (votes cast at once). False once
  // there's nothing left to do.
  step() {
    const e = this.e;
    const s = e.s;

    if (s.winner) {
      return false;
    }

    if (this.settle()) {
      return true;
    }

    const a = this.next();

    if (!a) {
      return false;
    }

    try {
      if (a.kind === "ask") {
        e.ask(a.id);
      } else if (a.kind === "tell") {
        e.tell(a.id, "atheist");
      } else if (a.kind === "ability") {
        a.run();
      } else if (a.kind === "open") {
        e.openNominations();
      } else if (a.kind === "nominate") {
        // (A Golem who has nominated asks instead: see golem.js.)
        if (e.human().alive && !e.golemBarred(e.human())) {
          e.nominate(a.id, this.hand(a.id, true));
        } else {
          e.requestNomination(a.id, this.hand(a.id, true));
        }
      } else if (a.kind === "npc") {
        if (e.npcNomination() && s.pendingVote) {
          e.castVotes(this.hand(s.pendingVote.nomineeId));
        }
      } else {
        e.endDay();
      }
    } catch (err) {
      // (An ability or nomination that isn't allowed now is skipped: it's
      // tried at most once a day.)
      this.note(`couldn't: ${err.message}`);
    }

    return true;
  }

  // Plays the game to the end (or `steps` steps), headless.
  play(steps = 2000) {
    for (let k = 0; k < steps && this.step(); k++);

    return this.e.s;
  }
}
