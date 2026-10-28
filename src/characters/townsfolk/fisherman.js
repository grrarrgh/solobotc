import {
  ability,
  infoMode,
  bluffing,
  registersDemon,
  nameable,
  framed,
  listLabels,
  lean,
  adviceLevel,
  adviceWhy,
  leanRegistersEvil,
  suspectedBy,
  falseNoise,
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
// never about the human, and how pointed the true one is (`level`: see
// ADVICE_STAGES):
//   0: a good player is good, so not to execute them: the town's most
//      suspected good player (the evil team's scapegoat first), or two of
//      them; (falsely, an evil player);
//   1: a Minion is evil (falsely, the scapegoat); or the Demon isn't one of
//      3 players (falsely, 3 with the Demon among them);
//   2: the Demon is one of 3 players (falsely, 3 who aren't);
//   3: the Demon is one of 2 players (falsely, 2 who aren't).
// Leaning evil, the Storyteller vouches for a good player nobody suspects
// (little help), and would rather tell a truth that misleads: a Recluse
// "is evil", a Spy "is good" (`evil: true`). Registration goes by the lean
// (see leanRegistersEvil()).
function fishermanTips(s, p) {
  const named = nameable(s, p).filter((x) => x.alive && !x.human);
  const d = named.find(registersDemon);
  const evilish = (x) => leanRegistersEvil(s, x);
  const leaning = lean(s);
  // (Only good players who register as good: vouching for a Spy is a
  // misleading truth, kept for when the Storyteller helps evil.)
  const good = named.filter((x) => !evilish(x) && x.alignment === "good");
  const goat = framed(s, p);
  const heat = (x) => suspectedBy(s, x);
  const hottest = (pool) => {
    const top = Math.max(0, ...pool.map(heat));

    return pick(
      pool.filter((x) => heat(x) === top),
      s.r,
    );
  };
  // The good player(s) to vouch for (see above).
  const vouch =
    leaning === "evil"
      ? pick(
          good.filter((x) => !heat(x)),
          s.r,
        ) ?? pick(good, s.r)
      : good.includes(goat)
        ? goat
        : hottest(good);
  const vouch2 = vouch && hottest(good.filter((x) => x !== vouch));
  const scape = good.includes(goat) ? goat : pick(good, s.r);
  const minion = pick(
    named.filter(
      (x) => evilish(x) && !registersDemon(x) && (x.alignment === "evil" || Boolean(x.pretend)),
    ),
    s.r,
  );
  const shield = pick(
    named.filter((x) => x.alignment === "evil"),
    s.r,
  );
  const tip = (ts, text) => ts && { ids: ts.map((x) => x.id), text };
  const demonIn = (ts) => `The Demon is one of ${listLabels(ts)}.`;
  const others = named.filter((x) => !registersDemon(x));
  const withDemon = (n) => d && [d, ...sample(others, n - 1, s.r)];
  const without = (n) => sample(others, n, s.r);
  const three = withDemon(3);
  const notThree = without(3);
  const two = withDemon(2);
  const notTwo = without(2);
  // (A truth that misleads: see above.)
  const recluse = named.find((x) => x.role === "recluse" && evilish(x));
  const spy = named.find((x) => x.role === "spy" && !evilish(x));

  return [
    vouch &&
      shield && {
        level: 0,
        yes: tip([vouch], `${vouch.label} is good: don't execute them.`),
        no: tip([shield], `${shield.label} is good: don't execute them.`),
      },
    vouch &&
      vouch2 &&
      shield && {
        level: 0,
        yes: tip([vouch, vouch2], `${listLabels([vouch, vouch2])} are both good.`),
        no: tip([shield, vouch], `${listLabels([shield, vouch])} are both good.`),
      },
    leaning === "evil" &&
      recluse &&
      scape && {
        level: 0,
        evil: true,
        yes: tip([recluse], `${recluse.label} is evil.`),
        no: tip([scape], `${scape.label} is evil.`),
      },
    leaning === "evil" &&
      spy &&
      shield && {
        level: 0,
        evil: true,
        yes: tip([spy], `${spy.label} is good: don't execute them.`),
        no: tip([shield], `${shield.label} is good: don't execute them.`),
      },
    minion &&
      scape && {
        level: 1,
        yes: tip([minion], `${minion.label} is evil.`),
        no: tip([scape], `${scape.label} is evil.`),
      },
    notThree.length === 3 &&
      three?.length === 3 && {
        level: 1,
        yes: tip(notThree, `The Demon is not one of ${listLabels(notThree)}.`),
        no: tip(three, `The Demon is not one of ${listLabels(three)}.`),
      },
    three?.length === 3 &&
      notThree.length === 3 && {
        level: 2,
        yes: tip(three, demonIn(three)),
        no: tip(notThree, demonIn(notThree)),
      },
    two?.length === 2 &&
      notTwo.length === 2 && {
        level: 3,
        yes: tip(two, demonIn(two)),
        no: tip(notTwo, demonIn(notTwo)),
      },
  ].filter(Boolean);
}

// The tips the Storyteller picks from, at `level` (see fishermanTips()): a
// truth that helps evil, if it leans evil and has one; else those at the
// level, or the most pointed below it, or failing that, any.
export function adviceAt(tips, level, leaning) {
  const evil = leaning === "evil" ? tips.filter((x) => x.evil) : [];

  if (evil.length) {
    return evil;
  }

  const plain = tips.filter((x) => !x.evil);
  const top = Math.max(-1, ...plain.filter((x) => x.level <= level).map((x) => x.level));

  return top >= 0 ? plain.filter((x) => x.level === top) : plain;
}

// The Fisherman's visit (once per game, by day): the Storyteller's advice,
// one tip (see fishermanTips()), as pointed as the game's stage and the
// Storyteller's lean make it (see adviceLevel()): true, false ("lie": a
// Drunk, a poisoned Fisherman, the Vortox, an evil bluffer) or either
// ("random": see storyteller.js falseNoise()).
export function fishermanInfo(s, p, mode) {
  const level = adviceLevel(s);
  const f = pick(adviceAt(fishermanTips(s, p), level, lean(s)), s.r);
  const said = !f
    ? null
    : mode === "truth"
      ? f.yes
      : mode === "lie"
        ? f.no
        : s.r() < 0.5
          ? f.yes
          : f.no;

  const info = {
    day: s.day,
    night: s.night,
    role: "fisherman",
    text: said
      ? `Fisherman: the Storyteller's advice: ${said.text}`
      : "Fisherman: the Storyteller has no advice.",
    targets: said?.ids ?? [],
    trigger: "day",
    functioning: mode === "truth",
    logNote: f
      ? `${adviceWhy(s, level)}; a level ${f.level} tip${f.evil ? " that helps evil" : ""}`
      : null,
  };

  return falseNoise(s, info, mode !== "random" || said === (f?.yes ?? null));
}

// How the Fisherman's advice reads (see strategy stanceOn()): good players
// vouched for (or 3 who aren't the Demon), or an evil player (or 2 or 3 the
// Demon is among).
export const info = {
  stance: (m) =>
    / is good: | are both good\.$|The Demon is not one of /.test(m.text)
      ? "trust"
      : / is evil\.$|The Demon is one of /.test(m.text)
        ? "suspicious"
        : null,
};
