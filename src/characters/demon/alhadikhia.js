import { name, team } from "../../data.js";
import { works, isDemon } from "../../storyteller.js";
import { sample } from "../../util.js";
import { untwinned } from "../../strategy.js";

// The Al-Hadikhia, mixed into Engine.prototype (see characters/index.js), so
// `this` is the Engine.
//
// "Each night*, you may choose 3 players (all players learn who): each
// silently chooses to live or die, but if all live, all die." Its choice is
// made at dusk (alhadikhiaPlan()), so that if it chose you, you're woken to
// choose to live or die before the night goes on (alhadikhiaWake(); engine
// choose()). It chooses up to 3 good NPCs (see strategy alhadikhia()); you
// only when no good NPC is left. In its place in the night (engine demon()),
// each chosen player, in order, chooses (see strategy alhadikhiaLive()): a
// dead one who chooses to live comes back to life; a living one who chooses
// to die dies (unless something protects them from the Demon, and then they
// count as alive). Then if all are alive, all die. At dawn the Storyteller
// says who was chosen, and who is alive and who dead (alhadikhiaDawn()).
// Drunk or poisoned, they choose, but nothing happens. A Demon made tonight
// (by the Pit-Hag or the Engineer) chooses nobody tonight.
//
// Its jinxes: if it dies by execution with the Mastermind alive, that night
// it chooses 3 good players (you among them, if you're alive): if all 3
// choose to live, evil wins, otherwise good (alhadikhiaFinal()); and if
// there would be two Demons, one of which was the Scarlet Woman, she's the
// Scarlet Woman again (alhadikhiaTwoDemons()).
export const alhadikhia = {
  // At dusk: whom the living Al-Hadikhia chooses tonight (s.alhadikhia: {
  // night, demonId, ids, human }: `human`, your choice once made), or, on
  // the night after its execution with the Mastermind alive (their jinx),
  // the 3 good players: you, if alive, and good NPCs at random.
  alhadikhiaPlan() {
    const s = this.s;

    s.alhadikhia = null;

    if (s.alhadikhiaFinal?.night === s.night) {
      const h = this.human();
      const ids = [
        ...(h.alive ? [h] : []),
        ...sample(
          untwinned(s, s.players.filter((x) => x.alive && !x.human && x.alignment === "good")),
          h.alive ? 2 : 3,
          s.r,
        ),
      ].map((x) => x.id);

      s.alhadikhia = { night: s.night, final: true, ids, human: null };
      return;
    }

    const d = s.players.find((x) => x.alive && x.role === "alhadikhia");

    if (s.night < 2 || !d || s.atheist) {
      return;
    }

    s.alhadikhia = {
      night: s.night,
      demonId: d.id,
      ids: this.strat.alhadikhia(s, d).map((x) => x.id),
      human: null,
    };
  },

  // If the Al-Hadikhia chose you tonight and you haven't chosen yet, wakes
  // you to choose to live or die (s.pending: "live" or "die", see engine
  // choose()). True if it did.
  alhadikhiaWake() {
    const s = this.s;
    const a = s.alhadikhia;
    const h = this.human();

    if (!a || a.night !== s.night || !a.ids.includes(h.id) || a.human !== null) {
      return false;
    }

    const others = a.ids.filter((id) => id !== h.id).map((id) => this.player(id).label);

    s.pending = {
      role: "alhadikhia",
      night: s.night,
      count: 0,
      characters: ["live", "die"],
      liveOrDie: true,
      prompt: `${a.final ? "Its jinx with the Mastermind: the executed Al-Hadikhia" : "The Al-Hadikhia"} chose you${
        others.length ? ` (with ${others.join(" and ")})` : ""
      }. Do you choose to live or to die? ${
        a.final
          ? "If all of you choose to live, evil wins; otherwise, good wins."
          : `If all ${a.ids.length === 1 ? "of you (just you)" : "of you"} choose to live, all of you die.`
      }`,
    };
    this.audit("wake", `The Storyteller woke ${h.label}: the Al-Hadikhia chose them, to choose to live or die.`);

    return true;
  },

  // Your choice: to live (`live`) or to die.
  alhadikhiaAnswer(live) {
    const s = this.s;

    s.alhadikhia.human = live;
    s.pending = null;
    this.audit("choice", `${this.human().label} chose to ${live ? "live" : "die"} (Al-Hadikhia).`);
  },

  // The players chosen tonight, each with their choice (you: as you chose;
  // an NPC: see strategy alhadikhiaLive()), in order.
  alhadikhiaChoices(final = false) {
    const s = this.s;
    const a = s.alhadikhia;

    return a.ids.map((id) => {
      const t = this.player(id);

      return { t, live: t.human ? a.human !== false : this.strat.alhadikhiaLive(s, t, final) };
    });
  },

  // In the Al-Hadikhia d's place in the night: its choice, resolved.
  alhadikhiaNight(d) {
    const s = this.s;
    const a = s.alhadikhia;

    if (!a || a.night !== s.night || a.final || a.demonId !== d.id) {
      this.audit("alhadikhia", `${d.label} (Al-Hadikhia), made tonight, chooses nobody.`, { actorId: d.id });
      return;
    }

    if (!a.ids.length) {
      this.audit("alhadikhia", `${d.label} (Al-Hadikhia) chose nobody.`, { actorId: d.id });
      s.alhadikhia = null;
      return;
    }

    const choices = this.alhadikhiaChoices();
    const effective = works(d);
    const results = new Map();

    this.chose(
      d,
      choices.map((c) => c.t),
    );

    for (const { t, live } of choices) {
      this.woke(t);

      if (!effective) {
        results.set(t, "nothing happens");
      } else if (live && !t.alive) {
        this.revive(t, "alhadikhia");
        // (Unlike the Professor's: they can die again tonight, if all live.)
        s.revived = s.revived.filter((id) => id !== t.id);
        results.set(t, "came back to life");
        this.alhadikhiaTwoDemons();
      } else if (!live && t.alive) {
        const blocked = this.alhadikhiaKill(d, t);

        results.set(t, blocked ? `would have died, but ${blocked}: they count as alive` : "died");
      } else {
        results.set(t, live ? "lives" : "was already dead");
      }
    }

    const all = effective && choices.every((c) => c.t.alive);

    if (all) {
      for (const { t } of choices) {
        const blocked = this.alhadikhiaKill(d, t);

        results.set(t, `${results.get(t)}; all alive, so all die: ${blocked ? `but ${blocked}` : "died"}`);
      }
    }

    // (Why it chose them: see strategy demon().)
    const why = choices
      .map((c) => d.killWhy?.[c.t.id] && `${c.t.label}: ${d.killWhy[c.t.id]}`)
      .filter(Boolean);

    this.audit(
      "alhadikhia",
      `${d.label} (Al-Hadikhia) chose ${choices.map((c) => c.t.label).join(", ")}${
        effective ? "" : " (drunk or poisoned: nothing happens)"
      }: ${choices
        .map(({ t, live }) => `${t.label} (${name(t.role)}) chose to ${live ? "live" : "die"}, ${results.get(t)}`)
        .join("; ")}${why.length ? ` (why: ${why.join("; ")})` : ""}.`,
      { actorId: d.id, targetIds: a.ids, effective },
    );

    if (d.killWhy) {
      for (const c of choices) {
        delete d.killWhy[c.t.id];
      }
    }

    // (Said at dawn: see alhadikhiaDawn().)
    a.resolved = true;
    (s.alhadikhiaChosen ??= []).push({ night: s.night, ids: [...a.ids] });
    this.check();
  },

  // The Al-Hadikhia's death for t: unless the Demon can't kill them (the
  // Soldier, the Monk's protection, the Innkeeper's, the Tea Lady's, the
  // Sailor, the Fool). Returns what saved them, or null if they died.
  alhadikhiaKill(d, t) {
    if (!t.alive) {
      return null;
    }

    const guard = this.guard(t, "demon");
    const blocked =
      t.role === "soldier" && works(t)
        ? "the Soldier is safe from the Demon"
        : t.protected
          ? "the Monk protected them"
          : guard
            ? guard.text
            : this.foolSaves(t, "demon")
              ? "they survived as the Fool"
              : null;

    if (blocked) {
      return blocked;
    }

    this.kill(t, "demon");

    return t.alive ? "they can't die" : null;
  },

  // The night after the Al-Hadikhia's execution with the Mastermind alive
  // (their jinx): the 3 good players choose; all live, evil wins; else good.
  alhadikhiaFinal() {
    const s = this.s;
    const a = s.alhadikhia;
    const choices = this.alhadikhiaChoices(true);
    const all = choices.length > 0 && choices.every((c) => c.live);
    const said = choices.map((c) => `${c.t.label} chose to ${c.live ? "live" : "die"}`).join(", ");

    this.audit(
      "alhadikhia",
      `The executed Al-Hadikhia chose ${choices.map((c) => c.t.label).join(", ")} (its jinx with the Mastermind): ${said}; ${
        all ? "all chose to live, so evil wins" : "not all chose to live, so good wins"
      }.`,
      { targetIds: a.ids },
    );
    this.finish(
      all ? "evil" : "good",
      all
        ? "The executed Al-Hadikhia's 3 good players all chose to live (its jinx with the Mastermind)."
        : "Not all of the executed Al-Hadikhia's 3 good players chose to live (its jinx with the Mastermind).",
    );
  },

  // At dawn: who the Al-Hadikhia chose last night, and who of them is alive
  // and who dead (said even if nothing changed, or it was drunk or
  // poisoned; nothing if it chose nobody).
  alhadikhiaDawn() {
    const s = this.s;
    const a = s.alhadikhia;

    // (Not if it didn't choose after all: changed tonight by the Engineer or
    // the Pit-Hag, or kept asleep by the Exorcist.)
    if (!a || a.night !== s.day || a.final || !a.resolved) {
      return;
    }

    const chosen = a.ids.map((id) => this.player(id));
    const list = (xs) => xs.map((x) => x.label).join(", ");
    const alive = chosen.filter((x) => x.alive);
    const dead = chosen.filter((x) => !x.alive);

    this.announce(
      `Day ${s.day} — The Storyteller: the Al-Hadikhia chose ${list(chosen)}.${alive.length ? ` Alive: ${list(alive)}.` : ""}${
        dead.length ? ` Dead: ${list(dead)}.` : ""
      }`,
    );
  },

  // If there would be two Demons, one of which was the Scarlet Woman (one
  // the Al-Hadikhia brought back to life), she becomes the Scarlet Woman
  // again (their jinx).
  alhadikhiaTwoDemons() {
    const demons = this.s.players.filter((x) => x.alive && isDemon(x) && team(x.role) === "demon");
    const sw = demons.length > 1 && demons.find((x) => x.wasScarletWoman);

    if (sw) {
      sw.role = "scarletwoman";
      sw.shown = "scarletwoman";
      this.audit(
        "alhadikhia",
        `There would be two Demons, so ${sw.label}, who was the Scarlet Woman, is the Scarlet Woman again (their jinx).`,
        { playerId: sw.id },
      );
    }
  },
};
