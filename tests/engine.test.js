import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { FORBIDDEN_HUMAN, name, team } from "../src/data.js";
import { createState } from "../src/setup.js";
import { Engine } from "../src/engine.js";
import { SimpleStrategy } from "../src/strategy.js";
import { ravenInfo } from "../src/storyteller.js";

const script = JSON.parse(
  fs.readFileSync(new URL("../scripts/trouble-brewing.json", import.meta.url)),
);

// Force a player into a fresh, living copy of the given role.
const role = (p, id, alignment) =>
  Object.assign(p, {
    role: id,
    startRole: id,
    shown: id,
    claim: id,
    alignment,
    alive: true,
    ghost: true,
    poisoned: false,
    protected: false,
    memories: [],
    talks: [],
    death: null,
  });

// A 5-player Day 1 with known roles: Mayor (you), Chef, Butler, Baron, Imp.
function base(seed = "feature-test") {
  const s = createState(script, 5, seed);

  s.phase = "day";
  s.night = 1;
  s.day = 1;
  s.winner = null;
  s.reason = null;
  s.publicLog = [];
  s.privateLog = [];
  s.audit = [];
  s.auditId = 1;
  s.talked = [];
  s.talkDay = 1;
  s.lastExecution = null;
  s.lastVote = null;

  role(s.players[0], "mayor", "good");
  role(s.players[1], "chef", "good");
  role(s.players[2], "butler", "good");
  role(s.players[3], "baron", "evil");
  role(s.players[4], "imp", "evil");

  return s;
}

test("starts game", () => {
  const s = createState(script, 10, "42");
  const e = new Engine(s);

  e.start();

  assert.equal(s.players.length, 10);
  assert.equal(s.phase, "day");
  assert.ok(s.publicLog.some((x) => /^Day 1:/.test(x)));
});

test("reveal hidden before end", () => {
  const e = new Engine(createState(script, 7, "test"));

  e.start();

  assert.equal(e.reveal(), null);
});

test("failed votes stay in the day, are visible, and allow another nomination", () => {
  const s = base();
  const strat = new SimpleStrategy();
  let approve = false;

  strat.vote = () => approve;
  strat.demon = () => null;

  const e = new Engine(s, strat);
  const first = s.players[1];
  const second = s.players[2];

  const failed = e.nominate(first.id);

  assert.equal(failed.executed, false);
  assert.equal(s.phase, "day");
  assert.equal(s.day, 1);
  assert.equal(first.alive, true);
  assert.ok(
    s.publicLog.some(
      (x) =>
        x ===
        `Day 1 — Vote on ${first.label} failed: ${failed.count}/${failed.threshold}; no execution.`,
    ),
  );

  approve = true;

  const passed = e.nominate(second.id);

  assert.equal(passed.executed, true);
  assert.equal(second.alive, false);
  assert.equal(s.day, 2);
  assert.equal(s.phase, "day");
});

test("the exact information delivered to a poisoned Human is logged every night without exposing the cause", () => {
  const s = base("night-info");
  const human = s.players[0];
  const poisoner = s.players[3];

  role(human, "empath", "good");
  role(poisoner, "poisoner", "evil");

  s.phase = "night";
  s.day = 0;
  s.night = 1;
  s.r = () => 0;

  const strat = new SimpleStrategy();
  strat.demon = () => null;

  const e = new Engine(s, strat);

  e.start();
  e.endDay();

  assert.equal(human.memories.length, 2);

  for (const info of human.memories) {
    const exact = `Day ${info.night} — Night ${info.night}: You received: ${info.text}`;

    assert.ok(s.publicLog.includes(exact));
    assert.ok(s.privateLog.includes(`Night ${info.night}: ${info.text}`));
    assert.doesNotMatch(exact, /poisoned|drunk|unreliable/i);
  }
});

function askedState(kind) {
  const s = base(`ask-${kind}`);

  s.r = () => 0;

  if (kind === "poisoned") {
    s.players[1].poisoned = true;
  }

  if (kind === "drunk") {
    role(s.players[1], "drunk", "good");
  }

  return s;
}

