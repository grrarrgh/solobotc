import {
  name,
  team,
  ATHEIST_UNSAFE_SHARE,
  ATHEIST_VOTE_BELIEF,
  ATHEIST_DOUBLE_NOTICE,
  ATHEIST_HOLDER_NOTICE,
  ATHEIST_PIXIE_DOUBLE_FACTOR,
} from "../../data.js";
import { works, wishBarred, atheistBreakChance } from "../../storyteller.js";
import { untwinned, sideOf, note } from "../../strategy.js";
import { pick, claimTo } from "../../util.js";

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
//   goes on, while the Storyteller is still safe (atheistSafe());
// - each night* the pretend Demon "kills" (atheistNight()), as a real one
//   would choose; if it has died, the pretend Demon passes to a pretend
//   Minion, as an Imp's would, and with none left the Storyteller keeps
//   killing anyway: a rule break the town may notice;
// - a pretend Cerenovus makes a player mad (atheistCerenovus()); there's
//   never a pretend Evil Twin or Marionette, who couldn't work (setup.js);
// - abilities that act, not inform (the Slayer, Snake Charmer...), see the
//   truth: a Snake Charmer choosing the pretend Demon misses.
// Nobody wins because "No Demon remains": the game goes on until 2 are
// alive (engine check()).
//
// With the Atheist on the script (an Atheist game or not), the Storyteller
// can be nominated (nominateStoryteller()) and voted on like a player, but
// only half the living players' votes are needed, whatever anyone else got
// today, and it doesn't mark anyone: executed, the game ends at once
// (storytellerVoteCast()). Good NPCs vote, and nominate it, by how much they
// believe an Atheist claim; in other games an evil Minion may claim the
// Atheist as a trap (see strategy atheistBelief(), storytellerNomination();
// setup.js EVIL_ATHEIST_BLUFF_CHANCE).
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

  // At nightfall in an Atheist game: while the Storyteller is still safe,
  // its rule breaks grow more frequent each night (see storyteller.js
  // atheistBreakChance()); once the living NPCs who believe the Atheist
  // make up ATHEIST_UNSAFE_SHARE of the votes executing it needs, the ramp
  // holds tonight (s.atheist.held). Logged.
  atheistSafe() {
    const s = this.s;
    const needed = this.storytellerNeeded();
    const believers = s.players.filter(
      (x) =>
        x.alive &&
        !x.human &&
        (this.strat.atheistBelief(s, x)?.belief ?? 0) >= ATHEIST_VOTE_BELIEF,
    );

    if (believers.length < needed * ATHEIST_UNSAFE_SHARE) {
      return;
    }

    s.atheist.held = (s.atheist.held ?? 0) + 1;
    this.audit(
      "atheist",
      `The town is coming to believe the Atheist (${believers.length} living NPC${
        believers.length === 1 ? "" : "s"
      } would vote to execute the Storyteller, of ${needed} votes needed): the Storyteller's rule breaks don't grow more frequent tonight (held at ${Math.round(
        atheistBreakChance(s) * 100,
      )}%).`,
      { playerIds: believers.map((x) => x.id) },
    );
  },

  // In an Atheist game, each morning: each NPC who has heard two players
  // claim the same character (a duplicate, see setup.js ATHEIST_DUPLICATES,
  // or anyone's), both claims standing, may notice it as a sign the rules
  // are broken: a doubt of their own, at ATHEIST_DOUBLE_NOTICE, as false
  // information is at ATHEIST_DOUBT_NOTICE (see strategy atheistHeard()).
  // One who hears another claim their own character, at
  // ATHEIST_HOLDER_NOTICE: they know they're telling the truth. Once each
  // pair each; not the dead, nor the Atheist, who knows. (Not the Village
  // Idiot or Farmer, which can be many.) Logged, a line a pair.
  atheistDoubles() {
    const s = this.s;

    if (!s.atheist) {
      return;
    }

    const heard = new Map();

    for (const x of s.players.filter((y) => !y.human && y.alive && y.role !== "atheist")) {
      const others = s.players.filter((y) => y !== x);
      const pairs = [
        // (Their own character, claimed by another.)
        ...others.map((a) => [x, a, x.claim]),
        ...others.flatMap((a, i) => others.slice(i + 1).map((b) => [a, b, claimTo(a, x)])),
      ];

      for (const [a, b, claim] of pairs) {
        const key = `${claim}:${[a.id, b.id].sort().join(":")}`;

        if (
          !claim ||
          ["villageidiot", "farmer", "atheist"].includes(claim) ||
          (a !== x && claimTo(a, x) !== claim) ||
          claimTo(b, x) !== claim ||
          (x.doublesHeard ??= []).includes(key)
        ) {
          continue;
        }

        x.doublesHeard.push(key);

        // (A mad Pixie could explain a doubled Townsfolk.)
        const pixie = s.script.ids.includes("pixie") && team(claim) === "townsfolk" ? ATHEIST_PIXIE_DOUBLE_FACTOR : 1;
        const chance = (a === x ? ATHEIST_HOLDER_NOTICE : ATHEIST_DOUBLE_NOTICE) * pixie;
        const seen = s.r() < chance;

        if (seen) {
          (x.doubts ??= []).push({ byId: b.id, id: `double:${key}`, day: s.day, broken: true });
        }

        const h = heard.get(key) ?? { a, b, claim, seen: [], missed: [] };

        (seen ? h.seen : h.missed).push(x);
        heard.set(key, h);
      }
    }

    for (const { a, b, claim, seen, missed } of heard.values()) {
      const list = (xs) => xs.map((x) => x.label).join(", ");

      note(
        s,
        "workings",
        `${a.label} and ${b.label} both claim the ${name(claim)}: ${
          seen.length ? `${list(seen)} notice${seen.length === 1 ? "s" : ""} it doesn't add up (a doubt)` : "nobody thinks anything of it"
        }${seen.length && missed.length ? `; ${list(missed)} ${missed.length === 1 ? "doesn't" : "don't"}` : ""}.`,
        { noticedIds: seen.map((x) => x.id) },
      );
    }
  },

  // With the Atheist on the script, as nominations open: how much each good
  // NPC who could vote believes an Atheist claim, where it has changed
  // since they were last logged (p.atheistLogged), and why (see strategy
  // atheistBelief()); and how much each evil NPC says they believe it, as a
  // good NPC would (see strategy atheistView()). Log only: no draw from s.r.
  atheistBeliefs() {
    const s = this.s;
    const rows = [];
    const voters = s.players.filter(
      (x) => !x.human && (x.alive || x.ghost) && x.role !== "atheist",
    );

    for (const x of voters) {
      const evil = sideOf(x) === "evil";
      const b = this.strat.atheistBelief(s, x, evil);

      if (!b?.claimant) {
        continue;
      }

      const now = Math.round(b.belief * 100);
      const was = x.atheistLogged;

      if (was === now) {
        continue;
      }

      x.atheistLogged = now;
      rows.push(
        `${x.label}${evil ? ` (evil: says, as a good NPC would)` : ""}: ${
          was === undefined ? "" : `${was}% → `
        }${now}% in ${b.claimant.human ? "your" : `${b.claimant.label}'s`} claim${
          b.reasons.length ? ` (${b.reasons.join("; ")})` : ""
        }`,
      );
    }

    if (rows.length) {
      const at = Math.round(ATHEIST_VOTE_BELIEF * 100);
      const head =
        "Belief in the Atheist claim, NPC by NPC, where it has changed " +
        `(NPCs vote to execute the Storyteller at ${at}% or more):`;

      this.audit("workings", `${head}\n${rows.join("\n")}`);
    }
  },

  // Each night, in an Atheist game, a living pretend Cerenovus "makes a
  // player mad": the Storyteller chooses a player and a good character, as
  // the real one would (see strategy cerenovus()), and they must be mad
  // about it tomorrow, as with the real Cerenovus (see cerenovus.js).
  atheistCerenovus() {
    const s = this.s;
    const c = s.atheist && s.players.find((x) => x.alive && x.pretend === "cerenovus");
    const choice = c && this.strat.cerenovus(s, c);

    if (!choice) {
      return;
    }

    choice.target.mad = { role: choice.role, day: s.night, previous: null };
    this.audit(
      "atheist",
      `The Storyteller pretends ${c.label} (${name(c.role)}), the pretend Cerenovus, made ${choice.target.label} mad that they are the ${name(
        choice.role,
      )}.`,
      { actorId: c.id, targetId: choice.target.id, role: choice.role },
    );
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
          : s.storytellerNominated === s.day
            ? "The Storyteller has already been nominated today."
            : s.dayNominators.includes(p.id)
              ? `${p.human ? "You have" : `${p.label} has`} already nominated today.`
              : wishBarred(s, p)
                ? "Your wish's price: you can't nominate in the second round."
                : s.roshambo
                  ? "Throw first."
                  : this.golemBarred(p);
  },

  // Why you can't ask for a nomination of the Storyteller now, or null if
  // you can: alive or dead, as for a player (see engine
  // requestNomination()), with a living NPC still able to nominate. (No
  // draw from s.r: the UI asks.)
  storytellerRequestBarred() {
    const s = this.s;
    const able = s.players.some(
      (x) => x.alive && !x.human && !s.dayNominators.includes(x.id) && !wishBarred(s, x),
    );

    return !this.storytellerOnScript()
      ? "The Storyteller can only be nominated with the Atheist on the script."
      : s.phase !== "day" || s.winner
        ? "Nominations happen by day."
        : s.storytellerNominated === s.day
          ? "The Storyteller has already been nominated today."
          : s.roshambo
            ? "Throw first."
            : !able
              ? "Nobody is able to nominate."
              : null;
  },

  // You ask for a nomination of the Storyteller: a living NPC who hasn't
  // nominated today makes it (see strategy nominator()). Your pick, so your
  // sway holds, as on a player (see strategy storytellerSway()). `hand` as
  // for nominateStoryteller().
  requestStoryteller(hand = true) {
    const s = this.s;
    const why = this.storytellerRequestBarred();

    if (why) {
      throw Error(why);
    }

    const nominator = this.strat.nominator(s, this.storytellerNominee());

    s.publicLog.push(`Day ${s.day} — You asked for a nomination: ${nominator.label} nominates the Storyteller.`);
    this.audit(
      "request",
      `You asked for a nomination of the Storyteller; ${nominator.label} (${name(nominator.role)}) nominated.`,
      { actorId: nominator.id, targetId: STORYTELLER },
    );

    return this.nominateStoryteller(nominator, hand, null, true);
  },

  // The votes executing the Storyteller needs: half the living players,
  // rounded up.
  storytellerNeeded() {
    return Math.ceil(this.alive().length / 2);
  },

  // Player p nominates the Storyteller. `hand` as for engine nominate():
  // null leaves the vote waiting (for app.js's count). `intro`: an NPC's
  // nomination and why (see engine npcNomination(), which has logged it),
  // on a card before the vote. `requested`: you asked for it (see
  // requestStoryteller()).
  nominateStoryteller(p, hand = true, intro = null, requested = false) {
    const s = this.s;
    const why = this.storytellerBarred(p);
    const base = {
      nominatorId: p.id,
      nomineeId: STORYTELLER,
      storyteller: true,
      count: 0,
      threshold: 0,
      needed: 0,
      marked: false,
      records: [],
    };

    if (why) {
      throw Error(why);
    }

    s.storytellerNominated = s.day;
    s.dayNominators.push(p.id);

    if (!intro && !requested) {
      s.publicLog.push(`Day ${s.day} — ${p.human ? "You nominate" : `${p.label} nominates`} the Storyteller.`);
    }

    this.audit(
      "nomination",
      `${p.label} (${name(p.role)}) nominated the Storyteller${
        s.atheist ? " (the Atheist is in play: executed, good wins)" : " (no Atheist is in play: executed, evil wins)"
      }.`,
      { actorId: p.id, targetId: STORYTELLER },
    );

    // A nominator cursed by the Witch dies; the vote still goes ahead unless
    // that ended the game.
    this.witchCurse(p);

    if (s.winner) {
      return base;
    }

    // (The Golem's one nomination, spent on nobody: see golem.js.)
    this.golemNominates(p, this.storytellerNominee());

    this.openNominations();

    if (intro) {
      (s.phaseCards ??= []).push({ kind: "nomination", day: s.day, lines: [intro] });
    }

    // (How the NPCs decide: see strategy storytellerVote().)
    this.audit(
      "workings",
      `On the Storyteller (${this.storytellerNeeded()} votes needed), good NPCs vote if they believe an Atheist claim (at ${Math.round(
        ATHEIST_VOTE_BELIEF * 100,
      )}% belief or more), or your nomination sways them, as on a player; evil NPCs only when the hands already counted (yours first, as the clock hand comes round from the Sun) and their team's still to come can carry it, as a hand up for nothing would give them away; an evil player claiming the Atheist always votes.`,
    );

    s.pendingVote = { nominatorId: p.id, nomineeId: STORYTELLER, storyteller: true, requested };

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
    const records = this.votes(
      n,
      nominator,
      nominator.human || Boolean(pending.requested),
      hand && this.canVote(),
      pending.intents ?? null,
    );
    // (Legion's "executions fail if only evil players vote" holds for the
    // Storyteller too: see legion.js.)
    const hands = records.filter((x) => x.counted).length;
    const failed = this.legionVeto(records, needed);
    const count = records.filter((x) => x.counted).length;
    const executed = count >= needed;
    const voterIds = records.filter((x) => x.attempted).map((x) => x.playerId);
    // (What each NPC who could vote believed, for log.txt; for one playing
    // for evil, what they say they believe, as a good NPC would: see
    // strategy atheistView().)
    const views = s.players
      .filter((x) => !x.human && (x.alive || x.ghost || voterIds.includes(x.id)))
      .map((x) => {
        const b = this.strat.atheistBelief(s, x);
        const said = !b && this.strat.atheistBelief(s, x, true);
        const up = voterIds.includes(x.id) ? "voted" : "didn't vote";
        const pct = (y) => `${Math.round(y.belief * 100)}%`;

        return b
          ? `${x.label}: ${up} (belief ${pct(b)}${b.reasons.length ? `: ${b.reasons.join("; ")}` : ""})`
          : `${x.label}: ${up} (plays for evil${said?.claimant ? `; says ${pct(said)}` : ""})`;
      });
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

    (s.storytellerVotes ??= []).push({ day: s.day, nominatorId: nominator.id, voterIds, count, needed, failed });
    s.lastVote = result;

    // (Only evil voted, as for a player: good NPCs weigh it. See strategy
    // evidence().)
    if (failed) {
      (s.failedExecutions ??= []).push({ day: s.day, nomineeId: STORYTELLER, voterIds });
    }

    if (views.length) {
      this.audit("workings", `The vote on the Storyteller, NPC by NPC:\n${views.join("\n")}`);
    }

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
