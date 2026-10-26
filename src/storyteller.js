import {
  FIRST_NIGHT_INFO,
  ONGOING_INFO,
  FINAL_THREE_MARGIN,
  HIDDEN_OUTSIDERS,
  exclusiveWith,
  name,
  team,
  alignment,
} from "./data.js";
import {
  byId,
  bySeat,
  pick,
  claimHeard,
  claimTo,
  whose,
  Whose,
} from "./util.js";
import { logNames } from "./log.js";
import { AMNESIAC_ABILITIES } from "./characters/townsfolk/amnesiac.js";
import { infoOf } from "./characters/info.js";

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
  // (Kept apart by the Poppy Grower, a Minion doesn't know.)
  if (p.poppyBlind && team(p.role) === "minion") {
    return null;
  }

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

// Whether p is the Wizard who can't nominate or vote in the second round of
// nominations they wished for: their wish's price (see wizard.js).
export const wishBarred = (s, p) =>
  Boolean(s.secondRound?.open && s.secondRound.day === s.day && s.secondRound.wizardId === p.id);

// The Minion ability p acts with: an Alchemist's (see
// characters/townsfolk/alchemist.js; also a Drunk shown the Alchemist, to
// no effect), or their own character's.
export const minionAbility = (p) =>
  ability(p) === "alchemist" ? (p.alchemist ?? null) : ability(p);

// p's Minion ability, for the log: "Fearmonger", or "Alchemist-Fearmonger".
export const minionLabel = (p) =>
  ability(p) === "alchemist" ? `Alchemist-${name(p.alchemist)}` : name(ability(p));

// Whether NPC p acts out `role` in public without having its ability: an
// evil player (or the Lunatic) bluffing it; a mad Pixie claiming it (a real
// one, or a Drunk or Marionette shown the Pixie; see
// characters/townsfolk/pixie.js); a good Mutant or Damsel hiding behind it
// (see HIDDEN_OUTSIDERS); anyone the Cerenovus made mad as it today; or a
// good player whose cover story it is (see strategy coverFor()). They use it
// as a real one would, to no effect, and any information it gives them is
// made up (see bluff.js madeUpMemories()). (A good one only acts against a
// player they strongly suspect: see strategy strongSuspect().)
export const bluffing = (p, role) =>
  !p.human &&
  ability(p) !== role &&
  (p.cover?.as === role ||
    (p.claim === role &&
      (p.alignment === "evil" ||
        p.role === "lunatic" ||
        ((p.role === "pixie" || p.shown === "pixie") && p.pixieMad) ||
        HIDDEN_OUTSIDERS.includes(p.role) ||
        (p.mad?.role === role && p.mad.previous !== null))));

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

// The characters that can't come into play now, by a jinx with one that's
// in play, or whose ability is (`exclusive`: the Heretic with a Baron, Spy...).
export const jinxBarred = (s) =>
  new Set(s.players.flatMap((x) => [x.role, x.gained].filter(Boolean)).flatMap(exclusiveWith));

// Whether a Poppy Grower has their ability (alive, sober and healthy): the
// Minions and Demon don't know each other, and (their jinxes) the Spy and
// Widow don't see the Grimoire. See characters/townsfolk/poppygrower.js.
export const poppyBlocks = (s) =>
  s.players.some((x) => x.role === "poppygrower" && x.alive && !isDrunk(x) && !x.poisoned);

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

// How a player registers to information abilities. (A drunk or poisoned
// Spy has no ability, so registers as what they are.)
export const registersEvil = (p) =>
  p.role === "recluse"
    ? true
    : p.role === "spy" && !isDrunk(p) && !p.poisoned
      ? false
      : p.alignment === "evil";

const evil = registersEvil;

const FIRST_NIGHT = FIRST_NIGHT_INFO;

// Whether an information role wakes tonight (see each character's `nights`).
export function actsTonight(role, night) {
  const nights = infoOf(role)?.nights;

  return nights === "first" ? night === 1 : nights === "each" || (nights === "later" && night > 1);
}

// In seat order (see bySeat()).
export const listLabels = (players) => {
  const ts = bySeat(players);

  return ts.length < 2
    ? ts.map((x) => x.label).join("")
    : `${ts
        .slice(0, -1)
        .map((x) => x.label)
        .join(", ")} and ${ts.at(-1).label}`;
};

// "One of A and B is the X" (in seat order, so which is which doesn't show).
export const oneOf = (a, b, role) => {
  const [x, y] = bySeat([a, b]);

  return `One of ${x.label} and ${y.label} is ${name(role)}.`;
};

export const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

