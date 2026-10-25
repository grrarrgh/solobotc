import { works, who } from "../../storyteller.js";
import { acts } from "../../abilities.js";

// The Lleech, mixed into Engine.prototype (see characters/index.js), so
// `this` is the Engine. It kills each night* like any Demon (see engine
// demon(); never its host: see strategy demon()).
export const lleech = {
  // A Lleech with no host (on Night 1, or one that became the Lleech since)
  // chooses one (see strategy lleechHost(); never you): they're poisoned,
  // and the Lleech dies if and only if they're dead.
  lleechHosts() {
    const s = this.s;

    for (const d of s.players.filter((x) => acts(x) && x.role === "lleech" && !x.lleechHost)) {
      const t = this.strat.lleechHost(s, d);

      if (!t) {
        continue;
      }

      this.woke(d);
      this.chose(d, t);

      const effective = works(d);

      if (effective) {
        d.lleechHost = t.id;
        t.poisoned = true;
        t.poisonedBy = who(d);
      }

      this.audit(
        "lleech",
        `${d.label} (Lleech) chose ${t.label} as their host; ${
          effective
            ? "poisoned, and the Lleech dies if and only if they're dead"
            : "it fails (drunk or poisoned): they choose again tomorrow night"
        }.`,
        { actorId: d.id, targetId: t.id, effective },
      );
    }
  },

  // At dusk: a living Lleech's host stays poisoned.
  lleechLasting() {
    for (const d of this.s.players.filter((x) => x.alive && x.role === "lleech")) {
      const host = this.player(d.lleechHost);

      if (host?.alive) {
        host.poisoned = true;
        host.poisonedBy = who(d);
      }
    }
  },

  // Tonight's targets for Lleech d came up empty, and the only others alive
  // are their host and you: the Demon never kills you, so the game could
  // never end. Instead, as in a real game, it kills you (2 alive remain).
  // Returns whether it did.
  lleechCornered(d, targets) {
    const s = this.s;
    const host = this.player(d.lleechHost);
    const rest = this.alive().filter((x) => x !== d && x !== host);

    if (targets.some(Boolean) || !host?.alive || rest.length !== 1 || !rest[0].human || !works(d)) {
      return false;
    }

    const you = rest[0];

    this.chose(d, you);
    this.audit(
      "lleech",
      `${d.label} (Lleech) has only their host and you left to kill: they kill you.`,
      { actorId: d.id, targetId: you.id },
    );

    if (this.kill(you, "demon")) {
      this.check();
    }

    return true;
  },

  // The living Lleech whose host is x, if any.
  lleechOf(x) {
    return this.s.players.find((d) => d.alive && d.role === "lleech" && d.lleechHost === x.id);
  },

  // Whether Lleech p can't die now: their host lives (and they have their
  // ability). (See abilities guard().)
  lleechSafe(p) {
    return p.role === "lleech" && works(p) && Boolean(this.player(p.lleechHost)?.alive);
  },

  // p just died (`cause`): if they were a Lleech's host, the Lleech dies
  // too, unless the host was executed while the Mastermind lives (their
  // jinx): then the Lleech lives, but loses their ability.
  lleechHostDied(p, cause) {
    const s = this.s;
    const d = this.lleechOf(p);

    if (!d) {
      return;
    }

    const mastermind = s.players.find((x) => x.alive && x.role === "mastermind" && works(x));

    if (cause === "execution" && mastermind) {
      d.drunkFrom = "lleech";
      d.drunkFromBy = "the Lleech and Mastermind jinx";
      this.audit(
        "lleech",
        `${p.label}, the Lleech's host, was executed while ${mastermind.label} (Mastermind) lives: ${d.label} (Lleech) lives, but loses their ability.`,
        { playerId: d.id, hostId: p.id },
      );
      return;
    }

    // (Counting the host, who was alive a moment ago: see successor().)
    const before = this.alive().length + 1;

    this.audit("lleech", `${p.label}, the Lleech's host, died: ${d.label} (Lleech) dies too.`, {
      playerId: d.id,
      hostId: p.id,
    });

    if (this.kill(d, "lleech")) {
      this.successor(d, before, false);
    }
  },
};
