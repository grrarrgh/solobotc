import {
  ARTIST_QUESTIONS,
  FIRST_NIGHT_INFO,
  ONGOING_INFO,
  FINAL_THREE_MARGIN,
  RECLUSE_SAGE_CHANCE,
  COUNTS,
  name,
  team,
  alignment,
} from "./data.js";
import {
  byId,
  bySeat,
  pick,
  sample,
  shuffle,
  claimHeard,
  claimTo,
  whose,
  Whose,
} from "./util.js";
import { logNames } from "./log.js";
import { stanceOn } from "./strategy.js";
import { AMNESIAC_ABILITIES } from "./characters/townsfolk/amnesiac.js";

// Drunk: the Drunk themselves, anyone made drunk "from now on" (by a
// Sweetheart's death or a Philosopher choosing their character), and anyone
// drunk until dusk (the Sailor, Innkeeper, Goon, Courtier or Minstrel).
//
// The Marionette has no ability either: like the Drunk, they act as the
// Townsfolk they were shown, and their information is false.
export const isDrunk = (p) =>
  p.role === "drunk" ||
  p.role === "marionette" ||
  Boolean(p.drunkFrom) ||
  Boolean(p.drunkTonight);

export const isDemon = (p) => team(p.role) === "demon";

// Whether p registers as a Minion: a Minion, or Legion ("You register as a
// Minion too").
export const isMinion = (p) => team(p.role) === "minion" || p.role === "legion";

// The player evil player p believes is the Demon: the Demon, except that a
// Minion shown the Magician too (see strategy fooledBy()) doesn't know
// which of the two it is, so goes by one of them, decided once.
export function demonTo(s, p) {
  const d = s.players.find((x) => x.alive && isDemon(x));
  const magician = s.players.find((x) => x.magicianTrick && x.alive);

  if (!d || !magician || team(p.role) !== "minion" || claimHeard(magician, p) === "magician") {
    return d;
  }

  p.thinksDemon ??= pick([d, magician], s.r).id;

  return byId(s, p.thinksDemon) ?? d;
}

// The ability a player acts with: the Drunk acts as the character they were
// shown, and a Philosopher as the character they gained.
export const ability = (p) =>
  p.role === "drunk" || p.role === "marionette"
    ? p.shown
    : (p.gained ?? p.role);

// Whether NPC p acts out `role` in public without having its ability: an
// evil player (or the Lunatic) bluffing it, or a mad Pixie claiming it (a
// real one, or a Drunk or Marionette shown the Pixie; see
// characters/townsfolk/pixie.js). They use it as a real one would, to no
// effect, and any information it gives them is made up.
export const bluffing = (p, role) =>
  !p.human &&
  p.claim === role &&
  ability(p) !== role &&
  (p.alignment === "evil" ||
    p.role === "lunatic" ||
    ((p.role === "pixie" || p.shown === "pixie") && p.pixieMad));

// A player and their character, for the log: "Player 4, the Poisoner".
export const who = (x) => `${x.label}, the ${name(x.role)}`;

// Why p's information is wrong, for the log: what made them drunk or
// poisoned (and who), or the Vortox. Empty if nothing did.
export function misinformedBy(s, p) {
  const causes = [];
  const vortox = s.players.find(
    (x) => x.alive && x.role === "vortox" && !x.poisoned,
  );

  if (p.role === "drunk" || p.role === "marionette") {
    causes.push(`they are the ${name(p.role)}`);
  }

  if (p.drunkFrom) {
    causes.push(
      `drunk from now on by ${p.drunkFromBy ?? `the ${name(p.drunkFrom)}`}`,
    );
  }

  if (p.drunkTonight) {
    causes.push(`drunk until dusk by ${p.drunkBy ?? "someone's ability"}`);
  }

  if (p.poisoned) {
    causes.push(`poisoned by ${p.poisonedBy ?? "someone's ability"}`);
  }

  if (vortox && team(p.role) === "townsfolk") {
    causes.push(`${who(vortox)}, makes Townsfolk information false`);
  }

  if (!causes.length && !(p.alive || p.vigor)) {
    causes.push("they're dead");
  }

  return causes.join("; ");
}

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

// How many players the game ends with: 3, or 2 with a Zombuul in play
// (alive, or a Zombuul that only registers as dead).
export const finalCount = (s) =>
  s.players.some((x) => x.role === "zombuul" && (x.alive || x.undead))
    ? 2
    : 3;

// Whether the game is down to its final 3 (or 2), shown alive.
export const atFinal = (s) =>
  s.players.filter((x) => x.alive).length <= finalCount(s);

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
  const end = finalCount(s);

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
    names: logNames(s),
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
    leanNote(s, `${what}: one of ${bySeat(better).map((x) => x.label).join(", ")}.`);
  }

  return better.length ? better : pool;
}

