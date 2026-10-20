import { ROLES, ARTIST_QUESTIONS, name, team, alignment } from "./data.js";
import { pick, sample } from "./util.js";

// The Drunk acts as the character they were shown.
export const ability = (p) => (p.role === "drunk" ? p.shown : p.role);

export const works = (p) => p.alive && p.role !== "drunk" && !p.poisoned;

// How a player registers to information abilities.
const evil = (p) =>
  p.role === "recluse"
    ? true
    : p.role === "spy"
      ? false
      : p.alignment === "evil";

const FIRST_NIGHT = [
  "washerwoman",
  "librarian",
  "investigator",
  "chef",
  "clockmaker",
  "grandmother",
];
const EACH_NIGHT = ["empath", "fortuneteller"];

// The team each "one of these two players is X" role learns about.
const PAIR_TEAM = {
  washerwoman: "townsfolk",
  librarian: "outsider",
  investigator: "minion",
};

// Whether an information role wakes tonight.
function actsTonight(role, night) {
  if (FIRST_NIGHT.includes(role)) {
    return night === 1;
  }

  if (EACH_NIGHT.includes(role)) {
    return true;
  }

  return role === "undertaker" && night > 1;
}

const fortuneText = (yes, ts) =>
  `Fortune Teller: ${yes ? "YES" : "NO"} for ${ts
    .map((x) => x.label)
    .join(" and ")}.`;

// What a Monk remembers about their own choice.
export const monkInfo = (s, t, functioning = true) => ({
  night: s.night,
  role: "monk",
  text: `Monk: protected ${t.label}.`,
  targets: [t.id],
  trigger: "normal",
  functioning,
});

// What a Gambler remembers about their guess (they never learn if it was right).
export const gamblerInfo = (s, t, guess) => ({
  night: s.night,
  role: "gambler",
  text: `Gambler: guessed ${t.label} is the ${name(guess)}.`,
  targets: [t.id],
  trigger: "normal",
  functioning: true,
});

const artistTruth = (t, q) =>
  q === "evil" ? evil(t) : q === "demon" ? t.role === "imp" : team(t.role) === q;

// The Storyteller's yes/no answer to an Artist. `mode` is "truth", "lie"
// (an evil bluffer) or "random" (a drunk or poisoned Artist).
export function artistInfo(s, t, q, mode) {
  const truth = artistTruth(t, q);
  const yes =
    mode === "truth" ? truth : mode === "lie" ? !truth : s.r() < 0.5;

  return {
    day: s.day,
    night: s.night,
    role: "artist",
    text: `Artist: asked if ${t.label} is ${ARTIST_QUESTIONS[q]}: ${
      yes ? "YES" : "NO"
    }.`,
    targets: [t.id],
    trigger: "day",
    functioning: mode === "truth",
  };
}

const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

// Possible Clockmaker answers: 1 up to half the circle.
const clockRange = (s) => range(1, Math.max(1, Math.floor(s.players.length / 2)));

// Nearest living neighbours on each side.
function neigh(s, p) {
  const a = s.players;
  const n = a.length;
  const i = a.indexOf(p);
  const o = [];

  for (const d of [-1, 1]) {
    for (let k = 1; k < n; k++) {
      const q = a[(i + d * k + n) % n];

      if (q.alive) {
        o.push(q);
        break;
      }
    }
  }

  return o;
}

// Count adjacent evil pairs around the circle.
function chefCount(s) {
  let n = 0;

  s.players.forEach((x, i) => {
    if (evil(x) && evil(s.players[(i + 1) % s.players.length])) {
      n++;
    }
  });

  return n;
}

const empathCount = (s, p) => neigh(s, p).filter(evil).length;

const fortuneYes = (s, ts) =>
  ts.some((x) => x.role === "imp" || x.id === s.red || x.role === "recluse");

const executed = (s) => s.players.find((x) => x.id === s.lastExecution);

// Seats from the Demon to its nearest Minion, the shorter way round.
function clockmakerCount(s) {
  const n = s.players.length;
  const d = s.players.findIndex((x) => x.role === "imp");
  const steps = s.players
    .map((x, i) => [x, Math.abs(i - d)])
    .filter(([x]) => team(x.role) === "minion")
    .map(([, k]) => Math.min(k, n - k));

  return d < 0 || !steps.length ? 0 : Math.min(...steps);
}

