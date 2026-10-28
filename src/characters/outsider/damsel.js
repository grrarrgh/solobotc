import { name, team } from "../../data.js";
import { works } from "../../storyteller.js";
import { sideOf } from "../../strategy.js";

// The Damsel, mixed into Engine.prototype (see characters/index.js),
// so `this` is the Engine. She hides, claiming a Townsfolk that isn't in
// play, until she dies (see setup.js, strategy revealsWhenDead()).
export const damsel = {
  // Night 1: the Minions learn a Damsel is in play (and again when the
  // Pit-Hag makes one).
  damselFirstNight() {
    if (this.s.night === 1 && this.s.players.some((x) => x.role === "damsel")) {
      this.damselKnown();
    }
  },

  damselKnown() {
    this.s.damselKnown = true;
    this.audit("damsel", "The Minions learn that a Damsel is in play.");
  },

  // At dusk, by the jinxes (see JINXES): while the Spy or the Widow is, or
  // has been, in play, the Damsel is poisoned.
  damselLasting() {
    const s = this.s;
    const jinx = s.players.find((x) => ["spy", "widow"].includes(x.role));

    s.damselJinx ??= jinx?.role ?? null;

    if (!s.damselJinx) {
      return;
    }

    for (const d of s.players.filter((x) => x.role === "damsel")) {
      d.poisoned = true;
      d.poisonedBy = `the ${name(s.damselJinx)} and Damsel jinx`;
    }
  },

  // At dawn, one NPC Minion at most guesses the Damsel, in public (see
  // strategy damselGuess()); or at End day, when their Demon `doomed` is
  // about to be executed (see endDay()), as a last chance.
  npcDamselGuesses(doomed = null) {
    const s = this.s;

    if (!s.damselKnown || s.winner) {
      return;
    }

    // A dead Damsel's ability is gone: once a dead player who isn't evil has
    // revealed they were her (see engine learnsDeath()), the Minions stop
    // guessing (see strategy damselGuess()).
    const dead = s.players.find((x) => !x.alive && x.claim === "damsel" && x.alignment !== "evil");

    if (dead && !s.damselRevealed) {
      s.damselRevealed = dead.id;
      this.audit(
        "damsel",
        `The Minions stop guessing the Damsel: ${dead.label} died and revealed they were her.`,
        { playerId: dead.id },
      );
    }

    for (const m of s.players.filter(
      (x) =>
        !x.human && x.alive && team(x.role) === "minion" && sideOf(x) === "evil",
    )) {
      const t = this.strat.damselGuess(s, m, doomed);

      if (t) {
        this.damselGuess(m, t);
        return;
      }
    }
  },

  // Minion m guesses, in public, that t is the Damsel (once): right, and her
  // ability working, good loses. Everyone saw it: only a Minion's guess
  // counts, so good NPCs count it against m (EVIDENCE_WEIGHT.damselGuess).
  damselGuess(m, t) {
    const s = this.s;
    const right = t.role === "damsel" && works(t);
    // Why they chose t (see strategy damselGuess()).
    const why = m.damselWhy;

    delete m.damselWhy;
    m.damselGuessed = true;
    (s.damselGuesses ??= []).push({ byId: m.id, targetId: t.id, day: s.day });
    s.publicLog.push(
      `Day ${s.day} — ${m.label} guesses ${t.human ? "you are" : `${t.label} is`} the Damsel.`,
    );
    this.audit(
      "damsel",
      `${m.label} (${name(m.role)}) guessed ${t.label} (${name(t.role)}) is the Damsel${
        why ? ` (why: ${why})` : ""
      }: ${
        right ? "right" : t.role === "damsel" ? "right, but she has no ability" : "wrong"
      }.`,
      { actorId: m.id, targetId: t.id, right },
    );

    if (right) {
      this.finish("evil", "A Minion guessed the Damsel.");
    } else {
      this.announce(`Day ${s.day} — Nothing happens.`);
    }
  },
};
