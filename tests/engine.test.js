import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { FORBIDDEN_HUMAN, team } from "../src/data.js";
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

  assert.ok(response.includes(`Night 2: Monk: protected ${target.label}.`));
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
  assert.ok(response.includes(`Night 2: Monk: protected ${target.label}.`));
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

  assert.equal(e.nominate(virgin.id).virgin, undefined);
  assert.equal(human.alive, true);
  assert.equal(s.day, 1);
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
