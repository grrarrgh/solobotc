import { name, team } from "../../data.js";
import {
  poppyBlocks,
  works,
  shielded,
  lean,
  steer,
  steerWhy,
  killHelps,
} from "../../storyteller.js";
import { untwinned } from "../../strategy.js";
import { pick } from "../../util.js";

// Lil' Monsta, mixed into Engine.prototype (see characters/index.js), so
// `this` is the Engine.
//
// Lil' Monsta isn't a player: an extra Minion is dealt instead (see
// setup.js), and one Minion at a time babysits it (p.babysitting), and "is
// the Demon": isDemon() counts them (storyteller.js), so they register as
// the Demon to every ability, and if they die, Lil' Monsta dies and good
// wins (engine check()). They keep their own Minion ability and alignment.
//
// Each night the Minions choose who babysits it (lilMonsta()): the one the
// town suspects least, keeping it where it is on a tie. Each night* the
// Storyteller chooses who might die (lilMonstaKill()), never the babysitter,
// steering for a close finish; the kill can't fail through drunkenness or
// poison, and the Exorcist doesn't stop it (Lil' Monsta doesn't wake to
// kill). Their jinxes: with the Poppy Grower alive, the babysitter keeps
// it; with the Magician alive, the Storyteller chooses the babysitter; the
// Scarlet Woman babysits for good if it dies with 5 or more alive
// (lilMonstaSuccessor()); and a babysitting Psychopath dies when executed
// (psychopath.js).
export const lilmonsta = {
  // The player babysitting Lil' Monsta, or null.
  babysitter() {
    return this.s.players.find((x) => x.babysitting) ?? null;
  },

  // The Demon d, for the log: "Player 4 (Imp)", or "Lil' Monsta (babysat by
  // Player 4, the Poisoner)".
  demonName(d) {
    return d.babysitting
      ? `Lil' Monsta (babysat by ${d.label}, the ${name(d.role)})`
      : `${d.label} (${name(d.role)})`;
  },

  // The Minions who could babysit Lil' Monsta: living evil Minions (not the
  // Marionette, who thinks they're good and doesn't wake with them).
  sitters() {
    return this.s.players.filter(
      (x) =>
        x.alive &&
        !x.human &&
        x.alignment === "evil" &&
        team(x.role) === "minion" &&
        x.role !== "marionette",
    );
  },

  // Moves Lil' Monsta to player t (from whoever had it).
  babysit(t) {
    for (const x of this.s.players) {
      x.babysitting = x === t;
    }

    // (For the Final reveal: see app.js playerNotes().)
    t.babysat = true;
  },

  // Each night (from Night 2: setup gives it its first babysitter) the
  // Minions choose who babysits Lil' Monsta.
  lilMonsta() {
    const s = this.s;
    const current = this.babysitter();
    const options = this.sitters();

    // (Not once it's dead: its babysitter died, on the Mastermind's extra
    // day, or with the twins keeping the game going.)
    if (s.lilMonsta && current && !current.alive) {
      s.lilMonsta.dead = true;
    }

    if (!s.lilMonsta || s.lilMonsta.dead || !options.length) {
      return;
    }

    // (They all wake for it: the Chambermaid counts them.)
    for (const x of options) {
      this.woke(x);
    }

    const choose = (t, why) => {
      this.babysit(t);
      this.audit(
        "lilmonsta",
        `${t === current ? "Lil' Monsta stays with" : "Lil' Monsta moves to"} ${t.label} (${name(t.role)})${
          t !== current && current ? `, from ${current.label}` : ""
        }: they babysit it and "are the Demon" (why: ${why}).`,
        { playerId: t.id, previousId: current?.id ?? null },
      );
    };

    // (The Scarlet Woman's jinx: she keeps it for the rest of the game.)
    const fixed = options.find((x) => x.id === s.lilMonsta.fixed);

    if (fixed) {
      choose(fixed, "the Scarlet Woman babysits it for the rest of the game");
      return;
    }

    // (The Poppy Grower's jinx: the Minions wake one by one, until one takes
    // it. Not knowing each other, its babysitter takes it again.)
    if (poppyBlocks(s) && options.includes(current)) {
      choose(
        current,
        "the Poppy Grower is alive, so the Minions wake one by one, and its babysitter takes it again",
      );
      return;
    }

    // (The Magician's jinx: the Storyteller chooses.)
    if (s.players.some((x) => x.alive && x.role === "magician")) {
      choose(
        pick(options, s.r),
        `the Magician is alive, so the Storyteller chooses: at random from ${options.length}`,
      );
      return;
    }

    // Otherwise the Minions agree on the one the town suspects least: good
    // NPCs who suspect them, plus 2 if they were nominated today, plus 1 if
    // you've marked them evil, plus 8 if they've shown they're evil in
    // public. Moving it changes who registers as the Demon, which info
    // roles may notice, so on a tie it stays where it is.
    const good = s.players.filter((x) => x.alive && !x.human && x.alignment === "good");
    const heat = (x) =>
      good.filter((g) => g.suspicion?.targetId === x.id).length +
      (s.nominated.includes(x.id) ? 2 : 0) +
      (s.marks?.[x.id] === "evil" ? 1 : 0) +
      ((s.outed ?? []).some((o) => o.id === x.id) ? 8 : 0);
    const scores = new Map(options.map((x) => [x, heat(x) - (x === current ? 0.5 : 0)]));
    const best = Math.min(...scores.values());
    const top = options.filter((x) => scores.get(x) === best);
    const t = top.includes(current) ? current : pick(top, s.r);

    choose(
      t,
      `the Minion the town suspects least: ${options
        .map((x) => `${x.label} ${heat(x)}`)
        .join(", ")}${top.length > 1 && !top.includes(current) ? `, at random of ${top.length}` : ""}`,
    );
  },

  // Each night*, a player might die: the Storyteller chooses who (never the
  // babysitter, nor you: as with any night death, nor anyone it knows can't
  // die tonight), steering for a close finish (see storyteller.js lean()).
  // While it helps good, it kills an evil player (another Minion), or
  // nobody. The kill comes from the babysitter, as the Demon's attack, so
  // the Monk, Soldier and the like still stop it (see engine attack()).
  lilMonstaKill(d) {
    const s = this.s;
    const pool = untwinned(
      s,
      s.players.filter(
        (x) =>
          x.alive &&
          !x.human &&
          x !== d &&
          !s.revived.includes(x.id) &&
          !x.protected &&
          !shielded(s, x) &&
          !(x.role === "soldier" && works(x)),
      ),
    );
    const side = lean(s);
    const helping = side ? pool.filter((x) => killHelps(x) === side) : pool;
    const t = side === "good" && !helping.length ? null : pick(steer(s, pool, killHelps, "who Lil' Monsta kills"), s.r);
    const why = !t
      ? pool.length
        ? "the Storyteller is helping good, and no evil player but the babysitter can die"
        : "nobody it can kill"
      : steerWhy(s, pool, killHelps);

    // (With no NPC it can kill, it kills you, as any Demon does: see
    // strategy demon(). Else the game could never end: say, with you the
    // Tea Lady between two good neighbours.)
    const you = s.players.find((x) => x.human && x.alive);

    if (!pool.length && you && !s.revived.includes(you.id)) {
      (d.killWhy ??= {})[you.id] = "the Storyteller's choice: nobody but its own team is left to kill, besides you";
      this.attack(d, you);
      return;
    }

    if (!t) {
      this.audit("lilmonsta", `Lil' Monsta: nobody dies tonight (why: ${why}).`);
      return;
    }

    (d.killWhy ??= {})[t.id] = `the Storyteller's choice: ${why}`;
    this.attack(d, t);
  },

  // The babysitter died (`before`: how many were alive just before). By
  // their jinx, with 5 or more alive, a working Scarlet Woman babysits Lil'
  // Monsta for the rest of the game. Returns whether she did.
  lilMonstaSuccessor(dead, before) {
    const s = this.s;
    const sw = s.players.find((x) => x.alive && x.role === "scarletwoman" && works(x));

    if (!dead.babysitting || before < 5 || !sw) {
      return false;
    }

    this.babysit(sw);
    s.lilMonsta.fixed = sw.id;
    this.audit(
      "succession",
      `${dead.label} (${name(dead.role)}) died babysitting Lil' Monsta with ${before} alive: ${sw.label} (Scarlet Woman) babysits it for the rest of the game.`,
      { playerId: sw.id, previousDemonId: dead.id },
    );

    return true;
  },
};
