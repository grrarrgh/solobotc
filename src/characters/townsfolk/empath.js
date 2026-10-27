import {
  registersEvil,
  neigh,
  framed,
  evilNear,
  wrongNumber,
} from "../../storyteller.js";
import { pick } from "../../util.js";
import { bluffState } from "../../bluff.js";

// How many of p's living neighbours register as evil.
export const empathCount = (s, p) => neigh(s, p).filter(registersEvil).length;

// The Empath: how many of their 2 alive neighbours are evil.
export const info = {
  // A 0 vouches for both neighbours; anything else casts suspicion.
  stance: (m) => (/number: 0\./.test(m.text) ? "trust" : "suspicious"),
  nights: "each",
  truth(s, p) {
    return {
      targets: neigh(s, p).map((x) => x.id),
      text: `Empath number: ${empathCount(s, p)}.`,
    };
  },

  lie(s, p) {
    // Stay consistent: repeat last night's (wrong) number while the same two
    // neighbours sit either side; once one dies, report a different number.
    // With an evil neighbour, the number goes down, to hide them; otherwise,
    // with the evil team's scapegoat as a neighbour, it goes up.
    const near = neigh(s, p);
    const key = near.map((x) => x.id).join(",");
    const truth = empathCount(s, p);
    const last = p.empathBluff;
    const all = [0, 1, 2].filter((k) => k !== truth && k !== last?.n);
    const close = all.filter((k) => Math.abs(k - truth) === 1);
    const options = close.length ? close : all;
    // (Hiding an evil neighbour comes first: raising the number to frame
    // the scapegoat would point at them too.)
    const goat = framed(s, p);
    const framing = evilNear(s, p).length
      ? options.filter((k) => k < truth)
      : near.includes(goat)
        ? options.filter((k) => k > truth)
        : options;

    // (An evil bluffer next to a teammate, or to you, says 0: anything more
    // points at them, and you're never anyone's suspect.)
    const n =
      p.alignment === "evil" && (evilNear(s, p).length || near.some((x) => x.human))
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

  // A good pretender's (see bluff.js): the same number while the same two
  // neighbours sit either side, as a real Empath's would be; a new one at
  // random once one of them dies. (Next to you, 0: you're never anyone's
  // suspect.)
  story(s, p) {
    const near = neigh(s, p);
    const key = near.map((x) => x.id).join(",");
    const said = bluffState(p).said;
    const n = near.some((x) => x.human)
      ? 0
      : said.empath?.key === key
        ? said.empath.n
        : Math.floor(s.r() * 3);

    said.empath = { key, n };

    return { targets: near.map((x) => x.id), text: `Empath number: ${n}.` };
  },
};
