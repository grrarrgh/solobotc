import { name } from "./data.js";
import { bluffInfo } from "./storyteller.js";
import { pick, sample } from "./util.js";

export class SimpleStrategy {
  // Good NPCs point at evil players, unless drunk or poisoned (50% wrong).
  // Evil NPCs always point at good players.
  suspect(s, p, pool) {
    const truthful = pool.filter((x) => x.alignment === "evil");
    const falseTargets = pool.filter((x) => x.alignment === "good");

    let candidates;

    if (p.alignment === "evil") {
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
  // living NPC, never the human.
  suspicion(s, p) {
    const current = s.players.find((x) => x.id === p.suspicion?.targetId);
    const newDay = p.suspicion?.day !== s.day;
    const move = !current?.alive || (newDay && s.r() < 0.35);

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

  poison(s) {
    return pick(
      s.players.filter((x) => x.alive && x.alignment === "good"),
      s.r,
    );
  }

  monk(s, p) {
    return pick(
      s.players.filter((x) => x.alive && !x.human && x.id !== p.id),
      s.r,
    );
  }

  demon(s, p) {
    return s.r() < 0.06
      ? p
      : pick(
          s.players.filter((x) => x.alive && !x.human && x.id !== p.id),
          s.r,
        );
  }

  // Night choices only ever pick living players.
  raven(s, p) {
    return pick(
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

  // Each day, an NPC Slayer has a 35% chance to shoot a living NPC they suspect.
  slay(s, p) {
    if (s.r() >= 0.35) {
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

  // An Artist asks whether someone they suspect is the Demon.
  artist(s, p) {
    const target = this.suspect(
      s,
      p,
      s.players.filter((x) => x.alive && !x.human && x.id !== p.id),
    );

    return target ? { target, question: "demon" } : null;
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
