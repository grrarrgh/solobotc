import { ARTIST_QUESTIONS } from "../../data.js";
import {
  ability,
  works,
  infoMode,
  bluffing,
  artistInfo,
} from "../../storyteller.js";

// The Artist, mixed into Engine.prototype (see characters/index.js),
// so `this` is the Engine.
export const artist = {
  // At dawn, NPC Artists (and NPCs bluffing Artist; see bluffing()) ask their question.
  npcArtists() {
    const s = this.s;

    for (const p of s.players) {
      const claimsArtist = ability(p) === "artist" || bluffing(p, "artist");

      if (s.winner || p.human || !p.alive || p.artistUsed || !claimsArtist) {
        continue;
      }

      const ask = this.strat.artist(s, p);

      if (!ask) {
        continue;
      }

      p.artistUsed = true;

      if (ability(p) === "artist" && p.alignment === "good") {
        this.remember(
          p,
          artistInfo(s, ask.targets, ask.question, infoMode(s, p)),
        );
      } else {
        const spy = p.role === "spy" && works(p);

        this.rememberBluff(
          p,
          artistInfo(s, ask.targets, ask.question, spy ? "truth" : "lie"),
        );
      }
    }
  },

  // Once per game, the human Artist asks the Storyteller a yes/no question
  // about a player.
  artist(id, question) {
    const s = this.s;
    const h = this.human();
    const t = this.player(id);

    if (
      s.phase !== "day" ||
      s.winner ||
      ability(h) !== "artist" ||
      h.artistUsed ||
      !h.alive ||
      !t ||
      !ARTIST_QUESTIONS[question]
    ) {
      throw Error("Artist unavailable.");
    }

    h.artistUsed = true;

    const info = artistInfo(s, t, question, infoMode(s, h));

    this.remember(h, info);

    return info.text;
  },
};
