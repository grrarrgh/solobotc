// Bluffs: everything said in a character's name by someone without its
// ability. Every NPC who pretends goes through here:
// - an evil player (and the Lunatic) bluffing a good character, each night
//   (bluffTonight());
// - anyone who takes up a claim mid-game and needs that character's story
//   so far (backStory()): a player the Cerenovus made "mad", a mad Pixie, an
//   evil player faking coming clean;
// - a good player hiding behind another character, whose story grows each
//   morning (keepStory()): a cover story, or a hiding Mutant or Damsel.
// Each character's own made-up information is in its module (see
// characters/info.js: `lie`, `random`, `choice`, `bluff`, `once`); this
// module decides which to use, and when. A good pretender's story is random;
// an evil one's helps their team, never giving a teammate away.
//
// Whatever they make up has to fit what they know (see knows() and fits()).
// What a pretender has made up so far is kept in p.bluffState (see
// bluffState()), so their story holds together.
import {
  team,
  alignment,
  name,
  FIRST_NIGHT_INFO,
  NEVER_BLUFFED,
  BLUFF_TRIES,
} from "./data.js";
import { byId, pick } from "./util.js";
import { logNames } from "./log.js";
import {
  demonTo,
  works,
  isDrunk,
  vortoxActive,
  poppyBlocks,
  nameable,
  oneOf,
  goodRoles,
  actsTonight,
  trueInfo,
  falseInfo,
  unreliableInfo,
  keepInfo,
  amnesiacKey,
  INFO_ROLES,
} from "./storyteller.js";
import { stanceOn, sideOf, teammate, sure } from "./strategy.js";
import { infoOf } from "./characters/info.js";
import { PAIR_TEAM } from "./characters/pairinfo.js";
import { grandchildText } from "./characters/townsfolk/grandmother.js";
import { philosopherInfo } from "./characters/townsfolk/philosopher.js";
import {
  alchemistAbility,
  alchemistPoisonInfo,
  pretendPoison,
} from "./characters/townsfolk/alchemist.js";
import { savantInfo, savantBluff } from "./characters/townsfolk/savant.js";

const FIRST_NIGHT = FIRST_NIGHT_INFO;

// ── A pretender's state ─────────────────────────────────────

// What NPC p has made up so far:
// - gained: the ability an evil Philosopher, Cannibal or Pixie bluffer says
//   they gained ({ role, night, fromId }: from that night, and for a
//   Cannibal, whose), or null;
// - philosopher, eaten: for a made-up Philosopher or Cannibal story, the
//   ability "gained" (see storyGained());
// - hidden: a hiding Mutant's or Damsel's story ({ as, memories });
// - pixie: a mad Pixie's story, made up afresh each day ({ day, memories });
// - dreamed, savantSaid, balloonType: what an evil Dreamer, Savant or
//   Balloonist bluffer said before, so they don't contradict it;
// - said: what a good pretender said before, by character (see each
//   character's `story`).
export const bluffState = (p) =>
  (p.bluffState ??= {
    gained: null,
    philosopher: null,
    eaten: [],
    hidden: null,
    pixie: null,
    dreamed: {},
    savantSaid: [],
    balloonType: null,
    said: {},
  });

// The ability evil bluffer p says they gained (see bluffState()), or null.
export const gainedRole = (p) => p.bluffState?.gained?.role ?? null;

// Where made-up information for `role` that NPC p acts out goes (see
// storyteller.js bluffing()): what a mad player made up today, while the
// Cerenovus's madness lasts; a cover story's, or a hiding Mutant's or
// Damsel's, story; otherwise
// their memories (an evil bluffer repeats their bluffs as their own, and a
// mad Pixie's are kept apart; see strategy spoken()). Null for a good
// player who no longer acts it out (a Juggler's count the night after
// their madness ended), whose real memories it must never mix with.
export function madeUpMemories(p, role) {
  const hidden = p.bluffState?.hidden;

  if (p.mad?.role === role && p.mad.previous !== null) {
    return (p.mad.memories ??= []);
  }

  if (p.cover?.as === role) {
    return (p.cover.memories ??= []);
  }

  if (sideOf(p) !== "good" || p.pixieMad) {
    return p.memories;
  }

  return hidden?.as === role && p.claim === role ? (hidden.memories ??= []) : null;
}

