import { name, team } from "../../data.js";
import {
  registersEvil,
  nameable,
  framed,
  covered,
  shownBefore,
} from "../../storyteller.js";
import { untwinned } from "../../strategy.js";
import { byId, pick } from "../../util.js";

// The Bounty Hunter, mixed into Engine.prototype (see characters/index.js),
// so `this` is the Engine.
//
// At setup, one Townsfolk NPC is made evil (setup.js: p.evilTownsfolk). They
// learn they're evil, but not who the rest of the evil team is, and the team
// doesn't learn them (strategy blind()). They keep their character, its
// ability and its information, which they keep to themself (engine
// resolveNight(): p.ownInfo), and claim it; they play for evil blind,
// steering clear of the players they suspect of being on their team (see
// strategy hunches()).
export const bountyhunter = {
  // A Philosopher p gained the Bounty Hunter's ability: by their jinx, a
  // Townsfolk might turn evil. One does (a good Townsfolk NPC, never p nor
  // either twin), unless there's already an evil Townsfolk.
  bountyEvil(p) {
    const s = this.s;

    if (s.players.some((x) => x.evilTownsfolk)) {
      return;
    }

    const t = pick(
      untwinned(
        s,
        s.players.filter(
          (x) =>
            x.alive &&
            !x.human &&
            x !== p &&
            x.alignment === "good" &&
            team(x.role) === "townsfolk",
        ),
      ),
      s.r,
    );

    if (!t) {
      return;
    }

    t.alignment = "evil";
    t.evilTownsfolk = true;
    t.suspicion = null;

    this.audit(
      "bountyhunter",
      `${t.label} (${name(t.role)}) becomes evil (the Philosopher gained the Bounty Hunter ability): they learn they're evil, but not who the rest of the evil team is.`,
      { playerId: t.id },
    );
  },
};

const bountyText = (t) => `Bounty Hunter: ${t.label} is evil.`;

// The Bounty Hunter information p learned (or made up) last, before
// tonight, or null if they've had none.
function lastBounty(s, p) {
  return (
    [
      p.memories,
      p.cover?.memories,
      p.bluffState?.hidden?.memories,
      p.bluffState?.pixie?.memories,
      p.mad?.memories,
    ]
      .flat()
      .filter((m) => m && m.role === "bountyhunter" && !m.day && m.night < s.night)
      .sort((a, b) => a.night - b.night)
      .at(-1) ?? null
  );
}

// The living players p's Bounty Hunter information can name tonight: not
// one it named before (never the same player twice), never you in an NPC's
// (you're never anyone's suspect).
const fresh = (s, p) => {
  const before = shownBefore(s, p, "bountyhunter");

  return nameable(s, p).filter((x) => x.alive && !before.has(x.id) && !(x.human && !p.human));
};

const named = (t) =>
  t ? { targets: [t.id], text: bountyText(t) } : { targets: [], text: "No information." };

// The Bounty Hunter: 1 evil player at first (Night 1, or the night a
// Philosopher gains it), then another each night after the one they know
// has died.
export const info = {
  stance: () => "suspicious",
  nights: "first",
  wakes(s, p) {
    const last = lastBounty(s, p);
    const t = byId(s, last?.targets?.[0]);

    return !last || Boolean(t && !t.alive);
  },

  truth(s, p) {
    return named(pick(fresh(s, p).filter(registersEvil), s.r));
  },

  // A misinformed Bounty Hunter is shown a good player, as is an evil
  // bluffer's: the evil team's scapegoat if they can, else any good player
  // (never a teammate). (Whoever it is, their death wakes them again.)
  lie(s, p) {
    const options = fresh(s, p).filter((x) => !covered(p, x) && x.alignment === "good");
    const goat = framed(s, p);

    return named(options.includes(goat) ? goat : pick(options, s.r));
  },

  // A good pretender's (see bluff.js): any other living NPC.
  story(s, p) {
    return named(pick(fresh(s, p), s.r));
  },

  random(s, p) {
    return named(pick(fresh(s, p), s.r));
  },
};
