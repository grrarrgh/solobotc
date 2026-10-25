import { works, minionAbility, minionLabel } from "../../storyteller.js";
import { acts } from "../../abilities.js";

// The Fearmonger, mixed into Engine.prototype (see characters/index.js),
// so `this` is the Engine.
export const fearmonger = {
  // Each night, the Fearmonger (or an Alchemist with their ability: you
  // choose, if it's you) chooses a player (see strategy fearmonger()):
  // if they nominate and execute them, that player's team loses. A new
  // choice is announced at dawn (see fearmongerDawn()), if it worked.
  fearmonger() {
    const s = this.s;

    for (const f of s.players.filter((x) => acts(x) && minionAbility(x) === "fearmonger")) {
      const t = f.human ? this.humanPicks(f)?.[0] : this.strat.fearmonger(s, f);

      if (!t) {
        continue;
      }

      this.woke(f);
      this.chose(f, t);

      const effective = works(f);
      const fresh = t.id !== f.fearTarget;

      f.fearTarget = t.id;

      if (effective && fresh) {
        s.fearAnnounce = s.night;
      }

      this.audit(
        "fearmonger",
        `${f.label} (${minionLabel(f)}) chose ${t.label}${fresh ? "" : " again"}; ${
          effective
            ? `if they nominate and execute them, ${t.alignment} loses`
            : "it fails (drunk or poisoned)"
        }.`,
        { actorId: f.id, targetId: t.id, effective, fresh },
      );
    }
  },

  // At dawn, everyone learns if the Fearmonger chose a new player.
  fearmongerDawn() {
    const s = this.s;

    if (s.fearAnnounce !== s.night) {
      return;
    }

    s.fearmongerChose = s.day;
    this.announce(`Day ${s.day} — The Storyteller: the Fearmonger has chosen a new player.`);
  },

  // p was just executed, nominated by `nominatorId`: a working Fearmonger
  // who nominated their chosen player makes that player's team lose.
  // Returns whether they did.
  fearmongerWins(p, nominatorId) {
    const f = this.s.players.find(
      (x) =>
        minionAbility(x) === "fearmonger" && x.id === nominatorId && works(x) && x.fearTarget === p.id,
    );

    if (!f) {
      return false;
    }

    const winner = p.alignment === "good" ? "evil" : "good";

    this.audit(
      "fearmonger",
      `${f.label} (${minionLabel(f)}) nominated and executed ${p.label}, their chosen player: ${p.alignment} loses.`,
      { actorId: f.id, targetId: p.id },
    );
    this.finish(winner, `The Fearmonger nominated and executed ${p.label}, their chosen player.`);

    return true;
  },
};
