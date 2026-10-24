import {
  ROLES,
  name,
  team,
  alignment,
  ARTIST_QUESTIONS,
  FIRST_NIGHT_INFO,
  ONGOING_INFO,
  DEMON_KILL_PRIORITY,
  KILL_PRIORITY_CHANCE,
  DEMON_STAR_PASS_CHANCE,
  GAMBLER_WILD_GUESS_CHANCE,
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
} from "./data.js";
import {
  ability,
  bluffInfo,
  madInfo,
  steer,
  evilTwinInfo,
  scapegoat,
  isDrunk,
  isDemon,
  atFinal,
  works,
  bluffing,
} from "./storyteller.js";
import { byId, pick, sample, claimTo, claimHeard, tick } from "./util.js";
import {
  AMNESIAC_ABILITIES,
  AMNESIAC_GUESSES,
} from "./characters/townsfolk/amnesiac.js";

export { claimTo, claimHeard, tick };

const human = (s) => s.players.find((x) => x.human);

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
// believe in (the "Minions" they were shown), though they're good.
const thinksEvil = (p) => p.role === "lunatic" && !p.human;

// The Marionette and an Ogre don't know they're evil: they play as good.
// (Unless the Demon has told the Marionette.)
const thinksGood = (p) =>
  ["marionette", "ogre"].includes(p.role) && !p.human && !p.toldEvil;

// The team p plays for.
export const sideOf = (p) =>
  thinksEvil(p) ? "evil" : thinksGood(p) ? "good" : p.alignment;

// Whether p (playing for evil) counts x as a teammate.
const teammate = (p, x) =>
  thinksEvil(p)
    ? (p.lunaticTeam ?? []).includes(x.id)
    : x.alignment === "evil";

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
    philosopher: p.gained ?? p.bluffGained,
    virgin: p.virginUsed,
    fool: p.foolUsed,
    courtier: p.courtierUsed,
    professor: p.professorUsed,
    assassin: p.assassinUsed,
  };

  return role in used ? Boolean(used[role]) : null;
}

// One of the Evil Twin pair (good or evil).
export const isTwin = (s, x) =>
  Boolean(s.twins) && [s.twins.evilId, s.twins.goodId].includes(x.id);

// `pool` without either twin. Nothing harmful ever targets a twin: no kill,
// poison, drunkenness, curse, madness or change of character.
export const untwinned = (s, pool) => pool.filter((x) => !isTwin(s, x));

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

  if (rest.startsWith(" number: ")) {
    return `My number is ${rest.slice(" number: ".length)}`;
  }

  const said = rest
    .slice(2)
    .replace(/^(chose|protected|guessed|asked|gained|said) /, "I $1 ")
    .replace(/^shown /, "I was shown ")
    .replace(/^your /, "my ")
    .replace(/ is your /, " is my ");

  return said.charAt(0).toUpperCase() + said.slice(1);
}

const ROLE_BY_NAME = new Map(Object.keys(ROLES).map((id) => [name(id), id]));

