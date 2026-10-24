import { name } from "../../data.js";
import { ability, works, who, choiceInfo } from "../../storyteller.js";
import { bySeat } from "../../util.js";

// The Courtier, mixed into Engine.prototype (see characters/index.js),
// so `this` is the Engine.
export const courtier = {
  // Once per game, the Courtier chooses a character: whoever has it is drunk
  // for 3 nights and 3 days. (They wake each night until they use it.)
  courtiers() {
    const s = this.s;

    for (const p of s.players.filter(
      (x) => x.alive && ability(x) === "courtier" && !x.courtierUsed,
    )) {
      const c = s.humanChoice;
      const role = p.human
        ? c?.night === s.night
          ? c.character
          : null
        : this.strat.courtier(s, p);

      this.woke(p);

      if (!role) {
        continue;
      }

      const effective = works(p);
      const holders = s.players.filter((x) => x.role === role);

      p.courtierUsed = true;

      if (effective) {
        for (const x of holders) {
          x.drunkTill = s.night + 2;
          x.drunkTillBy = who(p);
          x.drunkTonight = true;
          x.drunkBy = who(p);
        }
      }

      this.audit(
        "courtier",
        `${p.label} (${name(p.role)}) chose the ${name(role)}; ${
          !effective
            ? "it failed"
            : holders.length
              ? `${bySeat(holders)
                  .map((x) => x.label)
                  .join(", ")} drunk for 3 nights and 3 days`
              : "not in play"
        }.`,
        { actorId: p.id, role, effective },
      );

      this.remember(p, choiceInfo(s, "courtier", "chose", role));
    }
  },

  // At dusk: a player the Courtier chose stays drunk for 3 nights and days.
  courtierLasting() {
    const s = this.s;

    for (const p of s.players.filter((x) => x.drunkTill >= s.night)) {
      p.drunkTonight = true;
      p.drunkBy = p.drunkTillBy;
    }
  },
};
