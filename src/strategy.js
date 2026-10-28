import {
  ROLES,
  name,
  team,
  WIZARD_GIFT_CHANCE,
  WIZARD_SECOND_MIN_ALIVE,
  alignment,
  ARTIST_QUESTIONS,
  FIRST_NIGHT_INFO,
  ONGOING_INFO,
  DEMON_KILL_PRIORITY,
  PHILOSOPHER_AVOID,
  BARBER_VALUE,
  BARBER_OUTSIDER_VALUE,
  BARBER_CONFIRMED_WEIGHT,
  BARBER_SUSPECTED_WEIGHT,
  BARBER_MIN_WEIGHT,
  BARBER_NEW_INFO_COST,
  BARBER_MIN_GAIN,
  KILL_PRIORITY_CHANCE,
  DEMON_STAR_PASS_CHANCE,
  SCAPEGOAT_CHANCE,
  WITCH_HUMAN_CHANCE,
  JUGGLER_CLAIM_GUESS_CHANCE,
  ONCE_PER_GAME,
  VIGORMORTIS_MINION_PRIORITY,
  PITHAG_EVIL_CHANCE,
  CERENOVUS_EVIL_CHANCE,
  GOOD_VOTE_CHANCE,
  GOOD_VOTE_EVIDENCE_STEP,
  GOOD_VOTE_MIN,
  GOOD_VOTE_MAX,
  HUMAN_NOMINATION_BONUS,
  NEAR_FINAL_HUMAN_VOTE_CHANCE,
  EVIL_VOTE_CHANCE,
  EVIL_TEAMMATE_VOTE_CHANCE,
  EVIDENCE_WEIGHT,
  EVIDENCE_TO_SUSPECT,
  GHOST_VOTE_ALIVE,
  HUMAN_POISON_CHANCE,
  GOSSIP_CHANCE,
  PO_CHARGE_CHANCE,
  LUNATIC_FOLLOW_CHANCE,
  COURTIER_CORRECT_CHANCE,
  SPY_COVER_CHANCE,
  HIDE_CHANCE,
  HIDE_NEVER,
  HIDE_NEVER_AS,
  BAIT_CHANCE,
  BAIT_ROLES,
  COVER_TELL_HUMAN_CHANCE,
  COME_CLEAN_ALIVE,
  DISTORT_CHANCE,
  NPC_NOMINATE_EVIDENCE,
  PIXIE_DOUBLE_CLAIM_FACTOR,
  TRUST_EVIDENCE,
  HIDDEN_OUTSIDERS,
  DAMSEL_HIDER_CHANCE,
  DAMSEL_CLAIM_CHANCE,
  DAMSEL_DECOY_CHANCE,
  BOOMDANDY_FROM_DAY,
  BOOMDANDY_HEAT,
  BOOMDANDY_VOTE_CHANCE,
  BOOMDANDY_HOT_VOTE_CHANCE,
  DAMSEL_GUESS_ALIVE,
  DAMSEL_GUESS_CHANCE,
  DAMSEL_GUESS_FROM_DAY,
  MAGICIAN_HIDE_CHANCE,
  LEGION_GOOD_VOTE_CHANCE,
  LEGION_SACRIFICE_VOTE_CHANCE,
  LEGION_HEARSAY_FACTOR,
  GOBLIN_GOOD_VOTE_CHANCE,
  GOBLIN_PUSH_SHORT,
  GOBLIN_PUSH_CHANCE,
  CERENOVUS_GOBLIN_CHANCE,
  FEARMONGER_PUSH_CHANCE,
  FEARMONGER_CAUTION,
  EVIL_TOWNSFOLK_HUNCH_VOTE_CHANCE,
  VORTOX_VOTE_CHANCE,
  LEVIATHAN_STRONG_EVIDENCE,
  LEVIATHAN_LATE_VOTE_BONUS,
  LEVIATHAN_LAST_DAY_VOTE_CHANCE,
  ATHEIST_BELIEF,
  ATHEIST_VOTE_BELIEF,
  ATHEIST_NOMINATE_BELIEF,
  ATHEIST_DISBELIEF_EVIDENCE,
  ATHEIST_DISBELIEF_FROM_DAY,
  ATHEIST_DISBELIEF_MAX,
  ATHEIST_DOUBT_NOTICE,
  STORYTELLER_NOMINATED_EVIDENCE,
  STORYTELLER_VOTED_EVIDENCE,
  EVIL_ATHEIST_TRAP_BELIEVERS,
  ATHEIST_TRY_FROM_DAY,
  ATHEIST_TRY_SHARE,
  exclusiveWith,
} from "./data.js";
import {
  ability,
  steer,
  scapegoat,
  framed,
  isDrunk,
  isDemon,
  wishBarred,
  atFinal,
  nearFinal,
  teaLadyOf,
  alchemistOptions,
  shielded,
  jinxBarred,
  minionAbility,
  poppyBlocks,
  works,
  bluffing,
  shownBefore,
  unknownMate,
} from "./storyteller.js";
import { byId, pick, sample, claimTo, claimHeard, tick } from "./util.js";
import { logNames } from "./log.js";
import {
  AMNESIAC_ABILITIES,
  AMNESIAC_GUESSES,
} from "./characters/townsfolk/amnesiac.js";
import { evilTwinInfo } from "./characters/minion/eviltwin.js";
import { wishGifts } from "./characters/minion/wizard.js";
import { infoOf } from "./characters/info.js";
import { PAIR_TEAM } from "./characters/pairinfo.js";
import { bluffTonight, backStory, bluffState, gainedRole } from "./bluff.js";
import { STORYTELLER } from "./characters/townsfolk/atheist.js";

export { claimTo, claimHeard, tick };

const human = (s) => s.players.find((x) => x.human);

// What viewer has heard x claim, for the log ("they claim the Chef").
const claimedAs = (x, viewer) => {
  const c = claimHeard(x, viewer);

  return c ? `they claim the ${name(c)}` : "they haven't claimed a character";
};

// Records a lie told to you (or in public), for the final reveal (see
// engine reveal()): { kind, byId, said, truth, aboutId? }. Kept once.
export function lied(s, lie) {
  const list = (s.liesToYou ??= []);
  const key = (x) => [x.kind, x.byId, x.aboutId, x.said].join(":");

  if (!list.some((x) => key(x) === key(lie))) {
    list.push({ day: s.day, ...lie });
  }
}

// The Lunatic thinks they're the Demon: they play for the evil team they
// believe in (the "Minions" they were shown), though they're good. (Until
// they find out: see lunaticReveals().)
const thinksEvil = (p) => p.role === "lunatic" && !p.human && !p.lunaticRevealed;

// The Marionette and an Ogre don't know they're evil: they play as good.
// (Unless the Demon has told the Marionette.)
const thinksGood = (p) =>
  ["marionette", "ogre"].includes(p.role) && !p.human && !p.toldEvil;

// Whether evil player p is fooled by the Magician x: the evil team was
// shown them as one of its own on Night 1 (the Demon thinks they're a
// Minion; Minions, that they might be the Demon), until p hears them claim
// the Magician. (Not you: you're never fooled, and never evil.)
export const fooledBy = (p, x) =>
  Boolean(x?.magicianTrick) &&
  x.role === "magician" &&
  p?.alignment !== "good" &&
  claimHeard(x, p) !== "magician";

// Whether x is a good player to evil player p (null: the team as a whole),
// who picks good players to kill, poison or curse: not the Magician they
// think is one of their own; any teammate they don't know (see blind()).
// Whether evil player p doesn't know evil player x is a teammate: the
// Poppy Grower kept the team apart (see setup.js, poppygrower.js), or
// either is the Bounty Hunter's evil Townsfolk (see bountyhunter.js).
const blind = (p, x) => unknownMate(p, x);

// A line in log.txt about an NPC's choice (as bluff.js madeUp() adds them).
const note = (s, type, text, data = {}) =>
  s.audit.push({
    id: s.auditId++,
    group: s.phase === "night" ? `Night ${s.night}` : `Day ${s.day}`,
    type,
    text,
    data,
    names: logNames(s),
  });

// Whether living evil NPC p knows everyone else alive is on their team (or
// is their Lleech's host, whom they keep alive: see spares()): the game is
// theirs, but for a Demon that can't kill (drunk for good, say), it could
// go on for ever. They execute a teammate who isn't the Demon, to reach the
// final 2 (see nomination(), vote()). (Not the Lunatic, whose team is
// imagined.)
const onlyTeam = (s, p) =>
  p.alive &&
  !p.human &&
  sideOf(p) === "evil" &&
  !thinksEvil(p) &&
  s.players.some((x) => x.alive && teammate(p, x) && !isDemon(x)) &&
  s.players.every((x) => x === p || !(x.alive || x.undead) || teammate(p, x) || spares(s, p, x));

// Whether a day with nobody executed may lose the game for good: the Vortox
// is on the script, and nobody is marked for execution yet today.
export const vortoxRisk = (s) => s.script.ids.includes("vortox") && !s.block?.nomineeId;

// How the Leviathan, which everyone knows is in play, makes good NPCs vote
// (see vote(); characters/demon/leviathan.js): "early" on Days 1 to 3, when
// they only vote with strong suspicion (a 2nd good execution loses, and
// there's time to learn more); "late" on Days 4 and 5, when they vote more
// readily; "last" on Day 5 (or later) while nobody is marked, as it wins at
// dusk unless it's executed; or null (no Leviathan).
export function leviathanRisk(s) {
  if (!s.players.some((x) => (x.alive || x.undead) && x.role === "leviathan")) {
    return null;
  }

  if (s.day >= 5 && !s.block?.nomineeId) {
    return "last";
  }

  return s.day <= 3 ? "early" : "late";
}

// Whether evil player p holds back from x: the Bounty Hunter's evil
// Townsfolk, who suspects x of being on their team (see hunches()).
const hunch = (p, x) => Boolean(p.evilTownsfolk) && (p.hunches ?? []).includes(x.id);

const goodTo = (p, x) => (x.alignment === "good" || blind(p, x)) && !fooledBy(p, x);