// How an evil bluffer's made-up information for `role` comes out: true
// ("truth") for a working Spy, who has seen the Grimoire; otherwise "lie".
// (Not for a Townsfolk while the Vortox lives: the team knows it makes
// every Townsfolk's information false, so true information would give the
// bluffer away.) (`deadOk`: for information they get as they die, the
// Sage's or the Ravenkeeper's.)
export const bluffMode = (s, p, role, deadOk = false) =>
  p.role === "spy" &&
  // (Not while the Poppy Grower has their ability: their jinx.)
  !poppyBlocks(s) &&
  !isDrunk(p) &&
  !p.poisoned &&
  (deadOk || works(p)) &&
  !(team(role) === "townsfolk" && vortoxActive(s))
    ? "truth"
    : "lie";

// ── What a bluffer knows ────────────────────────────────────

// What NPC p knows, from where they sit, when they make something up:
// - side: the team they play for ("good", or "evil": the evil team, and the
//   Lunatic, who thinks they're its Demon);
// - good: the players they're sure are good: anyone confirmed good in
//   public (see strategy sure()), and for a good player, anyone their own
//   information vouches for (see strategy trusted());
// - evil: the players they know are evil: for an evil player, their team
//   (as they believe it: see strategy teammate(); for the Bounty Hunter's
//   evil Townsfolk, who doesn't know it, the players they suspect of being
//   on it: see strategy hunches()); for a good player,
//   anyone caught lying in public, or whom their own information suspects
//   (see strategy liars() and ownStance()).
// The claims they've heard count too: each piece of information is read
// against them (see strategy stanceOn()).
export function knows(s, p, strat) {
  const side = sideOf(p);
  const others = s.players.filter((x) => x !== p);

  if (side === "evil") {
    return {
      side,
      good: new Set(sure(s)),
      evil: new Set([
        ...others.filter((x) => teammate(p, x)).map((x) => x.id),
        ...(p.evilTownsfolk ? (p.hunches ?? []) : []),
      ]),
    };
  }

  return {
    side,
    good: strat.trusted(s, p),
    evil: new Set([
      ...strat.liars(s, p),
      ...others.filter((x) => strat.ownStance(s, p, x) === "suspicious").map((x) => x.id),
    ]),
  };
}

// Whether made-up information m (with its `role`, `text` and `targets`)
// fits what p knows (see knows()):
// - it never casts suspicion on you (the human: always good, and never
//   anyone's suspect), on anyone p is sure is good, nor (for an evil player)
//   on a teammate, which would give them away;
// - a good player's never vouches for anyone they know is evil, and never
//   names a character nobody would believably be (NEVER_BLUFFED: the Pixie,
//   the Mutant...).
export function fits(s, p, m, know) {
  const said = m.text.replace(/^[^:]*: /, "");

  if (know.side === "good" && NEVER_BLUFFED.some((id) => said.includes(name(id)))) {
    return false;
  }

  return (m.targets ?? []).every((id) => {
    const t = byId(s, id);
    const stance = t && t !== p ? stanceOn(s, m, t, p) : null;

    return stance === "suspicious"
      ? !t.human && !know.good.has(id) && !(know.side === "evil" && know.evil.has(id))
      : stance === "trust"
        ? !(know.side === "good" && know.evil.has(id))
        : true;
  });
}

// What making up information changes in p, to stay consistent later (each
// character's `lie` and `story` may remember what they said), so an attempt
// that doesn't fit can be undone (see undo()).
const draft = (p) =>
  structuredClone({
    p: {
      empathBluff: p.empathBluff,
      oracleSaid: p.oracleSaid,
      pixieRole: p.pixieRole,
      lastPicks: p.lastPicks,
    },
    state: {
      dreamed: bluffState(p).dreamed,
      savantSaid: bluffState(p).savantSaid,
      balloonType: bluffState(p).balloonType,
      said: bluffState(p).said,
    },
  });

// Puts back what draft() saved (in place: a story being made up may be
// part of p.bluffState).
const undo = (p, d) => {
  const copy = structuredClone(d);

  Object.assign(p, copy.p);
  Object.assign(bluffState(p), copy.state);
};

// Whether made-up information m casts suspicion on you (the human), which
// it never should (see fits()).
const suspectsYou = (s, p, m) =>
  (m.targets ?? []).some((id) => {
    const t = byId(s, id);

    return t?.human && stanceOn(s, m, t, p) === "suspicious";
  });

// Made-up information from make() (with its `role`) that fits what p knows
// (see fits()): up to BLUFF_TRIES attempts, each one's changes to p undone
// before the next. Failing that, the last attempt that doesn't cast
// suspicion on you (you're never anyone's suspect, whatever else they know),
// or else the last attempt.
// Characters whose information naturally names the same players night after
// night: the Empath's living neighbours; the Amnesiac's, by their secret
// ability.
const REPEATS_OK = ["empath", "amnesiac"];

