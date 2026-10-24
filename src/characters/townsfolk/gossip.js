import { name, ARTIST_QUESTIONS } from "../../data.js";
import {
  ability,
  works,
  isDemon,
  steer,
  steerWhy,
  killHelps,
  who,
  bluffing,
  artistTruth,
  gossipInfo,
} from "../../storyteller.js";
import { heard, untwinned } from "../../strategy.js";
import { pick, Whose, byId } from "../../util.js";

// The Gossip, mixed into Engine.prototype (see characters/index.js),
// so `this` is the Engine.
export const gossip = {
  // A working Gossip's true statement yesterday: the Storyteller kills a
  // player tonight: any living NPC other than the Demon, the Gossip
  // included (but never the human, even as the Gossip).
  gossipDeaths() {
    const s = this.s;
    const said = s.gossip.filter((g) => g.day === s.night - 1);

    s.gossip = s.gossip.filter((g) => g.day >= s.night);

    for (const g of said) {
      const p = this.player(g.byId);
      const real = g.effective && ability(p) === "gossip" && works(p);

      if (!real || !g.truth || s.winner) {
        continue;
      }

      // (Any living NPC but the Demon.)
      const pool = untwinned(
        s,
        s.players.filter((x) => x.alive && !x.human && !isDemon(x)),
      );
      const t = pick(steer(s, pool, killHelps, "who dies for the Gossip"), s.r);

      this.audit(
        "gossip",
        `${Whose(p)} Gossip statement was true: ${
          t ? `${t.label} dies (why: ${steerWhy(s, pool, killHelps)})` : "nobody can die"
        }.`,
        { actorId: p.id, targetId: t?.id ?? null },
      );

      if (t && this.kill(t, "gossip")) {
        // (An extra death the night after their statement: maybe theirs.)
        this.confirm(
          p,
          "maybe",
          `the night after their Gossip statement, ${t.label} died too`,
        );
        this.check();
      }
    }
  },

  // NPC Gossips (and Gossip bluffers) who haven't made today's statement:
  // at dawn some do (see strategy gossip()); at the end of the day (`late`),
  // the rest do. A Gossip gossips every day.
  npcGossips(late = false) {
    const s = this.s;

    for (const p of s.players.filter(
      (x) =>
        !x.human &&
        x.alive &&
        x.gossipDay !== s.day &&
        (ability(x) === "gossip" || bluffing(x, "gossip")),
    )) {
      const said = this.strat.gossip(s, p, late);

      if (s.winner || !said) {
        continue;
      }

      this.gossipSays(p, said.target, said.question);
    }
  },

  // p makes a Gossip's public statement: "t is <evil / the Demon / ...>".
  gossipSays(p, t, q) {
    const s = this.s;
    const truth = artistTruth(t, q);
    const quote = `"${t.label} is ${ARTIST_QUESTIONS[q]}."`;
    const info = gossipInfo(s, t, q);

    p.gossipDay = s.day;
    s.gossip.push({
      byId: p.id,
      day: s.day,
      truth,
      effective: ability(p) === "gossip" && works(p),
    });
    p.memories.push(info);
    heard(s, p, [info]);

    if (p.human) {
      s.privateLog.push(`Day ${s.day}: You said ${quote}`);
      s.publicLog.push(`Day ${s.day} — You say: ${quote}`);
    } else {
      this.claimPublicly(p);
      s.publicLog.push(`Day ${s.day} — ${p.label} claims Gossip and says: ${quote}`);
    }

    this.audit(
      "gossip",
      `${p.label} (${name(p.role)}) said ${quote} (${truth ? "true" : "false"}).`,
      { actorId: p.id, targetId: t.id, truth },
    );
  },

  // The human Gossip's statement for the day.
  gossip(id, question) {
    const s = this.s;
    const h = this.human();
    const t = this.player(id);

    if (
      s.phase !== "day" ||
      s.winner ||
      ability(h) !== "gossip" ||
      !h.alive ||
      h.gossipDay === s.day ||
      !t ||
      t.human ||
      !ARTIST_QUESTIONS[question]
    ) {
      throw Error("Gossip unavailable.");
    }

    this.gossipSays(h, t, question);

    return `You said "${t.label} is ${ARTIST_QUESTIONS[question]}."`;
  },
};
