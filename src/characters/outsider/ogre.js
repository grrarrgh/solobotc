import { alignment } from "../../data.js";
import { ability } from "../../storyteller.js";

// The Ogre, mixed into Engine.prototype (see characters/index.js),
// so `this` is the Engine.
export const ogre = {
  // On their first night (Night 1, or the night they gain the ability: see
  // startsTonight()), an NPC Ogre chooses a player and becomes their
  // alignment, even if drunk or poisoned. They don't learn which, so they
  // play on as if good.
  ogres() {
    const s = this.s;

    for (const p of s.players.filter(
      (x) =>
        x.alive &&
        !x.human &&
        ability(x) === "ogre" &&
        !x.ogreChose &&
        this.startsTonight(x),
    )) {
      const t = this.strat.ogre(s, p);

      if (!t) {
        continue;
      }

      p.ogreChose = true;
      this.woke(p);
      this.chose(p, t);

      const before = p.alignment;
      // By their jinxes, the Recluse registers as evil to the Ogre (and the
      // Ogre learns it), and so does the Spy.
      const recluse = t.role === "recluse";

      p.alignment = recluse || t.role === "spy" ? "evil" : t.alignment;

      if (recluse) {
        p.toldEvil = true;
      }

      this.audit(
        "ogre",
        `${p.label} (Ogre) chose ${t.label}; they are ${p.alignment}${
          p.alignment === before ? "" : " now"
        } (${recluse ? "the Recluse registers as evil, and they learn it" : "and don't know it"}).`,
        { actorId: p.id, targetId: t.id, alignment: p.alignment },
      );
    }
  },
};