function suspicionTarget(s, response) {
  const label = response.match(/I heard (Player \d+) is suspicious/)[1];

  return s.players.find((p) => p.label === label);
}

test("NPC suspicion statements obey truth, lie, status, and target constraints", () => {
  for (const kind of ["good", "evil", "poisoned", "drunk"]) {
    const s = askedState(kind);
    const e = new Engine(s);
    const speaker = kind === "evil" ? s.players[3] : s.players[1];

    const response = e.ask(speaker.id);
    const target = suspicionTarget(s, response);

    assert.ok(target);
    assert.equal(target.human, false);
    assert.notEqual(target.id, speaker.id);
    assert.match(response, /I heard Player \d+ is suspicious/);

    if (kind === "good") {
      assert.equal(target.alignment, "evil");
    } else {
      assert.equal(target.alignment, "good");
    }
  }
});

test("post-game Key Moments include hidden Poisoner, Monk, and Demon night actions", () => {
  const s = base("key-moments");
  const poisoner = s.players[1];
  const monk = s.players[2];
  const imp = s.players[4];
  const target = s.players[3];

  role(poisoner, "poisoner", "evil");
  role(monk, "monk", "good");
  role(imp, "imp", "evil");
  role(target, "chef", "good");

  s.phase = "night";
  s.night = 2;
  s.day = 1;

  const strat = new SimpleStrategy();

  strat.poison = () => target;
  strat.monk = () => target;
  strat.demon = () => null;

  const e = new Engine(s, strat);

  e.night();
  e.finish("good", "Test complete.");

  const key = e.reveal().keyMoments;

  const poison = key.find((x) => x.type === "poison");
  const protection = key.find((x) => x.type === "monk");
  const demon = key.find((x) => x.type === "demon");

  assert.deepEqual(
    {
      actorId: poison.data.actorId,
      targetId: poison.data.targetId,
    },
    {
      actorId: poisoner.id,
      targetId: target.id,
    },
  );

  assert.deepEqual(
    {
      actorId: protection.data.actorId,
      targetId: protection.data.targetId,
      effective: protection.data.effective,
    },
    {
      actorId: monk.id,
      targetId: target.id,
      effective: true,
    },
  );

  assert.equal(demon.data.actorId, imp.id);
  assert.equal(demon.data.outcome, "no_target");
  assert.ok(!key.some((x) => x.type === "information"));
});

test("NPC Monks report who they protected when asked", () => {
  const s = base("monk-ask");
  const monk = s.players[1];
  const target = s.players[2];

  role(monk, "monk", "good");

  s.phase = "night";
  s.night = 2;
  s.day = 1;

  const strat = new SimpleStrategy();

  strat.monk = () => target;
  strat.demon = () => null;

  const e = new Engine(s, strat);

  e.night();

  const response = e.ask(monk.id);

  assert.ok(response.includes(`Night 2: Monk: protected ${target.label} from the Demon.`));
});

test("evil NPCs bluffing a choosing role report an invented choice", () => {
  const s = base("bluff-monk");
  const baron = s.players[3];
  const target = s.players[1];

  baron.claim = "monk";

  s.phase = "night";
  s.night = 2;
  s.day = 1;

  const strat = new SimpleStrategy();

  strat.monk = () => target;
  strat.demon = () => null;

  const e = new Engine(s, strat);

  e.night();

  const response = e.ask(baron.id);

  assert.ok(response.startsWith("I claim Monk."));
  assert.ok(response.includes(`Night 2: Monk: protected ${target.label} from the Demon.`));
  assert.ok(s.audit.some((x) => x.type === "bluff"));
});

test("an NPC Slayer can shoot and kill the Imp", () => {
  const s = base("npc-slayer");
  const slayer = s.players[1];
  const imp = s.players[4];

  role(slayer, "slayer", "good");

  const strat = new SimpleStrategy();
  strat.slay = () => imp;

  const e = new Engine(s, strat);

  e.npcShots();

  assert.equal(imp.alive, false);
  assert.equal(slayer.shotUsed, true);
  assert.equal(slayer.claimKnown, true);
  assert.equal(s.winner, "good");
  assert.ok(
    s.publicLog.includes(
      `Day 1 — ${slayer.label} claims Slayer and shoots ${imp.label}.`,
    ),
  );
  assert.ok(e.reveal().keyMoments.some((x) => x.type === "slayer"));
});

