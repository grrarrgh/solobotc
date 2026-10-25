import { GOBLIN_CLAIM_CHANCE } from "../../data.js";
import { isDrunk, works, minionAbility, minionLabel } from "../../storyteller.js";

// The Goblin, mixed into Engine.prototype (see characters/index.js),
// so `this` is the Engine.
export const goblin = {
  // n was just nominated: an NPC Goblin (or Alchemist with the ability) may
  // claim it in public (GOBLIN_CLAIM_CHANCE), and so does a good NPC the
  // Cerenovus made mad that they're the Goblin today. You claim it when you
  // nominate yourself (see goblinSelfNomination()). Returns the Public Log
  // line, or null.
  goblinClaim(n) {
    const s = this.s;
    const mad = n.mad?.role === "goblin" && n.mad.day === s.day;
    const real = minionAbility(n) === "goblin" && n.alive;
    const claims = n.human ? real && n.goblinSelf === s.day : mad || (real && s.r() < GOBLIN_CLAIM_CHANCE);

    if (this.goblinClaimed(n) || !claims) {
      return null;
    }

    // (An Alchemist-Goblin's team is good: "your team wins".)
    const team = n.alignment === "good" && !mad ? "good" : "evil";
    const line = `Day ${s.day} — ${n.human ? "You say" : `${n.label} says`}: "I'm the Goblin! Execute me today, and ${
      n.human || n.role !== "goblin" ? "my team wins" : `${team} wins`
    }."`;

    (s.goblinClaims ??= []).push({ id: n.id, day: s.day });

    if (!n.human) {
      n.claim = "goblin";
      n.cover = null;
      this.claimPublicly(n);
      this.outed(n, "they claimed the Goblin in public");
    }
    s.publicLog.push(line);
    this.audit(
      "goblin",
      `${line.replace(/^Day \d+ — /, "")} (${
        mad
          ? "mad that they're the Goblin: the Cerenovus"
          : `the real ${minionLabel(n)}${works(n) ? "" : ", but drunk or poisoned"}`
      })`,
      { playerId: n.id, mad },
    );

    return line;
  },

  // Whether p claimed the Goblin in public today.
  goblinClaimed(p) {
    return (this.s.goblinClaims ?? []).some((x) => x.id === p.id && x.day === this.s.day);
  },

  // p was just executed: a sober and healthy Goblin (or Alchemist with the
  // ability) who claimed it today wins for their team (dead by now, or
  // not). Returns whether they did.
  goblinWins(p) {
    if (minionAbility(p) !== "goblin" || isDrunk(p) || p.poisoned || !this.goblinClaimed(p)) {
      return false;
    }

    this.audit("goblin", `${p.label} claimed the Goblin when nominated, and was executed: ${p.alignment} wins.`, {
      playerId: p.id,
    });
    this.finish(p.alignment, "The Goblin claimed it when nominated, and was executed.");

    return true;
  },

  // You, an Alchemist with the Goblin's ability, nominate yourself and
  // claim it: if you're executed today, good wins. (`hand` as for
  // nominate().)
  goblinSelfNomination(hand = true) {
    const s = this.s;
    const h = this.human();

    if (minionAbility(h) !== "goblin" || !h.alive || s.phase !== "day" || s.winner) {
      throw Error("Goblin unavailable.");
    }

    if (s.dayNominators.includes(h.id)) {
      throw Error("You have already nominated today.");
    }

    if (this.nominatedToday(h.id)) {
      throw Error("Already nominated today.");
    }

    if (s.pendingVote || s.roshambo) {
      throw Error("Finish the vote first.");
    }

    h.goblinSelf = s.day;
    s.publicLog.push(`Day ${s.day} — You nominate yourself.`);

    return this.runNomination(h, h, false, hand);
  },
};
