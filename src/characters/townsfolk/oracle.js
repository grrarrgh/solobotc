import { pick } from "../../util.js";
import { registersEvil, range, wrongNumber } from "../../storyteller.js";
import { bluffState } from "../../bluff.js";

const deadCount = (s) => s.players.filter((x) => !x.alive).length;
const deadEvil = (s) => s.players.filter((x) => !x.alive && registersEvil(x)).length;

const oracleText = (n) =>
  `Oracle: ${n} dead player${n === 1 ? " is" : "s are"} evil.`;

// The Oracle: how many dead players are evil.
export const info = {
  nights: "later",
  truth(s) {
    return { targets: [], text: oracleText(deadEvil(s)) };
  },

  // Never more evil dead than there are dead, and never fewer than they
  // said before (the dead don't come back), so the lie can't be caught out.
  lie(s, p) {
    const n = deadEvil(s);
    const least = Math.min(p.oracleSaid ?? 0, deadCount(s));
    const said =
      wrongNumber(s, n, range(least, deadCount(s))) ?? Math.max(n, least);

    p.oracleSaid = said;

    return { targets: [], text: oracleText(said) };
  },

  random(s) {
    return {
      targets: [],
      text: oracleText(pick(range(0, deadCount(s)), s.r)),
    };
  },

  // A good pretender's (see bluff.js): at random, but never more evil dead
  // than there are dead, nor fewer than they said before.
  story(s, p) {
    const said = bluffState(p).said;
    const least = Math.min(said.oracle ?? 0, deadCount(s));
    const n = pick(range(least, deadCount(s)), s.r);

    said.oracle = n;

    return { targets: [], text: oracleText(n) };
  },
};
