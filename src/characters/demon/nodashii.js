import { who } from "../../storyteller.js";

// The No Dashii, mixed into Engine.prototype (see characters/index.js),
// so `this` is the Engine.
export const nodashii = {
  // At dusk: the No Dashii's two Townsfolk neighbours are poisoned, alive or
  // dead (see townsfolkNeighbours()).
  noDashiiLasting() {
    for (const d of this.s.players.filter(
      (x) => x.alive && x.role === "nodashii",
    )) {
      for (const x of this.townsfolkNeighbours(d)) {
        x.poisoned = true;
        x.poisonedBy = who(d);
      }
    }
  },
};
