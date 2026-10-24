import { alignment } from "../../data.js";

// The Ogre, mixed into Engine.prototype (see characters/index.js),
// so `this` is the Engine.
export const ogre = {
  // On their first night, an NPC Ogre chooses a player and becomes their
  // alignment, even if drunk or poisoned. They don't learn which, so they
  // play on as if good.
  ogres() {
    const s = this.s;

    if (s.night !== 1) {
      return;
    }

    for (const p of s.players.filter(
      (x) => x.alive && !x.human && x.role === "ogre",
    )) {
      const t = this.strat.ogre(s, p);

      if (!t) {
        continue;
      }

      this.woke(p);
      this.chose(p, t);

      const before = p.alignment;

      p.alignment = t.alignment;

      this.audit(
        "ogre",
        `${p.label} (Ogre) chose ${t.label}; they are ${p.alignment}${
          p.alignment === before ? "" : " now"
        } (and don't know it).`,
        { actorId: p.id, targetId: t.id, alignment: p.alignment },
      );
    }
  },
};