// Why a pick from `pool` narrowed by steer() (with the same `helps`) fell
// where it did, for the log: the Storyteller's lean, and how many players
// it chose from.
export function steerWhy(s, pool, helps) {
  const side = lean(s);
  const n = pool.length;
  const better = side ? pool.filter((x) => helps(x) === side).length : 0;
  const lean_ = `Storyteller ${leanText(s).replace(/\.$/, "")}`;

  return !side
    ? `${lean_}; at random from ${n} eligible`
    : !better
      ? `${lean_}, but no eligible pick helps ${side}; at random from ${n}`
      : better === n
        ? `${lean_}; every eligible pick helps ${side}; at random from ${n}`
        : `${lean_}; at random from the ${better} of ${n} eligible whose pick helps ${side}`;
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
const EACH_NIGHT = [
  "empath",
  "villageidiot",
  "highpriestess",
  "fortuneteller",
  "dreamer",
  "mathematician",
  "balloonist",
  "amnesiac",
];
const LATER_NIGHTS = ["undertaker", "flowergirl", "towncrier", "oracle"];

// The team each "one of these two players is X" role learns about.
const PAIR_TEAM = {
  washerwoman: "townsfolk",
  librarian: "outsider",
  investigator: "minion",
};

// Whether an information role wakes tonight.
function actsTonight(role, night) {
  if (FIRST_NIGHT.includes(role) || role === "pixie") {
    return night === 1;
  }

  if (EACH_NIGHT.includes(role)) {
    return true;
  }

  return LATER_NIGHTS.includes(role) && night > 1;
}

const fortuneText = (yes, ts) =>
  `Fortune Teller: ${yes ? "YES" : "NO"} for ${bySeat(ts)
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
// (`self`: they guessed themselves, to be safe.)
export const gamblerInfo = (s, t, guess, died = false, self = false) => ({
  night: s.night,
  role: "gambler",
  guess,
  text: self
    ? "Gambler: guessed myself, to be safe."
    : `Gambler: guessed ${t.human ? "you are" : `${t.label} is`} the ${name(
        guess,
      )}${died ? ", and died" : ""}.`,
  targets: self ? [] : [t.id],
  trigger: "normal",
  functioning: true,
});

// Whether "t is <evil / the Demon / a Minion / ...>" is true (as t
// registers): an Artist's question, or a Gossip's statement.
export const artistTruth = (t, q) =>
  q === "evil" ? evil(t) : q === "demon" ? isDemon(t) : team(t.role) === q;

// In seat order (see bySeat()).
const listLabels = (players) => {
  const ts = bySeat(players);

  return ts.length < 2
    ? ts.map((x) => x.label).join("")
    : `${ts
        .slice(0, -1)
        .map((x) => x.label)
        .join(", ")} and ${ts.at(-1).label}`;
};

// "One of A and B is the X" (in seat order, so which is which doesn't show).
const oneOf = (a, b, role) => {
  const [x, y] = bySeat([a, b]);

  return `One of ${x.label} and ${y.label} is ${name(role)}.`;
};

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
    .filter(([x], i) => isMinion(x) && i !== d)
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

// ── More characters' information ────────────────────────────


const evilRoles = (s) => s.script.ids.filter((id) => alignment(id) === "evil");

const dreamText = (t, a, b) =>
  `Dreamer: ${t.label} is the ${name(a)} or the ${name(b)}.`;

// Players whose ability is working abnormally because of another character:
// anyone poisoned or made drunk, and Townsfolk with information tonight
// under the Vortox. (An approximation of the Mathematician's count.) By
// their jinxes, a Drunk or Marionette whose ability failed tonight counts
// too (one with information tonight, or who woke to choose: a Monk,
// Innkeeper, Sailor...), and so does a Lunatic who "attacked" a player the
// Demon didn't choose tonight.
function mathCount(s, p) {
  const vortox = vortoxActive(s);
  const strayLunatic = (x) =>
    x.role === "lunatic" &&
    s.lunaticPickNight === s.night &&
    !(s.demonChose?.night === s.night && s.demonChose.ids.includes(s.lunaticPick));

  return s.players.filter(
    (x) =>
      x !== p &&
      (x.alive || x.vigor) &&
      (x.poisoned ||
        x.drunkFrom ||
        (["drunk", "marionette"].includes(x.role) &&
          (actsTonight(ability(x), s.night) || (s.woke ?? []).includes(x.id))) ||
        strayLunatic(x) ||
        (vortox &&
          team(x.role) === "townsfolk" &&
          actsTonight(ability(x), s.night))),
  ).length;
}

// What the Flowergirl and Town Crier learn about the day just gone.
const demonVoted = (s) => s.dayVoters.some((id) => isDemon(byId(s, id)));
const minionNominated = (s) =>
  s.dayNominators.some((id) => byId(s, id) && isMinion(byId(s, id)));

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
    leanNote(s, `${Whose(p)} false information is random, not framing.`);
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
    text: `Seamstress: ${listLabels([a, b])} are ${
      say ? "the same alignment" : "different alignments"
    }.`,
    targets: [a.id, b.id],
    trigger: "normal",
    functioning: mode === "truth",
  };
}

// The Sage, killed by the Demon: the Demon is one of two players.
// By the Recluse and Sage jinx, a living Recluse might register as the
// Demon (at RECLUSE_SAGE_CHANCE): shown in the Demon's place.
export function sageInfo(s, p, mode) {
  const demon = s.players.find((x) => x.alive && isDemon(x));
  const recluse = s.players.find((x) => x.alive && x !== p && x.role === "recluse");
  const d =
    mode === "truth" && demon && recluse && s.r() < RECLUSE_SAGE_CHANCE
      ? recluse
      : demon;
  const others = nameable(s, p).filter((x) => x !== d && x !== demon);
  const pair =
    mode === "truth" && d
      ? [
          d,
          pick(
            steer(s, others, killHelps, `the other player ${whose(p)} Sage sees`),
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

// The Juggler, the night after juggling: how many guesses were right. (Or,
// by their jinx, the Cannibal who ate the Juggler `juggler`.)
export function jugglerInfo(s, guesses, mode, juggler = null) {
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
    role: juggler ? "cannibal" : "juggler",
    text: `${juggler ? "Cannibal" : "Juggler"}: ${said} of ${
      juggler ? `${juggler.label}'s` : "my"
    } ${guesses.length} guess${
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

// An evil Savant bluffer's daily visit: two made-up statements, each one
// true or false at random, but never one that hurts their team. A teammate
// is only ever "good", or the character they claim; only a good player is
// ever "evil" (never the evil team's scapegoat "good"); a character named is
// never an evil one in play (that would give it away); the Demon is only
// ever misplaced, never next to a teammate; and the Outsider count is only
// true when no Minion changed it. Never the same statement twice, nor the
// same kind of statement about a player twice (see p.savantSaid), and the
// two are about different things. (The Lunatic's team is the one they
// imagine, with themself as the Demon.)
export function savantBluff(s, p) {
  const lunatic = p.role === "lunatic";
  const mine = (x) =>
    lunatic
      ? x === p || (p.lunaticTeam ?? []).includes(x.id)
      : x.alignment === "evil";
  const demon = lunatic ? p : s.players.find((x) => x.alive && isDemon(x));
  const goat = lunatic ? null : scapegoat(s);
  const inPlay = new Set(s.players.map((x) => x.role));
  const said = new Set(p.savantSaid ?? []);
  const options = [];
  // `group`: what it's about (only one statement each a day); `keys`: what
  // can't be said again.
  const add = (group, kind, text, ids = []) => {
    const keys = [text, ...ids.map((id) => `${kind}:${id}`)];

    if (!keys.some((k) => said.has(k))) {
      options.push({ group, keys, text, ids });
    }
  };

  for (const x of s.players.filter((y) => y.alive && !y.human && y !== p)) {
    if (x !== goat) {
      add(x.id, "alignment", `${x.label} is good.`, [x.id]);
    }

    if (!mine(x)) {
      add(x.id, "alignment", `${x.label} is evil.`, [x.id]);
    }

    const role = mine(x)
      ? alignment(x.claim) === "good" && x.claim !== x.role
        ? x.claim
        : null
      : pick(
          s.script.ids.filter(
            (id) =>
              !(alignment(id) === "evil" && inPlay.has(id)) &&
              !(x === goat && id === x.role),
          ),
          s.r,
        );

    if (role) {
      add(x.id, "character", `${x.label} is the ${name(role)}.`, [x.id]);
    }

    const near = neigh(s, x);

    if (demon && near.includes(demon)) {
      add(x.id, "demon", `The Demon is not a neighbour of ${x.label}.`, [x.id]);
    } else if (demon && !near.some(mine)) {
      add(x.id, "demon", `The Demon is a neighbour of ${x.label}.`, [x.id]);
    }
  }

  const outsiders = s.players.filter((y) => team(y.role) === "outsider").length;
  const base = COUNTS[s.players.length]?.[1] ?? outsiders;

  for (let n = Math.max(0, base - 1); n <= base + 1; n++) {
    if (n !== outsiders || outsiders === base) {
      add(
        "outsiders",
        "outsiders",
        `There ${n === 1 ? "is 1 Outsider" : `are ${n} Outsiders`} in play.`,
      );
    }
  }

  const a = pick(options, s.r);
  const b = a && pick(options.filter((o) => o.group !== a.group), s.r);

  // (With nothing left to say, which takes many days, a plain lie.)
  if (!b) {
    return savantInfo(s, p, "lie");
  }

  p.savantSaid = [...said, ...a.keys, ...b.keys];

  return {
    day: s.day,
    night: s.night,
    role: "savant",
    text: `Savant: one of these is true:\n"${a.text}"\n"${b.text}"`,
    targets: [],
    trigger: "day",
    functioning: false,
  };
}

// The Fisherman's tips: each a true and a false version ({ ids, text }),
// never about the human. That a player is evil (a Minion; falsely, a good
// player, the evil team's scapegoat first); that the Demon is one of 3
// players (falsely, 3 who aren't); that a player is good, so not to execute
// them (the scapegoat first; falsely, an evil player).
function fishermanTips(s, p) {
  const named = nameable(s, p).filter((x) => x.alive && !x.human);
  const d = named.find(isDemon);
  const good = named.filter((x) => !evil(x));
  const goat = framed(s, p);
  const scape = good.includes(goat) ? goat : pick(good, s.r);
  const minion = pick(
    named.filter((x) => evil(x) && !isDemon(x)),
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

// The Puzzlemaster's guess (once): `t` is who they think their puzzle made
// drunk (s.puzzle; see characters/townsfolk/puzzlemaster.js). A right guess
// (working: `mode` "truth") learns the Demon; a wrong one, or a misinformed
// Puzzlemaster's, a player who isn't the Demon (the evil team's scapegoat
// first); "random", anyone. Never the human as the "Demon".
export function puzzleInfo(s, p, t, mode) {
  const right = s.puzzle?.drunkId === t.id;
  const named = nameable(s, p).filter((x) => !x.human);
  const d = s.players.find((x) => (x.alive || x.undead) && isDemon(x));
  const goat = framed(s, p);
  const wrong = named.filter((x) => !isDemon(x));
  const shown =
    mode === "truth" && right && d
      ? d
      : mode === "random"
        ? pick(named, s.r)
        : wrong.includes(goat)
          ? goat
          : pick(wrong, s.r);

  return {
    day: s.day,
    night: s.night,
    role: "puzzlemaster",
    text: shown
      ? `Puzzlemaster: guessed ${t.human ? "you are" : `${t.label} is`} drunk; the Demon is ${shown.label}.`
      : `Puzzlemaster: guessed ${t.human ? "you are" : `${t.label} is`} drunk.`,
    // (Only the "Demon": the guess says nothing about anyone.)
    targets: shown ? [shown.id] : [],
    guessId: t.id,
    right,
    trigger: "day",
    functioning: mode === "truth",
  };
}

// What the good twin learns about the Evil Twin.
export const evilTwinInfo = (s, twin) => ({
  night: s.night,
  role: "eviltwin",
  // (The Evil Twin repeats this naming the good twin, who may be you.)
  text: `Evil Twin: ${twin.label} ${twin.human ? "are" : "is"} your Evil Twin.`,
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
    text: `Chambermaid: ${said} of ${listLabels([a, b])} woke tonight.`,
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
  // (The character chosen, for the Courtier: see strategy courtierLine().)
  ...(typeof ts === "string" && { character: ts }),
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

const nobleText = (ts) => `Noble: one of ${listLabels(ts)} is evil.`;

const idiotText = (t, isEvil) =>
  `Village Idiot: ${t.label} is ${isEvil ? "evil" : "good"}.`;

const priestessText = (t) => `High Priestess: talk to ${t.label}.`;

// The players p's `role` information named on earlier nights, as far as
// they've learned or said it: their own information, or what they made up
// (a cover story, madness, a mad Pixie, a hiding Mutant or Damsel). So a
// Village Idiot or High Priestess doesn't get the same player again.
export function shownBefore(s, p, role) {
  return new Set(
    [p.memories, p.cover?.memories, p.hideInfo?.memories, p.pixieMemories, p.mad?.memories]
      .flat()
      .filter((m) => m && m.role === role && !m.day && m.night < s.night)
      .flatMap((m) => m.targets ?? []),
  );
}

// Whether the High Priestess would do well to talk to x: an evil player
// (whose bluff may not hold up), or a good player whose information is
// wrong (drunk or poisoned) or points at an evil player.
function worthTalking(s, x) {
  if (x.alignment === "evil") {
    return true;
  }

  return x.memories.some(
    (m) =>
      m.functioning === false ||
      (m.targets ?? []).some((id) => byId(s, id)?.alignment === "evil"),
  );
}

// Who the Storyteller believes the High Priestess should talk to most: a
// living NPC worth talking to (see worthTalking()), unless the Storyteller
// is helping evil (see lean()), when it's one who isn't. Misinformed
// (`truth` false), a good player who isn't worth it; an evil bluffer names
// a teammate, who backs them up.
function priestessPick(s, p, truth = true) {
  // (Never one they were shown before, while there's anyone else.)
  const living = s.players.filter((x) => x.alive && !x.human && x !== p);
  const seen = shownBefore(s, p, "highpriestess");
  const unseen = living.filter((x) => !seen.has(x.id));
  const pool = unseen.length ? unseen : living;
  const helps = (x) => (worthTalking(s, x) ? "good" : "evil");

  if (!truth) {
    const mates = pool.filter((x) => x.alignment === "evil");
    const dull = pool.filter((x) => helps(x) === "evil");

    return pick(p.alignment === "evil" && mates.length ? mates : dull.length ? dull : pool, s.r);
  }

  const side = lean(s) ?? "good";
  const better = pool.filter((x) => helps(x) === side);

  // (Only noted when it's what they'll learn: a misinformed High Priestess
  // learns something else; see nightInfo().)
  if (
    lean(s) &&
    works(p) &&
    !(team(p.role) === "townsfolk" && vortoxActive(s)) &&
    better.length &&
    better.length < pool.length
  ) {
    leanNote(
      s,
      `who ${whose(p)} High Priestess should talk to: one of ${bySeat(better)
        .map((x) => x.label)
        .join(", ")}.`,
    );
  }

  return pick(better.length ? better : pool, s.r);
}

const balloonText = (t) => `Balloonist: shown ${t.label}.`;

// The Balloonist: a player of a different character type from the one shown
// last night (any type on Night 1). A working Balloonist sees each type in
// play once, in random order (p.balloonCycle, kept in secretInfo()), then
// starts again with another random order.
function balloonTrue(s, p) {
  const named = nameable(s, p);
  const inPlay = [...new Set(named.map((x) => team(x.role)))].filter(
    (k) => k !== p.balloonType,
  );
  const left = inPlay.filter((k) => !(p.balloonCycle ?? []).includes(k));
  const type = pick(left.length ? left : inPlay, s.r);

  return pick(
    named.filter((x) => team(x.role) === type),
    s.r,
  );
}

// The Amnesiac's secret ability (see AMNESIAC_ABILITIES), given the first
// time it's needed. (Also for a Drunk shown the Amnesiac, and anyone
// bluffing it.)
export const amnesiacKey = (s, p) =>
  (p.amnesiac ??= pick(Object.keys(AMNESIAC_ABILITIES), s.r));

// The Amnesiac's information, said without saying what it means:
// "Amnesiac: YES.", "Amnesiac: Player 5.", "Amnesiac: Player 3 and Player 7.".
const amnesiacYes = (yes, ts) => ({
  targets: ts.map((x) => x.id),
  text: `Amnesiac: ${yes ? "YES" : "NO"}.`,
});
const amnesiacPlayers = (ts) =>
  ts.length
    ? { targets: ts.map((x) => x.id), text: `Amnesiac: ${listLabels(ts)}.` }
    : { targets: [], text: "No information." };
const amnesiacNumber = (n, ts = []) => ({
  targets: ts.map((x) => x.id),
  text: `Amnesiac number: ${n}.`,
});
// Whether a player registers as the Demon (as the Recluse might).
const demonish = (x) => isDemon(x) || x.role === "recluse";
const pixieText = (role) => `Pixie: the ${name(role)} is in play.`;

// The Townsfolk a Pixie can learn: those in play, or (`notInPlay`) those
// that aren't. Never the Pixie.
const pixieOptions = (s, p, notInPlay = false) => {
  const inPlay = new Set(
    s.players.filter((x) => x !== p).map((x) => x.role),
  );

  return s.script.ids.filter(
    (id) =>
      team(id) === "townsfolk" && id !== "pixie" && inPlay.has(id) !== notInPlay,
  );
};

// Correct information for `role`, seen from player p's seat.
function trueInfo(s, p, role, strat) {
  if (role === "noble") {
    const named = nameable(s, p);
    const bad = pick(named.filter(evil), s.r);
    const good = sample(
      named.filter((x) => !evil(x)),
      2,
      s.r,
    );

    if (!bad || good.length < 2) {
      return { targets: [], text: "No information." };
    }

    const ts = shuffle([bad, ...good], s.r);

    return { targets: ts.map((x) => x.id), text: nobleText(ts) };
  }

  // (The Pixie remembers which character, to be mad about.)
  if (role === "pixie") {
    const id = pick(pixieOptions(s, p), s.r);

    p.pixieRole = id;

    return id
      ? { targets: [], text: pixieText(id) }
      : { targets: [], text: "No information." };
  }

  const wanted = PAIR_TEAM[role];

  if (wanted) {
    const real = pick(
      nameable(s, p).filter(
        (x) => team(x.role) === wanted || (wanted === "minion" && isMinion(x)),
      ),
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
        `the other player ${whose(p)} ${name(role)} sees`,
      ),
      s.r,
    );

    return {
      targets: [real.id, fake.id],
      text: oneOf(real, fake, real.role),
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

  if (role === "balloonist") {
    const t = balloonTrue(s, p);

    return t
      ? { targets: [t.id], text: balloonText(t) }
      : { targets: [], text: "No information." };
  }

  if (role === "amnesiac") {
    const key = amnesiacKey(s, p);
    const named = nameable(s, p);

    if (key === "neighbours") {
      return amnesiacYes(neigh(s, p).some(evil), neigh(s, p));
    }

    if (key === "demonneighbour") {
      return amnesiacYes(neigh(s, p).some(demonish), neigh(s, p));
    }

    if (key === "evilneighbours") {
      return amnesiacNumber(empathCount(s, p), neigh(s, p));
    }

    if (key === "evilpairs") {
      return amnesiacNumber(chefCount(s));
    }

    if (key === "goodplayer") {
      return amnesiacPlayers([pick(named.filter((x) => !evil(x)), s.r)].filter(Boolean));
    }

    const bad = pick(named.filter(evil), s.r);
    const good = pick(named.filter((x) => !evil(x)), s.r);

    return amnesiacPlayers(bad && good ? [bad, good] : []);
  }

  if (role === "villageidiot") {
    const t = strat.villageIdiot(s, p);

    return t
      ? { targets: [t.id], text: idiotText(t, evil(t)) }
      : { targets: [], text: "No information." };
  }

  if (role === "highpriestess") {
    const t = priestessPick(s, p);

    return t
      ? { targets: [t.id], text: priestessText(t) }
      : { targets: [], text: "No information." };
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
// one is chosen, preferring good NPCs the evil team knows claim an
// information role, in public or told one of them in private (the voices
// the human is most likely to trust).
//
// A living Lunatic is always the scapegoat: the evil team knows who they are.
export function scapegoat(s) {
  const current = byId(s, s.scapegoat);
  // (Never either twin, who must look alike to the town.)
  const twins = s.twins ? [s.twins.evilId, s.twins.goodId] : [];
  // (Not anyone confirmed good: it wouldn't stick. Nor the Magician, whom
  // the team thinks is one of its own, until they claim it in public.)
  const good = s.players.filter(
    (x) =>
      x.alive &&
      !x.human &&
      x.alignment === "good" &&
      !(x.magicianTrick && claimTo(x) !== "magician") &&
      !twins.includes(x.id) &&
      !["certain", "likely"].includes(s.confirmed?.[x.id]?.level),
  );
  const lunatic = good.find((x) => x.role === "lunatic");

  if (lunatic) {
    s.scapegoat = lunatic.id;
    return lunatic;
  }

  if (
    current?.alive &&
    current.alignment === "good" &&
    !twins.includes(current.id) &&
    !["certain", "likely"].includes(s.confirmed?.[current.id]?.level)
  ) {
    return current;
  }

  const evilTeam = s.players.filter((x) => x.alignment === "evil");
  const voices = good.filter((x) =>
    [null, ...evilTeam].some((e) => INFO_ROLES.includes(claimHeard(x, e))),
  );
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

// Whether x is someone p's false information covers for: an evil
// bluffer's teammates (by alignment: they know the Spy is one of them), or
// for a misinformed good player, anyone registering as evil.
const covered = (p, x) => (p.alignment === "evil" ? x.alignment === "evil" : evil(x));

// p's living evil neighbours, whom false information covers for.
const evilNear = (s, p) => neigh(s, p).filter((x) => covered(p, x));

// A false Noble: 3 players with no evil among them (the evil team's
// scapegoat first), or failing that 2 evil. Never the Demon (so with too
// few players to name, the 3 may happen to hold just 1 evil), unless
// there's nobody else to name (Legion, every one of them a Demon).
function falseNoble(s, p) {
  const named = nameable(s, p).filter((x) => !isDemon(x));
  const good = named.filter((x) => !covered(p, x));
  const goat = framed(s, p);
  const three = good.includes(goat)
    ? [goat, ...sample(good.filter((x) => x !== goat), 2, s.r)]
    : sample(good, 3, s.r);

  if (three.length === 3) {
    return shuffle(three, s.r);
  }

  const bad = sample(named.filter((x) => covered(p, x)), 2, s.r);
  const ts = [...bad, ...sample(good, 3 - bad.length, s.r)];

  // (Still short, as with Legion, where every evil player is a Demon:
  // anyone else they can name.)
  return shuffle(
    [
      ...ts,
      ...sample(
        nameable(s, p).filter((x) => !ts.includes(x)),
        3 - ts.length,
        s.r,
      ),
    ],
    s.r,
  );
}

// Deliberately false information for `role`, as an evil bluffer tells it.
// A Drunk or poisoned good player hears the same kind of lie, so it helps
// the evil team: it frames the scapegoat and vouches for evil players.
// (`helpEvil`: a good player's lie that must help evil, the Poisoner's Night 1
// pick, where a misinformed Noble's 3 would otherwise be random.)
function falseInfo(s, p, role, strat, helpEvil = false) {
  const wanted = PAIR_TEAM[role];

  // A misinformed Noble (or a Marionette) sees any 3 players; an evil Noble
  // bluffer (or a Marionette the Demon has told) frames 3 good ones.
  if (role === "noble") {
    const misled =
      !helpEvil &&
      (p.alignment === "good" || (p.role === "marionette" && !p.toldEvil));
    const ts = misled ? sample(nameable(s, p), 3, s.r) : falseNoble(s, p);

    return ts.length === 3
      ? { targets: ts.map((x) => x.id), text: nobleText(ts) }
      : { targets: [], text: "No information." };
  }

  // A misinformed Pixie learns a Townsfolk that isn't in play (and is mad
  // about it, to no effect).
  if (role === "pixie") {
    const id =
      pick(pixieOptions(s, p, true), s.r) ?? pick(pixieOptions(s, p), s.r);

    p.pixieRole = id;

    return id
      ? { targets: [], text: pixieText(id) }
      : { targets: [], text: "No information." };
  }

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

    // A Washerwoman's "Townsfolk" pair gives an evil player cover (and, when
    // it must help evil, a Librarian's "Outsider" pair).
    const shield =
      (role === "washerwoman" || (helpEvil && role === "librarian")) &&
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
    // (Vouching for the shield as the Townsfolk they claim, so their story
    // holds up, rather than a character neither claims.)
    const said = cover && claimHeard(shield, p);
    const vouched =
      said && team(said) === PAIR_TEAM[role] && p.alignment === "evil" ? said : shown;

    return vouched && pair.length === 2
      ? {
          targets: pair.map((x) => x.id),
          text: oneOf(pair[0], pair[1], vouched),
        }
      : shown && pair.length === 2
      ? {
          targets: pair.map((x) => x.id),
          text: oneOf(pair[0], pair[1], shown),
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

    // (An evil bluffer next to a teammate says 0: anything more points at
    // them.)
    const n =
      p.alignment === "evil" && evilNear(s, p).length
        ? 0
        : last && last.key === key && last.n !== truth
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
    // don't have: the one they claim, so it backs them up instead of
    // contradicting them.
    const g =
      pick(
        nameable(s, p).filter((x) => x.alignment === "evil"),
        s.r,
      ) ?? pick(nameable(s, p), s.r);
    const shown =
      alignment(g.claim) === "good" && g.claim !== g.role
        ? g.claim
        : pick(
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

  // A player of the same type as last night's (any player on Night 1). An
  // evil bluffer goes by what players claim instead, so their story holds
  // up: a player whose claimed type differs from last night's.
  if (role === "balloonist" && p.alignment === "evil") {
    const named = nameable(s, p);
    const claimed = (x) => team(claimHeard(x, p)) ?? null;
    const differs = named.filter(
      (x) => claimed(x) && claimed(x) !== p.balloonClaimed,
    );
    const unknown = named.filter((x) => !claimed(x));
    const t = pick(differs.length ? differs : unknown.length ? unknown : named, s.r);

    p.balloonClaimed = t ? claimed(t) : null;

    return t
      ? { targets: [t.id], text: balloonText(t) }
      : { targets: [], text: "No information." };
  }

  if (role === "balloonist") {
    const named = nameable(s, p);
    const same = named.filter(
      (x) => p.balloonType && team(x.role) === p.balloonType,
    );
    const t = pick(same.length ? same : named, s.r);

    return t
      ? { targets: [t.id], text: balloonText(t) }
      : { targets: [], text: "No information." };
  }

  // The wrong answer: vouching for an evil player, or framing good ones (the
  // scapegoat first).
  if (role === "amnesiac") {
    const key = amnesiacKey(s, p);
    const named = nameable(s, p);
    const good = named.filter((x) => !covered(p, x) && !isDemon(x));
    const mates = p.alignment === "evil" && evilNear(s, p).length > 0;

    // (An evil bluffer next to a teammate says NO, or 0.)
    if (key === "neighbours") {
      return amnesiacYes(!mates && !neigh(s, p).some(evil), neigh(s, p));
    }

    if (key === "demonneighbour") {
      return amnesiacYes(!mates && !neigh(s, p).some(demonish), neigh(s, p));
    }

    if (key === "evilneighbours") {
      return amnesiacNumber(mates ? 0 : wrongNumber(s, empathCount(s, p)), neigh(s, p));
    }

    if (key === "evilpairs") {
      const n = chefCount(s);

      return amnesiacNumber(n > 0 ? n - 1 : n + 1);
    }

    if (key === "goodplayer") {
      const t =
        pick(named.filter((x) => x.alignment === "evil"), s.r) ??
        pick(named, s.r);

      return amnesiacPlayers(t ? [t] : []);
    }

    const goat = framed(s, p);
    const pair = good.includes(goat)
      ? [goat, pick(good.filter((x) => x !== goat), s.r)]
      : sample(good, 2, s.r);

    return amnesiacPlayers(pair.every(Boolean) && pair.length === 2 ? bySeat(pair) : []);
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

  // The wrong alignment: an evil bluffer "learns" the scapegoat is evil, or
  // a teammate good.
  if (role === "villageidiot") {
    const t = strat.villageIdiot(s, p);

    return t
      ? {
          targets: [t.id],
          text: idiotText(t, p.alignment === "evil" ? !covered(p, t) : !evil(t)),
        }
      : { targets: [], text: "No information." };
  }

  if (role === "highpriestess") {
    const t = priestessPick(s, p, false);

    return t
      ? { targets: [t.id], text: priestessText(t) }
      : { targets: [], text: "No information." };
  }

  // Never more evil dead than there are dead, and never fewer than they
  // said before (the dead don't come back), so the lie can't be caught out.
  if (role === "oracle") {
    const n = deadEvil(s);
    const least = Math.min(p.oracleSaid ?? 0, deadCount(s));
    const said =
      wrongNumber(s, n, range(least, deadCount(s))) ?? Math.max(n, least);

    p.oracleSaid = said;

    return { targets: [], text: oracleText(said) };
  }

  return { targets: [], text: "No information." };
}

// Random information (e.g. a mad player's made-up information).
function unreliableInfo(s, p, role, targets) {
  if (role === "noble") {
    const ts = sample(
      s.players.filter((x) => x.id !== p.id),
      3,
      s.r,
    );

    return { targets: ts.map((x) => x.id), text: nobleText(ts) };
  }

  // (A Pixie bluffer goes mad about it, as a real one would: see
  // characters/townsfolk/pixie.js.)
  if (role === "pixie") {
    const id = pick(
      s.script.ids.filter((x) => team(x) === "townsfolk" && x !== "pixie"),
      s.r,
    );

    p.pixieRole = id;

    return { targets: [], text: id ? pixieText(id) : "No information." };
  }

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
          ? oneOf(pair[0], pair[1], shown)
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
    const shown = pick(s.script.ids, s.r);

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

  if (role === "balloonist") {
    const t = pick(nameable(s, p), s.r);

    return t
      ? { targets: [t.id], text: balloonText(t) }
      : { targets: [], text: "No information." };
  }

  if (role === "amnesiac") {
    const key = amnesiacKey(s, p);
    const others = s.players.filter((x) => x.id !== p.id);

    const shape = AMNESIAC_ABILITIES[key].shape;

    return shape === "yesno"
      ? amnesiacYes(s.r() < 0.5, neigh(s, p))
      : shape === "number"
        ? amnesiacNumber(Math.floor(s.r() * 3), key === "evilneighbours" ? neigh(s, p) : [])
        : amnesiacPlayers(sample(others, shape === "player" ? 1 : 2, s.r));
  }

  if (role === "villageidiot") {
    const t = byId(s, targets[0]);

    return t
      ? { targets, text: idiotText(t, s.r() < 0.5) }
      : { targets: [], text: "No information." };
  }

  if (role === "highpriestess") {
    const living = s.players.filter((x) => x.alive && !x.human && x.id !== p.id);
    const seen = shownBefore(s, p, "highpriestess");
    const unseen = living.filter((x) => !seen.has(x.id));
    const t = pick(unseen.length ? unseen : living, s.r);

    return t
      ? { targets: [t.id], text: priestessText(t) }
      : { targets: [], text: "No information." };
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
  // A first-night ability gained later (by the Cannibal, or a Barber swap)
  // is used that night: the Pixie's too, so they learn an in-play Townsfolk.
  const gainedTonight =
    p.gainedNight === s.night &&
    (FIRST_NIGHT.includes(role) || role === "pixie");

  if (!p.alive || !(actsTonight(role, s.night) || gainedTonight)) {
    return null;
  }

  let { text, targets } = trueInfo(s, p, role, strat);

  // The Grandmother's link to her real grandchild exists even if she is
  // misinformed; whether it kills her is checked when the Demon strikes.
  if (role === "grandmother") {
    p.grandchild = targets[0] ?? null;
  }

  // The Drunk always hears something wrong, as does every Townsfolk under the
  // Vortox; poisoned players hear noise. On Night 1, the Poisoner's pick
  // with first-night information always hears a lie that helps the evil
  // team, whichever way the Storyteller leans.
  const poisonerPick =
    s.night === 1 &&
    p.poisoned &&
    s.poisoned === p.id &&
    FIRST_NIGHT.includes(role);
  const mode = poisonerPick ? "lie" : infoMode(s, p);

  if (mode === "lie") {
    ({ text, targets } = falseInfo(s, p, role, strat, poisonerPick));
  } else if (mode === "random") {
    ({ text, targets } = unreliableInfo(s, p, role, targets));
  }

  return secretInfo(s, p, {
    night: s.night,
    role,
    text,
    targets,
    trigger: "normal",
    functioning: mode === "truth",
  });
}

// What a night's information leaves behind: the type of player a Balloonist
// was shown (tomorrow's must differ), and which secret ability an
// Amnesiac's information is from (see infoStance() in strategy.js: it means
// something to them once they've guessed it).
function secretInfo(s, p, info) {
  const t = byId(s, info.targets[0]);

  if (info.role === "balloonist" && t) {
    const k = team(t.role);
    const cycle = p.balloonCycle ?? [];

    p.balloonType = k;

    // (A type seen again starts a new cycle.)
    if (info.functioning) {
      p.balloonCycle = cycle.includes(k) ? [k] : [...cycle, k];
    }
  }

  return info.role === "amnesiac"
    ? {
        ...info,
        amnesiac: amnesiacKey(s, p),
        known: info.known ?? Boolean(p.amnesiacKnown),
      }
    : info;
}

// An evil player bluffing the Dreamer: the player they dream is the
// character they claim, or an evil character not in play (so it doesn't give
// away the evil team's characters) and not claimed, so their story holds up
// against the town's claims. The same player dreamed again gets the same pair, while their
// claim stands.
function dreamerBluff(s, p, strat) {
  const t = strat.dream(s, p);

  if (!t) {
    return { targets: [], text: "No information." };
  }

  const claimed = new Set(s.players.map((x) => x.claim));
  const said = (p.dreamBluffs ??= {})[t.id];
  const good = goodRoles(s).includes(t.claim)
    ? t.claim
    : pick(goodRoles(s).filter((id) => !claimed.has(id)), s.r) ?? pick(goodRoles(s), s.r);
  const inPlay = new Set(s.players.map((x) => x.role));
  const evils = evilRoles(s).filter((id) => !inPlay.has(id));
  const bad =
    pick(evils.filter((id) => !claimed.has(id)), s.r) ?? pick(evils, s.r);
  // (Unless they've since claimed something else.)
  const pair = said?.includes(t.claim) ? said : shuffle([good, bad], s.r);

  p.dreamBluffs[t.id] = pair;

  return { targets: [t.id], text: dreamText(t, ...pair) };
}

// A Minion bluffing a first-night role uses it to back up the Demon's claim:
// as Washerwoman or Librarian they name the Demon as one of the pair (if the
// Demon claims a character of the team they learn about); as Grandmother they
// name the Demon as their grandchild. Returns null when the role can't help.
function confirmDemon(s, p, role) {
  // (Shown the Magician too, they back up whichever they think it is.)
  const d = demonTo(s, p);
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
      text: oneOf(pair[0], pair[1], claim),
    };
  }

  if (role === "grandmother" && alignment(claim) === "good") {
    return { targets: [d.id], text: grandchildText(d, claim) };
  }

  return null;
}

// Whether information m, in evil player p's mouth, points at one of their
// teammates (see strategy stanceOn()).
const givesAway = (s, p, m) =>
  (m.targets ?? []).some((id) => {
    const x = byId(s, id);

    return x && x !== p && x.alignment === "evil" && stanceOn(s, m, x, p) === "suspicious";
  });

// Characters who choose each night, and what a player claiming one
// without its ability (an evil bluffer, a "mad" player, or a good player's
// cover story) says they chose tonight: an invented choice, or null if that
// character doesn't choose tonight. (For the Chambermaid, also a number, by
// `mode`: see infoMode().)
const CHOOSERS = [
  "snakecharmer",
  "monk",
  "chambermaid",
  "sailor",
  "exorcist",
  "innkeeper",
  "butler",
  "gambler",
];

function madeUpChoice(s, p, role, strat, mode) {
  if (role === "snakecharmer") {
    const t = strat.snake(s, p);

    return t ? snakeInfo(s, t) : null;
  }

  if (role === "monk") {
    const t = s.night > 1 ? strat.monk(s, p) : null;

    return t ? monkInfo(s, t) : null;
  }

  if (role === "chambermaid") {
    const picks = strat.chambermaid(s, p);

    return picks ? chambermaidInfo(s, picks[0], picks[1], mode) : null;
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

  if (role === "butler") {
    const t = strat.butler(s, p);

    return t ? butlerInfo(s, t) : null;
  }

  if (role === "gambler") {
    const guess = s.night > 1 ? strat.gamble(s, p) : null;

    return guess
      ? gamblerInfo(s, guess.target, guess.role, false, guess.self)
      : null;
  }

  return null;
}

// Made-up but plausible information for a player who is "mad" (the
// Cerenovus) about being `role`: what that character would have learned on
// each night so far, with random answers. Choice characters (see CHOOSERS)
// report choices; a Savant reports today's visit.
//
// A Cannibal or Philosopher has another character's ability (see
// madGained()): its made-up information, from the night it's gained (a
// first-night one, just that night), and the Philosopher's choice.
export function madInfo(s, p, role, strat) {
  const out = [];

  for (let night = 1; night <= s.night; night++) {
    const view = { ...s, night };
    const gain = madGained(s, p, role, night);
    const used = gain ? gain.role : role;
    const fresh = Boolean(gain) && gain.from === night;

    if (role === "philosopher" && fresh) {
      out.push({ ...philosopherInfo(view, used), functioning: false });
    }

    if (gain === null) {
      continue;
    }

    if (CHOOSERS.includes(used)) {
      const m = madeUpChoice(view, p, used, strat, "random");

      if (m) {
        out.push(m);
      }

      continue;
    }

    if (!actsTonight(used, night) && !(fresh && FIRST_NIGHT.includes(used))) {
      continue;
    }

    const { targets } = trueInfo(view, p, used, strat);
    const info = unreliableInfo(view, p, used, targets);

    out.push({ night, role: used, ...info, trigger: "normal", functioning: false });
  }

  if (role === "savant") {
    out.push(savantInfo(s, p, "random"));
  }

  return out;
}

// For made-up information (see madInfo()), the ability a claimed Cannibal
// or Philosopher has on `night`: { role, from } (the night it was gained),
// null if they have none yet, or undefined for any other character.
// - A Cannibal: the last player executed before that night, as the
//   character p heard them claim when they were executed (see engine
//   cannibals()), if good, from the night after.
// - A Philosopher: a good character with information on the script, chosen
//   once (p.madGained), from Night 1, as an NPC Philosopher chooses at once.
// (Never the Pixie, whose information would give them away.)
function madGained(s, p, role, night) {
  if (role === "philosopher") {
    p.madGained ??= pick(
      goodRoles(s).filter(
        (id) =>
          !["philosopher", "pixie", "drunk", "lunatic"].includes(id) &&
          INFO_ROLES.includes(id),
      ),
      s.r,
    );

    return p.madGained ? { role: p.madGained, from: 1 } : null;
  }

  if (role !== "cannibal") {
    return undefined;
  }

  const last = (p.madCannibal ?? []).filter((x) => x.night <= night).at(-1);
  // (A real Cannibal isn't told the character: with no claim to go by, one
  // with information, chosen once for that executee.)
  const eaten =
    last &&
    (last.as ??= pick(
      goodRoles(s).filter((id) => INFO_ROLES.includes(id) && id !== "pixie"),
      s.r,
    ));

  return eaten && alignment(eaten) === "good" && eaten !== "pixie"
    ? { role: eaten, from: last.night }
    : null;
}

// What an evil NPC reports for the role they are bluffing. A Minion backs up
// the Demon's claim when their role allows it; otherwise a working Spy has
// seen the Grimoire and tells the truth, and every other evil player lies.
// An evil Dreamer bluffer (see dreamerBluff()) goes by what players claim.
export function bluffInfo(s, p, strat) {
  // A Philosopher or Cannibal bluffer reports for the character they
  // "gained" (nothing until they have one); a first-night one the night
  // after they gain it, as a real Cannibal would.
  // (A Pixie bluffer who "gained" theirs claims the Pixie again.)
  const gains =
    ["philosopher", "cannibal"].includes(p.claim) ||
    (p.claim === "pixie" && p.bluffGained);
  const role = gains ? p.bluffGained : p.claim;
  const spy = p.role === "spy" && works(p);
  const gainedTonight =
    p.claim === "cannibal" &&
    p.bluffGainedNight === s.night &&
    FIRST_NIGHT.includes(role);

  if (!role) {
    return null;
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

  if (role === "courtier") {
    const id = !p.courtierUsed && strat.courtier(s, p);

    if (!id) {
      return null;
    }

    p.courtierUsed = true;

    return choiceInfo(s, "courtier", "chose", id);
  }

  if (CHOOSERS.includes(role)) {
    return madeUpChoice(s, p, role, strat, spy ? "truth" : "lie");
  }

  if (!actsTonight(role, s.night) && !gainedTonight) {
    return null;
  }

  const confirm = confirmDemon(s, p, role);
  // (A working Spy tells the truth, unless it points at a teammate.)
  // (What an Amnesiac's means, as the bluffer "knows" it, decides that.)
  const truth =
    !confirm && p.role === "spy" && works(p)
      ? {
          role,
          ...trueInfo(s, p, role, strat),
          ...(role === "amnesiac" && { amnesiac: amnesiacKey(s, p), known: true }),
        }
      : null;
  const truthful = Boolean(truth) && !givesAway(s, p, truth);
  const { text, targets } =
    confirm ??
    (truthful
      ? truth
      : role === "dreamer"
        ? dreamerBluff(s, p, strat)
        : falseInfo(s, p, role, strat));

  // (A bluffer "knows" what their Amnesiac information means.)
  return secretInfo(s, p, {
    night: s.night,
    role,
    text,
    targets,
    trigger: "normal",
    functioning: truthful,
    ...(role === "amnesiac" && { known: true }),
  });
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
