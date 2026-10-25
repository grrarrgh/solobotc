import { pairInfo } from "../pairinfo.js";

// The Librarian: 1 of 2 players is a particular Outsider (see
// characters/pairinfo.js). A lie that must help evil gives an evil player
// cover.
export const info = {
  ...pairInfo("librarian"),
  nights: "first",
};
