import { byId } from "../../util.js";
import { registersEvil } from "../../storyteller.js";
import { sure, sideOf, teammate } from "../../strategy.js";

const idiotText = (t, isEvil) =>
  `Village Idiot: ${t.label} is ${isEvil ? "evil" : "good"}.`;

// The Village Idiot: a chosen player's alignment.
export const info = {
  stance: (m) => (/ is evil\.$/.test(m.text) ? "suspicious" : "trust"),
  nights: "each",
  truth(s, p, strat) {
    const t = strat.villageIdiot(s, p);

    return t
      ? { targets: [t.id], text: idiotText(t, registersEvil(t)) }
      : { targets: [], text: "No information." };
  },

  // The wrong alignment: an evil bluffer "learns" the scapegoat is evil, or
  // a teammate good (as the Lunatic believes their team to be). (Never that
  // a player the town is sure of is evil: it wouldn't be believed.)
  lie(s, p, strat) {
    const t = strat.villageIdiot(s, p);

    return t
      ? {
          targets: [t.id],
          text: idiotText(
            t,
            sideOf(p) === "evil"
              ? !teammate(p, t) && !sure(s).includes(t.id)
              : !registersEvil(t),
          ),
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
