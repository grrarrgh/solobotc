import { name, team } from "../../data.js";
import { heard, lied } from "../../strategy.js";
import { bySeat, pick, sample } from "../../util.js";

// The Lunatic, mixed into Engine.prototype (see characters/index.js),
// so `this` is the Engine.
export const lunatic = {
  // The Lunatic thinks they're the Demon: each night they "kill" someone,
  // with no effect. The Demon learns who they chose.
  lunatics() {
    const s = this.s;

    s.lunaticPick = null;

    for (const p of s.players.filter(
      (x) => x.alive && !x.human && x.role === "lunatic" && !x.lunaticRevealed,
    )) {
      const t = this.strat.lunatic(s, p);

      if (!t) {
        this.audit(
          "lunatic",
          `${p.label} (Lunatic) chose nobody to "kill": only you and their imagined team are left.`,
          { actorId: p.id },
        );
        continue;
      }

      this.woke(p);
      s.lunaticPick = t.id;
      s.lunaticPickNight = s.night;

      this.audit(
        "lunatic",
        `${p.label} (Lunatic) chose ${t.label} to "kill"; no effect, but the Demon learns it.`,
        { actorId: p.id, targetId: t.id },
      );
    }
  },

  // A Lunatic who died (and the game goes on) realises they weren't the
  // Demon: the next morning they say so, and who their "Minions" were. So
  // does a living Lunatic claiming the Mayor once a day with 3 alive ended
  // with no execution and no Mayor win (s.mayorFailed): their claim is
  // shown to be false.
  //
  // An evil player with the Lunatic as a bluff (never claimed while alive:
  // see setup) may fake it once they're dead: the first one to die says
  // they were the Lunatic, with good NPCs as their "Minions", so the town
  // thinks a good player died.
  lunaticReveals() {
    const s = this.s;

    for (const p of s.players.filter(
      (x) =>
        !x.human &&
        (!x.alive || (x.claim === "mayor" && s.mayorFailed)) &&
        x.role === "lunatic" &&
        x.lunaticTeam &&
        !x.lunaticRevealed,
    )) {
      this.lunaticSays(p, p.shown, p.lunaticTeam, p.alive ? "the Mayor" : null);
    }

    const faker = s.lunaticFaked
      ? null
      : s.players.find(
          (x) =>
            !x.human &&
            !x.alive &&
            x.alignment === "evil" &&
            (x.bluffs ?? []).includes("lunatic"),
        );

    if (!faker) {
      return;
    }

    // (A Demon they "thought" they were: one on the script that isn't in
    // play. Their "Minions": good NPCs, as many as there are Minions, at
    // least 2; never a teammate, who'd be suspected.)
    const shown = pick(
      s.script.ids.filter(
        (id) => team(id) === "demon" && !s.players.some((x) => x.role === id),
      ),
      s.r,
    );
    const minions = s.players.filter((x) => team(x.role) === "minion").length;
    const fakeTeam = sample(
      s.players.filter((x) => !x.human && x !== faker && x.alignment === "good"),
      Math.max(2, minions),
      s.r,
    );

    s.lunaticFaked = faker.id;

    if (!shown || fakeTeam.length < 2) {
      this.audit(
        "lunatic",
        `${faker.label} (${name(faker.role)}) could fake being the Lunatic, but doesn't: ${
          !shown ? "no Demon that isn't in play to have thought they were" : "too few good players to name"
        }.`,
        { playerId: faker.id },
      );
      return;
    }

    lied(s, { kind: "fake", byId: faker.id, said: "lunatic", truth: faker.role });
    this.lunaticSays(faker, shown, fakeTeam.map((x) => x.id), null, true);
  },

  // p says in public they were the Lunatic, who they thought they were and
  // who their "Minions" were (`teamIds`): having claimed `was` (alive, the
  // Mayor), or after dying. A `fake` one is an evil player's bluff.
  lunaticSays(p, shown, teamIds, was = null, fake = false) {
    const s = this.s;
    const team = teamIds.map((id) => this.player(id));
    const labels = bySeat(team).map((x) => x.label);
    const list =
      labels.length < 2
        ? labels.join("")
        : `${labels.slice(0, -1).join(", ")} and ${labels.at(-1)}`;
    const said = ` says: "${
      was ? `I'm not ${was}: there was no Mayor win. I'm` : "I was"
    } the Lunatic: I thought I was the ${name(shown)}. My Minions were ${list}."`;
    const info = {
      night: s.night,
      role: "lunatic",
      text: `Lunatic: my Minions were ${list}.`,
      targets: teamIds,
      trigger: was ? "normal" : "death",
      functioning: !fake,
    };

    p.lunaticRevealed = true;
    p.claim = "lunatic";
    p.bluff = fake ? "lunatic" : p.bluff;
    p.cover = null;
    p.memories.push(info);
    this.claimPublicly(p);
    heard(s, p, [info]);
    s.publicLog.push(`Day ${s.day} — ${p.label}${said}`);
    this.audit(
      "lunatic",
      `${p.label}${said}${fake ? ` (fake: they're the ${name(p.role)})` : ""}`,
      { playerId: p.id, fake },
    );
  },
};

// How a Lunatic's coming clean reads (see strategy stanceOn()): their
// "Minions" are suspicious.
export const info = {
  stance: () => "suspicious",
};
