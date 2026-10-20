import { name } from "./data.js";
import { pick, sample } from "./util.js";

export class SimpleStrategy {
  // Good NPCs point at evil players, unless drunk or poisoned (50% wrong).
  // Evil NPCs always point at good players.
  suspicion(s, p) {
    const npcs = s.players.filter((x) => !x.human && x.id !== p.id);
    const truthful = npcs.filter((x) => x.alignment === "evil");
    const falseTargets = npcs.filter((x) => x.alignment === "good");

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

    const target = pick(candidates, s.r);

    return target
      ? {
          targetId: target.id,
          text: `I heard ${target.label} is suspicious`,
        }
      : null;
  }

  ask(s, p) {
    const details =
      p.alignment === "good"
        ? p.memories.length
          ? p.memories.map((x) => `Night ${x.night}: ${x.text}`).join(" ")
          : "I have no stored information."
        : "";

    const suspicion = this.suspicion(s, p);

    return [
      `I claim ${name(p.claim)}.`,
      details,
      suspicion ? `${suspicion.text}.` : "",
    ]
      .filter(Boolean)
      .join(" ");
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

  raven(s, p) {
    return pick(
      s.players.filter((x) => x.id !== p.id),
      s.r,
    );
  }

  ft(s, p) {
    return sample(
      s.players.filter((x) => x.id !== p.id),
      2,
      s.r,
    );
  }
}
