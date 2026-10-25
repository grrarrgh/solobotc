import { isDemon, framed } from "../../storyteller.js";
import { byId, bySeat, pick, shuffle } from "../../util.js";

const fortuneText = (yes, ts) =>
  `Fortune Teller: ${yes ? "YES" : "NO"} for ${bySeat(ts)
    .map((x) => x.label)
    .join(" and ")}.`;

// Whether either player registers as the Demon to the Fortune Teller (the
// red herring and the Recluse do).
const fortuneYes = (s, ts) =>
  ts.some((x) => isDemon(x) || x.id === s.red || x.role === "recluse");

// The Fortune Teller: is either of 2 chosen players a Demon?
export const info = {
  truth(s, p, strat) {
    const ts = strat.ft(s, p);

    return {
      targets: ts.map((x) => x.id),
      text: fortuneText(fortuneYes(s, ts), ts),
    };
  },

  lie(s, p, strat) {
    // An evil Fortune Teller "gets a YES" on the scapegoat and another good
    // player (one that really reads NO, so it's still a lie). A misinformed
    // good one keeps their own picks: a Demon among them reads NO.
    const goat = p.alignment === "evil" && framed(s, p);
    const mate =
      goat &&
      pick(
        s.players.filter(
          (x) =>
            x.alive &&
            !x.human &&
            x.alignment === "good" &&
            x !== p &&
            x !== goat &&
            !fortuneYes(s, [x]),
        ),
        s.r,
      );

    if (mate && !fortuneYes(s, [goat])) {
      const ts = shuffle([goat, mate], s.r);

      return { targets: ts.map((x) => x.id), text: fortuneText(true, ts) };
    }

    const ts = strat.ft(s, p);
    // (An evil bluffer never says YES with a teammate among them.)
    const yes =
      p.alignment === "evil"
        ? !ts.some((x) => x !== p && x.alignment === "evil")
        : !fortuneYes(s, ts);

    return {
      targets: ts.map((x) => x.id),
      text: fortuneText(yes, ts),
    };
  },

  random(s, p, targets) {
    const selected = targets
      .map((id) => byId(s, id))
      .filter(Boolean);

    return {
      targets,
      text: fortuneText(s.r() < 0.5, selected),
    };
  },
};
