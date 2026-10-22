import {
  ROLES,
  ARTIST_QUESTIONS,
  FIRST_NIGHT_INFO,
  ONGOING_INFO,
  FINAL_THREE_MARGIN,
  name,
  team,
  alignment,
} from "./data.js";
import { byId, pick, sample, shuffle } from "./util.js";

// Drunk: the Drunk themselves, anyone made drunk "from now on" (by a
// Sweetheart's death or a Philosopher choosing their character), and anyone
// drunk until dusk (the Sailor, Innkeeper, Goon, Courtier or Minstrel).
export const isDrunk = (p) =>
  p.role === "drunk" || Boolean(p.drunkFrom) || Boolean(p.drunkTonight);

export const isDemon = (p) => team(p.role) === "demon";

// The ability a player acts with: the Drunk acts as the character they were
// shown, and a Philosopher as the character they gained.
export const ability = (p) =>
  p.role === "drunk" ? p.shown : (p.gained ?? p.role);

// Dead players have no ability, except Minions the Vigormortis killed and a
// Zombuul that only registers as dead.
export const works = (p) =>
  (p.alive || p.vigor || p.undead) && !isDrunk(p) && !p.poisoned;

// The Vortox makes every Townsfolk's information false.
export const vortoxActive = (s) =>
  s.players.some((x) => x.alive && x.role === "vortox" && !x.poisoned);

// The team the Storyteller's choices help right now ("good" or "evil"), or
// null. It steers for a close finish:
// - a final 3 of the human, 1 good NPC and 1 evil player;
// - once the human is dead (they still have a vote), a final 3 with at
//   least 1 good player: 1 or 2 evil;
// - with a Zombuul, a final 2 instead (shown alive; a Zombuul that only
//   registers as dead keeps the game going).
// The evil team (counting a "dead" Zombuul) should shrink in step with the
// players shown alive, from its starting size to that final number;
// FINAL_THREE_MARGIN above that band, help good; that far below it, help
// evil.
export function lean(s) {
  return leanState(s).side;
}

// lean(), with its workings: { side, n, e, low, high, end } (side null
// when there's nothing to steer).
export function leanState(s) {
  const n0 = s.players.length;
  const e0 = s.players.filter((x) => alignment(x.startRole) === "evil").length;
  const n = s.players.filter((x) => x.alive).length;
  const e = s.players.filter(
    (x) => (x.alive || x.undead) && x.alignment === "evil",
  ).length;
  const human = s.players.find((x) => x.human);
  const zombuul = s.players.some(
    (x) => x.role === "zombuul" && (x.alive || x.undead),
  );
  const end = zombuul ? 2 : 3;

  if (n <= end || n0 <= end) {
    return { side: null, n, e, end };
  }

  // How far along the path the game is (1 at the start, 0 at the end), and
  // the band of evil players allowed there: exactly 1 at the end while the
  // human lives, otherwise up to all but 1.
  const t = (n - end) / (n0 - end);
  const last = human?.alive ? 1 : end - 1;
  const low = 1 + (e0 - 1) * t;
  const high = last + (e0 - last) * t;

  const side =
    e > high + FINAL_THREE_MARGIN
      ? "good"
      : e < low - FINAL_THREE_MARGIN
        ? "evil"
        : null;

  return { side, n, e, end, low, high };
}

// The Storyteller's lean, as a line for the log.
export function leanText(s) {
  const l = leanState(s);
  const band =
    l.low === undefined
      ? ""
      : `; the path to a final ${l.end} wants ${l.low.toFixed(1)}${
          l.high > l.low ? ` to ${l.high.toFixed(1)}` : ""
        }`;

  return `${l.side ? `is helping ${l.side}` : "isn't leaning"}: ${l.e} evil of ${
    l.n
  } shown alive${band}.`;
}

// Records a Storyteller choice the lean decided, in the log.
export function leanNote(s, text) {
  s.audit.push({
    id: s.auditId++,
    group: s.phase === "night" ? `Night ${s.night}` : `Day ${s.day}`,
    type: "storyteller",
    text: `Storyteller (${lean(s) ?? "no lean"}): ${text}`,
    data: {},
  });
}

// The part of `pool` the Storyteller would rather pick: those whose pick
// helps (by `helps(x)`: "good", "evil" or null) the team lean() names; all
// of `pool` if none do, or there's no lean. When that narrows the choice,
// `what` (the choice being made) goes in the log.
export function steer(s, pool, helps, what = null) {
  const side = lean(s);
  const better = side ? pool.filter((x) => helps(x) === side) : [];

  if (what && better.length && better.length < pool.length) {
    leanNote(s, `${what}: one of ${better.map((x) => x.label).join(", ")}.`);
  }

  return better.length ? better : pool;
}