// Whether a piece of information makes its owner trust ("trust") or suspect
// ("suspicious") the players it names, or says nothing either way (null).
function infoStance(m) {
  const t = m.text;

  switch (m.role) {
    case "fortuneteller":
      return /: YES for/.test(t) ? "suspicious" : "trust";
    case "empath":
      return /number: 0\./.test(t) ? "trust" : "suspicious";
    case "investigator":
    case "sage":
    case "eviltwin":
    case "lunatic":
    case "noble":
      return "suspicious";
    case "professor":
      return /, who stayed dead\.$/.test(t) ? "suspicious" : null;
    // A Moonchild whose pick didn't die: maybe evil.
    case "moonchild":
      return /, who didn't die\.$/.test(t) ? "suspicious" : null;
    case "exorcist":
    // (The Demon a Puzzlemaster learned; the Fisherman's evil player, or
    // the 3 the Demon is among.)
    case "puzzlemaster":
      return "suspicious";
    case "fisherman":
      return / is good: /.test(t)
        ? "trust"
        : / is evil\.$|The Demon is one of /.test(t)
          ? "suspicious"
          : null;
    // A Gambler who died guessing knows they were wrong.
    case "gambler":
      return /, and died\.$/.test(t) ? "suspicious" : "trust";
    case "washerwoman":
    case "grandmother":
      return "trust";
    // Only once the Amnesiac knows what their information means (see
    // AMNESIAC_ABILITIES).
    case "amnesiac":
      return !m.known
        ? null
        : m.amnesiac === "neighbours"
          ? /: YES\.$/.test(t)
            ? "suspicious"
            : "trust"
          : m.amnesiac === "goodplayer"
            ? "trust"
            : "suspicious";
    // Their own pick (who to protect, or their master) tells them nothing.
    case "monk":
    case "butler":
    case "innkeeper":
      return null;
    case "gossip":
      return / is (evil|the Demon|a Minion)\.$/.test(t)
        ? "suspicious"
        : / is a Townsfolk\.$/.test(t)
          ? "trust"
          : null;
    case "artist": {
      const yes = /: YES\.$/.test(t);

      if (/ is (evil|the Demon|a Minion):/.test(t)) {
        return yes ? "suspicious" : "trust";
      }

      return / is a Townsfolk:/.test(t) ? (yes ? "trust" : "suspicious") : null;
    }
    case "ravenkeeper": {
      const seen = ROLE_BY_NAME.get(t.match(/ is (.+)\.$/)?.[1]);

      return seen && alignment(seen) === "evil" ? "suspicious" : "trust";
    }
    default:
      return null;
  }
}


const PAIR_ROLES = ["washerwoman", "librarian", "investigator"];

// The characters a piece of information says a player is (or might be): a
// Ravenkeeper's or Grandmother's one, a Dreamer's two, or the character one
// of a Washerwoman's, Librarian's or Investigator's pair is.
function namedCharacters(m) {
  const get = (re) =>
    (m.text.match(re)?.slice(1) ?? [])
      .map((x) => ROLE_BY_NAME.get(x))
      .filter(Boolean);

  switch (m.role) {
    case "ravenkeeper":
      return get(/ is (.+)\.$/);
    case "grandmother":
      return get(/, the (.+)\.$/);
    case "dreamer":
      return get(/ is the (.+) or the (.+)\.$/);
    case "washerwoman":
    case "librarian":
    case "investigator":
      return get(/ is (?:the )?(.+)\.$/);
    default:
      return [];
  }
}

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

  if (PAIR_ROLES.includes(m.role)) {
    const other = byId(
      s,
      m.targets.find((id) => id !== t.id),
    );
    const otherClaim = other && claimTo(other, viewer);

    if (roles.includes(claim)) {
      return m.role === "investigator" ? "suspicious" : "trust";
    }

    if (roles.includes(otherClaim)) {
      return null;
    }

    return otherClaim ? "suspicious" : infoStance(m);
  }

  if (m.role === "dreamer") {
    return roles.includes(claim) ? null : "suspicious";
  }

  return roles.includes(claim) ? "trust" : "suspicious";
}

