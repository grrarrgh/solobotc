import {
  name,
  team,
  ARTIST_QUESTIONS,
  FIRST_NIGHT_INFO,
  ONGOING_INFO,
  DEMON_INFO_KILL_CHANCE,
  DEMON_STAR_PASS_CHANCE,
  SCAPEGOAT_CHANCE,
  SLAYER_SHOOT_AFTER_DAY,
  SLAYER_START_CHANCE,
  SLAYER_CHANCE_STEP,
} from "./data.js";
import { ability, bluffInfo, scapegoat } from "./storyteller.js";
import { pick, sample } from "./util.js";

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
    } else if (p.role === "drunk" || p.poisoned) {
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
          text: `I heard ${target.label} is suspicious`,
        }
      : null;
  }

  // Good NPCs share what they learned; evil NPCs share their bluffed info.
  // Each night's (or day's) information goes on its own line.
  ask(s, p) {
    const details = p.memories.length
      ? p.memories
          .map((x) => `${x.day ? `Day ${x.day}` : `Night ${x.night}`}: ${x.text}`)
          .join("\n")
      : "I have no stored information.";

    const suspicion = this.suspicion(s, p);

    return [
      `I claim ${name(p.claim)}.`,
      details,
      suspicion ? `${suspicion.text}.` : "",
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

  // The Demon kills with purpose (see DEMON_* in data.js):
  // - after being nominated (and surviving), it may kill itself so a Minion
  //   takes over;
  // - otherwise it attacks a good NPC, never a teammate, skipping public
  //   Soldier and Mayor claims, and preferring public information claimers
  //   (ongoing ones first).
  demon(s, p) {
    const minion = s.players.some(
      (x) => x.alive && team(x.role) === "minion",
    );

    if (minion && s.nominated.includes(p.id) && s.r() < DEMON_STAR_PASS_CHANCE) {
      return p;
    }

    const good = s.players.filter(
      (x) => x.alive && !x.human && x.alignment === "good",
    );
    const safe = good.filter(
      (x) => !(x.claimKnown && ["soldier", "mayor"].includes(x.claim)),
    );
    const targets = safe.length ? safe : good;
    const voices = targets.filter(
      (x) =>
        x.claimKnown &&
        (FIRST_NIGHT_INFO.includes(x.claim) || ONGOING_INFO.includes(x.claim)),
    );
    const ongoing = voices.filter((x) => ONGOING_INFO.includes(x.claim));

    if (voices.length && s.r() < DEMON_INFO_KILL_CHANCE) {
      return pick(ongoing.length ? ongoing : voices, s.r);
    }

    return (
      pick(targets, s.r) ??
      pick(
        s.players.filter((x) => x.alive && !x.human && x.id !== p.id),
        s.r,
      )
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

  // A Gambler guesses another living player is the character they claim.
  gamble(s, p) {
    const target = pick(
      s.players.filter((x) => x.alive && x.id !== p.id),
      s.r,
    );

    return target ? { target, role: target.claim } : null;
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

  // Night info an evil NPC reports for their bluff (true only for the Spy).
  bluff(s, p) {
    return bluffInfo(s, p, this);
  }
}
