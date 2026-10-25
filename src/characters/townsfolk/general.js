import { pick } from "../../util.js";
import { leanState, leanText } from "../../storyteller.js";

const SIDES = ["good", "evil", "neither"];

// Who the Storyteller believes is winning: the team their choices are
// helping is the one behind (see storyteller.js lean()), so the other one;
// with no lean, neither.
export const generalSays = (s) =>
  ({ good: "evil", evil: "good" })[leanState(s).side] ?? "neither";

const generalText = (x) =>
  `General: ${x === "neither" ? "neither team is" : `${x} is`} winning.`;

// The General: which alignment the Storyteller believes is winning.
export const info = {
  nights: "each",

  // (The Storyteller's workings, for the log: see engine remember().)
  keep: (s, p, m, truth) =>
    truth ? { ...m, logNote: `the Storyteller ${leanText(s)}` } : m,

  truth(s) {
    return { targets: [], text: generalText(generalSays(s)) };
  },

  // Good is winning when it isn't; when it is, neither: either way, good
  // stops worrying.
  lie(s) {
    return {
      targets: [],
      text: generalText(generalSays(s) === "good" ? "neither" : "good"),
    };
  },

  random(s) {
    return { targets: [], text: generalText(pick(SIDES, s.r)) };
  },
};
