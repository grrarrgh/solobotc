import { team } from "../../data.js";
import { bySeat, pick, whose } from "../../util.js";
import {
  lean,
  leanNote,
  works,
  vortoxActive,
  shownBefore,
  unknownMate,
} from "../../storyteller.js";

const priestessText = (t) => `High Priestess: talk to ${t.label}.`;

// Whether the High Priestess would do well to talk to x: an evil player
// (whose bluff may not hold up), or a good player with information: true
// (an Oracle's number counts, though it names nobody), or wrong (drunk or
// poisoned, to be set right).
function worthTalking(s, x) {
  if (x.alignment === "evil") {
    return true;
  }

  return x.memories.some(
    (m) =>
      m.functioning === false ||
      (m.functioning && !/^No information\.?$/.test(m.text) && m.role !== "philosopher"),
  );
}

// Who the Storyteller believes the High Priestess should talk to most: a
// living NPC worth talking to (see worthTalking()), unless the Storyteller
// is helping evil (see lean()), when it's one who isn't. Misinformed
// (`truth` false), a good player who isn't worth it; an evil bluffer names
// a teammate, who backs them up.
function priestessPick(s, p, truth = true) {
  // (Never one they were shown before, while there's anyone else.)
  const living = s.players.filter((x) => x.alive && !x.human && x !== p);
  const seen = shownBefore(s, p, "highpriestess");
  const unseen = living.filter((x) => !seen.has(x.id));
  const pool = unseen.length ? unseen : living;
  const helps = (x) => (worthTalking(s, x) ? "good" : "evil");

  if (!truth) {
    // (An evil bluffer sends you to a teammate, as one worth avoiding: never
    // one they don't know, while the Poppy Grower keeps them apart, nor the
    // Bounty Hunter's evil Townsfolk.)
    const mates = pool.filter((x) => x.alignment === "evil" && !unknownMate(p, x));
    const dull = pool.filter((x) => helps(x) === "evil");

    return pick(p.alignment === "evil" && mates.length ? mates : dull.length ? dull : pool, s.r);
  }

  const side = lean(s) ?? "good";
  const better = pool.filter((x) => helps(x) === side);

  // (Only noted when it's what they'll learn: a misinformed High Priestess
  // learns something else; see nightInfo().)
  if (
    lean(s) &&
    works(p) &&
    !(team(p.role) === "townsfolk" && vortoxActive(s)) &&
    better.length &&
    better.length < pool.length
  ) {
    leanNote(
      s,
      `who ${whose(p)} High Priestess should talk to: one of ${bySeat(better)
        .map((x) => x.label)
        .join(", ")}.`,
    );
  }

  return pick(better.length ? better : pool, s.r);
}

// The High Priestess: who the Storyteller believes they should talk to most.
export const info = {
  nights: "each",
  truth(s, p) {
    const t = priestessPick(s, p);

    return t
      ? { targets: [t.id], text: priestessText(t) }
      : { targets: [], text: "No information." };
  },

  lie(s, p) {
    const t = priestessPick(s, p, false);

    return t
      ? { targets: [t.id], text: priestessText(t) }
      : { targets: [], text: "No information." };
  },

  random(s, p) {
    const living = s.players.filter((x) => x.alive && !x.human && x.id !== p.id);
    const seen = shownBefore(s, p, "highpriestess");
    const unseen = living.filter((x) => !seen.has(x.id));
    const t = pick(unseen.length ? unseen : living, s.r);

    return t
      ? { targets: [t.id], text: priestessText(t) }
      : { targets: [], text: "No information." };
  },
};