// The living player the most good NPCs suspect (the first in seat order on
// a tie), or null if they suspect nobody.
function townSuspect(s) {
  const counts = new Map();

  for (const x of s.players) {
    const id = x.alive && !x.human && x.alignment === "good" ? x.suspicion?.targetId : null;

    if (id && byId(s, id)?.alive) {
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }

  const top = Math.max(0, ...counts.values());
  const id = [...counts].find(([, n]) => n === top)?.[0];

  return id ? byId(s, id) : null;
}

// Whether evil player p keeps x alive: x is the host of a living Lleech
// that p is, or knows is their Demon (not while the Poppy Grower keeps the
// team apart: see teammate()). Killing the host kills the Lleech.
export const spares = (s, p, x) => {
  const d = s.players.find((y) => y.alive && y.role === "lleech" && y.lleechHost === x.id);

  return Boolean(d) && Boolean(p) && (d === p || (sideOf(p) === "evil" && teammate(p, d)));
};

// The team p plays for.
export const sideOf = (p) =>
  thinksEvil(p) ? "evil" : thinksGood(p) ? "good" : p.alignment;

// Whether p (playing for evil) counts x as a teammate.
// (The Lunatic counts themself: the Demon of their imagined team.)
export const teammate = (p, x) =>
  thinksEvil(p)
    ? x.id === p.id || (p.lunaticTeam ?? []).includes(x.id)
    : (x.alignment === "evil" && !blind(p, x)) || fooledBy(p, x);

// Whether p has used the once-per-game ability of `role` (null if it has
// none).
export function abilityUsed(p, role) {
  const used = {
    slayer: p.shotUsed,
    fisherman: p.fishermanUsed,
    huntsman: p.huntsmanUsed,
    puzzlemaster: p.puzzleUsed,
    artist: p.artistUsed,
    seamstress: p.seamUsed,
    juggler: p.juggled,
    philosopher: p.gained ?? gainedRole(p),
    virgin: p.virginUsed,
    fool: p.foolUsed,
    courtier: p.courtierUsed,
    professor: p.professorUsed,
    assassin: p.assassinUsed,
  };

  return role in used ? Boolean(used[role]) : null;
}

// Whether good NPC p acts out `role` without its ability (see
// storyteller.js bluffing()).
const pretends = (p, role) => sideOf(p) === "good" && bluffing(p, role);

// One of the Evil Twin pair (good or evil).
export const isTwin = (s, x) =>
  Boolean(s.twins) && [s.twins.evilId, s.twins.goodId].includes(x.id);

// Whether x is a twin nothing harmful targets: no kill, poison, drunkenness,
// curse, madness or change of character. Only while both twins live: once
// one has died, the other is a player like any other (else a final 3 of
// the good twin, a Lleech and its host could never end).
export const twinSafe = (s, x) =>
  isTwin(s, x) && [s.twins.evilId, s.twins.goodId].every((id) => byId(s, id)?.alive);

// `pool` without either twin, while both live (see twinSafe()).
export const untwinned = (s, pool) => pool.filter((x) => !twinSafe(s, x));

// How an NPC says a piece of their information out loud: in their own
// words, without repeating their character's name ("Snake Charmer: chose
// Player 3." becomes "I chose Player 3."; "Chef number: 0." becomes "My
// number is 0.").
export function speak(text) {
  const prefix = Object.keys(ROLES)
    .map(name)
    .find((n) => text.startsWith(`${n}: `) || text.startsWith(`${n} number: `));

  if (!prefix) {
    return text;
  }

  const rest = text.slice(prefix.length);

  // An Amnesiac's guess or question, and (on its own line) what the
  // Storyteller said.
  const guessed = /^: guessed (".*"): (BINGO|HOT|WARM|COLD)\.$/.exec(rest);
  const asked = /^: asked (".*"): (YES|NO)\.$/.exec(rest);

  if (guessed) {
    return `I guessed my ability is ${guessed[1]}\nAnd I got: ${guessed[2]}${
      guessed[2] === "BINGO" ? "!" : "."
    }`;
  }

  if (asked) {
    return `I asked the Storyteller ${asked[1]}\nAnd I got: ${asked[2]}.`;
  }

  if (rest.startsWith(" number: ")) {
    return `My number is ${rest.slice(" number: ".length)}`;
  }

  const said = rest
    .slice(2)
    .replace(/^(chose|protected|guessed|asked|gained|said) /, "I $1 ")
    .replace(/^shown /, "I was shown ")
    .replace(/^your /, "my ")
    .replace(/^you have /, "I have ")
    // (A Cannibal who ate the Lunatic: "You are the Fang Gu. Your Minions
    // are...": see cannibalLunatic().)
    .replace(/^you are /, "I was told I am ")
    .replace(/\. Your /g, ". My ")
    .replace(/ (is|are) your /, " $1 my ");

  return said.charAt(0).toUpperCase() + said.slice(1);
}

// Whether a piece of information makes its owner trust ("trust") or suspect
// ("suspicious") the players it names, or says nothing either way (null):
// see each character's `stance`. (Their own pick, who to protect or their
// master, tells a Monk, Innkeeper or Butler nothing.)
const infoStance = (m) => infoOf(m.role)?.stance?.(m) ?? null;


// The characters a piece of information says a player is (or might be): a
// Ravenkeeper's or Grandmother's one, a Dreamer's two, or the character one
// of a Washerwoman's, Librarian's or Investigator's pair is (see each
// character's `named`).
const namedCharacters = (m) => infoOf(m.role)?.named?.(m) ?? [];

// Whether piece of information m makes its owner trust ("trust") or suspect
// ("suspicious") player t, or neither (null). Information that says what
// character t is gets checked against t's public claim:
// - a Ravenkeeper's or Grandmother's character: it matches (trust) or it
//   doesn't (they're lying: suspicious);
// - a Dreamer's two characters: neither is their claim (suspicious);
// - a pair's character: t claims it (trust; for the Investigator's Minion,
//   suspicious), the other player does (t is just the other one: neither),
//   or neither does, though both have claimed (one is lying: suspicious).
// Otherwise it's how infoStance() reads it. Claims are the ones `viewer`
// (m's owner) knows (see claimTo()).
export function stanceOn(s, m, t, viewer = null) {
  const roles = namedCharacters(m);
  const claim = t && claimTo(t, viewer);

  if (!roles.length || !claim || !(m.targets ?? []).includes(t.id)) {
    return infoStance(m);
  }

  // (A pair's character reads against the other player's claim too.)
  const other = byId(
    s,
    m.targets.find((id) => id !== t.id),
  );
  const otherClaim = other && claimTo(other, viewer);
  const own = infoOf(m.role)?.claimStance?.(m, roles, claim, otherClaim);

  return own !== undefined ? own : roles.includes(claim) ? "trust" : "suspicious";
}

// What p's information m says against t's claim, as a reason to suspect
// them (null if it doesn't contradict it).
function contradiction(m, t, p) {
  const roles = namedCharacters(m);
  const claim = claimTo(t, p);

  if (!roles.length || !claim || roles.includes(claim) || PAIR_TEAM[m.role]) {
    return null;
  }

  return `my information says they're the ${roles
    .map(name)
    .join(" or the ")}, but they claim the ${name(claim)}`;
}

// Public evidence at least this strong outweighs a good NPC's own
// information when they give their opinion (see opinion()).
const STRONG_EVIDENCE = 3;

// Records what p just said (information naming players, and their
// opinion), so good NPCs can weigh it (see evidence()): in public, or in
// private `to` one listener, who alone hears it. (Nothing is kept for the
// human: you weigh it yourself. Nor is suspicion of you: you're never
// anyone's suspect.)
export function heard(s, p, memories, opinion = null, to = null) {
  if (to?.human) {
    return;
  }

  // (With the Atheist on the script, a listener may notice false
  // information: see atheistHeard().)
  if (s.script.ids.includes("atheist")) {
    atheistHeard(s, p, memories, to);
  }

  const list = to ? (to.heard ??= []) : (s.statements ??= []);
  const say = (type, targetId, source) => {
    const you = byId(s, targetId)?.human;

    if (
      ["trust", "suspicious"].includes(type) &&
      targetId &&
      targetId !== p.id &&
      !(type === "suspicious" && you)
    ) {
      list.push({ byId: p.id, day: s.day, type, targetId, source, at: tick(s) });
    }
  };

  for (const m of memories) {
    for (const id of m.targets ?? []) {
      say(stanceOn(s, m, byId(s, id), p), id, "info");
    }
  }

  if (opinion) {
    say(opinion.type, opinion.targetId, "opinion");
  }
}

// With the Atheist on the script: p says their information, in private `to`
// one listener or in public (to every NPC). Each good NPC hearing a false
// piece of it for the first time (one marked by storyteller.js doubted())
// notices it doesn't add up with what they know at ATHEIST_DOUBT_NOTICE: a
// doubt of their own (x.doubts), which makes them readier to believe an
// Atheist claim (see SimpleStrategy atheistCredence()). Each piece is
// weighed once by each listener (x.doubtsHeard). Logged.
function atheistHeard(s, p, memories, to) {
  const listeners = to ? [to] : s.players.filter((x) => !x.human);

  for (const m of memories.filter((m) => m.doubtful)) {
    const seen = [];
    const missed = [];

    for (const x of listeners) {
      if (x === p || sideOf(x) !== "good" || (x.doubtsHeard ??= []).includes(m.doubtful.id)) {
        continue;
      }

      x.doubtsHeard.push(m.doubtful.id);

      if (s.r() < ATHEIST_DOUBT_NOTICE) {
        (x.doubts ??= []).push({ byId: p.id, id: m.doubtful.id, day: s.day, broken: m.doubtful.broken });
        seen.push(x);
      } else {
        missed.push(x);
      }
    }

    if (seen.length || missed.length) {
      const list = (xs) => xs.map((x) => x.label).join(", ");
      const tally = seen.map((x) => `${x.label} ${x.doubts.length}`).join(", ");

      note(
        s,
        "workings",
        `${whose(p)} false information ("${m.text}"), told ${to ? `to ${to.label}` : "in public"}: ${
          seen.length
            ? `${list(seen)} notice${seen.length === 1 ? "s" : ""} it doesn't add up (doubts so far: ${tally})`
            : `nobody notices it doesn't add up (${list(missed)})`
        }${seen.length && missed.length ? `; ${list(missed)} ${missed.length === 1 ? "doesn't" : "don't"}` : ""} (at ${Math.round(
          ATHEIST_DOUBT_NOTICE * 100,
        )}% each).`,
        { playerId: p.id, noticedIds: seen.map((x) => x.id) },
      );
    }
  }
}

// The same reason found more than once (say, two votes for the same player)
// becomes one, weighing their total, saying how often: "... (twice)".
function merged(found) {
  const byText = new Map();

  for (const x of found) {
    const m = byText.get(x.text);

    byText.set(
      x.text,
      m ? { ...m, weight: m.weight + x.weight, n: m.n + 1 } : { ...x, n: 1 },
    );
  }

  return [...byText.values()].map((x) => ({
    weight: x.weight,
    text:
      x.n === 1
        ? x.text
        : `${x.text} (${x.n === 2 ? "twice" : `${x.n} times`})`,
  }));
}

// What p has heard about t, in public or told to them in private: each
// speaker's information about t (once per speaker and stance), and each
// speaker's latest opinion if it was about t.
function heardAbout(s, p, t) {
  const info = new Map();
  const latest = new Map();

  for (const st of [...(s.statements ?? []), ...(p.heard ?? [])]) {
    if (st.source === "opinion") {
      const was = latest.get(st.byId);

      if (!was || (st.at ?? 0) >= (was.at ?? 0)) {
        latest.set(st.byId, st);
      }
    } else if (st.targetId === t.id) {
      info.set(`${st.byId}:${st.type}`, st);
    }
  }

  return [
    ...info.values(),
    ...[...latest.values()].filter((st) => st.targetId === t.id),
  ];
}

// The players the town is sure are good (confirmed "certain" or "likely";
// see engine confirm()): trusted, never suspected, never framed.
export const sure = (s) =>
  Object.entries(s.confirmed ?? {})
    .filter(([, c]) => ["certain", "likely"].includes(c.level))
    .map(([id]) => id);

// Whether x has said why they claimed `role`: they came clean about a cover
// story, or explained the Cerenovus made them mad about it.
const explained = (x, role) =>
  x.cameClean?.from === role || (x.madAbout ?? []).includes(role);

// What p says of their information: all of it, except that a living Pixie
// (or Pixie bluffer) who claims another character keeps quiet about the
// Pixie's (see characters/townsfolk/pixie.js).
//
// A living good Mutant or Damsel hiding behind a Townsfolk claim gives the
// information they made up for it instead (see bluff.js hiddenStory()).
export const spoken = (p) =>
  p.alive && p.bluffState?.hidden && p.claim === p.bluffState.hidden.as
    ? p.bluffState.hidden.memories
    : p.alive && p.claim !== "pixie"
      ? p.memories.filter((m) => m.role !== "pixie")
      : p.memories;

// How a player is named in a reason: "you" for the human.
const who = (x) => (x.human ? "you" : x.label);
const whose = (x) => (x.human ? "your" : `${x.label}'s`);

export class SimpleStrategy {
  // Who in `pool` p suspects.
  //
  // Good NPCs can't see alignments: they go on what they've seen in public
  // (see evidence()), never suspecting a player their own information
  // vouches for. With nothing to go on, they keep their hunch, or pick one.
  //
  // Evil NPCs always point at good players: first anyone claiming their own
  // character (they have to), then mostly the team's shared scapegoat.
  //
  // The Lunatic plays as the Demon of its imagined team: it points at anyone
  // outside its "Minions", but doesn't know the real team's scapegoat.
  suspect(s, p, pool) {
    if (sideOf(p) === "good") {
      return this.reasoned(s, p, pool);
    }

    // (Never either twin: the twins must look alike to the town. Nor anyone
    // confirmed good, if there's anyone else: it wouldn't stick.) (The
    // Bounty Hunter's evil Townsfolk, not knowing their team, points at
    // nobody they suspect of being on it, if they can help it: see
    // hunches().)
    const unconfirmed = pool.filter((x) => !sure(s).includes(x.id));
    const others = (unconfirmed.length ? unconfirmed : pool).filter(
      (x) => !teammate(p, x),
    );
    const unsuspected = others.filter((x) => !hunch(p, x));
    const outside = unsuspected.length ? unsuspected : others;
    const untwinnedOutside = untwinned(s, outside);
    const good = untwinnedOutside.length ? untwinnedOutside : outside;
    const rival = good.find(
      (x) => claimTo(x, p) === p.claim && !isTwin(s, x),
    );

    if (rival) {
      return rival;
    }

    // (Nor do they know the team's scapegoat.)
    if (thinksEvil(p) || p.evilTownsfolk) {
      return pick(good, s.r);
    }

    const goat = scapegoat(s);

    if (good.includes(goat) && s.r() < SCAPEGOAT_CHANCE) {
      return goat;
    }

    return pick(good, s.r);
  }

  // A good NPC's suspect in `pool`: anyone they know is lying; else the
  // player with the most evidence
  // against them, if it's at least EVIDENCE_TO_SUSPECT (keeping their
  // current suspect on a tie), else their current hunch, else anyone they
  // don't trust.
  // The player in `pool` good NPC p strongly suspects (see
  // STRONG_EVIDENCE), or one they know is lying; null if none. What a good
  // player acting out a character without its ability (a cover story, a
  // hiding Mutant...) aims its public act at (a Slayer's shot, a Gossip's
  // statement...), so it never incriminates anyone without good reason.
  strongSuspect(s, p, pool) {
    const t = this.reasoned(s, p, pool);

    return t &&
      (t.id === p.certainSuspect || this.evidence(s, p, t).score >= STRONG_EVIDENCE)
      ? t
      : null;
  }

  reasoned(s, p, pool) {
    // Someone they know is lying (a Gambler who died guessing them).
    const certain = pool.find((x) => x.id === p.certainSuspect);

    if (certain) {
      return certain;
    }

    const trusted = this.trusted(s, p);
    const open = pool.filter((x) => !trusted.has(x.id));
    const options = open.length ? open : pool;
    const scores = new Map(
      options.map((x) => [x, this.evidence(s, p, x).score]),
    );
    const best = Math.max(0, ...scores.values());
    const top =
      best >= EVIDENCE_TO_SUSPECT
        ? options.filter((x) => scores.get(x) === best)
        : options;

    return top.find((x) => x.id === p.suspicion?.targetId) ?? pick(top, s.r);
  }

  // Each NPC keeps one suspect, always a living NPC, never the human.
  //
  // A good NPC's suspect follows the evidence (see reasoned()). Anyone with
  // evidence against their suspect says what it is, and `score` is how
  // much there is.
  //
  // An evil NPC's suspect can move at the start of a new day (35% chance),
  // and must move if the suspect has died. Evil NPCs never suspect a
  // teammate (such as the Demon), even one who turned evil after they picked
  // them.
  suspicion(s, p) {
    let target;

    this.hunches(s, p);

    if (sideOf(p) === "good") {
      target = this.suspect(s, p, this.others(s, p));
    } else {
      const current = byId(s, p.suspicion?.targetId);
      const newDay = p.suspicion?.day !== s.day;
      const stale = !current?.alive || current.human || teammate(p, current) || hunch(p, current);
      const move = stale || (newDay && s.r() < 0.35);

      target = move ? this.suspect(s, p, this.others(s, p)) : current;
    }

    const why = target ? this.evidence(s, p, target) : null;

    if (!target) {
      return null;
    }

    p.suspicion = {
      targetId: target.id,
      day: s.day,
      score: why.score,
      reasons: why.reasons,
    };

    return {
      targetId: target.id,
      score: why.score,
      text:
        why.score > 0
          ? `I'm suspicious of ${target.label}: ${why.reasons.join("; ")}.`
          : `I'm suspicious of ${target.label}.`,
    };
  }

  // The players the Bounty Hunter's evil Townsfolk p suspects of being on
  // their team, the evil team they don't know: the living NPCs their own
  // information points at (kept to themself: p.ownInfo), and those the
  // evidence points at, read as a good player would (at
  // EVIDENCE_TO_SUSPECT; not counting what they've made up). Kept in
  // p.hunches, and logged when they change. They don't vote for them (see
  // vote()), point at them (see suspect()), or make up information against
  // them (storyteller.js covered(), framed(); bluff.js knows()). Empty for
  // anyone else.
  hunches(s, p) {
    if (!p.evilTownsfolk || !p.alive) {
      return p.hunches ?? [];
    }

    const others = s.players.filter((x) => x.alive && x !== p && !x.human);
    const told = p.ownInfo ?? [];
    const own = others.filter((x) =>
      told.some((m) => m.targets?.includes(x.id) && stanceOn(s, m, x, p) === "suspicious"),
    );
    // (Their memories hold what they've made up: the evidence is read
    // without it, and without their own information, counted above.)
    const memories = p.memories;
    let seen;

    p.memories = [];

    try {
      seen = others.filter((x) => this.evidence(s, p, x).score >= EVIDENCE_TO_SUSPECT);
    } finally {
      p.memories = memories;
    }

    const ids = others.filter((x) => own.includes(x) || seen.includes(x)).map((x) => x.id);
    const before = p.hunches ?? [];

    p.hunches = ids;

    if (ids.join() !== before.join()) {
      const why = (x) =>
        [own.includes(x) && "their own information", seen.includes(x) && "the evidence"]
          .filter(Boolean)
          .join(" and ");

      note(
        s,
        "bountyhunter",
        ids.length
          ? `${p.label} (${name(p.role)}), the evil Townsfolk, suspects ${others
              .filter((x) => ids.includes(x.id))
              .map((x) => `${x.label} (${why(x)})`)
              .join(", ")} of being on their team: they won't vote for them, point at them, or make up information against them.`
          : `${p.label} (${name(p.role)}), the evil Townsfolk, no longer suspects anyone of being on their team.`,
        { playerId: p.id, targetIds: ids },
      );
    }

    return ids;
  }

  // ── Public reasoning ───────────────────────────────────────

  // Players p knows lied about their character: a dead player a Professor
  // couldn't bring back, though they claimed a Townsfolk (p's own Professor
  // choice, or a Professor's public word).
  liars(s, p) {
    const own = p.memories
      .filter((m) => m.role === "professor" && infoStance(m) === "suspicious")
      .flatMap((m) => m.targets ?? []);

    return new Set([...(s.exposed ?? []), ...own]);
  }

  // The players p's own information vouches for, and anyone confirmed good
  // in public (see engine confirm()).
  trusted(s, p) {
    return new Set([
      ...p.memories.flatMap((m) =>
        (m.targets ?? []).filter(
          (id) => stanceOn(s, m, byId(s, id), p) === "trust",
        ),
      ),
      ...sure(s).filter((id) => id !== p.id),
    ]);
  }

  // What p has seen and heard (in public, or told them in private) that
  // makes them suspect t (or trust them), weighed by EVIDENCE_WEIGHT in
  // data.js: their own claim against t's, double claims, what players said,
  // abilities seen to work or fail, and your marks and nominations. Returns
  // the total `score` and up to two `reasons` against t, strongest first.
  // (`atheist`: false leaves out what p makes of an Atheist claim and of
  // the votes on the Storyteller, for atheistCredence(), which weighs the
  // rest.)
  evidence(s, p, t, atheist = true) {
    const W = EVIDENCE_WEIGHT;
    const found = [];
    const add = (weight, text) => found.push({ weight, text });
    const twins = (a, b) => isTwin(s, a) && isTwin(s, b);
    const claim = claimTo(t, p);

    // (With a Pixie on the script, a double-claimed Townsfolk may just be
    // a mad Pixie: it counts for less. A mad Pixie knows the real one is out
    // there, so they don't hold it against them.)
    const pixie =
      s.script.ids.includes("pixie") && team(claim) === "townsfolk"
        ? PIXIE_DOUBLE_CLAIM_FACTOR
        : 1;
    const maybe = pixie < 1 ? " (a Pixie could explain it)" : "";
    // (There can be up to 3 Village Idiots: claiming it twice is no clash.)
    const many = claim === "villageidiot";

    if (claim && !many && !twins(p, t)) {
      if (claim === p.claim && !(p.pixieMad && !p.gained)) {
        add(
          W.claimsMyCharacter * pixie,
          `they claim the ${name(claim)}, but I'm the ${name(claim)}${maybe}`,
        );
      }

      for (const x of s.players) {
        if (x !== t && x !== p && claimTo(x, p) === claim && !twins(x, t)) {
          add(
            W.doubleClaim * pixie,
            `they and ${who(x)} both claim the ${name(claim)}${maybe}`,
          );
        }
      }
    }

    // They told p one character, and another before, or in public. Coming
    // clean (saying why) wins most of it back.
    const told = p.toldMe?.[t.id];
    const open = claimTo(t);
    const other = told && open && open !== told.claim ? open : told?.was;

    if (other && other !== told.claim && !twins(p, t)) {
      add(
        t.cameClean || explained(t, other) || explained(t, told.claim)
          ? W.changedStoryCleared
          : W.changedStory,
        `they told me they're the ${name(told.claim)}, but they've also said the ${name(other)}`,
      );
    }

    // Passed on to p (see told()): someone says t told them otherwise
    // (unless t has since explained it: see explained())...
    const passed = p.secondHand?.[t.id];
    const by = passed && byId(s, passed.fromId);

    if (
      by &&
      claim &&
      passed.claim !== claim &&
      !explained(t, passed.claim) &&
      !twins(p, t)
    ) {
      add(
        W.heardOtherwise,
        `${who(by)} says they claimed the ${name(passed.claim)}`,
      );
    }

    // ...or t passed on a claim that isn't what that player told p.
    for (const [id, x] of Object.entries(p.secondHand ?? {})) {
      const about = byId(s, id);
      const known = about && claimTo(about, p);

      if (
        x.fromId === t.id &&
        known &&
        x.claim !== known &&
        !explained(about, x.claim)
      ) {
        add(
          W.passedOnOtherwise,
          `they say ${who(about)} claimed the ${name(x.claim)}, but ${who(
            about,
          )} told me the ${name(known)}`,
        );
      }
    }

    // Their ability visibly worked: confirmed good, by how sure (see engine
    // confirm()).
    const confirmed = s.confirmed?.[t.id];

    if (confirmed) {
      add(
        {
          certain: W.confirmedGood,
          likely: W.confirmedLikely,
          maybe: W.confirmedMaybe,
        }[confirmed.level],
        `${
          { certain: "they're confirmed", likely: "they're almost certainly good", maybe: "they may be good" }[
            confirmed.level
          ]
        }: ${confirmed.why}`,
      );
    }

    // They guessed the Damsel in public: only a Minion's guess counts (see
    // characters/outsider/damsel.js).
    if ((s.damselGuesses ?? []).some((g) => g.byId === t.id)) {
      add(W.damselGuess, "they guessed the Damsel in public, as only a Minion would");
    }

    // They voted for an execution that failed (Legion): only evil voted.
    if ((s.failedExecutions ?? []).some((f) => f.voterIds.includes(t.id))) {
      add(W.failedExecution, "they voted for an execution that failed, so they're evil");
    }

    // They claim one of the Demon's bluffs, which a Wizard's wish made public
    // (see wizard.js exposeBluffs()).
    if (claim && (s.exposedBluffs ?? []).includes(claim)) {
      add(W.exposedBluff, `they claim the ${name(claim)}, one of the Demon's bluffs`);
    }

    // They showed they're evil in public (see engine outed()).
    const outed = (s.outed ?? []).find((x) => x.id === t.id);

    if (outed) {
      add(W.outedEvil, outed.why);
    }

    // Their claimed ability visibly failed (see engine failed()).
    for (const f of s.failures ?? []) {
      if (f.id === t.id) {
        add(W.abilityFailed, f.text);
      }
    }

    // A protector who told p (or the town) they protected a player the
    // Demon killed that night.
    if (["monk", "innkeeper"].includes(claim) && (p.toldMe?.[t.id] || t.claimKnown)) {
      const m = t.memories.find(
        (m) =>
          m.role === claim &&
          (m.targets ?? []).some((id) => {
            const x = byId(s, id);

            return x?.death === "demon" && x.diedAtNight === m.night;
          }),
      );

      if (m) {
        const x = byId(s, m.targets.find((id) => byId(s, id)?.death === "demon"));

        add(
          W.abilityFailed,
          `they say they protected ${who(x)} on Night ${m.night}, but the Demon killed them`,
        );
      }
    }

    // Late on, a public ability they claim, still unused: a Slayer's shot,
    // or a Juggler's Day 1 guesses.
    const late =
      (claim === "slayer" && !t.shotUsed && s.day >= ONCE_PER_GAME.slayer.AFTER_DAY + 2) ||
      (claim === "juggler" && !t.juggled && s.day >= 2);

    if (late && t.alive) {
      add(
        W.abilityUnused,
        claim === "slayer"
          ? "they claim the Slayer, but haven't shot"
          : "they claim the Juggler, but never juggled",
      );
    }

    // Your Good / Evil mark on them.
    const mark = s.marks?.[t.id];

    // (Your marks count a little extra: see humanTrusted.)
    if (mark === "evil") {
      add(W.markedEvil + W.humanTrusted, "you think they're evil");
    } else if (mark === "good") {
      add(W.markedGood - W.humanTrusted, "you think they're good");
    }

    // Their own information (saying why, when it contradicts t's claim).
    const against = p.memories.find(
      (m) =>
        (m.targets ?? []).includes(t.id) &&
        stanceOn(s, m, t, p) === "suspicious",
    );

    if (against) {
      add(
        W.myInfo,
        contradiction(against, t, p) ?? "my information points at them",
      );
    }

    // Each speaker counts once (their strongest statement about t).
    const strongest = new Map();
    const liars = this.liars(s, p);

    for (const st of heardAbout(s, p, t)) {
      const by = byId(s, st.byId);
      const trust = st.type === "trust";
      const found = [];
      const add = (weight, text) => found.push({ weight, text });

      if (!by || by === p) {
        continue;
      }

      if (liars.has(by.id)) {
        add(
          trust ? W.vouchedByLiar : W.accusedByLiar,
          `${by.label} ${trust ? "vouched for" : "accused"} them, but ${
            by.label
          } lied about their character`,
        );
      } else if (st.source === "info") {
        // (Yours, shared with them (Share My Info), counts for more: good
        // NPCs trust you, as with your marks. See EVIDENCE_WEIGHT.humanTrusted.)
        const yours = by.human ? W.humanTrusted : 0;

        add(
          trust ? W.vouchedByInfo - yours : W.namedByInfo + yours,
          `${whose(by)} information ${
            trust ? "vouches for" : "points at"
          } them`,
        );
      } else {
        add(
          trust ? W.trusted : W.accused,
          `${by.label} ${trust ? "trusts" : "is suspicious of"} them`,
        );
      }

      const best = strongest.get(by.id);

      if (!best || Math.abs(found[0].weight) > Math.abs(best.weight)) {
        strongest.set(by.id, found[0]);
      }
    }

    // (With Legion on the script, most voices may be lying: see
    // LEGION_HEARSAY_FACTOR.)
    const hearsay = s.script.ids.includes("legion") ? LEGION_HEARSAY_FACTOR : 1;

    for (const x of strongest.values()) {
      add(x.weight * hearsay, x.text);
    }

    // You nominated them (see humanTrusted).
    for (const v of s.voteHistory ?? []) {
      if (v.nomineeId === t.id && byId(s, v.nominatorId)?.human) {
        add(W.humanTrusted, "you nominated them");
      }
    }

    // (With the Atheist on the script: what p makes of t's Atheist claim,
    // and of t pushing to execute the Storyteller. See atheistEvidence().)
    if (atheist && s.script.ids.includes("atheist")) {
      for (const x of this.atheistEvidence(s, p, t, claim)) {
        add(x.weight, x.text);
      }
    }

    return {
      score: found.reduce((n, x) => n + x.weight, 0),
      reasons: merged(found.filter((x) => x.weight > 0))
        .sort((a, b) => b.weight - a.weight)
        .slice(0, 2)
        .map((x) => x.text),
    };
  }

  // ── The Atheist ────────────────────────────────────────────

  // Good player p's evidence against t, with the Atheist on the script (see
  // evidence()): if p doesn't believe t's Atheist claim, only an evil player
  // would make it (ATHEIST_DISBELIEF_EVIDENCE, the more the less they
  // believe it); and if p doesn't believe any Atheist claim, t nominating
  // the Storyteller, or voting to execute it, counts against them
  // (STORYTELLER_*_EVIDENCE: executed, evil would win). (A failed Legion
  // vote on the Storyteller counts as any failed execution does.)
  atheistEvidence(s, p, t, claim) {
    const found = [];
    const b = this.atheistBelief(s, p);

    if (!b || t === p) {
      return found;
    }

    if (claim === "atheist") {
      // (Not before Day ATHEIST_DISBELIEF_FROM_DAY, and never enough on its
      // own to make them a suspect: see ATHEIST_DISBELIEF_MAX.)
      const own = s.day >= ATHEIST_DISBELIEF_FROM_DAY ? this.atheistCredence(s, p, t).belief : 1;

      if (!this.evilShown(s) && own < ATHEIST_VOTE_BELIEF) {
        found.push({
          weight: Math.min(ATHEIST_DISBELIEF_MAX, ATHEIST_DISBELIEF_EVIDENCE * (1 - own / ATHEIST_VOTE_BELIEF)),
          text: "they claim the Atheist, and I don't believe it",
        });
      } else if (this.evilShown(s)) {
        found.push({
          weight: ATHEIST_DISBELIEF_EVIDENCE,
          text: `they claim the Atheist, but ${this.evilShown(s)}`,
        });
      }

      return found;
    }

    if (b.belief >= ATHEIST_VOTE_BELIEF) {
      return found;
    }

    for (const v of s.storytellerVotes ?? []) {
      if (v.nominatorId === t.id) {
        found.push({
          weight: STORYTELLER_NOMINATED_EVIDENCE,
          text: "they nominated the Storyteller, and I don't believe there's an Atheist",
        });
      } else if (v.voterIds.includes(t.id)) {
        found.push({
          weight: STORYTELLER_VOTED_EVIDENCE,
          text: "they voted to execute the Storyteller, and I don't believe there's an Atheist",
        });
      }
    }

    return found;
  }

  // Why good players know someone is evil, so no Atheist is in play: an
  // execution that failed with only evil votes (Legion), anyone who has
  // shown they're evil (a Psychopath's kill, a Goblin claim...), a Damsel
  // guess (only a Minion's counts). Null if nothing has.
  evilShown(s) {
    return (s.failedExecutions ?? []).length
      ? "an execution failed with only evil votes"
      : (s.outed ?? []).length
        ? "someone has shown they're evil"
        : (s.damselGuesses ?? []).length
          ? "someone guessed the Damsel, as only a Minion would"
          : null;
  }

  // How much good player p believes player c's Atheist claim, from 0 to 1
  // (see ATHEIST_BELIEF): how much of the information they've heard hasn't
  // added up (their own doubts, p.doubts: see atheistHeard()), whether it's
  // you, whether the Demon killed them, how close a vote on the Storyteller
  // came, who they respect believes it (see respectedBelievers()), and the
  // evidence about them. Returns { belief, reasons }.
  atheistCredence(s, p, c) {
    const A = ATHEIST_BELIEF;
    const doubts = Math.min((p.doubts ?? []).length, A.maxDoubts);
    const ev = Math.min(A.maxEvidence, this.evidence(s, p, c, false).score);
    const killed = !c.alive && c.death === "demon";
    // (Social proof: the failed vote on the Storyteller that came closest,
    // and the players p respects who believe it.)
    const close = Math.max(
      0,
      ...(s.storytellerVotes ?? []).filter((v) => !v.failed).map((v) => Math.min(1, v.count / v.needed)),
    );
    const respected = this.respectedBelievers(s, p, c).slice(0, A.maxRespected);
    const belief =
      A.base +
      A.doubt * doubts +
      (c.human ? A.human : 0) +
      (killed ? A.killed : 0) +
      A.vote * close +
      A.respected * respected.length -
      A.evidence * ev;
    const reasons = [
      doubts && `${doubts} thing${doubts === 1 ? "" : "s"} that didn't add up`,
      c.human && "you claim it",
      killed && "the Demon killed them",
      close >= 0.5 && `a vote on the Storyteller got ${Math.round(close * 100)}% of the votes it needed`,
      respected.length && `${respected.map(who).join(" and ")} believe${respected.length === 1 && !respected[0].human ? "s" : ""} it`,
      ev >= EVIDENCE_TO_SUSPECT && "the evidence against them",
      ev <= TRUST_EVIDENCE && "the evidence for them",
    ].filter(Boolean);

    return { belief: Math.min(1, Math.max(0, belief)), reasons };
  }

  // The players good player p respects (you, whom good NPCs trust; anyone
  // their information vouches for, or they've no evidence against: see
  // trusted(), evidence()) who have shown they believe an Atheist claim:
  // they nominated or voted to execute the Storyteller, or told p they
  // believe it (p.atheistViews: see told()). Not claimant c themself.
  respectedBelievers(s, p, c) {
    const shown = new Set(
      (s.storytellerVotes ?? []).flatMap((v) => [v.nominatorId, ...v.voterIds]),
    );

    for (const [id, v] of Object.entries(p.atheistViews ?? {})) {
      if (v.believes) {
        shown.add(id);
      }
    }

    shown.delete(p.id);
    shown.delete(c.id);

    if (!shown.size) {
      return [];
    }

    const trusted = this.trusted(s, p);

    return s.players.filter(
      (x) =>
        shown.has(x.id) &&
        (x.human || trusted.has(x.id) || this.evidence(s, p, x, false).score <= 0),
    );
  }

  // What NPC p says of an Atheist claim, when asked or talking in private
  // (see ask(), told()): { claimant, believes }, or null when nobody has
  // claimed it to them, they claim it themself, or they're mad. A good NPC
  // says what they believe (see atheistBelief()); an evil one backs a
  // teammate's claim (the trap: see storytellerNomination()), and no other.
  atheistView(s, p) {
    if (!s.script.ids.includes("atheist") || p.human || p.mad || p.claim === "atheist") {
      return null;
    }

    if (sideOf(p) === "evil") {
      const c = s.players.find((x) => x !== p && claimHeard(x, p) === "atheist");

      return c ? { claimant: c, believes: !thinksEvil(p) && teammate(p, c) } : null;
    }

    const b = this.atheistBelief(s, p);

    return b?.claimant ? { claimant: b.claimant, believes: b.belief >= ATHEIST_VOTE_BELIEF } : null;
  }

  // How much p believes the Atheist is in play, from 0 to 1, with the
  // Atheist on the script: { belief, claimant, reasons }, for the claimant
  // they believe most (see atheistCredence()). Certain if they're the
  // Atheist; nothing with nobody claiming it, or once anyone has shown
  // they're evil (see evilShown()). Null for anyone playing for evil, who
  // knows (or thinks) there's an evil team, and on any other script. (No
  // draw from s.r: the log and the UI may ask.)
  atheistBelief(s, p) {
    if (!s.script.ids.includes("atheist") || sideOf(p) !== "good") {
      return null;
    }

    if (p.role === "atheist") {
      return { belief: 1, claimant: p, reasons: ["they're the Atheist"] };
    }

    const claimants = s.players.filter((x) => x !== p && claimTo(x, p) === "atheist");

    if (!claimants.length) {
      return { belief: 0, claimant: null, reasons: [] };
    }

    const proof = this.evilShown(s);

    if (proof) {
      return { belief: 0, claimant: claimants[0], reasons: [proof] };
    }

    const best = claimants
      .map((c) => ({ claimant: c, ...this.atheistCredence(s, p, c) }))
      .reduce((a, b) => (b.belief > a.belief ? b : a));

    // (Two or more claim it: at most one is telling the truth. The double
    // claim counts against each, as evidence.)
    if (claimants.length > 1) {
      best.reasons = [...best.reasons, `${claimants.length} players claim it`];
    }

    return best;
  }

  // The NPCs who would vote to execute the Storyteller now, by what they
  // believe (see storytellerVote()): those who can vote (living, or dead
  // with their ghost vote), playing for good, at ATHEIST_VOTE_BELIEF or
  // more. (A good NPC weighing a nomination reads the room this way; so
  // does the evil team, who add their own votes. The Marionette, playing as
  // good, is among them: see storytellerNomination().)
  believers(s) {
    return s.players.filter(
      (x) =>
        !x.human &&
        (x.alive || x.ghost) &&
        !wishBarred(s, x) &&
        (this.atheistBelief(s, x)?.belief ?? 0) >= ATHEIST_VOTE_BELIEF,
    );
  }

  // Whether living NPC p nominates the Storyteller now (with the Atheist on
  // the script; once a day, by anyone): a nomination as nomination() returns
  // it, first of the day's (it would end the game), or null. Only once they
  // count enough votes to carry it (half the living players, rounded up):
  // - a good NPC who believes an Atheist claim (ATHEIST_NOMINATE_BELIEF), or
  //   the Atheist, counting the NPCs who believe it (see believers()), and
  //   you if you've told them you're the Atheist;
  // - an evil NPC (not the Lunatic), with an Atheist claim to point at,
  //   counting those believers and their own team's votes: executed, evil
  //   wins. (Only with at least EVIL_ATHEIST_TRAP_BELIEVERS good NPCs who
  //   believe it, never counting the Marionette, who is evil: the trap is
  //   for good to spring, not one the evil team springs alone once it holds
  //   half the votes. That also keeps a working Legion's veto away: see
  //   storytellerVote().)
  // Never while mad (see cerenovus.js): they say only what they're mad
  // about.
  storytellerNomination(s, p) {
    if (
      !s.script.ids.includes("atheist") ||
      s.storytellerNominated === s.day ||
      !p.alive ||
      p.human ||
      p.mad ||
      wishBarred(s, p) ||
      s.roshambo
    ) {
      return null;
    }

    const needed = Math.ceil(s.players.filter((x) => x.alive).length / 2);
    const target = { id: STORYTELLER, label: "the Storyteller", storyteller: true, alive: true };
    const score = NPC_NOMINATE_EVIDENCE + 100;

    if (sideOf(p) === "evil") {
      const claimant =
        (p.claim === "atheist" ? p : null) ??
        s.players.find((x) => x !== p && claimHeard(x, p) === "atheist") ??
        null;

      if (!claimant || thinksEvil(p)) {
        return null;
      }

      const believers = this.believers(s);
      const good = believers.filter((x) => x.alignment === "good");
      // (Not the Marionette, who thinks they're good: they vote by what
      // they believe, so count among the believers' votes, though never as
      // a good one.)
      const team = s.players.filter(
        (x) =>
          x.alignment === "evil" &&
          sideOf(x) === "evil" &&
          (x.alive || x.ghost) &&
          (x === p || teammate(p, x)),
      );

      // (The liar may also try short of the votes, as the Atheist would, with
      // their team's hands up: see atheistTry(), storytellerVote().)
      const tried =
        team.length + believers.length < needed &&
        claimant === p &&
        this.atheistTry(s, team.length + believers.length, needed);

      if (good.length < Math.max(1, EVIL_ATHEIST_TRAP_BELIEVERS) || (team.length + believers.length < needed && !tried)) {
        return null;
      }

      return {
        target,
        score: score + (claimant === p ? 1 : 0),
        reasons: [
          claimant === p
            ? "I'm the Atheist: execute the Storyteller, and good wins"
            : `I believe ${who(claimant)}: the Atheist is in play`,
        ],
        why: `${team.length} evil vote${team.length === 1 ? "" : "s"} and ${good.length} good NPC${
          good.length === 1 ? "" : "s"
        }${believers.length > good.length ? " (and the Marionette)" : ""} who believe the Atheist can carry it (${needed} needed): executed, evil wins`,
      };
    }

    const b = this.atheistBelief(s, p);

    if (!b?.claimant || b.belief < (p.role === "atheist" ? 1 : ATHEIST_NOMINATE_BELIEF)) {
      return null;
    }

    const believers = this.believers(s);
    const h = human(s);
    const you = h && (h.alive || h.ghost) && claimTo(h, p) === "atheist" ? 1 : 0;
    const votes = believers.length + you;
    const tried = votes < needed && p.role === "atheist" && this.atheistTry(s, votes, needed);

    if (votes < needed && !tried) {
      return null;
    }

    return {
      target,
      score: score + (b.claimant === p ? 1 : 0),
      reasons: [
        b.claimant === p
          ? "I'm the Atheist: execute the Storyteller, and good wins"
          : `I believe ${who(b.claimant)}: the Atheist is in play (${b.reasons.join("; ") || "I believe it"})`,
      ],
      why: `belief ${Math.round(b.belief * 100)}%; ${believers.length} NPC${believers.length === 1 ? "" : "s"} would vote for it${
        you ? ", and you claim it" : ""
      } (${needed} needed)${tried ? "; short, but enough to try (see ATHEIST_TRY_SHARE)" : ""}`,
    };
  }

  // Whether a player claiming the Atheist (the real one, or an evil liar
  // acting the part) nominates the Storyteller short of the votes it needs,
  // to show the town how many believe: from Day ATHEIST_TRY_FROM_DAY, with
  // `votes` at least ATHEIST_TRY_SHARE of the `needed`, and more than any
  // vote on it has had yet (so they don't try again for nothing). A failed
  // vote with many hands up makes others readier to believe (see
  // atheistCredence()).
  atheistTry(s, votes, needed) {
    const best = Math.max(0, ...(s.storytellerVotes ?? []).map((v) => v.count));

    return s.day >= ATHEIST_TRY_FROM_DAY && votes >= Math.ceil(ATHEIST_TRY_SHARE * needed) && votes > best;
  }

  // An NPC's closing remark when asked, one of:
  // - "nothing": a good NPC with no information has nothing to add;
  // - "trust" / "suspicious" of a player, from the NPC's own information
  //   where it names someone (so a Drunk's or a bluffer's wrong information
  //   gives a wrong opinion);
  // - otherwise, "suspicious" of their general suspect (see suspicion()).
  //
  // Public evidence against their suspect (see evidence()) comes first when
  // it's strong (STRONG_EVIDENCE). An NPC without information only speaks
  // up with evidence (EVIDENCE_TO_SUSPECT), good or evil alike, so saying
  // nothing isn't a tell.
  opinion(s, p) {
    const nothing = { type: "nothing", text: "I have nothing else to add." };
    const twin = this.twinOf(s, p);

    // While both twins live, each suspects the other above all else.
    if (twin) {
      return {
        type: "suspicious",
        targetId: twin.id,
        text: `I'm suspicious of ${twin.label}, my evil twin.`,
      };
    }

    const sus = this.suspicion(s, p);
    const general = sus ? { type: "suspicious", ...sus } : nothing;
    const evident = sus?.score >= EVIDENCE_TO_SUSPECT;

    if (evident && sus.score >= STRONG_EVIDENCE) {
      return general;
    }

    if (!p.memories.length) {
      return evident ? general : nothing;
    }

    return this.infoOpinion(s, p) ?? general;
  }

  // A Cannibal (or an evil player bluffing one) says whose ability they
  // have: "I have Player 7's ability, since they were executed." (A real
  // Cannibal isn't told the character.)
  cannibalLine(s, p, claim) {
    // (Or, claiming it without its ability, the last executee they "ate":
    // see engine cannibals().)
    const from =
      claim === "cannibal" &&
      byId(
        s,
        p.role === "cannibal"
          ? p.cannibalFrom
          : p.alignment === "evil"
            ? p.bluffState?.gained?.fromId
            : p.bluffState?.eaten.at(-1)?.fromId,
      );

    return from
      ? `I have ${from.human ? "your" : `${from.label}'s`} ability, since they were executed.`
      : null;
  }

  // The character a dead player now admits to, if any (else null): the
  // Mutant (no longer at risk of execution) or the Damsel (her ability is
  // gone), and so does an evil player who took that bluff (see
  // HIDDEN_OUTSIDERS); a mad Pixie who never gained the ability (the
  // madness can't matter any more), and so does an evil Pixie bluffer, who
  // acts just like one. Other evil players stick to their bluffs.
  revealsWhenDead(p) {
    if (p.alive) {
      return null;
    }

    // (Not the Heretic: they only say so in the final 3. See heretic.js.)
    const hidden = [p.role, p.bluff].find(
      (x) => HIDDEN_OUTSIDERS.includes(x) && x !== "heretic",
    );

    if (hidden) {
      return hidden;
    }

    return (p.role === "pixie" || p.shown === "pixie" || p.bluff === "pixie") &&
      p.pixieMad &&
      !p.gained &&
      !gainedRole(p)
      ? "pixie"
      : null;
  }

  // A Courtier who has chosen (or says they have) counts down how long
  // their choice is drunk: the 3 nights and 3 days from the night they
  // chose (through Day <night + 2>; see courtier.js), counting today.
  courtierLine(s, memories) {
    const m = memories.findLast((x) => x.role === "courtier" && x.character);

    if (!m) {
      return null;
    }

    const last = m.night + 2;
    const days = last - s.day + 1;
    const nights = last - s.day;
    const plural = (n, what) => `${n} more ${what}${n === 1 ? "" : "s"}`;

    return days < 1
      ? `My choice, the ${name(m.character)}, is no longer drunk.`
      : `My choice, the ${name(m.character)}, is drunk for ${
          nights > 0 ? `${plural(nights, "night")} and ` : ""
        }${plural(days, "day")} (counting today).`;
  }

  // "I haven't used my X ability yet." for a living NPC whose claimed
  // character has a once-per-game ability they (say they) haven't used.
  // (Not when what they tell you says they have: a pretend Philosopher's
  // "I gained the Alchemist ability", a made-up Seamstress's answer...)
  unusedAbility(p, memories = []) {
    return p.alive &&
      abilityUsed(p, p.claim) === false &&
      !memories.some((m) => m.role === p.claim)
      ? `I haven't used my ${name(p.claim)} ability yet.`
      : null;
  }

  // A mad Pixie (until they gain the ability) answers as the character
  // they're mad about, with made-up information to match (made up afresh
  // each day).
  pixieMad(s, p) {
    if (!p.pixieMad || p.gained || gainedRole(p) || !p.alive) {
      return null;
    }

    const state = bluffState(p);

    if (state.pixie?.day !== s.day) {
      state.pixie = { day: s.day, memories: backStory(s, p, p.pixieRole, this) };
    }

    return { role: p.pixieRole, memories: state.pixie.memories };
  }

  // For an Evil Twin: their good twin, and the good twin's information to
  // repeat word for word, with "X is your Evil Twin" naming the good twin.
  twinCopy(s, p) {
    const t = s.twins;
    const twin = t && p.id === t.evilId && p.role === "eviltwin"
      ? byId(s, t.goodId)
      : null;

    return twin
      ? {
          twin,
          // (Naming, and pointing at, the good twin.)
          memories: spoken(twin).map((m) =>
            m.role === "eviltwin"
              ? { ...m, text: evilTwinInfo(s, twin).text, targets: [twin.id] }
              : m,
          ),
        }
      : null;
  }

  // The living other twin of an Evil Twin pair p belongs to, if any.
  twinOf(s, p) {
    const t = s.twins;
    const id = t?.evilId === p.id ? t.goodId : t?.goodId === p.id ? t.evilId : null;
    const twin = id && byId(s, id);

    return twin?.alive ? twin : null;
  }

  // Trust or suspicion from the latest piece of information that names a
  // living NPC. Evil NPCs trust their teammates and accuse the scapegoat.
  infoOpinion(s, p) {
    const evil = sideOf(p) === "evil";
    const goat = evil && !thinksEvil(p) ? scapegoat(s) : null;

    for (const m of [...p.memories].reverse()) {
      const named = (m.targets ?? [])
        .map((id) => byId(s, id))
        .filter((x) => x?.alive && !x.human && x.id !== p.id)
        .map((x) => ({ x, type: stanceOn(s, m, x, p) }))
        .filter((o) => o.type);

      if (!named.length) {
        continue;
      }

      const preferred = evil
        ? named.filter((o) =>
            o.type === "trust" ? teammate(p, o.x) : o.x === goat,
          )
        : [];
      const { x: target, type } = pick(
        preferred.length ? preferred : named,
        s.r,
      );
      const when = m.day ? `Day ${m.day}` : `Night ${m.night}`;

      return {
        type,
        targetId: target.id,
        text: `${type === "trust" ? "I trust" : "I'm suspicious of"} ${
          target.label
        }, because of what I learned on ${when}.`,
      };
    }

    return null;
  }

  // What p says when asked: their claim, their information and their
  // opinion. Good NPCs share what they learned; evil NPCs share their
  // bluffed info.
  //
  // An NPC the Cerenovus made "mad" claims that character instead, with
  // made-up information to match (and an opinion drawn from it).
  //
  // The Evil Twin answers exactly as their good twin does (see twinCopy()).
  //
  // A good NPC with a cover story (see coverFor()) tells listener `to`
  // their cover character instead, unless they tell `to` the truth (see
  // truthTo()), with made-up information to match (see bluff.js keepStory()):
  // baiting, with an opinion drawn from it; hiding, with no reasons for
  // their opinion (which could give them away).
  answer(s, p, to = null) {
    const mad = p.mad?.day === s.day ? p.mad : this.pixieMad(s, p);
    const copy = !mad && this.twinCopy(s, p);
    const hidden = !mad && !copy && p.cover && !this.truthTo(s, p, to);

    if (hidden && p.cover.kind === "bait") {
      const memories = p.cover.memories ?? [];

      return {
        claim: p.cover.as,
        memories,
        opinion: this.infoOpinion(s, { ...p, memories }) ??
          this.hiddenOpinion(s, p),
        hidden,
      };
    }

    if (hidden) {
      return {
        claim: p.cover.as,
        memories: p.cover.memories ?? [],
        opinion: this.hiddenOpinion(s, p),
        hidden,
      };
    }

    const memories = mad
      ? (mad.memories ?? [])
      : copy
        ? copy.memories
        : spoken(p);
    const opinion = mad
      ? (this.infoOpinion(s, { ...p, memories }) ?? {
          text: "I have nothing else to add.",
        })
      : this.opinion(s, p);

    return {
      claim: mad ? mad.role : (this.damselTo(s, p, to) ?? p.claim),
      memories,
      opinion,
      mad,
      copy,
    };
  }

  // The Damsel (hiding: see HIDDEN_OUTSIDERS) tells listener `to` the truth
  // ("damsel") if they claim the Huntsman to her and she doesn't suspect
  // them, so the Huntsman can find her. A Damsel bluffer does the same, to
  // waste a real Huntsman's ability. Null otherwise.
  damselTo(s, p, to) {
    const damsel =
      (p.role === "damsel" && sideOf(p) === "good") ||
      (p.alignment === "evil" && p.bluff === "damsel");

    if (!damsel || !p.alive || !to || claimHeard(to, p) !== "huntsman") {
      return null;
    }

    const suspected =
      p.suspicion?.targetId === to.id ||
      (!to.human && this.evidence(s, p, to).score >= EVIDENCE_TO_SUSPECT);

    return suspected ? null : "damsel";
  }

  // On Day 1, whether good NPC p takes a cover story, and which (null if
  // not):
  // - hide ({ kind: "hide", as }): at HIDE_CHANCE, if their character is one
  //   the Demon most wants dead ("high" in DEMON_KILL_PRIORITY, not in
  //   HIDE_NEVER), they claim a safe good character ("low" or "avoid", not
  //   in HIDE_NEVER_AS), so the Demon looks elsewhere;
  // - bait ({ kind: "bait", as }): at BAIT_CHANCE, if their character
  //   doesn't mind a night kill (BAIT_ROLES: one that survives it, or
  //   learns something from it), they claim a "high" one (not in
  //   HIDE_NEVER), to draw the Demon's attack.
  // Either way, a good character on the script that isn't in play, claimed,
  // or one of the Demon's bluffs (the Demon knows those aren't in play).
  coverFor(s, p) {
    if (
      p.human ||
      p.alignment !== "good" ||
      sideOf(p) !== "good" ||
      isTwin(s, p) ||
      p.pixieMad ||
      // (A Mutant or Damsel already hides behind a Townsfolk claim.)
      HIDDEN_OUTSIDERS.includes(p.role) ||
      p.mad?.day === s.day ||
      // (Late enough to come clean already: see dawnComeClean().)
      s.players.filter((x) => x.alive).length <= COME_CLEAN_ALIVE
    ) {
      return null;
    }

    // A Damsel decoy (see DAMSEL_DECOY_CHANCE): at most one at a time.
    if (
      s.script.ids.includes("damsel") &&
      p.role !== "damsel" &&
      DEMON_KILL_PRIORITY[p.claim] !== "high" &&
      !s.players.some((x) => x.cover?.kind === "decoy") &&
      s.r() < DAMSEL_DECOY_CHANCE
    ) {
      return { kind: "decoy", as: "damsel", night: s.night };
    }

    // (The Magician keeps the evil team fooled by keeping quiet. The Poppy
    // Grower always hides: once the evil team kills them, it knows itself.)
    const kind =
      p.claim === "poppygrower"
        ? "hide"
        : p.claim === "magician"
        ? s.r() < MAGICIAN_HIDE_CHANCE && "hide"
        : DEMON_KILL_PRIORITY[p.claim] === "high" && !HIDE_NEVER.includes(p.claim)
        ? s.r() < HIDE_CHANCE && "hide"
        : BAIT_ROLES.includes(p.claim)
          ? s.r() < BAIT_CHANCE && "bait"
          : null;

    if (!kind) {
      return null;
    }

    // (Nor anyone else's cover story: two good players claiming it would
    // each look like a liar.)
    const used = new Set([
      ...s.players.flatMap((x) => [x.role, x.shown, x.claim, x.cover?.as]),
      ...(s.demonBluffs ?? []),
      ...(s.exposedBluffs ?? []),
    ]);
    const fits = (id) => {
      const level = DEMON_KILL_PRIORITY[id] ?? "low";

      return kind === "hide"
        ? ["low", "avoid"].includes(level) && !HIDE_NEVER_AS.includes(id)
        : level === "high" && !HIDE_NEVER.includes(id) && !HIDE_NEVER_AS.includes(id);
    };
    const as = pick(
      s.script.ids.filter(
        (id) =>
          ["townsfolk", "outsider"].includes(team(id)) && fits(id) && !used.has(id),
      ),
      s.r,
    );

    return as ? { kind, as, night: s.night } : null;
  }

  // Whether p, with a cover story, tells listener `to` the truth: a player
  // their own information vouches for, or you at COVER_TELL_HUMAN_CHANCE
  // (decided the first time you talk, and kept).
  truthTo(s, p, to) {
    // (A Damsel decoy never fools a Huntsman into wasting their ability.)
    if (p.cover.kind === "decoy" && to && claimHeard(to, p) === "huntsman") {
      return true;
    }

    if (to?.human) {
      p.cover.human ??= s.r() < COVER_TELL_HUMAN_CHANCE;
      return p.cover.human;
    }

    return Boolean(to) && this.trusted(s, p).has(to.id);
  }

  // A hider's opinion while hiding, as a player with no information
  // would give it: their suspect, with no reasons (which could give them
  // away), only if there's evidence against them (see opinion()).
  hiddenOpinion(s, p) {
    const sus = this.suspicion(s, p);

    return sus && sus.score >= EVIDENCE_TO_SUSPECT
      ? {
          type: "suspicious",
          targetId: sus.targetId,
          text: `I'm suspicious of ${byId(s, sus.targetId).label}.`,
        }
      : { type: "nothing", text: "I have nothing else to add." };
  }

  // What p's own information says about t: "trust", "suspicious" (which
  // wins), or null.
  ownStance(s, p, t) {
    const types = p.memories
      .filter((m) => (m.targets ?? []).includes(t.id))
      .map((m) => stanceOn(s, m, t, p));

    return types.includes("suspicious")
      ? "suspicious"
      : types.includes("trust")
        ? "trust"
        : null;
  }

  // p tells listener `to` (in private) what they'd tell you: `to` learns
  // their claim (see claimTo()), and hears their information and opinion
  // (see heard()). `to` remembers a different character p told them
  // before (`was`; see evidence()).
  //
  // p also passes on what everyone else told them (`to.secondHand`, the
  // latest for each player; see claimHeard()), which an evil p distorts
  // (see distortion()). Only NPCs keep it: you hear who they trust and
  // suspect instead (see ask()).
  told(s, p, to, a = this.answer(s, p, to)) {
    const before = to.toldMe?.[p.id];
    const was = before && before.claim !== a.claim ? before.claim : (before?.was ?? null);

    (to.toldMe ??= {})[p.id] = { claim: a.claim, day: s.day, at: tick(s), was };
    heard(s, p, a.memories, a.opinion, to);

    if (to.human) {
      return;
    }

    // (With the Atheist on the script, what p makes of an Atheist claim,
    // which `to` may weigh: see atheistView(), respectedBelievers().)
    const view = this.atheistView(s, p);

    if (view) {
      (to.atheistViews ??= {})[p.id] = { claimantId: view.claimant.id, believes: view.believes, day: s.day };
    }

    for (const [id, x] of Object.entries(p.toldMe ?? {})) {
      const about = byId(s, id);

      // (A good player keeps a Damsel's secret.)
      if (
        !about ||
        about === to ||
        about === p ||
        (x.claim === "damsel" && sideOf(p) === "good")
      ) {
        continue;
      }

      (to.secondHand ??= {})[id] = {
        claim: this.distortion(s, p, about, x.claim) ?? x.claim,
        fromId: p.id,
        day: s.day,
        at: tick(s),
      };
    }
  }

  // The character evil NPC p falsely says x told them (null for the
  // truth): for x the evil team's scapegoat, or a player who accused one
  // of the team in p's hearing, at DISTORT_CHANCE, a different good
  // character on the script. Decided once for each player, so p tells the
  // same lie every time.
  distortion(s, p, x, claim) {
    if (sideOf(p) !== "evil" || teammate(p, x) || x.human) {
      return null;
    }

    const lies = (p.distorted ??= {});

    if (!(x.id in lies)) {
      const accused = [...(s.statements ?? []), ...(p.heard ?? [])].some(
        (st) =>
          st.byId === x.id &&
          st.type === "suspicious" &&
          teammate(p, byId(s, st.targetId) ?? {}),
      );
      const target = x === scapegoat(s) || accused;

      lies[x.id] =
        target && s.r() < DISTORT_CHANCE
          ? pick(
              s.script.ids.filter(
                // (Not a character nobody would claim.)
                (id) =>
                  ["townsfolk", "outsider"].includes(team(id)) &&
                  !["drunk", "lunatic"].includes(id) &&
                  id !== claim &&
                  id !== p.claim,
              ),
              s.r,
            )
          : null;
    }

    return lies[x.id] && lies[x.id] !== claim ? lies[x.id] : null;
  }

  // Each night's (or day's) information goes on its own line, followed by
  // who they trust and who they suspect (see stances()). Only you hear it:
  // no NPC learns anything from your conversations.
  ask(s, p) {
    const a = this.answer(s, p, human(s));
    const { mad, copy, memories, opinion, hidden } = a;
    const info = memories.map(
      (x) => `${x.day ? `Day ${x.day}` : `Night ${x.night}`}: ${speak(x.text)}`,
    );
    const details = info.length
      ? info.join("\n")
      : "I have no stored information.";

    this.told(s, p, human(s), a);

    // For the final reveal: a cover story, or an evil player's bluff.
    if (hidden) {
      lied(s, { kind: p.cover.kind, byId: p.id, said: a.claim, truth: p.claim });
    } else if (!mad && sideOf(p) === "evil" && p.alignment === "evil" && a.claim !== p.role) {
      // (Not a Marionette who doesn't know: they believe their claim.)
      lied(s, { kind: "bluff", byId: p.id, said: a.claim, truth: p.role });
    }

    // Both twins insist they're the good one.
    const twin = !mad && this.twinOf(s, p);

    // A good NPC who woke up as a new character says so (once).
    const changes =
      !mad && !hidden && p.alignment === "good"
        ? (p.changes ?? []).filter((c) => !c.told)
        : [];

    for (const c of changes) {
      c.told = true;
    }

    // One player: who they trust, or who they suspect (see stances()).
    const st = this.stances(s, p);
    const one = st.say
      ? `Who I ${st.say.type}: ${st.say.players
          .map((x) => (x.why && !hidden ? `${x.x.label} (${x.why})` : x.x.label))
          .join(", ")}.`
      : "Who I trust or suspect: I have nothing.";

    // (For the log: how they got there; see engine ask().)
    p.workings = st.rows;

    // (With the Atheist on the script, what they make of an Atheist claim:
    // see atheistView().)
    const view = !hidden && this.atheistView(s, p);
    const atheist =
      view &&
      `On the Atheist: I ${view.believes ? "believe" : "don't believe"} ${
        view.claimant.human ? "you" : view.claimant.label
      }.`;

    return [
      `I claim ${name(a.claim)}.`,
      ...changes.map(
        (c) =>
          `I woke up as the ${name(c.to)} on Night ${c.night}; before that I was the ${name(c.from)}.`,
      ),
      twin && `${twin.label} is my twin, and I am the good twin.`,
      this.cannibalLine(s, p, a.claim),
      details,
      this.courtierLine(s, memories),
      !mad && !hidden && this.unusedAbility(copy ? copy.twin : p, memories),
      atheist,
      // (A hider gives no reasons: they could give them away.)
      one,
    ]
      .filter(Boolean)
      .join("\n");
  }

  // Who p really trusts and suspects among the other living NPCs; when you
  // ask, they tell you about one of them (`say`; see ask()). From each
  // player's evidence score (see evidence()):
  // - trust: their own information vouches for them, or a score of
  //   TRUST_EVIDENCE or less (their own information first, then the lowest
  //   score);
  // - suspect: a score of EVIDENCE_TO_SUSPECT or more (strongest first),
  //   with the strongest reason; their twin, always (first).
  // An evil NPC never names a teammate as a suspect, and always names the
  // evil team's scapegoat (or a twin, the other twin). `rows` are the
  // workings, for the log.
  //
  // `say` is whichever they feel more strongly about: their top suspect's
  // score against their most trusted player's (negative) score, their own
  // information counting as at least myInfo (a tie goes to the suspect;
  // a twin always wins); null if they have neither. It names the top
  // player, and any others they feel as strongly about, or strongly
  // (STRONG_EVIDENCE): an Empath's 0, say, vouches for both neighbours.
  stances(s, p) {
    const own = this.trusted(s, p);
    const evil = sideOf(p) === "evil";
    const goat = evil && !thinksEvil(p) ? scapegoat(s) : null;
    const twin = this.twinOf(s, p);
    // (Someone they know lied: a Gambler who died guessing them.)
    const certain = s.players.find(
      (x) => x.id === p.certainSuspect && x !== twin,
    );
    const rows = s.players
      .filter((x) => x !== p && !x.human && x.alive)
      .map((x) => {
        const ev = this.evidence(s, p, x);
        let stance = own.has(x.id)
          ? "trust"
          : ev.score <= TRUST_EVIDENCE
            ? "trust"
            : ev.score >= EVIDENCE_TO_SUSPECT
              ? "suspect"
              : null;
        let note = sure(s).includes(x.id)
          ? "confirmed"
          : own.has(x.id)
            ? "my information vouches for them"
            : null;

        if (x === certain && !(evil && teammate(p, x))) {
          stance = "suspect";
          note = "I know they lied";
        } else if (x === twin || (x === goat && !twin)) {
          stance = "suspect";
          note = x === twin ? "my twin" : "the evil team's scapegoat";
        } else if (evil && teammate(p, x) && stance === "suspect") {
          stance = null;
          note = "a teammate";
        }

        return { id: x.id, x, score: ev.score, reasons: ev.reasons, stance, note };
      });
    const known = (x) => x === twin || x === certain;
    const suspect = rows
      .filter((r) => r.stance === "suspect")
      .sort((a, b) => known(b.x) - known(a.x) || b.score - a.score)
      .map((r) => ({
        x: r.x,
        why:
          r.x === twin
            ? "my twin"
            : r.x === certain
              ? "I died guessing their character as the Gambler"
              : r.reasons[0] ?? null,
      }));
    const trust = rows
      .filter((r) => r.stance === "trust")
      .sort((a, b) => own.has(b.id) - own.has(a.id) || a.score - b.score)
      .map((r) => ({ x: r.x }));

    const row = (x) => rows.find((r) => r.x === x);
    const strength = {
      suspect: (x) => (known(x) ? Infinity : row(x).score),
      trust: (x) =>
        Math.max(-row(x).score, own.has(x.id) ? EVIDENCE_WEIGHT.myInfo : 0),
    };
    const top = suspect[0] && strength.suspect(suspect[0].x);
    const best = trust[0] && strength.trust(trust[0].x);
    const type =
      !suspect.length && !trust.length
        ? null
        : suspect.length && (!trust.length || top >= best)
          ? "suspect"
          : "trust";
    const list = type === "suspect" ? suspect : trust;
    const bar = Math.min(type === "suspect" ? top : best, STRONG_EVIDENCE);
    const say = type && {
      type,
      players: list.filter((x, i) => i === 0 || strength[type](x.x) >= bar),
    };

    return { trust, suspect, rows, say };
  }

  // Who NPC p nominates today, if anyone: their suspect, if they're alive
  // and the evidence against them is strong (NPC_NOMINATE_EVIDENCE), with
  // its `score` and `reasons` (see suspicion()). Never you, and never by
  // either twin (who only ever suspect each other).
  nomination(s, p) {
    if (this.twinOf(s, p)) {
      return null;
    }

    // (With the Atheist on the script, the Storyteller: see
    // storytellerNomination().)
    const storyteller = this.storytellerNomination(s, p);

    if (storyteller) {
      return storyteller;
    }

    // (An evil NPC nominating their Boomdandy makes up a reason.)
    const boom = this.boomPush(s, p);

    if (boom) {
      const claim = claimTo(boom, p);

      return {
        target: boom,
        score: NPC_NOMINATE_EVIDENCE + 1,
        reasons: [
          claim
            ? `they claim the ${name(claim)}, and I don't believe it`
            : "they won't say what they are",
        ],
      };
    }

    // (A Fearmonger nominates their chosen player; the evil team, their
    // Goblin, once they've nearly the votes to execute them.)
    const push = this.fearPush(s, p) ?? this.goblinPush(s, p) ?? this.mastermindPush(s, p);

    if (push) {
      const claim = claimTo(push, p);

      return {
        target: push,
        score: NPC_NOMINATE_EVIDENCE + 1,
        reasons: [
          claim
            ? `they claim the ${name(claim)}, and I don't believe it`
            : "they won't say what they are",
        ],
      };
    }

    // (Only their team is left alive: a teammate who isn't the Demon, to
    // reach the final 2. See onlyTeam().)
    const mate =
      onlyTeam(s, p) &&
      s.players.find((x) => x.alive && teammate(p, x) && !isDemon(x) && !s.nominated.includes(x.id));

    if (mate) {
      const claim = claimTo(mate, p);

      // (`why`: for log.txt, see engine npcNomination().)
      return {
        target: mate,
        score: NPC_NOMINATE_EVIDENCE + 1,
        reasons: [claim ? `they claim the ${name(claim)}, and I don't believe it` : "they won't say what they are"],
        why: `only the evil team is left alive: their teammate ${mate === p ? "themself" : `${mate.label} (${name(mate.role)})`}, to reach the final 2`,
      };
    }

    const sus = this.suspicion(s, p);
    const t = sus && byId(s, sus.targetId);

    // (The Leviathan never nominates a player claiming the Soldier: if it
    // executed the Soldier, good would win. Their jinx: see leviathan.js.)
    if (p.role === "leviathan" && t && claimTo(t, p) === "soldier") {
      // (Said once a day: nominations are weighed many times.)
      const key = `${s.day}:${t.id}`;

      if ((s.leviathanSpared ??= []).includes(key)) {
        return null;
      }

      s.leviathanSpared.push(key);
      note(
        s,
        "leviathan",
        `${p.label} (Leviathan) won't nominate ${t.label}, who claims the Soldier: if it's true, executing them would win for good.`,
        { playerId: p.id, targetId: t.id },
      );

      return null;
    }

    // (The Heretic never nominates their suspect: see vote(). Nobody good
    // nominates a player who claimed the Goblin: they'd claim it again.)
    return t?.alive &&
      !t.human &&
      p.role !== "heretic" &&
      !(sideOf(p) === "good" && (s.goblinClaims ?? []).some((x) => x.id === t.id)) &&
      !(sideOf(p) === "good" && (s.lleechSuspects ?? []).includes(t.id)) &&
      !spares(s, p, t) &&
      sus.score >= NPC_NOMINATE_EVIDENCE
      ? { target: t, score: sus.score, reasons: p.suspicion.reasons }
      : null;
  }

  // Whether v votes to execute the Storyteller (see
  // characters/townsfolk/atheist.js): executed, good wins if the Atheist is
  // in play, evil if not. `tally` as for vote(), but its `yes` counts only
  // votes already locked in: never your hand, which you may lower until the
  // clock hand reaches you (see engine intents()). Good players decide
  // first, so their votes are locked in when the evil team decides.
  //
  // An evil NPC knows no Atheist is in play (they're evil), so votes for it
  // when the votes locked in and the evil votes still to come (theirs and
  // their teammates') can carry it, and holds back otherwise: a hand up for
  // nothing would give them away (as it would with a working Legion and no
  // good vote locked in: only evil votes, the execution fails). An evil
  // player claiming the Atheist always votes, as the Atheist would. (The
  // Lunatic, whose evil team is imagined, holds back.) A good NPC votes if
  // they believe an Atheist claim (see atheistBelief()). Logged.
  storytellerVote(s, v, tally) {
    if (sideOf(v) === "evil") {
      const legion = s.players.some((x) => x.alive && x.role === "legion" && works(x));
      const still = s.players.filter(
        (x) =>
          x.alignment === "evil" && sideOf(x) === "evil" && (x.alive || x.ghost) && x.seat >= v.seat && !blind(v, x),
      ).length;
      // (A teammate claiming the Atheist trying it short of the votes: see
      // atheistTry().)
      const liar =
        tally.nominator && tally.nominator !== v && tally.nominator.claim === "atheist" && teammate(v, tally.nominator);
      const yes =
        !thinksEvil(v) &&
        (v.claim === "atheist" ||
          (!(legion && !tally.yes) && (liar || tally.yes + still >= tally.needed)));

      note(
        s,
        "workings",
        `${v.label} (${name(v.role)}) ${yes ? "votes" : "holds back"} on the Storyteller: ${
          thinksEvil(v)
            ? "their evil team is imagined"
            : v.claim === "atheist"
              ? "they claim the Atheist"
              : legion && !tally.yes
                ? "with Legion working and no good vote locked in, only evil votes would fail"
                : liar
                  ? `their teammate ${tally.nominator.label} claims the Atheist: many hands up make the town readier to believe it`
                  : `${tally.yes} vote${tally.yes === 1 ? "" : "s"} locked in and ${still} evil still to come, of ${tally.needed} needed`
        }.`,
        { playerId: v.id, vote: yes },
      );

      return yes;
    }

    return (this.atheistBelief(s, v)?.belief ?? 0) >= ATHEIST_VOTE_BELIEF;
  }

  // Whether v votes for nominee n. `tally` is how the vote stands when v
  // decides: `yes` votes so far, the votes `needed` to mark n, and the
  // `nominator`. (Evil voters decide last, so they know how it's going.)
  //
  // Evil NPCs vote for good nominees at EVIL_VOTE_CHANCE, and for a teammate
  // (at EVIL_TEAMMATE_VOTE_CHANCE) only when their vote can't change the
  // outcome.
  //
  // Good NPCs vote by what they think of n (see the GOOD_VOTE_* settings in
  // data.js).
  //
  // A dead player (good or evil) has one vote left: they save it for the
  // player they currently suspect, and don't spend it early (see
  // GHOST_VOTE_ALIVE).
  //
  // In the final 3 (or 2, with a Zombuul), the call is yours: good NPCs,
  // living or dead, vote for whoever you nominate (or asked to have
  // nominated), whatever they think of them. In the final 4 (or 3), your
  // pick sways them: they vote for it at NEAR_FINAL_HUMAN_VOTE_CHANCE at
  // least.
  vote(s, v, n, tally = null) {
    // A player who claimed the Goblin today: executing them could win it for
    // evil, so good players hardly ever vote, even for your pick. The evil
    // team always votes for their own (and, kept apart by the Poppy Grower,
    // for anyone: it might be theirs), never for one they know isn't (an
    // Alchemist with the ability: good would win).
    const goblin = (s.goblinClaims ?? []).some((x) => x.id === n.id && x.day === s.day);

    // (Nobody votes to execute themself, not even for your pick in the final
    // 3: except a Goblin (or Alchemist-Goblin) who claimed it today, as that's
    // the win, and a Boomdandy, whose team wants it executed (see below).)
    if (v === n && goblin && minionAbility(v) === "goblin") {
      return true;
    }

    // (Only their team is left alive: they execute a teammate who isn't the
    // Demon, themself too. See onlyTeam().)
    if (onlyTeam(s, v) && teammate(v, n) && !isDemon(n)) {
      return true;
    }

    if (v === n && !this.boomdandy(s, v, n)) {
      return false;
    }

    if (goblin && sideOf(v) !== "evil") {
      return s.r() < GOBLIN_GOOD_VOTE_CHANCE;
    }

    // (The Bounty Hunter's evil Townsfolk knows a Goblin claim means a
    // Minion: they vote too.)
    if (goblin && sideOf(v) === "evil") {
      return teammate(v, n) || Boolean(v.poppyBlind) || Boolean(v.evilTownsfolk);
    }

    // (Never to execute their Lleech's host: see spares().)
    if (spares(s, v, n)) {
      return false;
    }

    if (tally?.humanChoice && atFinal(s) && sideOf(v) !== "evil") {
      return true;
    }

    // (Not on the Mastermind's extra day, below, whose execution decides
    // the game.)
    if (
      tally?.humanChoice &&
      nearFinal(s) &&
      s.mastermindDay !== s.day &&
      sideOf(v) !== "evil" &&
      s.r() < NEAR_FINAL_HUMAN_VOTE_CHANCE
    ) {
      return true;
    }

    // On the Mastermind's extra day, the day's execution decides the game
    // (see mastermind.js): the evil team votes for anyone but a teammate,
    // and good players only for the player they suspect (with nobody
    // executed, good wins).
    if (s.mastermindDay === s.day) {
      if (sideOf(v) === "evil") {
        return !teammate(v, n) && !hunch(v, n);
      }

      return this.opinion(s, v).targetId === n.id &&
        this.opinion(s, v).type === "suspicious" &&
        s.r() < GOOD_VOTE_MAX;
    }

    // (Executing a dead player kills nobody, and uses up the day's
    // execution: good players, living or dead, don't vote for it. Unless the
    // Zombuul is on the script and it's their suspect: it might only
    // register as dead.)
    if (
      !n.alive &&
      sideOf(v) !== "evil" &&
      !(s.script.ids.includes("zombuul") && this.suspicion(s, v)?.targetId === n.id)
    ) {
      return false;
    }

    if (!v.alive) {
      const late =
        s.players.filter((x) => x.alive).length <= GHOST_VOTE_ALIVE;
      const decisive =
        tally && tally.yes < tally.needed && tally.yes + 1 >= tally.needed;

      return (late || decisive) && this.suspicion(s, v)?.targetId === n.id;
    }

    if (sideOf(v) === "evil") {
      // (The Boomdandy, and its team, want it executed: see BOOMDANDY_*.)
      if (this.boomdandy(s, v, n)) {
        return (
          s.r() <
          (this.demonHeat(s) < BOOMDANDY_HEAT
            ? BOOMDANDY_VOTE_CHANCE
            : BOOMDANDY_HOT_VOTE_CHANCE)
        );
      }

      // (The Bounty Hunter's evil Townsfolk mostly holds back from a nominee
      // they suspect of being on their team: see hunches().)
      if (hunch(v, n)) {
        const yes = s.r() < EVIL_TOWNSFOLK_HUNCH_VOTE_CHANCE;

        note(
          s,
          "bountyhunter",
          `${v.label} (${name(v.role)}), the evil Townsfolk, ${
            yes ? "votes for" : "holds back from voting for"
          } ${n.label}${yes ? ", though they suspect them" : ": they suspect them"} of being on their team.`,
          { playerId: v.id, targetId: n.id, vote: yes },
        );

        return yes;
      }

      if (!teammate(v, n)) {
        return s.r() < EVIL_VOTE_CHANCE;
      }

      // (Legion are many: one sacrificed looks good, and can't lose the
      // game. See LEGION_SACRIFICE_VOTE_CHANCE.)
      if (
        v.role === "legion" &&
        n.role === "legion" &&
        s.players.filter((x) => x.alive && x.role === "legion").length > 2
      ) {
        return s.r() < LEGION_SACRIFICE_VOTE_CHANCE;
      }

      // (Tying the player already marked changes it too: nobody is marked.)
      const tie =
        s.block?.nomineeId && tally && tally.yes + 1 === s.block.count;
      const harmless =
        tally &&
        !tie &&
        (tally.yes >= tally.needed || tally.yes + 1 < tally.needed);

      return Boolean(harmless) && s.r() < EVIL_TEAMMATE_VOTE_CHANCE;
    }

    const o = this.opinion(s, v);
    const about = o.targetId === n.id ? o.type : null;
    // (The Heretic wants their team to lose, quietly: they hold back from
    // their suspect and vote for players they trust.)
    const heretic = v.role === "heretic";

    // (With the Vortox on the script, a day without an execution may lose:
    // while nobody is marked, they vote for anyone they don't trust. See
    // VORTOX_VOTE_CHANCE; engine runNomination() says so in log.txt.)
    if (
      vortoxRisk(s) &&
      !heretic &&
      about !== "trust" &&
      !this.trusted(s, v).has(n.id) &&
      s.r() < VORTOX_VOTE_CHANCE
    ) {
      return true;
    }
    // (On the Leviathan's last day, the same: see leviathanRisk(), and
    // LEVIATHAN_LAST_DAY_VOTE_CHANCE.)
    const leviathan = leviathanRisk(s);

    if (
      leviathan === "last" &&
      !heretic &&
      about !== "trust" &&
      !this.trusted(s, v).has(n.id) &&
      s.r() < LEVIATHAN_LAST_DAY_VOTE_CHANCE
    ) {
      return true;
    }

    const yours = tally?.nominator?.human;

    // (On the Leviathan's Days 1 to 3, only with strong suspicion, whoever
    // nominated, you too: see LEVIATHAN_STRONG_EVIDENCE.)
    if (leviathan === "early" && !heretic) {
      const score =
        this.evidence(s, v, n).score + (yours ? EVIDENCE_WEIGHT.humanTrusted : 0);

      return score >= LEVIATHAN_STRONG_EVIDENCE && s.r() < GOOD_VOTE_MAX;
    }

    // (Once the Fearmonger has chosen, any execution an NPC they don't trust
    // nominated might be the one that loses: they hold back, even on their
    // suspect. See FEARMONGER_CAUTION.)
    const wary =
      s.fearmongerChose && !yours && !(tally?.nominator && this.trusted(s, v).has(tally.nominator.id))
        ? FEARMONGER_CAUTION
        : 1;

    if (about === "suspicious") {
      return s.r() < (heretic ? GOOD_VOTE_MIN : GOOD_VOTE_MAX) * wary;
    }

    if (about === "trust" || this.trusted(s, v).has(n.id)) {
      return s.r() < (heretic ? GOOD_VOTE_MAX : GOOD_VOTE_MIN);
    }

    // Your nomination counts as evidence too (humanTrusted), on top of
    // HUMAN_NOMINATION_BONUS.

    // With Legion on the script, a vote for anyone but their suspect (or
    // your pick) could be the one good vote an evil nomination needs: they
    // hold back (see LEGION_GOOD_VOTE_CHANCE).
    if (s.script.ids.includes("legion") && !yours) {
      return s.r() < LEGION_GOOD_VOTE_CHANCE;
    }

    const chance =
      GOOD_VOTE_CHANCE +
      GOOD_VOTE_EVIDENCE_STEP *
        (this.evidence(s, v, n).score +
          (yours ? EVIDENCE_WEIGHT.humanTrusted : 0)) +
      (yours ? HUMAN_NOMINATION_BONUS : 0) +
      // (The Leviathan's Days 4 and 5: see LEVIATHAN_LATE_VOTE_BONUS.)
      (leviathan === "late" ? LEVIATHAN_LATE_VOTE_BONUS : 0);

    return s.r() < Math.min(GOOD_VOTE_MAX, Math.max(GOOD_VOTE_MIN, chance)) * wary;
  }

  // ── Picking players ────────────────────────────────────────

  // The living players p can pick (not p). An evil player's picks, which
  // feed their bluffed information, never include the human.
  pickable(s, p) {
    return s.players.filter(
      (x) => x.alive && x.id !== p.id && !(p.alignment === "evil" && x.human),
    );
  }

  // Living NPCs other than p.
  others(s, p) {
    return s.players.filter((x) => x.alive && !x.human && x.id !== p.id);
  }

  // The part of `pool` p has never picked for this ability (`key`), so an
  // ongoing ability doesn't pick the same player twice; failing that, those
  // they didn't pick last time; failing that, all of `pool`.
  fresh(p, key, pool) {
    // (A bluffer's made-up choice that named just last time's player(s)
    // tries again without them, while there's anyone else: see bluff.js
    // madeUp().)
    const avoid = p.avoidTargets ?? [];
    const others = pool.filter((x) => !avoid.includes(x.id));

    pool = others.length ? others : pool;

    const ever = p.picked?.[key] ?? [];
    const last = p.lastPicks?.[key] ?? [];
    const never = pool.filter((x) => !ever.includes(x.id));
    const notLast = pool.filter((x) => !last.includes(x.id));

    return never.length ? never : notLast.length ? notLast : pool;
  }

  // Records p's pick(s) for `key` (see fresh(): last time, and ever) and
  // returns them.
  noted(p, key, picks) {
    const list = [].concat(picks ?? []).filter(Boolean);

    p.lastPicks = { ...p.lastPicks, [key]: list.map((x) => x.id) };
    p.picked = {
      ...p.picked,
      [key]: [...new Set([...(p.picked?.[key] ?? []), ...p.lastPicks[key]])],
    };

    return picks;
  }

  // ── Once-per-game timing ───────────────────────────────────

  // The chance an NPC uses a once-per-game ability on this day (or night):
  // see ONCE_PER_GAME in data.js.
  onceChance(role, day) {
    const t = ONCE_PER_GAME[role];

    if (!t) {
      return 1;
    }

    if (day < t.AFTER_DAY) {
      return 0;
    }

    return Math.min(1, t.START_CHANCE + t.STEP_CHANCE * (day - t.AFTER_DAY));
  }

  // Whether an NPC uses their once-per-game `role` ability now.
  onceReady(s, role, day) {
    const chance = this.onceChance(role, day);

    return chance > 0 && s.r() < chance;
  }

  // The Poisoner goes after good players with ongoing information (Empath,
  // Fortune Teller, Undertaker) when there are any.
  // (Not the same player two nights running, when there's a choice.)
  // The Poisoner picks a good player with information: on Night 1 anyone
  // who learns something tonight, later those who learn something every
  // night. The human is picked at HUMAN_POISON_CHANCE (not two nights
  // running), and can also be picked like anyone else. Never a player
  // already poisoned (a No Dashii's neighbour, a Widow's choice...) while
  // there's anyone else: their information is already false.
  poison(s, p = null) {
    const alive = untwinned(
      s,
      s.players.filter((x) => x.alive && goodTo(p, x)),
    );
    const healthy = alive.filter((x) => !x.poisoned);
    const good = healthy.length ? healthy : alive;
    const roles =
      s.night === 1 ? [...FIRST_NIGHT_INFO, ...ONGOING_INFO] : ONGOING_INFO;
    const info = good.filter((x) => roles.includes(ability(x)));
    const pool = info.length ? info : good;

    if (!p) {
      return pick(pool, s.r);
    }

    const human = good.find((x) => x.human);

    if (
      human &&
      !p.lastPicks?.poison?.includes(human.id) &&
      s.r() < HUMAN_POISON_CHANCE
    ) {
      return this.noted(p, "poison", human);
    }

    return this.noted(p, "poison", pick(this.fresh(p, "poison", pool), s.r));
  }

  // ── Extension Cord ─────────────────────────────────────────

  // Whether n is a Boomdandy evil NPC p wants executed (from
  // BOOMDANDY_FROM_DAY): their living teammate (or p themself). (Not the
  // Lunatic, whose team is imagined.)
  boomdandy(s, p, n) {
    return (
      n.role === "boomdandy" &&
      n.alive &&
      !thinksEvil(p) &&
      sideOf(p) === "evil" &&
      teammate(p, n) &&
      s.day >= BOOMDANDY_FROM_DAY
    );
  }

  // The share (0 to 1) of the living good NPCs who suspect the Demon.
  demonHeat(s) {
    const d = s.players.find((x) => x.alive && isDemon(x));
    const good = s.players.filter(
      (x) => x.alive && !x.human && x.alignment === "good",
    );

    return d && good.length
      ? good.filter((x) => x.suspicion?.targetId === d.id).length / good.length
      : 0;
  }

  // The Boomdandy evil NPC p nominates today (see BOOMDANDY_*), or null:
  // their teammate (not themself), while the Demon is under little
  // suspicion.
  boomPush(s, p) {
    const b = s.players.find((x) => x !== p && this.boomdandy(s, p, x));

    return b && !s.nominated.includes(b.id) && this.demonHeat(s) < BOOMDANDY_HEAT
      ? b
      : null;
  }

  // The player Fearmonger p nominates today, or null: their chosen player
  // (see fearmonger()), when a good NPC suspects them, or else at
  // FEARMONGER_PUSH_CHANCE (decided once a day).
  fearPush(s, p) {
    const t = minionAbility(p) === "fearmonger" && byId(s, p.fearTarget);

    if (!t?.alive || t.human || s.nominated.includes(t.id)) {
      return null;
    }

    // (A good Alchemist with the ability only when they suspect them.)
    if (sideOf(p) === "good") {
      return this.alchemistSuspect(s, p) === t ? t : null;
    }

    const suspected = s.players.some(
      (x) => x.alive && !x.human && x.alignment === "good" && x.suspicion?.targetId === t.id,
    );

    if (p.fearPushDay?.day !== s.day) {
      p.fearPushDay = { day: s.day, yes: s.r() < FEARMONGER_PUSH_CHANCE };
    }

    return suspected || p.fearPushDay.yes ? t : null;
  }

  // The Goblin evil NPC p nominates today, or null: their teammate (not
  // themself), once the evil team's living votes are at most
  // GOBLIN_PUSH_SHORT short of marking anyone (at GOBLIN_PUSH_CHANCE,
  // decided once a day).
  goblinPush(s, p) {
    const g = s.players.find(
      (x) => x !== p && x.alive && x.role === "goblin" && sideOf(p) === "evil" && teammate(p, x),
    );

    if (!g || s.nominated.includes(g.id)) {
      return null;
    }

    const alive = s.players.filter((x) => x.alive);
    const votes = alive.filter((x) => x.alignment === "evil").length;
    const needed = Math.max(Math.ceil(alive.length / 2), (s.block?.count ?? 0) + 1);

    if (votes + GOBLIN_PUSH_SHORT < needed) {
      return null;
    }

    if (p.goblinPushDay?.day !== s.day) {
      p.goblinPushDay = { day: s.day, yes: s.r() < GOBLIN_PUSH_CHANCE };
    }

    return p.goblinPushDay.yes ? g : null;
  }

  // The player evil NPC p nominates on the Mastermind's extra day, or null:
  // executing any good player wins it for evil (see mastermind.js). The
  // evil team's scapegoat while nobody has nominated them today, else a
  // living good NPC they know of nobody has. (Never you: NPCs never
  // nominate you.)
  mastermindPush(s, p) {
    if (s.mastermindDay !== s.day || sideOf(p) !== "evil") {
      return null;
    }

    const free = (x) =>
      x?.alive && !x.human && !teammate(p, x) && !s.nominated.includes(x.id);
    const goat = framed(s, p);

    return free(goat)
      ? goat
      : pick(s.players.filter((x) => free(x) && goodTo(p, x)), s.r);
  }

  // The Fearmonger's choice tonight: last night's, while they're a living
  // good NPC; else the good NPC the most good NPCs suspect (the town's next
  // execution), or any good NPC. (Never you: NPCs never nominate you.)
  fearmonger(s, p) {
    // (A good Alchemist with the ability chooses the player they suspect
    // enough to nominate, as they'd have the town execute them anyway: see
    // alchemistSuspect(). Failing that, as they must choose every night,
    // last night's choice while alive, else their suspect: they only
    // nominate with evidence enough, so it does no harm. Never you. The
    // reason goes in log.txt: see fearmonger.js.)
    if (sideOf(p) === "good") {
      const sure = this.alchemistSuspect(s, p);
      const last = byId(s, p.fearTarget);
      const kept = !sure && last?.alive && !last.human ? last : null;
      const hunch = !sure && !kept ? this.suspect(s, p, this.others(s, p).filter((x) => !x.human)) : null;

      p.fearWhy = sure
        ? "they suspect them enough to nominate them"
        : kept
          ? "nobody they suspect enough to nominate: last night's choice"
          : hunch
            ? "nobody they suspect enough to nominate, and they must choose: their suspect"
            : null;

      return sure ?? kept ?? hunch ?? null;
    }

    const last = byId(s, p.fearTarget);

    if (last?.alive && !last.human && last.alignment === "good" && !spares(s, p, last)) {
      return last;
    }

    const pool = untwinned(
      s,
      s.players.filter((x) => x.alive && !x.human && x !== p && goodTo(p, x) && !spares(s, p, x)),
    );
    const heat = (t) =>
      s.players.filter(
        (x) => x.alive && !x.human && x.alignment === "good" && x.suspicion?.targetId === t.id,
      ).length;
    const most = Math.max(0, ...pool.map(heat));

    return pick(most ? pool.filter((t) => heat(t) === most) : pool, s.r);
  }

  // The living NPC a good Alchemist p suspects enough to use their Minion
  // ability on: one they'd nominate (NPC_NOMINATE_EVIDENCE), or with `sure`,
  // one they strongly suspect (see strongSuspect()), not one `avoid`s. Null
  // if nobody.
  alchemistSuspect(s, p, sure = false, avoid = () => false) {
    const pool = untwinned(s, this.others(s, p)).filter((x) => !avoid(x));

    if (sure) {
      return this.strongSuspect(s, p, pool) ?? null;
    }

    const sus = this.suspicion(s, p);
    const t = sus && byId(s, sus.targetId);

    return t?.alive && !t.human && sus.score >= NPC_NOMINATE_EVIDENCE ? t : null;
  }

  // Who a good Alchemist with the Poisoner's ability poisons tonight: the
  // player they suspect most, else any living NPC they don't trust.
  alchemistPoison(s, p) {
    const sus = this.suspicion(s, p);
    const t = sus && byId(s, sus.targetId);

    if (t?.alive && !t.human) {
      return t;
    }

    const trusted = this.trusted(s, p);
    const pool = untwinned(s, this.others(s, p));

    return pick(pool.filter((x) => !trusted.has(x.id)), s.r) ?? pick(pool, s.r);
  }

  // An NPC Wizard's wish (see characters/minion/wizard.js): a good one (an
  // Alchemist) wishes to know who the Demon is; an evil one, to see the
  // Grimoire (half the time, if their team hasn't: no working Spy, nor a
  // Widow's or a wish's look), else that a player dies: whoever the Demon
  // would kill (never you, nor their Lleech's host).
  wish(s, p) {
    const alive = s.players.filter((x) => x.alive).length;
    const second = alive >= WIZARD_SECOND_MIN_ALIVE && s.mastermindDay !== s.day;

    if (sideOf(p) === "good") {
      const kinds = [
        "demon",
        ...(s.demonBluffs?.length && !s.exposedBluffs ? ["whispers"] : []),
        ...(second ? ["second"] : []),
      ];

      return { kind: pick(kinds, s.r) };
    }

    if (s.day === 1 && wishGifts(s).length && s.r() < WIZARD_GIFT_CHANCE) {
      return { kind: "gift" };
    }

    if (!this.spyWorks(s, p) && !s.widowGrimoire && !s.wizardGrimoire && s.r() < 0.5) {
      return { kind: "grimoire" };
    }

    // (While the good NPCs suspect a good player most, another execution
    // today is likely another good one.)
    if (second && townSuspect(s)?.alignment === "good") {
      return { kind: "second" };
    }

    const t = this.demon(s, p);

    return t?.alive && !t.human && t !== p && goodTo(p, t) && !isDemon(t) ? { kind: "death", target: t } : null;
  }

  // The Lleech's host: a living good NPC (never you: NPCs never nominate
  // you, so you could never be executed), preferring one who claims an
  // information character, whose information the poison spoils.
  lleechHost(s, p) {
    const good = untwinned(
      s,
      s.players.filter((x) => x.alive && !x.human && x !== p && goodTo(p, x)),
    );
    const voices = good.filter(
      (x) =>
        FIRST_NIGHT_INFO.includes(claimHeard(x, p)) ||
        ONGOING_INFO.includes(claimHeard(x, p)),
    );

    return pick(voices.length ? voices : good, s.r);
  }

  // Who Psychopath p kills in public today: whoever the Demon would kill
  // (see demon()), but never a teammate or themself, nor a player their kill
  // failed on before (p.foiled: see psychopath.js), while they still can't
  // die. Failing that, another good NPC; you only when there's none left,
  // as for the Demon.
  psychopath(s, p) {
    const foiled = (x) => Boolean(p.foiled?.includes(x.id)) && shielded(s, x);

    // (A good Alchemist with the ability: only a player they're sure of.)
    if (sideOf(p) === "good") {
      return this.alchemistSuspect(s, p, true, foiled);
    }

    const t = this.demon(s, p);

    if (t?.alive && t !== p && goodTo(p, t) && !spares(s, p, t) && !foiled(t)) {
      return t;
    }

    const good = untwinned(
      s,
      s.players.filter((x) => x.alive && x !== p && goodTo(p, x) && !spares(s, p, x)),
    );
    const npcs = good.filter((x) => !x.human);
    const fresh = npcs.filter((x) => !foiled(x));
    const you = good.filter((x) => x.human);

    return pick(fresh.length ? fresh : you.length ? you : npcs, s.r);
  }

  // The Fisherman visits the Storyteller once (timed by
  // ONCE_PER_GAME.fisherman). (A Fisherman bluffer the same.)
  fisherman(s) {
    return this.onceReady(s, "fisherman", s.day);
  }

  // Who a Puzzlemaster (once; timed by ONCE_PER_GAME.puzzlemaster) guesses
  // their puzzle made drunk: a player claiming an information character
  // (what the Storyteller would make drunk), they haven't guessed before;
  // anyone else if nobody does. Null if not today.
  puzzle(s, p) {
    if (!this.onceReady(s, "puzzlemaster", s.day)) {
      return null;
    }

    const pool = this.pickable(s, p);
    const info = pool.filter((x) =>
      [...FIRST_NIGHT_INFO, ...ONGOING_INFO].includes(claimHeard(x, p)),
    );

    return pick(info.length ? info : pool, s.r);
  }

  // The Huntsman (once) chooses a living player they think is the hidden
  // Damsel: one who has said so, at once; otherwise (timed by
  // ONCE_PER_GAME.huntsman) a player claiming a character nobody else
  // claims, they don't trust or suspect, not confirmed (a hider claims
  // something quiet); else anyone. Null if not tonight.
  // (A Huntsman bluffer keeps the Damsel they found for the Minions' guess.)
  // Why it chose them goes in p.huntsmanWhy, for the log.
  huntsman(s, p) {
    const evil = sideOf(p) === "evil";
    const pool = this.pickable(s, p);
    const told = pool.find((x) => claimHeard(x, p) === "damsel");
    const because = (t, why) => {
      p.huntsmanWhy = why;

      return t;
    };

    if (told && !evil) {
      return because(told, "they said they're the Damsel");
    }

    if (!this.onceReady(s, "huntsman", s.night)) {
      return null;
    }

    const trusted = this.trusted(s, p);
    const quiet = pool.filter(
      (x) =>
        x !== told &&
        !trusted.has(x.id) &&
        x.id !== p.suspicion?.targetId &&
        !sure(s).includes(x.id),
    );

    if (!quiet.length) {
      return because(
        pick(pool, s.r),
        `a guess at anyone: they trust, suspect or know about all ${pool.length} they could choose`,
      );
    }

    const t = pick(quiet, s.r);

    return because(
      t,
      `a guess: ${claimedAs(t, p)}, and they don't trust, suspect or know about them (1 of ${quiet.length} such players)`,
    );
  }

  // An NPC Minion's one Damsel guess today (see DAMSEL_* in data.js), or
  // null: never a teammate, nor a player the team has already guessed. A
  // player who said they're the Damsel, at once; a player claiming one of
  // the Demon's bluffs (not in play, so they're hiding) at
  // DAMSEL_HIDER_CHANCE; late in the game (DAMSEL_GUESS_ALIVE), at
  // DAMSEL_GUESS_CHANCE, one claiming an Outsider, else anyone unconfirmed.
  // Never while the Spy or Widow jinx poisons her (the team knows: see
  // characters/outsider/damsel.js), nor once she's said the Huntsman found
  // her (see damselSaved()).
  // Not before DAMSEL_GUESS_FROM_DAY, unless their Demon `doomed` is about
  // to be executed: then it's a last chance, so they guess their best
  // candidate without the chances (and with nobody better, anyone).
  // Why it chose them goes in p.damselWhy, for the log.
  damselGuess(s, p, doomed = null) {
    if (
      !s.damselKnown ||
      s.damselJinx ||
      s.damselGone ||
      p.damselGuessed ||
      sideOf(p) !== "evil" ||
      (!doomed && s.day < DAMSEL_GUESS_FROM_DAY)
    ) {
      return null;
    }

    const missed = (s.damselGuesses ?? []).map((g) => g.targetId);
    const pool = s.players.filter(
      (x) => x.alive && x !== p && !teammate(p, x) && !missed.includes(x.id),
    );
    const last = doomed
      ? `their Demon, ${doomed.label}, is about to be executed (a last chance): `
      : "";
    const because = (t, why) => {
      p.damselWhy = last + why;

      return t;
    };
    const chance = (c) => (doomed ? "" : `, at a ${c * 100}% chance`);
    const of = (list) => (list.length > 1 ? ` (1 of ${list.length})` : "");
    // (What the team's Huntsman bluffer was told in private: the real thing.)
    const team_ = [p, ...s.players.filter((x) => x !== p && teammate(p, x))];
    const told = (x) =>
      team_.find((m) => m.claim === "huntsman" && m.toldMe?.[x.id]?.claim === "damsel");
    const found = pool.find(told);

    if (found) {
      const m = told(found);

      return because(
        found,
        `they told ${m === p ? "them" : `their teammate ${m.label}`}, bluffing as the Huntsman, that they're the Damsel`,
      );
    }

    const claimed = pool.filter((x) => claimHeard(x, p) === "damsel");

    if (claimed.length && (doomed || s.r() < DAMSEL_CLAIM_CHANCE)) {
      return because(
        pick(claimed, s.r),
        `they said they're the Damsel${of(claimed)}${chance(DAMSEL_CLAIM_CHANCE)}`,
      );
    }

    // (Kept apart by the Poppy Grower, they were never told the bluffs.)
    const bluffs = p.bluffs?.length ? p.bluffs : p.poppyBlind ? [] : (s.demonBluffs ?? []);
    const hiders = pool.filter((x) => bluffs.includes(claimHeard(x, p)));

    if (hiders.length && (doomed || s.r() < DAMSEL_HIDER_CHANCE)) {
      const t = pick(hiders, s.r);

      return because(
        t,
        `${claimedAs(t, p)}, one of the Demon's bluffs, so not in play: they may be hiding${of(hiders)}${chance(DAMSEL_HIDER_CHANCE)}`,
      );
    }

    const alive = s.players.filter((x) => x.alive).length;

    if (
      !pool.length ||
      (!doomed && (alive > DAMSEL_GUESS_ALIVE || s.r() >= DAMSEL_GUESS_CHANCE))
    ) {
      return null;
    }

    const open = pool.filter((x) => !sure(s).includes(x.id));
    const options = open.length ? open : pool;
    const outsiders = options.filter((x) => team(claimHeard(x, p)) === "outsider");
    const t = pick(outsiders.length ? outsiders : options, s.r);
    const late = doomed
      ? "a guess"
      : `a late guess (${alive} alive, ${DAMSEL_GUESS_ALIVE} or fewer)${chance(DAMSEL_GUESS_CHANCE)}`;

    return because(
      t,
      outsiders.length
        ? `${late}: ${claimedAs(t, p)}, an Outsider${of(outsiders)}`
        : open.length
          ? `${late}: nobody claims an Outsider, so anyone not confirmed (${claimedAs(t, p)})${of(open)}`
          : `${late}: everyone is confirmed, so anyone (${claimedAs(t, p)})${of(pool)}`,
    );
  }

  // Who p points at in the Boomdandy's countdown, among the living
  // (`pool`; never themselves, nor you, as NPCs never nominate or target
  // you): a good player, their suspect; an evil one, a good player (never a
  // teammate), the one most others point at so far (`counts`), so it dies.
  boomPoint(s, p, pool, counts = {}) {
    const npcs = pool.filter((x) => x !== p && !x.human);
    const options = npcs.length ? npcs : pool.filter((x) => x !== p);

    if (sideOf(p) === "good") {
      return this.suspect(s, p, options) ?? pick(options, s.r);
    }

    const good = options.filter((x) => !teammate(p, x) && !spares(s, p, x));
    const most = Math.max(0, ...good.map((x) => counts[x.id] ?? 0));
    const top = good.filter((x) => (counts[x.id] ?? 0) === most);

    return pick(top.length ? top : options, s.r);
  }

  // The Widow (who has seen the Grimoire) poisons a good NPC with ongoing
  // information, for the rest of the game; you at HUMAN_POISON_CHANCE.
  widow(s, p) {
    const good = untwinned(
      s,
      s.players.filter((x) => x.alive && goodTo(p, x)),
    );
    // (Never herself: she's evil, but a Widow is never her own pick.)
    const npcs = good.filter((x) => !x.human && x !== p);
    const info = npcs.filter((x) => ONGOING_INFO.includes(ability(x)));
    // (You, unless you're the Widow: the Pit-Hag can make you one.)
    const human = good.find((x) => x.human && x !== p);

    if (human && s.r() < HUMAN_POISON_CHANCE) {
      return human;
    }

    return pick(info.length ? info : npcs.length ? npcs : human ? [human] : [], s.r);
  }

  // What an NPC Amnesiac guesses their ability is: one they haven't guessed
  // yet that gives information like theirs (see AMNESIAC_GUESSES).
  amnesiacGuess(s, p) {
    const shape = AMNESIAC_ABILITIES[p.amnesiac]?.shape;
    const fresh = Object.keys(AMNESIAC_GUESSES).filter(
      (k) => !(p.amnesiacGuessed ?? []).includes(k),
    );
    const like = fresh.filter((k) => AMNESIAC_GUESSES[k].shape === shape);

    return pick(like.length ? like : fresh, s.r);
  }

  monk(s, p) {
    return this.noted(
      p,
      "monk",
      pick(this.protectees(s, p, this.fresh(p, "monk", this.others(s, p))), s.r),
    );
  }

  // Who in `pool` a protector (the Monk, Innkeeper) would rather protect:
  // those who've publicly claimed the characters the Demon most wants dead
  // (DEMON_KILL_PRIORITY "high", then "med"), trusted ones first; never
  // their own suspect. All of `pool` (but the suspect) if nobody stands out.
  protectees(s, p, pool) {
    const safe = pool.filter((x) => x.id !== p.suspicion?.targetId);
    const options = safe.length ? safe : pool;
    const trusted = this.trusted(s, p);
    const level = (x) =>
      claimHeard(x, p) ? (DEMON_KILL_PRIORITY[claimHeard(x, p)] ?? "low") : null;

    for (const tier of ["high", "med"]) {
      const found = options.filter((x) => level(x) === tier);
      const sure = found.filter((x) => trusted.has(x.id));

      if (found.length) {
        return sure.length ? sure : found;
      }
    }

    return options;
  }

  // The Demon kills with purpose (see DEMON_* and KILL_PRIORITY_* in data.js):
  // - after being nominated (and surviving), it may kill itself so a Minion
  //   takes over;
  // - otherwise it works down its kill priorities (see priorityLevel()):
  //   good NPCs by the character they've claimed to it (in public or in
  //   private), or, with a working Spy on its team, by their true
  //   character; its own Minions by their true character, raised to their
  //   public bluff's level if that bluff is "med" or "high" (killing a
  //   "confirmed" info role makes good cover). A Minion it avoids stays
  //   avoided. If no priority fires, it attacks a good NPC it isn't
  //   avoiding; with no good NPC left, any random NPC.
  // - With a Spy, at SPY_COVER_CHANCE a night it kills a less valuable
  //   ("low") good player instead, so its kills don't give the Spy away.
  //
  // `exclude`: players it can't pick (already chosen tonight, or the Pukka's
  // last victim). It steers clear of players its attack bounced off before
  // (while it has anyone else to pick) and goes after whoever protected
  // them (the Monk, Innkeeper or Tea Lady), keeps the Lunatic alive as a decoy, kills who the
  // Lunatic chose at LUNATIC_FOLLOW_CHANCE (so they keep believing), and
  // goes after an Exorcist who has found it.
  //
  // Why it chose each target goes in p.killWhy (by id), for the log.
  demon(s, p, exclude = []) {
    const minion = s.players.some(
      (x) => x.alive && team(x.role) === "minion",
    );
    const because = (t, why) => {
      if (t) {
        (p.killWhy ??= {})[t.id] = why;
      }

      return t;
    };

    if (
      p.role === "imp" &&
      minion &&
      s.nominated.includes(p.id) &&
      s.r() < DEMON_STAR_PASS_CHANCE
    ) {
      return because(
        p,
        "itself, to pass the Demon to a Minion: it was nominated today",
      );
    }

    // The Vigormortis's Minions keep their ability if it kills them.
    const level =
      p.role === "vigormortis"
        ? (x) =>
            team(x.role) === "minion"
              ? VIGORMORTIS_MINION_PRIORITY
              : this.priorityLevel(s, x, p)
        : undefined;

    // Nobody who came back to life tonight (they can't die again), nor
    // their Lleech's host (it would die too: see spares()); and neither twin
    // (while both live: see twinSafe()), unless there's nobody else good to
    // kill, not even you (below).
    const open = this.others(s, p).filter(
      (x) => !exclude.includes(x) && !s.revived?.includes(x.id) && !spares(s, p, x),
    );
    let pool = open.filter((x) => !twinSafe(s, x));
    // Left with nobody it can kill but its own team (and a Lleech's host),
    // the Demon kills you, as in a real game, rather than a teammate or
    // nobody; having chosen you already tonight (the Shabaloth, the Po),
    // nobody else. Nobody it can kill, as the Storyteller knows: not a
    // working Soldier, nor a Tea Lady's good neighbour (say, when you're the
    // Tea Lady, both of yours). (A Sailor can die: late on, the Storyteller
    // makes them drunk; see sailor.js.) (Only now does it ever attack you:
    // see engine attack().)
    // (Not if you came back to life tonight: you can't die again tonight.)
    const you = s.players.find((x) => x.human && x.alive && !s.revived?.includes(x.id));
    const safe = (x) => Boolean(teaLadyOf(s, x)) || (x.role === "soldier" && works(x));

    if (isDemon(p) && you && !pool.some((x) => goodTo(p, x) && !safe(x))) {
      return exclude.includes(you)
        ? null
        : because(you, "nobody but its own team is left to kill, besides you");
    }

    // (Else the game could never end: say, a final 3 of the Demon, the Evil
    // Twin and the good twin.)
    if (!pool.some((x) => goodTo(p, x)) && open.some((x) => goodTo(p, x) && twinSafe(s, x))) {
      pool = open;
    }

    const decoys = pool.filter(
      (x) => x.role !== "lunatic" && !p.foiled?.includes(x.id),
    );
    // (Never a teammate to spare the Lunatic, or one its attack bounced off:
    // with only teammates left besides, them too.)
    const options = decoys.some((x) => goodTo(p, x)) ? decoys : pool;
    const lunaticPick = options.find((x) => x.id === s.lunaticPick);
    const exorcist = options.find((x) => x.id === p.exorcistId);
    const protector = pick(
      options.filter((x) => p.protectors?.includes(x.id)),
      s.r,
    );

    if (protector) {
      return because(
        protector,
        "they protected a player it attacked before (Tea Lady, Innkeeper or Monk)",
      );
    }

    if (lunaticPick && s.r() < LUNATIC_FOLLOW_CHANCE) {
      return because(
        lunaticPick,
        "the Lunatic chose them, so the Lunatic keeps believing",
      );
    }

    if (exorcist && s.r() < KILL_PRIORITY_CHANCE.high) {
      return because(exorcist, "the Exorcist who found it");
    }

    // (A Wizard's price: the Demon learns who wished to know it.)
    const wisher = options.find((x) => x.id === p.wisherId);

    if (wisher && s.r() < KILL_PRIORITY_CHANCE.high) {
      return because(wisher, "they wished to know who the Demon is");
    }

    // (Hiding the Spy: someone it wouldn't have known to go after.)
    const cover = this.spyWorks(s, p)
      ? options.filter(
          (x) =>
            goodTo(p, x) &&
            (DEMON_KILL_PRIORITY[x.role] ?? "low") === "low",
        )
      : [];

    if (cover.length && s.r() < SPY_COVER_CHANCE) {
      return because(
        pick(cover, s.r),
        "a low-priority good player, to keep its Spy hidden",
      );
    }

    let why = null;
    const t = this.byPriority(s, p, options, level, (text) => (why = text));

    return because(t, t && twinSafe(s, t) ? `a twin, as nobody else good is left to kill: ${why}` : why);
  }

  // Why player x has the kill priority they have to evil player p (see
  // priorityLevel()), for the log.
  levelSource(s, x, p) {
    const claim = claimHeard(x, p);

    if (p.role === "vigormortis" && team(x.role) === "minion") {
      return "a Minion it kills keeps their ability";
    }

    if (fooledBy(p, x)) {
      return "it thinks they're on its team (the Magician)";
    }

    if (x.alignment === "evil") {
      return `their teammate, the ${name(x.role)}${
        claim && claim !== x.role ? `, publicly the ${name(claim)}` : ""
      }`;
    }

    if (sure(s).includes(x.id)) {
      return "the town is sure they're good";
    }

    return this.spyWorks(s, p)
      ? `the Spy saw them as the ${name(x.role)}`
      : this.seenRole(s, x, p)
        ? `the Widow saw them as the ${name(this.seenRole(s, x, p))} on Night 1`
        : claim
        ? `it heard they're the ${name(claim)}`
        : "it doesn't know their character";
  }

  // Whether evil player p has a working Spy on their team (themselves, or a
  // teammate): someone who sees the Grimoire, so the team knows every
  // character in play. (Not the Lunatic, whose team is imagined.)
  spyWorks(s, p) {
    // (Not while the Poppy Grower has their ability: their jinx.)
    return (
      p.alignment === "evil" &&
      !poppyBlocks(s) &&
      s.players.some(
        (x) => x.alignment === "evil" && ability(x) === "spy" && works(x),
      )
    );
  }

  // The character evil player p's team knows x is, from the Grimoire (null
  // if it doesn't): a working Spy sees it as it is now; a Widow saw it once,
  // on Night 1 (s.widowGrimoire), so the team knows the character x had
  // then, not any change since.
  seenRole(s, x, p) {
    // By their jinxes, the Spy and Widow never see the Demon's or the
    // Magician's token while a Magician is in play.
    if (
      (isDemon(x) || x.role === "magician") &&
      s.players.some((y) => y.role === "magician")
    ) {
      return null;
    }

    return this.spyWorks(s, p)
      ? x.role
      : p.alignment === "evil"
        ? (s.widowGrimoire?.[x.id] ?? s.wizardGrimoire?.[x.id] ?? null)
        : null;
  }

  // Everyone the Demon attacks tonight: the Shabaloth 2 players; the Po
  // nobody (at PO_CHARGE_CHANCE), or 3 players after a night of nobody;
  // every other Demon 1.
  demonTargets(s, p) {
    const more = (n) => {
      const picks = [];

      for (let i = 0; i < n; i++) {
        const t = this.demon(s, p, picks);

        if (t && t !== p) {
          picks.push(t);
        } else if (!picks.length) {
          return [t];
        }
      }

      return picks;
    };

    if (p.role === "shabaloth") {
      return more(2);
    }

    if (p.role === "po") {
      if (p.poCharged) {
        return more(3);
      }

      return s.r() < PO_CHARGE_CHANCE ? [] : more(1);
    }

    return [this.demon(s, p)];
  }

  // A player's kill priority (DEMON_KILL_PRIORITY in data.js) to evil
  // player p: good players by the character they've claimed to p (null if
  // unknown; see claimTo()), or by their true character when p's team has
  // a working Spy or a Widow (see seenRole()); a good player the town is sure of
  // (see sure()) above all ("top"); evil players by their true character,
  // raised to a public "med"/"high" bluff's level unless their own level is
  // "avoid".
  priorityLevel(s, x, p) {
    const claim = claimHeard(x, p);
    const claimLevel = claim ? (DEMON_KILL_PRIORITY[claim] ?? "low") : null;

    // (The Magician it thinks is one of its own.)
    if (fooledBy(p, x)) {
      return "avoid";
    }

    // By their jinx, while the Magician lives the Demon doesn't know which
    // neighbour is its Marionette: it goes by their claim, as for anyone.
    const hidden =
      x.role === "marionette" &&
      isDemon(p) &&
      s.players.some((y) => y.alive && y.role === "magician");

    // (With the team kept apart by the Poppy Grower, a teammate is just
    // another player.)
    if (x.alignment !== "evil" || hidden || blind(p, x)) {
      // (A good player the town is sure of can't be framed: kill them first.)
      if (sure(s).includes(x.id)) {
        return "top";
      }

      const seen = this.seenRole(s, x, p);

      return seen ? (DEMON_KILL_PRIORITY[seen] ?? "low") : claimLevel;
    }

    const rank = ["avoid", "low", "med", "high"];
    // (A good character the Mezepheles turned evil is a teammate now.)
    const own = x.turnedEvil ? "avoid" : (DEMON_KILL_PRIORITY[x.role] ?? "avoid");

    return own !== "avoid" &&
      ["med", "high"].includes(claimLevel) &&
      rank.indexOf(claimLevel) > rank.indexOf(own)
      ? claimLevel
      : own;
  }

  // Picks from `pool` by priority to p, as the Demon does: check each level
  // from high to low at its KILL_PRIORITY_CHANCE, never choosing "avoid"
  // while anyone else is available; if no level fires, a good player who
  // isn't avoided, then any good player, then anyone.
  // (`report`, if given, is told why, for the log.)
  byPriority(
    s,
    p,
    pool,
    level = (x) => this.priorityLevel(s, x, p),
    report = () => {},
  ) {
    const notAvoided = pool.filter((x) => level(x) !== "avoid");
    const skipped = [];

    for (const tier of ["top", "high", "med", "low"]) {
      const found = notAvoided.filter((x) => level(x) === tier);

      if (found.length && s.r() < KILL_PRIORITY_CHANCE[tier]) {
        const t = pick(found, s.r);

        report(
          `"${tier}" priority (${this.levelSource(s, t, p)}): 1 of ${
            found.length
          } at that level, on its ${Math.round(
            KILL_PRIORITY_CHANCE[tier] * 100,
          )}% chance${
            skipped.length
              ? `; the ${skipped.join(", ")} chance didn't come up`
              : ""
          }`,
        );

        return t;
      }

      if (found.length) {
        skipped.push(`"${tier}"`);
      }
    }

    const good = pool.filter((x) => goodTo(p, x));
    const fallback = [
      [good.filter((x) => level(x) !== "avoid"), "a good player it isn't avoiding"],
      [good, "a good player (all avoided)"],
      [pool, "anyone (no good player to attack)"],
    ].find(([options]) => options.length);

    if (!fallback) {
      return null;
    }

    const t = pick(fallback[0], s.r);

    report(
      `no priority level's chance came up${
        skipped.length ? ` (${skipped.join(", ")})` : ""
      }: ${fallback[1]}, at random (${this.levelSource(s, t, p)})`,
    );

    return t;
  }

  // Night choices only ever pick living players. An evil Ravenkeeper bluffer
  // "learns" about the team's scapegoat.
  // (Never you. An evil bluffer names the scapegoat, else never a teammate:
  // their made-up character could give that teammate away.)
  raven(s, p) {
    const evil = p.alignment === "evil";
    const goat = evil ? scapegoat(s) : null;

    if (goat?.alive && goat !== p) {
      return goat;
    }

    const pool = this.pickable(s, p).filter((x) => !x.human);
    const good = evil ? pool.filter((x) => !teammate(p, x)) : pool;

    return pick(good.length ? good : pool, s.r);
  }

  // The Leviathan's choice each night*, with the Ravenkeeper or Sage on the
  // script (their jinx: see leviathan.js): an alive player it hasn't chosen
  // before, never you nor a teammate, and not one claiming the Ravenkeeper
  // or Sage if it can help it (they'd use their ability).
  leviathan(s, p) {
    const chosen = s.leviathan?.chosen ?? [];
    const pool = this.pickable(s, p).filter(
      (x) => !x.human && !teammate(p, x) && !chosen.includes(x.id),
    );
    const safe = pool.filter((x) => !["ravenkeeper", "sage"].includes(claimTo(x, p)));

    return pick(safe.length ? safe : pool, s.r) ?? null;
  }

  // Two players, avoiding last night's pair where possible.
  ft(s, p) {
    const pool = this.pickable(s, p);
    const fresh = this.fresh(p, "ft", pool);
    const pair =
      fresh.length >= 2
        ? sample(fresh, 2, s.r)
        : [
            ...fresh,
            ...sample(
              pool.filter((x) => !fresh.includes(x)),
              2 - fresh.length,
              s.r,
            ),
          ];

    return this.noted(p, "ft", pair);
  }

  // An NPC Slayer who hasn't fired yet may shoot a living NPC they suspect.
  // (A good player pretending to be the Slayer, a face-down Damsel or
  // Mutant or a cover story, shoots someone they strongly suspect if they
  // can, else their suspect, as a real Slayer does: one who never shoots
  // gives themself away.)
  slay(s, p) {
    if (!this.onceReady(s, "slayer", s.day)) {
      return null;
    }

    const pool = this.others(s, p);

    return pretends(p, "slayer")
      ? (this.strongSuspect(s, p, pool) ?? this.suspect(s, p, pool))
      : this.suspect(s, p, pool);
  }

  // A Butler picks any other living player as master.
  butler(s, p) {
    return this.noted(
      p,
      "butler",
      pick(this.fresh(p, "butler", this.pickable(s, p)), s.r),
    );
  }

  // A Gambler tests what they've heard: they guess another living player
  // is the character that player claimed, in public or to them (see
  // claimHeard()), which kills them if it's a lie: never a hunch (a Demon
  // or Minion nobody claims). Someone they haven't guessed before first
  // (see fresh()). With no claim to go on, they guess themselves (`self`),
  // which is safe and learns nothing. A wrong guess kills a working Gambler.
  // (A Gambler bluffer, or a cover story, guesses the same way.)
  gamble(s, p) {
    const pool = this.pickable(s, p);
    const known = this.fresh(
      p,
      "gamble",
      pool.filter((x) => claimHeard(x, p)),
    );
    const target = this.noted(p, "gamble", pick(known, s.r));

    // (They know their own character: the one they were shown.)
    return target
      ? { target, role: claimHeard(target, p), told: true }
      : { target: p, role: p.shown, told: false, self: true };
  }

  // An Artist asks "Is any of these 1–3 players <evil / the Demon / a Minion
  // / an Outsider / a Townsfolk>?", always including someone they suspect.
  // (Once per game, timed by ONCE_PER_GAME.artist.)
  artist(s, p) {
    if (!this.onceReady(s, "artist", s.day)) {
      return null;
    }

    const pool = this.others(s, p);
    const suspect = this.suspect(s, p, pool);

    if (!suspect) {
      return null;
    }

    // An evil Artist bluffer only asks about good players, so their lie
    // frames everyone named.
    const count = 1 + Math.floor(s.r() * Math.min(3, pool.length));
    const others = sample(
      pool.filter(
        (x) => x !== suspect && (p.alignment === "good" || x.alignment === "good"),
      ),
      count - 1,
      s.r,
    );

    return {
      targets: [suspect, ...others],
      question: pick(Object.keys(ARTIST_QUESTIONS), s.r),
    };
  }

  // When the human requests a nomination, a living NPC (not the nominee)
  // makes it. For a claimed Virgin, only NPCs claiming a Townsfolk step up
  // (including the Drunk, who claims their Townsfolk token, and evil
  // Townsfolk bluffers), first-night information claimers first.
  nominator(s, n) {
    // Each player can only nominate once per day.
    const pool = s.players.filter(
      (x) =>
        x.alive &&
        !x.human &&
        x.id !== n.id &&
        !s.dayNominators.includes(x.id) &&
        !wishBarred(s, x),
    );

    if (n.claim !== "virgin") {
      return pick(pool, s.r);
    }

    const townsfolk = pool.filter((x) => team(x.claim) === "townsfolk");
    const firstNight = townsfolk.filter((x) =>
      FIRST_NIGHT_INFO.includes(x.claim),
    );

    return pick(firstNight.length ? firstNight : townsfolk, s.r);
  }

  // A dying Moonchild curses a living NPC they suspect (never a twin).
  moonchild(s, p) {
    return this.suspect(s, p, untwinned(s, this.others(s, p)));
  }

  // The Assassin spends their one kill (timed by ONCE_PER_GAME.assassin) on a
  // living good NPC.
  assassin(s) {
    if (!this.onceReady(s, "assassin", s.night)) {
      return null;
    }

    // (Never the Lunatic, the evil team's decoy; nor their Lleech's host.)
    const a = s.players.find((x) => x.role === "assassin");

    return pick(
      untwinned(
        s,
        s.players.filter(
          (x) =>
            x.alive &&
            !x.human &&
            goodTo(null, x) &&
            x.role !== "lunatic" &&
            !spares(s, a, x),
        ),
      ),
      s.r,
    );
  }

  // The Devil's Advocate shields an evil teammate from execution if possible,
  // never the same player two nights running.
  advocate(s, p, lastId) {
    const pool = s.players.filter((x) => x.alive && x.id !== lastId);
    const evil = pool.filter((x) => x.alignment === "evil");

    return pick(evil.length ? evil : pool, s.r);
  }

  // ── More characters' choices ───────────────────────────────

  // The Dreamer looks into someone they suspect (not last night's pick).
  // The Village Idiot learns a player's alignment: a good NPC, their
  // suspect if they haven't checked them yet, else someone they haven't;
  // an evil bluffer "checks" the scapegoat first. Never you, and never a
  // player they checked before while there's anyone else (going by what
  // they've learned or said: see shownBefore()). The same player all night,
  // however often it's asked (a misinformed one's true and false answers).
  villageIdiot(s, p) {
    if (p.idiotPick?.night === s.night && byId(s, p.idiotPick.id)?.alive) {
      return byId(s, p.idiotPick.id);
    }

    const all = this.others(s, p);
    const checked = shownBefore(s, p, "villageidiot");
    const unchecked = all.filter((x) => !checked.has(x.id));
    const pool = unchecked.length ? unchecked : all;
    const want =
      sideOf(p) === "evil" ? scapegoat(s) : byId(s, p.suspicion?.targetId);
    const t = pool.includes(want) ? want : pick(pool, s.r);

    p.idiotPick = t ? { night: s.night, id: t.id } : null;

    return t;
  }

  dream(s, p) {
    const pool = this.fresh(p, "dream", this.others(s, p));

    return this.noted(
      p,
      "dream",
      this.suspect(s, p, pool) ?? pick(pool, s.r),
    );
  }

  // The Snake Charmer charms someone they suspect (hoping for the Demon),
  // not last night's pick.
  // The Snake Charmer never picks the Demon; with nobody else to pick, they
  // pick themselves.
  snake(s, p) {
    const valid = this.others(s, p).filter((x) => !isDemon(x));

    if (!valid.length) {
      return this.noted(p, "snake", p);
    }

    const pool = this.fresh(p, "snake", valid);

    return this.noted(p, "snake", this.suspect(s, p, pool) ?? pick(pool, s.r));
  }

  // The Seamstress (once per game, timed by ONCE_PER_GAME.seamstress)
  // compares someone they suspect with another player. Never a player they
  // know claims the Recluse (who might register as evil, wasting the one
  // use), while there's anyone else to choose.
  seamstress(s, p) {
    if (!this.onceReady(s, "seamstress", s.night)) {
      return null;
    }

    const all = this.others(s, p);
    const others = all.filter((x) => claimHeard(x, p) !== "recluse");
    const pool = others.length >= 2 ? others : all;
    const a = this.suspect(s, p, pool);
    const b = pick(
      pool.filter((x) => x !== a),
      s.r,
    );

    return a && b ? [a, b] : null;
  }

  // The Philosopher (once per game, timed by ONCE_PER_GAME.philosopher) gains
  // a Townsfolk ability that helps the town: never an Outsider's (the
  // Damsel's, Politician's or Heretic's would do good no good, or harm), nor
  // one of PHILOSOPHER_AVOID, which would do nothing. The most valuable
  // first (a "high" DEMON_KILL_PRIORITY), even if it's in play and its
  // holder is made drunk; then any other. Not in play, when it can. Why
  // goes in p.philosopherWhy, for the log (see philosopher.js).
  philosopher(s, p) {
    if (!this.onceReady(s, "philosopher", s.night)) {
      return null;
    }

    const inPlay = new Set(s.players.map((x) => x.role));
    const barred = jinxBarred(s);
    // (Nor one jinxed with a character in play: see jinxBarred(). Nor the
    // Alchemist's, with no Minion ability left to have.)
    const useful = s.script.ids.filter(
      (id) =>
        team(id) === "townsfolk" &&
        id !== "philosopher" &&
        !PHILOSOPHER_AVOID.includes(id) &&
        !barred.has(id) &&
        (id !== "alchemist" || alchemistOptions(s).length > 0),
    );
    const high = useful.filter((id) => DEMON_KILL_PRIORITY[id] === "high");
    const free = (ids) => ids.filter((id) => !inPlay.has(id));
    const [ids, why] = [
      [free(high), "one of the most valuable Townsfolk, not in play"],
      [high, "one of the most valuable Townsfolk (in play: its holder is made drunk)"],
      [free(useful), "a useful Townsfolk, not in play"],
      [useful, "a useful Townsfolk (in play: its holder is made drunk)"],
    ].find(([x]) => x.length) ?? [[], null];

    p.philosopherWhy = why;

    return pick(ids, s.r);
  }

  // An evil Philosopher bluffer "gains" a Townsfolk that is in play
  // (preferring information characters), as if its holder were now drunk.
  philosopherBluff(s, p) {
    if (!this.onceReady(s, "philosopher", s.night)) {
      return null;
    }

    const inPlay = s.players
      .filter((x) => x !== p && team(x.role) === "townsfolk")
      .map((x) => x.role)
      .filter((id) => id !== "philosopher");
    const info = inPlay.filter(
      (id) => FIRST_NIGHT_INFO.includes(id) || ONGOING_INFO.includes(id),
    );

    return pick(info.length ? info : inPlay, s.r);
  }

  // The Juggler guesses up to 5 living players' characters, players whose
  // claim they know first (see claimTo()): what they claim (at
  // JUGGLER_CLAIM_GUESS_CHANCE), otherwise another plausible character: one
  // they've heard somebody claim, or one of the evil team's bluffs. (A
  // Juggler bluffer guesses the same way.)
  juggle(s, p) {
    const plausible = [
      ...new Set([
        ...s.players.map((y) => claimHeard(y, p)).filter(Boolean),
        // (Not ones they were never told: see poppygrower.js.)
        ...(p.poppyBlind ? [] : (s.demonBluffs ?? [])),
      ]),
    ];
    const others = this.others(s, p);
    const known = others.filter((x) => claimHeard(x, p));
    const picks = [
      ...sample(known, 5, s.r),
      ...sample(
        others.filter((x) => !known.includes(x)),
        5,
        s.r,
      ),
    ].slice(0, 5);

    return picks.map((x) => {
      const claim = claimHeard(x, p);

      return {
        id: x.id,
        role:
          claim && s.r() < JUGGLER_CLAIM_GUESS_CHANCE
            ? claim
            : (pick(
                plausible.filter((id) => id !== claim),
                s.r,
              ) ??
              claim ??
              pick(s.script.ids, s.r)),
      };
    });
  }

  // A dying Klutz picks a player they believe is good: one their information
  // vouches for and nothing makes them suspect; else anyone they have no
  // reason to suspect (no information against them, not their suspect or
  // their twin); else anyone. An evil Klutz bluffer (no effect) picks a good
  // player, as a real one would seem to.
  klutz(s, p) {
    const living = s.players.filter((x) => x.alive && x.id !== p.id);
    // (Why, for the log: p.klutzWhy, see klutz.js.)
    const because = (t, why) => {
      p.klutzWhy = why;
      return t;
    };

    if (p.alignment === "evil") {
      const good = pick(
        living.filter((x) => x.alignment === "good"),
        s.r,
      );

      return good
        ? because(good, "evil, so a good player")
        : because(pick(living, s.r), "evil, and nobody good is left");
    }

    const trusted = new Set();
    const suspected = new Set(
      [p.suspicion?.targetId, s.twins && this.twinOf(s, p)?.id].filter(Boolean),
    );

    for (const m of p.memories) {
      for (const id of m.targets ?? []) {
        const type = stanceOn(s, m, byId(s, id), p);

        if (type) {
          (type === "trust" ? trusted : suspected).add(id);
        }
      }
    }

    const believed = living.filter(
      (x) => trusted.has(x.id) && !suspected.has(x.id),
    );
    const unsuspected = living.filter((x) => !suspected.has(x.id));

    const one = pick(believed, s.r);

    if (one) {
      return because(one, `a player their information trusts (1 of ${believed.length})`);
    }

    const other = pick(unsuspected, s.r);

    if (other) {
      return because(
        other,
        `nobody their information trusts, so a player they don't suspect (1 of ${unsuspected.length})`,
      );
    }

    return because(pick(living, s.r), "they suspect everyone left, so at random");
  }

  // The Storyteller's pick for who a dying Sweetheart makes drunk: a good
  // player, ideally one with information.
  sweetheart(s, p) {
    const good = untwinned(
      s,
      s.players.filter(
        (x) => x.alive && x !== p && x.alignment === "good" && !isDrunk(x),
      ),
    );
    const info = good.filter(
      (x) =>
        FIRST_NIGHT_INFO.includes(ability(x)) ||
        ONGOING_INFO.includes(ability(x)),
    );

    // (Unless the Storyteller is helping good: then anyone but them.)
    return pick(
      steer(
        s,
        info.length ? info : good,
        (x) => (info.includes(x) ? "evil" : "good"),
        "who the Sweetheart makes drunk",
      ),
      s.r,
    );
  }

  // After the Barber dies, the Demon swaps two good NPCs' characters.
  // The Barber's swap (see BARBER_* in data.js): the Demon d swaps the 2
  // living good NPCs (never a Drunk or a twin) whose swap helps evil most,
  // by what d has heard them claim; or nobody, if no swap gains enough.
  // Why it chose them goes in d.barberWhy, for the log.
  barber(s, d = null) {
    // (Never the Lunatic: their new character couldn't believe in their
    // imagined team.)
    const good = s.players.filter(
      (x) =>
        x.alive &&
        !x.human &&
        x.alignment === "good" &&
        x.role !== "lunatic" &&
        !isDrunk(x) &&
        !isDemon(x) &&
        !twinSafe(s, x),
    );
    const claim = (x) => claimHeard(x, d);
    // What a claimed character's ability is worth to good, for player x
    // (a spent once-per-game ability, half; an unknown claim, "med").
    const worth = (role, x) => {
      const v = !role
        ? BARBER_VALUE.med
        : team(role) === "outsider"
          ? BARBER_OUTSIDER_VALUE
          : (BARBER_VALUE[DEMON_KILL_PRIORITY[role]] ?? BARBER_VALUE.med);

      return role && abilityUsed(x, role) ? v / 2 : v;
    };
    // How far the town believes x.
    const weight = (x) => {
      const doubters = s.players.filter(
        (y) => y.alive && !y.human && y.alignment === "good" && y.suspicion?.targetId === x.id,
      ).length + (s.scapegoat === x.id ? 1 : 0);
      const confirmed = ["certain", "likely"].includes(s.confirmed?.[x.id]?.level);

      return Math.max(
        BARBER_MIN_WEIGHT,
        (confirmed ? BARBER_CONFIRMED_WEIGHT : 1) - doubters * BARBER_SUSPECTED_WEIGHT,
      );
    };
    const starts = (role) => FIRST_NIGHT_INFO.includes(role) || role === "pixie";
    // Evil's gain from swapping a and b: good's ability, weighted by belief,
    // before less after, less any information the swap gives them tonight.
    const gain = (a, b) =>
      weight(a) * (worth(claim(a), a) - worth(claim(b), a)) +
      weight(b) * (worth(claim(b), b) - worth(claim(a), b)) -
      (starts(claim(b)) ? BARBER_NEW_INFO_COST * weight(a) : 0) -
      (starts(claim(a)) ? BARBER_NEW_INFO_COST * weight(b) : 0);

    let best = null;

    for (const [i, a] of good.entries()) {
      for (const b of good.slice(i + 1)) {
        const g = gain(a, b);

        if (!best || g > best.g || (g === best.g && s.r() < 0.5)) {
          best = { a, b, g };
        }
      }
    }

    const note = (why) => {
      if (d) {
        d.barberWhy = why;
      }
    };

    if (!best || best.g < BARBER_MIN_GAIN) {
      note(best
        ? `no swap helps evil enough (best ${Math.round(best.g * 10) / 10}, needs ${BARBER_MIN_GAIN})`
        : "fewer than 2 good players to swap");
      return null;
    }

    const said = (x) => (claim(x) ? `the ${name(claim(x))}` : "an unknown character");
    const belief = (x) => `believed ${Math.round(weight(x) * 100) / 100}`;

    note(`${best.a.label} (claims ${said(best.a)}, ${belief(best.a)}) and ${
      best.b.label
    } (claims ${said(best.b)}, ${belief(best.b)}): evil gains ${Math.round(best.g * 10) / 10}`);

    return [best.a, best.b];
  }

  // The Witch curses the human (the likeliest nominator) or a good NPC.
  // (Not the same player two nights running, when there's a choice.)
  witch(s, p) {
    const human = s.players.find((x) => x.human && x.alive);
    const humanLast = p.lastPicks?.witch?.includes(human?.id);

    // (Never a Day 1 curse on the human.)
    if (
      human &&
      !humanLast &&
      !twinSafe(s, human) &&
      s.night > 1 &&
      s.r() < WITCH_HUMAN_CHANCE
    ) {
      return this.noted(p, "witch", human);
    }

    const good = untwinned(
      s,
      this.others(s, p).filter((x) => goodTo(p, x) && !spares(s, p, x)),
    );

    return this.noted(p, "witch", pick(this.fresh(p, "witch", good), s.r));
  }

  // The Cerenovus makes a good NPC "mad" about another good character.
  // The Cerenovus picks a good NPC the way the Demon picks its kills, and
  // makes them mad about a good character that isn't who they are (their
  // true character, the one they think they are, or their claim; never the
  // Drunk, the Mutant, the Damsel or the Pixie, none of which is ever
  // claimed openly while alive).
  //
  // At CERENOVUS_EVIL_CHANCE it instead makes an evil teammate mad about a
  // good character that isn't in play: a fresh bluff for a day, after which
  // they go back to their old one.
  //
  // Never the Atheist, who can't be made mad (nor an evil player claiming
  // it, the evil team's trap): see characters/townsfolk/atheist.js.
  cerenovus(s, p) {
    const others = untwinned(s, this.others(s, p)).filter(
      (x) => x.role !== "atheist" && x.claim !== "atheist",
    );
    const teammates = others.filter((x) => x.alignment === "evil" && !blind(p, x));
    const evil = teammates.length && s.r() < CERENOVUS_EVIL_CHANCE;
    const target = this.noted(
      p,
      "cerenovus",
      evil
        ? pick(this.fresh(p, "cerenovus", teammates), s.r)
        : this.byPriority(
            s,
            p,
            this.fresh(
              p,
              "cerenovus",
              others.filter((x) => goodTo(p, x)),
            ),
          ),
    );
    const own = target && [target.role, ability(target), target.claim];
    const tokens = new Set(s.players.flatMap((x) => [x.role, x.shown]));

    // (Their jinx: the Cerenovus may make a good NPC mad that they're the
    // Goblin, so they'd claim it when nominated: see goblin.js.)
    if (
      target &&
      !evil &&
      !target.human &&
      s.script.ids.includes("goblin") &&
      s.r() < CERENOVUS_GOBLIN_CHANCE
    ) {
      return { target, role: "goblin" };
    }

    const role =
      target &&
      pick(
        s.script.ids.filter(
          (id) =>
            alignment(id) === "good" &&
            // (Nor the Lunatic, who never knows they are one; nor the
            // Atheist, whom no good player claims falsely.)
            !["drunk", "lunatic", "pixie", "atheist", ...HIDDEN_OUTSIDERS].includes(id) &&
            !own.includes(id) &&
            (!evil || !tokens.has(id)),
        ),
        s.r,
      );

    return target && role ? { target, role } : null;
  }

  // The Pit-Hag turns a good NPC (preferring public information claimers)
  // into an Outsider that isn't in play.
  //
  // At PITHAG_EVIL_CHANCE it instead changes an evil teammate (or the Demon)
  // into a not-in-play character of the same kind: a Minion into another
  // Minion, the Demon into another Demon. (Never the Evil Twin, who needs a
  // twin from setup.)
  pithag(s, p) {
    const tokens = new Set(s.players.flatMap((x) => [x.role, x.shown]));

    if (s.r() < PITHAG_EVIL_CHANCE) {
      const choices = s.players
        .filter(
          (x) =>
            x.alive && !x.human && x.alignment === "evil" && !blind(p, x) && !twinSafe(s, x),
        )
        .map((t) => ({
          target: t,
          roles: s.script.ids.filter(
            (id) =>
              team(id) === team(t.role) &&
              id !== "eviltwin" &&
              // (Nobody can be Lil' Monsta: it isn't a player.)
              id !== "lilmonsta" &&
              // (The Leviathan can't enter play after Day 5: their jinx.)
              !(id === "leviathan" && s.night > 5) &&
              !tokens.has(id),
          ),
        }))
        .filter((c) => c.roles.length);
      const choice = pick(choices, s.r);

      if (choice) {
        return { target: choice.target, role: pick(choice.roles, s.r) };
      }
    }

    // (Never the Lunatic: a Lunatic made mid-game has no Demon or "Minions"
    // to believe in. Nor anyone jinxed with the Pit-Hag never to be in play
    // with her: the Heretic.)
    const role = pick(
      s.script.ids.filter(
        (id) =>
          team(id) === "outsider" &&
          id !== "lunatic" &&
          !exclusiveWith("pithag").includes(id) &&
          !tokens.has(id),
      ),
      s.r,
    );
    const good = untwinned(s, this.others(s, p)).filter(
      (x) => goodTo(p, x) && !isDrunk(x),
    );
    const voices = good.filter(
      (x) =>
        FIRST_NIGHT_INFO.includes(claimHeard(x, p)) ||
        ONGOING_INFO.includes(claimHeard(x, p)),
    );
    const target = this.noted(
      p,
      "pithag",
      pick(this.fresh(p, "pithag", voices.length ? voices : good), s.r),
    );

    return target && role ? { target, role } : null;
  }

  // The Sailor drinks with another living player (never a twin).
  sailor(s, p) {
    return this.noted(
      p,
      "sailor",
      pick(this.fresh(p, "sailor", untwinned(s, this.pickable(s, p))), s.r),
    );
  }

  // The Chambermaid asks about 2 other living players.
  chambermaid(s, p) {
    const pool = this.fresh(p, "chambermaid", this.pickable(s, p));
    const pair =
      pool.length >= 2 ? sample(pool, 2, s.r) : sample(this.pickable(s, p), 2, s.r);

    return pair.length === 2 ? this.noted(p, "chambermaid", pair) : null;
  }

  // The Exorcist chooses someone they suspect, never last night's pick (nor
  // a twin).
  // (Never the human, who is never the Demon; the same for an Exorcist
  // bluffer.)
  exorcist(s, p) {
    const last = p.lastPicks?.exorcist ?? [];
    const all = untwinned(s, this.pickable(s, p)).filter(
      (x) => !x.human && !last.includes(x.id),
    );
    // (An evil bluffer never "chooses" a teammate: that points at them.)
    const others = sideOf(p) === "evil" ? all.filter((x) => !teammate(p, x)) : [];
    const pool = this.fresh(p, "exorcist", others.length ? others : all);

    return this.noted(
      p,
      "exorcist",
      this.suspect(s, p, pool) ?? pick(pool, s.r),
    );
  }

  // The Innkeeper protects 2 other living players, the most important it
  // can (see protectees()); never a twin, as one of them is made drunk.
  innkeeper(s, p) {
    // (Not the human, whom the Demon never attacks.)
    const all = untwinned(s, this.others(s, p));
    const pool = this.fresh(p, "innkeeper", all);
    const options = pool.length >= 2 ? pool : all;
    // The most important first, then anyone else they didn't pick before.
    const first = pick(this.protectees(s, p, options), s.r);
    const second = pick(
      this.protectees(
        s,
        p,
        options.filter((x) => x !== first),
      ),
      s.r,
    );
    const pair = [first, second].filter(Boolean);

    return pair.length === 2 ? this.noted(p, "innkeeper", pair) : null;
  }

  // The Courtier (once per game, timed by ONCE_PER_GAME.courtier) guesses
  // a Demon or Minion character, hoping to make its holder drunk: at
  // COURTIER_CORRECT_CHANCE (good Courtiers only) one that's in play,
  // otherwise one that isn't.
  courtier(s, p) {
    if (!this.onceReady(s, "courtier", s.night)) {
      return null;
    }

    const evil = (id) => ["demon", "minion"].includes(team(id));
    const inPlay = [
      ...new Set(
        s.players.filter((x) => x.alive && evil(x.role)).map((x) => x.role),
      ),
    ];
    const absent = s.script.ids.filter((id) => evil(id) && !inPlay.includes(id));
    const right =
      p.alignment === "good" && s.r() < COURTIER_CORRECT_CHANCE && inPlay;

    return pick(right?.length ? right : absent, s.r) ?? null;
  }

  // The Professor (once per game, timed by ONCE_PER_GAME.professor) brings
  // back a dead player who claimed a Townsfolk, preferring information
  // characters. A Professor bluffer never does (it wouldn't work).
  professor(s, p) {
    const dead = s.players.filter(
      (x) =>
        !x.alive &&
        !x.undead &&
        !x.human &&
        team(claimHeard(x, p)) === "townsfolk",
    );
    const info = dead.filter(
      (x) =>
        FIRST_NIGHT_INFO.includes(claimHeard(x, p)) ||
        ONGOING_INFO.includes(claimHeard(x, p)),
    );

    if (p.alignment === "evil" || !dead.length) {
      return null;
    }

    return this.onceReady(s, "professor", s.night)
      ? pick(info.length ? info : dead, s.r)
      : null;
  }

  // A Professor bluffer (timed like the real one) "chooses" a dead good
  // player who claimed a Townsfolk, to say they stayed dead: those who
  // accused one of their team first, so that accusation is discredited.
  professorBluff(s, p) {
    const dead = s.players.filter(
      (x) =>
        !x.alive &&
        !x.undead &&
        !x.human &&
        x.alignment === "good" &&
        team(claimHeard(x, p)) === "townsfolk",
    );
    const accusers = dead.filter((x) =>
      [...(s.statements ?? []), ...(p.heard ?? [])].some(
        (st) =>
          st.byId === x.id &&
          st.type === "suspicious" &&
          teammate(p, byId(s, st.targetId) ?? {}),
      ),
    );

    if (!dead.length || !this.onceReady(s, "professor", s.night)) {
      return null;
    }

    // (A good player's cover story: only one they strongly suspect.)
    if (sideOf(p) === "good") {
      return this.strongSuspect(s, p, dead);
    }

    return pick(accusers.length ? accusers : dead, s.r);
  }

  // A Gossip says in public that someone they suspect is the Demon, a
  // Minion or evil.
  //
  // At dawn they speak up at GOSSIP_CHANCE; at the end of the day (`late`)
  // any who haven't yet always do.
  gossip(s, p, late = false) {
    if (!late && s.r() >= GOSSIP_CHANCE) {
      return null;
    }

    // (Someone they haven't talked about before, while they suspect anyone
    // else (see fresh()); never just what they said yesterday: a statement
    // the night showed false, or that's done its work, says nothing new.)
    // (A good player pretending to be the Gossip, a face-down Damsel or
    // Mutant or a cover story, speaks about someone they strongly suspect;
    // with nobody, still at the end of the day, about their suspect, as a
    // real Gossip always makes a statement: a silent one gives them away.)
    const choose = (pool) =>
      pretends(p, "gossip")
        ? (this.strongSuspect(s, p, pool) ?? (late ? this.suspect(s, p, pool) : null))
        : this.suspect(s, p, pool);
    const all = this.others(s, p);
    const fresh = this.fresh(p, "gossip", all);
    // (An evil bluffer may as well slander any good player they haven't yet:
    // never a teammate, their Lleech's host, or you.)
    const slander =
      sideOf(p) === "evil"
        ? pick(fresh.filter((x) => goodTo(p, x) && !spares(s, p, x)), s.r)
        : null;
    const target = choose(fresh) ?? slander ?? choose(all);
    if (!target) {
      return null;
    }

    const last = p.gossipLast;
    const questions = ["demon", "minion", "evil"].filter(
      (q) => !(last?.targetId === target.id && last.question === q),
    );
    const question = pick(questions, s.r);

    this.noted(p, "gossip", target);
    p.gossipLast = { targetId: target.id, question };

    return { target, question };
  }

  // The Godfather kills a good NPC, the way the Demon picks.
  godfather(s, p) {
    const good = untwinned(s, this.others(s, p)).filter(
      (x) => goodTo(p, x) && !s.revived?.includes(x.id) && !spares(s, p, x),
    );
    const decoys = good.filter((x) => x.role !== "lunatic");

    return this.byPriority(s, p, decoys.length ? decoys : good);
  }

  // The Ogre (on their first night) joins the team of someone they don't
  // suspect: anyone but their hunch.
  ogre(s, p) {
    const pool = this.others(s, p);
    const trusted = pool.filter((x) => x.id !== p.suspicion?.targetId);

    return pick(trusted.length ? trusted : pool, s.r);
  }

  // The Lunatic "kills" like a Demon: any other NPC but a twin, by priority.
  lunatic(s, p) {
    return this.byPriority(
      s,
      p,
      untwinned(s, this.others(s, p)).filter((x) => !teammate(p, x)),
    );
  }

  // Night info an evil NPC reports for their bluff (true only for the Spy).
  bluff(s, p) {
    return bluffTonight(s, p, this);
  }
}
