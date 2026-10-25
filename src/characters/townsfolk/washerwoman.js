import { pairInfo } from "../pairinfo.js";

// The Washerwoman: 1 of 2 players is a particular Townsfolk (see
// characters/pairinfo.js). Her lie gives an evil player cover.
export const info = {
  ...pairInfo("washerwoman"),
  nights: "first",
  // (A pair holding the Townsfolk they claim vouches for them.)
  stance: () => "trust",
};
