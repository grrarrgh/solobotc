import { name, MARIONETTE_HEAT, MARIONETTE_REVEAL_CHANCE } from "../../data.js";
import { lean } from "../../storyteller.js";
import { speak, heard } from "../../strategy.js";

// The Marionette, mixed into Engine.prototype (see characters/index.js),
// so `this` is the Engine.
export const marionette = {
  // How many of the living good NPCs suspect the Demon (0 to 1).
  demonHeat(d) {
    const good = this.s.players.filter(
      (x) => x.alive && !x.human && x.alignment === "good",
    );

    return good.length
      ? good.filter((x) => x.suspicion?.targetId === d.id).length / good.length
      : 0;
  },

  // From Night 2, when evil is losing or the Demon is under suspicion, the
  // Demon may tell its Marionette who they are (see MARIONETTE_* in data.js).
  marionetteReveal(d) {
    const s = this.s;
    const m = s.players.find(
      (x) => x.alive && x.role === "marionette" && !x.toldEvil,
    );

    // (By their jinx, while the Magician lives the Demon doesn't know which
    // neighbour is the Marionette.)
    if (!m || s.night < 2 || s.players.some((x) => x.alive && x.role === "magician")) {
      return;
    }

    const losing = lean(s) === "evil";
    const heat = this.demonHeat(d);

    if ((!losing && heat < MARIONETTE_HEAT) || s.r() >= MARIONETTE_REVEAL_CHANCE) {
      return;
    }

    m.toldEvil = s.night;
    m.suspicion = null;

    this.audit(
      "marionette",
      `${d.label} (${name(d.role)}) tells ${m.label} they are the Marionette (${
        losing ? "evil is losing" : `${Math.round(heat * 100)}% of the good players suspect the Demon`
      }). From now on they draw suspicion away from the Demon.`,
      { actorId: d.id, targetId: m.id },
    );
  },

  // Each morning after they're told, the Marionette spreads misleading
  // information in public: their latest (false) information, or else an
  // accusation of a good player. They keep claiming their Townsfolk, and
  // only spread information from it: a Marionette shown the Pixie who went
  // mad as the Monk doesn't repeat the Pixie's. (They also play for evil
  // from now on: see strategy sideOf().)
  marionetteDawn() {
    const s = this.s;

    for (const m of s.players.filter(
      (x) => x.alive && !x.human && x.role === "marionette" && x.toldEvil,
    )) {
      const latest = m.memories.filter((x) => x.role === m.claim).at(-1);
      const fresh = latest && latest !== m.lastSpread ? latest : null;
      const opinion = fresh ? null : this.strat.opinion(s, m);
      const said = fresh
        ? `I am the ${name(m.claim)}. ${
            fresh.day ? `Day ${fresh.day}` : `Night ${fresh.night}`
          }: ${speak(fresh.text)}`
        : opinion?.type === "suspicious"
          ? opinion.text
          : null;

      if (!said) {
        continue;
      }

      m.lastSpread = fresh ?? m.lastSpread;
      this.claimPublicly(m);
      heard(s, m, fresh ? [fresh] : [], opinion);
      s.publicLog.push(`Day ${s.day} — ${m.label} says: "${said}"`);

      this.audit(
        "marionette",
        `${m.label} (Marionette) spreads misleading information: "${said}"`,
        { playerId: m.id },
      );
    }
  },
};
