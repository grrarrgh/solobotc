import {
  ability,
  infoMode,
  bluffing,
  registersEvil,
  isDemon,
  nameable,
  framed,
  listLabels,
} from "../../storyteller.js";
import { pick, sample } from "../../util.js";
import { dayBluff } from "../../bluff.js";

// The Fisherman, mixed into Engine.prototype (see characters/index.js),
// so `this` is the Engine.
export const fisherman = {
  // At dawn, NPC Fishermen (and Fisherman bluffers; see bluffing()) may
  // visit the Storyteller, once (see strategy fisherman()).
  npcFishermen() {
    const s = this.s;

    for (const p of s.players.filter(
      (x) =>
        !x.human &&
        x.alive &&
        !x.fishermanUsed &&
        (ability(x) === "fisherman" || bluffing(x, "fisherman")),
    )) {
      if (!this.strat.fisherman(s, p)) {
        continue;
      }

      p.fishermanUsed = true;

      if (ability(p) === "fisherman" && p.alignment === "good") {
        this.remember(p, fishermanInfo(s, p, infoMode(s, p)));
      } else {
        this.rememberBluff(
          p,
          dayBluff(s, p, "fisherman", this.strat, (mode) => fishermanInfo(s, p, mode)),
        );
      }
    }
  },

  // The human Fisherman's one visit to the Storyteller.
  fisherman() {
    const s = this.s;
    const h = this.human();

    if (
      s.phase !== "day" ||
      s.winner ||
      ability(h) !== "fisherman" ||
      !h.alive ||
      h.fishermanUsed
    ) {
      throw Error("Fisherman unavailable.");
    }

    h.fishermanUsed = true;

    const info = fishermanInfo(s, h, infoMode(s, h));

    this.remember(h, info);

    return info.text;
  },
};

// The Fisherman's tips: each a true and a false version ({ ids, text }),
// never about the human. That a player is evil (a Minion; falsely, a good
// player, the evil team's scapegoat first); that the Demon is one of 3
// players (falsely, 3 who aren't); that a player is good, so not to execute
// them (the scapegoat first; falsely, an evil player).
function fishermanTips(s, p) {
  const named = nameable(s, p).filter((x) => x.alive && !x.human);
  const d = named.find(isDemon);
  const good = named.filter((x) => !registersEvil(x));
  const goat = framed(s, p);
  const scape = good.includes(goat) ? goat : pick(good, s.r);
  const minion = pick(
    named.filter((x) => registersEvil(x) && !isDemon(x)),
    s.r,
  );
  const shield = pick(
    named.filter((x) => x.alignment === "evil"),
    s.r,
  );
  const tip = (ts, text) => ts && { ids: ts.map((x) => x.id), text };
  const three = d && [d, ...sample(named.filter((x) => x !== d), 2, s.r)];
  const notThree = sample(
    named.filter((x) => !isDemon(x)),
    3,
    s.r,
  );
  const demonIn = (ts) => `The Demon is one of ${listLabels(ts)}.`;

  return [
    minion &&
      scape && {
        yes: tip([minion], `${minion.label} is evil.`),
        no: tip([scape], `${scape.label} is evil.`),
      },
    three?.length === 3 &&
      notThree.length === 3 && {
        yes: tip(three, demonIn(three)),
        no: tip(notThree, demonIn(notThree)),
      },
    scape &&
      shield && {
        yes: tip([scape], `${scape.label} is good: don't execute them.`),
        no: tip([shield], `${shield.label} is good: don't execute them.`),
      },
  ].filter(Boolean);
}

// The Fisherman's visit (once per game, by day): the Storyteller's advice,
// one tip (see fishermanTips()): true, false ("lie": a Drunk, a poisoned
// Fisherman, the Vortox, an evil bluffer) or either ("random").
export function fishermanInfo(s, p, mode) {
  const f = pick(fishermanTips(s, p), s.r);
  const said = !f
    ? null
    : mode === "truth"
      ? f.yes
      : mode === "lie"
        ? f.no
        : s.r() < 0.5
          ? f.yes
          : f.no;

  return {
    day: s.day,
    night: s.night,
    role: "fisherman",
    text: said
      ? `Fisherman: the Storyteller's advice: ${said.text}`
      : "Fisherman: the Storyteller has no advice.",
    targets: said?.ids ?? [],
    trigger: "day",
    functioning: mode === "truth",
  };
}

// How the Fisherman's advice reads (see strategy stanceOn()): a good player
// vouched for, or an evil player (or 3 the Demon is among).
export const info = {
  stance: (m) =>
    / is good: /.test(m.text)
      ? "trust"
      : / is evil\.$|The Demon is one of /.test(m.text)
        ? "suspicious"
        : null,
};
