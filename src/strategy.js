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
  HUMAN_POISON_CHANCE,
  GOSSIP_CHANCE,
  PO_CHARGE_CHANCE,
  LUNATIC_FOLLOW_CHANCE,
} from "./data.js";
import {
  ability,
  bluffInfo,
  evilTwinInfo,
  scapegoat,
  isDrunk,
  isDemon,
} from "./storyteller.js";
import { byId, pick, sample } from "./util.js";

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
      return "suspicious";
    case "exorcist":
      return "suspicious";
    case "washerwoman":
    case "grandmother":
    case "monk":
    case "butler":
    case "gambler":
    case "innkeeper":
      return "trust";
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

// A player's character as last claimed in public (null if they haven't, or
// for the human, who never claims).
const publicClaim = (x) =>
  x.claimKnown && !x.human ? (x.publicClaim ?? x.claim) : null;

// Public evidence at least this strong outweighs a good NPC's own
// information when they give their opinion (see opinion()).
const STRONG_EVIDENCE = 3;

// Records what p just said in public (information naming players, and their
// opinion), so good NPCs can weigh it (see evidence()).
export function heard(s, p, memories, opinion = null) {
  s.statements ??= [];

  const say = (type, targetId, source) => {
    if (["trust", "suspicious"].includes(type) && targetId && targetId !== p.id) {
      s.statements.push({ byId: p.id, day: s.day, type, targetId, source });
    }
  };

  for (const m of memories) {
    for (const id of m.targets ?? []) {
      say(infoStance(m), id, "info");
    }
  }

  if (opinion) {
    say(opinion.type, opinion.targetId, "opinion");
  }
}

// What's been said in public about t: each speaker's information about t
// (once per speaker and stance), and each speaker's latest opinion if it
// was about t.
function heardAbout(s, t) {
  const info = new Map();
  const latest = new Map();

  for (const st of s.statements ?? []) {
    if (st.source === "opinion") {
      latest.set(st.byId, st);
    } else if (st.targetId === t.id) {
      info.set(`${st.byId}:${st.type}`, st);
    }
  }

  return [
    ...info.values(),
    ...[...latest.values()].filter((st) => st.targetId === t.id),
  ];
}

export class SimpleStrategy {
  // Who in `pool` p suspects.
  //
  // Good NPCs can't see alignments: they go on what they've seen in public
  // (see evidence()), never suspecting a player their own information
  // vouches for. With nothing to go on, they keep their hunch, or pick one.
  //
  // Evil NPCs always point at good players: first anyone claiming their own
  // character (they have to), then mostly the team's shared scapegoat.
  suspect(s, p, pool) {
    if (p.alignment === "good") {
      return this.reasoned(s, p, pool);
    }

    const good = pool.filter((x) => x.alignment === "good");
    const rival = good.find(
      (x) => publicClaim(x) === p.claim && !isTwin(s, x),
    );

    if (rival) {
      return rival;
    }

    const goat = scapegoat(s);

    if (good.includes(goat) && s.r() < SCAPEGOAT_CHANCE) {
      return goat;
    }

    return pick(good, s.r);
  }