test("an evil NPC bluffing Slayer shoots once and nothing happens", () => {
  const s = base("bluff-slayer");
  const baron = s.players[3];
  const target = s.players[1];

  baron.claim = "slayer";

  const strat = new SimpleStrategy();
  strat.slay = () => target;

  const e = new Engine(s, strat);

  e.npcShots();
  e.npcShots();

  assert.equal(target.alive, true);
  assert.equal(baron.shotUsed, true);
  assert.ok(s.publicLog.includes("Day 1 — Nothing happens."));
  assert.equal(
    s.publicLog.filter((x) => x.includes("claims Slayer")).length,
    1,
  );
});

test("nominating a Virgin executes the Human and ends the day", () => {
  const s = base("virgin");
  const human = s.players[0];
  const virgin = s.players[2];

  role(virgin, "virgin", "good");

  const strat = new SimpleStrategy();

  strat.vote = () => false;
  strat.demon = () => null;

  const e = new Engine(s, strat);
  const result = e.nominate(virgin.id);

  assert.equal(result.virgin, true);
  assert.equal(human.alive, false);
  assert.equal(virgin.alive, true);
  assert.equal(s.lastExecution, human.id);
  assert.equal(s.day, 2);
  assert.equal(s.phase, "day");
  assert.ok(
    s.publicLog.includes(
      `Day 1 — You nominated ${virgin.label} and were executed immediately.`,
    ),
  );
  assert.throws(() => e.nominate(s.players[1].id), /Dead players/);
});

test("the Virgin only triggers on her first nomination, and only for Townsfolk", () => {
  const s = base("virgin-drunk");
  const human = s.players[0];
  const virgin = s.players[2];

  role(human, "drunk", "good");
  human.shown = "chef";
  human.claim = "chef";
  role(virgin, "virgin", "good");

  const strat = new SimpleStrategy();

  strat.vote = () => false;
  strat.demon = () => null;

  const e = new Engine(s, strat);

  assert.equal(e.nominate(virgin.id).virgin, undefined);
  assert.equal(human.alive, true);
  assert.equal(virgin.virginUsed, true);

  role(human, "mayor", "good");
  e.endDay();

  assert.equal(e.nominate(virgin.id).virgin, undefined);
  assert.equal(human.alive, true);
  assert.equal(s.day, 2);
});

test("Drunks see a Townsfolk token that is not in play", () => {
  let drunks = 0;

  for (let seed = 0; seed < 300; seed++) {
    const s = createState(script, 9, seed);
    const inPlay = new Set(s.players.map((p) => p.role));

    for (const p of s.players.filter((x) => x.role === "drunk")) {
      drunks++;

      assert.equal(team(p.shown), "townsfolk");
      assert.ok(!inPlay.has(p.shown));
      assert.equal(p.claim, p.shown);

      if (p.human) {
        assert.ok(!FORBIDDEN_HUMAN.has(p.shown));
      }
    }
  }

  assert.ok(drunks > 0);
});

test("Drunks receive unreliable information for their shown role", () => {
  const s = base("drunk-info");
  const drunk = s.players[1];

  role(drunk, "drunk", "good");
  drunk.shown = "empath";
  drunk.claim = "empath";

  s.phase = "night";
  s.night = 1;
  s.day = 0;

  const strat = new SimpleStrategy();
  strat.demon = () => null;

  new Engine(s, strat).start();

  assert.equal(drunk.memories.length, 1);
  assert.equal(drunk.memories[0].role, "empath");
  assert.equal(drunk.memories[0].functioning, false);

  role(drunk, "drunk", "good");
  drunk.shown = "ravenkeeper";

  assert.equal(ravenInfo(s, drunk, s.players[4]).functioning, false);
});