// Any of the options except the true number (0–2 by default).
const wrongNumber = (s, n, options = [0, 1, 2]) =>
  pick(
    options.filter((k) => k !== n),
    s.r,
  );

const otherGood = (s, p) =>
  s.players.filter((x) => x.id !== p.id && x.alignment === "good");

const goodRoles = (s) => s.script.ids.filter((id) => alignment(id) === "good");

const grandchildText = (g, role) =>
  `Grandmother: your grandchild is ${g.label}, the ${name(role)}.`;

// Correct information for `role`, seen from player p's seat.
function trueInfo(s, p, role, strat) {
  const wanted = PAIR_TEAM[role];

  if (wanted) {
    const real = pick(
      s.players.filter((x) => x.id !== p.id && team(x.role) === wanted),
      s.r,
    );

    if (!real) {
      return { targets: [], text: "No matching character is in play." };
    }

    const fake = pick(
      s.players.filter((x) => x.id !== p.id && x.id !== real.id),
      s.r,
    );

    return {
      targets: [real.id, fake.id],
      text: `One of ${real.label} and ${fake.label} is ${name(real.role)}.`,
    };
  }

  if (role === "chef") {
    return { targets: [], text: `Chef number: ${chefCount(s)}.` };
  }

  if (role === "empath") {
    return {
      targets: neigh(s, p).map((x) => x.id),
      text: `Empath number: ${empathCount(s, p)}.`,
    };
  }

  if (role === "fortuneteller") {
    const ts = strat.ft(s, p);

    return {
      targets: ts.map((x) => x.id),
      text: fortuneText(fortuneYes(s, ts), ts),
    };
  }

  if (role === "undertaker") {
    const x = executed(s);

    return {
      targets: [],
      text: x ? `Executed player was ${name(x.role)}.` : "Nobody was executed.",
    };
  }

  if (role === "clockmaker") {
    return { targets: [], text: `Clockmaker number: ${clockmakerCount(s)}.` };
  }

  if (role === "grandmother") {
    const g = pick(otherGood(s, p), s.r);

    return g
      ? { targets: [g.id], text: grandchildText(g, g.role) }
      : { targets: [], text: "No information." };
  }

  return { targets: [], text: "No information." };
}

// Deliberately false information for `role`, as an evil bluffer tells it.
function falseInfo(s, p, role, strat) {
  const wanted = PAIR_TEAM[role];

  if (wanted) {
    const shown = pick(
      s.script.ids.filter((id) => team(id) === wanted),
      s.r,
    );

    // Neither named player holds the character; frame good players if possible.
    const others = s.players.filter((x) => x.id !== p.id && x.role !== shown);
    const good = others.filter((x) => x.alignment === "good");
    const pair = sample(good.length >= 2 ? good : others, 2, s.r);

    return shown && pair.length === 2
      ? {
          targets: pair.map((x) => x.id),
          text: `One of ${pair[0].label} and ${pair[1].label} is ${name(shown)}.`,
        }
      : { targets: [], text: "No matching character is in play." };
  }

  if (role === "chef") {
    return {
      targets: [],
      text: `Chef number: ${wrongNumber(s, chefCount(s))}.`,
    };
  }

  if (role === "empath") {
    return {
      targets: neigh(s, p).map((x) => x.id),
      text: `Empath number: ${wrongNumber(s, empathCount(s, p))}.`,
    };
  }

  if (role === "fortuneteller") {
    const ts = strat.ft(s, p);

    return {
      targets: ts.map((x) => x.id),
      text: fortuneText(!fortuneYes(s, ts), ts),
    };
  }

  if (role === "undertaker") {
    const x = executed(s);

    // Everyone saw whether there was an execution, so only the role is a lie.
    if (!x) {
      return { targets: [], text: "Nobody was executed." };
    }

    const shown = pick(
      s.script.ids.filter((id) => id !== x.role),
      s.r,
    );

    return { targets: [], text: `Executed player was ${name(shown)}.` };
  }

  if (role === "clockmaker") {
    const n = wrongNumber(s, clockmakerCount(s), clockRange(s));

    return { targets: [], text: `Clockmaker number: ${n ?? 0}.` };
  }

  if (role === "grandmother") {
    // Vouch for another player with a good character they don't have.
    const g = pick(
      s.players.filter((x) => x.id !== p.id),
      s.r,
    );
    const shown = pick(
      goodRoles(s).filter((id) => id !== g.role),
      s.r,
    );

    return { targets: [g.id], text: grandchildText(g, shown) };
  }

  return { targets: [], text: "No information." };
}

