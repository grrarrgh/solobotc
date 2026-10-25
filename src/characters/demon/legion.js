import {
  alignment,
  LEGION_STEER_SLACK,
  LEGION_GOOD_MIN,
  LEGION_POLITICIAN_CHANCE,
} from "../../data.js";
import { works } from "../../storyteller.js";
import { untwinned } from "../../strategy.js";
import { pick } from "../../util.js";

// Legion, mixed into Engine.prototype (see characters/index.js), so `this`
// is the Engine. Most players are Legion (see setup.js), each of them a
// Demon (and registering as a Minion too).
export const legion = {
  // Each night*, a player might die: the Storyteller chooses, steering for
  // a final 3 of you, 1 good NPC and 1 Legion (2 good NPCs and 1 Legion,
  // with you dead). The Legion left should shrink in step with the players
  // alive, from their starting number to 1 (see legionWant()). Of nobody
  // dying, a Legion dying or a good NPC dying, it takes whichever leaves
  // the Legion closest to that path; among those within LEGION_STEER_SLACK
  // of the closest, at random; nobody only after a day with an execution,
  // so the game moves on. Never you, as with any night death; never
  // the last Legion; and never a good player once LEGION_GOOD_MIN are left,
  // so good can still win. The kill is Legion's: the Monk, Soldier, Mayor
  // and the rest apply, and it fails if no living Legion's ability works
  // (or every one left was chosen by the Exorcist).
  legionNight() {
    const s = this.s;
    const all = s.players.filter((x) => x.alive && x.role === "legion");
    const awake = all.filter((x) => x.exorcised !== s.night);
    const pool = untwinned(
      s,
      s.players.filter((x) => x.alive && !x.human && !s.revived.includes(x.id)),
    );
    // (Never the last Legion: that would end the game for nothing.)
    const legion = all.length > 1 ? pool.filter((x) => x.role === "legion") : [];
    // (Never a good player once only 2 are left, you included: with 1, good
    // can't win, as executing a Legion leaves 2 alive and evil wins.)
    const goodAlive = s.players.filter((x) => x.alive && x.alignment === "good").length;
    const good =
      goodAlive > LEGION_GOOD_MIN ? pool.filter((x) => x.alignment === "good") : [];
    const n = s.players.filter((x) => x.alive).length;
    const e = all.length;
    // (Nobody dies only after a day with an execution: the game moves on.)
    const options = [
      ...(s.executedToday || (!legion.length && !good.length)
        ? [{ kind: "nobody", from: [], n, e }]
        : []),
      { kind: "a Legion", from: legion, n: n - 1, e: e - 1 },
      { kind: "a good player", from: good, n: n - 1, e },
    ]
      .filter((o) => o.kind === "nobody" || o.from.length)
      .map((o) => ({ ...o, off: Math.abs(o.e - this.legionWant(o.n)) }));
    const best = Math.min(...options.map((o) => o.off));
    const close = options.filter((o) => o.off <= best + LEGION_STEER_SLACK);
    const choice = pick(close, s.r);
    const t = pick(choice.from, s.r) ?? null;
    // (For the log: who's alive, and how far each choice leaves the Legion
    // from the path to the final 3.)
    const alive = `${e} Legion and ${goodAlive} good alive`;
    const why = `steering for a final 3 with 1 Legion, which wants ${this.legionWant(
      n,
    ).toFixed(1)} Legion with ${n} alive: ${options
      .map((o) => `${o.kind} leaves ${o.off.toFixed(1)} off`)
      .join(", ")}; ${choice.kind}${
      close.length > 1 ? `, at random of ${close.length}` : ""
    }${
      !good.length && goodAlive <= LEGION_GOOD_MIN
        ? ` (never a good player: only ${goodAlive} good players are left)`
        : ""
    }`;

    // The Legion it comes from: one whose ability works (not the victim,
    // if there's another).
    const by =
      pick(
        awake.filter((x) => works(x) && x !== t),
        s.r,
      ) ??
      pick(awake.filter(works), s.r) ??
      pick(awake, s.r);

    if (!t || !by) {
      this.audit(
        "legion",
        `Legion: nobody dies tonight (why: ${
          by ? why : "every Legion left was chosen by the Exorcist"
        }; ${alive}).`,
      );
      return;
    }

    this.audit(
      "legion",
      `Legion: the Storyteller chooses ${t.label} (why: ${why}; ${alive}).`,
      { targetId: t.id },
    );
    this.woke(by);
    this.attack(by, t);
  },

  // How many Legion the Storyteller wants alive with n players alive: from
  // the number dealt, at the start, down to 1 at the final 3 (in step).
  legionWant(n) {
    const s = this.s;
    const n0 = s.players.length;
    const e0 = s.players.filter((x) => alignment(x.startRole) === "evil").length;
    const step = n0 > 3 ? Math.max(0, n - 3) / (n0 - 3) : 0;

    return 1 + (e0 - 1) * step;
  },

  // Executions fail if only evil voted: with a living Legion whose ability
  // works, a vote with enough hands to mark the nominee, all of them evil,
  // is counted as 0. Returns whether it was.
  legionVeto(records, threshold) {
    const s = this.s;
    const counted = records.filter((x) => x.counted);

    if (
      counted.length < threshold ||
      !s.players.some((x) => x.alive && x.role === "legion" && works(x))
    ) {
      return false;
    }

    // (A good Politician might register as evil: their jinx.)
    const politicians = counted
      .map((x) => this.player(x.playerId))
      .filter((p) => p.alignment === "good" && p.role === "politician");
    const evil = (p) =>
      p.alignment === "evil" ||
      (politicians.includes(p) && s.r() < LEGION_POLITICIAN_CHANCE);

    if (!counted.every((x) => evil(this.player(x.playerId)))) {
      return false;
    }

    if (politicians.length) {
      this.audit(
        "legion",
        `${politicians.map((p) => p.label).join(", ")} (Politician) registered as evil to Legion.`,
      );
    }

    for (const x of counted) {
      x.counted = false;
    }

    this.audit(
      "legion",
      `Only evil players voted (${counted.length}), so the Storyteller counts 0 (Legion).`,
    );

    return true;
  },
};
