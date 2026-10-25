import { name } from "../../data.js";
import { heard } from "../../strategy.js";

// The Moonchild, mixed into Engine.prototype (see characters/index.js),
// so `this` is the Engine.
export const moonchild = {
  // Last night's (or today's) Moonchild choice dies tonight if good.
  resolveMoonCurse() {
    const s = this.s;
    const t = this.player(s.moonCurse);

    s.moonCurse = null;

    // (The Monk only protects from the Demon: the Tea Lady and Innkeeper,
    // who protect from anything, are seen to in kill().)
    if (!t?.alive || t.alignment !== "good") {
      return;
    }

    // (The town sees the pick die: maybe a Demon kill, maybe the curse.)
    if (this.kill(t, "moonchild")) {
      this.confirm(
        this.player(s.moonCurseBy),
        "maybe",
        `the player they chose as the Moonchild, ${t.label}, died that night`,
      );
    }

    this.check();
  },

  // A dying Moonchild publicly picks a living player to curse. An evil NPC
  // bluffing Moonchild makes the same show, with no effect.
  moonchild(p) {
    const s = this.s;
    const t = this.strat.moonchild(s, p);

    if (!t) {
      return;
    }

    const real = p.role === "moonchild" && !p.poisoned;

    this.claimPublicly(p);

    if (real) {
      s.moonCurse = t.id;
      s.moonCurseBy = p.id;
    }

    // (So they can say at dawn if their pick didn't die: see moonchildDawn().)
    s.moonPicks = [...(s.moonPicks ?? []), { byId: p.id, targetId: t.id, day: s.day }];

    s.publicLog.push(`${p.label} claims Moonchild and chooses ${t.label}.`);

    this.audit(
      "moonchild",
      `${p.label} (${name(p.role)}) chose ${t.label}; ${
        real ? "cursed" : "no effect"
      }.`,
      { actorId: p.id, targetId: t.id, effective: real },
    );
  },

  // At dawn, a Moonchild (or Moonchild bluffer) whose pick is still alive
  // the morning after the curse says so in public: the curse didn't work,
  // so their pick may be evil (or was protected). The town weighs it
  // against the pick (see strategy infoStance()).
  moonchildDawn() {
    const s = this.s;
    const due = (s.moonPicks ?? []).filter((x) => x.day < s.day);

    s.moonPicks = (s.moonPicks ?? []).filter((x) => x.day >= s.day);

    for (const { byId, targetId } of due) {
      const p = this.player(byId);
      const t = this.player(targetId);

      if (p.human || !t.alive) {
        continue;
      }

      const m = {
        night: s.night,
        day: s.day,
        role: "moonchild",
        text: `Moonchild: chose ${t.label}, who didn't die.`,
        targets: [t.id],
        trigger: "normal",
        functioning: true,
      };
      const said = ` says: "As the Moonchild I chose ${t.label}, and they didn't die."`;

      p.memories.push(m);
      heard(s, p, [m]);
      s.publicLog.push(`Day ${s.day} — ${p.label}${said}`);
      this.audit("moonchild", `${p.label}${said}`, { playerId: p.id, targetId: t.id });
    }
  },
};

// How a Moonchild's information reads (see strategy stanceOn()): a pick who
// didn't die may be evil.
export const info = {
  stance: (m) => (/, who didn't die\.$/.test(m.text) ? "suspicious" : null),
};
