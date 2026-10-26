import {
  name,
  team,
  PUBLIC_INFO_MIN_SEATS,
  PUBLIC_INFO_CHANCE,
  PROTECTION_ROLES,
  SINK_KILL_CHANCE,
  alignment,
  HIDDEN_OUTSIDERS,
  HIDE_NEVER_AS,
} from "./data.js";
import { ability, works, isDemon, teaLadyOf } from "./storyteller.js";
import { backStory } from "./bluff.js";
import { speak, heard } from "./strategy.js";
import { pick, tick } from "./util.js";

// Minions keep acting after death if the Vigormortis killed them.
export const acts = (x) => x.alive || x.vigor;

// Really alive: living, or a Zombuul that only registers as dead.
export const living = (x) => x.alive || x.undead;

// Ability mechanics that several characters share (waking, choosing,
// protection, coming back to life, madness, claims), mixed into
// Engine.prototype (see engine.js), so `this` is the Engine.
export const abilities = {
  // The nearest Townsfolk on each side of p, alive or dead: a dead one
  // doesn't pass the No Dashii's (or the Vigormortis's) poison on to the
  // next. (Outsiders, Minions and the Demon are skipped.)
  townsfolkNeighbours(p) {
    const a = this.s.players;
    const n = a.length;
    const i = a.indexOf(p);
    const out = [];

    for (const d of [-1, 1]) {
      for (let k = 1; k < n; k++) {
        const q = a[(i + d * k + n) % n];

        if (team(q.role) === "townsfolk") {
          if (!out.includes(q)) {
            out.push(q);
          }

          break;
        }
      }
    }

    return out;
  },

  // At dawn, a living NPC whose claim no longer matches what they last
  // claimed in public says so (nothing is said if they never claimed in
  // public):
  // - publicly mad as X yesterday, and no longer (or now mad about something
  //   else): "Yesterday the Cerenovus made me mad as the X, I am actually the
  //   Y" (their real character, an evil player's bluff, or the new madness);
  // - newly mad: "now claims to be the X" (the madness isn't given away);
  // - changed by the Pit-Hag, Barber or Snake Charmer: "woke up as the X".
  //
  // Every good NPC whose character changed in the night says so, and what
  // they were before, whether or not they'd claimed in public. (Evil players
  // say nothing about a change: it wouldn't help them.) A Damsel the
  // Huntsman found says she was the Damsel: the Minions can't win by
  // guessing her now, so she has nothing left to hide.
  announceClaims() {
    const s = this.s;

    for (const p of s.players) {
      const before = p.publicClaim;
      const wasMad = p.wasMad;
      const dusk = p.dusk;

      p.wasMad = null;
      p.dusk = null;

      const saved = p.huntsmanSaved?.night === s.night;

      if (
        !p.human &&
        p.alive &&
        p.alignment === "good" &&
        dusk &&
        (saved || (dusk.role !== p.role && dusk.claim !== p.claim))
      ) {
        // (A new character ends any cover story.)
        p.cover = null;

        const from = saved ? "damsel" : dusk.claim;
        const said = saved
          ? `: "I was the Damsel${
              dusk.claim !== "damsel" ? `, hiding as the ${name(dusk.claim)}` : ""
            }. The Huntsman chose me last night, and I woke up as the ${name(p.claim)}."`
          : ` says they woke up as the ${name(p.claim)}; they were the ${name(dusk.claim)}.`;

        p.changes = [
          ...(p.changes ?? []),
          { night: s.night, from, to: p.claim, told: false },
        ];
        this.claimPublicly(p);
        s.publicLog.push(`Day ${s.day} — ${p.label}${said}`);
        this.audit("claim", `${p.label}${said}`, {
          playerId: p.id,
          from,
          to: p.claim,
        });

        if (saved) {
          this.damselSaved(p);
        }

        continue;
      }

      if (!p.human && wasMad) {
        this.explainMadness(p, wasMad, before === wasMad);
      }

      // (Dead or alive, a player whose madness was public explains it.)
      const publicMadness = wasMad && before === wasMad;

      if (
        p.human ||
        (!p.alive && !publicMadness) ||
        !before ||
        before === (p.cover?.as ?? p.claim)
      ) {
        continue;
      }

      const said =
        wasMad && before === wasMad
          ? `: "Yesterday the Cerenovus made me mad as the ${name(
              wasMad,
            )}, I am actually the ${name(p.claim)}."`
          : p.mad?.day === s.day
            ? ` now claims to be the ${name(p.claim)}.`
            : ` says they woke up as the ${name(p.claim)}.`;

      this.claimPublicly(p);
      s.publicLog.push(`Day ${s.day} — ${p.label}${said}`);
      this.audit("claim", `${p.label}${said}`, {
        playerId: p.id,
        from: before,
        to: p.claim,
      });
    }
  },

  // When p's madness about `role` ends, they explain it to everyone they
  // told it in private (you included): "Yesterday the Cerenovus made me mad
  // as the X, I am actually the Y". Anyone who heard it, there or in public
  // (`inPublic`; see announceClaims()), no longer holds the changed story
  // against them (see strategy evidence()).
  explainMadness(p, role, inPublic) {
    const s = this.s;
    const claim = p.cover?.as ?? p.claim;
    const said = `"Yesterday the Cerenovus made me mad as the ${name(
      role,
    )}, I am actually the ${name(claim)}."`;
    const listeners = s.players.filter(
      (x) => x !== p && x.toldMe?.[p.id]?.claim === role,
    );

    (p.madAbout ??= []).push(role);

    for (const x of listeners) {
      x.toldMe[p.id] = { claim, day: s.day, at: tick(s), was: role };
    }

    if (inPublic || !listeners.length) {
      return;
    }

    if (listeners.some((x) => x.human)) {
      s.publicLog.push(`Day ${s.day} — ${p.label} tells you: ${said}`);
    }

    this.audit("claim", `${p.label} tells ${listeners
      .map((x) => (x.human ? "you" : x.label))
      .join(", ")}: ${said}`, { playerId: p.id, from: role, to: claim });
  },

  // In bigger games (PUBLIC_INFO_MIN_SEATS+), an NPC with first-night (or
  // spent) information may share it in public the morning they get it, at
  // PUBLIC_INFO_CHANCE for their character. Evil bluffers share their bluffed
  // information the same way. Sharing it reveals their claim.
  shareInfo() {
    const s = this.s;

    if (s.players.length < PUBLIC_INFO_MIN_SEATS) {
      return;
    }

    for (const p of s.players) {
      const news = p.memories.filter(
        (m) =>
          m.night === s.night &&
          !m.day &&
          !m.shared &&
          PUBLIC_INFO_CHANCE[m.role] !== undefined,
      );

      // (A cover story stays a secret.)
      if (p.human || p.mad?.day === s.day || p.cover || !news.length) {
        continue;
      }

      const m = news.at(-1);

      if (s.r() >= PUBLIC_INFO_CHANCE[m.role]) {
        continue;
      }

      const said = ` says: "I am the ${name(p.claim)}. Night ${m.night}: ${speak(
        m.text,
      )}"`;

      this.claimPublicly(p);
      heard(s, p, [m]);
      s.publicLog.push(`Day ${s.day} — ${p.label}${said}`);
      this.audit("share", `${p.label}${said}`, { playerId: p.id });
    }
  },

  // At dawn, an NPC who died in the night claiming the Ravenkeeper (the real
  // one, or an evil bluffer) says so in public, with the
  // character they learned, whatever the number of seats: it's the point of
  // the claim. (A cover story stays a secret.)
  ravenkeeperReveal() {
    const s = this.s;

    for (const p of s.players) {
      const m = p.memories.findLast(
        (x) => x.role === "ravenkeeper" && x.night === s.night,
      );

      if (
        p.human ||
        p.alive ||
        p.diedAtNight !== s.night ||
        p.cover ||
        p.claim !== "ravenkeeper" ||
        !m
      ) {
        continue;
      }

      const said = ` says: "I am the Ravenkeeper. Night ${m.night}: ${speak(m.text)}"`;

      // (So shareInfo() doesn't share it again.)
      m.shared = true;
      this.claimPublicly(p);
      heard(s, p, [m]);
      s.publicLog.push(`Day ${s.day} — ${p.label}${said}`);
      this.audit("share", `${p.label}${said}`, { playerId: p.id });
    }
  },

  // At dawn, a "mad" NPC switches their claim for the day, and makes up
  // plausible information to go with it. (Not one killed the night they were
  // made mad as the Ravenkeeper: they come clean; see madRavenkeeper().)
  applyMadness() {
    const s = this.s;

    for (const p of s.players) {
      if (this.madRavenkeeper(p)) {
        continue;
      }

      if (p.mad?.day === s.day && p.mad.previous === null) {
        p.mad.previous = p.claim;
        p.mad.memories = backStory(s, p, p.mad.role, this.strat);
        p.claim = p.mad.role;
      }
    }
  },

  // What a player who just learned their (new) character claims: that
  // character, except that a Mutant or Damsel (who doesn't know what's in
  // play) keeps claiming the Townsfolk they claimed before, so nothing gives
  // them away, or else any Townsfolk on the script (see HIDDEN_OUTSIDERS).
  claimFor(p) {
    const s = this.s;

    if (!HIDDEN_OUTSIDERS.includes(p.role)) {
      return p.role;
    }

    return team(p.claim) === "townsfolk" && !HIDE_NEVER_AS.includes(p.claim)
      ? p.claim
      : (pick(
          s.script.ids.filter(
            (id) => team(id) === "townsfolk" && !HIDE_NEVER_AS.includes(id),
          ),
          s.r,
        ) ?? p.claim);
  },

  // p woke tonight due to their ability (what the Chambermaid learns about).
  // Whether p uses a "first night" ability tonight: on Night 1, or the
  // night they gained it (eaten by the Cannibal, swapped by the Barber, or
  // made by the Pit-Hag: p.gainedNight).
  startsTonight(p) {
    return this.s.night === 1 || p.gainedNight === this.s.night;
  },

  woke(p) {
    const s = this.s;

    if (p && !s.woke.includes(p.id)) {
      s.woke.push(p.id);
    }
  },

  // `actor` chose `targets` with their ability. The first player each night
  // to choose a working Goon is drunk until dusk, and the Goon joins their
  // team (but a Goon the Pit-Hag made from an evil player never turns good:
  // their jinx). Call this before checking whether the actor's ability works.
  // Who the Demon chose tonight is kept in s.demonChose (for the
  // Mathematician and Lunatic jinx: see storyteller.js mathCount()).
  chose(actor, targets) {
    const s = this.s;

    this.sailorResolve({ actor });

    if (s.phase === "night" && isDemon(actor)) {
      if (s.demonChose?.night !== s.night) {
        s.demonChose = { night: s.night, ids: [] };
      }

      s.demonChose.ids.push(...[].concat(targets ?? []).filter(Boolean).map((t) => t.id));
    }

    for (const t of [].concat(targets ?? [])) {
      if (
        !t ||
        t === actor ||
        t.role !== "goon" ||
        !works(t) ||
        t.goonNight === s.night
      ) {
        continue;
      }

      const locked = t.goonStaysEvil && actor.alignment === "good";
      const turned = !locked && t.alignment !== actor.alignment;

      t.goonNight = s.night;

      if (!locked) {
        t.alignment = actor.alignment;
      }

      actor.drunkTonight = true;
      actor.drunkBy = `choosing ${t.label}, the Goon`;

      if (turned) {
        t.suspicion = null;
      }

      this.audit(
        "goon",
        `${actor.label} (${name(actor.role)}) chose ${t.label} (Goon): ${
          actor.label
        } is drunk until dusk${turned ? `; ${t.label} turns ${t.alignment}` : ""}.`,
        { actorId: actor.id, targetId: t.id, alignment: t.alignment },
      );
    }
  },

  // The living players either side of p.
  aliveNeighbours(p) {
    const a = this.s.players;
    const n = a.length;
    const i = a.indexOf(p);
    const out = [];

    for (const d of [-1, 1]) {
      for (let k = 1; k < n; k++) {
        const q = a[(i + d * k + n) % n];

        if (q.alive) {
          if (q !== p && !out.includes(q)) {
            out.push(q);
          }

          break;
        }
      }
    }

    return out;
  },

  // Why p can't die right now (null if they can).
  cantDie(p, cause) {
    return this.guard(p, cause)?.text ?? null;
  },

  // What stops p dying right now, if anything: { text, by }, where `by` is
  // the player protecting them (none for a Sailor, who protects themself).
  // A working Sailor, the Innkeeper's protection tonight, or a working Tea
  // Lady whose two living neighbours (p among them) are both good. Nothing
  // stops the Assassin.
  guard(p, cause) {
    const s = this.s;

    if (cause === "assassin") {
      return null;
    }

    // (A Lleech dies if and only if their host is dead: see lleech.js.)
    if (this.lleechSafe(p)) {
      return { text: "the Lleech can't die while their host lives", by: null };
    }

    if (ability(p) === "sailor" && works(p)) {
      return { text: "the Sailor can't die", by: null };
    }

    if (s.phase === "night" && p.safeNight === s.night) {
      return { text: "protected by the Innkeeper", by: p.safeBy };
    }

    const t = teaLadyOf(s, p);

    return t ? { text: "protected by the Tea Lady", by: t.id } : null;
  },

  // Brings a dead player back to life (the Professor, the Shabaloth). They
  // can't die again tonight (see kill()), and the Storyteller announces it at
  // dawn.
  revive(p, by) {
    const s = this.s;

    p.alive = true;
    p.ghost = true;
    p.death = null;
    p.diedAtNight = null;
    // (Their death tonight, if they died tonight, never happened: nothing
    // "when you learn that you died" triggers.)
    s.nightDeaths = s.nightDeaths.filter((id) => id !== p.id);
    s.dawnLearn = s.dawnLearn.filter((id) => id !== p.id);
    s.revived.push(p.id);

    this.audit(by, `${p.label} (${name(p.role)}) came back to life.`, {
      playerId: p.id,
    });
  },

  // Whether an attack on `victim` (by `demon`, or by anyone else without
  // one) would kill them as things stand.
  wouldDie(victim, demon = null) {
    if (demon) {
      if (!works(demon)) {
        return false;
      }

      if ((victim.role === "soldier" && works(victim)) || victim.protected) {
        return false;
      }
    }

    return (
      !this.guard(victim, demon ? "demon" : "attack") &&
      !this.foolSaves(victim, demon ? "demon" : "attack")
    );
  },

  // An evil player is publicly claiming a protection character (the Monk,
  // Soldier, Sailor, Innkeeper or Tea Lady): at SINK_KILL_CHANCE the Demon
  // kills nobody tonight, so the claim looks real. Returns whether it did.
  // (A Po that sinks a kill has chosen no-one, so kills 3 tomorrow night.)
  sinkKill(d) {
    const s = this.s;
    const bluffer = pick(
      s.players.filter(
        (x) =>
          x.alive &&
          !x.human &&
          x.alignment === "evil" &&
          x.claimKnown &&
          PROTECTION_ROLES.includes(x.claim),
      ),
      s.r,
    );

    if (!bluffer || s.r() >= SINK_KILL_CHANCE) {
      return false;
    }

    if (d.role === "po") {
      d.poCharged = true;
    }

    this.audit(
      "demon",
      `${d.label} (${name(d.role)}) sank tonight's kill, so ${bluffer.label}'s ${name(
        bluffer.claim,
      )} claim looks real.`,
      { actorId: d.id, bluffId: bluffer.id, outcome: "sunk" },
    );

    return true;
  },

  // Whether the Demon sleeps tonight: chosen by the Exorcist, or a Zombuul
  // after a day when someone died. (The Pukka's last victim still dies.)
  demonSleeps(d) {
    const s = this.s;

    if (d.exorcised === s.night) {
      this.audit(
        "exorcist",
        `${d.label} (${name(d.role)}) was chosen by the Exorcist and doesn't wake tonight.`,
        { actorId: d.id },
      );

      if (d.role === "pukka") {
        this.pukkaVictim(d);
      }

      return true;
    }

    if (d.role === "zombuul" && s.diedToday) {
      this.audit(
        "zombuul",
        `Someone died today, so ${d.label} (Zombuul) doesn't wake.`,
        { actorId: d.id },
      );

      return true;
    }

    return false;
  },

  // A day death is public: the Zombuul and Godfather go by it tonight.
  dayDeath(p) {
    const s = this.s;

    if (s.phase === "day") {
      s.diedToday = true;
      s.outsiderDiedToday ||= team(p.role) === "outsider";
    }
  },

  // At dawn, anyone who came back to life in the night is announced.
  revivedDawn() {
    const s = this.s;

    for (const id of s.revived.splice(0)) {
      const p = this.player(id);

      // (Not how: "regurgitated" would give the Shabaloth away.)
      this.announce(
        `Day ${s.day} — The Storyteller announces that ${
          p.human ? "you are" : `${p.label} is`
        } alive again.`,
      );
    }
  },
};
