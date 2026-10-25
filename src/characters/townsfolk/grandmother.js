import { name, alignment, NEVER_BLUFFED, roleByName } from "../../data.js";
import { pick } from "../../util.js";
import { works, nameable, goodRoles } from "../../storyteller.js";
import { claimHeard } from "../../strategy.js";

export const grandchildText = (g, role) =>
  `Grandmother: your grandchild is ${g.label}, the ${name(role)}.`;

// The Grandmother, mixed into Engine.prototype (see characters/index.js),
// so `this` is the Engine.
export const grandmother = {
  // If the Demon kills a working Grandmother's grandchild, she dies too.
  grandmother(t) {
    for (const g of this.s.players) {
      if (g.role === "grandmother" && g.grandchild === t.id && works(g)) {
        this.kill(g, "grandmother");
      }
    }
  },
};

// The Grandmother: a good player, and their character.
export const info = {
  nights: "first",
  stance: () => "trust",
  // The character it names their grandchild as (see strategy stanceOn()).
  named: (m) => [roleByName(m.text.match(/, the (.+)\.$/)?.[1])].filter(Boolean),

  // (The link to her real grandchild exists even if she's misinformed:
  // whether their death kills her is checked when the Demon strikes.)
  keep(s, p, m, truth) {
    if (truth) {
      p.grandchild = truth.targets[0] ?? null;
    }

    return m;
  },

  truth(s, p) {
    const g = pick(
      nameable(s, p).filter((x) => x.alignment === "good"),
      s.r,
    );

    return g
      ? { targets: [g.id], text: grandchildText(g, g.role) }
      : { targets: [], text: "No information." };
  },

  lie(s, p) {
    // Vouch for an evil player (or anyone else) with a good character they
    // don't have: the one they claim, so it backs them up instead of
    // contradicting them.
    const g =
      pick(
        nameable(s, p).filter((x) => x.alignment === "evil"),
        s.r,
      ) ?? pick(nameable(s, p), s.r);
    // (As the bluffer heard it: a claim they didn't hear could differ.)
    const heardAs = claimHeard(g, p) ?? g.claim;
    const shown =
      alignment(heardAs) === "good" && heardAs !== g.role
        ? heardAs
        : pick(
            goodRoles(s).filter((id) => id !== g.role),
            s.r,
          );

    return { targets: [g.id], text: grandchildText(g, shown) };
  },

  random(s, p) {
    const g = pick(
      s.players.filter((x) => x.id !== p.id),
      s.r,
    );

    return {
      targets: [g.id],
      text: grandchildText(g, pick(goodRoles(s), s.r)),
    };
  },

  // A good pretender's (see bluff.js): any other player as their
  // grandchild, as the good character they heard them claim (or failing
  // that, any good one).
  story(s, p) {
    const g = pick(
      s.players.filter((x) => x.id !== p.id),
      s.r,
    );
    const believable = (id) => alignment(id) === "good" && !NEVER_BLUFFED.includes(id);
    const claim = claimHeard(g, p);

    return {
      targets: [g.id],
      text: grandchildText(
        g,
        believable(claim) ? claim : pick(goodRoles(s).filter(believable), s.r),
      ),
    };
  },
};