// Nearest living neighbours on each side.
export function neigh(s, p) {
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

// Any of the options except the true number (0–2 by default), preferring
// one just above or below it, so a lie isn't obviously wrong.
export function wrongNumber(s, n, options = [0, 1, 2]) {
  const wrong = options.filter((k) => k !== n);
  const near = wrong.filter((k) => Math.abs(k - n) === 1);

  return pick(near.length ? near : wrong, s.r);
}

export const goodRoles = (s) => s.script.ids.filter((id) => alignment(id) === "good");

export const evilRoles = (s) => s.script.ids.filter((id) => alignment(id) === "evil");

// Players p's information can name: everyone but p, and never the human in
// an evil player's (bluffed) information.
export const nameable = (s, p) =>
  s.players.filter(
    (x) => x.id !== p.id && !(p.alignment === "evil" && x.human),
  );

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

// The players p's `role` information named on earlier nights, as far as
// they've learned or said it: their own information, or what they made up
// (a cover story, madness, a mad Pixie, a hiding Mutant or Damsel). So a
// Village Idiot or High Priestess doesn't get the same player again.
export function shownBefore(s, p, role) {
  return new Set(
    [
      p.memories,
      p.cover?.memories,
      p.bluffState?.hidden?.memories,
      p.bluffState?.pixie?.memories,
      p.mad?.memories,
      // (A made-up story, as it's being made: see bluff.js backStory().)
      p.bluffState?.building,
    ]
      .flat()
      .filter((m) => m && m.role === role && !m.day && m.night < s.night)
      .flatMap((m) => m.targets ?? []),
  );
}

// The Amnesiac's secret ability (see AMNESIAC_ABILITIES), given the first
// time it's needed. (Also for a Drunk shown the Amnesiac, and anyone
// bluffing it.)
export const amnesiacKey = (s, p) =>
  (p.amnesiac ??= pick(Object.keys(AMNESIAC_ABILITIES), s.r));

// ── Each character's information ────────────────────────────
//
// Each character's own module has its information (see infoOf() in
// characters/index.js): correct information (`truth`), deliberately false
// information that helps the evil team (`lie`), and noise (`random`).

const noInfo = () => ({ targets: [], text: "No information." });

// Correct information for `role`, seen from player p's seat.
export function trueInfo(s, p, role, strat) {
  return infoOf(role)?.truth?.(s, p, strat) ?? noInfo();
}

// Deliberately false information for `role`, as an evil bluffer tells it.
// A Drunk or poisoned good player hears the same kind of lie, so it helps
// the evil team: it frames the scapegoat and vouches for evil players.
// (`helpEvil`: a good player's lie that must help evil, the Poisoner's Night 1
// pick, where a misinformed Noble's 3 would otherwise be random.)
export function falseInfo(s, p, role, strat, helpEvil = false) {
  return infoOf(role)?.lie?.(s, p, strat, helpEvil) ?? noInfo();
}

// Random information (e.g. a mad player's made-up information).
export function unreliableInfo(s, p, role, targets) {
  return infoOf(role)?.random?.(s, p, targets) ?? { targets, text: "No information." };
}

export const INFO_ROLES = [...FIRST_NIGHT_INFO, ...ONGOING_INFO];

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
      !["certain", "likely"].includes(s.confirmed?.[x.id]?.level) &&
      // (Nor a Lleech's host: their execution would kill the Lleech.)
      !s.players.some((d) => d.alive && d.role === "lleech" && d.lleechHost === x.id),
  );
  const lunatic = good.find((x) => x.role === "lunatic");
  // (The evil Fearmonger's chosen player: if they nominate and execute them,
  // good loses, so the team frames them.)
  const feared = good.find((x) =>
    s.players.some((f) => f.alive && f.role === "fearmonger" && f.alignment === "evil" && f.fearTarget === x.id),
  );

  if (lunatic) {
    s.scapegoat = lunatic.id;
    return lunatic;
  }

  if (feared) {
    s.scapegoat = feared.id;
    s.scapegoatWhy = "the Fearmonger's chosen player";
    return feared;
  }

  s.scapegoatWhy = null;

  if (
    current?.alive &&
    current.alignment === "good" &&
    !s.players.some((d) => d.alive && d.role === "lleech" && d.lleechHost === current.id) &&
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
export function framed(s, p) {
  const goat = scapegoat(s);

  return goat && goat !== p ? goat : null;
}

// Whether x is someone p's false information covers for: an evil
// bluffer's teammates (by alignment: they know the Spy is one of them), or
// for a misinformed good player, anyone registering as evil.
// (Kept apart by the Poppy Grower, only themself: see poppygrower.js.)
export const covered = (p, x) =>
  p.alignment === "evil" ? x.alignment === "evil" && (!p.poppyBlind || x === p) : evil(x);

// p's living evil neighbours, whom false information covers for.
export const evilNear = (s, p) => neigh(s, p).filter((x) => covered(p, x));

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

  const truth = trueInfo(s, p, role, strat);
  let { text, targets } = truth;

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

  return keepInfo(
    s,
    p,
    {
      night: s.night,
      role,
      text,
      targets,
      trigger: "normal",
      functioning: mode === "truth",
    },
    truth,
  );
}

// What a night's information leaves behind, as it's remembered (see each
// character's `keep`: the type of player a Balloonist was shown, the
// Grandmother's link to her grandchild...). (`truth`: the correct
// information, when the Storyteller gives it, as it may differ.)
export function keepInfo(s, p, info, truth = null) {
  return infoOf(info.role)?.keep?.(s, p, info, truth) ?? info;
}
