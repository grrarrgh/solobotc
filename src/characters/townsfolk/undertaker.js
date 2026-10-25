import { name, alignment } from "../../data.js";
import { byId, pick } from "../../util.js";

const executed = (s) => byId(s, s.lastExecution);

// The Undertaker: the character of the player executed today.
export const info = {
  truth(s) {
    const x = executed(s);

    return {
      targets: [],
      text: x ? `Executed player was ${name(x.role)}.` : "Nobody was executed.",
    };
  },

  lie(s) {
    const x = executed(s);

    // Everyone saw whether there was an execution, so only the role is a lie.
    if (!x) {
      return { targets: [], text: "Nobody was executed." };
    }

    // A good player "was" evil (the town thinks it got one); an evil player
    // "was" good (the town thinks it made a mistake).
    const shown =
      pick(
        s.script.ids.filter(
          (id) => id !== x.role && alignment(id) !== alignment(x.role),
        ),
        s.r,
      ) ??
      pick(
        s.script.ids.filter((id) => id !== x.role),
        s.r,
      );

    return { targets: [], text: `Executed player was ${name(shown)}.` };
  },

  random(s) {
    const shown = pick(s.script.ids, s.r);

    return {
      targets: [],
      text: `Executed player was ${name(shown)}.`,
    };
  },
};
