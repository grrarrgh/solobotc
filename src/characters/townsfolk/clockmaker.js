import { isDemon, isMinion, range, wrongNumber } from "../../storyteller.js";
import { pick } from "../../util.js";

// Possible Clockmaker answers: 1 up to half the circle.
const clockRange = (s) => range(1, Math.max(1, Math.floor(s.players.length / 2)));

// Seats from the Demon to its nearest Minion, the shorter way round.
function clockmakerCount(s) {
  const n = s.players.length;
  const d = s.players.findIndex(isDemon);
  const steps = s.players
    .map((x, i) => [x, Math.abs(i - d)])
    .filter(([x], i) => isMinion(x) && i !== d)
    .map(([, k]) => Math.min(k, n - k));

  return d < 0 || !steps.length ? 0 : Math.min(...steps);
}

// The Clockmaker: how many steps from the Demon to its nearest Minion.
export const info = {
  truth(s) {
    return { targets: [], text: `Clockmaker number: ${clockmakerCount(s)}.` };
  },

  lie(s) {
    const n = wrongNumber(s, clockmakerCount(s), clockRange(s));

    return { targets: [], text: `Clockmaker number: ${n ?? 0}.` };
  },

  random(s) {
    return {
      targets: [],
      text: `Clockmaker number: ${pick(clockRange(s), s.r)}.`,
    };
  },
};
