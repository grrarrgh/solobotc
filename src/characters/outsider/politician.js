import { isDrunk } from "../../storyteller.js";

// Why Politician p was the player most responsible for their team losing,
// or null: the game was lost by an execution they nominated, or one their
// vote decided (it got exactly the votes it needed).
export function politicianBlame(s, p) {
  const id = s.executing;
  const vote = id && (s.voteHistory ?? []).findLast(
    (x) => x.day === s.day && x.nomineeId === id,
  );

  if (!vote) {
    return null;
  }

  return vote.nominatorId === p.id
    ? "nominated the execution that lost the game"
    : vote.voterIds.includes(p.id) && vote.count === vote.needed
      ? "cast a deciding vote on the execution that lost the game"
      : null;
}

// The Politician, mixed into Engine.prototype (see characters/index.js),
// so `this` is the Engine.
export const politician = {
  // The game ends with `winner` winning: a sober and healthy Politician (alive
  // or dead) on the losing team who lost it for them changes alignment, and
  // wins. (Checked whichever way it goes, for the log.)
  politicianEnd(winner) {
    for (const p of this.s.players.filter((x) => x.role === "politician")) {
      if (p.alignment === winner) {
        continue;
      }

      // (An evil player the Pit-Hag made the Politician can't turn good:
      // their jinx.)
      const why = politicianBlame(this.s, p);
      const sober =
        !isDrunk(p) && !p.poisoned && !(p.politicianStaysEvil && winner === "good");

      if (why && sober) {
        p.alignment = winner;
      }

      this.audit(
        "politician",
        why
          ? `${p.label} (Politician) ${why}${
              sober ? `: they turn ${winner}, and win.` : ", but has no ability."
            }`
          : `${p.label} (Politician) wasn't the most responsible for their team losing.`,
        { playerId: p.id, responsible: Boolean(why), turned: Boolean(why && sober) },
      );
    }
  },
};
