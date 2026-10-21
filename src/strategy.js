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
} from "./data.js";
import {
  ability,
  bluffInfo,
  scapegoat,
  isDrunk,
  isDemon,
} from "./storyteller.js";
import { byId, pick, sample } from "./util.js";

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
    case "washerwoman":
    case "grandmother":
    case "monk":
    case "butler":
    case "gambler":
      return "trust";
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

export class SimpleStrategy {
  // Good NPCs point at evil players, unless drunk or poisoned (50% wrong).
  // Evil NPCs always point at good players.
  suspect(s, p, pool) {
    const truthful = pool.filter((x) => x.alignment === "evil");
    const falseTargets = pool.filter((x) => x.alignment === "good");

    let candidates;

    if (p.alignment === "evil") {
      // Evil mostly points at the team's shared scapegoat.
      const goat = scapegoat(s);

      if (falseTargets.includes(goat) && s.r() < SCAPEGOAT_CHANCE) {
        return goat;
      }

      candidates = falseTargets;
    } else if (isDrunk(p) || p.poisoned) {
      const wrong = s.r() < 0.5;

      candidates =
        wrong && falseTargets.length
          ? falseTargets
          : truthful.length
            ? truthful
            : falseTargets;
    } else {
      candidates = truthful;
    }

    return pick(candidates, s.r);
  }

  // Each NPC keeps one suspect. It can move at the start of a new day (35%
  // chance), and must move if the suspect has died. It only ever moves to a
  // living NPC, never the human. Evil NPCs never suspect a teammate (such as
  // the Demon), even one who turned evil after they picked them.
  suspicion(s, p) {
    const current = byId(s, p.suspicion?.targetId);
    const newDay = p.suspicion?.day !== s.day;
    const stale =
      !current?.alive ||
      current.human ||
      (p.alignment === "evil" && current.alignment === "evil");
    const move = stale || (newDay && s.r() < 0.35);

    const target = move
      ? this.suspect(
          s,
          p,
          this.others(s, p),
        )
      : current;

    p.suspicion = target ? { targetId: target.id, day: s.day } : null;

    return target
      ? {
          targetId: target.id,
          text: `I'm suspicious of ${target.label}.`,
        }
      : null;
  }

  // An NPC's closing remark when asked, one of:
  // - "nothing": a good NPC with no information has nothing to add;
  // - "trust" / "suspicious" of a player, from the NPC's own information
  //   where it names someone (so a Drunk's or a bluffer's wrong information
  //   gives a wrong opinion);
  // - otherwise, "suspicious" of their general suspect (see suspicion()).
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

    if (p.alignment === "good" && !p.memories.length) {
      return nothing;
    }

    const fromInfo = this.infoOpinion(s, p);

    if (fromInfo) {
      return fromInfo;
    }

    const sus = this.suspicion(s, p);

    return sus ? { type: "suspicious", ...sus } : nothing;
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
    };

    return p.alive && p.claim in used && !used[p.claim]
      ? `I haven't used my ${name(p.claim)} ability yet.`
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
  ask(s, p) {
    const mad = p.mad?.day === s.day ? p.mad : null;
    const memories = mad ? (mad.memories ?? []) : p.memories;
    const details = memories.length
      ? memories
          .map((x) => `${x.day ? `Day ${x.day}` : `Night ${x.night}`}: ${x.text}`)
          .join("\n")
      : "I have no stored information.";
    const opinion = mad
      ? (this.infoOpinion(s, { ...p, memories }) ?? {
          text: "I have nothing else to add.",
        })
      : this.opinion(s, p);

    // Both twins insist they're the good one.
    const twin = !mad && this.twinOf(s, p);

    return [
      `I claim ${name(mad ? mad.role : p.claim)}.`,
      twin && `${twin.label} is my twin, and I am the good twin.`,
      details,
      !mad && this.unusedAbility(p),
      opinion.text,
    ]
      .filter(Boolean)
      .join("\n");
  }

  vote(s, v, n) {
    if (v.alignment === "evil" && n.alignment === "evil") {
      return false;
    }

    // A dead good player has one vote left: they save it for a nominee they
    // are suspicious of.
    if (!v.alive && v.alignment === "good") {
      const o = this.opinion(s, v);

      return o.type === "suspicious" && o.targetId === n.id;
    }

    return s.r() < (v.alignment === "evil" ? 0.85 : 0.62);
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
  poison(s, p = null) {
    const good = s.players.filter((x) => x.alive && x.alignment === "good");
    const ongoing = good.filter((x) => ONGOING_INFO.includes(ability(x)));
    const pool = ongoing.length ? ongoing : good;

    if (!p) {
      return pick(pool, s.r);
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
  demon(s, p) {
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

    return this.byPriority(
      s,
      this.others(s, p),
      level,
    );
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

  // A dying Moonchild curses a living NPC they suspect.
  moonchild(s, p) {
    return this.suspect(
      s,
      p,
      this.others(s, p),
    );
  }

  // The Assassin spends their one kill (timed by ONCE_PER_GAME.assassin) on a
  // living good NPC.
  assassin(s) {
    if (!this.onceReady(s, "assassin", s.night)) {
      return null;
    }

    return pick(
      s.players.filter((x) => x.alive && !x.human && x.alignment === "good"),
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
  snake(s, p) {
    const pool = this.fresh(p, "snake", this.others(s, p));

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

  // A dying Klutz picks someone they trust (or, failing that, anyone).
  klutz(s, p) {
    const o = this.infoOpinion(s, p);
    const trusted =
      o?.type === "trust" ? byId(s, o.targetId) : null;

    return trusted?.alive
      ? trusted
      : pick(
          s.players.filter((x) => x.alive && x.id !== p.id),
          s.r,
        );
  }

  // The Storyteller's pick for who a dying Sweetheart makes drunk: a good
  // player, ideally one with information.
  sweetheart(s, p) {
    const good = s.players.filter(
      (x) => x.alive && x !== p && x.alignment === "good" && !isDrunk(x),
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
        !isDemon(x),
    );

    return good.length >= 2 ? sample(good, 2, s.r) : null;
  }

  // The Witch curses the human (the likeliest nominator) or a good NPC.
  // (Not the same player two nights running, when there's a choice.)
  witch(s, p) {
    const human = s.players.find((x) => x.human && x.alive);
    const humanLast = p.lastPicks?.witch?.includes(human?.id);

    if (human && !humanLast && s.r() < WITCH_HUMAN_CHANCE) {
      return this.noted(p, "witch", human);
    }

    const good = this.others(s, p).filter((x) => x.alignment === "good");

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
    const teammates = this.others(s, p).filter((x) => x.alignment === "evil");
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
              this.others(s, p).filter((x) => x.alignment === "good"),
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
        .filter((x) => x.alive && !x.human && x.alignment === "evil")
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
    const good = this.others(s, p).filter(
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

  // Night info an evil NPC reports for their bluff (true only for the Spy).
  bluff(s, p) {
    return bluffInfo(s, p, this);
  }
}
