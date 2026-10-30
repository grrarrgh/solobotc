import { name } from "../../data.js";
import { ability, works, isDemon } from "../../storyteller.js";

// The Golem, mixed into Engine.prototype (see characters/index.js), so
// `this` is the Engine.
//
// "You may only nominate once per game. When you do, if the nominee is not
// the Demon, they die": the nominee dies at once (the town hears only that
// they died), and the vote goes on as usual (on a dead player, good NPCs
// don't vote: see strategy vote()). The Demon (or the Recluse, who
// registers as one) doesn't die, and nothing is said; nor does anyone, if
// the Golem is drunk or poisoned. You can't nominate again once you've used
// it (see golemBarred()); an NPC Golem nominates once only 5 or 4 players
// are alive, never you, and anyone bluffing the Golem never nominates (see
// strategy nomination(), nominator()).
//
// A nominee who lives through it (s.golem) is evidence against them for
// good NPCs who know the nominator claims the Golem (see strategy
// evidence()), not proof; and on that vote, good NPCs vote only if your
// hand is up (see strategy vote()): whether it's the execution that wins is
// your call.
export const golem = {
  // Why p can't nominate now, as the Golem who has (or null).
  golemBarred(p) {
    return ability(p) === "golem" && p.golemUsed
      ? `${p.human ? "You have" : `${p.label} has`} already nominated: the Golem may only nominate once per game.`
      : null;
  },

  // p nominated n (a player, or the Storyteller): if p is the Golem, that's
  // their one nomination, and n dies unless they're the Demon. Returns
  // whether n died.
  golemNominates(p, n) {
    const s = this.s;

    if (ability(p) !== "golem" || p.golemUsed) {
      return false;
    }

    p.golemUsed = s.day;

    if (n.storyteller) {
      this.audit(
        "golem",
        `${p.label} (Golem) used ${p.human ? "your" : "their"} one nomination on the Storyteller, who isn't a player: nothing happens.`,
        { actorId: p.id },
      );
      return false;
    }

    const effective = works(p);
    // (The Recluse registers as the Demon, as to the Slayer.)
    const demon = isDemon(n) || n.role === "recluse";
    const died = effective && !demon && this.kill(n, "golem");

    (s.golem ??= []).push({ day: s.day, byId: p.id, nomineeId: n.id, died, alive: n.alive });

    this.audit(
      "golem",
      `${p.label} (Golem) used ${p.human ? "your" : "their"} one nomination on ${n.label} (${name(n.role)})${
        !n.alive && !died
          ? ", who was already dead: nothing happens"
          : died
            ? ": not the Demon, so they die"
            : !effective
              ? ": the Golem is drunk or poisoned, so nothing happens (it looks as if they're the Demon)"
              : demon
                ? `: ${isDemon(n) ? "the Demon" : "the Recluse, who registers as the Demon"}, so nothing happens`
                : ": they can't die, so nothing happens"
      }.`,
      { actorId: p.id, targetId: n.id, died, effective },
    );

    if (died) {
      this.confirm(p, "certain", `their Golem nomination killed ${n.label}`);
      this.check();
    }

    return died;
  },

};

// Whether the vote on n hangs on your hand: n is today's nominee of a Golem
// (one with the ability), alive. (Then good NPCs vote only if your hand is
// up: see strategy vote().)
export const golemHinge = (s, n) =>
  Boolean(n.alive) && (s.golem ?? []).some((g) => g.day === s.day && g.nomineeId === n.id && !g.died);