// Random information for a drunk or poisoned player.
function unreliableInfo(s, p, role, targets) {
  if (role === "clockmaker") {
    return {
      targets: [],
      text: `Clockmaker number: ${pick(clockRange(s), s.r)}.`,
    };
  }

  if (role === "grandmother") {
    const g = pick(
      s.players.filter((x) => x.id !== p.id),
      s.r,
    );

    return {
      targets: [g.id],
      text: grandchildText(g, pick(goodRoles(s), s.r)),
    };
  }

  if (PAIR_TEAM[role]) {
    const pair = sample(s.players, 2, s.r);
    const possible = s.script.ids.filter((id) => team(id) === PAIR_TEAM[role]);
    const shown = pick(possible, s.r);

    return {
      targets: pair.map((x) => x.id),
      text:
        shown && pair.length === 2
          ? `One of ${pair[0].label} and ${pair[1].label} is ${name(shown)}.`
          : "No matching character is in play.",
    };
  }

  if (role === "chef") {
    return {
      targets: [],
      text: `Chef number: ${Math.floor(s.r() * 3)}.`,
    };
  }

  if (role === "empath") {
    return {
      targets,
      text: `Empath number: ${Math.floor(s.r() * 3)}.`,
    };
  }

  if (role === "fortuneteller") {
    const selected = targets
      .map((id) => s.players.find((x) => x.id === id))
      .filter(Boolean);

    return {
      targets,
      text: fortuneText(s.r() < 0.5, selected),
    };
  }

  if (role === "undertaker") {
    const shown = pick(Object.keys(ROLES), s.r);

    return {
      targets: [],
      text: `Executed player was ${name(shown)}.`,
    };
  }

  return {
    targets,
    text: "No information.",
  };
}

export function nightInfo(s, p, strat) {
  const role = ability(p);

  if (!p.alive || !actsTonight(role, s.night)) {
    return null;
  }

  let { text, targets } = trueInfo(s, p, role, strat);

  // The Grandmother's link to her real grandchild exists even if she is
  // misinformed; whether it kills her is checked when the Demon strikes.
  if (role === "grandmother") {
    p.grandchild = targets[0] ?? null;
  }

  const functioning = works(p);

  if (!functioning) {
    ({ text, targets } = unreliableInfo(s, p, role, targets));
  }

  return {
    night: s.night,
    role,
    text,
    targets,
    trigger: "normal",
    functioning,
  };
}

// What an evil NPC reports for the role they are bluffing. A working Spy has
// seen the Grimoire and tells the truth; every other evil player lies.
export function bluffInfo(s, p, strat) {
  const role = p.claim;

  if (role === "monk") {
    const t = s.night > 1 ? strat.monk(s, p) : null;

    return t ? monkInfo(s, t) : null;
  }

  if (role === "gambler") {
    const guess = s.night > 1 ? strat.gamble(s, p) : null;

    return guess ? gamblerInfo(s, guess.target, guess.role) : null;
  }

  if (!actsTonight(role, s.night)) {
    return null;
  }

  const truthful = p.role === "spy" && works(p);
  const { text, targets } = truthful
    ? trueInfo(s, p, role, strat)
    : falseInfo(s, p, role, strat);

  return {
    night: s.night,
    role,
    text,
    targets,
    trigger: "normal",
    functioning: truthful,
  };
}

// The Ravenkeeper is already dead here, so works() can't be used. An evil
// bluffer passes `lie` to name a character the target is not.
export function ravenInfo(s, p, t, lie = false) {
  const functioning = !lie && p.role !== "drunk" && !p.poisoned;
  const seen = lie
    ? pick(
        Object.keys(ROLES).filter((id) => id !== t.role),
        s.r,
      )
    : functioning
      ? t.role
      : pick(Object.keys(ROLES), s.r);

  return {
    night: s.night,
    role: "ravenkeeper",
    text: `${t.label} is ${name(seen)}.`,
    targets: [t.id],
    trigger: "death",
    functioning,
  };
}
