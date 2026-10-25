import { name, team } from "../../data.js";
import { pick } from "../../util.js";
import {
  ability,
  isDrunk,
  vortoxActive,
  misinformedBy,
  actsTonight,
  range,
  wrongNumber,
} from "../../storyteller.js";
import { FIRST_NIGHT as NIGHT_ONE_ORDER, OTHER_NIGHTS } from "../nightorder.js";

// Players whose ability worked abnormally tonight because of another
// character: anyone poisoned or made drunk whose ability did something
// tonight (information tonight, waking in the night order: a Monk, Butler,
// Spy, Poisoner, the Demon..., or a Soldier the Demon chose), and Townsfolk with
// information tonight under the Vortox. (An approximation of the
// Mathematician's count.) By their jinxes, a Drunk or Marionette whose
// ability failed tonight counts too, and so does a Lunatic who "attacked" a
// player the Demon didn't choose tonight. Each comes with why, for the log.
function mathCounted(s, p) {
  const vortox = vortoxActive(s);
  const strayLunatic = (x) =>
    x.role === "lunatic" &&
    s.lunaticPickNight === s.night &&
    !(s.demonChose?.night === s.night && s.demonChose.ids.includes(s.lunaticPick));

  const failed = (x) => x.poisoned || isDrunk(x);
  const order = s.night === 1 ? NIGHT_ONE_ORDER : OTHER_NIGHTS;
  const usedTonight = (x) =>
    actsTonight(ability(x), s.night) ||
    order.some(([id]) => id === ability(x)) ||
    (s.woke ?? []).includes(x.id) ||
    (ability(x) === "soldier" &&
      s.demonChose?.night === s.night &&
      s.demonChose.ids.includes(x.id));

  return s.players
    .filter((x) => x !== p && (x.alive || x.vigor))
    .map((x) =>
      failed(x) && usedTonight(x)
        ? { x, why: misinformedBy(s, x) }
        : strayLunatic(x)
          ? { x, why: "the Lunatic attacked a player the Demon didn't choose" }
          : vortox && team(x.role) === "townsfolk" && actsTonight(ability(x), s.night)
            ? { x, why: "the Vortox" }
            : null,
    )
    .filter(Boolean);
}

const mathCount = (s, p) => mathCounted(s, p).length;

// The true count, and who it counts, for the log (see engine remember()).
export function mathNote(s, p) {
  const counted = mathCounted(s, p);

  return `true count ${counted.length}${
    counted.length
      ? `: ${counted.map(({ x, why }) => `${x.label} (${name(x.role)}), ${why}`).join("; ")}`
      : ""
  }`;
}

// The Mathematician: how many players' abilities worked abnormally tonight
// because of another character.
export const info = {
  truth(s, p) {
    return {
      targets: [],
      text: `Mathematician number: ${mathCount(s, p)}.`,
    };
  },

  lie(s, p) {
    const n = mathCount(s, p);
    const said = wrongNumber(s, n, range(0, Math.max(3, n + 2)));

    return { targets: [], text: `Mathematician number: ${said}.` };
  },

  random(s) {
    return {
      targets: [],
      text: `Mathematician number: ${pick(range(0, 3), s.r)}.`,
    };
  },
};
