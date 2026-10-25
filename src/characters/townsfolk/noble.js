import { pick, sample, shuffle } from "../../util.js";
import {
  registersEvil,
  isDemon,
  nameable,
  framed,
  covered,
  listLabels,
} from "../../storyteller.js";

const nobleText = (ts) => `Noble: one of ${listLabels(ts)} is evil.`;

// A false Noble: 3 players with no evil among them (the evil team's
// scapegoat first), or failing that 2 evil. Never the Demon (so with too
// few players to name, the 3 may happen to hold just 1 evil), unless
// there's nobody else to name (Legion, every one of them a Demon).
function falseNoble(s, p) {
  const named = nameable(s, p).filter((x) => !isDemon(x));
  const good = named.filter((x) => !covered(p, x));
  const goat = framed(s, p);
  const three = good.includes(goat)
    ? [goat, ...sample(good.filter((x) => x !== goat), 2, s.r)]
    : sample(good, 3, s.r);

  if (three.length === 3) {
    return shuffle(three, s.r);
  }

  const bad = sample(named.filter((x) => covered(p, x)), 2, s.r);
  const ts = [...bad, ...sample(good, 3 - bad.length, s.r)];

  // (Still short, as with Legion, where every evil player is a Demon:
  // anyone else they can name.)
  return shuffle(
    [
      ...ts,
      ...sample(
        nameable(s, p).filter((x) => !ts.includes(x)),
        3 - ts.length,
        s.r,
      ),
    ],
    s.r,
  );
}

// The Noble: 3 players, 1 and only 1 of them evil.
export const info = {
  truth(s, p) {
    const named = nameable(s, p);
    const bad = pick(named.filter(registersEvil), s.r);
    const good = sample(
      named.filter((x) => !registersEvil(x)),
      2,
      s.r,
    );

    if (!bad || good.length < 2) {
      return { targets: [], text: "No information." };
    }

    const ts = shuffle([bad, ...good], s.r);

    return { targets: ts.map((x) => x.id), text: nobleText(ts) };
  },

  // A misinformed Noble (or a Marionette) sees any 3 players; an evil Noble
  // bluffer (or a Marionette the Demon has told) frames 3 good ones.
  lie(s, p, strat, helpEvil = false) {
    const misled =
      !helpEvil &&
      (p.alignment === "good" || (p.role === "marionette" && !p.toldEvil));
    const ts = misled ? sample(nameable(s, p), 3, s.r) : falseNoble(s, p);

    return ts.length === 3
      ? { targets: ts.map((x) => x.id), text: nobleText(ts) }
      : { targets: [], text: "No information." };
  },

  random(s, p) {
    const ts = sample(
      s.players.filter((x) => x.id !== p.id),
      3,
      s.r,
    );

    return { targets: ts.map((x) => x.id), text: nobleText(ts) };
  },
};
