import { alignment } from "../../data.js";
import { ability, choiceInfo } from "../../storyteller.js";

// The Ogre, mixed into Engine.prototype (see characters/index.js),
// so `this` is the Engine.
export const ogre = {
  // On their first night (Night 1, or the night they gain the ability: see
  // startsTonight()), an NPC Ogre chooses a player and becomes their
  // alignment, even if drunk or poisoned. They don't learn which, so they
  // play on as if good. They remember whom they chose, and say so ("Ogre:
  // chose Player 7."), as a Monk says whom they protected.
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

      const side = recluse || t.role === "spy" ? "evil" : t.alignment;
      // (With the Spirit of Ivory on the script, they might stay good: see
      // characters/fabled/spiritofivory.js. Then the Recluse's "evil" isn't
      // what they learn either.)
      const kept = side === "evil" && this.ivoryKeepsGood(p, `the Ogre, choosing ${t.label}`);

      p.alignment = kept ? p.alignment : side;

      if (recluse && !kept) {
        p.toldEvil = true;
      }

      this.audit(
        "ogre",
        `${p.label} (Ogre) chose ${t.label}; they are ${p.alignment}${
          p.alignment === before ? "" : " now"
        } (${
          kept
            ? "they stay good: Spirit of Ivory"
            : recluse
              ? "the Recluse registers as evil, and they learn it"
              : "and don't know it"
        }).`,
        { actorId: p.id, targetId: t.id, alignment: p.alignment },
      );

      this.remember(p, choiceInfo(s, "ogre", "chose", [t]));
    }
  },
};

// The Ogre, as told by someone claiming it without its ability (see
// bluff.js madeUpChoice()): the player they "chose" on Night 1. (It says
// nothing for or against them: see strategy stanceOn().)
export const info = {
  choice(s, p, strat) {
    const t = s.night === 1 ? strat.ogre(s, p) : null;

    return t ? choiceInfo(s, "ogre", "chose", [t]) : null;
  },
};
