import { name } from "../../data.js";
import { ability, works, gamblerInfo } from "../../storyteller.js";
import { speak, heard } from "../../strategy.js";
import { byId } from "../../util.js";

// The Gambler, mixed into Engine.prototype (see characters/index.js),
// so `this` is the Engine.
export const gambler = {
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
      const why = guess.self
        ? " (themselves, to be safe: they've heard no claims)"
        : guess.told
          ? ` (${guess.target.label} claimed the ${name(guess.role)})`
          : " (a hunch: they suspect them)";

      // (Logged before the death, which is logged after it.)
      this.audit(
        "gambler",
        `${g.label} (${name(g.role)}) guessed ${guess.target.label} is ${name(
          guess.role,
        )}${why}; ${wrong ? "wrong" : "right"}${
          wrong && !dies ? ", but their ability doesn't work tonight" : ""
        }.`,
        { actorId: g.id, targetId: guess.target.id, guess: guess.role, wrong },
      );

      // A Gambler who dies knows they guessed wrong: they suspect that
      // player for certain, and say so in the morning (see gamblerReveal()).
      // (A Gambler who should have died but didn't, say for the Tea Lady,
      // thinks they guessed right.)
      const died = dies && this.kill(g, "gambler");

      this.remember(g, {
        ...gamblerInfo(s, guess.target, guess.role, died, guess.self),
        told: Boolean(guess.told),
      });

      if (died) {
        g.certainSuspect = guess.target.id;
        g.suspicion = { targetId: guess.target.id, day: s.day };
        this.check();
      }
    }
  },

  // A Gambler who died guessing wrong says so publicly, so the town can
  // weigh it: "I was the Gambler. I guessed X is the Y, and died." If they
  // guessed what X claimed, X lied (as far as they know): they say so, and
  // everyone weighs X's word the other way round from now on (as for a
  // Professor's; see strategy liars()).
  gamblerReveal(p) {
    const s = this.s;
    const m = p.memories.findLast(
      (x) => x.role === "gambler" && /, and died\.$/.test(x.text),
    );

    if (p.human || !m || p.gambleRevealed) {
      return;
    }

    const t = byId(s, m.targets[0]);
    const lie = m.told && t
      ? ` ${t.label} claimed to be the ${name(m.guess)}, so they lied.`
      : "";

    p.gambleRevealed = true;
    this.claimPublicly(p);
    heard(s, p, [m]);

    if (lie) {
      s.exposed = [...new Set([...(s.exposed ?? []), t.id])];
    }

    const said = ` says: "I was the Gambler. ${speak(m.text)}${lie}"`;

    s.publicLog.push(`Day ${s.day} — ${p.label}${said}`);
    this.audit("gambler", `${p.label}${said}`, { playerId: p.id });
  },
};
