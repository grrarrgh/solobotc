import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  DEMON_KILL_PRIORITY,
  FORBIDDEN_HUMAN,
  FIRST_NIGHT_INFO,
  ONGOING_INFO,
  ARTIST_QUESTIONS,
  name,
  team,
} from "../src/data.js";
import { createState } from "../src/setup.js";
import { Engine } from "../src/engine.js";
import { SimpleStrategy } from "../src/strategy.js";
import { ravenInfo, artistInfo } from "../src/storyteller.js";
import { shuffle, sample } from "../src/util.js";

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
    lastClaim: id,
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
function base(seed = "feature-test", raw = script) {
  const s = createState(raw, 5, seed);

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
  settle(e);

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

  assert.equal(failed.marked, false);
  assert.equal(s.phase, "day");
  assert.equal(s.day, 1);
  assert.equal(first.alive, true);
  assert.ok(
    s.publicLog.includes(
      `Day 1 — You nominated ${first.label}: ${failed.count} vote (${failed.threshold} needed); not enough votes.`,
    ),
  );

  // The human has nominated today, so an NPC makes the next nomination.
  approve = true;
  assert.throws(() => e.nominate(second.id), /already nominated today/);

  const passed = e.requestNomination(second.id);

  // Marked, but only executed when the day ends.
  assert.equal(passed.marked, true);
  assert.equal(e.marked(), second);
  assert.equal(second.alive, true);
  assert.equal(s.day, 1);

  e.endDay();

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
    const exact = `Day ${info.night} — Night ${info.night}: You received:\n${info.text}`;

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

  // Information that names nobody, so the NPC falls back on their general
  // suspicion rather than saying they have nothing to add.
  s.players[1].memories.push({
    night: 1,
    role: "chef",
    text: "Chef number: 1.",
    targets: [],
  });

  return s;
}

