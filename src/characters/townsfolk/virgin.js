import { name } from "../../data.js";

// The Virgin, mixed into Engine.prototype (see characters/index.js),
// so `this` is the Engine.
export const virgin = {
  // The Virgin's ability: the Townsfolk who nominated them (`by`, the human
  // or an NPC) is executed immediately, and the day ends.
  virgin(n, by, base) {
    const s = this.s;
    const from = s.publicLog.length;

    s.lastExecution = by.id;
    s.lastVote = null;
    s.block = null;
    s.executedToday = true;

    this.audit(
      "virgin",
      `${by.label} nominated ${n.label} (${name(n.role)}${
        n.role === "virgin" ? "" : `, with the ${name(n.wishGift)} ability from a Wizard's wish`
      }) and was executed.`,
      { actorId: by.id, targetId: n.id },
    );

    this.announce(
      by.human
        ? `Day ${s.day} — You nominated ${n.label} and were executed immediately.`
        : `Day ${s.day} — ${by.label} nominated ${n.label} and was executed immediately.`,
    );

    // (As any execution: the good twin's loses the game for good, and on
    // the Mastermind's extra day it decides the game. See engine execute().)
    if (!this.advocated(by)) {
      this.kill(by, "execution");

      if (!this.goodTwinExecuted(by)) {
        this.check();
      }
    }

    this.mastermindEnd(by);

    // (The day is over: any Gossip yet to speak today does so now.)
    if (!s.winner) {
      this.npcGossips(true);
    }

    this.phaseCard("dusk", from);

    if (!s.winner) {
      s.night++;
      this.night();
    }

    return { ...base, virgin: true };
  },
};
