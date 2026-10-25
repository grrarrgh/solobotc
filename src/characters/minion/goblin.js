import { GOBLIN_CLAIM_CHANCE } from "../../data.js";
import { isDrunk, works } from "../../storyteller.js";

// The Goblin, mixed into Engine.prototype (see characters/index.js),
// so `this` is the Engine.
export const goblin = {
  // n was just nominated: an NPC Goblin may claim it in public
  // (GOBLIN_CLAIM_CHANCE), and so does a good NPC the Cerenovus made mad
  // that they're the Goblin today. Returns the Public Log line, or null.
  goblinClaim(n) {
    const s = this.s;
    const mad = n.mad?.role === "goblin" && n.mad.day === s.day;
    const real = n.role === "goblin" && n.alive;

    if (n.human || this.goblinClaimed(n) || !(mad || (real && s.r() < GOBLIN_CLAIM_CHANCE))) {
      return null;
    }

    const line = `Day ${s.day} — ${n.label} says: "I'm the Goblin! Execute me today, and evil wins."`;

    (s.goblinClaims ??= []).push({ id: n.id, day: s.day });
    n.claim = "goblin";
    n.cover = null;
    this.claimPublicly(n);
    this.outed(n, "they claimed the Goblin in public");
    s.publicLog.push(line);
    this.audit(
      "goblin",
      `${line.replace(/^Day \d+ — /, "")} (${
        mad
          ? "mad that they're the Goblin: the Cerenovus"
          : works(n)
            ? "the real Goblin"
            : "the real Goblin, but drunk or poisoned"
      })`,
      { playerId: n.id, mad },
    );

    return line;
  },

  // Whether p claimed the Goblin in public today.
  goblinClaimed(p) {
    return (this.s.goblinClaims ?? []).some((x) => x.id === p.id && x.day === this.s.day);
  },

  // p was just executed: a sober and healthy Goblin who claimed it today
  // wins for their team (dead by now, or not). Returns whether they did.
  goblinWins(p) {
    if (p.role !== "goblin" || isDrunk(p) || p.poisoned || !this.goblinClaimed(p)) {
      return false;
    }

    this.audit("goblin", `${p.label} claimed the Goblin when nominated, and was executed: ${p.alignment} wins.`, {
      playerId: p.id,
    });
    this.finish(p.alignment, "The Goblin claimed it when nominated, and was executed.");

    return true;
  },
};
