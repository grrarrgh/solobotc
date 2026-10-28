import { byId } from "../../util.js";
import { registersMinion } from "../../storyteller.js";

const minionNominated = (s) =>
  s.dayNominators.some((id) => byId(s, id) && registersMinion(byId(s, id)));

const crierText = (yes) =>
  `Town Crier: a Minion ${yes ? "nominated" : "did not nominate"} today.`;

// The Town Crier: whether a Minion nominated today.
export const info = {
  nights: "later",
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

  // A good pretender's (see bluff.js): at random, but never "a Minion
  // nominated" on a day with no nominations.
  story(s) {
    return { targets: [], text: crierText(s.dayNominators.length > 0 && s.r() < 0.5) };
  },
};
