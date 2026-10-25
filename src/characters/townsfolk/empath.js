import {
  registersEvil,
  neigh,
  framed,
  evilNear,
  wrongNumber,
} from "../../storyteller.js";
import { pick } from "../../util.js";

// How many of p's living neighbours register as evil.
export const empathCount = (s, p) => neigh(s, p).filter(registersEvil).length;

// The Empath: how many of their 2 alive neighbours are evil.
export const info = {
  truth(s, p) {
    return {
      targets: neigh(s, p).map((x) => x.id),
      text: `Empath number: ${empathCount(s, p)}.`,
    };
  },

  lie(s, p) {
    // Stay consistent: repeat last night's (wrong) number while the same two
    // neighbours sit either side; once one dies, report a different number.
    // With the evil team's scapegoat as a neighbour, the number goes up.
    const near = neigh(s, p);
    const key = near.map((x) => x.id).join(",");
    const truth = empathCount(s, p);
    const last = p.empathBluff;
    const all = [0, 1, 2].filter((k) => k !== truth && k !== last?.n);
    const close = all.filter((k) => Math.abs(k - truth) === 1);
    const options = close.length ? close : all;
    // With the scapegoat as a neighbour the number goes up; otherwise, with an
    // evil neighbour, it goes down.
    const framing = near.includes(framed(s, p))
      ? options.filter((k) => k > truth)
      : evilNear(s, p).length
        ? options.filter((k) => k < truth)
        : options;

    // (An evil bluffer next to a teammate says 0: anything more points at
    // them.)
    const n =
      p.alignment === "evil" && evilNear(s, p).length
        ? 0
        : last && last.key === key && last.n !== truth
          ? last.n
          : (pick(framing.length ? framing : options, s.r) ??
            wrongNumber(s, truth));

    p.empathBluff = { key, n };

    return {
      targets: near.map((x) => x.id),
      text: `Empath number: ${n}.`,
    };
  },

  random(s, p, targets) {
    return {
      targets,
      text: `Empath number: ${Math.floor(s.r() * 3)}.`,
    };
  },
};
