import { ability, bluffing, infoMode, isDrunk, sageInfo } from "../../storyteller.js";

// The Sage, mixed into Engine.prototype (see characters/index.js),
// so `this` is the Engine.
export const sage = {
  // The Sage, killed by the Demon, learns the Demon is 1 of 2 players. An
  // evil Sage bluffer "learns" a false pair (true for the Spy).
  sageDeath(p, cause) {
    const s = this.s;

    if (cause !== "demon") {
      return;
    }

    if (ability(p) === "sage") {
      this.remember(p, sageInfo(s, p, infoMode(s, p, true)));
    } else if (bluffing(p, "sage")) {
      this.rememberBluff(
        p,
        sageInfo(s, p, p.role === "spy" && !isDrunk(p) && !p.poisoned ? "truth" : "lie"),
      );
    }
  },
};
