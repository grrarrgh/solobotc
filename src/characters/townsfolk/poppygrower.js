import { name } from "../../data.js";
import { isDemon, isDrunk } from "../../storyteller.js";

// The Poppy Grower, mixed into Engine.prototype (see characters/index.js),
// so `this` is the Engine. While they have their ability, the Minions and
// Demon don't know each other (p.poppyBlind: see setup.js, and strategy
// teammate()), nor the Demon its bluffs; and the Spy and Widow don't see the
// Grimoire (see poppyBlocks()). An NPC Poppy Grower always hides (see
// strategy coverFor()), and only comes clean once dead.
export const poppygrower = {
  // p just died: a Poppy Grower who had their ability wakes the evil team
  // tonight (see poppyWakes()).
  poppyDeath(p) {
    const s = this.s;

    if (
      p.role !== "poppygrower" ||
      isDrunk(p) ||
      p.poisoned ||
      !s.players.some((x) => x.poppyBlind)
    ) {
      return;
    }

    s.poppyWake = true;
    this.audit("poppygrower", `${p.label} (Poppy Grower) died: tonight the Minions and Demon learn who each other are.`, {
      playerId: p.id,
    });
  },

  // At night, after the Poppy Grower died: the Minions and Demon learn who
  // each other are, and the Demon learns its bluffs.
  poppyWakes() {
    const s = this.s;

    if (!s.poppyWake || s.phase !== "night") {
      return;
    }

    s.poppyWake = false;

    const evil = s.players.filter((x) => x.poppyBlind);

    for (const p of evil) {
      p.poppyBlind = false;

      if (isDemon(p)) {
        p.bluffs = s.demonBluffs ?? [];
      }
    }

    // (So does a Lunatic, who thinks they're the Demon: their "Minions" and
    // bluffs, held back at setup.)
    const lunatics = s.players.filter((x) => x.lunaticLater);

    for (const p of lunatics) {
      p.lunaticTeam = p.lunaticLater.team;
      p.bluffs = p.lunaticLater.bluffs;
      p.lunaticLater = null;
    }

    const demon = evil.find(isDemon);

    this.audit(
      "poppygrower",
      `The Poppy Grower is dead: ${evil.map((x) => `${x.label} (${name(x.role)})`).join(", ")} learn who each other are${
        demon ? `; ${demon.label} learns its bluffs (${(s.demonBluffs ?? []).map(name).join(", ") || "none"})` : ""
      }${lunatics
        .map(
          (p) =>
            `; ${p.label} (Lunatic) is shown their "Minions" (${p.lunaticTeam
              .map((id) => this.player(id).label)
              .join(", ")}) and bluffs (${p.bluffs.map(name).join(", ")})`,
        )
        .join("")}.`,
    );
  },
};