  // A good NPC's suspect in `pool`: the player with the most evidence
  // against them, if it's at least EVIDENCE_TO_SUSPECT (keeping their
  // current suspect on a tie), else their current hunch, else anyone they
  // don't trust.
  reasoned(s, p, pool) {
    const trusted = this.trusted(p);
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

    if (p.alignment === "good") {
      target = this.suspect(s, p, this.others(s, p));
    } else {
      const current = byId(s, p.suspicion?.targetId);
      const newDay = p.suspicion?.day !== s.day;
      const stale =
        !current?.alive || current.human || current.alignment === "evil";
      const move = stale || (newDay && s.r() < 0.35);

      target = move ? this.suspect(s, p, this.others(s, p)) : current;
    }

    const why = target ? this.evidence(s, p, target) : null;

    if (!target) {
      return null;
    }

    p.suspicion = { targetId: target.id, day: s.day };

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

  // The players p's own information vouches for.
  trusted(p) {
    return new Set(
      p.memories
        .filter((m) => infoStance(m) === "trust")
        .flatMap((m) => m.targets ?? []),
    );
  }

  // What p has seen in public that makes them suspect t (or trust them),
  // weighed by EVIDENCE_WEIGHT in data.js: their own claim against t's,
  // double claims, what players said (and whether they then died in the
  // night), and who nominated or voted for whom. Returns the total `score`
  // and up to two `reasons` against t, strongest first.
  evidence(s, p, t) {
    const W = EVIDENCE_WEIGHT;
    const found = [];
    const add = (weight, text) => found.push({ weight, text });
    const twins = (a, b) => isTwin(s, a) && isTwin(s, b);
    const claim = publicClaim(t);

    if (claim && !twins(p, t)) {
      if (claim === p.claim) {
        add(
          W.claimsMyCharacter,
          `they claim the ${name(claim)}, but I'm the ${name(claim)}`,
        );
      }

      for (const x of s.players) {
        if (x !== t && x !== p && publicClaim(x) === claim && !twins(x, t)) {
          add(
            W.doubleClaim,
            `they and ${x.label} both claim the ${name(claim)}`,
          );
        }
      }
    }

    for (const st of heardAbout(s, t)) {
      const by = byId(s, st.byId);
      const trust = st.type === "trust";

      if (!by || by === p) {
        continue;
      }

      if (by.diedAtNight) {
        add(
          trust ? W.trustedByNightDeath : W.accusedByNightDeath,
          `${by.label} ${
            trust ? "trusted" : "was suspicious of"
          } them, then died in the night`,
        );
      } else if (st.source === "info") {
        add(
          trust ? W.vouchedByInfo : W.namedByInfo,
          `${by.label}'s information ${
            trust ? "vouches for" : "points at"
          } them`,
        );
      } else {
        add(
          trust ? W.trusted : W.accused,
          `${by.label} ${trust ? "trusts" : "is suspicious of"} them`,
        );
      }
    }

    const trusted = this.trusted(p);

    for (const v of s.voteHistory ?? []) {
      const n = byId(s, v.nomineeId);

      if (!n || n === t) {
        continue;
      }

      if (trusted.has(n.id) && v.nominatorId === t.id) {
        add(W.nominatedTrusted, `they nominated ${n.label}, whom I trust`);
      } else if (trusted.has(n.id) && v.voterIds.includes(t.id)) {
        add(W.votedTrusted, `they voted for ${n.label}, whom I trust`);
      } else if (n.diedAtNight && v.nominatorId === t.id) {
        add(
          W.nominatedNightDeath,
          `they nominated ${n.label}, who later died in the night`,
        );
      }
    }

    return {
      score: found.reduce((n, x) => n + x.weight, 0),
      reasons: found
        .filter((x) => x.weight > 0)
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

  // Once dead, the Mutant (no longer at risk of execution) can claim to be
  // the Mutant, and so can an evil player who took the Mutant bluff. Other
  // evil players stick to their bluffs.
  revealsWhenDead(p) {
    return !p.alive && (p.role === "mutant" || p.bluff === "mutant");
  }

  // "I haven't used my X ability yet." for a living NPC whose claimed
  // character has a once-per-game ability they (say they) haven't used.
  unusedAbility(p) {
    const used = {
      slayer: p.shotUsed,
      artist: p.artistUsed,
      seamstress: p.seamUsed,
      juggler: p.juggled,
      philosopher: p.gained ?? p.bluffGained,
      virgin: p.virginUsed,
      fool: p.foolUsed,
      courtier: p.courtierUsed,
      professor: p.professorUsed,
    };

    return p.alive && p.claim in used && !used[p.claim]
      ? `I haven't used my ${name(p.claim)} ability yet.`
      : null;
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
          memories: twin.memories.map((m) =>
            m.role === "eviltwin" ? { ...m, text: evilTwinInfo(s, twin).text } : m,
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
    const goat = p.alignment === "evil" ? scapegoat(s) : null;

    for (const m of [...p.memories].reverse()) {
      const type = infoStance(m);
      const named = (m.targets ?? [])
        .map((id) => byId(s, id))
        .filter((x) => x?.alive && !x.human && x.id !== p.id);

      if (!type || !named.length) {
        continue;
      }

      const preferred =
        p.alignment === "evil"
          ? named.filter((x) =>
              type === "trust" ? x.alignment === "evil" : x === goat,
            )
          : [];
      const target = pick(preferred.length ? preferred : named, s.r);
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

  // Good NPCs share what they learned; evil NPCs share their bluffed info.
  // Each night's (or day's) information goes on its own line, followed by
  // their opinion.
  //
  // An NPC the Cerenovus made "mad" claims that character instead, with
  // made-up information to match (and an opinion drawn from it).
  //
  // The Evil Twin answers exactly as their good twin does (see twinCopy()).
  ask(s, p) {
    const mad = p.mad?.day === s.day ? p.mad : null;
    const copy = !mad && this.twinCopy(s, p);
    const memories = mad
      ? (mad.memories ?? [])
      : copy
        ? copy.memories
        : p.memories;
    const info = memories.map(
      (x) => `${x.day ? `Day ${x.day}` : `Night ${x.night}`}: ${speak(x.text)}`,
    );
    const details = info.length
      ? info.join("\n")
      : "I have no stored information.";
    const opinion = mad
      ? (this.infoOpinion(s, { ...p, memories }) ?? {
          text: "I have nothing else to add.",
        })
      : this.opinion(s, p);

    heard(s, p, memories, opinion);

    // What they said, for the Claims table.
    p.answer = { day: s.day, info, opinion: opinion.text };

    // Both twins insist they're the good one.
    const twin = !mad && this.twinOf(s, p);

    // A good NPC who woke up as a new character says so (once).
    const changes =
      !mad && p.alignment === "good"
        ? (p.changes ?? []).filter((c) => !c.told)
        : [];

    for (const c of changes) {
      c.told = true;
    }

    return [
      `I claim ${name(mad ? mad.role : p.claim)}.`,
      ...changes.map(
        (c) =>
          `I woke up as the ${name(c.to)} on Night ${c.night}; before that I was the ${name(c.from)}.`,
      ),
      twin && `${twin.label} is my twin, and I am the good twin.`,
      details,
      !mad && this.unusedAbility(copy ? copy.twin : p),
      opinion.text,
    ]
      .filter(Boolean)
      .join("\n");
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
  // data.js). A dead good player has one vote left: they save it for a
  // nominee they are suspicious of.
  vote(s, v, n, tally = null) {
    if (v.alignment === "evil") {
      if (n.alignment !== "evil") {
        return s.r() < EVIL_VOTE_CHANCE;
      }

      const harmless =
        tally && (tally.yes >= tally.needed || tally.yes + 1 < tally.needed);

      return Boolean(harmless) && s.r() < EVIL_TEAMMATE_VOTE_CHANCE;
    }

    const o = this.opinion(s, v);
    const about = o.targetId === n.id ? o.type : null;

    if (!v.alive) {
      return about === "suspicious";
    }

    if (about === "suspicious") {
      return s.r() < GOOD_VOTE_MAX;
    }

    if (about === "trust" || this.trusted(v).has(n.id)) {
      return s.r() < GOOD_VOTE_MIN;
    }

    const chance =
      GOOD_VOTE_CHANCE +
      GOOD_VOTE_EVIDENCE_STEP * this.evidence(s, v, n).score +
      (tally?.nominator?.human ? HUMAN_NOMINATION_BONUS : 0);

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

  // The part of `pool` p didn't pick last time for this ability (`key`), so
  // picks don't repeat night after night; all of `pool` if that's everyone.
  fresh(p, key, pool) {
    const last = p.lastPicks?.[key] ?? [];
    const fresh = pool.filter((x) => !last.includes(x.id));

    return fresh.length ? fresh : pool;
  }

  // Records p's pick(s) for `key` (see fresh()) and returns them.
  noted(p, key, picks) {
    const list = [].concat(picks ?? []).filter(Boolean);

    p.lastPicks = { ...p.lastPicks, [key]: list.map((x) => x.id) };

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

  monk(s, p) {
    return this.noted(
      p,
      "monk",
      pick(this.fresh(p, "monk", this.others(s, p)), s.r),
    );
  }

  // The Demon kills with purpose (see DEMON_* and KILL_PRIORITY_* in data.js):
  // - after being nominated (and surviving), it may kill itself so a Minion
  //   takes over;
  // - otherwise it works down its kill priorities: good NPCs by the
  //   character they've publicly claimed, its own Minions by their true
  //   character, raised to their public bluff's level if that bluff is
  //   "med" or "high" (killing a "confirmed" info role makes good cover). A
  //   Minion it avoids stays avoided. If no priority fires, it attacks a good
  //   NPC it isn't avoiding; with no good NPC left, any random NPC.
  //
  // `exclude`: players it can't pick (already chosen tonight, or the Pukka's
  // last victim). It steers clear of players its attack bounced off before
  // (while it has anyone else to pick) and goes after whoever protected
  // them (the Monk, Innkeeper or Tea Lady), keeps the Lunatic alive as a decoy, kills who the
  // Lunatic chose at LUNATIC_FOLLOW_CHANCE (so they keep believing), and
  // goes after an Exorcist who has found it.
  demon(s, p, exclude = []) {
    const minion = s.players.some(
      (x) => x.alive && team(x.role) === "minion",
    );

    if (
      p.role === "imp" &&
      minion &&
      s.nominated.includes(p.id) &&
      s.r() < DEMON_STAR_PASS_CHANCE
    ) {
      return p;
    }

    // The Vigormortis's Minions keep their ability if it kills them.
    const level =
      p.role === "vigormortis"
        ? (x) =>
            team(x.role) === "minion"
              ? VIGORMORTIS_MINION_PRIORITY
              : this.priorityLevel(x)
        : undefined;

    // Neither twin is ever the Demon's kill.
    const pool = this.others(s, p).filter(
      (x) => !isTwin(s, x) && !exclude.includes(x),
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
      return protector;
    }

    if (lunaticPick && s.r() < LUNATIC_FOLLOW_CHANCE) {
      return lunaticPick;
    }

    if (exorcist && s.r() < KILL_PRIORITY_CHANCE.high) {
      return exorcist;
    }

    return this.byPriority(s, options, level);
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

  // A player's kill priority (DEMON_KILL_PRIORITY in data.js): good players by
  // the character they've publicly claimed (null if unknown); evil players by
  // their true character, raised to a public "med"/"high" bluff's level
  // unless their own level is "avoid".
  priorityLevel(x) {
    const claimLevel = x.claimKnown
      ? (DEMON_KILL_PRIORITY[x.claim] ?? "low")
      : null;

    if (x.alignment !== "evil") {
      return claimLevel;
    }

    const rank = ["avoid", "low", "med", "high"];
    const own = DEMON_KILL_PRIORITY[x.role] ?? "avoid";

    return own !== "avoid" &&
      ["med", "high"].includes(claimLevel) &&
      rank.indexOf(claimLevel) > rank.indexOf(own)
      ? claimLevel
      : own;
  }

  // Picks from `pool` by priority, as the Demon does: check each level from
  // high to low at its KILL_PRIORITY_CHANCE, never choosing "avoid" while
  // anyone else is available; if no level fires, a good player who isn't
  // avoided, then any good player, then anyone.
  byPriority(s, pool, level = (x) => this.priorityLevel(x)) {
    const notAvoided = pool.filter((x) => level(x) !== "avoid");

    for (const tier of ["high", "med", "low"]) {
      const found = notAvoided.filter((x) => level(x) === tier);

      if (found.length && s.r() < KILL_PRIORITY_CHANCE[tier]) {
        return pick(found, s.r);
      }
    }

    const good = pool.filter((x) => x.alignment === "good");

    return (
      pick(
        good.filter((x) => level(x) !== "avoid"),
        s.r,
      ) ??
      pick(good, s.r) ??
      pick(pool, s.r)
    );
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

  // A Gambler guesses another living player is the character they claim, or
  // (at GAMBLER_WILD_GUESS_CHANCE) takes a wild guess at any character on the
  // script. Either can be wrong, and a wrong guess kills a working Gambler.
  gamble(s, p) {
    const target = this.noted(
      p,
      "gamble",
      pick(this.fresh(p, "gamble", this.pickable(s, p)), s.r),
    );

    if (!target) {
      return null;
    }

    const wild = s.r() < GAMBLER_WILD_GUESS_CHANCE;

    return { target, role: wild ? pick(s.script.ids, s.r) : target.claim };
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

    return pick(
      untwinned(
        s,
        s.players.filter((x) => x.alive && !x.human && x.alignment === "good"),
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

  // ── Sects & Violets ────────────────────────────────────────

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

  // The Juggler guesses up to 5 living players' characters: what they claim
  // (at JUGGLER_CLAIM_GUESS_CHANCE), otherwise another plausible character:
  // one somebody is claiming, or one of the evil team's bluffs.
  juggle(s, p) {
    const plausible = [
      ...new Set([...s.players.map((y) => y.claim), ...(s.demonBluffs ?? [])]),
    ];

    return sample(this.others(s, p), 5, s.r).map((x) => ({
      id: x.id,
      role:
        s.r() < JUGGLER_CLAIM_GUESS_CHANCE
          ? x.claim
          : (pick(
              plausible.filter((id) => id !== x.claim),
              s.r,
            ) ?? x.claim),
    }));
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
      const type = infoStance(m);

      for (const id of type ? (m.targets ?? []) : []) {
        (type === "trust" ? trusted : suspected).add(id);
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

    return pick(info.length ? info : good, s.r);
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
            !["drunk", "mutant"].includes(id) &&
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
        x.claimKnown &&
        (FIRST_NIGHT_INFO.includes(x.claim) || ONGOING_INFO.includes(x.claim)),
    );
    const target = this.noted(
      p,
      "pithag",
      pick(this.fresh(p, "pithag", voices.length ? voices : good), s.r),
    );

    return target && role ? { target, role } : null;
  }

  // ── Bad Moon Rising ─────────────────────────────────────────

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
  exorcist(s, p) {
    const last = p.lastPicks?.exorcist ?? [];
    const pool = untwinned(s, this.pickable(s, p)).filter(
      (x) => !last.includes(x.id),
    );

    return this.noted(
      p,
      "exorcist",
      this.suspect(s, p, pool.filter((x) => !x.human)) ?? pick(pool, s.r),
    );
  }

  // The Innkeeper protects 2 other living players (never a twin: one of
  // them is made drunk).
  innkeeper(s, p) {
    const all = untwinned(s, this.pickable(s, p));
    const pool = this.fresh(p, "innkeeper", all);
    const pair = pool.length >= 2 ? sample(pool, 2, s.r) : sample(all, 2, s.r);

    return pair.length === 2 ? this.noted(p, "innkeeper", pair) : null;
  }

  // The Courtier (once per game, timed by ONCE_PER_GAME.courtier) guesses
  // the Demon's character, hoping to make it drunk.
  courtier(s, p) {
    if (!this.onceReady(s, "courtier", s.night)) {
      return null;
    }

    return pick(
      s.script.ids.filter((id) => team(id) === "demon"),
      s.r,
    );
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
        x.claimKnown &&
        team(x.claim) === "townsfolk",
    );
    const info = dead.filter(
      (x) => FIRST_NIGHT_INFO.includes(x.claim) || ONGOING_INFO.includes(x.claim),
    );

    if (p.alignment === "evil" || !dead.length) {
      return null;
    }

    return this.onceReady(s, "professor", s.night)
      ? pick(info.length ? info : dead, s.r)
      : null;
  }

  // A Gossip (at GOSSIP_CHANCE each day) says in public that someone they
  // suspect is the Demon, a Minion or evil.
  gossip(s, p) {
    if (s.r() >= GOSSIP_CHANCE) {
      return null;
    }

    const target = this.suspect(s, p, this.others(s, p));

    return target
      ? { target, question: pick(["demon", "minion", "evil"], s.r) }
      : null;
  }

  // The Godfather kills a good NPC, the way the Demon picks.
  godfather(s, p) {
    return this.byPriority(
      s,
      untwinned(s, this.others(s, p)).filter((x) => x.alignment === "good"),
    );
  }

  // The Lunatic "kills" like a Demon: any other NPC but a twin, by priority.
  lunatic(s, p) {
    return this.byPriority(s, untwinned(s, this.others(s, p)));
  }

  // Night info an evil NPC reports for their bluff (true only for the Spy).
  bluff(s, p) {
    return bluffInfo(s, p, this);
  }
}
