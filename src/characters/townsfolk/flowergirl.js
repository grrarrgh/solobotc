import { byId } from "../../util.js";
import { isDemon } from "../../storyteller.js";

const demonVoted = (s) => s.dayVoters.some((id) => isDemon(byId(s, id)));

const flowerText = (yes) =>
  `Flowergirl: a Demon ${yes ? "voted" : "did not vote"} today.`;

// The Flowergirl: whether a Demon voted today.
export const info = {
  nights: "later",
  truth(s) {
    return { targets: [], text: flowerText(demonVoted(s)) };
  },

  // On a day with no votes, "a Demon voted" would be obviously false, so
  // they tell the truth.
  lie(s) {
    return {
      targets: [],
      text: flowerText(s.dayVoters.length ? !demonVoted(s) : false),
    };
  },

  random(s) {
    return { targets: [], text: flowerText(s.r() < 0.5) };
  },

  // A good pretender's (see bluff.js): at random, but never "a Demon voted"
  // on a day with no votes.
  story(s) {
    return { targets: [], text: flowerText(s.dayVoters.length > 0 && s.r() < 0.5) };
  },
};
