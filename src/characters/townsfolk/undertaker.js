import { name, alignment, NEVER_BLUFFED } from "../../data.js";
import { byId, pick, claimHeard } from "../../util.js";

const executed = (s) => byId(s, s.lastExecution);

// The Undertaker: the character of the player executed today.
export const info = {
  nights: "later",
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

  // A good pretender's (see bluff.js): nothing on a day with no execution
  // (everyone saw that); otherwise the character they heard the executed
  // player claim, or failing that, any good one.
  story(s, p) {
    const x = executed(s);

    if (!x) {
      return { targets: [], text: "Nobody was executed." };
    }

    const believable = (id) => alignment(id) === "good" && !NEVER_BLUFFED.includes(id);
    const claim = claimHeard(x, p);
    const shown = believable(claim)
      ? claim
      : pick(s.script.ids.filter(believable), s.r);

    return { targets: [], text: `Executed player was ${name(shown)}.` };
  },
};