// Night 1 with Mayor (you), Chef, Butler, Spy, Imp. The Spy registers as
// good, so the true Chef number is 0.
function bluffNight(seed) {
  const s = base(seed);

  role(s.players[3], "spy", "evil");

  s.phase = "night";
  s.night = 1;
  s.day = 0;

  return s;
}

test("the Spy bluffs with true information; other evil NPCs lie", () => {
  const s = bluffNight("bluff-chef");
  const chef = s.players[1];
  const spy = s.players[3];
  const imp = s.players[4];

  spy.claim = "chef";
  imp.claim = "chef";

  const e = new Engine(s);

  e.start();

  assert.equal(chef.memories[0].text, "Chef number: 0.");
  assert.equal(spy.memories[0].text, "Chef number: 0.");
  assert.notEqual(imp.memories[0].text, "Chef number: 0.");
  assert.ok(e.ask(imp.id).includes(`Night 1: ${imp.memories[0].text}`));
});

test("a poisoned Spy's bluff is not guaranteed to be true", () => {
  const s = bluffNight("bluff-poisoned-spy");
  const spy = s.players[3];

  spy.claim = "chef";

  const strat = new SimpleStrategy();
  const e = new Engine(s, strat);

  // Run bluffs() directly: night() would clear the poison first.
  spy.poisoned = true;
  e.bluffs();

  assert.notEqual(spy.memories[0].text, "Chef number: 0.");
  assert.equal(spy.memories[0].functioning, false);
});

test("evil Washerwoman bluffs name two players who don't hold the character", () => {
  for (let i = 0; i < 20; i++) {
    const s = bluffNight(`bluff-ww-${i}`);
    const imp = s.players[4];

    imp.claim = "washerwoman";

    new Engine(s).start();

    const info = imp.memories[0];
    const shown = info.text.match(/ is (.+)\.$/)[1];

    assert.equal(info.targets.length, 2);
    assert.ok(!info.targets.includes(imp.id));

    for (const id of info.targets) {
      assert.notEqual(name(s.players.find((x) => x.id === id).role), shown);
    }
  }
});

test("evil Empath and Fortune Teller bluffs contradict the truth", () => {
  const s = bluffNight("bluff-each-night");
  const spy = s.players[3];
  const imp = s.players[4];

  spy.claim = "empath";
  imp.claim = "fortuneteller";

  const strat = new SimpleStrategy();
  strat.ft = (_, p) => s.players.filter((x) => x.id !== p.id).slice(0, 2);

  new Engine(s, strat).start();

  // The Spy's neighbours are the Butler and the Imp: one evil.
  assert.equal(spy.memories[0].text, "Empath number: 1.");

  // The Imp's picks are You and the Chef; the red herring decides the truth.
  const truth = [s.players[0], s.players[1]].some((x) => x.id === s.red);

  assert.match(imp.memories[0].text, truth ? /: NO for/ : /: YES for/);
});

test("evil NPCs bluffing a role without night info say they have none", () => {
  const s = base("bluff-soldier");
  const baron = s.players[3];

  baron.claim = "soldier";

  const e = new Engine(s);

  assert.ok(e.ask(baron.id).includes("I have no stored information."));
});

test("an evil Ravenkeeper bluffer killed at night names a wrong character", () => {
  const s = base("bluff-raven");
  const baron = s.players[3];
  const chef = s.players[1];

  baron.claim = "ravenkeeper";

  const strat = new SimpleStrategy();
  strat.raven = () => chef;

  const e = new Engine(s, strat);

  e.kill(baron, "demon");

  assert.equal(baron.memories.length, 1);
  assert.ok(baron.memories[0].text.startsWith(`${chef.label} is `));
  assert.notEqual(baron.memories[0].text, `${chef.label} is Chef.`);
});

// ── Everyone Can Play ────────────────────────────────────────

const ecp = JSON.parse(
  fs.readFileSync(
    new URL("../scripts/Everyone Can Play_1_0_2.json", import.meta.url),
  ),
);

