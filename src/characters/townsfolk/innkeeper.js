import { name } from "../../data.js";
import { ability, works, who, choiceInfo } from "../../storyteller.js";
import { untwinned } from "../../strategy.js";
import { bySeat, pick } from "../../util.js";

// The Innkeeper, mixed into Engine.prototype (see characters/index.js),
// so `this` is the Engine.
export const innkeeper = {
  // From Night 2, the Innkeeper protects 2 players from dying tonight; one
  // of them is drunk until dusk.
  innkeepers() {
    const s = this.s;

    if (s.night < 2) {
      return;
    }

    for (const p of s.players.filter(
      (x) => x.alive && ability(x) === "innkeeper",
    )) {
      const picks = this.humanPicks(p) ?? this.strat.innkeeper(s, p);

      if (picks?.length !== 2) {
        continue;
      }

      this.woke(p);
      this.chose(p, picks);

      const effective = works(p);
      const drunk = effective ? pick(untwinned(s, picks), s.r) : null;

      if (effective) {
        for (const x of picks) {
          x.safeNight = s.night;
          x.safeBy = p.id;
        }

        if (drunk) {
          drunk.drunkTonight = true;
          drunk.drunkBy = who(p);
        }
      }

      this.audit(
        "innkeeper",
        `${p.label} (${name(p.role)}) protected ${bySeat(picks)
          .map((x) => x.label)
          .join(" and ")}; ${
          effective
            ? `they can't die tonight${
                drunk ? `, and ${drunk.label} is drunk until dusk` : ""
              }`
            : "the protection failed"
        }.`,
        { actorId: p.id, targetIds: picks.map((x) => x.id), effective },
      );

      this.remember(p, choiceInfo(s, "innkeeper", "protected", picks));
    }
  },
};

// The Innkeeper, as told by someone claiming it without its ability (see
// bluff.js madeUpChoice()): the 2 players they "protected" tonight
// (not on Night 1).
export const info = {
  choice(s, p, strat) {
    const picks = s.night > 1 ? strat.innkeeper(s, p) : null;

    return picks ? choiceInfo(s, "innkeeper", "protected", picks) : null;
  },
};
