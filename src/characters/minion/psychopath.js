import { name, PSYCHOPATH_KILL_CHANCE, ROSHAMBO } from "../../data.js";
import { isDemon, works, minionAbility, minionLabel } from "../../storyteller.js";
import { pick } from "../../util.js";

const THROWS = Object.keys(ROSHAMBO);

// The Psychopath, mixed into Engine.prototype (see characters/index.js),
// so `this` is the Engine.
export const psychopath = {
  // At dawn, before nominations, an NPC Psychopath may choose a player in
  // public: they die. Until they've done it once, at PSYCHOPATH_KILL_CHANCE
  // a day; after that (they're known), every day. It shows they're evil
  // (see engine outed()), even if it fails.
  psychopathKills() {
    const s = this.s;

    for (const p of s.players.filter(
      (x) => !x.human && x.alive && minionAbility(x) === "psychopath",
    )) {
      if (s.winner) {
        return;
      }

      // (A good Alchemist with the ability only kills someone they're sure of.)
      if (p.role === "psychopath" && !p.psychopathKilled && s.r() >= PSYCHOPATH_KILL_CHANCE) {
        continue;
      }

      const t = this.strat.psychopath(s, p);

      if (t) {
        this.psychopathChooses(p, t);
      }
    }
  },

  // You, an Alchemist with the Psychopath's ability, choose player `id` in
  // public ("publicly choose a player", living or dead): they die. Once a
  // day, before nominations.
  psychopathKill(id) {
    const s = this.s;
    const h = this.human();
    const t = this.player(id);

    if (
      minionAbility(h) !== "psychopath" ||
      !h.alive ||
      s.phase !== "day" ||
      s.winner ||
      s.nominationsOpen ||
      h.psychopathKilled === s.day
    ) {
      throw Error("Psychopath unavailable.");
    }

    if (!t || t.human) {
      throw Error("Choose another player.");
    }

    this.psychopathChooses(h, t);
  },

  // Psychopath p chooses t in public: they die. It shows a Psychopath is
  // evil (see engine outed()), even if it fails; an Alchemist with the
  // ability says so instead.
  psychopathChooses(p, t) {
    const s = this.s;
    const effective = works(p);
    const alchemist = p.role !== "psychopath";
    const line = this.announce(
      `Day ${s.day} — ${p.human ? "You" : p.label} publicly ${p.human ? "choose" : "chooses"} ${t.label}${
        alchemist ? " (with the Alchemist's Psychopath ability)" : ""
      }: they die.`,
    );

    p.psychopathKilled = s.day;

    if (!p.human) {
      p.claim = alchemist ? "alchemist" : "psychopath";
      p.cover = null;
      this.claimPublicly(p);
    }

    if (!alchemist) {
      this.outed(p, `they chose ${t.label} to die in public, as the Psychopath`);
    }

    this.audit(
      "psychopath",
      `${p.label} (${minionLabel(p)}) publicly chose ${t.label}${effective ? "" : ", but it fails (drunk or poisoned)"}.`,
      { actorId: p.id, targetId: t.id, effective },
    );

    const before = this.alive().length;
    const died = effective && this.kill(t, "psychopath");
    // (Their kill failing on a player who can't die, they don't choose them
    // again: see strategy psychopath(). Not a Fool, who can die next time,
    // nor a Sailor the Storyteller made drunk.)
    const guarded = effective && !died && t.alive && this.cantDie(t, "psychopath");

    if (guarded) {
      p.foiled = [...new Set([...(p.foiled ?? []), t.id])];
      this.audit(
        "psychopath",
        `${p.label} (${minionLabel(p)}) won't choose ${t.label} again: ${guarded}.`,
        { actorId: p.id, targetId: t.id },
      );
    }

    if (!died) {
      s.publicLog[line] += " But nothing happens.";
    } else if (isDemon(t)) {
      this.successor(t, before, false);
    } else {
      this.check();
    }
  },

  // A working Psychopath p is being executed: they play roshambo against
  // their nominator, and only die if they lose (they win ties). Against
  // you, it waits for your throw (s.roshambo; see roshambo()). Returns null
  // (not a working Psychopath, or nobody nominated them), "pending", or
  // whether they survive ("survives" / "dies").
  psychopathExecuted(p) {
    const s = this.s;

    if (minionAbility(p) !== "psychopath" || !works(p)) {
      return null;
    }

    const vote = (s.voteHistory ?? []).findLast((x) => x.day === s.day && x.nomineeId === p.id);
    const nominator = vote && this.player(vote.nominatorId);

    if (!nominator || nominator === p) {
      return null;
    }

    if (nominator.human) {
      s.roshambo = { psychopathId: p.id, day: s.day };
      this.announce(
        `Day ${s.day} — ${p.label} is the Psychopath: they only die if they lose roshambo against you, who nominated them.`,
      );
      return "pending";
    }

    return this.roshamboRound(p, nominator, pick(THROWS, s.r)) ? "survives" : "dies";
  },

  // Roshambo between Psychopath p and `other`, who throws `theirs`: whether
  // the Psychopath wins (a tie counts as theirs).
  roshamboRound(p, other, theirs) {
    const s = this.s;
    const mine = pick(THROWS, s.r);
    const won = mine === theirs || ROSHAMBO[mine] === theirs;
    const them = other.human ? "you" : other.label;
    const line = `Day ${s.day} — Roshambo: ${p.label} throws ${mine}; ${them} ${
      other.human ? "throw" : "throws"
    } ${theirs}. ${
      mine === theirs
        ? "A tie: the Psychopath wins ties."
        : won
          ? "The Psychopath wins."
          : "The Psychopath loses."
    }`;

    this.announce(line);
    this.audit(
      "psychopath",
      `${line.replace(/^Day \d+ — /, "")} ${p.label} (${name(p.role)}) ${won ? "survives" : "dies"}.`,
      { actorId: p.id, otherId: other.id, mine, theirs, won },
    );

    return won;
  },

  // Your throw (rock, paper or scissors) against the Psychopath you
  // nominated; then the execution, and the day, end.
  roshambo(theirs) {
    const s = this.s;
    const r = s.roshambo;

    if (!r || s.winner) {
      throw Error("No roshambo.");
    }

    if (!THROWS.includes(theirs)) {
      throw Error("Throw rock, paper or scissors.");
    }

    const p = this.player(r.psychopathId);
    const won = this.roshamboRound(p, this.human(), theirs);

    s.roshambo = null;
    this.executionEnds(p, { ...r.execution, survives: won });
    this.dayEnds(p, r.from);
  },
};
