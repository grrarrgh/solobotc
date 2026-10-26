import { works } from "../../storyteller.js";

// The Fool, mixed into Engine.prototype (see characters/index.js),
// so `this` is the Engine.
export const fool = {
  // A working Fool survives their first death, unless it is the Assassin's.
  // (So does a Demon a Wizard's wish gave the Fool ability: see wizard.js.)
  foolSaves(p, cause) {
    return (
      (p.role === "fool" || p.wishGift === "fool") &&
      works(p) &&
      !p.foolUsed &&
      cause !== "assassin"
    );
  },
};
