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
// What a pretender has made up so far is kept in p.bluffState (see
// bluffState()), so their story holds together.
import { team, alignment, FIRST_NIGHT_INFO } from "./data.js";
import { byId, pick } from "./util.js";
import {
  demonTo,
  works,
  isDrunk,
  nameable,
  oneOf,
  goodRoles,
  actsTonight,
  trueInfo,
  falseInfo,
  unreliableInfo,
  secretInfo,
  amnesiacKey,
  INFO_ROLES,
} from "./storyteller.js";
import { stanceOn } from "./strategy.js";
import { infoOf } from "./characters/info.js";
import { PAIR_TEAM } from "./characters/pairinfo.js";
import { grandchildText } from "./characters/townsfolk/grandmother.js";
import { philosopherInfo } from "./characters/townsfolk/philosopher.js";
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
//   Balloonist bluffer said before, so they don't contradict it.
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
  });

// The ability evil bluffer p says they gained (see bluffState()), or null.
export const gainedRole = (p) => p.bluffState?.gained?.role ?? null;

// How a bluffer's made-up information comes out: true ("truth") for a
// working Spy, who has seen the Grimoire; otherwise "lie". (`deadOk`: for
// information they get as they die, the Sage's or the Ravenkeeper's.)
export const bluffMode = (p, deadOk = false) =>
  p.role === "spy" && !isDrunk(p) && !p.poisoned && (deadOk || works(p))
    ? "truth"
    : "lie";

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
  const mode = bluffMode(p);
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
    return madeUpChoice(s, p, role, strat, mode);
  }

  if (!actsTonight(role, s.night) && !gainedTonight) {
    return null;
  }

  const confirm = confirmDemon(s, p, role);
  // (A working Spy tells the truth, unless it points at a teammate.)
  // (What an Amnesiac's means, as the bluffer "knows" it, decides that.)
  const truth =
    !confirm && mode === "truth"
      ? {
          role,
          ...trueInfo(s, p, role, strat),
          ...(role === "amnesiac" && { amnesiac: amnesiacKey(s, p), known: true }),
        }
      : null;
  const truthful = Boolean(truth) && !givesAway(s, p, truth);
  const { text, targets } =
    confirm ??
    (truthful ? truth : evilBluff(s, p, role, strat));

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

// Whether information m, in evil player p's mouth, points at one of their
// teammates (see strategy stanceOn()).
const givesAway = (s, p, m) =>
  (m.targets ?? []).some((id) => {
    const x = byId(s, id);

    return x && x !== p && x.alignment === "evil" && stanceOn(s, m, x, p) === "suspicious";
  });

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
// answers are random; an evil player's are made up to help their team, as
// their bluffs are (see evilBluff()), never giving a teammate away.
//
// A Cannibal or Philosopher has another character's ability (see
// storyGained()): its made-up information, from the night it's gained (a
// first-night one, just that night), and the Philosopher's choice.
export function backStory(s, p, role, strat) {
  const out = [];
  const evilSide = p.alignment === "evil";

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
      const m = madeUpChoice(view, p, used, strat, evilSide ? "lie" : "random");

      if (m) {
        out.push(m);
      }

      continue;
    }

    if (!actsTonight(used, night) && !(fresh && FIRST_NIGHT.includes(used))) {
      continue;
    }

    const { targets } = trueInfo(view, p, used, strat);
    const info = !evilSide
      ? unreliableInfo(view, p, used, targets)
      : evilBluff(view, p, used, strat);

    out.push({ night, role: used, ...info, trigger: "normal", functioning: false });
  }

  if (role === "savant") {
    out.push(evilSide ? savantBluff(s, p) : savantInfo(s, p, "random"));
  }

  return out;
}

// For a made-up story (see backStory()), the ability a claimed Cannibal or
// Philosopher has on `night`: { role, from } (the night it was gained),
// null if they have none yet, or undefined for any other character.
// - A Cannibal: the last player executed before that night, as the
//   character p heard them claim when they were executed (see
//   characters/townsfolk/cannibal.js), if good, from the night after.
// - A Philosopher: a good character with information on the script, chosen
//   once, from Night 1, as an NPC Philosopher chooses at once.
// (Never the Pixie, whose information would give them away.)
function storyGained(s, p, role, night) {
  const state = bluffState(p);

  if (role === "philosopher") {
    state.philosopher ??= pick(
      goodRoles(s).filter(
        (id) =>
          !["philosopher", "pixie", "drunk", "lunatic"].includes(id) &&
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
      goodRoles(s).filter((id) => INFO_ROLES.includes(id) && id !== "pixie"),
      s.r,
    ));

  return eaten && alignment(eaten) === "good" && eaten !== "pixie"
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
