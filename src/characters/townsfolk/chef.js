import { registersEvil } from "../../storyteller.js";

// Count adjacent evil pairs around the circle.
export function chefCount(s) {
  let n = 0;

  s.players.forEach((x, i) => {
    if (registersEvil(x) && registersEvil(s.players[(i + 1) % s.players.length])) {
      n++;
    }
  });

  return n;
}

// The Chef: how many pairs of evil players sit next to each other.
export const info = {
  truth(s) {
    return { targets: [], text: `Chef number: ${chefCount(s)}.` };
  },

  // Fewer evil pairs than there are, where possible.
  lie(s) {
    const n = chefCount(s);

    return {
      targets: [],
      text: `Chef number: ${n > 0 ? n - 1 : n + 1}.`,
    };
  },

  random(s) {
    return {
      targets: [],
      text: `Chef number: ${Math.floor(s.r() * 3)}.`,
    };
  },
};
