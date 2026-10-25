import { RECLUSE_SAGE_CHANCE } from "../../data.js";
import {
  ability,
  bluffing,
  infoMode,
  isDemon,
  nameable,
  steer,
  killHelps,
} from "../../storyteller.js";
import { pick, sample, shuffle, whose } from "../../util.js";
import { dayBluff } from "../../bluff.js";

// The Sage, mixed into Engine.prototype (see characters/index.js),
// so `this` is the Engine.
export const sage = {
  // The Sage, killed by the Demon, learns the Demon is 1 of 2 players. An
  // evil Sage bluffer "learns" a false pair (true for the Spy).
  sageDeath(p, cause) {
    const s = this.s;

    if (cause !== "demon") {
      return;
    }

    if (ability(p) === "sage") {
      this.remember(p, sageInfo(s, p, infoMode(s, p, true)));
    } else if (bluffing(p, "sage")) {
      this.rememberBluff(
        p,
        dayBluff(s, p, "sage", this.strat, (mode) => sageInfo(s, p, mode), true),
      );
    }
  },
};

// The Sage, killed by the Demon: the Demon is one of two players.
// By the Recluse and Sage jinx, a living Recluse might register as the
// Demon (at RECLUSE_SAGE_CHANCE): shown in the Demon's place.
export function sageInfo(s, p, mode) {
  const demon = s.players.find((x) => x.alive && isDemon(x));
  const recluse = s.players.find((x) => x.alive && x !== p && x.role === "recluse");
  const d =
    mode === "truth" && demon && recluse && s.r() < RECLUSE_SAGE_CHANCE
      ? recluse
      : demon;
  const others = nameable(s, p).filter((x) => x !== d && x !== demon);
  const pair =
    mode === "truth" && d
      ? [
          d,
          pick(
            steer(s, others, killHelps, `the other player ${whose(p)} Sage sees`),
            s.r,
          ),
        ]
      : mode === "lie" || !d
        ? sample(others, 2, s.r)
        : sample(nameable(s, p), 2, s.r);
  const [a, b] = shuffle(pair.filter(Boolean), s.r);

  return {
    night: s.night,
    role: "sage",
    text: b ? `Sage: the Demon is ${a.label} or ${b.label}.` : "No information.",
    targets: [a, b].filter(Boolean).map((x) => x.id),
    trigger: "death",
    functioning: mode === "truth",
  };
}

// How the Sage's information reads (see strategy stanceOn()).
export const info = {
  stance: () => "suspicious",
};
