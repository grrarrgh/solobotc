import { works } from "../../storyteller.js";

// The Grandmother, mixed into Engine.prototype (see characters/index.js),
// so `this` is the Engine.
export const grandmother = {
  // If the Demon kills a working Grandmother's grandchild, she dies too.
  grandmother(t) {
    for (const g of this.s.players) {
      if (g.role === "grandmother" && g.grandchild === t.id && works(g)) {
        this.kill(g, "grandmother");
      }
    }
  },
};
