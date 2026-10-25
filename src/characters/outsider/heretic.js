import { HERETIC_BLUFF_CHANCE, NPC_NOMINATE_EVIDENCE, name } from "../../data.js";
import { ability, atFinal, isDemon, isDrunk } from "../../storyteller.js";
import { lied } from "../../strategy.js";

// The Heretic, mixed into Engine.prototype (see characters/index.js),
// so `this` is the Engine.
export const heretic = {
  // The game ends with `winner` winning: with a sober and healthy Heretic in
  // play (alive or dead; or a Philosopher who gained it), the other team
  // wins instead.
  hereticFlip(winner, reason) {
    const h = this.s.players.find(
      (x) => ability(x) === "heretic" && !isDrunk(x) && !x.poisoned,
    );

    if (!h) {
      return { winner, reason };
    }

    const flipped = winner === "good" ? "evil" : "good";

    this.audit(
      "heretic",
      `${winner === "good" ? "Good" : "Evil"} would win (${reason}), but ${h.label} is the Heretic: ${flipped} wins instead.`,
      { playerId: h.id, was: winner },
    );

    return {
      winner: flipped,
      reason: `${reason} But the Heretic turns it around: ${flipped} wins.`,
    };
  },

  // At dawn in the final 3, once per game, when evil looks about to lose:
  // an NPC Heretic (alive or dead) says so in public, so you know good must
  // "lose" today. Until then they hide behind a Townsfolk claim (see
  // HIDDEN_OUTSIDERS). With no Heretic saying so, an evil NPC might claim to
  // be one (HERETIC_BLUFF_CHANCE), to have you spare the Demon.
  hereticReveals() {
    const s = this.s;

    if (!s.script.ids.includes("heretic") || s.hereticClaim || !atFinal(s)) {
      return;
    }

    const real = s.players.find((x) => !x.human && x.role === "heretic");

    if (real) {
      const why = this.hereticSeesLoss(real);

      if (why) {
        this.hereticSays(real, why);
        return;
      }
    }

    const demon = s.players.find((x) => x.alive && isDemon(x));
    const why = demon && this.evilSeesLoss(demon);

    if (!why) {
      return;
    }

    // (One who took the Heretic as their bluff first, then a dead teammate,
    // then a living Minion; the Demon only if nobody else is left.)
    const evil = s.players.filter((x) => !x.human && x.alignment === "evil");
    const liar =
      evil.find((x) => x.bluff === "heretic") ??
      evil.find((x) => !x.alive) ??
      evil.find((x) => !isDemon(x)) ??
      demon;

    if (s.r() >= HERETIC_BLUFF_CHANCE) {
      this.audit(
        "heretic",
        `${liar.label} (${name(liar.role)}) could claim to be the Heretic (${why}), but doesn't.`,
        { playerId: liar.id },
      );
      return;
    }

    lied(s, { kind: "fake", byId: liar.id, said: "heretic", truth: liar.role });
    this.hereticSays(liar, why, true);
  },

  // Why the Heretic thinks good is about to win, or null: someone they (or
  // you, by your Evil mark) are sure is evil is still alive.
  hereticSeesLoss(p) {
    const s = this.s;
    const sus = this.strat.suspicion(s, p);
    const t = sus && this.player(sus.targetId);

    if (t?.alive && sus.score >= NPC_NOMINATE_EVIDENCE) {
      return `they're sure ${t.label} is evil`;
    }

    const marked = s.players.find((x) => x.alive && s.marks?.[x.id] === "evil");

    return marked ? `you marked ${marked.label} evil` : null;
  },

  // Why the evil team thinks good is about to win, or null: you marked the
  // Demon evil, or a living good NPC is sure of them.
  evilSeesLoss(demon) {
    const s = this.s;

    if (s.marks?.[demon.id] === "evil") {
      return `you marked the Demon (${demon.label}) evil`;
    }

    const onto = s.players.find((x) => {
      if (x.human || !x.alive || x.alignment !== "good") {
        return false;
      }

      const sus = this.strat.suspicion(s, x);

      return sus?.targetId === demon.id && sus.score >= NPC_NOMINATE_EVIDENCE;
    });

    return onto ? `${onto.label} is sure the Demon (${demon.label}) is evil` : null;
  },

  // p says in public they're the Heretic (`fake`: an evil player's bluff).
  hereticSays(p, why, fake = false) {
    const s = this.s;
    const was = p.cover?.as ?? p.claim;
    const line = `Day ${s.day} — ${p.label} says: "${
      was && was !== "heretic" ? `I said I was the ${name(was)}, but I'm` : "I'm"
    } the Heretic: whoever wins, loses. If good wins today, good loses."`;

    s.hereticClaim = p.id;
    p.claim = "heretic";
    p.bluff = fake ? "heretic" : p.bluff;
    p.cover = null;
    this.claimPublicly(p);
    s.publicLog.push(line);
    this.audit(
      "heretic",
      `${line.replace(/^Day \d+ — /, "")} (${
        fake ? `fake: they're the ${name(p.role)}` : "the real Heretic"
      }; ${why})`,
      { playerId: p.id, fake },
    );
  },
};
