import { team } from "../../data.js";
import { byId, pick, claimHeard } from "../../util.js";
import { nameable } from "../../storyteller.js";
import { bluffState } from "../../bluff.js";

const balloonText = (t) => `Balloonist: shown ${t.label}.`;

// The Balloonist: a player of a different character type from the one
// shown last night (any type on Night 1).
export const info = {
  nights: "each",

  // The type of player they were shown (tomorrow's must differ), and for a
  // working one, the types seen so far this cycle (a type seen again
  // starts a new one).
  keep(s, p, m) {
    const t = byId(s, m.targets[0]);

    if (t) {
      const k = team(t.role);
      const cycle = p.balloonCycle ?? [];

      p.balloonType = k;

      if (m.functioning) {
        p.balloonCycle = cycle.includes(k) ? [k] : [...cycle, k];
      }
    }

    return m;
  },

  // A working Balloonist sees each type in play once, in random order
  // (p.balloonCycle), then starts again with another random order.
  truth(s, p) {
    const named = nameable(s, p);
    const inPlay = [...new Set(named.map((x) => team(x.role)))].filter(
      (k) => k !== p.balloonType,
    );
    const left = inPlay.filter((k) => !(p.balloonCycle ?? []).includes(k));
    const type = pick(left.length ? left : inPlay, s.r);
    const t = pick(
      named.filter((x) => team(x.role) === type),
      s.r,
    );

    return t
      ? { targets: [t.id], text: balloonText(t) }
      : { targets: [], text: "No information." };
  },

  // A player of the same type as last night's (any player on Night 1). An
  // evil bluffer goes by what players claim instead, so their story holds
  // up: a player whose claimed type differs from last night's.
  lie(s, p) {
    const named = nameable(s, p);

    if (p.alignment === "evil") {
      const claimed = (x) => team(claimHeard(x, p)) ?? null;
      const differs = named.filter(
        (x) => claimed(x) && claimed(x) !== bluffState(p).balloonType,
      );
      const unknown = named.filter((x) => !claimed(x));
      const t = pick(differs.length ? differs : unknown.length ? unknown : named, s.r);

      bluffState(p).balloonType = t ? claimed(t) : null;

      return t
        ? { targets: [t.id], text: balloonText(t) }
        : { targets: [], text: "No information." };
    }

    const same = named.filter(
      (x) => p.balloonType && team(x.role) === p.balloonType,
    );
    const t = pick(same.length ? same : named, s.r);

    return t
      ? { targets: [t.id], text: balloonText(t) }
      : { targets: [], text: "No information." };
  },

  random(s, p) {
    const t = pick(nameable(s, p), s.r);

    return t
      ? { targets: [t.id], text: balloonText(t) }
      : { targets: [], text: "No information." };
  },
};
