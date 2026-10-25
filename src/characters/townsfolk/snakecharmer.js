import { name } from "../../data.js";
import { ability, works, isDemon } from "../../storyteller.js";

// The Snake Charmer, mixed into Engine.prototype (see characters/index.js),
// so `this` is the Engine.
export const snakecharmer = {
  // A Snake Charmer who picks the Demon swaps characters and alignments with
  // them; the old Demon becomes a good Snake Charmer, poisoned from now on.
  snakeCharmers() {
    const s = this.s;

    for (const c of s.players.filter(
      (x) => x.alive && ability(x) === "snakecharmer",
    )) {
      const t = this.humanPicks(c)?.[0] ?? this.strat.snake(s, c);

      if (!t) {
        continue;
      }

      this.woke(c);
      this.chose(c, t);

      const swap = isDemon(t) && works(c);

      this.audit(
        "snakecharmer",
        `${c.label} (${name(c.role)}) chose ${t.label}; ${
          swap ? "swapped with the Demon" : "no effect"
        }.`,
        { actorId: c.id, targetId: t.id, effective: swap },
      );

      this.remember(c, snakeInfo(s, t));

      if (swap) {
        this.snakeSwap(c, t);
      }
    }
  },

  snakeSwap(c, d) {
    const demon = d.role;

    // The charmer becomes the Demon (keeping their Snake Charmer claim as a
    // bluff); the Demon becomes a poisoned, good Snake Charmer.
    c.role = demon;
    c.shown = demon;
    c.alignment = "evil";
    c.bluffs = d.bluffs;
    c.suspicion = null;

    d.role = "snakecharmer";
    d.shown = "snakecharmer";
    d.claim = "snakecharmer";
    d.alignment = "good";
    d.bluffs = [];
    d.suspicion = null;
    d.lastingPoison = true;
    d.poisoned = true;
    d.poisonedBy = "the Snake Charmer swap";

    this.audit(
      "succession",
      `${c.label} became the ${name(demon)}; ${d.label} is now a poisoned Snake Charmer.`,
      { playerId: c.id, previousDemonId: d.id },
    );
  },

  // At dusk: the Demon swapped into the Snake Charmer's old character stays
  // poisoned.
  snakeCharmerLasting() {
    for (const p of this.s.players.filter((x) => x.lastingPoison)) {
      p.poisoned = true;
      p.poisonedBy = "the Snake Charmer swap";
    }
  },
};

// The Snake Charmer, as told by someone claiming it without its ability
// (see bluff.js madeUpChoice()): the player they "chose" tonight.
export const info = {
  choice(s, p, strat) {
    const t = strat.snake(s, p);

    return t ? snakeInfo(s, t) : null;
  },
};

export const snakeInfo = (s, t) => ({
  night: s.night,
  role: "snakecharmer",
  text: `Snake Charmer: chose ${t.label}.`,
  targets: [t.id],
  trigger: "normal",
  functioning: true,
});
