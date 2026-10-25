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

// Players whose ability worked abnormally tonight because of another
// character, kept simple (see the catalogue's `note`): every living player
// who is drunk or poisoned, once each, however many times and whatever
// their ability did tonight (a Drunk or Marionette too: their jinxes); and
// Townsfolk with information tonight under the Vortox. By their jinx, a
// Lunatic who "attacked" a player the Demon didn't choose tonight counts
// too. Each comes with why, for the log.
function mathCounted(s, p) {
  const vortox = vortoxActive(s);
  const strayLunatic = (x) =>
    x.role === "lunatic" &&
    s.lunaticPickNight === s.night &&
    !(s.demonChose?.night === s.night && s.demonChose.ids.includes(s.lunaticPick));

  const failed = (x) => x.poisoned || isDrunk(x);

  return s.players
    .filter((x) => x !== p && x.alive)
    .map((x) =>
      failed(x)
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
  nights: "each",

  // (The true count, and who it counts, for the log: see engine remember().)
  keep: (s, p, m, truth) => (truth ? { ...m, logNote: mathNote(s, p) } : m),

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
