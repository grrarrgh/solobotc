import { name, team } from "../../data.js";
import { ability, works, who, choiceInfo, bluffing } from "../../storyteller.js";
import { heard, claimTo, lied } from "../../strategy.js";

// The Professor, mixed into Engine.prototype (see characters/index.js),
// so `this` is the Engine.
export const professor = {
  // Once per game, from Night 2, the Professor chooses a dead player: a
  // Townsfolk comes back to life. (They wake each night until they use it.)
  professors() {
    const s = this.s;

    if (s.night < 2 || s.winner) {
      return;
    }

    for (const p of s.players.filter(
      (x) => x.alive && ability(x) === "professor" && !x.professorUsed,
    )) {
      const t = p.human
        ? this.humanPicks(p)?.[0]
        : this.strat.professor(s, p);

      this.woke(p);

      if (!t) {
        continue;
      }

      const revived =
        works(p) && !t.alive && !t.undead && team(t.role) === "townsfolk";

      p.professorUsed = true;

      this.audit(
        "professor",
        `${p.label} (${name(p.role)}) chose ${t.label}; ${
          revived ? "resurrected" : "no effect"
        }.`,
        { actorId: p.id, targetId: t.id, effective: revived },
      );

      if (revived) {
        this.revive(t, "professor");
        p.professorRevived = t.id;
      }

      // They see it fail. A player who claimed a Townsfolk lied (as far as
      // the Professor knows): the Professor says so in the morning.
      const lied = !revived && team(claimTo(t, p)) === "townsfolk";
      const info = choiceInfo(s, "professor", "chose", [t]);

      if (lied) {
        info.text = `Professor: chose ${t.label}, who stayed dead.`;
        p.professorExposed = t.id;
      } else if (!revived) {
        // (Not a Townsfolk claim: it says nothing about them.)
        info.text = `Professor: chose ${t.label}, who didn't come back.`;
        p.professorFailed = t.id;
      }

      this.remember(p, info);
    }
  },

  // An NPC Professor whose resurrection failed says so (or a Professor
  // bluffer says it did): the player they chose claimed a Townsfolk, so
  // they lied. Everyone weighs that player's statements the other way round
  // from now on (see strategy liars()), and it's public information against
  // them.
  //
  // A Professor whose choice came back says so too, and the town can
  // believe them (almost: a Shabaloth brings players back too); so does one
  // whose choice stayed dead without having claimed a Townsfolk.
  professorReveals() {
    const s = this.s;

    for (const p of s.players.filter(
      (x) => !x.human && x.alive && x.professorRevived,
    )) {
      const t = this.player(p.professorRevived);
      const said = ` says: "As the Professor I chose ${t.label}, and they came back."`;

      p.professorRevived = null;
      this.claimPublicly(p);
      s.publicLog.push(`Day ${s.day} — ${p.label}${said}`);
      this.audit("professor", `${p.label}${said}`, { playerId: p.id });

      if (t.alive) {
        this.confirm(p, "likely", `${t.label}, whom they chose as the Professor, came back to life`);
      }
    }

    for (const p of s.players.filter(
      (x) => !x.human && x.alive && x.professorExposed,
    )) {
      const t = this.player(p.professorExposed);
      const said = ` says: "As the Professor I chose ${t.label}, and they didn't come back: they weren't the ${name(
        t.claim,
      )}."`;

      const m = [...p.memories, ...(p.cover?.memories ?? [])].findLast(
        (x) => x.role === "professor",
      );

      p.professorExposed = null;
      s.exposed = [...new Set([...(s.exposed ?? []), t.id])];
      this.claimPublicly(p);
      heard(s, p, m ? [m] : []);
      s.publicLog.push(`Day ${s.day} — ${p.label}${said}`);
      this.audit("professor", `${p.label}${said}`, { playerId: p.id });
    }

    for (const p of s.players.filter(
      (x) => !x.human && x.alive && x.professorFailed,
    )) {
      const t = this.player(p.professorFailed);
      const said = ` says: "As the Professor I chose ${t.label}, and they didn't come back."`;

      p.professorFailed = null;
      this.claimPublicly(p);
      s.publicLog.push(`Day ${s.day} — ${p.label}${said}`);
      this.audit("professor", `${p.label}${said}`, { playerId: p.id });
    }
  },

  // A Professor bluffer "uses" it once, from Night 2, on a dead player who
  // claimed a Townsfolk, and says in the morning they stayed dead (see
  // professorReveals()): they lied, so their word counts against them. (A
  // good player's cover story only on one they strongly suspect: see
  // strategy professorBluff().)
  professorBluff(p) {
    const s = this.s;

    if (!bluffing(p, "professor") || p.professorUsed || s.night < 2) {
      return;
    }

    const t = this.strat.professorBluff(s, p);

    if (t) {
      p.professorUsed = true;
      p.professorExposed = t.id;
      this.rememberBluff(p, {
        ...choiceInfo(s, "professor", "chose", [t]),
        text: `Professor: chose ${t.label}, who stayed dead.`,
      });
    }
  },
};

// How the Professor's information reads (see strategy stanceOn()): a
// player who claimed a Townsfolk and stayed dead lied.
export const info = {
  stance: (m) => (/, who stayed dead\.$/.test(m.text) ? "suspicious" : null),
};
