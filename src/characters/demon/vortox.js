import { vortoxActive } from "../../storyteller.js";

// The Vortox, mixed into Engine.prototype (see characters/index.js),
// so `this` is the Engine.
export const vortox = {
  // The Vortox: a day with no execution means evil wins. Returns whether the
  // game ended.
  vortoxDay() {
    if (vortoxActive(this.s) && !this.s.executedToday) {
      this.finish("evil", "Nobody was executed while the Vortox lives.");
      return true;
    }

    return false;
  },
};