// Night 2 of the base 5-player game. The Demon doesn't attack unless a test
// overrides strat.demon afterwards.
function nightTwo(seed, strat = new SimpleStrategy()) {
  const s = base(seed);

  s.phase = "night";
  s.night = 2;
  s.day = 1;
  strat.demon = () => null;

  return { s, strat, e: new Engine(s, strat) };
}

test("Everyone Can Play loads ({ id } entries) and starts", () => {
  const s = createState(ecp, 10, "ecp");

  assert.equal(s.script.meta.name, "Everyone Can Play");
  assert.equal(s.script.ids.length, 24);

  new Engine(s).start();

  assert.equal(s.phase, "day");
});

test("the human is never dealt the Gambler, Fool or Moonchild", () => {
  for (let seed = 0; seed < 300; seed++) {
    const human = createState(ecp, 10, seed).players[0];

    assert.ok(!FORBIDDEN_HUMAN.has(human.role));
    assert.ok(!FORBIDDEN_HUMAN.has(human.shown));
  }
});

test("the Clockmaker learns the Demon's distance to its nearest Minion", () => {
  const s = base("clockmaker");
  const cm = s.players[1];

  role(cm, "clockmaker", "good");

  s.phase = "night";
  s.night = 1;
  s.day = 0;

  new Engine(s).start();

  // Baron (seat 4) sits next to the Imp (seat 5).
  assert.equal(cm.memories[0].text, "Clockmaker number: 1.");
});

test("the Grandmother learns her grandchild, and dies if the Demon kills them", () => {
  const s = base("grandmother");
  const gm = s.players[1];

  role(gm, "grandmother", "good");

  s.phase = "night";
  s.night = 1;
  s.day = 0;

  const e = new Engine(s);

  e.start();

  const child = s.players.find((x) => x.id === gm.grandchild);

  assert.equal(child.alignment, "good");
  assert.equal(
    gm.memories[0].text,
    `Grandmother: your grandchild is ${child.label}, the ${name(child.role)}.`,
  );

  // The Demon never attacks the human, so link her to the Butler instead.
  const butler = s.players[2];

  gm.grandchild = butler.id;
  e.strat.demon = () => butler;
  e.endDay();

  assert.equal(butler.alive, false);
  assert.equal(gm.alive, false);
  assert.equal(gm.death, "grandmother");
});

test("a Gambler who guesses wrong dies; a right guess is safe", () => {
  const strat = new SimpleStrategy();
  const { s, e } = nightTwo("gambler", strat);
  const wrong = s.players[1];
  const right = s.players[2];

  role(wrong, "gambler", "good");
  role(right, "gambler", "good");

  strat.gamble = (_, g) => ({
    target: s.players[4],
    role: g === wrong ? "chef" : "imp",
  });

  e.night();

  assert.equal(wrong.alive, false);
  assert.equal(right.alive, true);
  assert.equal(
    wrong.memories[0].text,
    `Gambler: guessed ${s.players[4].label} is the Chef.`,
  );
});

test("the Fool survives their first death but not their second", () => {
  const strat = new SimpleStrategy();
  const { s, e } = nightTwo("fool", strat);
  const fool = s.players[1];

  role(fool, "fool", "good");
  strat.demon = () => fool;

  e.night();

  assert.equal(fool.alive, true);
  assert.equal(fool.foolUsed, true);

  e.endDay();

  assert.equal(fool.alive, false);
});

test("the Assassin's once-per-game kill ignores the Fool", () => {
  const strat = new SimpleStrategy();
  const { s, e } = nightTwo("assassin", strat);
  const fool = s.players[1];
  const assassin = s.players[3];

  role(fool, "fool", "good");
  role(assassin, "assassin", "evil");
  strat.assassin = () => fool;

  e.night();

  assert.equal(fool.alive, false);
  assert.equal(fool.death, "assassin");
  assert.equal(assassin.assassinUsed, true);
});

