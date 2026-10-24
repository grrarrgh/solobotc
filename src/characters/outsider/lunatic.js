import { name, team } from "../../data.js";
import { heard } from "../../strategy.js";
import { bySeat } from "../../util.js";

// The Lunatic, mixed into Engine.prototype (see characters/index.js),
// so `this` is the Engine.
export const lunatic = {
  // The Lunatic thinks they're the Demon: each night they "kill" someone,
  // with no effect. The Demon learns who they chose.
  lunatics() {
    const s = this.s;

    s.lunaticPick = null;

    for (const p of s.players.filter(
      (x) => x.alive && !x.human && x.role === "lunatic",
    )) {
      const t = this.strat.lunatic(s, p);

      if (!t) {
        continue;
      }

      this.woke(p);
      s.lunaticPick = t.id;
      s.lunaticPickNight = s.night;

      this.audit(
        "lunatic",
        `${p.label} (Lunatic) chose ${t.label} to "kill"; no effect, but the Demon learns it.`,
        { actorId: p.id, targetId: t.id },
      );
    }
  },

  // A Lunatic who died (and the game goes on) realises they weren't the
  // Demon: the next morning they say so, and who their "Minions" were.
  lunaticReveals() {
    const s = this.s;

    for (const p of s.players.filter(
      (x) =>
        !x.human &&
        !x.alive &&
        x.role === "lunatic" &&
        x.lunaticTeam &&
        !x.lunaticRevealed,
    )) {
      const team = p.lunaticTeam.map((id) => this.player(id));
      const list = bySeat(team).map((x) => x.label).join(" and ");
      const said = ` says: "I was the Lunatic: I thought I was the ${name(
        p.shown,
      )}. My Minions were ${list}."`;
      const info = {
        night: s.night,
        role: "lunatic",
        text: `Lunatic: my Minions were ${list}.`,
        targets: p.lunaticTeam,
        trigger: "death",
        functioning: true,
      };

      p.lunaticRevealed = true;
      p.claim = "lunatic";
      p.memories.push(info);
      this.claimPublicly(p);
      heard(s, p, [info]);
      s.publicLog.push(`Day ${s.day} — ${p.label}${said}`);
      this.audit("lunatic", `${p.label}${said}`, { playerId: p.id });
    }
  },
};
