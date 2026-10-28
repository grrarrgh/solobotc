import { name, team } from "../../data.js";
import { works } from "../../storyteller.js";
import { untwinned } from "../../strategy.js";
import { pick } from "../../util.js";

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
// Nobody dies when "No Demon remains": the game goes on until 2 are alive
// (engine check()).
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
};