test("an executed Moonchild curses a good player, who dies that night", () => {
  const s = base("moonchild");
  const moonchild = s.players[2];
  const chef = s.players[1];

  role(moonchild, "moonchild", "good");

  const strat = new SimpleStrategy();

  strat.vote = () => true;
  strat.demon = () => null;
  strat.moonchild = () => chef;

  const e = new Engine(s, strat);

  e.nominate(moonchild.id);

  assert.equal(moonchild.alive, false);
  assert.ok(
    s.publicLog.includes(
      `${moonchild.label} claims Moonchild and chooses ${chef.label}.`,
    ),
  );
  assert.equal(chef.alive, false);
  assert.equal(chef.death, "moonchild");
  assert.equal(s.day, 2);
});

test("the Devil's Advocate's pick survives execution the next day", () => {
  const s = base("advocate");
  const da = s.players[3];
  const imp = s.players[4];

  role(da, "devilsadvocate", "evil");

  s.phase = "night";
  s.night = 1;
  s.day = 0;

  const strat = new SimpleStrategy();

  strat.advocate = () => imp;
  strat.vote = () => true;
  strat.demon = () => null;

  const e = new Engine(s, strat);

  e.start();

  const result = e.nominate(imp.id);

  assert.equal(result.executed, true);
  assert.equal(imp.alive, true);
  assert.equal(s.winner, null);
  assert.equal(s.day, 2);
});

test("the Devil's Advocate never picks the same player two nights running", () => {
  const s = base("advocate-repeat");
  const da = s.players[3];
  const strat = new SimpleStrategy();

  role(da, "devilsadvocate", "evil");

  for (const last of s.players) {
    for (let i = 0; i < 20; i++) {
      assert.notEqual(strat.advocate(s, da, last.id).id, last.id);
    }
  }
});

test("the human Artist asks one true yes/no question per game", () => {
  const s = base("artist");
  const human = s.players[0];
  const imp = s.players[4];

  role(human, "artist", "good");

  const e = new Engine(s);
  const answer = e.artist(imp.id, "demon");

  assert.equal(answer, `Artist: asked if ${imp.label} is the Demon: YES.`);
  assert.ok(s.privateLog.includes(`Day 1: ${answer}`));
  assert.throws(() => e.artist(imp.id, "evil"), /Artist unavailable/);
});

test("NPC Artists ask at dawn; evil Artist bluffers lie about the answer", () => {
  const s = base("npc-artist");
  const artist = s.players[1];
  const baron = s.players[3];
  const imp = s.players[4];

  role(artist, "artist", "good");
  baron.claim = "artist";

  s.phase = "night";
  s.night = 1;
  s.day = 0;

  const strat = new SimpleStrategy();
  strat.artist = () => ({ target: imp, question: "demon" });

  const e = new Engine(s, strat);

  e.start();

  const yes = `Artist: asked if ${imp.label} is the Demon: YES.`;

  assert.equal(artist.memories[0].text, yes);
  assert.ok(e.ask(artist.id).includes(`Day 1: ${yes}`));
  assert.equal(
    baron.memories[0].text,
    `Artist: asked if ${imp.label} is the Demon: NO.`,
  );
});

// ── Bug fixes ────────────────────────────────────────────────

test("a player can only be nominated once per day", () => {
  const s = base("nominate-once");
  const chef = s.players[1];
  const strat = new SimpleStrategy();

  strat.vote = () => false;
  strat.demon = () => null;

  const e = new Engine(s, strat);

  e.nominate(chef.id);

  assert.equal(e.nominatedToday(chef.id), true);
  assert.throws(() => e.nominate(chef.id), /Already nominated today/);

  e.endDay();

  assert.equal(e.nominatedToday(chef.id), false);
  assert.equal(e.nominate(chef.id).executed, false);
});

test("nobody bluffs as the Drunk", () => {
  for (let seed = 0; seed < 300; seed++) {
    for (const p of createState(ecp, 8, seed).players) {
      assert.notEqual(p.claim, "drunk");
      assert.notEqual(p.shown, "drunk");
    }
  }
});

