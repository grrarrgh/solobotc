import { name, alignment } from "../../data.js";
import { ability, isDrunk } from "../../storyteller.js";
import { pick } from "../../util.js";
import { bluffMode } from "../../bluff.js";

// The Ravenkeeper, mixed into Engine.prototype (see characters/index.js),
// so `this` is the Engine.
export const ravenkeeper = {
  // "If you die at night": any death at night wakes the Ravenkeeper (see
  // engine kill()), who chooses a player and learns their character. An
  // evil Ravenkeeper bluffer "learns" a character too; only the Spy's is
  // true.
  ravenkeeperDeath(p, atNight) {
    const s = this.s;

    if (!atNight) {
      return;
    }

    if (ability(p) === "ravenkeeper") {
      const t = this.strat.raven(s, p);

      if (t) {
        this.remember(p, ravenInfo(s, p, t));
      }
    } else if (p.alignment === "evil" && p.claim === "ravenkeeper") {
      const t = this.strat.raven(s, p);

      if (t) {
        const lie = bluffMode(p, true) === "lie";

        this.rememberBluff(p, ravenInfo(s, p, t, lie, lie));
      }
    }
  },
};

// The Ravenkeeper is already dead here, so works() can't be used. A Drunk,
// or an evil bluffer passing `lie`, names a character the target is not.
// With `frame`, a good target is named as an evil character on the script.
export function ravenInfo(s, p, t, lie = isDrunk(p), frame = false) {
  const functioning = !lie && !isDrunk(p) && !p.poisoned;
  const evilRoles =
    frame && t.alignment === "good"
      ? s.script.ids.filter((id) => alignment(id) === "evil")
      : [];
  const seen = lie
    ? pick(
        evilRoles.length
          ? evilRoles
          : s.script.ids.filter((id) => id !== t.role),
        s.r,
      )
    : functioning
      ? t.role
      : pick(s.script.ids, s.r);

  return {
    night: s.night,
    role: "ravenkeeper",
    text: `${t.label} is ${name(seen)}.`,
    targets: [t.id],
    trigger: "death",
    functioning,
  };
}
