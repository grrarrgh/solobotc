import {
  name,
  alignment,
  MARIONETTE_HEAT,
  MARIONETTE_REVEAL_CHANCE,
} from "./data.js";
import { works, who, lean } from "./storyteller.js";
import { heard, speak } from "./strategy.js";
import { pick, whose, claimHeard } from "./util.js";

// Onion Pies characters, mixed into Engine.prototype (see engine.js), so
// `this` is the Engine.
export const onionPies = {
  // ── Dusk ───────────────────────────────────────────────────

  // Lasting effects, reapplied at dusk: a Cannibal who ate an evil player is
  // poisoned until a good player dies by execution.
  onionLasting() {
    for (const p of this.s.players.filter((x) => x.cannibalPoison)) {
      p.poisoned = true;
      p.poisonedBy = p.cannibalPoison;
    }
  },

  // ── Night 1 ────────────────────────────────────────────────

  // On their first night, an NPC Ogre chooses a player and becomes their
  // alignment, even if drunk or poisoned. They don't learn which, so they
  // play on as if good.
  ogres() {
    const s = this.s;

    if (s.night !== 1) {
      return;
    }

    for (const p of s.players.filter(
      (x) => x.alive && !x.human && x.role === "ogre",
    )) {
      const t = this.strat.ogre(s, p);

      if (!t) {
        continue;
      }

      this.woke(p);
      this.chose(p, t);

      const before = p.alignment;

      p.alignment = t.alignment;

      this.audit(
        "ogre",
        `${p.label} (Ogre) chose ${t.label}; they are ${p.alignment}${
          p.alignment === before ? "" : " now"
        } (and don't know it).`,
        { actorId: p.id, targetId: t.id, alignment: p.alignment },
      );
    }
  },

  // ── The Demon and its Marionette ───────────────────────────

  // How many of the living good NPCs suspect the Demon (0 to 1).
  demonHeat(d) {
    const good = this.s.players.filter(
      (x) => x.alive && !x.human && x.alignment === "good",
    );

    return good.length
      ? good.filter((x) => x.suspicion?.targetId === d.id).length / good.length
      : 0;
  },

  // From Night 2, when evil is losing or the Demon is under suspicion, the
  // Demon may tell its Marionette who they are (see MARIONETTE_* in data.js).
  marionetteReveal(d) {
    const s = this.s;
    const m = s.players.find(
      (x) => x.alive && x.role === "marionette" && !x.toldEvil,
    );

    if (!m || s.night < 2) {
      return;
    }

    const losing = lean(s) === "evil";
    const heat = this.demonHeat(d);

    if ((!losing && heat < MARIONETTE_HEAT) || s.r() >= MARIONETTE_REVEAL_CHANCE) {
      return;
    }

    m.toldEvil = s.night;
    m.suspicion = null;

    this.audit(
      "marionette",
      `${d.label} (${name(d.role)}) tells ${m.label} they are the Marionette (${
        losing ? "evil is losing" : `${Math.round(heat * 100)}% of the good players suspect the Demon`
      }). From now on they draw suspicion away from the Demon.`,
      { actorId: d.id, targetId: m.id },
    );
  },

  // Each morning after they're told, the Marionette spreads misleading
  // information in public: their latest (false) information, or else an
  // accusation of a good player. They keep claiming their Townsfolk. (They
  // also play for evil from now on: see strategy sideOf().)
  marionetteDawn() {
    const s = this.s;

    for (const m of s.players.filter(
      (x) => x.alive && !x.human && x.role === "marionette" && x.toldEvil,
    )) {
      const latest = m.memories.at(-1);
      const fresh = latest && latest !== m.lastSpread ? latest : null;
      const opinion = fresh ? null : this.strat.opinion(s, m);
      const said = fresh
        ? `I am the ${name(m.claim)}. ${
            fresh.day ? `Day ${fresh.day}` : `Night ${fresh.night}`
          }: ${speak(fresh.text)}`
        : opinion?.type === "suspicious"
          ? opinion.text
          : null;

      if (!said) {
        continue;
      }

      m.lastSpread = fresh ?? m.lastSpread;
      this.claimPublicly(m);
      heard(s, m, fresh ? [fresh] : [], opinion);
      s.publicLog.push(`Day ${s.day} — ${m.label} says: "${said}"`);

      this.audit(
        "marionette",
        `${m.label} (Marionette) spreads misleading information: "${said}"`,
        { playerId: m.id },
      );
    }
  },

  // ── Dawn ───────────────────────────────────────────────────

  // An NPC Pixie becomes "mad" about the Townsfolk they learned on Night 1:
  // from Day 1 they claim it (with made-up information to match; see
  // strategy ask()), so they can gain its ability.
  //
  // A Pixie who gained the ability in the night says so now (see
  // pixieGains()).
  pixieMadness() {
    const s = this.s;

    for (const p of s.players.filter((x) => x.pixieNews)) {
      p.pixieNews = false;

      if (p.alive) {
        this.pixieAnnounces(p);
      }
    }

    for (const p of s.players.filter(
      (x) =>
        x.alive && !x.human && x.role === "pixie" && x.pixieRole && !x.pixieMad,
    )) {
      p.pixieMad = true;
      p.claim = p.pixieRole;

      this.audit(
        "pixie",
        `${p.label} (Pixie) is mad that they are the ${name(p.pixieRole)}, and claims it.`,
        { playerId: p.id, role: p.pixieRole },
      );
    }
  },

  // ── Death triggers ─────────────────────────────────────────

  // When the holder of a mad Pixie's character dies, a working Pixie gains
  // their ability, and (an NPC) says in public they were the Pixie: now, or
  // at dawn if it's night.
  pixieGains(dead) {
    for (const p of this.s.players.filter(
      (x) =>
        x.alive &&
        x.role === "pixie" &&
        x.pixieMad &&
        !x.gained &&
        x.pixieRole === dead.role &&
        works(x),
    )) {
      p.gained = dead.role;

      this.audit(
        "pixie",
        `${dead.label} (${name(dead.role)}) died: ${p.label} (Pixie) gains the ${name(
          dead.role,
        )} ability.`,
        { playerId: p.id, role: dead.role },
      );

      if (p.human) {
        continue;
      }

      if (this.s.phase === "day") {
        this.pixieAnnounces(p);
      } else {
        p.pixieNews = true;
      }
    }
  },

  // A mad Pixie who gained the ability says in public they were the Pixie,
  // and claims it from now on.
  pixieAnnounces(p) {
    const s = this.s;
    const role = name(p.gained);
    const said = ` says: "I was the Pixie, mad about being the ${role}. I now have the ${role} ability."`;

    p.claim = "pixie";
    this.claimPublicly(p);
    s.publicLog.push(`Day ${s.day} — ${p.label}${said}`);
    this.audit("pixie", `${p.label}${said}`, { playerId: p.id, role: p.gained });
  },

  // A player died by execution: each living Cannibal gains their ability.
  // If they were evil, the Cannibal is told a good ability (the one the
  // executee claimed, if any) and is poisoned until a good player dies by
  // execution. They don't learn the character, only whose ability it is.
  //
  // An evil player bluffing the Cannibal "gains" it too: the good character
  // the executee claimed, as far as they know (else any good one), so their
  // made-up information follows it from tonight (see bluffInfo()).
  cannibals(dead) {
    const s = this.s;
    const goods = s.script.ids.filter(
      (id) => alignment(id) === "good" && id !== "cannibal",
    );

    for (const b of s.players.filter(
      (x) =>
        x.alive &&
        x !== dead &&
        !x.human &&
        x.alignment === "evil" &&
        x.role !== "cannibal" &&
        x.claim === "cannibal",
    )) {
      const said = claimHeard(dead, b);

      b.bluffGained = goods.includes(said) ? said : pick(goods, s.r);
      b.bluffGainedNight = s.night + 1;
      b.cannibalFrom = dead.id;

      this.audit(
        "cannibal",
        `${b.label} (bluffing Cannibal) says they have ${whose(dead)} ability: ${name(
          b.bluffGained,
        )}.`,
        { playerId: b.id, fromId: dead.id, role: b.bluffGained, bluff: true },
      );
    }

    for (const c of s.players.filter(
      (x) => x.alive && x !== dead && x.role === "cannibal",
    )) {
      const evil = dead.alignment === "evil";
      const was = c.cannibalPoison;

      c.gained = evil
        ? goods.includes(dead.claim)
          ? dead.claim
          : pick(goods, s.r)
        : dead.role;
      // A first-night ability (the Chef, the Librarian...) is used tonight.
      c.gainedNight = s.night + 1;
      c.cannibalPoison = evil ? `eating ${who(dead)}` : null;
      c.cannibalFrom = dead.id;

      // Poisoned now; or, with a good player executed, no longer (unless
      // something else poisoned them).
      if (evil) {
        c.poisoned = true;
        c.poisonedBy = c.cannibalPoison;
      } else if (was && c.poisonedBy === was) {
        c.poisoned = false;
        c.poisonedBy = null;
      }

      this.audit(
        "cannibal",
        `${c.label} (Cannibal) has ${whose(dead)} ability: ${name(c.gained)}${
          evil ? ", poisoned until a good player dies by execution" : ""
        }.`,
        { playerId: c.id, fromId: dead.id, role: c.gained, poisoned: evil },
      );

      if (c.human) {
        s.privateLog.push(
          `Day ${s.day}: You now have the ability of ${dead.label}, who was executed.`,
        );
      }
    }
  },
};