// Whether made-up m names just the player(s) that p's last made-up
// information for the same character did: a real one's choices, and the
// Storyteller's, change from night to night (and the Exorcist can't choose
// last night's player).
function repeats(p, m) {
  if (!m.targets?.length || REPEATS_OK.includes(m.role)) {
    return false;
  }

  // (What was really said wins over a story being made afresh for the same
  // night: see keepStory().)
  const last = [...(p.bluffState?.building ?? []), ...(madeUpMemories(p, m.role) ?? [])]
    .filter((x) => x.role === m.role && x !== m && !x.day && (m.night ?? Infinity) > (x.night ?? -1))
    .sort((a, b) => a.night - b.night)
    .at(-1);
  const key = (x) => [...(x.targets ?? [])].sort().join(",");

  return Boolean(last) && key(last) === key(m);
}

export function madeUp(s, p, strat, make) {
  const know = knows(s, p, strat);
  const before = draft(p);
  let m = null;
  let safe = null;
  // (One that fits, but names who last time's did: if nothing else fits.)
  let again = null;
  // (For the Bounty Hunter's evil Townsfolk: one that would have fitted, but
  // for the players they suspect of being on their team. Logged.)
  const blind = p.evilTownsfolk ? { ...know, evil: new Set() } : null;
  let spared = null;
  const log = (text) =>
    s.audit.push({
      id: s.auditId++,
      group: s.phase === "night" ? `Night ${s.night}` : `Day ${s.day}`,
      type: "bluff",
      text,
      data: { playerId: p.id },
      names: logNames(s),
    });
  const sparedNote = () => {
    if (spared) {
      log(
        `${p.label} (${name(p.role)}), the evil Townsfolk, won't say "${spared.text}": it points at ${(spared.targets ?? [])
          .filter((id) => know.evil.has(id))
          .map((id) => byId(s, id).label)
          .join(" and ")}, whom they suspect of being on their team.`,
      );
    }
  };

  for (let i = 0; i < BLUFF_TRIES; i++) {
    if (i) {
      undo(p, before);
    }

    m = make();

    if (!m) {
      return m;
    }

    const fit = fits(s, p, m, know);

    if (!fit && blind && !spared && fits(s, p, m, blind)) {
      spared = m;
    }

    if (fit && !repeats(p, m)) {
      sparedNote();
      return m;
    }

    if (fit) {
      again ??= { m, state: draft(p) };
      // (The next tries pass them over: see strategy fresh().)
      p.avoidTargets = m.targets;
    } else if (!suspectsYou(s, p, m)) {
      safe = { m, state: draft(p) };
    }
  }

  p.avoidTargets = null;
  sparedNote();

  if (again) {
    undo(p, again.state);
    s.audit.push({
      id: s.auditId++,
      group: s.phase === "night" ? `Night ${s.night}` : `Day ${s.day}`,
      type: "bluff",
      text: `${p.label} (${name(p.role)}) names the same player(s) as last time, for want of anything else that fits: ${again.m.text}`,
      data: { playerId: p.id },
      names: logNames(s),
    });

    return again.m;
  }

  if (safe) {
    undo(p, safe.state);
    m = safe.m;
  }

  s.audit.push({
    id: s.auditId++,
    group: s.phase === "night" ? `Night ${s.night}` : `Day ${s.day}`,
    type: "bluff",
    text: `${p.label} (${name(p.role)}) could make up nothing that fits what they know, so says: ${m.text}`,
    data: { playerId: p.id, misfit: true },
    names: logNames(s),
  });

  return m;
}

// What a pretender reports from a day (or death) ability `role`:
// make(mode) gives it, by `mode` (see bluffMode()). An evil bluffer's lies
// (or a Spy's truth) and a good pretender's random answers, either way
// only if it fits what they know (see madeUp()): a Spy's truth that would
// give a teammate away becomes a lie.
export function dayBluff(s, p, role, strat, make, deadOk = false) {
  if (sideOf(p) === "good") {
    return madeUp(s, p, strat, () => make("random"));
  }

  const truth = bluffMode(s, p, role, deadOk) === "truth" && make("truth");

  return truth && fits(s, p, truth, knows(s, p, strat))
    ? truth
    : madeUp(s, p, strat, () => make("lie"));
}

// ── Tonight's bluff ─────────────────────────────────────────