// Which team a player's death helps.
export const killHelps = (x) => (x.alignment === "evil" ? "good" : "evil");

// How a player registers to information abilities.
const evil = (p) =>
  p.role === "recluse"
    ? true
    : p.role === "spy"
      ? false
      : p.alignment === "evil";

const FIRST_NIGHT = FIRST_NIGHT_INFO;
const EACH_NIGHT = ["empath", "fortuneteller", "dreamer", "mathematician"];
const LATER_NIGHTS = ["undertaker", "flowergirl", "towncrier", "oracle"];

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

  return LATER_NIGHTS.includes(role) && night > 1;
}

const fortuneText = (yes, ts) =>
  `Fortune Teller: ${yes ? "YES" : "NO"} for ${ts
    .map((x) => x.label)
    .join(" and ")}.`;

// What a Monk remembers about their own choice.
export const monkInfo = (s, t, functioning = true) => ({
  night: s.night,
  role: "monk",
  text: `Monk: protected ${t.label} from the Demon.`,
  targets: [t.id],
  trigger: "normal",
  functioning,
});

// What a Butler remembers about the master they chose.
export const butlerInfo = (s, t) => ({
  night: s.night,
  role: "butler",
  text: `Butler: chose ${t.label} as master.`,
  targets: [t.id],
  trigger: "normal",
  functioning: true,
});

// What a Gambler remembers about their guess. They never learn if it was
// right, but they know a wrong guess when it kills them.
export const gamblerInfo = (s, t, guess, died = false) => ({
  night: s.night,
  role: "gambler",
  text: `Gambler: guessed ${t.label} is the ${name(guess)}${
    died ? ", and died" : ""
  }.`,
  targets: [t.id],
  trigger: "normal",
  functioning: true,
});

// Whether "t is <evil / the Demon / a Minion / ...>" is true (as t
// registers): an Artist's question, or a Gossip's statement.
export const artistTruth = (t, q) =>
  q === "evil" ? evil(t) : q === "demon" ? isDemon(t) : team(t.role) === q;

const listLabels = (ts) =>
  ts.length < 2
    ? ts.map((x) => x.label).join("")
    : `${ts
        .slice(0, -1)
        .map((x) => x.label)
        .join(", ")} and ${ts.at(-1).label}`;