function suspicionTarget(s, response) {
  const label = response.match(/I'm suspicious of (Player \d+)\./)[1];

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
    assert.match(response, /I'm suspicious of Player \d+\./);

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

  // Whichever two players the Imp names, the answer is the opposite of the
  // truth for them (only the red herring can make good players read YES).
  const named = imp.memories[0].targets.map((id) =>
    s.players.find((x) => x.id === id),
  );
  const truth = named.some((x) => x.role === "imp" || x.id === s.red);

  assert.equal(named.length, 2);
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

  const e = new Engine(s);

  e.start();
  settle(e);

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
  e.endDay();

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
  strat.butler = () => s.players[0]; // the Butler follows the human's vote
  strat.vote = () => true;
  strat.demon = () => null;

  const e = new Engine(s, strat);

  e.start();

  const result = e.nominate(imp.id);

  assert.equal(result.marked, true);

  e.endDay();

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
  strat.artist = () => ({ targets: [imp], question: "demon" });

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
  assert.equal(e.nominate(chef.id).marked, false);
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

test("setup deals two first-night and two ongoing information Townsfolk when it can", () => {
  for (const raw of [script, ecp]) {
    for (let seats = 5; seats <= 15; seats++) {
      for (let seed = 0; seed < 30; seed++) {
        const tf = createState(raw, seats, seed)
          .players.map((p) => p.role)
          .filter((id) => team(id) === "townsfolk");
        const first = tf.filter((id) => FIRST_NIGHT_INFO.includes(id)).length;
        const ongoing = tf.filter((id) => ONGOING_INFO.includes(id)).length;

        if (tf.length >= 4) {
          assert.ok(first >= 2 && ongoing >= 2, `${seats}/${seed}: ${tf}`);
        } else {
          // Too few Townsfolk slots: every one is an information role.
          assert.equal(first + ongoing, tf.length, `${seats}/${seed}: ${tf}`);
        }
      }
    }
  }
});

test("the Demon gets three bluffs that are not in play and claims one", () => {
  for (let seed = 0; seed < 100; seed++) {
    const s = createState(ecp, 10, seed);
    const tokens = new Set(s.players.flatMap((p) => [p.role, p.shown]));
    const demon = s.players.find((p) => p.role === "imp");

    assert.equal(s.demonBluffs.length, 3);
    assert.deepEqual(demon.bluffs, s.demonBluffs);
    assert.ok(s.demonBluffs.includes(demon.claim));

    for (const id of s.demonBluffs) {
      assert.ok(!tokens.has(id), `${id} is in play`);
      assert.notEqual(id, "drunk");
      assert.notEqual(team(id), "minion");
      assert.notEqual(team(id), "demon");
    }
  }
});

test("Minions share the Demon's bluffs only at the configured chance", () => {
  for (let seed = 0; seed < 50; seed++) {
    const always = createState(ecp, 12, seed, { minionBluffChance: 1 });
    const never = createState(ecp, 12, seed, { minionBluffChance: 0 });
    // The Spy always knows the bluffs and claims something else (tested
    // separately), so only the other Minions follow the chance.
    const minions = (s) =>
      s.players.filter((p) => team(p.role) === "minion" && p.role !== "spy");

    for (const p of minions(always)) {
      assert.deepEqual(p.bluffs, always.demonBluffs);
      assert.ok(always.demonBluffs.includes(p.claim));
    }

    for (const p of minions(never)) {
      assert.deepEqual(p.bluffs, []);
      assert.equal(team(p.claim), "townsfolk");
      assert.ok(never.script.ids.includes(p.claim));
    }
  }
});

test("NPC suspicion stays put within a day, moves off dead players, and never lands on the human", () => {
  const s = base("suspicion");
  const strat = new SimpleStrategy();
  const chef = s.players[1];

  const first = strat.suspicion(s, chef);

  for (let i = 0; i < 10; i++) {
    assert.equal(strat.suspicion(s, chef).targetId, first.targetId);
  }

  s.players.find((x) => x.id === first.targetId).alive = false;

  for (let day = 2; day < 30; day++) {
    s.day = day;

    const now = s.players.find(
      (x) => x.id === strat.suspicion(s, chef).targetId,
    );

    assert.ok(now.alive);
    assert.equal(now.human, false);
    assert.notEqual(now.id, chef.id);
  }
});

test("the debug log lists the Demon's bluffs at setup", () => {
  const s = createState(ecp, 10, "log-bluffs");
  const e = new Engine(s);

  e.start();
  settle(e);
  e.finish("good", "Test complete.");

  const log = e.debugLog();
  const names = s.demonBluffs.map(name).join(", ");

  assert.equal(s.demonBluffs.length, 3);
  assert.ok(log.includes(`Bluffs:  ${names}`));
  assert.ok(log.includes(`[bluffs] Demon bluffs (told to `));
  assert.ok(log.indexOf("[bluffs]") < log.indexOf("=== Night 1"));
});

// ── Human night choices ──────────────────────────────────────

// If the Storyteller has woken the human, choose the first eligible players.
function settle(e) {
  while (e.s.pending) {
    e.choose(
      e.s.players
        .filter((p) => p.alive && !p.human)
        .slice(0, e.s.pending.count)
        .map((p) => p.id),
    );
  }
}

// Night 1 with the human as `shown` (secretly `trueRole`).
function humanNight(seed, trueRole, shown = trueRole, night = 1) {
  const s = base(seed);
  const human = s.players[0];

  role(human, trueRole, "good");
  human.shown = shown;
  human.claim = shown;

  s.phase = "night";
  s.night = night;
  s.day = night - 1;

  const strat = new SimpleStrategy();
  strat.demon = () => null;

  return { s, human, strat, e: new Engine(s, strat) };
}

test("a human Fortune Teller is woken to pick 2 players, and learns about them", () => {
  const { s, human, e } = humanNight("human-ft", "fortuneteller");
  const imp = s.players[4];
  const chef = s.players[1];

  e.start();

  assert.equal(s.phase, "night");
  assert.equal(s.pending.count, 2);
  assert.throws(() => e.ask(chef.id), /Talk during the day/);
  assert.throws(() => e.choose([chef.id]), /Select 2 living players/);

  e.choose([chef.id, imp.id]);

  assert.equal(s.pending, null);
  assert.equal(s.phase, "day");
  assert.equal(
    human.memories[0].text,
    `Fortune Teller: YES for ${chef.label} and ${imp.label}.`,
  );
  assert.deepEqual(human.memories[0].targets, [chef.id, imp.id]);
});

test("a drunk human Fortune Teller's picks are used, but the answer is wrong", () => {
  const { s, human, e } = humanNight("human-ft-drunk", "drunk", "fortuneteller");
  const chef = s.players[1];
  const imp = s.players[4];

  e.start();
  e.choose([chef.id, imp.id]);

  assert.equal(
    human.memories[0].text,
    `Fortune Teller: NO for ${chef.label} and ${imp.label}.`,
  );
});

test("a human Monk is woken from Night 2, and their pick is safe from the Demon", () => {
  const { s, human, strat, e } = humanNight("human-monk", "monk", "monk", 2);
  const chef = s.players[1];

  strat.demon = () => chef;

  e.night();

  assert.equal(s.pending.count, 1);
  assert.throws(() => e.choose([human.id]), /Select 1 living player/);

  e.choose([chef.id]);

  assert.equal(chef.alive, true);
  assert.equal(
    human.memories[0].text,
    `Monk: protected ${chef.label} from the Demon.`,
  );
});

test("a poisoned human Monk still picks, but the protection fails", () => {
  const { s, human, strat, e } = humanNight("human-monk-poisoned", "monk", "monk", 2);
  const chef = s.players[1];

  role(s.players[3], "poisoner", "evil");
  strat.poison = () => human;
  strat.demon = () => chef;

  e.night();
  e.choose([chef.id]);

  assert.equal(human.poisoned, true);
  assert.equal(chef.alive, false);
  assert.equal(
    human.memories[0].text,
    `Monk: protected ${chef.label} from the Demon.`,
  );
});

test("the human Monk is not woken on Night 1", () => {
  const { s, e } = humanNight("human-monk-n1", "monk");

  e.start();

  assert.equal(s.pending, null);
  assert.equal(s.phase, "day");
});

test("a human Butler picks a master, whose vote their own vote depends on", () => {
  const { s, human, e } = humanNight("human-butler", "butler");
  const chef = s.players[1];

  e.strat.vote = () => false;
  e.start();
  e.choose([chef.id]);

  assert.equal(human.master, chef.id);

  // The chef doesn't vote, so the Butler's own vote doesn't count.
  const result = e.nominate(s.players[2].id);
  const mine = result.records.find((r) => r.playerId === human.id);

  assert.equal(mine.attempted, true);
  assert.equal(mine.counted, false);
});

test("NPC Slayers never shoot on Day 1, then 20% on Day 2, rising 20% a day", () => {
  const strat = new SimpleStrategy();

  assert.equal(strat.slayChance(1), 0);
  assert.equal(strat.slayChance(2), 0.2);
  assert.ok(Math.abs(strat.slayChance(3) - 0.4) < 1e-9);
  assert.ok(Math.abs(strat.slayChance(4) - 0.6) < 1e-9);
  assert.equal(strat.slayChance(10), 1);

  for (let i = 0; i < 30; i++) {
    const s = base(`slayer-timing-${i}`);
    const slayer = s.players[1];

    role(slayer, "slayer", "good");

    s.day = 1;
    assert.equal(strat.slay(s, slayer), null);

    // By Day 10 the chance is 100%, at a living NPC they suspect.
    s.day = 10;

    const t = strat.slay(s, slayer);

    assert.ok(t.alive && !t.human && t.id !== slayer.id);
  }
});

// ── Spy bluffs, Virgin nominations, Minion suspicion, Artist ─

test("the Spy knows the Demon's bluffs and claims a different, not-in-play character", () => {
  let spies = 0;

  for (const raw of [script, ecp]) {
    for (let seed = 0; seed < 200; seed++) {
      const s = createState(raw, 12, seed);
      const spy = s.players.find((p) => p.role === "spy");

      if (!spy) {
        continue;
      }

      spies++;

      const shown = new Set(s.players.map((p) => p.shown));

      assert.deepEqual(spy.bluffs, s.demonBluffs);
      assert.ok(!s.demonBluffs.includes(spy.claim), spy.claim);
      assert.ok(!shown.has(spy.claim), `${spy.claim} is in play`);
      assert.ok(
        !s.players.some((p) => p !== spy && p.claim === spy.claim),
        `${spy.claim} is double-claimed`,
      );
    }
  }

  assert.ok(spies > 0);
});

test("evil Minions never cast suspicion on the Demon", () => {
  const strat = new SimpleStrategy();

  for (let seed = 0; seed < 100; seed++) {
    const s = createState(ecp, 12, seed);
    const demon = s.players.find((p) => p.role === "imp");

    for (const m of s.players.filter((p) => team(p.role) === "minion")) {
      // Even a stale suspect who is now evil is dropped.
      m.suspicion = { targetId: demon.id, day: 0 };

      for (let day = 1; day < 5; day++) {
        s.day = day;

        const t = strat.suspicion(s, m);

        assert.ok(t, `${m.label} has nobody to suspect`);
        assert.equal(
          s.players.find((p) => p.id === t.targetId).alignment,
          "good",
        );
      }
    }
  }
});

test("requesting a nomination of a Virgin executes a Townsfolk NPC nominator", () => {
  const s = base("request-virgin");
  const chef = s.players[1];
  const virgin = s.players[2];

  role(virgin, "virgin", "good");

  const strat = new SimpleStrategy();

  strat.nominator = () => chef;
  strat.demon = () => null;

  const e = new Engine(s, strat);
  const result = e.requestNomination(virgin.id);

  assert.equal(result.virgin, true);
  assert.equal(chef.alive, false);
  assert.equal(virgin.alive, true);
  assert.equal(s.players[0].alive, true);
  assert.equal(s.day, 2);
  assert.ok(
    s.publicLog.includes(
      `Day 1 — You asked for a nomination: ${chef.label} nominates ${virgin.label}.`,
    ),
  );
  assert.ok(
    s.publicLog.includes(
      `Day 1 — ${chef.label} nominated ${virgin.label} and was executed immediately.`,
    ),
  );
});

test("a requested Virgin nomination by an evil or Outsider NPC goes to a normal vote", () => {
  for (const nominatorRole of ["baron", "butler"]) {
    const s = base(`request-virgin-${nominatorRole}`);
    const virgin = s.players[1];
    const nominator = s.players.find((p) => p.role === nominatorRole);

    role(virgin, "virgin", "good");

    const strat = new SimpleStrategy();

    strat.nominator = () => nominator;
    strat.vote = () => false;

    const e = new Engine(s, strat);
    const result = e.requestNomination(virgin.id);

    assert.equal(result.virgin, undefined);
    assert.equal(nominator.alive, true);
    assert.equal(virgin.virginUsed, true);
    assert.equal(s.day, 1);
  }
});

test("a dead human can't nominate, but can request a nomination", () => {
  const s = base("dead-request");
  const human = s.players[0];
  const chef = s.players[1];

  human.alive = false;

  const strat = new SimpleStrategy();

  strat.vote = () => false;

  const e = new Engine(s, strat);

  assert.throws(() => e.nominate(chef.id), /Request a nomination/);

  const result = e.requestNomination(chef.id);

  assert.equal(result.marked, false);
  assert.equal(e.nominatedToday(chef.id), true);
});

test("Artist questions can cover 1–3 players: 'Is any of X, Y and Z ...?'", () => {
  const s = base("artist-multi");
  const [, chef, butler, baron, imp] = s.players;

  assert.equal(
    artistInfo(s, [chef, butler, imp], "demon", "truth").text,
    `Artist: asked if any of ${chef.label}, ${butler.label} and ${imp.label} is the Demon: YES.`,
  );
  assert.equal(
    artistInfo(s, [chef, butler], "evil", "truth").text,
    `Artist: asked if any of ${chef.label} and ${butler.label} is evil: NO.`,
  );
  assert.equal(
    artistInfo(s, [baron], "minion", "lie").text,
    `Artist: asked if ${baron.label} is a Minion: NO.`,
  );

  const strat = new SimpleStrategy();

  for (let i = 0; i < 50; i++) {
    const ask = strat.artist(s, chef);

    assert.ok(ask.targets.length >= 1 && ask.targets.length <= 3);
    assert.equal(new Set(ask.targets).size, ask.targets.length);
    assert.ok(ask.targets.every((t) => t.alive && !t.human && t !== chef));
    assert.ok(Object.keys(ARTIST_QUESTIONS).includes(ask.question));
  }
});

// ── Improving evil ───────────────────────────────────────────

test("Minions bluffing a first-night role back up the Demon's claim", () => {
  for (let i = 0; i < 20; i++) {
    const s = bluffNight(`confirm-${i}`);
    const spy = s.players[3];
    const imp = s.players[4];

    // Minion pair: a Baron as Washerwoman and the Spy as Grandmother.
    const baron = s.players[2];

    role(baron, "baron", "evil");
    imp.claim = "empath";
    baron.claim = "washerwoman";
    spy.claim = "grandmother";

    new Engine(s).start();

    const ww = baron.memories[0];

    assert.ok(ww.targets.includes(imp.id), ww.text);
    assert.match(ww.text, / is Empath\.$/);
    assert.equal(
      spy.memories[0].text,
      `Grandmother: your grandchild is ${imp.label}, the Empath.`,
    );
  }
});

test("a Minion Librarian only vouches for the Demon if the Demon claims an Outsider", () => {
  for (const [claim, vouches] of [
    ["saint", true],
    ["empath", false],
  ]) {
    const s = bluffNight(`confirm-lib-${claim}`);
    const spy = s.players[3];
    const imp = s.players[4];

    imp.claim = claim;
    spy.claim = "librarian";

    new Engine(s).start();

    const info = spy.memories[0];
    const vouched =
      info.targets.includes(imp.id) && info.text.endsWith(`${name(claim)}.`);

    assert.equal(vouched, vouches, info.text);
  }
});

test("the Demon avoids bluffing first-night information roles", () => {
  let checked = 0;

  for (const raw of [script, ecp]) {
    for (let seed = 0; seed < 200; seed++) {
      const s = createState(raw, 10, seed);
      const demon = s.players.find((p) => p.role === "imp");
      const canAvoid = s.demonBluffs.some((x) => !FIRST_NIGHT_INFO.includes(x));

      if (canAvoid) {
        checked++;
        assert.ok(!FIRST_NIGHT_INFO.includes(demon.claim), demon.claim);
      }
    }
  }

  assert.ok(checked > 0);
});

test("only Townsfolk claimers nominate a claimed Virgin, first-night claimers first", () => {
  const s = base("virgin-nominator");
  const strat = new SimpleStrategy();
  const [, chef, butler, baron, imp] = s.players;

  role(butler, "virgin", "good");
  baron.claim = "empath"; // evil Townsfolk bluffer, ongoing info
  imp.claim = "imp"; // not a Townsfolk claim

  for (let i = 0; i < 30; i++) {
    assert.equal(strat.nominator(s, butler), chef);
  }

  // Without a first-night claimer, the evil Empath bluffer steps up.
  chef.claim = "saint";

  for (let i = 0; i < 30; i++) {
    assert.equal(strat.nominator(s, butler), baron);
  }

  // The Drunk claims their Townsfolk token, so they count too.
  role(chef, "drunk", "good");
  chef.shown = "chef";
  chef.claim = "chef";

  for (let i = 0; i < 30; i++) {
    assert.equal(strat.nominator(s, butler), chef);
  }

  // Nobody claims a Townsfolk: nobody nominates.
  chef.claim = "saint";
  baron.claim = "recluse";

  assert.equal(strat.nominator(s, butler), null);
});

test("the Poisoner goes after ongoing information roles", () => {
  const s = base("poison-ongoing");
  const strat = new SimpleStrategy();
  const empath = s.players[2];

  role(empath, "empath", "good");

  for (let i = 0; i < 30; i++) {
    assert.equal(strat.poison(s), empath);
  }
});

test("an evil Empath bluffer keeps their number until a neighbour dies", () => {
  for (let i = 0; i < 20; i++) {
    const s = base(`empath-bluff-${i}`);
    const baron = s.players[3];
    const e = new Engine(s);

    baron.claim = "empath";

    const report = () => {
      e.bluffs();
      return baron.memories.at(-1).text;
    };

    // Neighbours: the Butler and the Imp, so the true number is 1.
    s.night = 1;
    const first = report();

    s.night = 2;
    assert.equal(report(), first);
    assert.notEqual(first, "Empath number: 1.");

    // The Butler dies; the new neighbours are the Chef and the Imp.
    s.players[2].alive = false;
    s.night = 3;

    const after = report();

    assert.notEqual(after, first);
    assert.notEqual(after, "Empath number: 1.");
  }
});

// ── Purposeful Demon kills & a shared scapegoat ──────────────

test("the Demon skips public Soldier/Mayor claims when no priority fires", () => {
  for (let i = 0; i < 50; i++) {
    const s = base(`demon-target-${i}`);
    const strat = new SimpleStrategy();
    const [, chef, butler, , imp] = s.players;

    chef.claimKnown = true;
    chef.claim = "soldier";
    s.r = () => 0.99; // no kill-priority chance fires

    // Only the Butler is a good NPC without a Soldier/Mayor claim.
    assert.equal(strat.demon(s, imp), butler);
  }
});

test("the Demon prefers public information claimers, ongoing ones first", () => {
  const s = createState(ecp, 10, "demon-voices");
  const strat = new SimpleStrategy();
  const imp = s.players.find((p) => p.role === "imp");
  const good = s.players.filter((p) => !p.human && p.alignment === "good");

  for (const p of good) {
    p.claimKnown = false;
  }

  const [chef, empath] = good;

  chef.claimKnown = true;
  chef.claim = "chef";
  empath.claimKnown = true;
  empath.claim = "empath";

  s.r = () => 0; // every kill-priority chance fires

  assert.equal(strat.demon(s, imp), empath);

  empath.claim = "saint";

  assert.equal(strat.demon(s, imp), chef);
});

test("a nominated Demon who survived passes the Demon to a Minion", () => {
  const s = base("star-pass");
  const strat = new SimpleStrategy();
  const imp = s.players[4];

  s.r = () => 0; // always within DEMON_STAR_PASS_CHANCE

  assert.notEqual(strat.demon(s, imp), imp);

  s.nominated = [imp.id];

  assert.equal(strat.demon(s, imp), imp);

  // With no Minion left to take over, it doesn't.
  s.players[3].alive = false;

  assert.notEqual(strat.demon(s, imp), imp);
});

test("the evil team shares one scapegoat, and replaces them when they die", () => {
  const s = base("scapegoat");
  const strat = new SimpleStrategy();
  const [, , , baron, imp] = s.players;

  s.r = () => 0; // always within SCAPEGOAT_CHANCE

  const a = strat.suspect(s, baron, s.players.filter((x) => x !== baron));
  const b = strat.suspect(s, imp, s.players.filter((x) => x !== imp));

  assert.equal(a, b);
  assert.equal(a.id, s.scapegoat);
  assert.equal(a.alignment, "good");
  assert.equal(a.human, false);

  a.alive = false;

  const next = strat.suspect(s, baron, s.players.filter((x) => x.alive));

  assert.notEqual(next, a);
  assert.equal(next.id, s.scapegoat);
});

test("evil information bluffs frame the scapegoat", () => {
  for (let i = 0; i < 20; i++) {
    const s = bluffNight(`frame-${i}`);
    const poisoner = s.players[3];
    const imp = s.players[4];

    // A Poisoner bluffing Investigator, and the Imp bluffing Fortune Teller.
    role(poisoner, "poisoner", "evil");
    poisoner.claim = "investigator";
    imp.claim = "fortuneteller";
    s.red = s.players[0].id; // keep the red herring off the NPCs

    new Engine(s).start();

    const goat = s.players.find((x) => x.id === s.scapegoat);
    const inv = poisoner.memories[0];
    const ft = imp.memories[0];

    assert.ok(goat && goat.alignment === "good" && !goat.human);
    assert.ok(inv.targets.includes(goat.id), inv.text);
    assert.ok(ft.targets.includes(goat.id), ft.text);
    assert.match(ft.text, /: YES for/);

    // A dying evil Ravenkeeper bluffer names the scapegoat as evil.
    poisoner.claim = "ravenkeeper";

    new Engine(s).kill(poisoner, "demon");

    const raven = poisoner.memories.at(-1).text;
    const seen = raven.match(/ is (.+)\.$/)[1];

    assert.ok(raven.startsWith(`${goat.label} is `), raven);
    assert.ok(
      ["Poisoner", "Spy", "Scarlet Woman", "Baron", "Imp"].includes(seen),
      seen,
    );
  }
});

test("the debug log shows who the evil team is framing", () => {
  const s = base("log-scapegoat");
  const e = new Engine(s);

  s.players[3].claim = "chef";
  s.phase = "night";
  s.night = 1;
  s.day = 0;
  e.strat.suspect(s, s.players[3], s.players);
  e.start();
  e.finish("good", "Test complete.");

  const goat = s.players.find((x) => x.id === s.scapegoat);

  assert.ok(e.debugLog().includes(`Evil team is framing: ${goat.label}`));
});

// ── Opinions, kill priorities, Gambler ───────────────────────

const memory = (role, text, targets, night = 1) => ({
  night,
  role,
  text,
  targets: targets.map((p) => p.id),
});

test("a good NPC with no information has nothing else to add", () => {
  const s = base("opinion-nothing");
  const e = new Engine(s);

  assert.ok(e.ask(s.players[1].id).endsWith("\nI have nothing else to add."));
});

test("NPCs trust or suspect players named by their own information", () => {
  const s = base("opinion-info");
  const strat = new SimpleStrategy();
  const [, chef, butler, baron, imp] = s.players;

  chef.memories.push(
    memory("fortuneteller", "Fortune Teller: NO for X and Y.", [butler, baron]),
  );

  const trust = strat.opinion(s, chef);

  assert.equal(trust.type, "trust");
  assert.ok([butler.id, baron.id].includes(trust.targetId));
  assert.match(trust.text, /^I trust Player \d+, because of what I learned on Night 1\.$/);

  chef.memories.push(memory("empath", "Empath number: 1.", [butler, imp], 2));

  const sus = strat.opinion(s, chef);

  assert.equal(sus.type, "suspicious");
  assert.ok([butler.id, imp.id].includes(sus.targetId));
  assert.match(sus.text, /^I'm suspicious of Player \d+, because of what I learned on Night 2\.$/);
});

test("evil NPCs' bluffed information vouches for teammates and accuses the scapegoat", () => {
  const s = base("opinion-evil");
  const strat = new SimpleStrategy();
  const [, chef, butler, baron, imp] = s.players;

  // A Washerwoman "confirming" the Demon: trust the Demon, not the other.
  baron.memories.push(
    memory("washerwoman", "One of X and Y is Empath.", [imp, chef]),
  );

  for (let i = 0; i < 20; i++) {
    assert.equal(strat.opinion(s, baron).targetId, imp.id);
  }

  // A framing Fortune Teller YES: suspicious of the scapegoat.
  s.scapegoat = butler.id;
  baron.memories.push(
    memory("fortuneteller", "Fortune Teller: YES for X and Y.", [chef, butler], 2),
  );

  for (let i = 0; i < 20; i++) {
    const o = strat.opinion(s, baron);

    assert.equal(o.type, "suspicious");
    assert.equal(o.targetId, butler.id);
  }
});

test("the Demon works down its kill priorities for claimed characters", () => {
  const s = base("kill-priority");
  const strat = new SimpleStrategy();
  const [, chef, butler, , imp] = s.players;

  s.r = () => 0; // every priority level's chance fires

  chef.claimKnown = true;
  butler.claimKnown = true;
  chef.claim = "chef"; // med
  butler.claim = "monk"; // high

  assert.equal(strat.demon(s, imp), butler);

  butler.claim = "saint"; // low

  assert.equal(strat.demon(s, imp), chef);

  // An avoided claim is passed over for anyone else.
  chef.claim = "fool"; // avoid

  assert.equal(strat.demon(s, imp), butler);

  // With every chance missing, it attacks any good NPC it isn't avoiding.
  s.r = () => 0.99;

  assert.equal(strat.demon(s, imp), butler);
});

test("an NPC Gambler can die by their own ability", () => {
  const strat = new SimpleStrategy();
  const { s, e } = nightTwo("gambler-wild", strat);
  const gambler = s.players[1];

  role(gambler, "gambler", "good");

  // A wild guess (within GAMBLER_WILD_GUESS_CHANCE) at the first character
  // on the script, about the first other player: "You are the Washerwoman"
  // for the human Mayor, which is wrong.
  s.r = () => 0;

  e.night();

  assert.equal(gambler.alive, false);
  assert.equal(gambler.death, "gambler");
});

test("the Demon can target its own Minions, by their kill priority", () => {
  const s = base("kill-minion");
  const strat = new SimpleStrategy();
  const [, , , baron, imp] = s.players;
  const saved = DEMON_KILL_PRIORITY.baron;

  s.r = () => 0; // every kill-priority chance fires

  try {
    DEMON_KILL_PRIORITY.baron = "high";
    assert.equal(strat.demon(s, imp), baron);

    // An avoided Minion is never picked while a good NPC is available.
    DEMON_KILL_PRIORITY.baron = "avoid";
    assert.notEqual(strat.demon(s, imp), baron);
  } finally {
    DEMON_KILL_PRIORITY.baron = saved;
  }
});

test("with no good NPC left, the Demon attacks any random NPC", () => {
  const s = base("kill-no-good");
  const strat = new SimpleStrategy();
  const [, chef, butler, baron, imp] = s.players;

  chef.alive = false;
  butler.alive = false;
  s.r = () => 0.99; // no kill-priority chance fires

  // Only the Baron is left (the Demon never attacks the human).
  assert.equal(strat.demon(s, imp), baron);
});

test("a Minion's public med/high bluff raises their kill priority", () => {
  const s = base("kill-minion-bluff");
  const strat = new SimpleStrategy();
  const [, chef, , baron, imp] = s.players;

  s.r = () => 0; // every kill-priority chance fires

  // The Chef is a public "med" claim; the Baron (true level "low") publicly
  // claims the Empath, a "high" character, so they are killed first.
  chef.claimKnown = true;
  chef.claim = "chef";
  baron.claimKnown = true;
  baron.claim = "empath";

  assert.equal(strat.demon(s, imp), baron);

  // A private bluff doesn't count: the public "med" Chef goes first.
  baron.claimKnown = false;

  assert.equal(strat.demon(s, imp), chef);

  // A Minion the Demon avoids stays avoided, whatever they claim.
  role(baron, "poisoner", "evil");
  baron.claimKnown = true;
  baron.claim = "empath";

  assert.equal(strat.demon(s, imp), chef);
});

// ── Sects & Violets ──────────────────────────────────────────

const sv = JSON.parse(
  fs.readFileSync(
    new URL("../scripts/Sects and Violets_1_0_0.json", import.meta.url),
  ),
);

// Plays a whole game with simple moves (talk, nominate, end the day), making
// any night choices for the human, and returns the final state.
function playOut(raw, seats, seed) {
  const s = createState(raw, seats, seed);
  const e = new Engine(s);
  const expected =
    /No conversation slots|Already asked|Nobody is able|Already nominated|already nominated today|Savant unavailable/;
  const attempt = (fn) => {
    try {
      fn();
    } catch (err) {
      if (!expected.test(err.message)) {
        throw err;
      }
    }
  };

  e.start();

  for (let turn = 0; turn < 40 && !s.winner; turn++) {
    settle(e);

    if (s.winner) {
      break;
    }

    for (const p of s.players.filter((x) => !x.human).slice(0, 2)) {
      attempt(() => e.ask(p.id));
    }

    if (e.human().shown === "savant" && e.human().alive) {
      attempt(() => e.savant());
    }

    const target = s.players.find(
      (x) => x.alive && !x.human && !e.nominatedToday(x.id),
    );

    if (turn % 2 && target) {
      attempt(() =>
        e.human().alive ? e.nominate(target.id) : e.requestNomination(target.id),
      );
    } else if (s.phase === "day") {
      e.endDay();
    }
  }

  return { s, e };
}

test("whole games play out on every script without errors", () => {
  for (const raw of [script, ecp, sv]) {
    for (const seats of [5, 7, 10, 13, 15]) {
      for (let seed = 0; seed < 16; seed++) {
        const { s, e } = playOut(raw, seats, `play-${seats}-${seed}`);

        assert.ok([null, "good", "evil"].includes(s.winner));
        assert.ok(s.players.every((p) => ["good", "evil"].includes(p.alignment)));
        assert.ok(e.debugLog().length > 0);
      }
    }
  }
});

test("Sects & Violets loads with its name and 25 characters", () => {
  const s = createState(sv, 10, "sv");

  assert.equal(s.script.meta.name, "Sects & Violets");
  assert.equal(s.script.ids.length, 25);
});

test("the Fang Gu adds an Outsider and the Vigormortis removes one", () => {
  const seen = new Set();

  for (let seed = 0; seed < 200; seed++) {
    const s = createState(sv, 8, seed); // normally 1 Outsider
    const demon = s.players.find((p) => team(p.role) === "demon").role;
    const outsiders = s.players.filter((p) => team(p.role) === "outsider").length;
    const expected = { fanggu: 2, vigormortis: 0 }[demon] ?? 1;

    seen.add(demon);
    assert.equal(outsiders, expected, `${demon} (seed ${seed})`);
  }

  assert.ok(seen.has("fanggu") && seen.has("vigormortis"));
});

test("the Mutant claims a Townsfolk that isn't in play", () => {
  let mutants = 0;

  for (let seed = 0; seed < 300; seed++) {
    const s = createState(sv, 10, seed);
    const tokens = new Set(s.players.map((p) => p.shown));

    for (const p of s.players.filter((x) => x.role === "mutant")) {
      mutants++;
      assert.equal(team(p.claim), "townsfolk");
      assert.ok(!tokens.has(p.claim), p.claim);
    }
  }

  assert.ok(mutants > 0);
});

test("the Vortox makes Townsfolk information false, and wins on a day with no execution", () => {
  const s = bluffNight("vortox");
  const chef = s.players[1];

  role(s.players[4], "vortox", "evil");
  role(s.players[3], "baron", "evil");

  const e = new Engine(s);

  e.start();

  // Baron and Vortox sit together: the true Chef number is 1.
  assert.notEqual(chef.memories[0].text, "Chef number: 1.");
  assert.equal(chef.memories[0].functioning, false);

  e.endDay();

  assert.equal(s.winner, "evil");
});

test("the No Dashii poisons its nearest Townsfolk on each side", () => {
  const strat = new SimpleStrategy();
  const { s, e } = nightTwo("nodashii", strat);
  const [human, chef, butler] = s.players;

  role(s.players[4], "nodashii", "evil");

  e.night();

  // Clockwise of the No Dashii is the human Mayor; anticlockwise, past the
  // Baron and the Butler (not Townsfolk), the Chef.
  assert.equal(human.poisoned, true);
  assert.equal(chef.poisoned, true);
  assert.equal(butler.poisoned, false);
});

test("the first Outsider a Fang Gu kills becomes the Fang Gu instead", () => {
  const strat = new SimpleStrategy();
  const { s, e } = nightTwo("fanggu", strat);
  const butler = s.players[2];
  const fang = s.players[4];

  role(fang, "fanggu", "evil");
  strat.demon = () => butler;

  e.night();

  assert.equal(fang.alive, false);
  assert.equal(butler.alive, true);
  assert.equal(butler.role, "fanggu");
  assert.equal(butler.alignment, "evil");
  assert.equal(s.winner, null);
});

test("a Minion the Vigormortis kills keeps their ability and poisons a Townsfolk neighbour", () => {
  const strat = new SimpleStrategy();
  const { s, e } = nightTwo("vigormortis", strat);
  const [human, chef, , baron] = s.players;

  role(s.players[4], "vigormortis", "evil");
  strat.demon = () => baron;

  e.night();

  assert.equal(baron.alive, false);
  assert.equal(baron.vigor, true);
  assert.equal(s.lastingPoison.length, 1);

  const poisoned = s.players.find((x) => x.id === s.lastingPoison[0].id);

  assert.ok([human, chef].includes(poisoned));

  // Still poisoned the next night.
  strat.demon = () => null;
  e.endDay();

  assert.equal(poisoned.poisoned, true);
});

test("a Snake Charmer who picks the Demon swaps with them", () => {
  const s = bluffNight("snake");
  const charmer = s.players[1];
  const imp = s.players[4];

  role(charmer, "snakecharmer", "good");

  const strat = new SimpleStrategy();
  strat.snake = () => imp;

  new Engine(s, strat).start();

  assert.equal(charmer.role, "imp");
  assert.equal(charmer.alignment, "evil");
  assert.equal(imp.role, "snakecharmer");
  assert.equal(imp.alignment, "good");
  assert.equal(imp.poisoned, true);
  assert.equal(imp.lastingPoison, true);
  assert.equal(s.winner, null);
});

test("a player the Witch cursed dies when they nominate", () => {
  const s = bluffNight("witch");
  const human = s.players[0];

  role(s.players[3], "witch", "evil");

  const strat = new SimpleStrategy();

  strat.witch = () => human;
  strat.vote = () => false;

  const e = new Engine(s, strat);

  e.start();

  const result = e.nominate(s.players[1].id);

  assert.equal(human.alive, false);
  assert.equal(human.death, "witch");
  assert.equal(result.marked, false);
  assert.ok(result.records.length > 0);
});

test("the Evil Twin: good can't win while both live, and executing the good twin loses", () => {
  const s = base("twins");
  const [, chef, , twin, imp] = s.players;

  role(twin, "eviltwin", "evil");
  s.twins = { evilId: twin.id, goodId: chef.id };

  const strat = new SimpleStrategy();

  strat.vote = () => true;

  const e = new Engine(s, strat);

  // The Demon dies, but both twins live: no good win.
  e.kill(imp, "slayer");
  e.check();

  assert.equal(s.winner, null);

  // Executing the good twin wins it for evil.
  e.nominate(chef.id);
  e.endDay();

  assert.equal(chef.alive, false);
  assert.equal(s.winner, "evil");
});

test("the good twin learns who their Evil Twin is", () => {
  const s = bluffNight("twin-info");
  const human = s.players[0];
  const twin = s.players[3];

  role(twin, "eviltwin", "evil");
  s.twins = { evilId: twin.id, goodId: human.id };

  new Engine(s).start();

  assert.ok(
    s.privateLog.includes(`Night 1: Evil Twin: ${twin.label} is your Evil Twin.`),
  );
});

test("a dying Klutz who picks an evil player loses the game for good", () => {
  const s = base("klutz");
  const klutz = s.players[2];
  const imp = s.players[4];

  role(klutz, "klutz", "good");

  const strat = new SimpleStrategy();
  strat.klutz = () => imp;

  new Engine(s, strat).kill(klutz, "demon");

  assert.equal(s.winner, "evil");
  assert.ok(s.publicLog.includes(`${klutz.label} claims Klutz and chooses ${imp.label}.`));
});

test("a dying Sweetheart makes someone drunk from now on", () => {
  const s = base("sweetheart");
  const sweetheart = s.players[2];

  role(sweetheart, "sweetheart", "good");

  new Engine(s).kill(sweetheart, "demon");

  const drunk = s.players.filter((p) => p.drunkFrom === "sweetheart");

  assert.equal(drunk.length, 1);
  assert.equal(drunk[0].alignment, "good");
});

test("a dying Barber lets the Demon swap two players' characters", () => {
  const s = base("barber");
  const [, chef, barber, baron] = s.players;

  role(barber, "barber", "good");

  const strat = new SimpleStrategy();
  strat.barber = () => [chef, baron];

  new Engine(s, strat).kill(barber, "execution");

  assert.equal(chef.role, "baron");
  assert.equal(baron.role, "chef");
  assert.equal(chef.claim, "baron");
});

test("a human Dreamer picks a player and learns 1 good and 1 evil character, 1 correct", () => {
  const { s, human, e } = humanNight("human-dreamer", "dreamer");
  const imp = s.players[4];

  e.start();

  assert.equal(s.pending.count, 1);

  e.choose([imp.id]);

  const text = human.memories[0].text;

  assert.match(text, new RegExp(`^Dreamer: ${imp.label} is the .+ or the .+\\.$`));
  assert.ok(text.includes("the Imp"), text);
});

test("a human Seamstress can skip, then use their ability once", () => {
  const { s, human, strat, e } = humanNight("human-seamstress", "seamstress");
  const [, chef, , , imp] = s.players;

  e.start();

  assert.equal(s.pending.optional, true);

  e.choose([]);

  assert.equal(s.phase, "day");
  assert.equal(human.seamUsed, false);

  strat.demon = () => null;
  e.endDay();
  e.choose([chef.id, imp.id]);

  assert.equal(human.seamUsed, true);
  assert.equal(
    human.memories.at(-1).text,
    `Seamstress: ${chef.label} and ${imp.label} are different alignments.`,
  );

  // Used up: not woken again.
  e.endDay();

  assert.equal(s.pending, null);
});

test("the human Savant visits the Storyteller once a day", () => {
  const s = base("savant");
  const human = s.players[0];

  role(human, "savant", "good");

  const e = new Engine(s);
  const text = e.savant();

  assert.match(text, /^Savant: one of these is true:\n".+"\n".+"$/);
  assert.throws(() => e.savant(), /Savant unavailable/);
});

test("the Oracle, Flowergirl and Town Crier learn about the dead and the day", () => {
  const strat = new SimpleStrategy();
  const s = base("oracle-day");
  const [, oracle, crier, baron, imp] = s.players;
  const flowergirl = s.players[0];

  role(oracle, "oracle", "good");
  role(crier, "towncrier", "good");
  role(flowergirl, "flowergirl", "good");
  strat.demon = () => null;

  const e = new Engine(s, strat);

  // During Day 1, the Demon voted, the Baron nominated, and then died.
  s.dayVoters = [imp.id];
  s.dayNominators = [baron.id];
  baron.alive = false;

  e.endDay();

  assert.equal(oracle.memories[0].text, "Oracle: 1 dead player is evil.");
  assert.equal(crier.memories[0].text, "Town Crier: a Minion nominated today.");
  assert.equal(
    flowergirl.memories[0].text,
    "Flowergirl: a Demon voted today.",
  );
});

test("the Mathematician counts abilities that worked abnormally", () => {
  const strat = new SimpleStrategy();
  const { s, e } = nightTwo("mathematician", strat);
  const [, math, butler] = s.players;

  role(math, "mathematician", "good");
  role(s.players[3], "poisoner", "evil");
  strat.poison = () => butler;

  e.night();

  assert.equal(math.memories[0].text, "Mathematician number: 1.");
});

test("an NPC Philosopher gains an ability; a character in play is made drunk", () => {
  const s = bluffNight("philosopher");
  const [, philosopher, butler] = s.players;

  role(philosopher, "philosopher", "good");

  const strat = new SimpleStrategy();
  strat.philosopher = () => "butler";

  new Engine(s, strat).start();

  assert.equal(philosopher.gained, "butler");
  assert.equal(butler.drunkFrom, "philosopher");
  assert.ok(
    philosopher.memories.some(
      (m) => m.text === "Philosopher: gained the Butler ability.",
    ),
  );
});

test("the Pit-Hag turns a good NPC into a new character", () => {
  const strat = new SimpleStrategy();
  const { s, e } = nightTwo("pithag", strat);
  const chef = s.players[1];

  role(s.players[3], "pithag", "evil");
  strat.pithag = () => ({ target: chef, role: "sweetheart" });

  e.night();

  assert.equal(chef.role, "sweetheart");
  assert.equal(chef.claim, "sweetheart");
});

test("a player the Cerenovus made mad claims that character for a day", () => {
  const s = bluffNight("cerenovus");
  const chef = s.players[1];

  role(s.players[3], "cerenovus", "evil");

  const strat = new SimpleStrategy();

  strat.cerenovus = () => ({ target: chef, role: "mayor" });
  strat.demon = () => null;

  const e = new Engine(s, strat);

  e.start();

  // The Mayor has no night information to make up.
  assert.equal(
    e.ask(chef.id),
    "I claim Mayor.\nI have no stored information.\nI have nothing else to add.",
  );
  assert.equal(chef.claim, "mayor");

  strat.cerenovus = () => null;
  e.endDay();

  assert.equal(chef.claim, "chef");
});

test("an NPC Juggler guesses publicly on Day 1 and learns how many were right", () => {
  const s = bluffNight("juggler");
  const [, juggler, butler, , imp] = s.players;

  role(juggler, "juggler", "good");

  const strat = new SimpleStrategy();

  strat.juggle = () => [
    { id: butler.id, role: "butler" },
    { id: imp.id, role: "chef" },
  ];
  strat.demon = () => null;

  const e = new Engine(s, strat);

  e.start();

  assert.ok(
    s.publicLog.includes(
      `Day 1 — ${juggler.label} claims Juggler and guesses:\n${butler.label} is the Butler\n${imp.label} is the Chef`,
    ),
  );

  e.endDay();

  assert.equal(
    juggler.memories.at(-1).text,
    "Juggler: 1 of my 2 guesses was correct.",
  );
});

test("a Sage killed by the Demon learns it is 1 of 2 players", () => {
  const s = base("sage");
  const sage = s.players[1];
  const imp = s.players[4];

  role(sage, "sage", "good");

  new Engine(s).kill(sage, "demon");

  assert.ok(sage.memories[0].text.startsWith("Sage: the Demon is "));
  assert.ok(sage.memories[0].targets.includes(imp.id));
});

test("information treats every Sects & Violets Demon as the Demon", () => {
  const s = base("any-demon");
  const demon = s.players[4];

  for (const id of ["fanggu", "vigormortis", "nodashii", "vortox"]) {
    role(demon, id, "evil");

    assert.match(artistInfo(s, demon, "demon", "truth").text, /: YES\.$/);
  }
});

test("a mad NPC makes up information to match their mad character", () => {
  const s = bluffNight("mad-empath");
  const chef = s.players[1];

  role(s.players[3], "cerenovus", "evil");

  const strat = new SimpleStrategy();

  // Mad about being the Empath on Day 2.
  strat.cerenovus = () =>
    s.night === 2 ? { target: chef, role: "empath" } : null;
  strat.demon = () => null;

  const e = new Engine(s, strat);

  e.start();
  e.endDay();

  const lines = e.ask(chef.id).split("\n");

  assert.equal(lines[0], "I claim Empath.");
  assert.match(lines[1], /^Night 1: Empath number: [0-2]\.$/);
  assert.match(lines[2], /^Night 2: Empath number: [0-2]\.$/);
  assert.match(
    lines[3],
    /^I( trust|'m suspicious of) Player \d+, because of what I learned on Night \d\.$/,
  );

  // Their real information is untouched, and returns with their claim.
  assert.ok(!chef.memories.some((m) => m.role === "empath"));
});

test("the Cerenovus picks like the Demon, and the madness is another good character", () => {
  const s = base("cerenovus-pick");
  const strat = new SimpleStrategy();
  const [, chef, butler, cerenovus, imp] = s.players;

  role(cerenovus, "cerenovus", "evil");
  imp.alive = false; // no evil teammate to make mad: good targets only
  chef.claimKnown = true;
  chef.claim = "empath"; // a "high" kill priority
  butler.claimKnown = true;
  butler.claim = "saint"; // "low"

  s.r = () => 0; // every priority chance fires

  assert.equal(strat.cerenovus(s, cerenovus).target, chef);

  // The madness is always a good character other than who they are.
  role(chef, "drunk", "good");
  chef.shown = "empath";
  chef.claim = "empath";
  chef.claimKnown = true;

  for (let i = 0; i < 50; i++) {
    s.r = Math.random;

    const { target, role: mad } = strat.cerenovus(s, cerenovus);

    assert.equal(target.alignment, "good");
    assert.notEqual(mad, "drunk");
    assert.ok(![target.role, target.shown, target.claim].includes(mad), mad);
    assert.equal(
      ["townsfolk", "outsider"].includes(team(mad)),
      true,
      mad,
    );
  }
});

// ── Nominations: mark, then execute at the end of the day ────

test("a nomination with enough votes marks the nominee; ending the day executes them", () => {
  const s = base("mark");
  const strat = new SimpleStrategy();
  const chef = s.players[1];

  strat.vote = () => true;
  strat.demon = () => null;

  const e = new Engine(s, strat);
  const result = e.nominate(chef.id);

  assert.equal(result.marked, true);
  assert.equal(result.nominatorId, s.players[0].id);
  assert.equal(chef.alive, true);
  assert.ok(e.debugLog().includes("is marked for execution"));

  e.endDay();

  assert.equal(chef.alive, false);
  assert.equal(chef.death, "execution");
  assert.ok(s.audit.some((x) => x.type === "execution"));
});

test("ending the day with nobody marked executes nobody", () => {
  const s = base("no-mark");
  const strat = new SimpleStrategy();

  strat.vote = () => false;
  strat.demon = () => null;

  const e = new Engine(s, strat);

  e.nominate(s.players[1].id);
  e.endDay();

  assert.ok(s.players.every((p) => p.alive));
  assert.equal(s.day, 2);
  assert.equal(s.lastExecution, null);
});

test("a later nomination only takes the mark with more votes; a tie leaves nobody marked", () => {
  const s = createState(script, 10, "ties");

  // Plain good players, so nothing but the test changes the vote counts
  // (evil players won't vote for teammates, a Butler's vote may not count).
  for (const p of s.players) {
    role(p, "chef", "good");
  }

  // Day 1 with everyone alive: 5 votes needed.
  s.phase = "day";
  s.night = 1;
  s.day = 1;

  const strat = new SimpleStrategy();
  const e = new Engine(s, strat);
  const npcs = s.players.filter((p) => !p.human);
  const voteFor = (count) => {
    const yes = new Set(s.players.slice(0, count).map((p) => p.id));

    strat.vote = (_, v) => yes.has(v.id);
  };

  // 6 votes (the human always votes): marked.
  voteFor(6);
  assert.equal(e.requestNomination(npcs[0].id).marked, true);
  assert.equal(e.marked(), npcs[0]);

  // 5 votes: enough, but fewer than 6; the mark stays.
  voteFor(5);
  assert.equal(e.requestNomination(npcs[1].id).marked, false);
  assert.equal(e.marked(), npcs[0]);

  // 6 votes again: a tie, so nobody is marked.
  voteFor(6);
  assert.equal(e.requestNomination(npcs[2].id).marked, false);
  assert.equal(e.marked(), null);
  assert.equal(s.block.count, 6);

  // Still 6: no better than the tie.
  assert.equal(e.requestNomination(npcs[3].id).marked, false);
  assert.equal(e.marked(), null);

  // 7 beats the tie.
  voteFor(7);
  assert.equal(e.requestNomination(npcs[4].id).marked, true);
  assert.equal(e.marked(), npcs[4]);
});

test("each player can nominate only once per day, and requests use NPCs who haven't", () => {
  const s = base("nominators");
  const strat = new SimpleStrategy();
  const [, chef, butler, baron, imp] = s.players;

  strat.vote = () => false;

  const e = new Engine(s, strat);

  e.nominate(chef.id);

  assert.throws(() => e.nominate(butler.id), /already nominated today/);

  // Every NPC except the Imp has nominated: only the Imp is left to ask.
  s.dayNominators.push(chef.id, butler.id, baron.id);

  assert.equal(strat.nominator(s, butler), imp);

  e.requestNomination(butler.id);

  assert.throws(() => e.requestNomination(baron.id), /Nobody is able/);
});

// ── Twins, Juggler, Mutant ───────────────────────────────────

test("the twins each claim to be the good twin and suspect each other, until one dies", () => {
  const s = base("twins-talk");
  const [, chef, butler, twin] = s.players;

  role(twin, "eviltwin", "evil");
  s.twins = { evilId: twin.id, goodId: chef.id };

  const strat = new SimpleStrategy();

  for (const [p, other] of [
    [chef, twin],
    [twin, chef],
  ]) {
    const lines = strat.ask(s, p).split("\n");

    assert.equal(lines[1], `${other.label} is my twin, and I am the good twin.`);
    assert.equal(lines.at(-1), `I'm suspicious of ${other.label}, my evil twin.`);
  }

  // With the Evil Twin dead, the good twin's opinion comes from their info.
  twin.alive = false;
  chef.memories.push({
    night: 2,
    role: "empath",
    text: "Empath number: 0.",
    targets: [butler.id],
  });

  const after = strat.ask(s, chef);

  assert.ok(!after.includes("my twin"));
  assert.ok(after.endsWith(`I trust ${butler.label}, because of what I learned on Night 2.`));
});

test("NPC twins say publicly on Day 1 that they are the good twin", () => {
  const s = bluffNight("twins-public");
  const chef = s.players[1];
  const twin = s.players[3];

  role(twin, "eviltwin", "evil");
  s.twins = { evilId: twin.id, goodId: chef.id };

  new Engine(s).start();

  for (const [p, other] of [
    [twin, chef],
    [chef, twin],
  ]) {
    assert.ok(
      s.publicLog.includes(
        `Day 1 — ${p.label} says ${other.label} is their twin, and that they are the good twin.`,
      ),
    );
  }
});

test("the Juggler's guesses aren't always the claimed characters", () => {
  const s = base("juggle-random");
  const strat = new SimpleStrategy();
  const juggler = s.players[1];

  s.r = () => 0.99; // never within JUGGLER_CLAIM_GUESS_CHANCE

  for (const g of strat.juggle(s, juggler)) {
    assert.notEqual(g.role, s.players.find((x) => x.id === g.id).claim);
  }
});

test("nobody alive claims the Mutant: not bluffers, madness, or a new Mutant", () => {
  for (let seed = 0; seed < 200; seed++) {
    const s = createState(sv, 10, seed);

    assert.ok(s.players.every((p) => p.claim !== "mutant"));
  }

  const s = base("mutant-claims", sv);
  const strat = new SimpleStrategy();
  const [, chef, , cerenovus] = s.players;

  role(cerenovus, "cerenovus", "evil");

  for (let i = 0; i < 50; i++) {
    assert.notEqual(strat.cerenovus(s, cerenovus).role, "mutant");
  }

  // Turned into the Mutant by the Pit-Hag: claims a Townsfolk instead.
  role(s.players[2], "pithag", "evil");
  strat.pithag = () => ({ target: chef, role: "mutant" });
  strat.cerenovus = () => null;
  strat.demon = () => null;
  s.phase = "night";
  s.night = 2;

  new Engine(s, strat).night();

  assert.equal(chef.role, "mutant");
  assert.equal(team(chef.claim), "townsfolk");
});

test("a Juggler always juggles on their first day, and only once", () => {
  const s = bluffNight("juggle-day1");
  const [, juggler, chef] = s.players;

  role(juggler, "juggler", "good");

  const strat = new SimpleStrategy();
  strat.demon = () => null;

  const e = new Engine(s, strat);
  const juggles = () =>
    s.publicLog.filter((x) => x.includes("claims Juggler and guesses")).length;

  e.start();

  assert.equal(juggles(), 1);
  assert.equal(juggler.juggled, true);

  // Someone who becomes the Juggler later juggles on their first day as one.
  role(chef, "juggler", "good");
  e.endDay();

  assert.equal(juggles(), 2);
  assert.equal(chef.juggled, true);
});

// ── Dead players, unused abilities, more evil bluffs ─────────

test("once dead, a Mutant (or Mutant bluffer) claims the Mutant; other evil keep their bluffs", () => {
  const s = base("dead-reveal", sv);
  const [, mutant, , baron, imp] = s.players;
  const strat = new SimpleStrategy();

  role(mutant, "mutant", "good");
  mutant.claim = "dreamer";
  baron.bluff = "mutant";
  baron.claim = "oracle";
  imp.bluff = "savant";
  imp.claim = "savant";

  const e = new Engine(s, strat);

  for (const p of [mutant, baron, imp]) {
    p.alive = false;
  }

  assert.ok(e.ask(mutant.id).startsWith("I claim Mutant."));
  assert.equal(mutant.claim, "mutant");

  // The Baron took the Mutant bluff: now dead, they claim it.
  assert.equal(strat.revealsWhenDead(baron), true);

  // The Imp sticks to their bluff, dead or alive.
  assert.equal(strat.revealsWhenDead(imp), false);
  assert.ok(strat.ask(s, imp).startsWith("I claim Savant."));
});

test("an evil player who takes the Mutant bluff claims a Townsfolk not in play", () => {
  let mutantBluffs = 0;

  for (let seed = 0; seed < 300; seed++) {
    const s = createState(sv, 10, seed);
    const tokens = new Set(s.players.map((p) => p.shown));

    for (const p of s.players.filter((x) => x.bluff === "mutant")) {
      mutantBluffs++;
      assert.equal(team(p.claim), "townsfolk");
      assert.ok(!tokens.has(p.claim), p.claim);
    }
  }

  assert.ok(mutantBluffs > 0);
});

test("NPCs say when they haven't used a once-per-game ability (bluffers too)", () => {
  const s = base("unused");
  const strat = new SimpleStrategy();
  const [, slayer, , baron] = s.players;

  role(slayer, "slayer", "good");
  baron.claim = "artist";

  assert.ok(strat.ask(s, slayer).includes("I haven't used my Slayer ability yet."));
  assert.ok(strat.ask(s, baron).includes("I haven't used my Artist ability yet."));

  slayer.shotUsed = true;
  baron.artistUsed = true;

  assert.ok(!strat.ask(s, slayer).includes("haven't used"));
  assert.ok(!strat.ask(s, baron).includes("haven't used"));
});

test("an evil Philosopher bluffer gains an in-play Townsfolk and bluffs as it", () => {
  const s = bluffNight("philo-bluff");
  const imp = s.players[4];

  imp.claim = "philosopher";

  new Engine(s).start();

  // The only in-play information Townsfolk is the Chef (the Spy registers
  // good, so the true Chef number is 0).
  assert.equal(imp.bluffGained, "chef");
  assert.equal(imp.memories[0].text, "Philosopher: gained the Chef ability.");
  assert.match(imp.memories[1].text, /^Chef number: [12]\.$/);
});

test("evil Seamstress, Snake Charmer and Sage bluffers give false information", () => {
  const s = base("more-bluffs");
  const strat = new SimpleStrategy();
  const [, chef, butler, baron, imp] = s.players;
  const e = new Engine(s, strat);

  // Seamstress: once, and wrong (the Chef and Butler are both good).
  baron.claim = "seamstress";
  strat.seamstress = () => [chef, butler];
  e.bluffs();
  e.bluffs();

  assert.equal(baron.memories.length, 1);
  assert.equal(
    baron.memories[0].text,
    `Seamstress: ${chef.label} and ${butler.label} are different alignments.`,
  );

  // Snake Charmer: a choice each night.
  baron.claim = "snakecharmer";
  strat.snake = () => chef;
  e.bluffs();

  assert.equal(baron.memories.at(-1).text, `Snake Charmer: chose ${chef.label}.`);

  // Sage, killed by the Demon: a pair that doesn't include the Demon.
  baron.claim = "sage";
  e.kill(baron, "demon");

  const sage = baron.memories.at(-1);

  assert.ok(sage.text.startsWith("Sage: the Demon is "));
  assert.ok(!sage.targets.includes(imp.id));
});

test("Juggler guesses that aren't claims are other claims or the Demon's bluffs", () => {
  const s = base("juggle-plausible");
  const strat = new SimpleStrategy();
  const plausible = new Set([
    ...s.players.map((p) => p.claim),
    ...s.demonBluffs,
  ]);

  s.r = () => 0.99; // never within JUGGLER_CLAIM_GUESS_CHANCE

  for (const g of strat.juggle(s, s.players[1])) {
    assert.ok(plausible.has(g.role), g.role);
  }
});

test("shuffling or sampling an empty list returns nothing (and doesn't hang)", () => {
  assert.deepEqual(shuffle([]), []);
  assert.deepEqual(sample([], 2), []);
  assert.deepEqual(shuffle([7]), [7]);
});

// ── Madness and Pit-Hag: announcements and the evil team ─────

test("NPCs announce at dawn when they become mad, and when they recover", () => {
  const s = bluffNight("announce-mad");
  const chef = s.players[1];

  role(s.players[3], "cerenovus", "evil");

  const strat = new SimpleStrategy();

  strat.cerenovus = () =>
    s.night === 1 ? { target: chef, role: "mayor" } : null;
  strat.demon = () => null;

  const e = new Engine(s, strat);

  e.start();

  assert.ok(s.publicLog.includes(`Day 1 — ${chef.label} now claims to be the Mayor.`));

  e.endDay();

  assert.ok(
    s.publicLog.includes(
      `Day 2 — ${chef.label} now claims to be the Chef.`,
    ),
  );
  assert.ok(e.ask(chef.id).includes("Night 1: Chef number:"));
});

test("a good NPC changed by the Pit-Hag announces their new character", () => {
  const strat = new SimpleStrategy();
  const { s, e } = nightTwo("announce-pithag", strat);
  const chef = s.players[1];

  role(s.players[3], "pithag", "evil");
  strat.pithag = () => ({ target: chef, role: "sweetheart" });

  e.night();

  assert.ok(
    s.publicLog.includes(`Day 2 — ${chef.label} says they woke up as the Sweetheart.`),
  );
});

test("the Pit-Hag can change an evil teammate, who keeps their bluff", () => {
  const s = base("pithag-evil", sv);
  const strat = new SimpleStrategy();
  const hag = s.players[3];
  const demon = s.players[4];

  role(hag, "pithag", "evil");
  role(demon, "vortox", "evil");
  demon.claim = "oracle";
  demon.lastClaim = "oracle";

  // Within PITHAG_EVIL_CHANCE: a teammate becomes a same-kind character
  // that isn't in play.
  s.r = () => 0;

  const choice = strat.pithag(s, hag);
  const tokens = new Set(s.players.flatMap((x) => [x.role, x.shown]));

  assert.equal(choice.target.alignment, "evil");
  assert.equal(team(choice.role), team(choice.target.role));
  assert.ok(!tokens.has(choice.role));
  assert.notEqual(choice.role, "eviltwin");

  // Turning the Vortox into a No Dashii: same claim, nothing announced.
  s.r = Math.random;
  s.phase = "night";
  s.night = 2;
  strat.pithag = () => ({ target: demon, role: "nodashii" });
  strat.demon = () => null;

  new Engine(s, strat).night();

  assert.equal(demon.role, "nodashii");
  assert.equal(demon.claim, "oracle");
  assert.ok(!s.publicLog.some((x) => x.includes(`${demon.label} says`)));
});

test("the Cerenovus can make an evil teammate mad; afterwards they return to their bluff", () => {
  const s = bluffNight("cerenovus-evil");
  const cerenovus = s.players[3];
  const imp = s.players[4];

  role(cerenovus, "cerenovus", "evil");
  imp.claim = "empath";
  imp.lastClaim = "empath";

  const strat = new SimpleStrategy();

  // Within CERENOVUS_EVIL_CHANCE: the evil teammate, about a good
  // character that isn't in play.
  s.r = () => 0;

  const choice = strat.cerenovus(s, cerenovus);
  const tokens = new Set(s.players.flatMap((x) => [x.role, x.shown]));

  assert.equal(choice.target, imp);
  assert.ok(!tokens.has(choice.role));
  assert.notEqual(choice.role, "empath");

  s.r = Math.random;
  strat.cerenovus = () =>
    s.night === 1 ? { target: imp, role: "fortuneteller" } : null;
  strat.demon = () => null;

  const e = new Engine(s, strat);

  e.start();

  assert.equal(imp.claim, "fortuneteller");
  assert.match(e.ask(imp.id), /^I claim Fortune Teller\.\nNight 1: Fortune Teller: (YES|NO)/);

  e.endDay();

  assert.equal(imp.claim, "empath");
});

test("when the Pit-Hag makes a Demon, the night's death is random (never the Demon), or nobody", () => {
  const outcomes = new Set();

  for (let i = 0; i < 40; i++) {
    const strat = new SimpleStrategy();
    const { s, e } = nightTwo(`pithag-random-${i}`, strat);
    const demon = s.players[4];
    const chosen = s.players[1];

    role(s.players[3], "pithag", "evil");
    role(demon, "vortox", "evil");
    strat.pithag = () => ({ target: demon, role: "nodashii" });
    strat.demon = () => chosen; // ignored: tonight's death is random

    e.night();

    const dead = s.players.filter((p) => !p.alive);

    assert.ok(demon.alive);
    assert.ok(s.players[0].alive); // never the human
    assert.ok(dead.length <= 1);
    assert.ok(dead.every((p) => p.death === "pithag"));
    outcomes.add(dead.length ? "death" : "none");
  }

  // Both a random death and no death happen across the runs.
  assert.deepEqual([...outcomes].sort(), ["death", "none"]);
});
