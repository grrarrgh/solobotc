import { name } from "../../data.js";
import { ability, works, isDemon, bluffing } from "../../storyteller.js";

// The Slayer, mixed into Engine.prototype (see characters/index.js),
// so `this` is the Engine.
export const slayer = {
  slay(id) {
    const p = this.human();
    const t = this.player(id);

    if (
      this.s.slayerUsed ||
      ability(p) !== "slayer" ||
      !p.alive ||
      !t?.alive
    ) {
      throw Error("Slayer unavailable.");
    }

    this.s.slayerUsed = true;

    const killed = this.shoot(p, t);

    this.audit(
      "slayer",
      `${p.label} (${name(p.role)}) shot ${t.label}; ${
        killed ? "killed" : "no effect"
      }.`,
      { actorId: p.id, targetId: t.id, killed },
    );

    return killed;
  },

  // Resolves a Slayer shot; only a working Slayer can kill, and only the
  // Imp (or the Recluse, who registers as one). By their jinx, a Lleech's
  // host dies too (and so does the Lleech: see lleech.js).
  shoot(p, t) {
    if (
      ability(p) === "slayer" &&
      works(p) &&
      (isDemon(t) || t.role === "recluse" || this.lleechOf(t))
    ) {
      if (!isDemon(t) && this.lleechOf(t)) {
        this.audit("lleech", `${p.label} (Slayer) shot ${t.label}, the Lleech's host: the host dies (their jinx).`, {
          actorId: p.id,
          targetId: t.id,
        });
      }

      const before = this.alive().length;

      this.kill(t, "slayer");
      this.confirm(p, "certain", `their Slayer shot killed ${t.label}`);

      if (isDemon(t)) {
        this.successor(t, before, false);
      } else {
        this.check();
      }

      return true;
    }

    return false;
  },

  // At dawn, NPC Slayers (and NPCs bluffing Slayer; see bluffing()) may shoot once.
  npcShots() {
    const s = this.s;

    for (const p of s.players) {
      if (s.winner) {
        return;
      }

      const claimsSlayer = ability(p) === "slayer" || bluffing(p, "slayer");

      if (p.human || !p.alive || p.shotUsed || !claimsSlayer) {
        continue;
      }

      const t = this.strat.slay(s, p);

      if (!t) {
        continue;
      }

      p.shotUsed = true;
      this.claimPublicly(p);

      s.publicLog.push(
        `Day ${s.day} — ${p.label} claims Slayer and shoots ${t.label}.`,
      );

      const killed = this.shoot(p, t);

      if (!killed) {
        s.publicLog.push(`Day ${s.day} — Nothing happens.`);
      }

      this.audit(
        "slayer",
        `${p.label} (${name(p.role)}) shot ${t.label}; ${
          killed ? "killed" : "no effect"
        }.`,
        { actorId: p.id, targetId: t.id, killed },
      );
    }
  },
};
