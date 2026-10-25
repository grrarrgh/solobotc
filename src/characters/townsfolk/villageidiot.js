import { byId } from "../../util.js";
import { registersEvil, covered } from "../../storyteller.js";

const idiotText = (t, isEvil) =>
  `Village Idiot: ${t.label} is ${isEvil ? "evil" : "good"}.`;

// The Village Idiot: a chosen player's alignment.
export const info = {
  truth(s, p, strat) {
    const t = strat.villageIdiot(s, p);

    return t
      ? { targets: [t.id], text: idiotText(t, registersEvil(t)) }
      : { targets: [], text: "No information." };
  },

  // The wrong alignment: an evil bluffer "learns" the scapegoat is evil, or
  // a teammate good.
  lie(s, p, strat) {
    const t = strat.villageIdiot(s, p);

    return t
      ? {
          targets: [t.id],
          text: idiotText(t, p.alignment === "evil" ? !covered(p, t) : !registersEvil(t)),
        }
      : { targets: [], text: "No information." };
  },

  random(s, p, targets) {
    const t = byId(s, targets[0]);

    return t
      ? { targets, text: idiotText(t, s.r() < 0.5) }
      : { targets: [], text: "No information." };
  },
};