test("a Drunk thinks they are a Townsfolk and always gets wrong information", () => {
  for (let i = 0; i < 20; i++) {
    const s = bluffNight(`drunk-wrong-${i}`);
    const drunk = s.players[1];

    role(drunk, "drunk", "good");
    drunk.shown = "chef";
    drunk.claim = "chef";

    const e = new Engine(s);

    e.start();

    // The Spy registers as good, so the true Chef number is 0.
    assert.notEqual(drunk.memories[0].text, "Chef number: 0.");
    assert.equal(drunk.memories[0].role, "chef");
    assert.ok(e.ask(drunk.id).startsWith("I claim Chef."));
  }
});

test("the human Washerwoman always learns about two other players", () => {
  for (const status of ["sober", "poisoned", "drunk"]) {
    for (let i = 0; i < 20; i++) {
      const s = bluffNight(`ww-${status}-${i}`);
      const human = s.players[0];

      role(human, status === "drunk" ? "drunk" : "washerwoman", "good");
      human.shown = "washerwoman";

      const strat = new SimpleStrategy();

      // Poison the human every night.
      strat.poison = () => (status === "poisoned" ? human : null);

      if (status === "poisoned") {
        role(s.players[3], "poisoner", "evil");
      }

      new Engine(s, strat).start();

      const info = human.memories[0];

      assert.equal(info.targets.length, 2, `${status}: ${info.text}`);
      assert.ok(!info.targets.includes(human.id), `${status}: ${info.text}`);
      assert.ok(!info.text.includes("You"), `${status}: ${info.text}`);
    }
  }
});

test("the Monk lists each night's protection on its own line", () => {
  const strat = new SimpleStrategy();
  const { s, e } = nightTwo("monk-lines", strat);
  const monk = s.players[1];
  const picks = [s.players[2], s.players[3]];

  role(monk, "monk", "good");
  strat.monk = () => picks.shift();

  e.night();
  e.endDay();

  const lines = e.ask(monk.id).split("\n");

  assert.equal(lines[0], "I claim Monk.");
  assert.equal(lines[1], `Night 2: Monk: protected ${s.players[2].label} from the Demon.`);
  assert.equal(lines[2], `Night 3: Monk: protected ${s.players[3].label} from the Demon.`);
});

test("night choices never pick dead players", () => {
  const s = base("no-dead-picks");
  const strat = new SimpleStrategy();
  const chooser = s.players[1];

  s.players[2].alive = false;
  s.players[3].alive = false;

  for (let i = 0; i < 50; i++) {
    for (const t of [
      strat.raven(s, chooser),
      ...strat.ft(s, chooser),
      strat.monk(s, chooser),
      strat.gamble(s, chooser).target,
    ]) {
      assert.equal(t.alive, true);
    }
  }
});

test("the debug log records every night's player states and all interactions", () => {
  const s = base("debug-log");
  const chef = s.players[1];
  const poisoner = s.players[3];

  role(poisoner, "poisoner", "evil");

  s.phase = "night";
  s.night = 1;
  s.day = 0;

  const strat = new SimpleStrategy();

  strat.poison = () => chef;
  strat.vote = () => false;
  strat.demon = () => null;

  const e = new Engine(s, strat);

  e.start();
  e.ask(chef.id);
  e.nominate(chef.id);
  e.endDay();
  e.finish("good", "Test complete.");

  const log = e.debugLog();

  for (const text of [
    "SOLO CLOCKTOWER — DEBUG LOG",
    "=== Night 1",
    "=== Day 1",
    "=== Night 2",
    "=== Game Over",
    "-- Player states --",
    "[poison]",
    "[conversation]",
    "[vote_result]",
    "votes: You",
    "[end_day] You ended Day 1.",
    "POISONED",
    `info: ${chef.memories[0].text}`,
  ]) {
    assert.ok(log.includes(text), `missing: ${text}`);
  }

  // Night 1 comes before Day 1, which comes before Night 2.
  assert.ok(log.indexOf("=== Night 1") < log.indexOf("=== Day 1"));
  assert.ok(log.indexOf("=== Day 1") < log.indexOf("=== Night 2"));
});
