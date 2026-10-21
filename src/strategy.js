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
  SEAMSTRESS_NIGHT_CHANCE,
  SLAYER_SHOOT_AFTER_DAY,
  SLAYER_START_CHANCE,
  SLAYER_CHANCE_STEP,
} from "./data.js";
import {
  ability,
  bluffInfo,
  scapegoat,
  isDrunk,
  isDemon,
} from "./storyteller.js";
import { pick, sample } from "./util.js";

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
    const current = s.players.find((x) => x.id === p.suspicion?.targetId);
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
          s.players.filter((x) => x.alive && !x.human && x.id !== p.id),
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

  // Trust or suspicion from the latest piece of information that names a
  // living NPC. Evil NPCs trust their teammates and accuse the scapegoat.
  infoOpinion(s, p) {
    const goat = p.alignment === "evil" ? scapegoat(s) : null;

    for (const m of [...p.memories].reverse()) {
      const type = infoStance(m);
      const named = (m.targets ?? [])
        .map((id) => s.players.find((x) => x.id === id))
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

    return [
      `I claim ${name(mad ? mad.role : p.claim)}.`,
      details,
      opinion.text,
    ]
      .filter(Boolean)
      .join("\n");
  }

  vote(s, v, n) {
    return (
      !(v.alignment === "evil" && n.alignment === "evil") &&
      s.r() < (v.alignment === "evil" ? 0.85 : 0.62)
    );
  }

  // The Poisoner goes after good players with ongoing information (Empath,
  // Fortune Teller, Undertaker) when there are any.
  poison(s) {
    const good = s.players.filter((x) => x.alive && x.alignment === "good");
    const ongoing = good.filter((x) => ONGOING_INFO.includes(ability(x)));

    return pick(ongoing.length ? ongoing : good, s.r);
  }

  monk(s, p) {
    return pick(
      s.players.filter((x) => x.alive && !x.human && x.id !== p.id),
      s.r,
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

    return this.byPriority(
      s,
      s.players.filter((x) => x.alive && !x.human && x.id !== p.id),
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
  byPriority(s, pool) {
    const notAvoided = pool.filter((x) => this.priorityLevel(x) !== "avoid");

    for (const tier of ["high", "med", "low"]) {
      const found = notAvoided.filter((x) => this.priorityLevel(x) === tier);

      if (found.length && s.r() < KILL_PRIORITY_CHANCE[tier]) {
        return pick(found, s.r);
      }
    }

    const good = pool.filter((x) => x.alignment === "good");

    return (
      pick(
        good.filter((x) => this.priorityLevel(x) !== "avoid"),
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

    return goat?.alive && goat !== p
      ? goat
      : pick(
          s.players.filter((x) => x.alive && x.id !== p.id),
          s.r,
        );
  }

  ft(s, p) {
    return sample(
      s.players.filter((x) => x.alive && x.id !== p.id),
      2,
      s.r,
    );
  }

  // The chance an NPC Slayer shoots today (see SLAYER_* in data.js).
  slayChance(day) {
    if (day < SLAYER_SHOOT_AFTER_DAY) {
      return 0;
    }

    return Math.min(
      1,
      SLAYER_START_CHANCE + SLAYER_CHANCE_STEP * (day - SLAYER_SHOOT_AFTER_DAY),
    );
  }

  // An NPC Slayer who hasn't fired yet may shoot a living NPC they suspect.
  slay(s, p) {
    const chance = this.slayChance(s.day);

    if (!chance || s.r() >= chance) {
      return null;
    }

    return this.suspect(
      s,
      p,
      s.players.filter((x) => x.alive && !x.human && x.id !== p.id),
    );
  }

  // A Butler picks any other living player as master.
  butler(s, p) {
    return pick(
      s.players.filter((x) => x.alive && x.id !== p.id),
      s.r,
    );
  }

  // A Gambler guesses another living player is the character they claim, or
  // (at GAMBLER_WILD_GUESS_CHANCE) takes a wild guess at any character on the
  // script. Either can be wrong, and a wrong guess kills a working Gambler.
  gamble(s, p) {
    const target = pick(
      s.players.filter((x) => x.alive && x.id !== p.id),
      s.r,
    );

    if (!target) {
      return null;
    }

    const wild = s.r() < GAMBLER_WILD_GUESS_CHANCE;

    return { target, role: wild ? pick(s.script.ids, s.r) : target.claim };
  }

  // An Artist asks "Is any of these 1–3 players <evil / the Demon / a Minion
  // / an Outsider / a Townsfolk>?", always including someone they suspect.
  artist(s, p) {
    const pool = s.players.filter((x) => x.alive && !x.human && x.id !== p.id);
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
    const pool = s.players.filter((x) => x.alive && !x.human && x.id !== n.id);

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
      s.players.filter((x) => x.alive && !x.human && x.id !== p.id),
    );
  }

  // Each night there's a 30% chance the Assassin spends their kill on a
  // living good NPC.
  assassin(s) {
    if (s.r() >= 0.3) {
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

  // Living NPCs other than p.
  others(s, p) {
    return s.players.filter((x) => x.alive && !x.human && x.id !== p.id);
  }

  // The Dreamer looks into someone they suspect.
  dream(s, p) {
    return this.suspect(s, p, this.others(s, p)) ?? pick(this.others(s, p), s.r);
  }

  // The Snake Charmer charms someone they suspect (hoping for the Demon).
  snake(s, p) {
    return this.suspect(s, p, this.others(s, p));
  }

  // The Seamstress (once per game, on a night of their choosing) compares
  // someone they suspect with another player.
  seamstress(s, p) {
    if (s.r() >= SEAMSTRESS_NIGHT_CHANCE) {
      return null;
    }

    const a = this.suspect(s, p, this.others(s, p));
    const b = pick(
      this.others(s, p).filter((x) => x !== a),
      s.r,
    );

    return a && b ? [a, b] : null;
  }

  // The Philosopher gains an ongoing information ability not in play (so
  // nobody is made drunk), or else any other good character.
  philosopher(s, p) {
    const inPlay = new Set(s.players.map((x) => x.role));
    const good = s.script.ids.filter(
      (id) => alignment(id) === "good" && id !== "philosopher",
    );
    const fresh = good.filter(
      (id) => ONGOING_INFO.includes(id) && !inPlay.has(id),
    );

    return pick(fresh.length ? fresh : good, s.r);
  }

  // The Juggler guesses up to 5 living players' characters: what they claim.
  juggle(s, p) {
    return sample(this.others(s, p), 5, s.r).map((x) => ({
      id: x.id,
      role: x.claim,
    }));
  }

  // A dying Klutz picks someone they trust (or, failing that, anyone).
  klutz(s, p) {
    const o = this.infoOpinion(s, p);
    const trusted =
      o?.type === "trust" ? s.players.find((x) => x.id === o.targetId) : null;

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
  witch(s, p) {
    const human = s.players.find((x) => x.human && x.alive);

    if (human && s.r() < WITCH_HUMAN_CHANCE) {
      return human;
    }

    return pick(
      this.others(s, p).filter((x) => x.alignment === "good"),
      s.r,
    );
  }

  // The Cerenovus makes a good NPC "mad" about another good character.
  // The Cerenovus picks a good NPC the way the Demon picks its kills, and
  // makes them mad about a good character that isn't who they are (their
  // true character, the one they think they are, or their claim; never the
  // Drunk).
  cerenovus(s, p) {
    const target = this.byPriority(
      s,
      this.others(s, p).filter((x) => x.alignment === "good"),
    );
    const own = target && [target.role, ability(target), target.claim];
    const role =
      target &&
      pick(
        s.script.ids.filter(
          (id) =>
            alignment(id) === "good" && id !== "drunk" && !own.includes(id),
        ),
        s.r,
      );

    return target && role ? { target, role } : null;
  }

  // The Pit-Hag turns a good NPC (preferring public information claimers)
  // into an Outsider that isn't in play.
  pithag(s, p) {
    const tokens = new Set(s.players.flatMap((x) => [x.role, x.shown]));
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
    const target = pick(voices.length ? voices : good, s.r);

    return target && role ? { target, role } : null;
  }


  // Night info an evil NPC reports for their bluff (true only for the Spy).
  bluff(s, p) {
    return bluffInfo(s, p, this);
  }
}
