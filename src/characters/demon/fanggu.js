import { team } from "../../data.js";

// The Fang Gu, mixed into Engine.prototype (see characters/index.js),
// so `this` is the Engine.
export const fanggu = {
  // The first Outsider a Fang Gu kills becomes an evil Fang Gu instead, and
  // the old Fang Gu dies. Returns whether that happened.
  fangGuJump(d, t) {
    const s = this.s;

    if (
      d.role !== "fanggu" ||
      s.fangGuJumped ||
      t.human ||
      team(t.role) !== "outsider"
    ) {
      return false;
    }

    s.fangGuJumped = true;
    t.role = "fanggu";
    t.shown = "fanggu";
    t.alignment = "evil";
    t.bluffs = d.bluffs;
    t.suspicion = null;

    this.audit(
      "succession",
      `${t.label} became an evil Fang Gu; ${d.label} died instead.`,
      { playerId: t.id, previousDemonId: d.id },
    );

    this.kill(d, "fanggu");

    return true;
  },
};
