import { byId } from "../../util.js";
import { isMinion } from "../../storyteller.js";

const minionNominated = (s) =>
  s.dayNominators.some((id) => byId(s, id) && isMinion(byId(s, id)));

const crierText = (yes) =>
  `Town Crier: a Minion ${yes ? "nominated" : "did not nominate"} today.`;

// The Town Crier: whether a Minion nominated today.
export const info = {
  truth(s) {
    return { targets: [], text: crierText(minionNominated(s)) };
  },

  // On a day with no nominations, "a Minion nominated" would be obviously
  // false, so they tell the truth.
  lie(s) {
    return {
      targets: [],
      text: crierText(s.dayNominators.length ? !minionNominated(s) : false),
    };
  },

  random(s) {
    return { targets: [], text: crierText(s.r() < 0.5) };
  },
};
