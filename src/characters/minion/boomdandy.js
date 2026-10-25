import { name } from "../../data.js";
import { isDemon, steer, steerWhy } from "../../storyteller.js";
import { sample } from "../../util.js";

// The Boomdandy, mixed into Engine.prototype (see characters/index.js),
// so `this` is the Engine.
export const boomdandy = {
  // The Boomdandy p was executed with their ability: all but 3 players die.
  // The Storyteller keeps you (if alive), the Demon and, to make up 3, the
  // players whose survival helps the team it's helping (see steer()). Then
  // the countdown waits for you to point (s.boom; see boomPoint()).
  boom(p) {
    const s = this.s;
    const alive = this.alive();
    const keep = [alive.find((x) => x.human), alive.find(isDemon)].filter(Boolean);
    const rest = alive.filter((x) => !keep.includes(x));
    const helps = (x) => x.alignment;

    keep.push(
      ...sample(
        steer(s, rest, helps, "who survives the Boomdandy"),
        Math.max(0, 3 - keep.length),
        s.r,
      ),
    );
    this.announce(
      `Day ${s.day} — ${p.label} was the Boomdandy: all but 3 players die.`,
    );
    this.audit(
      "boomdandy",
      `${p.label} (Boomdandy) was executed: all but ${keep
        .map((x) => x.label)
        .join(", ")} die (why: ${steerWhy(s, rest, helps)}).`,
      { actorId: p.id, keepIds: keep.map((x) => x.id) },
    );

    for (const x of alive.filter((y) => !keep.includes(y))) {
      this.kill(x, "boomdandy");
    }

    // (A death can end the game: a Klutz's choice, say. With 2 or fewer
    // left, there's no countdown.)
    if (s.winner || this.alive().length <= 2) {
      this.check();
      return;
    }

    s.boom = { byId: p.id, day: s.day };
    this.announce(
      `Day ${s.day} — Countdown from 10: everyone points at a living player. The one with the most players pointing at them dies.`,
    );
  },

  // The countdown: you point at living player `id` (anyone but you), or,
  // with no `id` (the countdown ran out first), at nobody; every NPC, living
  // or dead, points too (good players first, then evil ones, who see how
  // it's going; see strategy boomPoint()). The player with the most dies; on
  // a tie, nobody does. Then night falls, unless the game is over.
  boomPoint(id = null) {
    const s = this.s;
    const h = this.human();
    const t = id ? this.player(id) : null;
    const pool = this.alive();

    if (!s.boom || s.winner) {
      throw Error("No countdown.");
    }

    if (id && (!t?.alive || t.human)) {
      throw Error("Point at another living player.");
    }

    const from = s.publicLog.length;
    const counts = t ? { [t.id]: 1 } : {};
    const points = t ? [[h, t]] : [];
    const npcs = s.players.filter((x) => !x.human);

    for (const x of [
      ...npcs.filter((y) => y.alignment === "good"),
      ...npcs.filter((y) => y.alignment === "evil"),
    ]) {
      const at = this.strat.boomPoint(s, x, pool, counts);

      if (at) {
        counts[at.id] = (counts[at.id] ?? 0) + 1;
        points.push([x, at]);
      }
    }

    const most = Math.max(...Object.values(counts));
    const top = pool.filter((x) => counts[x.id] === most);
    const dies = top.length === 1 ? top[0] : null;

    s.boom = null;
    this.announce(
      `Day ${s.day} — 3, 2, 1… ${t ? "" : "You don't point; "}${points
        .sort(([a], [b]) => a.seat - b.seat)
        .map(
          ([x, at]) =>
            `${x.human ? "You point" : `${x.label} points`} at ${at.human ? "you" : at.label}`,
        )
        .join("; ")}.`,
    );
    this.audit(
      "boomdandy",
      `The countdown: ${pool
        .map((x) => `${x.label} (${name(x.role)}) ${counts[x.id] ?? 0}`)
        .join(", ")}; ${dies ? `${dies.label} dies` : "a tie: nobody dies"}. Who pointed at whom: ${
        points.length
          ? points.map(([x, at]) => `${x.label}${x.alive ? "" : " (dead)"} → ${at.label}`).join("; ")
          : "nobody"
      }.`,
      { targetId: dies?.id ?? null },
    );

    if (dies) {
      const before = this.alive().length;

      this.kill(dies, "boomdandy");

      if (isDemon(dies)) {
        this.successor(dies, before, false);
      } else {
        this.check();
      }
    } else {
      this.announce(`Day ${s.day} — A tie: nobody dies.`);
    }

    this.phaseCard("dusk", from);

    if (!s.winner) {
      s.night++;
      this.night();
    }
  },
};
