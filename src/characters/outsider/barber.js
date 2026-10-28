import { name } from "../../data.js";
import { isDemon, isDrunk } from "../../storyteller.js";

// The Barber, mixed into Engine.prototype (see characters/index.js),
// so `this` is the Engine.
export const barber = {
  // The night after a Barber died in the day, the Demon makes their swap.
  barberNight() {
    const s = this.s;
    const p = s.barberPending && this.player(s.barberPending);

    s.barberPending = null;

    if (p) {
      this.barberSwap(p);
    }
  },

  barberSwap(p) {
    const s = this.s;
    const d = s.players.find((x) => x.alive && isDemon(x));
    const pair = d && this.strat.barber(s, d);
    // Why the Demon chose them, or chose not to (see strategy barber()).
    const why = d?.barberWhy;

    if (d) {
      delete d.barberWhy;
    }

    if (!pair) {
      if (d) {
        this.audit(
          "barber",
          `${p.label} (Barber) died; the Demon swapped nobody${why ? ` (why: ${why})` : ""}.`,
          { playerId: p.id, swapped: [] },
        );
      }

      return;
    }

    const [a, b] = pair;

    // Each learns (and claims) their new character, and has its ability
    // from now on: one that starts knowing something (the Chef, the
    // Washerwoman...) is used tonight, as on Night 1 (see nightInfo()).
    [a.role, b.role] = [b.role, a.role];

    for (const x of [a, b]) {
      x.shown = x.role;
      x.claim = this.claimFor(x);
      x.gained = null;
      x.cannibal = false;
      x.gainedNight = s.night;
    }

    this.audit(
      "barber",
      `${p.label} (Barber) died; the Demon swapped ${a.label} (now ${name(
        a.role,
      )}) and ${b.label} (now ${name(b.role)})${why ? ` (why: ${why})` : ""}.`,
      { playerId: p.id, swapped: [a.id, b.id] },
    );

    // (A new Puzzlemaster's puzzle starts, and a new Ogre chooses, even if
    // their step tonight has passed.)
    this.puzzleDrunk();
    this.ogres();
  },

  // The Barber dies: the Demon may swap two players' characters. Swaps
  // happen at night: straight away for a night death, or that night for a
  // death in the day (see barberNight()).
  barberDeath(p) {
    if (p.role !== "barber" || p.poisoned || isDrunk(p)) {
      return;
    }

    if (this.s.phase === "night") {
      this.barberSwap(p);
    } else {
      this.s.barberPending = p.id;
    }
  },
};
