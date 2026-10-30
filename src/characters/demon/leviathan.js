import { name } from "../../data.js";
import { ability, infoMode, works } from "../../storyteller.js";
import { living } from "../../abilities.js";
import { ravenInfo } from "../townsfolk/ravenkeeper.js";
import { sageInfo } from "../townsfolk/sage.js";

// The characters the Leviathan's night choice is for (their jinxes).
const JINXED = ["ravenkeeper", "sage", "farmer"];

// 1st, 2nd, 3rd, 4th...
const nth = (k) => ["1st", "2nd", "3rd"][k - 1] ?? `${k}th`;

// The Leviathan, mixed into Engine.prototype (see characters/index.js), so
// `this` is the Engine.
//
// The Leviathan doesn't kill at night (leviathanNight()). Everyone knows
// it's in play: each morning the Storyteller says so, and which day it is
// (leviathanDawn()). Each execution of a good player counts, by their
// alignment as they're executed, even if they don't die (or were dead
// already): the second one wins for evil (leviathanExecuted()). If it's
// alive at the end of Day 5, evil wins (leviathanDusk()). Drunk or
// poisoned, neither win happens while it lasts; the count goes on.
//
// Its jinxes: if it nominates and executes the Soldier, or the player the
// Monk or Innkeeper protected last night, or the Exorcist chose, good wins;
// if the Grandmother's grandchild dies by execution, evil wins; with the
// Mayor alive and no execution, Day 5's end wins for good instead; with
// the Ravenkeeper, Sage or Farmer on the script, each night* it chooses an
// alive player (never the same twice): a Ravenkeeper, Sage or Farmer chosen
// uses their ability without dying (a Farmer makes another Farmer: see
// farmer.js); and the Pit-Hag can't make one after Day 5 (strategy
// pithag()).
export const leviathan = {
  // The living Leviathan, or null.
  leviathanInPlay() {
    return this.s.players.find((x) => living(x) && x.role === "leviathan") ?? null;
  },

  // Each morning: the Leviathan is in play, and which day it is.
  leviathanDawn() {
    const s = this.s;
    const d = this.leviathanInPlay();

    if (!d || s.winner) {
      return;
    }

    const good = s.leviathan?.good.length ?? 0;

    this.announce(
      `Day ${s.day} — The Storyteller: the Leviathan is in play. It is Day ${s.day}.${
        s.day >= 5 ? " If it lives through today, evil wins." : ""
      }`,
    );
    this.audit(
      "leviathan",
      `The Leviathan (${d.label}) is in play on Day ${s.day}: ${good} good player${
        good === 1 ? "" : "s"
      } executed so far (a 2nd wins for evil); evil wins if it lives through Day 5.`,
      { actorId: d.id, good },
    );
  },

  // The Leviathan's night: no kill. With the Ravenkeeper, Sage or Farmer
  // on the script, their jinx: it chooses an alive player (not one chosen
  // before; a good one, with the Farmer: see strategy leviathan()), and a
  // Ravenkeeper, Sage or Farmer chosen uses their ability but doesn't die.
  leviathanNight(d) {
    const s = this.s;

    this.audit("leviathan", `${d.label} (Leviathan) doesn't kill at night.`, { actorId: d.id });

    if (!JINXED.some((id) => s.script.ids.includes(id)) || this.demonSleeps(d)) {
      return;
    }

    // (How log.txt names the jinx: with the Farmer, those on the script.)
    const on = JINXED.filter((id) => s.script.ids.includes(id)).map(name);
    const jinx = !s.script.ids.includes("farmer")
      ? "Ravenkeeper and Sage jinx"
      : on.length > 1
        ? `${on.slice(0, -1).join(", ")} and ${on.at(-1)} jinxes`
        : "Farmer jinx";

    const L = (s.leviathan ??= { good: [], chosen: [], executions: 0 });
    const t = this.strat.leviathan(s, d);

    if (!t) {
      this.audit(
        "leviathan",
        `${d.label} (Leviathan) has nobody left to choose (${jinx}).`,
        { actorId: d.id },
      );
      return;
    }

    this.woke(d);
    L.chosen.push(t.id);

    const effective = works(d);
    const role = ability(t);
    const uses = effective && t.alive && JINXED.includes(role);

    this.audit(
      "leviathan",
      `${d.label} (Leviathan) chose ${t.label} (${name(t.role)}) (${jinx})${
        !effective
          ? ", but it failed (the Leviathan is drunk or poisoned)"
          : uses
            ? `: as the ${name(role)}, they use their ability, but don't die`
            : ": nothing happens"
      }.`,
      { actorId: d.id, targetId: t.id, effective },
    );

    if (!uses) {
      return;
    }

    this.woke(t);

    if (role === "farmer") {
      this.farmerUses(t, "was chosen by the Leviathan (their jinx), and doesn't die");
    } else if (role === "ravenkeeper") {
      const pick = this.strat.raven(s, t);

      if (pick) {
        this.remember(t, ravenInfo(s, t, pick));
      }
    } else {
      this.remember(t, sageInfo(s, t, infoMode(s, t)));
    }
  },

  // p was just executed (nominated by `nominatorId`; `died`: and died):
  // the Leviathan's count, and its jinxes. Returns whether the game ended.
  leviathanExecuted(p, nominatorId, died) {
    const s = this.s;
    const d = this.leviathanInPlay();

    if (!d) {
      return false;
    }

    const L = (s.leviathan ??= { good: [], chosen: [], executions: 0 });

    // (Everyone knows how many have been executed, not who was good: see
    // strategy leviathanRisk().)
    L.executions++;

    // (The jinxes: if it nominates and executes one of these, good wins.)
    if (nominatorId === d.id) {
      const why =
        ability(p) === "soldier" && works(p)
          ? "the Soldier"
          : p.protected
            ? "the player the Monk protected"
            : p.safeNight === s.night
              ? "a player the Innkeeper protected"
              : p.exorcised === s.night
                ? "the player the Exorcist chose"
                : null;

      if (why) {
        this.audit(
          "leviathan",
          `${d.label} (Leviathan) nominated and executed ${p.label} (${name(p.role)}), ${why} (their jinx): good wins.`,
          { actorId: d.id, targetId: p.id },
        );
        this.finish("good", `The Leviathan nominated and executed ${why}.`);
        return true;
      }
    }

    if (p.alignment !== "good") {
      this.audit(
        "leviathan",
        `${p.label} (${name(p.role)}) was executed: evil, so it doesn't count for the Leviathan (${L.good.length} good executed).`,
        { playerId: p.id, good: L.good.length },
      );
      return false;
    }

    L.good.push(p.id);

    // (The Grandmother's jinx.)
    const gran =
      died && s.players.find((x) => x.alive && x.role === "grandmother" && x.grandchild === p.id && works(x));

    if (gran) {
      this.audit(
        "leviathan",
        `${p.label} (${name(p.role)}), the Grandmother's grandchild, died by execution while the Leviathan is in play (their jinx): evil wins.`,
        { playerId: p.id, actorId: gran.id },
      );
      this.finish("evil", "The Grandmother's grandchild was executed while the Leviathan is in play.");
      return true;
    }

    const wins = L.good.length >= 2 && works(d);

    this.audit(
      "leviathan",
      `${p.label} (${name(p.role)}) was executed: good, the ${nth(L.good.length)} good execution while the Leviathan is in play${
        wins
          ? ": evil wins"
          : L.good.length >= 2
            ? ", but the Leviathan is drunk or poisoned: evil doesn't win yet"
            : " (a 2nd wins for evil)"
      }.`,
      { playerId: p.id, good: L.good.length },
    );

    if (wins) {
      this.finish("evil", "A second good player was executed while the Leviathan is in play.");
    }

    return wins;
  },

  // The end of the day: once Day 5 is over, with the Leviathan alive, evil
  // wins (or, with no execution today and the Mayor alive, good: their
  // jinx). Drunk or poisoned, not yet. Returns whether the game ended.
  leviathanDusk() {
    const s = this.s;
    const d = this.leviathanInPlay();

    if (!d || s.winner || s.day < 5) {
      return false;
    }

    if (!works(d)) {
      this.audit(
        "leviathan",
        `Day ${s.day} is over, but ${d.label} (Leviathan) is drunk or poisoned: evil doesn't win yet.`,
        { actorId: d.id },
      );
      return false;
    }

    const mayor =
      !s.executedToday && s.players.find((x) => x.alive && ability(x) === "mayor" && works(x));

    if (mayor) {
      this.audit(
        "leviathan",
        `Day ${s.day} is over with no execution, and ${mayor.label} (Mayor) and the Leviathan are alive (their jinx): the Mayor's team wins.`,
        { actorId: mayor.id },
      );
      this.finish(mayor.alignment, "The Mayor and the Leviathan lived through Day 5 with no execution.");
      return true;
    }

    this.audit("leviathan", `Day ${s.day} is over and ${d.label} (Leviathan) lives: evil wins.`, {
      actorId: d.id,
    });
    this.finish("evil", "The Leviathan lived through Day 5.");
    return true;
  },
};