// What an evil NPC reports tonight for the role they are bluffing (null for
// nothing). A Minion backs up the Demon's claim when their role allows it;
// otherwise a working Spy has seen the Grimoire and tells the truth, and
// every other evil player lies (some characters have their own bluff: see
// evilBluff()).
export function bluffTonight(s, p, strat) {
  // A Philosopher or Cannibal bluffer reports for the character they
  // "gained" (nothing until they have one); a first-night one the night
  // after they gain it, as a real Cannibal would.
  // (A Pixie bluffer who "gained" theirs claims the Pixie again.)
  const gains =
    ["philosopher", "cannibal"].includes(p.claim) ||
    (p.claim === "pixie" && gainedRole(p));
  const role = gains ? gainedRole(p) : p.claim;
  const mode = bluffMode(s, p, role);
  const gainedTonight =
    p.claim === "cannibal" &&
    p.bluffState?.gained?.night === s.night &&
    FIRST_NIGHT.includes(role);

  if (!role) {
    return null;
  }

  // Once per game, on a night of their choosing (the Seamstress, the
  // Courtier).
  if (infoOf(role)?.once) {
    return infoOf(role).once(s, p, strat, mode);
  }

  if (chooses(role)) {
    return madeUp(s, p, strat, () => madeUpChoice(s, p, role, strat, mode));
  }

  if (!actsTonight(role, s.night, s, p) && !gainedTonight) {
    return null;
  }

  const confirm = confirmDemon(s, p, role);
  // (A working Spy tells the truth, unless it doesn't fit what they know,
  // as when it points at a teammate: see fits().)
  // (What an Amnesiac's means, as the bluffer "knows" it, decides that.)
  const truth =
    !confirm && mode === "truth"
      ? {
          role,
          ...trueInfo(s, p, role, strat),
          ...(role === "amnesiac" && { amnesiac: amnesiacKey(s, p), known: true }),
        }
      : null;
  const truthful = Boolean(truth) && fits(s, p, truth, knows(s, p, strat));
  const { text, targets } =
    confirm ??
    (truthful
      ? truth
      : madeUp(s, p, strat, () => ({
          role,
          ...evilBluff(s, p, role, strat),
          // (Read as they'll remember it: see the end.)
          ...(role === "amnesiac" && { amnesiac: amnesiacKey(s, p), known: true }),
        })));

  // (A bluffer "knows" what their Amnesiac information means.)
  return keepInfo(s, p, {
    night: s.night,
    role,
    text,
    targets,
    trigger: "normal",
    functioning: truthful,
    ...(role === "amnesiac" && { known: true }),
  });
}

// An evil bluffer's made-up information for `role`: the character's own
// bluff if it has one (the Dreamer's goes by what players claim), else a lie.
const evilBluff = (s, p, role, strat) =>
  infoOf(role)?.bluff?.(s, p, strat) ?? falseInfo(s, p, role, strat);

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

// Whether `role` chooses each night (see each character's `choice`).
const chooses = (role) => Boolean(infoOf(role)?.choice);

// What a player claiming a character who chooses each night, without its
// ability, says they chose tonight: an invented choice, or null if that
// character doesn't choose tonight. (For the Chambermaid, also a number, by
// `mode`: see infoMode().)
function madeUpChoice(s, p, role, strat, mode) {
  return infoOf(role)?.choice?.(s, p, strat, mode) ?? null;
}

// ── A story so far ──────────────────────────────────────────

// Made-up but plausible information for p claiming `role`: what that
// character would have learned on each night so far. Choice characters (see
// chooses()) report choices; a Savant reports today's visit. A good player's
// answers are random, but sensible (see goodStory()); an evil player's are
// made up to help their team, as their bluffs are (see evilBluff()). Either
// way, only what fits what they know (see madeUp()).
//
// A Cannibal or Philosopher has another character's ability (see
// storyGained()): its made-up information, from the night it's gained (a
// first-night one, just that night), and the Philosopher's choice.
export function backStory(s, p, role, strat) {
  const out = [];
  const evilSide = p.alignment === "evil";
  // (The nights made up so far count as said, so the next don't repeat
  // them: see shownBefore(), repeats().)
  const state = bluffState(p);
  const was = state.building;

  state.building = out;

  try {
    return storyNights(s, p, role, strat, out, evilSide);
  } finally {
    state.building = was;
  }
}

