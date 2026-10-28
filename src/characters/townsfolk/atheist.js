import { name, team } from "../../data.js";
import { works, wishBarred } from "../../storyteller.js";
import { untwinned } from "../../strategy.js";
import { pick } from "../../util.js";

// The Storyteller's id as a nominee: by day, with the Atheist on the script,
// any living player may nominate the Storyteller (once a day), pressing the
// Sun (see app.js). Executed (half the living players' votes or more), the
// game ends: good wins if the Atheist is in play, evil if not.
export const STORYTELLER = "storyteller";

// The Atheist, mixed into Engine.prototype (see characters/index.js), so
// `this` is the Engine.
//
// In an Atheist game (s.atheist: see setup.js, ATHEIST_CHANCE) nobody is
// evil. The Storyteller pretends some players are the Demon and Minions
// (p.pretend), and plays the game as if they were:
// - to information abilities they register as those characters (see
//   storyteller.js registersDemon()), so good players' information is true
//   to the pretence, except when the Storyteller breaks the rules with a
//   piece of it (see storyteller.js atheistBreaks()), more often as the game
//   goes on;
// - each night* the pretend Demon "kills" (atheistNight()), as a real one
//   would choose; if it has died, the pretend Demon passes to a pretend
//   Minion, as an Imp's would, and with none left the Storyteller keeps
//   killing anyway: a rule break the town may notice;
// - abilities that act, not inform (the Slayer, Snake Charmer...), see the
//   truth: a Snake Charmer choosing the pretend Demon misses.
// Nobody wins because "No Demon remains": the game goes on until 2 are
// alive (engine check()).
//
// With the Atheist on the script (an Atheist game or not), the Storyteller
// can be nominated (nominateStoryteller()) and voted on like a player, but
// only half the living players' votes are needed, whatever anyone else got
// today, and it doesn't mark anyone: executed, the game ends at once
// (storytellerVoteCast()).
export const atheist = {
  // The living player the Storyteller pretends is the Demon, or null.
  pretendDemon() {
    return this.s.players.find((x) => x.alive && team(x.pretend) === "demon") ?? null;
  },

  // Each night*, the pretend Demon's kill.
  atheistNight() {
    const s = this.s;
    let d = this.pretendDemon();

    // (Its pretend Demon died: it passes to a living pretend Minion.)
    if (!d) {
      const dead = s.players.find((x) => team(x.pretend) === "demon");
      const next = pick(
        s.players.filter((x) => x.alive && team(x.pretend) === "minion"),
        s.r,
      );

      if (next) {
        this.audit(
          "atheist",
          `The pretend ${name(dead.pretend)} (${dead.label}) is dead: the Storyteller pretends ${next.label} (${name(next.role)}), the pretend ${name(next.pretend)}, is the ${name(dead.pretend)} now.`,
          { playerId: next.id, previousId: dead.id },
        );
        next.pretend = dead.pretend;
        d = next;
      } else {
        s.atheist.breaks++;
      }
    }

    // Anyone alive but the pretend team (and nobody who came back to life
    // tonight, nor anyone the Storyteller knows can't die: a Monk's or a
    // working Soldier's); you only when it has nobody else, as any Demon.
    const pool = untwinned(
      s,
      s.players.filter(
        (x) =>
          x.alive &&
          !x.human &&
          !x.pretend &&
          !s.revived.includes(x.id) &&
          !x.protected &&
          !(x.role === "soldier" && works(x)),
      ),
    );
    const you = s.players.find((x) => x.human && x.alive && !s.revived.includes(x.id));
    let why = null;
    const t = pool.length
      ? this.strat.byPriority(s, d ?? s.players.find((x) => x.pretend), pool, undefined, (text) => (why = text))
      : you;

    if (!pool.length) {
      why = "nobody but the pretend team is left to kill, besides you";
    }

    const who = d ? `the pretend ${name(d.pretend)} (${d.label})` : "no pretend Demon (every pretend evil player is dead), a rule break";

    if (!t) {
      this.audit("atheist", `The Storyteller kills nobody tonight for ${who}: nobody it can kill.`);
      return;
    }

    // (kill() logs it if they can't die: an Innkeeper's guest, the Fool...)
    this.audit("atheist", `The Storyteller kills ${t.label} for ${who} (why: ${why}).`, {
      targetId: t.id,
    });

    if (this.kill(t, "demon")) {
      this.grandmother(t);
    }

    this.check();
  },

  // The Storyteller as a nominee, for the vote (see engine intents()).
  storytellerNominee() {
    return { id: STORYTELLER, label: "the Storyteller", storyteller: true, alive: true };
  },

  // Whether the Storyteller can be nominated at all: the Atheist is on the
  // script.
  storytellerOnScript() {
    return this.s.script.ids.includes("atheist");
  },

  // Why living player p can't nominate the Storyteller now, or null if they
  // can.
  storytellerBarred(p) {
    const s = this.s;

    return !this.storytellerOnScript()
      ? "The Storyteller can only be nominated with the Atheist on the script."
      : s.phase !== "day" || s.winner
        ? "Nominations happen by day."
        : !p.alive
          ? "Only a living player can nominate the Storyteller."
          : s.dayNominators.includes(p.id)
            ? `${p.human ? "You have" : `${p.label} has`} already nominated today.`
            : wishBarred(s, p)
              ? "Your wish's price: you can't nominate in the second round."
              : s.storytellerNominated === s.day
                ? "The Storyteller has already been nominated today."
                : null;
  },

  // The votes executing the Storyteller needs: half the living players,
  // rounded up.
  storytellerNeeded() {
    return Math.ceil(this.alive().length / 2);
  },

  // Player p nominates the Storyteller. `hand` as for engine nominate():
  // null leaves the vote waiting (for app.js's count).
  nominateStoryteller(p, hand = true) {
    const s = this.s;
    const why = this.storytellerBarred(p);

    if (why) {
      throw Error(why);
    }

    s.storytellerNominated = s.day;
    s.dayNominators.push(p.id);
    this.openNominations();

    s.publicLog.push(`Day ${s.day} — ${p.human ? "You nominate" : `${p.label} nominates`} the Storyteller.`);
    this.audit(
      "nomination",
      `${p.label} (${name(p.role)}) nominated the Storyteller${
        s.atheist ? " (the Atheist is in play: executed, good wins)" : " (no Atheist is in play: executed, evil wins)"
      }.`,
      { actorId: p.id, targetId: STORYTELLER },
    );

    s.pendingVote = { nominatorId: p.id, nomineeId: STORYTELLER, storyteller: true };

    if (hand === null) {
      return {
        nominatorId: p.id,
        nomineeId: STORYTELLER,
        storyteller: true,
        needed: this.storytellerNeeded(),
        pending: true,
      };
    }

    return this.castVotes(hand);
  },

  // The vote on the Storyteller (from engine castVotes()): `pending` is
  // s.pendingVote, now cleared. Who voted is public, kept apart from players'
  // votes (s.storytellerVotes).
  storytellerVoteCast(pending, hand) {
    const s = this.s;
    const nominator = this.player(pending.nominatorId);
    const n = this.storytellerNominee();
    const needed = this.storytellerNeeded();
    const records = this.votes(n, nominator, nominator.human, hand && this.canVote(), pending.intents ?? null);
    // (Legion's "executions fail if only evil players vote" holds for the
    // Storyteller too: see legion.js.)
    const hands = records.filter((x) => x.counted).length;
    const failed = this.legionVeto(records, needed);
    const count = records.filter((x) => x.counted).length;
    const executed = count >= needed;
    const voterIds = records.filter((x) => x.attempted).map((x) => x.playerId);
    const result = {
      nominatorId: nominator.id,
      nomineeId: STORYTELLER,
      storyteller: true,
      count,
      threshold: needed,
      needed,
      marked: false,
      failed,
      executed,
      records,
    };

    (s.storytellerVotes ??= []).push({ day: s.day, nominatorId: nominator.id, voterIds, count, needed });
    s.lastVote = result;

    const outcome = failed
      ? "Execution failed: the Storyteller lives"
      : executed
        ? "the Storyteller is executed"
        : "not enough votes: the Storyteller lives";
    const shown = failed ? hands : count;

    this.audit("vote_result", `${nominator.label} nominated the Storyteller: ${count}/${needed}; ${outcome}.`, result);
    s.publicLog.push(
      `Day ${s.day} — ${nominator.label} nominated the Storyteller: ${shown} vote${shown === 1 ? "" : "s"} (${needed} needed); ${outcome}.`,
    );

    if (executed) {
      const atheist = s.players.find((x) => x.role === "atheist");

      this.announce(`Day ${s.day} — The Storyteller is executed.`);
      this.finish(
        s.atheist ? "good" : "evil",
        s.atheist
          ? `The Storyteller was executed, and the Atheist (${atheist?.label ?? "nobody"}) is in play.`
          : "The Storyteller was executed, but no Atheist is in play.",
      );
      return result;
    }

    this.countNpcNominations();
    return result;
  },
};
