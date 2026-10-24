import { name } from "../../data.js";
import { ability, works, gamblerInfo } from "../../storyteller.js";
import { speak, heard } from "../../strategy.js";

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

      this.audit(
        "gambler",
        `${g.label} (${name(g.role)}) guessed ${guess.target.label} is ${name(
          guess.role,
        )}; ${wrong ? "wrong" : "right"}${dies ? ", and died" : ""}.`,
        { actorId: g.id, targetId: guess.target.id, guess: guess.role, wrong },
      );

      // A Gambler who dies knows they guessed wrong: they suspect that
      // player for certain, and say so in the morning (see gamblerReveal()).
      const died = dies && this.kill(g, "gambler");

      this.remember(g, gamblerInfo(s, guess.target, guess.role, died));

      if (died) {
        g.certainSuspect = guess.target.id;
        g.suspicion = { targetId: guess.target.id, day: s.day };
        this.check();
      }
    }
  },

  // A Gambler who died guessing wrong says so publicly, so the town can
  // weigh it: "I was the Gambler. I guessed X is the Y, and died."
  gamblerReveal(p) {
    const s = this.s;
    const m = p.memories.findLast(
      (x) => x.role === "gambler" && /, and died\.$/.test(x.text),
    );

    if (p.human || !m || p.gambleRevealed) {
      return;
    }

    p.gambleRevealed = true;
    this.claimPublicly(p);
    heard(s, p, [m]);

    const said = ` says: "I was the Gambler. ${speak(m.text)}"`;

    s.publicLog.push(`Day ${s.day} — ${p.label}${said}`);
    this.audit("gambler", `${p.label}${said}`, { playerId: p.id });
  },
};