function storyNights(s, p, role, strat, out, evilSide) {
  for (let night = 1; night <= s.night; night++) {
    const view = { ...s, night };
    const gain = storyGained(s, p, role, night);
    const used = gain ? gain.role : role;
    const fresh = Boolean(gain) && gain.from === night;

    if (role === "philosopher" && fresh) {
      out.push({ ...philosopherInfo(view, used), functioning: false });
    }

    if (gain === null) {
      continue;
    }

    if (chooses(used)) {
      const m = madeUp(view, p, strat, () =>
        madeUpChoice(view, p, used, strat, evilSide ? "lie" : "random"),
      );

      if (m) {
        out.push(m);
      }

      continue;
    }

    if (actsTonight(used, night) || (fresh && FIRST_NIGHT.includes(used))) {
      const { targets } = trueInfo(view, p, used, strat);
      const info = madeUp(view, p, strat, () => ({
        role: used,
        ...(evilSide
          ? evilBluff(view, p, used, strat)
          : goodStory(view, p, used, strat, targets)),
      }));

      out.push({ night, ...info, trigger: "normal", functioning: false });
    }

    // An Alchemist-Poisoner says who they chose each night (see
    // characters/townsfolk/alchemist.js).
    const poisoned =
      used === "alchemist" && alchemistAbility(view, p) === "poisoner" && pretendPoison(view, p);

    if (poisoned) {
      out.push({ ...alchemistPoisonInfo(view, poisoned), functioning: false });
    }
  }

  // (Today's visit is the day's one: see characters/townsfolk/savant.js.)
  if (role === "savant") {
    p.savantDay = s.day;
    out.push(
      madeUp(s, p, strat, () =>
        evilSide ? savantBluff(s, p) : savantInfo(s, p, "random"),
      ),
    );
  }

  return out;
}

// A good pretender's made-up information for `role`: the character's own
// `story` if random information wouldn't be sensible (an Empath's number
// that changes with the same neighbours, an Undertaker naming a character
// nobody claimed...), else random. (`targets`: who the character would
// have chosen.)
const goodStory = (s, p, role, strat, targets) =>
  infoOf(role)?.story?.(s, p, strat, targets) ??
  unreliableInfo(s, p, role, targets);

// For a made-up story (see backStory()), the ability a claimed Cannibal or
// Philosopher has on `night`: { role, from } (the night it was gained),
// null if they have none yet, or undefined for any other character.
// - A Cannibal: the last player executed before that night, as the
//   character p heard them claim when they were executed (see
//   characters/townsfolk/cannibal.js), if good, from the night after.
// - A Philosopher: a good character with information on the script, chosen
//   once, from Night 1, as an NPC Philosopher chooses at once.
// (Never a character nobody would believably be: see NEVER_BLUFFED.)
function storyGained(s, p, role, night) {
  const state = bluffState(p);

  if (role === "philosopher") {
    state.philosopher ??= pick(
      goodRoles(s).filter(
        (id) =>
          id !== "philosopher" &&
          !NEVER_BLUFFED.includes(id) &&
          INFO_ROLES.includes(id),
      ),
      s.r,
    );

    return state.philosopher ? { role: state.philosopher, from: 1 } : null;
  }

  if (role !== "cannibal") {
    return undefined;
  }

  const last = state.eaten.filter((x) => x.night <= night).at(-1);
  // (A real Cannibal isn't told the character: with no claim to go by, one
  // with information, chosen once for that executee.)
  const eaten =
    last &&
    (last.as ??= pick(
      goodRoles(s).filter((id) => INFO_ROLES.includes(id) && !NEVER_BLUFFED.includes(id)),
      s.r,
    ));

  return eaten && alignment(eaten) === "good" && !NEVER_BLUFFED.includes(eaten)
    ? { role: eaten, from: last.night }
    : null;
}

// A story kept from day to day ({ as, memories }: a cover story, or a
// hiding Mutant's or Damsel's): its back-story the first time, then
// tonight's made-up information is added each morning (none for a character
// with nothing to learn).
export function keepStory(s, p, story, strat) {
  const fresh = backStory(s, p, story.as, strat).filter(
    (m) => !story.memories || (m.night === s.night && !m.day),
  );

  story.memories = [...(story.memories ?? []), ...fresh];
}

// A good Mutant or Damsel hiding behind a Townsfolk claim (see
// HIDDEN_OUTSIDERS) makes up that Townsfolk's information, at random, as a
// cover story would (afresh if their claim changed). See strategy spoken().
export function hiddenStory(s, p, strat) {
  const state = bluffState(p);

  if (state.hidden?.as !== p.claim) {
    state.hidden = { as: p.claim, memories: null };
  }

  keepStory(s, p, state.hidden, strat);
}