// What p's information m says against t's claim, as a reason to suspect
// them (null if it doesn't contradict it).
function contradiction(m, t, p) {
  const roles = namedCharacters(m);
  const claim = claimTo(t, p);

  if (!roles.length || !claim || roles.includes(claim) || PAIR_ROLES.includes(m.role)) {
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
// human: you weigh it yourself.)
export function heard(s, p, memories, opinion = null, to = null) {
  if (to?.human) {
    return;
  }

  const list = to ? (to.heard ??= []) : (s.statements ??= []);
  const say = (type, targetId, source) => {
    if (["trust", "suspicious"].includes(type) && targetId && targetId !== p.id) {
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
    // confirmed good, if there's anyone else: it wouldn't stick.)
    const unconfirmed = pool.filter((x) => !sure(s).includes(x.id));
    const outside = (unconfirmed.length ? unconfirmed : pool).filter(
      (x) => !teammate(p, x),
    );
    const untwinnedOutside = untwinned(s, outside);
    const good = untwinnedOutside.length ? untwinnedOutside : outside;
    const rival = good.find(
      (x) => claimTo(x, p) === p.claim && !isTwin(s, x),
    );

    if (rival) {
      return rival;
    }

    if (thinksEvil(p)) {
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

    if (sideOf(p) === "good") {
      target = this.suspect(s, p, this.others(s, p));
    } else {
      const current = byId(s, p.suspicion?.targetId);
      const newDay = p.suspicion?.day !== s.day;
      const stale = !current?.alive || current.human || teammate(p, current);
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
  evidence(s, p, t) {
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

    if (claim && !twins(p, t)) {
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
        t.cameClean ? W.changedStoryCleared : W.changedStory,
        `they told me they're the ${name(told.claim)}, but they've also said the ${name(other)}`,
      );
    }

    // Passed on to p (see told()): someone says t told them otherwise
    // (unless that was a cover story t has since come clean about)...
    const passed = p.secondHand?.[t.id];
    const by = passed && byId(s, passed.fromId);

    if (
      by &&
      claim &&
      passed.claim !== claim &&
      passed.claim !== t.cameClean?.from &&
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
        x.claim !== about.cameClean?.from
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
        add(
          trust ? W.vouchedByInfo : W.namedByInfo,
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

    for (const x of strongest.values()) {
      add(x.weight, x.text);
    }

    // You nominated them (see humanTrusted).
    for (const v of s.voteHistory ?? []) {
      if (v.nomineeId === t.id && byId(s, v.nominatorId)?.human) {
        add(W.humanTrusted, "you nominated them");
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
    const from = claim === "cannibal" && byId(s, p.cannibalFrom);

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

    const hidden = [p.role, p.bluff].find((x) => HIDDEN_OUTSIDERS.includes(x));

    if (hidden) {
      return hidden;
    }

    return (p.role === "pixie" || p.bluff === "pixie") &&
      p.pixieMad &&
      !p.gained &&
      !p.bluffGained
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
  unusedAbility(p) {
    return p.alive && abilityUsed(p, p.claim) === false
      ? `I haven't used my ${name(p.claim)} ability yet.`
      : null;
  }

  // A mad Pixie (until they gain the ability) answers as the character
  // they're mad about, with made-up information to match (made up afresh
  // each day).
  pixieMad(s, p) {
    if (!p.pixieMad || p.gained || p.bluffGained || !p.alive) {
      return null;
    }

    if (p.pixieDay !== s.day) {
      p.pixieDay = s.day;
      p.pixieMemories = madInfo(s, p, p.pixieRole, this);
    }

    return { role: p.pixieRole, memories: p.pixieMemories };
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
          memories: twin.memories.map((m) =>
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
  // truthTo()), with made-up information to match (see coverInfo()):
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
        : p.memories;
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

    const kind =
      DEMON_KILL_PRIORITY[p.claim] === "high" && !HIDE_NEVER.includes(p.claim)
        ? s.r() < HIDE_CHANCE && "hide"
        : BAIT_ROLES.includes(p.claim)
          ? s.r() < BAIT_CHANCE && "bait"
          : null;

    if (!kind) {
      return null;
    }

    const used = new Set([
      ...s.players.flatMap((x) => [x.role, x.shown, x.claim]),
      ...(s.demonBluffs ?? []),
    ]);
    const fits = (id) => {
      const level = DEMON_KILL_PRIORITY[id] ?? "low";

      return kind === "hide"
        ? ["low", "avoid"].includes(level) && !HIDE_NEVER_AS.includes(id)
        : level === "high" && !HIDE_NEVER.includes(id);
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

  // A cover story's made-up information for the cover character, kept from
  // day to day: tonight's is added each morning (none for a character with
  // nothing to learn).
  coverInfo(s, p) {
    const c = p.cover;
    const fresh = madInfo(s, p, c.as, this).filter(
      (m) => !c.memories || (m.night === s.night && !m.day),
    );

    c.memories = [...(c.memories ?? []), ...fresh];
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
    } else if (!mad && p.alignment === "evil" && a.claim !== p.role) {
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

    return [
      `I claim ${name(a.claim)}.`,
      ...changes.map(
        (c) =>
          `I woke up as the ${name(c.to)} on Night ${c.night}; before that I was the ${name(c.from)}.`,
      ),
      twin && `${twin.label} is my twin, and I am the good twin.`,
      !mad && !hidden && this.cannibalLine(s, p, a.claim),
      !mad &&
        !hidden &&
        a.claim === "pixie" &&
        (p.gained ?? p.bluffGained) &&
        `I have the ${name(p.gained ?? p.bluffGained)} ability.`,
      details,
      this.courtierLine(s, memories),
      !mad && !hidden && this.unusedAbility(copy ? copy.twin : p),
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

    const sus = this.suspicion(s, p);
    const t = sus && byId(s, sus.targetId);

    return t?.alive && !t.human && sus.score >= NPC_NOMINATE_EVIDENCE
      ? { target: t, score: sus.score, reasons: p.suspicion.reasons }
      : null;
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
  // nominated), whatever they think of them.
  vote(s, v, n, tally = null) {
    if (tally?.humanChoice && atFinal(s) && sideOf(v) !== "evil") {
      return true;
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

      if (!teammate(v, n)) {
        return s.r() < EVIL_VOTE_CHANCE;
      }

      const harmless =
        tally && (tally.yes >= tally.needed || tally.yes + 1 < tally.needed);

      return Boolean(harmless) && s.r() < EVIL_TEAMMATE_VOTE_CHANCE;
    }

    const o = this.opinion(s, v);
    const about = o.targetId === n.id ? o.type : null;

    if (about === "suspicious") {
      return s.r() < GOOD_VOTE_MAX;
    }

    if (about === "trust" || this.trusted(s, v).has(n.id)) {
      return s.r() < GOOD_VOTE_MIN;
    }

    // Your nomination counts as evidence too (humanTrusted), on top of
    // HUMAN_NOMINATION_BONUS.
    const yours = tally?.nominator?.human;
    const chance =
      GOOD_VOTE_CHANCE +
      GOOD_VOTE_EVIDENCE_STEP *
        (this.evidence(s, v, n).score +
          (yours ? EVIDENCE_WEIGHT.humanTrusted : 0)) +
      (yours ? HUMAN_NOMINATION_BONUS : 0);

    return s.r() < Math.min(GOOD_VOTE_MAX, Math.max(GOOD_VOTE_MIN, chance));
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
  // running), and can also be picked like anyone else.
  poison(s, p = null) {
    const good = untwinned(
      s,
      s.players.filter((x) => x.alive && x.alignment === "good"),
    );
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
  huntsman(s, p) {
    const evil = sideOf(p) === "evil";
    const pool = this.pickable(s, p);
    const told = pool.find((x) => claimHeard(x, p) === "damsel");

    if (told && !evil) {
      return told;
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

    return pick(quiet.length ? quiet : pool, s.r);
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
  damselGuess(s, p) {
    if (
      !s.damselKnown ||
      s.damselJinx ||
      s.damselGone ||
      p.damselGuessed ||
      sideOf(p) !== "evil"
    ) {
      return null;
    }

    const missed = (s.damselGuesses ?? []).map((g) => g.targetId);
    const pool = s.players.filter(
      (x) => x.alive && x !== p && !teammate(p, x) && !missed.includes(x.id),
    );
    // (What the team's Huntsman bluffer was told in private: the real thing.)
    const team_ = [p, ...s.players.filter((x) => x !== p && teammate(p, x))];
    const found = pool.find((x) =>
      team_.some((m) => m.claim === "huntsman" && m.toldMe?.[x.id]?.claim === "damsel"),
    );

    if (found) {
      return found;
    }

    const claimed = pool.filter((x) => claimHeard(x, p) === "damsel");

    if (claimed.length && s.r() < DAMSEL_CLAIM_CHANCE) {
      return pick(claimed, s.r);
    }

    const bluffs = p.bluffs?.length ? p.bluffs : (s.demonBluffs ?? []);
    const hiders = pool.filter((x) => bluffs.includes(claimHeard(x, p)));

    if (hiders.length && s.r() < DAMSEL_HIDER_CHANCE) {
      return pick(hiders, s.r);
    }

    if (
      s.players.filter((x) => x.alive).length > DAMSEL_GUESS_ALIVE ||
      s.r() >= DAMSEL_GUESS_CHANCE
    ) {
      return null;
    }

    const open = pool.filter((x) => !sure(s).includes(x.id));
    const options = open.length ? open : pool;
    const outsiders = options.filter((x) => team(claimHeard(x, p)) === "outsider");

    return pick(outsiders.length ? outsiders : options, s.r);
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

    const good = options.filter((x) => !teammate(p, x));
    const most = Math.max(0, ...good.map((x) => counts[x.id] ?? 0));
    const top = good.filter((x) => (counts[x.id] ?? 0) === most);

    return pick(top.length ? top : options, s.r);
  }

  // The Widow (who has seen the Grimoire) poisons a good NPC with ongoing
  // information, for the rest of the game; you at HUMAN_POISON_CHANCE.
  widow(s, p) {
    const good = untwinned(
      s,
      s.players.filter((x) => x.alive && x.alignment === "good"),
    );
    // (Never herself: she's evil, but a Widow is never her own pick.)
    const npcs = good.filter((x) => !x.human && x !== p);
    const info = npcs.filter((x) => ONGOING_INFO.includes(ability(x)));
    const human = good.find((x) => x.human);

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

    // Neither twin is ever the Demon's kill, nor anyone who came back to
    // life tonight (they can't die again).
    const pool = this.others(s, p).filter(
      (x) =>
        !isTwin(s, x) && !exclude.includes(x) && !s.revived?.includes(x.id),
    );
    const decoys = pool.filter(
      (x) => x.role !== "lunatic" && !p.foiled?.includes(x.id),
    );
    const options = decoys.length ? decoys : pool;
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

    // (Hiding the Spy: someone it wouldn't have known to go after.)
    const cover = this.spyWorks(s, p)
      ? options.filter(
          (x) =>
            x.alignment === "good" &&
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

    return because(t, why);
  }

  // Why player x has the kill priority they have to evil player p (see
  // priorityLevel()), for the log.
  levelSource(s, x, p) {
    const claim = claimHeard(x, p);

    if (p.role === "vigormortis" && team(x.role) === "minion") {
      return "a Minion it kills keeps their ability";
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
    return (
      p.alignment === "evil" &&
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
    return this.spyWorks(s, p)
      ? x.role
      : p.alignment === "evil"
        ? (s.widowGrimoire?.[x.id] ?? null)
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

    if (x.alignment !== "evil") {
      // (A good player the town is sure of can't be framed: kill them first.)
      if (sure(s).includes(x.id)) {
        return "top";
      }

      const seen = this.seenRole(s, x, p);

      return seen ? (DEMON_KILL_PRIORITY[seen] ?? "low") : claimLevel;
    }

    const rank = ["avoid", "low", "med", "high"];
    const own = DEMON_KILL_PRIORITY[x.role] ?? "avoid";

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

    const good = pool.filter((x) => x.alignment === "good");
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
  raven(s, p) {
    const goat = p.alignment === "evil" ? scapegoat(s) : null;

    return goat?.alive && goat !== p ? goat : pick(this.pickable(s, p), s.r);
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
  slay(s, p) {
    if (!this.onceReady(s, "slayer", s.day)) {
      return null;
    }

    return this.suspect(
      s,
      p,
      this.others(s, p),
    );
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
  // is the character that player claimed (see claimHeard()), which kills
  // them if it's a lie. At GAMBLER_WILD_GUESS_CHANCE they follow a hunch
  // instead: their suspect is a Demon or Minion on the script. With no claim
  // to go on, they guess themselves (`self`), which is safe and learns
  // nothing. A wrong guess kills a working Gambler. (A Gambler bluffer, or a
  // cover story, guesses the same way.)
  gamble(s, p) {
    const pool = this.pickable(s, p);
    const suspect = pool.find((x) => x.id === p.suspicion?.targetId);
    const evil = s.script.ids.filter((id) => alignment(id) === "evil");

    if (suspect && evil.length && s.r() < GAMBLER_WILD_GUESS_CHANCE) {
      this.noted(p, "gamble", suspect);

      return { target: suspect, role: pick(evil, s.r), told: false };
    }

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
        !s.dayNominators.includes(x.id),
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

    // (Never the Lunatic, the evil team's decoy.)
    return pick(
      untwinned(
        s,
        s.players.filter(
          (x) =>
            x.alive && !x.human && x.alignment === "good" && x.role !== "lunatic",
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
  // compares someone they suspect with another player.
  seamstress(s, p) {
    if (!this.onceReady(s, "seamstress", s.night)) {
      return null;
    }

    const a = this.suspect(s, p, this.others(s, p));
    const b = pick(
      this.others(s, p).filter((x) => x !== a),
      s.r,
    );

    return a && b ? [a, b] : null;
  }

  // The Philosopher (once per game, timed by ONCE_PER_GAME.philosopher) gains
  // an ongoing information ability not in play (so nobody is made drunk), or
  // else any other good character.
  philosopher(s, p) {
    if (!this.onceReady(s, "philosopher", s.night)) {
      return null;
    }

    const inPlay = new Set(s.players.map((x) => x.role));
    const good = s.script.ids.filter(
      (id) => alignment(id) === "good" && id !== "philosopher",
    );
    const fresh = good.filter(
      (id) => ONGOING_INFO.includes(id) && !inPlay.has(id),
    );

    return pick(fresh.length ? fresh : good, s.r);
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
        ...(s.demonBluffs ?? []),
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

    if (p.alignment === "evil") {
      return (
        pick(
          living.filter((x) => x.alignment === "good"),
          s.r,
        ) ?? pick(living, s.r)
      );
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

    return (
      pick(believed, s.r) ?? pick(unsuspected, s.r) ?? pick(living, s.r)
    );
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
  barber(s) {
    const good = s.players.filter(
      (x) =>
        x.alive &&
        !x.human &&
        x.alignment === "good" &&
        !isDrunk(x) &&
        !isDemon(x) &&
        !isTwin(s, x),
    );

    return good.length >= 2 ? sample(good, 2, s.r) : null;
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
      !isTwin(s, human) &&
      s.night > 1 &&
      s.r() < WITCH_HUMAN_CHANCE
    ) {
      return this.noted(p, "witch", human);
    }

    const good = untwinned(
      s,
      this.others(s, p).filter((x) => x.alignment === "good"),
    );

    return this.noted(p, "witch", pick(this.fresh(p, "witch", good), s.r));
  }

  // The Cerenovus makes a good NPC "mad" about another good character.
  // The Cerenovus picks a good NPC the way the Demon picks its kills, and
  // makes them mad about a good character that isn't who they are (their
  // true character, the one they think they are, or their claim; never the
  // Drunk).
  //
  // At CERENOVUS_EVIL_CHANCE it instead makes an evil teammate mad about a
  // good character that isn't in play: a fresh bluff for a day, after which
  // they go back to their old one.
  cerenovus(s, p) {
    const others = untwinned(s, this.others(s, p));
    const teammates = others.filter((x) => x.alignment === "evil");
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
              others.filter((x) => x.alignment === "good"),
            ),
          ),
    );
    const own = target && [target.role, ability(target), target.claim];
    const tokens = new Set(s.players.flatMap((x) => [x.role, x.shown]));
    const role =
      target &&
      pick(
        s.script.ids.filter(
          (id) =>
            alignment(id) === "good" &&
            !["drunk", ...HIDDEN_OUTSIDERS].includes(id) &&
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
          (x) => x.alive && !x.human && x.alignment === "evil" && !isTwin(s, x),
        )
        .map((t) => ({
          target: t,
          roles: s.script.ids.filter(
            (id) =>
              team(id) === team(t.role) &&
              id !== "eviltwin" &&
              !tokens.has(id),
          ),
        }))
        .filter((c) => c.roles.length);
      const choice = pick(choices, s.r);

      if (choice) {
        return { target: choice.target, role: pick(choice.roles, s.r) };
      }
    }

    const role = pick(
      s.script.ids.filter((id) => team(id) === "outsider" && !tokens.has(id)),
      s.r,
    );
    const good = untwinned(s, this.others(s, p)).filter(
      (x) => x.alignment === "good" && !isDrunk(x),
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
    const pool = this.fresh(
      p,
      "exorcist",
      untwinned(s, this.pickable(s, p)).filter(
        (x) => !x.human && !last.includes(x.id),
      ),
    );

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

    const target = this.suspect(s, p, this.others(s, p));

    return target
      ? { target, question: pick(["demon", "minion", "evil"], s.r) }
      : null;
  }

  // The Godfather kills a good NPC, the way the Demon picks.
  godfather(s, p) {
    const good = untwinned(s, this.others(s, p)).filter(
      (x) => x.alignment === "good" && !s.revived?.includes(x.id),
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
    return bluffInfo(s, p, this);
  }
}
