import {
  ability,
  works,
  infoMode,
  bluffing,
  fishermanInfo,
} from "../../storyteller.js";

// The Fisherman, mixed into Engine.prototype (see characters/index.js),
// so `this` is the Engine.
export const fisherman = {
  // At dawn, NPC Fishermen (and Fisherman bluffers; see bluffing()) may
  // visit the Storyteller, once (see strategy fisherman()).
  npcFishermen() {
    const s = this.s;

    for (const p of s.players.filter(
      (x) =>
        !x.human &&
        x.alive &&
        !x.fishermanUsed &&
        (ability(x) === "fisherman" || bluffing(x, "fisherman")),
    )) {
      if (!this.strat.fisherman(s, p)) {
        continue;
      }

      p.fishermanUsed = true;

      if (ability(p) === "fisherman" && p.alignment === "good") {
        this.remember(p, fishermanInfo(s, p, infoMode(s, p)));
      } else {
        const spy = p.role === "spy" && works(p);

        this.rememberBluff(p, fishermanInfo(s, p, spy ? "truth" : "lie"));
      }
    }
  },

  // The human Fisherman's one visit to the Storyteller.
  fisherman() {
    const s = this.s;
    const h = this.human();

    if (
      s.phase !== "day" ||
      s.winner ||
      ability(h) !== "fisherman" ||
      !h.alive ||
      h.fishermanUsed
    ) {
      throw Error("Fisherman unavailable.");
    }

    h.fishermanUsed = true;

    const info = fishermanInfo(s, h, infoMode(s, h));

    this.remember(h, info);

    return info.text;
  },
};