// The Storyteller's yes/no answer to an Artist asking about one or more
// players ("is any of them ...?"). `mode` is "truth", "lie" (an evil bluffer,
// or a Drunk or poisoned Artist) or "random".
export function artistInfo(s, targets, q, mode) {
  const ts = [].concat(targets);
  const truth = ts.some((t) => artistTruth(t, q));
  const yes =
    mode === "truth" ? truth : mode === "lie" ? !truth : s.r() < 0.5;
  const who = ts.length > 1 ? `any of ${listLabels(ts)}` : ts[0].label;

  return {
    day: s.day,
    night: s.night,
    role: "artist",
    text: `Artist: asked if ${who} is ${ARTIST_QUESTIONS[q]}: ${
      yes ? "YES" : "NO"
    }.`,
    targets: ts.map((t) => t.id),
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
  ts.some((x) => isDemon(x) || x.id === s.red || x.role === "recluse");

const executed = (s) => byId(s, s.lastExecution);

// Seats from the Demon to its nearest Minion, the shorter way round.
function clockmakerCount(s) {
  const n = s.players.length;
  const d = s.players.findIndex(isDemon);
  const steps = s.players
    .map((x, i) => [x, Math.abs(i - d)])
    .filter(([x]) => team(x.role) === "minion")
    .map(([, k]) => Math.min(k, n - k));

  return d < 0 || !steps.length ? 0 : Math.min(...steps);
}

// Any of the options except the true number (0–2 by default), preferring
// one just above or below it, so a lie isn't obviously wrong.
function wrongNumber(s, n, options = [0, 1, 2]) {
  const wrong = options.filter((k) => k !== n);
  const near = wrong.filter((k) => Math.abs(k - n) === 1);

  return pick(near.length ? near : wrong, s.r);
}

const otherGood = (s, p) =>
  nameable(s, p).filter((x) => x.alignment === "good");

const goodRoles = (s) => s.script.ids.filter((id) => alignment(id) === "good");

const grandchildText = (g, role) =>
  `Grandmother: your grandchild is ${g.label}, the ${name(role)}.`;

// Players p's information can name: everyone but p, and never the human in
// an evil player's (bluffed) information.
const nameable = (s, p) =>
  s.players.filter(
    (x) => x.id !== p.id && !(p.alignment === "evil" && x.human),
  );

// ── Sects & Violets information ─────────────────────────────


const evilRoles = (s) => s.script.ids.filter((id) => alignment(id) === "evil");

const dreamText = (t, a, b) =>
  `Dreamer: ${t.label} is the ${name(a)} or the ${name(b)}.`;

// Players whose ability is working abnormally because of another character:
// anyone poisoned or made drunk, and Townsfolk with information tonight
// under the Vortox. (An approximation of the Mathematician's count.)
function mathCount(s, p) {
  const vortox = vortoxActive(s);

  return s.players.filter(
    (x) =>
      x !== p &&
      (x.alive || x.vigor) &&
      (x.poisoned ||
        x.drunkFrom ||
        (vortox &&
          team(x.role) === "townsfolk" &&
          actsTonight(ability(x), s.night))),
  ).length;
}

// What the Flowergirl and Town Crier learn about the day just gone.
const demonVoted = (s) => s.dayVoters.some((id) => isDemon(byId(s, id)));
const minionNominated = (s) =>
  s.dayNominators.some((id) => team(byId(s, id)?.role) === "minion");

const deadCount = (s) => s.players.filter((x) => !x.alive).length;
const deadEvil = (s) => s.players.filter((x) => !x.alive && evil(x)).length;

const flowerText = (yes) =>
  `Flowergirl: a Demon ${yes ? "voted" : "did not vote"} today.`;
const crierText = (yes) =>
  `Town Crier: a Minion ${yes ? "nominated" : "did not nominate"} today.`;
const oracleText = (n) =>
  `Oracle: ${n} dead player${n === 1 ? " is" : "s are"} evil.`;

// How a player's information comes out: "lie" (false, and as helpful to the
// evil team as the evil team's own bluffs) for the Drunk (or anyone made
// drunk), anyone poisoned, and Townsfolk under the Vortox; "random" if dead
// (unless `deadOk`); otherwise "truth".
//
// While the Storyteller is helping good (see lean()), a drunk or poisoned
// good player's information is just random rather than a lie that frames
// good players. (The Vortox's false information is always false.)
export function infoMode(s, p, deadOk = false) {
  const soft = lean(s) === "good" && p.alignment === "good";
  const misled = soft ? "random" : "lie";

  if (
    soft &&
    (isDrunk(p) || p.poisoned) &&
    p.alive &&
    !(team(p.role) === "townsfolk" && vortoxActive(s))
  ) {
    leanNote(s, `${p.label}'s false information is random, not framing.`);
  }

  if (team(p.role) === "townsfolk" && vortoxActive(s)) {
    return "lie";
  }

  if (isDrunk(p)) {
    return misled;
  }

  if (!(deadOk || p.alive || p.vigor)) {
    return "random";
  }

  return p.poisoned ? misled : "truth";
}

// The Seamstress: are these two players the same alignment?
export function seamstressInfo(s, a, b, mode) {
  const same = evil(a) === evil(b);
  const say = mode === "truth" ? same : mode === "lie" ? !same : s.r() < 0.5;

  return {
    night: s.night,
    role: "seamstress",
    text: `Seamstress: ${a.label} and ${b.label} are ${
      say ? "the same alignment" : "different alignments"
    }.`,
    targets: [a.id, b.id],
    trigger: "normal",
    functioning: mode === "truth",
  };
}

// The Sage, killed by the Demon: the Demon is one of two players.
export function sageInfo(s, p, mode) {
  const d = s.players.find((x) => x.alive && isDemon(x));
  const others = nameable(s, p).filter((x) => x !== d);
  const pair =
    mode === "truth" && d
      ? [
          d,
          pick(
            steer(s, others, killHelps, `the other player ${p.label}'s Sage sees`),
            s.r,
          ),
        ]
      : mode === "lie" || !d
        ? sample(others, 2, s.r)
        : sample(nameable(s, p), 2, s.r);
  const [a, b] = shuffle(pair.filter(Boolean), s.r);

  return {
    night: s.night,
    role: "sage",
    text: b ? `Sage: the Demon is ${a.label} or ${b.label}.` : "No information.",
    targets: [a, b].filter(Boolean).map((x) => x.id),
    trigger: "death",
    functioning: mode === "truth",
  };
}

// The Juggler, the night after juggling: how many guesses were right.
export function jugglerInfo(s, guesses, mode) {
  const n = guesses.filter((g) => byId(s, g.id)?.role === g.role).length;
  const options = range(0, guesses.length);
  const said =
    mode === "truth"
      ? n
      : mode === "lie"
        ? (wrongNumber(s, n, options) ?? n)
        : pick(options, s.r);

  return {
    night: s.night,
    role: "juggler",
    text: `Juggler: ${said} of my ${guesses.length} guess${
      guesses.length === 1 ? "" : "es"
    } ${said === 1 ? "was" : "were"} correct.`,
    targets: guesses.map((g) => g.id),
    trigger: "normal",
    functioning: mode === "truth",
  };
}

// Things a Savant can be told, each as a true and a false statement (and
// the players it names). Never about the human, and about different players
// from the Savant's last visit where possible.
function savantFacts(s, p) {
  const all = nameable(s, p).filter((x) => !x.human);
  const last = p.lastPicks?.savant ?? [];
  const fresh = all.filter((x) => !last.includes(x.id));
  const others = fresh.filter((x) => x.alive).length >= 2 ? fresh : all;
  const t = pick(
    others.filter((x) => x.alive),
    s.r,
  );
  const c = pick(others, s.r);
  const d = s.players.find((x) => x.alive && isDemon(x));
  const x = pick(
    others.filter((y) => y.alive && y !== d),
    s.r,
  );
  const outsiders = s.players.filter(
    (y) => team(y.role) === "outsider",
  ).length;
  const thereAre = (n) =>
    `There ${n === 1 ? "is 1 Outsider" : `are ${n} Outsiders`} in play.`;
  const near = Boolean(d && x && neigh(s, x).includes(d));

  return [
    t && {
      ids: [t.id],
      yes: `${t.label} is ${evil(t) ? "evil" : "good"}.`,
      no: `${t.label} is ${evil(t) ? "good" : "evil"}.`,
    },
    {
      ids: [],
      yes: thereAre(outsiders),
      no: thereAre(outsiders ? outsiders + (s.r() < 0.5 ? -1 : 1) : 1),
    },
    c && {
      ids: [c.id],
      yes: `${c.label} is the ${name(c.role)}.`,
      no: `${c.label} is the ${name(
        pick(
          s.script.ids.filter((id) => id !== c.role),
          s.r,
        ),
      )}.`,
    },
    d &&
      x && {
        ids: [x.id],
        yes: `The Demon is ${near ? "" : "not "}a neighbour of ${x.label}.`,
        no: `The Demon is ${near ? "not " : ""}a neighbour of ${x.label}.`,
      },
  ].filter(Boolean);
}

// The Savant's daily visit: two statements, one true and one false (both
// false for a Drunk or under the Vortox; either way when poisoned).
export function savantInfo(s, p, mode) {
  const [a, b] = sample(savantFacts(s, p), 2, s.r);

  // Remembered so the next visit is about other players.
  p.lastPicks = { ...p.lastPicks, savant: [...a.ids, ...b.ids] };

  const said =
    mode === "truth"
      ? shuffle([a.yes, b.no], s.r)
      : mode === "lie"
        ? [a.no, b.no]
        : [a, b].map((f) => (s.r() < 0.5 ? f.yes : f.no));

  return {
    day: s.day,
    night: s.night,
    role: "savant",
    text: `Savant: one of these is true:\n"${said[0]}"\n"${said[1]}"`,
    targets: [],
    trigger: "day",
    functioning: mode === "truth",
  };
}

// What the good twin learns about the Evil Twin.
export const evilTwinInfo = (s, twin) => ({
  night: s.night,
  role: "eviltwin",
  text: `Evil Twin: ${twin.label} is your Evil Twin.`,
  targets: [twin.id],
  trigger: "normal",
  functioning: true,
});

export const philosopherInfo = (s, role) => ({
  night: s.night,
  role: "philosopher",
  text: `Philosopher: gained the ${name(role)} ability.`,
  targets: [],
  trigger: "normal",
  functioning: true,
});

export const snakeInfo = (s, t) => ({
  night: s.night,
  role: "snakecharmer",
  text: `Snake Charmer: chose ${t.label}.`,
  targets: [t.id],
  trigger: "normal",
  functioning: true,
});

// ── Bad Moon Rising information ─────────────────────────────

// The Chambermaid: how many of two players woke tonight due to their
// ability.
export function chambermaidInfo(s, a, b, mode) {
  const n = [a, b].filter((x) => (s.woke ?? []).includes(x.id)).length;
  const said =
    mode === "truth"
      ? n
      : mode === "lie"
        ? wrongNumber(s, n)
        : pick([0, 1, 2], s.r);

  return {
    night: s.night,
    role: "chambermaid",
    text: `Chambermaid: ${said} of ${a.label} and ${b.label} woke tonight.`,
    targets: [a.id, b.id],
    trigger: "normal",
    functioning: mode === "truth",
  };
}

// What a player who chose other players (or a character) remembers about
// their choice: the Sailor, Exorcist, Innkeeper, Courtier and Professor.
export const choiceInfo = (s, role, verb, ts) => ({
  night: s.night,
  role,
  text: `${name(role)}: ${verb} ${
    typeof ts === "string" ? `the ${name(ts)}` : listLabels(ts)
  }.`,
  targets: typeof ts === "string" ? [] : ts.map((x) => x.id),
  trigger: "normal",
  functioning: true,
});

// A Gossip's public statement, as they remember it.
export const gossipInfo = (s, t, q) => ({
  day: s.day,
  night: s.night,
  role: "gossip",
  text: `Gossip: said ${t.label} is ${ARTIST_QUESTIONS[q]}.`,
  targets: [t.id],
  trigger: "day",
  functioning: true,
});

// Correct information for `role`, seen from player p's seat.
function trueInfo(s, p, role, strat) {
  const wanted = PAIR_TEAM[role];

  if (wanted) {
    const real = pick(
      nameable(s, p).filter((x) => team(x.role) === wanted),
      s.r,
    );

    if (!real) {
      return { targets: [], text: "No matching character is in play." };
    }

    // The other player: for an Investigator, an evil one helps good (and a
    // good one helps evil); for a Washerwoman or Librarian, the reverse.
    const fake = pick(
      steer(
        s,
        nameable(s, p).filter((x) => x.id !== real.id),
        (x) =>
          role === "investigator" ? killHelps(x) : x.alignment,
        `the other player ${p.label}'s ${name(role)} sees`,
      ),
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

  if (role === "dreamer") {
    const t = strat.dream(s, p);

    if (!t) {
      return { targets: [], text: "No information." };
    }

    // Either twin: the Evil Twin and the good twin's character, so the
    // twins look the same.
    const twins = s.twins && [s.twins.evilId, s.twins.goodId].includes(t.id);
    const evilTwin = twins && byId(s, s.twins.evilId);
    const goodTwin = twins && byId(s, s.twins.goodId);

    if (evilTwin?.role === "eviltwin" && goodTwin) {
      return {
        targets: [t.id],
        text: dreamText(t, ...shuffle(["eviltwin", goodTwin.role], s.r)),
      };
    }

    // One correct character, and one of the opposite alignment.
    const other = pick(
      (alignment(t.role) === "good" ? evilRoles(s) : goodRoles(s)).filter(
        (id) => id !== t.role,
      ),
      s.r,
    );

    return {
      targets: [t.id],
      text: dreamText(t, ...shuffle([t.role, other], s.r)),
    };
  }

  if (role === "mathematician") {
    return {
      targets: [],
      text: `Mathematician number: ${mathCount(s, p)}.`,
    };
  }

  if (role === "flowergirl") {
    return { targets: [], text: flowerText(demonVoted(s)) };
  }

  if (role === "towncrier") {
    return { targets: [], text: crierText(minionNominated(s)) };
  }

  if (role === "oracle") {
    return { targets: [], text: oracleText(deadEvil(s)) };
  }

  return { targets: [], text: "No information." };
}

const INFO_ROLES = [...FIRST_NIGHT_INFO, ...ONGOING_INFO];

// The good NPC the evil team agrees to frame. Kept until they die, then a new
// one is chosen, preferring good NPCs who have publicly claimed an
// information role (the voices the human is most likely to trust).
//
// A living Lunatic is always the scapegoat: the evil team knows who they are.
export function scapegoat(s) {
  const current = byId(s, s.scapegoat);
  // (Never either twin, who must look alike to the town.)
  const twins = s.twins ? [s.twins.evilId, s.twins.goodId] : [];
  const good = s.players.filter(
    (x) => x.alive && !x.human && x.alignment === "good" && !twins.includes(x.id),
  );
  const lunatic = good.find((x) => x.role === "lunatic");

  if (lunatic) {
    s.scapegoat = lunatic.id;
    return lunatic;
  }

  if (current?.alive && current.alignment === "good" && !twins.includes(current.id)) {
    return current;
  }

  const voices = good.filter((x) => x.claimKnown && INFO_ROLES.includes(x.claim));
  const next = pick(voices.length ? voices : good, s.r);

  s.scapegoat = next?.id ?? null;

  return next;
}

// The good player false information frames: the evil team's scapegoat
// (never p themselves).
function framed(s, p) {
  const goat = scapegoat(s);

  return goat && goat !== p ? goat : null;
}

// p's living evil neighbours, whom false information covers for.
const evilNear = (s, p) => neigh(s, p).filter((x) => evil(x));

// Deliberately false information for `role`, as an evil bluffer tells it.
// A Drunk or poisoned good player hears the same kind of lie, so it helps
// the evil team: it frames the scapegoat and vouches for evil players.
function falseInfo(s, p, role, strat) {
  const wanted = PAIR_TEAM[role];

  if (wanted) {
    const shown = pick(
      s.script.ids.filter((id) => team(id) === wanted),
      s.r,
    );

    // Neither named player holds the character; frame good players if
    // possible. An evil Investigator names the team's scapegoat as one of
    // the two "Minions".
    const others = nameable(s, p).filter((x) => x.role !== shown);
    const good = others.filter((x) => x.alignment === "good");
    const pool = good.length >= 2 ? good : others;
    const goat = role === "investigator" ? framed(s, p) : null;
    const mate =
      goat &&
      pool.includes(goat) &&
      pick(
        pool.filter((x) => x !== goat),
        s.r,
      );

    // A Washerwoman's "Townsfolk" pair gives an evil player cover.
    const shield =
      role === "washerwoman" &&
      pick(
        others.filter((x) => x.alignment === "evil"),
        s.r,
      );
    const cover =
      shield &&
      pick(
        good.filter((x) => x !== shield),
        s.r,
      );
    const pair = mate
      ? shuffle([goat, mate], s.r)
      : cover
        ? shuffle([shield, cover], s.r)
        : sample(pool, 2, s.r);

    return shown && pair.length === 2
      ? {
          targets: pair.map((x) => x.id),
          text: `One of ${pair[0].label} and ${pair[1].label} is ${name(shown)}.`,
        }
      : { targets: [], text: "No matching character is in play." };
  }

  // Fewer evil pairs than there are, where possible.
  if (role === "chef") {
    const n = chefCount(s);

    return {
      targets: [],
      text: `Chef number: ${n > 0 ? n - 1 : n + 1}.`,
    };
  }

  if (role === "empath") {
    // Stay consistent: repeat last night's (wrong) number while the same two
    // neighbours sit either side; once one dies, report a different number.
    // With the evil team's scapegoat as a neighbour, the number goes up.
    const near = neigh(s, p);
    const key = near.map((x) => x.id).join(",");
    const truth = empathCount(s, p);
    const last = p.empathBluff;
    const all = [0, 1, 2].filter((k) => k !== truth && k !== last?.n);
    const close = all.filter((k) => Math.abs(k - truth) === 1);
    const options = close.length ? close : all;
    // With the scapegoat as a neighbour the number goes up; otherwise, with an
    // evil neighbour, it goes down.
    const framing = near.includes(framed(s, p))
      ? options.filter((k) => k > truth)
      : evilNear(s, p).length
        ? options.filter((k) => k < truth)
        : options;

    const n =
      last && last.key === key && last.n !== truth
        ? last.n
        : (pick(framing.length ? framing : options, s.r) ??
          wrongNumber(s, truth));

    p.empathBluff = { key, n };

    return {
      targets: near.map((x) => x.id),
      text: `Empath number: ${n}.`,
    };
  }

  if (role === "fortuneteller") {
    // An evil Fortune Teller "gets a YES" on the scapegoat and another good
    // player (one that really reads NO, so it's still a lie). A misinformed
    // good one keeps their own picks: a Demon among them reads NO.
    const goat = p.alignment === "evil" && framed(s, p);
    const mate =
      goat &&
      pick(
        s.players.filter(
          (x) =>
            x.alive &&
            !x.human &&
            x.alignment === "good" &&
            x !== p &&
            x !== goat &&
            !fortuneYes(s, [x]),
        ),
        s.r,
      );

    if (mate && !fortuneYes(s, [goat])) {
      const ts = shuffle([goat, mate], s.r);

      return { targets: ts.map((x) => x.id), text: fortuneText(true, ts) };
    }

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
  }

  if (role === "clockmaker") {
    const n = wrongNumber(s, clockmakerCount(s), clockRange(s));

    return { targets: [], text: `Clockmaker number: ${n ?? 0}.` };
  }

  if (role === "grandmother") {
    // Vouch for an evil player (or anyone else) with a good character they
    // don't have.
    const g =
      pick(
        nameable(s, p).filter((x) => x.alignment === "evil"),
        s.r,
      ) ?? pick(nameable(s, p), s.r);
    const shown = pick(
      goodRoles(s).filter((id) => id !== g.role),
      s.r,
    );

    return { targets: [g.id], text: grandchildText(g, shown) };
  }

  if (role === "dreamer") {
    const t = strat.dream(s, p);

    if (!t) {
      return { targets: [], text: "No information." };
    }

    // Neither character is right.
    const good = pick(
      goodRoles(s).filter((id) => id !== t.role),
      s.r,
    );
    const bad = pick(
      evilRoles(s).filter((id) => id !== t.role),
      s.r,
    );

    return {
      targets: [t.id],
      text: dreamText(t, ...shuffle([good, bad], s.r)),
    };
  }

  if (role === "mathematician") {
    const n = mathCount(s, p);
    const said = wrongNumber(s, n, range(0, Math.max(3, n + 2)));

    return { targets: [], text: `Mathematician number: ${said}.` };
  }

  // On a day with no votes (or no nominations), "a Demon voted" (or "a Minion
  // nominated") would be obviously false, so they tell the truth.
  if (role === "flowergirl") {
    return {
      targets: [],
      text: flowerText(s.dayVoters.length ? !demonVoted(s) : false),
    };
  }

  if (role === "towncrier") {
    return {
      targets: [],
      text: crierText(s.dayNominators.length ? !minionNominated(s) : false),
    };
  }

  // Never more evil dead than there are dead.
  if (role === "oracle") {
    const n = deadEvil(s);
    const said = wrongNumber(s, n, range(0, deadCount(s))) ?? n;

    return { targets: [], text: oracleText(said) };
  }

  return { targets: [], text: "No information." };
}

// Random information (e.g. a mad player's made-up information).
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
    const pair = sample(
      s.players.filter((x) => x.id !== p.id),
      2,
      s.r,
    );
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
      .map((id) => byId(s, id))
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

  if (role === "dreamer") {
    const t = byId(s, targets[0]);
    const pair = [pick(goodRoles(s), s.r), pick(evilRoles(s), s.r)];

    return t
      ? { targets, text: dreamText(t, ...shuffle(pair, s.r)) }
      : { targets: [], text: "No information." };
  }

  if (role === "mathematician") {
    return {
      targets: [],
      text: `Mathematician number: ${pick(range(0, 3), s.r)}.`,
    };
  }

  if (role === "flowergirl") {
    return { targets: [], text: flowerText(s.r() < 0.5) };
  }

  if (role === "towncrier") {
    return { targets: [], text: crierText(s.r() < 0.5) };
  }

  if (role === "oracle") {
    return {
      targets: [],
      text: oracleText(pick(range(0, deadCount(s)), s.r)),
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

  // The Drunk always hears something wrong, as does every Townsfolk under the
  // Vortox; poisoned players hear noise.
  const mode = infoMode(s, p);

  if (mode === "lie") {
    ({ text, targets } = falseInfo(s, p, role, strat));
  } else if (mode === "random") {
    ({ text, targets } = unreliableInfo(s, p, role, targets));
  }

  return {
    night: s.night,
    role,
    text,
    targets,
    trigger: "normal",
    functioning: mode === "truth",
  };
}

// A Minion bluffing a first-night role uses it to back up the Demon's claim:
// as Washerwoman or Librarian they name the Demon as one of the pair (if the
// Demon claims a character of the team they learn about); as Grandmother they
// name the Demon as their grandchild. Returns null when the role can't help.
function confirmDemon(s, p, role) {
  const d = s.players.find((x) => x.alive && team(x.role) === "demon");
  const claim = d?.claim;

  if (team(p.role) !== "minion" || !d) {
    return null;
  }

  if (PAIR_TEAM[role] && team(claim) === PAIR_TEAM[role]) {
    const others = nameable(s, p).filter((x) => x.id !== d.id);
    const good = others.filter((x) => x.alignment === "good");
    const other = pick(good.length ? good : others, s.r);

    if (!other) {
      return null;
    }

    const pair = s.r() < 0.5 ? [d, other] : [other, d];

    return {
      targets: pair.map((x) => x.id),
      text: `One of ${pair[0].label} and ${pair[1].label} is ${name(claim)}.`,
    };
  }

  if (role === "grandmother" && alignment(claim) === "good") {
    return { targets: [d.id], text: grandchildText(d, claim) };
  }

  return null;
}

// Made-up but plausible information for a player who is "mad" (the
// Cerenovus) about being `role`: what that character would have learned on
// each night so far, with random answers. Choice characters (Monk, Butler,
// Gambler) report choices; a Savant reports today's visit.
export function madInfo(s, p, role, strat) {
  const out = [];

  for (let night = 1; night <= s.night; night++) {
    const view = { ...s, night };

    if (role === "monk" || role === "butler" || role === "gambler") {
      const t =
        role === "gambler"
          ? night > 1 && strat.gamble(view, p)
          : (role === "butler" || night > 1) && strat[role](view, p);

      if (role === "monk" && t) {
        out.push(monkInfo(view, t));
      } else if (role === "butler" && t) {
        out.push(butlerInfo(view, t));
      } else if (role === "gambler" && t) {
        out.push(gamblerInfo(view, t.target, t.role));
      }

      continue;
    }

    if (!actsTonight(role, night)) {
      continue;
    }

    const { targets } = trueInfo(view, p, role, strat);
    const info = unreliableInfo(view, p, role, targets);

    out.push({ night, role, ...info, trigger: "normal", functioning: false });
  }

  if (role === "savant") {
    out.push(savantInfo(s, p, "random"));
  }

  return out;
}

// What an evil NPC reports for the role they are bluffing. A Minion backs up
// the Demon's claim when their role allows it; otherwise a working Spy has
// seen the Grimoire and tells the truth, and every other evil player lies.
export function bluffInfo(s, p, strat) {
  // A Philosopher bluffer reports for the character they "gained".
  const role = p.claim === "philosopher" ? p.bluffGained : p.claim;
  const spy = p.role === "spy" && works(p);

  if (role === "snakecharmer") {
    const t = strat.snake(s, p);

    return t ? snakeInfo(s, t) : null;
  }

  // Once per game, on a night of their choosing.
  if (role === "seamstress") {
    const picks = !p.seamUsed && strat.seamstress(s, p);

    if (!picks) {
      return null;
    }

    p.seamUsed = true;

    return seamstressInfo(s, picks[0], picks[1], spy ? "truth" : "lie");
  }

  if (role === "monk") {
    const t = s.night > 1 ? strat.monk(s, p) : null;

    return t ? monkInfo(s, t) : null;
  }

  // Bad Moon Rising choices: an invented choice (and, for the Chambermaid, a
  // number: true for the Spy).
  if (role === "chambermaid") {
    const picks = strat.chambermaid(s, p);

    return picks
      ? chambermaidInfo(s, picks[0], picks[1], spy ? "truth" : "lie")
      : null;
  }

  if (role === "sailor") {
    const t = strat.sailor(s, p);

    return t ? choiceInfo(s, "sailor", "chose", [t]) : null;
  }

  if (role === "exorcist") {
    const t = s.night > 1 ? strat.exorcist(s, p) : null;

    return t ? choiceInfo(s, "exorcist", "chose", [t]) : null;
  }

  if (role === "innkeeper") {
    const picks = s.night > 1 ? strat.innkeeper(s, p) : null;

    return picks ? choiceInfo(s, "innkeeper", "protected", picks) : null;
  }

  if (role === "courtier") {
    const id = !p.courtierUsed && strat.courtier(s, p);

    if (!id) {
      return null;
    }

    p.courtierUsed = true;

    return choiceInfo(s, "courtier", "chose", id);
  }

  if (role === "butler") {
    const t = strat.butler(s, p);

    return t ? butlerInfo(s, t) : null;
  }

  if (role === "gambler") {
    const guess = s.night > 1 ? strat.gamble(s, p) : null;

    return guess ? gamblerInfo(s, guess.target, guess.role) : null;
  }

  if (!actsTonight(role, s.night)) {
    return null;
  }

  const confirm = confirmDemon(s, p, role);
  const truthful = !confirm && p.role === "spy" && works(p);
  const { text, targets } =
    confirm ??
    (truthful ? trueInfo(s, p, role, strat) : falseInfo(s, p, role, strat));

  return {
    night: s.night,
    role,
    text,
    targets,
    trigger: "normal",
    functioning: truthful,
  };
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
          : Object.keys(ROLES).filter((id) => id !== t.role),
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
