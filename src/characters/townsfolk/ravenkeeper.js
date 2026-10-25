import { name, alignment, roleByName } from "../../data.js";
import { ability, isDrunk, covered } from "../../storyteller.js";
import { sure } from "../../strategy.js";
import { pick, claimHeard } from "../../util.js";
import { dayBluff } from "../../bluff.js";

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
        this.rememberBluff(
          p,
          dayBluff(
            s,
            p,
            "ravenkeeper",
            this.strat,
            (mode) => (mode === "lie" ? ravenLie(s, p, t) : ravenInfo(s, p, t, false)),
            true,
          ),
        );
      }
    }
  },
};

// An evil Ravenkeeper bluffer's "learned" character: a teammate, or a
// player the town is sure is good, is the character they claim (a lie
// otherwise would cast suspicion on them); anyone else, an evil character.
function ravenLie(s, p, t) {
  const backs = covered(p, t) || sure(s).includes(t.id);
  const claim = claimHeard(t, p) ?? t.claim;

  return backs && claim !== t.role
    ? { ...ravenInfo(s, p, t, true), text: `${t.label} is ${name(claim)}.` }
    : ravenInfo(s, p, t, true, true);
}

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

// How the Ravenkeeper's information reads (see strategy stanceOn()): an
// evil character, suspicious; a good one vouches for them.
export const info = {
  stance(m) {
    const seen = info.named(m)[0];

    return seen && alignment(seen) === "evil" ? "suspicious" : "trust";
  },
  // The character it names (see strategy stanceOn()).
  named: (m) => [roleByName(m.text.match(/ is (.+)\.$/)?.[1])].filter(Boolean),
};
