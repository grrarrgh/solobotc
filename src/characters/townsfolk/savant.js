import {
  ability,
  works,
  infoMode,
  savantInfo,
  bluffing,
} from "../../storyteller.js";

// The Savant, mixed into Engine.prototype (see characters/index.js),
// so `this` is the Engine.
export const savant = {
  // NPC Savants (and Savant bluffers; see bluffing()) visit the Storyteller each day.
  npcSavants() {
    const s = this.s;

    for (const p of s.players.filter(
      (x) =>
        !x.human &&
        x.alive &&
        x.savantDay !== s.day &&
        (ability(x) === "savant" || bluffing(x, "savant")),
    )) {
      p.savantDay = s.day;

      if (ability(p) === "savant" && p.alignment === "good") {
        this.remember(p, savantInfo(s, p, infoMode(s, p)));
      } else {
        const spy = p.role === "spy" && works(p);

        this.rememberBluff(p, savantInfo(s, p, spy ? "truth" : "lie"));
      }
    }
  },

  // The human Savant's daily visit to the Storyteller.
  savant() {
    const s = this.s;
    const h = this.human();

    if (
      s.phase !== "day" ||
      s.winner ||
      ability(h) !== "savant" ||
      !h.alive ||
      h.savantDay === s.day
    ) {
      throw Error("Savant unavailable.");
    }

    h.savantDay = s.day;

    const info = savantInfo(s, h, infoMode(s, h));

    this.remember(h, info);

    return info.text;
  },
};
