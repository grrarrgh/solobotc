import { works } from "../../storyteller.js";

// The Fool, mixed into Engine.prototype (see characters/index.js),
// so `this` is the Engine.
export const fool = {
  // A working Fool survives their first death, unless it is the Assassin's.
  foolSaves(p, cause) {
    return (
      p.role === "fool" && works(p) && !p.foolUsed && cause !== "assassin"
    );
  },
};
