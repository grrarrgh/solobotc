import { works } from "../../storyteller.js";

// The Evil Twin, mixed into Engine.prototype (see characters/index.js),
// so `this` is the Engine.
export const eviltwin = {
  // On the first night, the good twin learns who their Evil Twin is.
  twinInfo() {
    const s = this.s;

    if (s.night !== 1 || !s.twins) {
      return;
    }

    this.remember(
      this.player(s.twins.goodId),
      evilTwinInfo(s, this.player(s.twins.evilId)),
    );
  },

  // While both twins live (and the Evil Twin works), good can't win.
  twinsBlockGood() {
    const t = this.s.twins;
    const evil = t && this.player(t.evilId);
    const good = t && this.player(t.goodId);

    return Boolean(
      evil?.role === "eviltwin" && works(evil) && good?.alive,
    );
  },

  // If the good twin is executed while the Evil Twin works, evil wins.
  goodTwinExecuted(n) {
    const t = this.s.twins;
    const evil = t && this.player(t.evilId);

    if (t?.goodId === n.id && evil?.role === "eviltwin" && works(evil)) {
      this.finish("evil", "The good twin was executed.");
      return true;
    }

    return false;
  },

  // On Day 1, each NPC twin says publicly that the other is their twin and
  // that they are the good one.
  twinsAnnounce() {
    const s = this.s;
    const t = s.twins;

    if (s.day !== 1 || !t) {
      return;
    }

    for (const [id, otherId] of [
      [t.evilId, t.goodId],
      [t.goodId, t.evilId],
    ]) {
      const p = this.player(id);
      const other = this.player(otherId);

      if (!p.human && p.alive) {
        s.publicLog.push(
          `Day ${s.day} — ${p.label} says ${other.label} is their twin, and that they are the good twin.`,
        );
      }
    }
  },
};

// What the good twin learns about the Evil Twin.
export const evilTwinInfo = (s, twin) => ({
  night: s.night,
  role: "eviltwin",
  // (The Evil Twin repeats this naming the good twin, who may be you.)
  text: `Evil Twin: ${twin.label} ${twin.human ? "are" : "is"} your Evil Twin.`,
  targets: [twin.id],
  trigger: "normal",
  functioning: true,
});

// How the good twin's information reads (see strategy stanceOn()).
export const info = {
  stance: () => "suspicious",
};
