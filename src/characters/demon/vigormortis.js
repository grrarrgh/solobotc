import { name, team } from "../../data.js";
import { ability, who } from "../../storyteller.js";
import { pick } from "../../util.js";

// The Vigormortis, mixed into Engine.prototype (see characters/index.js),
// so `this` is the Engine.
export const vigormortis = {
  // A Minion the Vigormortis kills keeps their ability, and poisons one of
  // their Townsfolk neighbours (for as long as the Vigormortis lives).
  vigormortisKill(d, t) {
    const s = this.s;

    if (d.role !== "vigormortis" || team(t.role) !== "minion") {
      return;
    }

    const n = pick(this.townsfolkNeighbours(t), s.r);

    t.vigor = true;

    if (n) {
      s.lastingPoison.push({ id: n.id });
      n.poisoned = true;
      n.poisonedBy = who(d);
    }

    this.audit(
      "vigormortis",
      `${t.label} (${name(t.role)}) keeps their ability${
        n ? `; ${n.label} is poisoned` : ""
      }.`,
      { playerId: t.id, poisonedId: n?.id ?? null },
    );
  },

  // At dusk, while the Vigormortis lives, the Townsfolk neighbours of the
  // Minions it killed stay poisoned.
  vigormortisLasting() {
    const s = this.s;
    const vigor = s.players.find((x) => x.alive && x.role === "vigormortis");

    if (vigor) {
      for (const { id } of s.lastingPoison) {
        this.player(id).poisoned = true;
        this.player(id).poisonedBy = who(vigor);
      }
    }
  },

  // The Vigormortis dies: the dead Minions it kept going lose their
  // abilities, and their neighbours' poison ends.
  vigormortisDeath(p) {
    const s = this.s;

    if (p.role !== "vigormortis") {
      return;
    }

    const kept = s.players.filter((x) => !x.alive && x.vigor);

    for (const x of kept) {
      x.vigor = false;
    }

    // (Unless the Poisoner or a Snake Charmer swap poisoned them too.)
    for (const { id } of s.lastingPoison) {
      const x = this.player(id);

      x.poisoned = Boolean(x.lastingPoison) || s.poisoned === id;
    }

    s.lastingPoison = [];

    if (kept.length) {
      this.audit(
        "vigormortis",
        `${p.label} (Vigormortis) died; ${kept
          .map((x) => `${x.label} (${name(x.role)})`)
          .join(", ")} lost their abilities.`,
        { playerId: p.id },
      );
    }
  },
};
