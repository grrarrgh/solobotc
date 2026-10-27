import { registersEvil, covered, framed } from "../../storyteller.js";
import { pick } from "../../util.js";

// Clockwise is round the town square towards higher seat numbers (1), and
// anti-clockwise towards lower ones (-1).
const WAYS = { 1: "clockwise", [-1]: "anti-clockwise" };

// How many steps from p, going `d`, to the nearest living player who passes
// `test` (counting living players only; Infinity if nobody does).
function steps(s, p, d, test) {
  const a = s.players;
  const n = a.length;
  const i = a.indexOf(p);
  let k = 0;

  for (let j = 1; j < n; j++) {
    const x = a[(i + d * j + n * n) % n];

    if (!x.alive) {
      continue;
    }

    k++;

    if (test(x)) {
      return k;
    }
  }

  return Infinity;
}

// The next living player from p, going `d`: who the direction points at
// first, to say which way it is.
function next(s, p, d) {
  const a = s.players;
  const n = a.length;
  const i = a.indexOf(p);

  for (let j = 1; j < n; j++) {
    const x = a[(i + d * j + n * n) % n];

    if (x.alive) {
      return x;
    }
  }

  return p;
}

// The side p's closest player passing `test` is on: 1 or -1, or 0 if
// they're equidistant (or there's nobody).
export function closestWay(s, p, test) {
  const cw = steps(s, p, 1, test);
  const acw = steps(s, p, -1, test);

  return cw < acw ? 1 : acw < cw ? -1 : 0;
}

const said = (s, p, d) => ({
  targets: [],
  text: `Shugenja: the closest evil player is ${WAYS[d]} (towards ${next(s, p, d).label}).`,
});

// The Shugenja: which way round the circle their closest evil player is.
// (Equidistant, the Storyteller's arbitrary choice: here, at random.)
export const info = {
  nights: "first",
  truth(s, p) {
    const d = closestWay(s, p, (x) => registersEvil(x));

    return said(s, p, d || pick([1, -1], s.r));
  },

  // The other way from the closest player it covers for (see covered()): a
  // misinformed good Shugenja's closest evil player, an evil bluffer's
  // closest teammate. Equidistant, towards the evil team's scapegoat, if
  // one is closer one way.
  lie(s, p) {
    const d = closestWay(s, p, (x) => covered(p, x));

    if (d) {
      return said(s, p, -d);
    }

    const goat = framed(s, p);
    const towards = goat ? closestWay(s, p, (x) => x === goat) : 0;

    return said(s, p, towards || pick([1, -1], s.r));
  },

  random(s, p) {
    return said(s, p, pick([1, -1], s.r));
  },
};
