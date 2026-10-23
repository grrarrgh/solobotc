import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  COUNTS,
  PLAYER_COLOURS,
  DEMON_KILL_PRIORITY,
  FORBIDDEN_HUMAN,
  FIRST_NIGHT_INFO,
  ONGOING_INFO,
  FIRST_NIGHT_INFO_SHARE,
  ONGOING_INFO_SHARE,
  EVIDENCE_WEIGHT,
  HUMAN_NOMINATION_BONUS,
  GOOD_VOTE_CHANCE,
  GOOD_VOTE_EVIDENCE_STEP,
  ARTIST_QUESTIONS,
  COURTIER_CORRECT_CHANCE,
  name,
  team,
  alignment,
} from "../src/data.js";
import { createState, infoTarget } from "../src/setup.js";
import { Engine } from "../src/engine.js";
import { SimpleStrategy, speak, isTwin } from "../src/strategy.js";
import {
  ravenInfo,
  artistInfo,
  savantInfo,
  nightInfo,
  infoMode,
  lean,
  scapegoat,
  evilTwinInfo,
} from "../src/storyteller.js";
import { shuffle, sample, rng, byId } from "../src/util.js";

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
// (Games start at 8 seats, so it deals 8 and keeps the first 5.)
function base(seed = "feature-test", raw = script) {
  const s = createState(raw, 8, seed);

  s.players = s.players.slice(0, 5);
  s.seats = 5;
  s.twins = null;

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

  // The Fortune Teller's red herring is one of the 5 good players.
  if (!s.players.some((p) => p.id === s.red)) {
    s.red = s.players[1].id;
  }

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
  const e = new Engine(createState(script, 8, "test"));

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
  // (The evil speaker, the Baron, bluffs the same.)
  for (const p of [s.players[1], s.players[3]]) {
    p.memories.push({
      night: 1,
      role: "chef",
      text: "Chef number: 1.",
      targets: [],
    });
  }

  return s;
}

function suspicionTarget(s, response) {
  const label = response.match(/I'm suspicious of (Player \d+)[.:]/)[1];

  return s.players.find((p) => p.label === label);
}

test("NPC suspicion statements obey status and target constraints", () => {
  for (const kind of ["good", "evil", "poisoned", "drunk"]) {
    const s = askedState(kind);
    const e = new Engine(s);
    const speaker = kind === "evil" ? s.players[3] : s.players[1];

    const response = e.ask(speaker.id);
    const target = suspicionTarget(s, response);

    assert.ok(target);
    assert.equal(target.human, false);
    assert.notEqual(target.id, speaker.id);
    assert.match(response, /I'm suspicious of Player \d+[.:]/);

    if (kind === "evil") {
      assert.equal(target.alignment, "good");
    }
  }
});

test("good NPCs can't see alignments: with no evidence, their hunches are anyone", () => {
  const seen = new Set();

  for (let i = 0; i < 60; i++) {
    const s = askedState("good");
    const chef = s.players[1];

    s.r = rng(`hunch-${i}`);
    seen.add(suspicionTarget(s, new Engine(s).ask(chef.id)).alignment);
  }

  assert.deepEqual([...seen].sort(), ["evil", "good"]);
});

test("good NPCs suspect players on public evidence, and say why", () => {
  const s = askedState("good");
  const [, chef, butler, baron] = s.players;
  const strat = new SimpleStrategy();

  // The Baron publicly claims the Chef: the real Chef knows they're lying.
  baron.claim = "chef";
  baron.claimKnown = true;
  baron.publicClaim = "chef";

  let o = strat.opinion(s, chef);

  assert.equal(o.targetId, baron.id);
  assert.equal(
    o.text,
    `I'm suspicious of ${baron.label}: they claim the Chef, but I'm the Chef.`,
  );

  // Once the Chef claims in public too, the Butler sees a double claim.
  chef.claimKnown = true;
  chef.publicClaim = "chef";
  o = strat.opinion(s, butler);
  assert.equal(o.type, "suspicious");
  assert.match(o.text, /they and Player \d both claim the Chef/);

  // Someone who accused the Butler and then died in the night.
  const t = createState(script, 8, "evidence");
  const [, a, b, c] = t.players;

  for (const x of [a, b, c]) {
    role(x, "soldier", "good");
  }

  a.alive = false;
  a.diedAtNight = 2;
  t.statements = [
    { byId: a.id, day: 1, type: "suspicious", targetId: c.id, source: "opinion" },
  ];

  const why = strat.evidence(t, b, c);

  assert.ok(why.score > 0);
  assert.deepEqual(why.reasons, [
    `${a.label} was suspicious of them, then died in the night`,
  ]);
  assert.equal(strat.suspect(t, b, [c, ...t.players.slice(4)]), c);
});

test("what NPCs say when asked is recorded for others to weigh", () => {
  const s = base("statements");
  const [, chef, , baron] = s.players;

  chef.memories.push({
    night: 1,
    role: "investigator",
    text: `One of ${baron.label} and Player 3 is the Baron.`,
    targets: [baron.id],
  });

  new Engine(s).ask(chef.id);

  assert.ok(
    s.statements.some(
      (x) =>
        x.byId === chef.id &&
        x.targetId === baron.id &&
        x.type === "suspicious" &&
        x.source === "info",
    ),
  );
});

test("evil NPCs vote for a teammate only when it can't change the outcome", () => {
  const s = base("teammate-votes");
  const [, , , baron, imp] = s.players;
  const strat = new SimpleStrategy();

  s.r = () => 0; // always within the chance

  assert.equal(strat.vote(s, baron, imp), false); // no tally: never
  assert.equal(strat.vote(s, baron, imp, { yes: 1, needed: 3 }), true);
  assert.equal(strat.vote(s, baron, imp, { yes: 2, needed: 3 }), false);
  assert.equal(strat.vote(s, baron, imp, { yes: 3, needed: 3 }), true);

  // Across many votes, the evil team sometimes votes for its own.
  let teammateVotes = 0;

  for (let seed = 0; seed < 100; seed++) {
    const g = createState(script, 10, seed);
    const e = new Engine(g);

    e.start();
    settle(e);

    const demon = g.players.find((x) => team(x.role) === "demon");

    if (g.phase !== "day" || !demon?.alive) {
      continue;
    }

    const records = e.votes(demon);

    teammateVotes += records.filter(
      (r) => r.attempted && e.player(r.playerId).alignment === "evil",
    ).length;

    // The evil team's votes never decide it.
    const good = records.filter(
      (r) => r.attempted && e.player(r.playerId).alignment !== "evil",
    ).length;
    const evil = records.filter((r) => r.attempted).length - good;

    assert.ok(evil === 0 || good >= e.votesNeeded() || good + evil < e.votesNeeded());
  }

  assert.ok(teammateVotes > 0);
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

  assert.ok(response.includes(`Night 2: I protected ${target.label} from the Demon.`));
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
  assert.ok(response.includes(`Night 2: I protected ${target.label} from the Demon.`));
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
  assert.ok(
    s.audit.some((x) => x.type === "virgin" && x.data.actorId === human.id),
  );
  // (Cleared at dawn, so a later Undertaker doesn't learn about it again.)
  assert.equal(s.lastExecution, null);
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
  assert.ok(e.ask(imp.id).includes(`Night 1: ${speak(imp.memories[0].text)}`));
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
    `Gambler: guessed ${s.players[4].label} is the Chef, and died.`,
  );
  assert.equal(
    right.memories[0].text,
    `Gambler: guessed ${s.players[4].label} is the Imp.`,
  );

  // The dead Gambler suspects them for certain, and says so in the morning.
  assert.equal(wrong.certainSuspect, s.players[4].id);
  assert.equal(new SimpleStrategy().suspicion(s, wrong).targetId, s.players[4].id);
  assert.ok(
    s.publicLog.includes(
      `Day 2 — ${wrong.label} says: "I was the Gambler. I guessed ${s.players[4].label} is the Chef, and died."`,
    ),
    s.publicLog.join("\n"),
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
  assert.ok(e.ask(artist.id).includes(`Day 1: ${speak(yes)}`));
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
  assert.equal(lines[1], `Night 2: I protected ${s.players[2].label} from the Demon.`);
  assert.equal(lines[2], `Night 3: I protected ${s.players[3].label} from the Demon.`);
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
    "alive, poisoned",
    "Information tonight:",
    `${chef.label}:  ${chef.memories[0].text}`,
  ]) {
    assert.ok(log.includes(text), `missing: ${text}`);
  }

  // Night 1 comes before Day 1, which comes before Night 2.
  assert.ok(log.indexOf("=== Night 1") < log.indexOf("=== Day 1"));
  assert.ok(log.indexOf("=== Day 1") < log.indexOf("=== Night 2"));
});

test("setup deals its share of first-night and ongoing information Townsfolk", () => {
  for (const raw of [script, ecp, sv, bmr, op]) {
    const ids = createState(raw, 8, "ids").script.ids;
    const onScript = (list) => ids.filter((id) => list.includes(id)).length;

    for (const seats of Object.keys(COUNTS).map(Number)) {
      for (let seed = 0; seed < 30; seed++) {
        const tf = createState(raw, seats, seed)
          .players.map((p) => p.role)
          .filter((id) => team(id) === "townsfolk");
        const first = tf.filter((id) => FIRST_NIGHT_INFO.includes(id)).length;
        const ongoing = tf.filter((id) => ONGOING_INFO.includes(id)).length;
        const want = infoTarget(tf.length);
        const at = `${raw[0].name ?? "TB"} ${seats}/${seed}: ${tf}`;

        // At least the share, as far as the script allows.
        assert.ok(
          first >= Math.min(want.first, onScript(FIRST_NIGHT_INFO)),
          at,
        );
        assert.ok(
          ongoing >= Math.min(want.ongoing, onScript(ONGOING_INFO)),
          at,
        );
      }
    }
  }

  // The share scales with the number of Townsfolk.
  assert.deepEqual(infoTarget(5), {
    first: Math.round(5 * FIRST_NIGHT_INFO_SHARE),
    ongoing: Math.round(5 * ONGOING_INFO_SHARE),
  });
  assert.ok(infoTarget(9).first >= infoTarget(5).first);
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
// Makes the human's night choices: the first players they can pick (dead
// ones for the Professor, not last night's for the Exorcist), or the first
// character for the Courtier.
function settle(e) {
  while (e.s.pending) {
    const c = e.s.pending;

    if (c.characters) {
      e.choose([], c.characters[0]);
      continue;
    }

    e.choose(
      e.s.players
        .filter(
          (p) =>
            p.alive !== Boolean(c.dead) && !p.human && !c.exclude?.includes(p.id),
        )
        .slice(0, c.count)
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

  assert.equal(strat.onceChance("slayer", 1), 0);
  assert.equal(strat.onceChance("slayer", 2), 0.2);
  assert.ok(Math.abs(strat.onceChance("slayer", 3) - 0.4) < 1e-9);
  assert.ok(Math.abs(strat.onceChance("slayer", 4) - 0.6) < 1e-9);
  assert.equal(strat.onceChance("slayer", 10), 1);

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

  s.day = 10; // late enough that an NPC Artist always asks (ONCE_PER_GAME)

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

test("the Poisoner goes after information roles: first-night ones only on Night 1", () => {
  const s = base("poison-ongoing");
  const strat = new SimpleStrategy();
  const empath = s.players[2];

  role(empath, "empath", "good");

  s.night = 2;

  for (let i = 0; i < 30; i++) {
    assert.equal(strat.poison(s), empath);
  }

  // Night 1: the Chef (first-night information) is fair game too.
  s.night = 1;

  const picks = new Set(
    Array.from({ length: 60 }, () => strat.poison(s).id),
  );

  assert.deepEqual([...picks].sort(), [s.players[1].id, empath.id].sort());
});

test("the Poisoner sometimes picks the human, who then hears false information", () => {
  let poisoned = 0;
  let falseInfo = 0;

  for (let seed = 0; seed < 300; seed++) {
    const s = createState(script, 10, `human-poison-${seed}`);
    const poisoner = s.players.find((x) => x.role === "poisoner");
    const h = s.players[0];

    if (!poisoner || h.role === "drunk") {
      continue;
    }

    const e = new Engine(s);

    e.start();
    settle(e);

    if (s.audit.some((x) => x.type === "poison" && x.data.targetId === h.id)) {
      poisoned++;
      falseInfo += h.memories.some((m) => m.night === 1 && !m.functioning)
        ? 1
        : 0;
    }
  }

  assert.ok(poisoned > 0);
  assert.ok(falseInfo > 0);
});

test("the human can be dealt the Drunk, shown a Townsfolk they can play", () => {
  let drunk = 0;

  for (let seed = 0; seed < 400; seed++) {
    const s = createState(script, 10, seed);
    const h = s.players[0];

    if (h.role !== "drunk") {
      continue;
    }

    drunk++;
    assert.equal(team(h.shown), "townsfolk");
    assert.ok(!FORBIDDEN_HUMAN.has(h.shown), h.shown);
    assert.equal(h.claim, h.shown);
  }

  assert.ok(drunk > 0);
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

test("a Monk, Innkeeper or Butler doesn't trust the player they picked", () => {
  const s = base("opinion-protect");
  const strat = new SimpleStrategy();
  const [, chef, butler, baron] = s.players;

  chef.memories.push(
    memory("monk", `Monk: protected ${baron.label} from the Demon.`, [baron]),
    memory("innkeeper", `Innkeeper: protected ${butler.label} and ${baron.label}.`, [butler, baron], 2),
  );

  assert.doesNotMatch(strat.opinion(s, chef).text ?? "", /because of what I learned/);
  assert.ok(!strat.trusted(s, chef).has(baron.id));
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

const bmr = JSON.parse(
  fs.readFileSync(
    new URL("../scripts/Bad Moon Rising_1_0_0.json", import.meta.url),
  ),
);

test("whole games play out on every script without errors", () => {
  for (const raw of [script, ecp, sv, bmr]) {
    for (const seats of [8, 10, 12, 13, 15]) {
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

test("an executed Barber's swap happens that night", () => {
  const s = base("barber");
  const [, chef, barber, baron] = s.players;

  role(barber, "barber", "good");

  const strat = new SimpleStrategy();
  strat.barber = () => [chef, baron];

  const e = new Engine(s, strat);

  e.kill(barber, "execution");

  // Nothing yet in the day...
  assert.equal(chef.role, "chef");
  assert.equal(s.barberPending, barber.id);

  // ...then the Demon swaps them that night.
  e.night();

  assert.equal(chef.role, "baron");
  assert.equal(baron.role, "chef");
  assert.equal(chef.claim, "baron");
  assert.equal(s.barberPending, null);
});

test("a Barber who dies at night is swapped straight away", () => {
  const s = base("barber-night");
  const [, chef, barber, baron] = s.players;

  role(barber, "barber", "good");

  const strat = new SimpleStrategy();
  strat.barber = () => [chef, baron];

  s.phase = "night";
  new Engine(s, strat).kill(barber, "demon");

  assert.equal(chef.role, "baron");
  assert.equal(baron.role, "chef");
  assert.equal(s.barberPending, null);
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
  assert.match(lines[1], /^Night 1: My number is [0-2]\.$/);
  assert.match(lines[2], /^Night 2: My number is [0-2]\.$/);
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
  assert.equal(e.votesNeeded(), 5);
  voteFor(6);
  assert.equal(e.requestNomination(npcs[0].id).needed, 5);
  assert.equal(e.votesNeeded(), 7); // more than the 6 the mark has
  assert.equal(e.marked(), npcs[0]);
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

  // Still 6: no better than the tie (7 needed).
  assert.equal(e.votesNeeded(), 7);
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

test("NPCs announce madness changes, but only to a claim they made in public", () => {
  const s = bluffNight("announce-mad");
  const chef = s.players[1];

  role(s.players[3], "cerenovus", "evil");

  const strat = new SimpleStrategy();

  strat.cerenovus = () =>
    s.night === 2 ? { target: chef, role: "mayor" } : null;
  strat.demon = () => null;

  const e = new Engine(s, strat);
  const said = (x) => s.publicLog.some((line) => line.includes(x));

  e.start();
  e.ask(chef.id); // the Chef claims Chef in public on Day 1
  e.endDay();

  assert.ok(said(`Day 2 — ${chef.label} now claims to be the Mayor.`));

  e.ask(chef.id); // ...and Mayor on Day 2, while mad
  e.endDay();

  assert.ok(
    said(
      `Day 3 — ${chef.label}: "Yesterday the Cerenovus made me mad as the Mayor, I am actually the Chef."`,
    ),
  );
  assert.ok(e.ask(chef.id).includes("Night 1: My number is"));
});

test("a mad NPC who never claimed in public says nothing when the madness ends", () => {
  const s = bluffNight("announce-quiet");
  const chef = s.players[1];

  role(s.players[3], "cerenovus", "evil");

  const strat = new SimpleStrategy();

  strat.cerenovus = () =>
    s.night === 1 ? { target: chef, role: "mayor" } : null;
  strat.demon = () => null;

  const e = new Engine(s, strat);

  e.start(); // mad on Day 1, but nobody asks them
  e.endDay();

  assert.equal(chef.claim, "chef");
  assert.ok(!s.publicLog.some((x) => x.includes(`${chef.label} now claims`)));
  assert.ok(!s.publicLog.some((x) => x.includes(`${chef.label}: "Yesterday`)));
});

test("a good NPC changed by the Pit-Hag announces their new character", () => {
  const strat = new SimpleStrategy();
  const { s, e } = nightTwo("announce-pithag", strat);
  const chef = s.players[1];

  role(s.players[3], "pithag", "evil");
  strat.pithag = () => ({ target: chef, role: "sweetheart" });
  e.claimPublicly(chef); // they had claimed Chef in public

  e.night();

  assert.ok(
    s.publicLog.includes(
      `Day 2 — ${chef.label} says they woke up as the Sweetheart; they were the Chef.`,
    ),
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
  assert.match(e.ask(imp.id), /^I claim Fortune Teller\.\nNight 1: (YES|NO)/);

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

test("abilities that trigger on dying at night work for any night death", () => {
  // A random (Pit-Hag) death on a Ravenkeeper: they still learn a character.
  const s = base("night-death-raven");
  const [, raven, butler, baron] = s.players;
  const e = new Engine(s);

  role(raven, "ravenkeeper", "good");
  butler.alive = false;
  baron.alive = false;
  s.phase = "night";
  s.night = 2;
  s.arbitraryNight = 2;
  s.r = () => 0.99; // a death, not "nobody"

  e.arbitraryDeath();

  assert.equal(raven.alive, false);
  assert.equal(raven.death, "pithag");
  assert.equal(raven.memories.length, 1);
  assert.equal(raven.memories[0].role, "ravenkeeper");

  // A Mayor picked for the random death has someone else die instead.
  const m = base("night-death-mayor");
  const [, chef, mayor, minion] = m.players;
  const me = new Engine(m);

  role(mayor, "mayor", "good");
  minion.alive = false;
  m.phase = "night";
  m.night = 2;
  m.arbitraryNight = 2;
  m.r = () => 0.99; // picks the last in the pool: the Mayor

  me.arbitraryDeath();

  assert.equal(mayor.alive, true);
  assert.equal(chef.alive, false);
});

test("a Mayor's bounce never lands on the Demon or the human", () => {
  for (let i = 0; i < 40; i++) {
    // The Pit-Hag's random death...
    const s = base(`mayor-bounce-${i}`);
    const [human, mayor, , , imp] = s.players;
    const e = new Engine(s);

    role(mayor, "mayor", "good");
    s.phase = "night";
    s.night = 2;
    s.arbitraryNight = 2;

    e.arbitraryDeath();

    assert.ok(human.alive && imp.alive);

    // ...and the Demon's own kill.
    const t = base(`mayor-bounce-demon-${i}`);
    const strat = new SimpleStrategy();

    role(t.players[1], "mayor", "good");
    strat.demon = () => t.players[1];
    t.phase = "night";
    t.night = 2;
    new Engine(t, strat).demon();

    assert.ok(t.players[0].alive && t.players[4].alive);
  }
});

test("made mad again about something else, they say what they were mad as yesterday", () => {
  const s = bluffNight("mad-again");
  const chef = s.players[1];

  role(s.players[3], "cerenovus", "evil");

  const strat = new SimpleStrategy();
  const madness = { 1: "mayor", 2: "oracle" };

  strat.cerenovus = () =>
    madness[s.night] ? { target: chef, role: madness[s.night] } : null;
  strat.demon = () => null;

  const e = new Engine(s, strat);

  e.start();
  e.ask(chef.id); // claims Mayor in public while mad
  e.endDay();

  assert.equal(chef.claim, "oracle");
  assert.ok(
    s.publicLog.includes(
      `Day 2 — ${chef.label}: "Yesterday the Cerenovus made me mad as the Mayor, I am actually the Oracle."`,
    ),
  );

  e.ask(chef.id); // claims Oracle in public while mad
  e.endDay();

  assert.equal(chef.claim, "chef");
  assert.ok(
    s.publicLog.includes(
      `Day 3 — ${chef.label}: "Yesterday the Cerenovus made me mad as the Oracle, I am actually the Chef."`,
    ),
  );
});

// ── Round of improvements: picks, bluffs, votes, dawn deaths ─

test("the Vigormortis prefers to kill its own Minions", () => {
  const s = base("vigor-minions", sv);
  const strat = new SimpleStrategy();
  const [, , , baron, demon] = s.players;

  role(demon, "vigormortis", "evil");
  s.r = () => 0; // the "high" priority's chance fires

  assert.equal(strat.demon(s, demon), baron);
});

test("evil bluffed information never names the human", () => {
  const roles = ["washerwoman", "investigator", "fortuneteller", "grandmother"];

  for (let i = 0; i < 40; i++) {
    for (const claim of roles) {
      const s = bluffNight(`no-human-${claim}-${i}`);
      const imp = s.players[4];

      imp.claim = claim;
      new Engine(s).start();

      for (const m of imp.memories) {
        assert.ok(!m.targets.includes(s.players[0].id), `${claim}: ${m.text}`);
        assert.ok(!/\bYou\b/.test(m.text), `${claim}: ${m.text}`);
      }
    }
  }
});

test("night picks don't repeat when there's someone else to pick", () => {
  const s = base("fresh-picks");
  const strat = new SimpleStrategy();
  const chef = s.players[1];

  for (let i = 0; i < 20; i++) {
    const first = strat.monk(s, chef);
    const second = strat.monk(s, chef);

    assert.notEqual(first, second);

    const a = strat.ft(s, chef).map((x) => x.id);
    const b = strat.ft(s, chef).map((x) => x.id);

    // 4 others: a fresh pair is always possible.
    assert.ok(!b.some((id) => a.includes(id)), `${a} then ${b}`);
  }
});

test("false information isn't obviously false", () => {
  // Wrong numbers stay next to the truth: a lying Chef (truth 0) says 1.
  for (let i = 0; i < 20; i++) {
    const s = bluffNight(`near-${i}`);
    const imp = s.players[4];

    imp.claim = "chef";
    new Engine(s).start();

    assert.equal(imp.memories[0].text, "Chef number: 1.");
  }

  // With nobody dead, a lying Oracle can only say 0; with no votes or
  // nominations, a lying Flowergirl or Town Crier says nobody did.
  const s = base("obvious", sv);
  const strat = new SimpleStrategy();
  const [, , oracle, flower, crier] = s.players;

  role(flower, "witch", "evil");
  role(crier, "fanggu", "evil"); // (not the Vortox: no execution would end the game)
  s.phase = "night";
  s.night = 2;
  strat.demon = () => null;

  const e = new Engine(s, strat);

  for (const [p, claim] of [
    [flower, "flowergirl"],
    [crier, "towncrier"],
  ]) {
    p.claim = claim;
  }

  e.night();

  assert.equal(flower.memories.at(-1).text, "Flowergirl: a Demon did not vote today.");
  assert.equal(crier.memories.at(-1).text, "Town Crier: a Minion did not nominate today.");

  oracle.claim = "oracle";
  role(oracle, "baron", "evil");
  oracle.claim = "oracle";
  e.endDay();

  assert.equal(oracle.memories.at(-1).text, "Oracle: 0 dead players are evil.");
});

test("dead NPCs save their vote for the player they suspect", () => {
  const s = base("ghost-votes");
  const strat = new SimpleStrategy();
  const [, chef, butler, baron, imp] = s.players;

  chef.alive = false;

  // With nothing to go on, only for their hunch.
  for (const n of [butler, baron, imp]) {
    assert.equal(
      strat.vote(s, chef, n),
      strat.suspicion(s, chef).targetId === n.id,
    );
  }

  // Suspicious of the Baron (from their own information): they vote.
  chef.memories.push({
    night: 1,
    role: "investigator",
    text: "One of X and Y is the Poisoner.",
    targets: [baron.id],
  });

  assert.equal(strat.vote(s, chef, baron), true);
  assert.equal(strat.vote(s, chef, butler), false);
});

test("once-per-game timing follows ONCE_PER_GAME", () => {
  const strat = new SimpleStrategy();

  assert.equal(strat.onceChance("artist", 0), 0);
  assert.equal(strat.onceChance("artist", 1), 0.5);
  assert.equal(strat.onceChance("artist", 2), 0.75);
  assert.equal(strat.onceChance("artist", 3), 1);
  assert.equal(strat.onceChance("assassin", 1), 0);
  assert.equal(strat.onceChance("philosopher", 1), 1);
});

test("night deaths are announced at dawn, and a Moonchild learns of their death then", () => {
  const strat = new SimpleStrategy();
  const { s, e } = nightTwo("dawn-deaths", strat);
  const moonchild = s.players[2];

  role(moonchild, "moonchild", "good");
  strat.demon = () => moonchild;
  strat.moonchild = () => s.players[1];

  e.night();

  const dawn = s.publicLog.indexOf(s.publicLog.find((x) => /^Day 2:/.test(x)));
  const died = s.publicLog.indexOf(`Day 2 — ${moonchild.label} died in the night.`);
  const curse = s.publicLog.indexOf(
    `${moonchild.label} claims Moonchild and chooses ${s.players[1].label}.`,
  );

  assert.ok(dawn >= 0 && died > dawn && curse > died, s.publicLog.join(" | "));
  assert.ok(!s.publicLog.includes(`${moonchild.label} died.`));

  // A quiet night says so.
  strat.demon = () => null;
  strat.moonchild = () => null;
  e.endDay();

  assert.ok(
    s.publicLog.includes("Day 3 — Nobody died in the night.") ||
      s.publicLog.some((x) => x.startsWith("Day 3 —") && x.includes("died in the night")),
  );
});

// ── Twins, Savant, Mutant, Dreamer ──────────────────────────

// Sects & Violets: Chef (good twin, Player 2) and Evil Twin (Player 4).
function twinsState(seed = "twins") {
  const s = base(seed, sv);
  const [, good, , evil] = s.players;

  role(good, "chef", "good");
  role(evil, "eviltwin", "evil");
  evil.claim = "chef";
  s.twins = { evilId: evil.id, goodId: good.id };

  return { s, good, evil };
}

test("the Evil Twin's answers mirror the good twin's word for word", () => {
  const { s, good, evil } = twinsState();
  const strat = new SimpleStrategy();

  good.memories = [
    { night: 1, role: "eviltwin", text: `Evil Twin: ${evil.label} is your Evil Twin.` },
    { night: 1, role: "chef", text: "Chef: 1 pair of evil players." },
  ];
  evil.memories = [{ night: 1, role: "chef", text: "Chef: 0 pairs of evil players." }];

  // Swap the two labels, so the good twin's answer reads as the evil one's.
  const swap = (text) =>
    text
      .replaceAll(good.label, "\u0000")
      .replaceAll(evil.label, good.label)
      .replaceAll("\u0000", evil.label);

  assert.equal(strat.ask(s, evil), swap(strat.ask(s, good)));
  assert.match(strat.ask(s, evil), /Night 1: 1 pair of evil players\./);
});

test("the Demon never kills either twin, nor does the Mayor's bounce land on one", () => {
  const { s, good, evil } = twinsState("demon-twins");
  const strat = new SimpleStrategy();
  const imp = s.players[4];

  for (let i = 0; i < 300; i++) {
    const t = strat.demon(s, imp);

    assert.ok(t !== good && t !== evil, `night ${i}: ${t?.label}`);
  }

  // With only the twins left to kill, the Demon kills nobody.
  s.players[2].alive = false;

  assert.equal(strat.demon(s, imp), null);
});

test("Savant statements never name the human, and move on to new players each visit", () => {
  const s = createState(sv, 12, "savant-visits");
  const savant = s.players[1];
  const human = s.players[0];

  role(savant, "savant", "good");

  let last = [];

  for (let day = 1; day <= 12; day++) {
    s.day = day;

    const info = savantInfo(s, savant, "truth");
    const named = savant.lastPicks.savant;

    assert.ok(!info.text.includes(human.label), info.text);
    assert.ok(!named.includes(human.id));
    assert.ok(
      named.every((id) => !last.includes(id)),
      `day ${day}: ${named} after ${last}`,
    );

    last = named;
  }
});

test("a Mutant (or Mutant bluffer) reveals it publicly when they learn they died", () => {
  const s = base("mutant-dies", sv);
  const e = new Engine(s, new SimpleStrategy());
  const [, mutant, bluffer] = s.players;

  role(mutant, "mutant", "good");
  mutant.claim = "chef";
  role(bluffer, "baron", "evil");
  bluffer.bluff = "mutant";
  bluffer.claim = "chef";

  for (const p of [mutant, bluffer]) {
    p.alive = false;
    e.learnsDeath(p);

    assert.equal(p.claim, "mutant");
    assert.ok(
      s.publicLog.includes(`Day 1 — ${p.label} reveals they were the Mutant.`),
      s.publicLog.join("\n"),
    );
  }
});

test("a Dreamer who picks either twin sees the Evil Twin and the good twin's character", () => {
  const { s, good, evil } = twinsState("dream-twins");
  const dreamer = s.players[2];

  role(dreamer, "dreamer", "good");
  s.night = 2;

  for (const t of [good, evil]) {
    const strat = new SimpleStrategy();

    strat.dream = () => t;

    const { text } = nightInfo(s, dreamer, strat);

    assert.match(text, new RegExp(`^Dreamer: ${t.label} is the `));
    assert.ok(text.includes("the Evil Twin") && text.includes("the Chef"), text);
  }
});

test("when the Vigormortis dies, the dead Minions it kept going lose their abilities", () => {
  const strat = new SimpleStrategy();
  const { s, e } = nightTwo("vigormortis-dies", strat);
  const [, , , baron, vigormortis] = s.players;

  role(vigormortis, "vigormortis", "evil");
  strat.demon = () => baron;

  e.night();

  const poisoned = s.players.find((x) => x.id === s.lastingPoison[0].id);

  assert.equal(baron.vigor, true);
  assert.equal(poisoned.poisoned, true);

  s.poisoned = null;
  e.kill(vigormortis, "execution");

  assert.equal(baron.vigor, false);
  assert.equal(poisoned.poisoned, false);
  assert.deepEqual(s.lastingPoison, []);
});

// ── Misinformation helps the evil team ──────────────────────

// Player 2 (good) made drunk on Night 1 as `id`; Baron and Imp are evil.
function misinformed(id, seed) {
  const s = base(seed);
  const p = s.players[1];

  role(p, id, "good");
  p.drunkFrom = "sweetheart";
  s.phase = "night";

  return { s, p, evil: [s.players[3], s.players[4]] };
}

test("poisoned players hear lies, the same as a Drunk", () => {
  const s = base("poison-lies");
  const p = s.players[1];

  p.poisoned = true;
  assert.equal(infoMode(s, p), "lie");

  p.poisoned = false;
  assert.equal(infoMode(s, p), "truth");
});

test("a misinformed Washerwoman's pair gives an evil player cover", () => {
  for (let i = 0; i < 20; i++) {
    const { s, p, evil } = misinformed("washerwoman", `wash-${i}`);
    const info = nightInfo(s, p, new SimpleStrategy());

    assert.ok(
      info.targets.some((id) => evil.some((x) => x.id === id)),
      info.text,
    );
  }
});

test("a misinformed Grandmother vouches for an evil player", () => {
  for (let i = 0; i < 20; i++) {
    const { s, p, evil } = misinformed("grandmother", `gran-${i}`);
    const info = nightInfo(s, p, new SimpleStrategy());

    assert.ok(evil.some((x) => x.id === info.targets[0]), info.text);
  }
});

test("a misinformed Undertaker sees the executed player as the other alignment", () => {
  const { s, p } = misinformed("undertaker", "undertaker-lies");
  const [, , butler, baron] = s.players;

  s.night = 2;

  s.lastExecution = butler.id;
  assert.match(nightInfo(s, p, new SimpleStrategy()).text, /was (Poisoner|Spy|Scarlet Woman|Baron|Imp)\.$/);

  s.lastExecution = baron.id;
  assert.doesNotMatch(nightInfo(s, p, new SimpleStrategy()).text, /was (Poisoner|Spy|Scarlet Woman|Baron|Imp)\.$/);
});

test("a misinformed Investigator names the evil team's scapegoat as a Minion", () => {
  const { s, p } = misinformed("investigator", "investigator-lies");
  const chef = s.players[2];

  role(chef, "chef", "good");
  chef.claimKnown = true;
  s.scapegoat = chef.id;

  assert.ok(nightInfo(s, p, new SimpleStrategy()).targets.includes(chef.id));
});

test("a misinformed Chef reports fewer evil pairs where possible", () => {
  const { s, p } = misinformed("chef", "chef-lies");

  // Baron and Imp sit together: 1 pair, so the lie is 0.
  assert.equal(nightInfo(s, p, new SimpleStrategy()).text, "Chef number: 0.");
});

test("a dying Klutz picks a player they believe is good", () => {
  const s = base("klutz-picks", sv);
  const strat = new SimpleStrategy();
  const [human, klutz, butler, baron, imp] = s.players;

  role(klutz, "klutz", "good");
  klutz.alive = false;

  // Vouched for Player 3 and the Baron; then a YES on the Baron and the Imp.
  klutz.memories = [
    { night: 1, role: "washerwoman", text: "One of them is the Chef.", targets: [butler.id, baron.id] },
    { night: 2, role: "fortuneteller", text: "Fortune Teller: YES for them.", targets: [baron.id, imp.id] },
  ];

  for (let i = 0; i < 50; i++) {
    assert.equal(strat.klutz(s, klutz), butler);
  }

  // Nobody vouched for: anyone but their suspects.
  klutz.memories = [klutz.memories[1]];
  klutz.suspicion = { targetId: butler.id, day: 1 };

  for (let i = 0; i < 50; i++) {
    assert.equal(strat.klutz(s, klutz), human);
  }
});

// ── Witch, Snake Charmer, character changes, public info, conversations ──

test("the Witch never curses the human for Day 1", () => {
  const s = base("witch-day-one", sv);
  const strat = new SimpleStrategy();
  const witch = s.players[3];
  const human = s.players[0];

  role(witch, "witch", "evil");

  s.night = 1;
  for (let i = 0; i < 200; i++) {
    witch.lastPicks = {};
    assert.notEqual(strat.witch(s, witch), human);
  }

  // From Night 2 the human can be cursed again.
  s.night = 2;
  let cursed = false;
  for (let i = 0; i < 200 && !cursed; i++) {
    witch.lastPicks = {};
    cursed = strat.witch(s, witch) === human;
  }
  assert.ok(cursed);
});

test("the Snake Charmer never picks the Demon, and picks themselves if nobody else is left", () => {
  const s = base("snake-picks", sv);
  const strat = new SimpleStrategy();
  const [, charmer, butler, baron, imp] = s.players;

  role(charmer, "snakecharmer", "good");

  for (let i = 0; i < 100; i++) {
    charmer.lastPicks = {};
    assert.notEqual(strat.snake(s, charmer), imp);
  }

  butler.alive = false;
  baron.alive = false;

  assert.equal(strat.snake(s, charmer), charmer);
});

test("a good NPC who changed character in the night announces it at dawn", () => {
  const s = base("woke-changed", sv);
  const e = new Engine(s, new SimpleStrategy());
  const [, chef, , baron] = s.players;

  role(chef, "chef", "good");
  chef.claimKnown = false;
  chef.publicClaim = null;
  chef.dusk = { role: "chef", claim: "chef" };
  chef.role = chef.shown = chef.claim = "sweetheart";

  // An evil player whose character changed says nothing.
  baron.dusk = { role: "baron", claim: "baron" };
  baron.role = "poisoner";

  e.announceClaims();

  assert.ok(
    s.publicLog.includes(
      `Day 1 — ${chef.label} says they woke up as the Sweetheart; they were the Chef.`,
    ),
    s.publicLog.join("\n"),
  );
  assert.ok(!s.publicLog.some((x) => x.includes(`${baron.label} says`)));
  assert.equal(chef.claimKnown, true);
});

test("asked for the first time since, a changed good NPC says what they were before", () => {
  const s = base("asked-changed", sv);
  const strat = new SimpleStrategy();
  const chef = s.players[1];

  role(chef, "sweetheart", "good");
  chef.changes = [{ night: 2, from: "chef", to: "sweetheart", told: false }];

  const line = "I woke up as the Sweetheart on Night 2; before that I was the Chef.";

  assert.ok(strat.ask(s, chef).includes(line));
  assert.ok(!strat.ask(s, chef).includes(line)); // only once
});

test("in 13+ seat games, NPCs may share first-night information in public that morning", () => {
  const s = createState(script, 13, "share-info");
  const e = new Engine(s, new SimpleStrategy());
  const chef = s.players[1];

  role(chef, "chef", "good");
  chef.memories = [{ night: 1, role: "chef", text: "Chef number: 1.", targets: [] }];
  s.night = 1;
  s.day = 1;
  s.r = () => 0; // always within the chance

  e.shareInfo();

  assert.ok(
    s.publicLog.includes(
      `Day 1 — ${chef.label} says: "I am the Chef. Night 1: My number is 1."`,
    ),
    s.publicLog.join("\n"),
  );

  // Smaller games: nobody shares.
  const small = base("share-small");
  const smallChef = small.players[1];

  smallChef.memories = [{ night: 1, role: "chef", text: "Chef number: 1.", targets: [] }];
  small.r = () => 0;
  new Engine(small, new SimpleStrategy()).shareInfo();

  assert.ok(!small.publicLog.some((x) => x.includes("says:")));
});

test("NPCs say their information in their own words, without repeating their character", () => {
  assert.equal(speak("Snake Charmer: chose Player 3."), "I chose Player 3.");
  assert.equal(speak("Chef number: 0."), "My number is 0.");
  assert.equal(speak("Monk: protected Player 2 from the Demon."), "I protected Player 2 from the Demon.");
  assert.equal(
    speak("Grandmother: your grandchild is Player 4, the Chef."),
    "My grandchild is Player 4, the Chef.",
  );
  assert.equal(speak("Fortune Teller: NO for Player 2 and Player 3."), "NO for Player 2 and Player 3.");
  assert.equal(speak("One of Player 2 and Player 3 is Chef."), "One of Player 2 and Player 3 is Chef.");
});

test("a conversation in the public log is headed by the player alone", () => {
  const s = base("conversation-header");
  const e = new Engine(s, new SimpleStrategy());
  const chef = s.players[1];

  chef.memories = [{ night: 1, role: "chef", text: "Chef number: 0.", targets: [] }];
  e.ask(chef.id);

  assert.ok(
    s.publicLog.some((x) =>
      x.startsWith(`Day 1 — ${chef.label}\nI claim Chef.\nNight 1: My number is 0.`),
    ),
    s.publicLog.join("\n"),
  );
});

test("player colours include no white", () => {
  for (const c of PLAYER_COLOURS) {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));

    assert.ok(Math.min(r, g, b) < 0xc0, `${c} is too close to white`);
  }
});

// ── Bad Moon Rising ──────────────────────────────────────────

// Night `night` of the base 5-player game on Bad Moon Rising, with `roles`
// by seat (null keeps the base role: Mayor (you), Chef, Butler, Baron, Imp).
// The Demon doesn't attack unless a test overrides strat.demon.
function bmrNight(seed, roles = [], night = 2) {
  const s = base(seed, bmr);

  roles.forEach((id, i) => id && role(s.players[i], id, alignment(id)));

  s.phase = "night";
  s.night = night;
  s.day = night - 1;

  const strat = new SimpleStrategy();

  strat.demon = () => null;
  strat.butler = (st, b) => st.players.find((x) => x.alive && x !== b);

  return { s, p: s.players, strat, e: new Engine(s, strat) };
}

// The same, during Day `day`, with every NPC voting yes.
function bmrDay(seed, roles = [], day = 1) {
  const g = bmrNight(seed, roles, day);

  g.s.phase = "day";
  g.s.day = day;
  g.strat.vote = () => true;

  return g;
}

test("Bad Moon Rising loads with its name and 25 characters", () => {
  const s = createState(bmr, 10, "bmr");

  assert.equal(s.script.meta.name, "Bad Moon Rising");
  assert.equal(s.script.ids.length, 25);
});

test("the Godfather deals 1 fewer or 1 more Outsider", () => {
  const seen = new Set();

  for (let seed = 0; seed < 300; seed++) {
    const s = createState(bmr, 8, seed); // normally 1 Outsider

    if (s.players.some((p) => p.role === "godfather")) {
      const n = s.players.filter((p) => team(p.role) === "outsider").length;

      assert.ok([0, 2].includes(n), `seed ${seed}: ${n}`);
      seen.add(n);
    }
  }

  assert.deepEqual([...seen].sort(), [0, 2]);
});

// Night 2 of an 8-player Bad Moon Rising game (so the Sailor isn't in the
// late game): You (Chef), Sailor, Butler, Godfather, Zombuul, then good
// players. The Demon doesn't attack unless a test overrides strat.demon.
function sailorNight(seed) {
  const s = createState(bmr, 8, seed);
  const roles = [
    "chef",
    "sailor",
    "butler",
    "godfather",
    "zombuul",
    "gossip",
    "pacifist",
    "minstrel",
  ];

  s.twins = null;
  s.players.forEach((x, i) => role(x, roles[i], alignment(roles[i])));
  s.phase = "night";
  s.night = 2;
  s.day = 1;

  const strat = new SimpleStrategy();

  strat.demon = () => null;
  strat.butler = (st, b) => st.players.find((x) => x.alive && x !== b);

  return { s, p: s.players, strat, e: new Engine(s, strat) };
}

test("the Storyteller's Sailor choice saves a good victim", () => {
  for (let seed = 0; seed < 30; seed++) {
    // The Demon attacks the Sailor: their pick is drunk, so they live.
    const a = sailorNight(`sailor-a-${seed}`);

    a.strat.sailor = () => a.p[2];
    a.strat.demon = () => a.p[1];
    a.e.night();
    assert.equal(a.p[1].alive, true);
    assert.equal(a.p[2].drunkTonight, true);

    // The Sailor chose the Demon, who attacks a good player: the Demon is
    // drunk, so they live.
    const b = sailorNight(`sailor-b-${seed}`);

    b.strat.sailor = () => b.p[4];
    b.strat.demon = () => b.p[2];
    b.e.night();
    assert.equal(b.p[2].alive, true);
    assert.equal(b.p[4].drunkTonight, true);

    // ...but when it attacks its own Minion, the Sailor is drunk instead.
    const c = sailorNight(`sailor-c-${seed}`);

    c.strat.sailor = () => c.p[4];
    c.strat.demon = () => c.p[3];
    c.e.night();
    assert.equal(c.p[3].alive, false);
    assert.equal(c.p[1].drunkTonight, true);
  }
});

test("with nothing at stake, either the Sailor or their pick is drunk", () => {
  const seen = new Set();

  for (let seed = 0; seed < 40; seed++) {
    const { s, p, strat, e } = sailorNight(`sailor-d-${seed}`);

    strat.sailor = () => p[2];
    e.night();

    const drunk = s.audit.find((x) => x.data?.drunkId !== undefined).data.drunkId;

    seen.add(drunk);
    assert.ok([p[1].id, p[2].id].includes(drunk));
  }

  assert.equal(seen.size, 2);
});

test("with fewer than 6 alive, the Sailor is drunk more often than not", () => {
  let died = 0;

  for (let seed = 0; seed < 60; seed++) {
    const { p, strat, e } = bmrNight(`sailor-late-${seed}`, [null, "sailor"]);

    strat.sailor = () => p[2];
    strat.demon = () => p[1];
    e.night();
    died += p[1].alive ? 0 : 1;
  }

  assert.ok(died > 30 && died < 60, `${died} of 60`);
});

test("the Demon may sink a kill so an evil protection claim looks real", () => {
  let sunk = 0;

  for (let seed = 0; seed < 60; seed++) {
    const { s, p, strat, e } = bmrNight(`sink-${seed}`);

    // The Baron has publicly claimed the Monk.
    p[3].claim = "monk";
    p[3].claimKnown = true;
    strat.demon = () => p[1];
    e.night();

    if (s.audit.some((x) => x.data?.outcome === "sunk")) {
      sunk++;
      assert.equal(p[1].alive, true);
    } else {
      assert.equal(p[1].alive, false);
    }
  }

  assert.ok(sunk > 0 && sunk < 30, `${sunk} of 60`);

  // Without a protection bluffer, the Demon never sinks a kill.
  for (let seed = 0; seed < 30; seed++) {
    const { s, p, strat, e } = bmrNight(`no-sink-${seed}`);

    strat.demon = () => p[1];
    e.night();
    assert.ok(!s.audit.some((x) => x.data?.outcome === "sunk"));
  }
});

test("the Innkeeper's 2 players can't die tonight, and 1 is drunk", () => {
  const { s, p, strat, e } = bmrNight("innkeeper", [null, "innkeeper"]);

  strat.innkeeper = () => [p[2], p[3]];
  strat.demon = () => p[2];
  e.night();

  assert.equal(p[2].alive, true);
  assert.equal([p[2], p[3]].filter((x) => x.drunkTonight).length, 1);
  assert.ok(
    s.audit.some((x) => /blocked: protected by the Innkeeper/.test(x.text)),
  );
});

test("a Demon the Exorcist chooses learns who they are and doesn't wake", () => {
  const { s, p, strat, e } = bmrNight("exorcist", [null, "exorcist"]);

  strat.exorcist = () => p[4];
  strat.demon = () => p[2];
  e.night();

  assert.equal(p[2].alive, true);
  assert.equal(p[4].exorcistId, p[1].id);
  assert.ok(s.audit.some((x) => /doesn't wake tonight/.test(x.text)));
  assert.equal(p[1].memories.at(-1).text, `Exorcist: chose ${p[4].label}.`);
});

test("a human Exorcist can't choose last night's player", () => {
  const { s, p, e } = bmrNight("exorcist-human", ["exorcist"]);

  e.night();
  assert.equal(s.pending.role, "exorcist");
  e.choose([p[2].id]);
  e.endDay();

  assert.deepEqual(s.pending.exclude, [p[2].id]);
  assert.throws(() => e.choose([p[2].id]), /last night/);
  e.choose([p[3].id]);
  assert.equal(s.phase, "day");
});

test("the Chambermaid learns how many of 2 players woke tonight", () => {
  const { p, strat, e } = bmrNight("chambermaid", [null, "chambermaid"]);

  // The Imp and the Butler wake on Night 2; the Baron doesn't.
  strat.chambermaid = () => [p[4], p[3]];
  e.night();

  assert.equal(
    p[1].memories.at(-1).text,
    `Chambermaid: 1 of ${p[4].label} and ${p[3].label} woke tonight.`,
  );

  const g = bmrNight("chambermaid-2", [null, "chambermaid"]);

  g.strat.chambermaid = () => [g.p[4], g.p[2]];
  g.e.night();
  assert.match(g.p[1].memories.at(-1).text, /Chambermaid: 2 of/);
});

test("a human Courtier makes the Demon drunk for 3 nights and 3 days", () => {
  const { s, p, strat, e } = bmrNight("courtier", [
    "courtier",
    null,
    null,
    null,
    "zombuul",
  ]);

  strat.demon = () => p[1];
  e.night();
  assert.ok(s.pending.characters.includes("zombuul"));
  e.choose([], "zombuul");

  // Nights 2, 3 and 4: the drunk Zombuul's attacks fail.
  for (const night of [2, 3, 4]) {
    assert.equal(s.night, night);
    assert.equal(p[1].alive, true, `Night ${night}`);
    assert.equal(s.pending, null); // used up
    e.endDay();
  }

  assert.equal(s.night, 5);
  assert.equal(p[1].alive, false);
});

test("a human Professor resurrects a dead Townsfolk, but not an Outsider", () => {
  const { s, p, e } = bmrNight("professor", ["professor"]);

  p[1].alive = false; // Chef
  p[2].alive = false; // Butler
  e.night();

  assert.equal(s.pending.dead, true);
  assert.throws(() => e.choose([p[3].id]), /dead/);
  e.choose([p[1].id]);

  assert.equal(p[1].alive, true);
  assert.ok(
    s.publicLog.includes(
      `Day 2 — The Storyteller announces that ${p[1].label} is alive again.`,
    ),
  );

  const g = bmrNight("professor-2", ["professor"]);

  g.p[2].alive = false;
  g.e.night();
  g.e.choose([g.p[2].id]);
  assert.equal(g.p[2].alive, false);
});

test("a human Gossip's true statement kills a player that night; a false one doesn't", () => {
  const { s, p, e } = bmrDay("gossip", ["gossip"]);

  e.gossip(p[4].id, "demon");
  assert.throws(() => e.gossip(p[1].id, "demon"), /Gossip unavailable/);
  assert.ok(
    s.publicLog.includes(`Day 1 — You say: "${p[4].label} is the Demon."`),
  );
  e.endDay();

  const died = p.filter((x) => x.death === "gossip");

  assert.equal(died.length, 1);
  assert.ok(!died[0].human && died[0] !== p[4]);

  const g = bmrDay("gossip-2", ["gossip"]);

  g.e.gossip(g.p[1].id, "demon");
  g.e.endDay();
  assert.equal(g.p.filter((x) => !x.alive).length, 0);
});

test("an NPC Gossip can die to their own statement; the human never does", () => {
  const victims = { human: 0, npc: 0 };

  for (let seed = 0; seed < 40; seed++) {
    // Human Gossip.
    const h = bmrDay(`gossip-self-${seed}`, ["gossip"]);

    h.e.gossip(h.p[4].id, "demon");
    h.e.endDay();
    victims.human += h.p[0].alive ? 0 : 1;

    // NPC Gossip (Player 2), whose statement is about the Imp.
    const n = bmrDay(`gossip-npc-${seed}`, [null, "gossip"]);

    n.strat.gossip = () => ({ target: n.p[4], question: "demon" });
    n.e.bmrDawn();
    n.e.endDay();
    victims.npc += n.p[1].death === "gossip" ? 1 : 0;
  }

  assert.equal(victims.human, 0);
  assert.ok(victims.npc > 0, "an NPC Gossip never died");
});

test("a Minion executed with the Minstrel alive makes everyone else drunk until dusk tomorrow", () => {
  const { s, p, e } = bmrDay("minstrel", [null, "minstrel"]);

  e.nominate(p[3].id); // Baron
  e.endDay();

  assert.equal(p[3].alive, false);
  assert.equal(s.day, 2);
  assert.ok(p.filter((x) => x !== p[1]).every((x) => x.drunkTonight));
  assert.equal(p[1].drunkTonight, false);

  e.endDay(); // Night 3: sober again.
  assert.equal(p[2].drunkTonight, false);
});

test("the Tea Lady's neighbours can't die while both are good", () => {
  const { p, strat, e } = bmrNight("tealady", [null, "tealady"]);

  strat.demon = () => p[2];
  e.night();
  assert.equal(p[2].alive, true);

  // With an evil neighbour, nobody is protected.
  const g = bmrNight("tealady-2", [null, "tealady", "godfather"]);

  g.strat.demon = () => g.p[2];
  g.e.night();
  assert.equal(g.p[2].alive, false);
});

test("the Pacifist may save an executed good player", () => {
  const { s, p, e } = bmrDay("pacifist", [null, "pacifist"]);
  const r = s.r;
  let first = true;

  e.nominate(p[2].id);
  s.r = () => (first ? ((first = false), 0) : r());
  e.endDay();

  assert.equal(p[2].alive, true);
  assert.ok(s.audit.some((x) => x.type === "pacifist"));
});

test("the first player to choose the Goon is drunk, and the Goon joins their team", () => {
  const { p, strat, e } = bmrNight("goon", [null, "goon"]);

  strat.demon = () => p[1];
  e.night();

  // The Imp is drunk, so its attack fails.
  assert.equal(p[1].alive, true);
  assert.equal(p[1].alignment, "evil");
  assert.equal(p[4].drunkTonight, true);
});

test("the Demon learns who the Lunatic chose, and may kill them", () => {
  const { s, p, strat, e } = bmrNight("lunatic", [null, "lunatic"]);

  p[1].shown = "imp";
  strat.lunatic = () => p[2];
  e.night();

  assert.equal(s.lunaticPick, p[2].id);
  assert.equal(p[2].alive, true);
  assert.ok(s.audit.some((x) => x.type === "lunatic"));

  s.r = () => 0;
  assert.equal(new SimpleStrategy().demon(s, p[4]), p[2]);
});

test("the Godfather kills the night after an Outsider died", () => {
  const { p, strat, e } = bmrDay("godfather", [null, null, null, "godfather"]);

  strat.godfather = () => p[1];
  e.nominate(p[2].id); // Butler
  e.endDay();

  assert.equal(p[2].alive, false);
  assert.equal(p[1].death, "godfather");
});

test("with the Mastermind alive, an executed Demon means 1 more day", () => {
  const { s, p, e } = bmrDay("mastermind", [null, null, null, "mastermind"]);

  e.nominate(p[4].id); // Imp
  e.endDay();

  assert.equal(s.winner, null);
  assert.equal(s.mastermindDay, 2);
  assert.equal(s.day, 2);

  // Executing a good player now loses for good.
  e.nominate(p[1].id);
  e.endDay();
  assert.equal(s.winner, "evil");

  // With nobody executed on the extra day, good wins.
  const g = bmrDay("mastermind-2", [null, null, null, "mastermind"]);

  g.e.nominate(g.p[4].id);
  g.e.endDay();
  g.e.endDay();
  assert.equal(g.s.winner, "good");
});

test("the Zombuul's first death is fake; executing it while 'dead' kills it", () => {
  const { s, p, e } = bmrDay("zombuul", [null, null, null, null, "zombuul"]);
  const z = p[4];

  e.nominate(z.id);
  e.endDay();

  assert.equal(z.alive, false);
  assert.equal(z.undead, true);
  assert.equal(s.winner, null);
  // Someone died today, so it doesn't wake tonight.
  assert.ok(s.audit.some((x) => /Zombuul\) doesn't wake/.test(x.text)));

  // No death on Day 2: it wakes on Night 3.
  e.endDay();
  assert.ok(s.audit.some((x) => x.group === "Night 3" && x.type === "demon"));

  // Dead players can be nominated; this time it dies for good.
  e.nominate(z.id);
  e.endDay();
  assert.equal(s.winner, "good");
});

test("a 'dead' Zombuul keeps the game going until it and 1 other are alive", () => {
  const { s, p, e } = bmrDay("zombuul-2", [null, null, null, null, "zombuul"]);

  p[2].alive = false;
  p[3].alive = false;
  p[4].alive = false;
  p[4].undead = true;

  e.check();
  assert.equal(s.winner, null);

  e.kill(p[1], "test");
  e.check();
  assert.equal(s.winner, "evil");
});

test("the Pukka poisons a player, who dies the next night", () => {
  const { p, strat, e } = bmrNight("pukka", [null, null, null, null, "pukka"], 1);

  strat.demon = () => p[1];
  e.night();

  assert.equal(p[1].poisoned, true);
  assert.equal(p[1].alive, true);
  // (Poisoned on Night 1, the Chef hears false information.)
  assert.equal(p[1].memories[0].functioning, false);

  strat.demon = () => p[2];
  e.endDay();

  assert.equal(p[1].alive, false);
  assert.equal(p[2].poisoned, true);
});

test("the Shabaloth kills 2 players, and might regurgitate one", () => {
  const { s, p, strat, e } = bmrNight("shabaloth", [
    null,
    null,
    null,
    null,
    "shabaloth",
  ]);

  strat.demon = (st, d, exclude = []) =>
    [p[1], p[2]].find((x) => !exclude.includes(x));
  e.night();

  assert.equal(p[1].alive, false);
  assert.equal(p[2].alive, false);
  assert.deepEqual(s.shabaloth, [p[1].id, p[2].id]);

  s.r = () => 0;
  e.regurgitate(p[4]);
  assert.equal(p[1].alive || p[2].alive, true);
});

test("the Po may choose no-one, then kills 3 the next night", () => {
  const { s, p, strat, e } = bmrNight("po", [null, null, null, null, "po"]);
  const real = SimpleStrategy.prototype.demonTargets;

  strat.demon = (st, d, exclude = []) =>
    [p[1], p[2], p[3]].find((x) => !exclude.includes(x));
  // Night 2: the Po charges.
  strat.demonTargets = (st, d) => real.call(strat, { ...st, r: () => 0 }, d);
  e.night();

  assert.equal(p[4].poCharged, true);
  assert.equal(p.filter((x) => !x.alive).length, 0);

  strat.demonTargets = real;
  e.endDay();

  assert.deepEqual(
    [p[1], p[2], p[3]].map((x) => x.alive),
    [false, false, false],
  );
  assert.equal(s.winner, "evil");
});

test("dead players can be nominated, and executing one satisfies the Vortox", () => {
  const s = base("dead-vortox");
  const strat = new SimpleStrategy();
  const e = new Engine(s, strat);

  role(s.players[4], "vortox", "evil");
  s.players[2].alive = false;
  strat.vote = () => true;
  strat.demon = () => null;

  e.nominate(s.players[2].id);
  assert.equal(e.marked(), s.players[2]);
  e.endDay();

  assert.equal(s.winner, null);
  assert.equal(s.day, 2);
  assert.equal(s.players[2].alive, false);
});

test("the Undertaker learns nothing from a dead player's execution, or a day without one", () => {
  const s = base("dead-undertaker");
  const strat = new SimpleStrategy();
  const e = new Engine(s, strat);
  const u = s.players[1];

  // (Not the Mayor: 3 alive and no execution would win the game.)
  role(s.players[0], "chef", "good");
  role(u, "undertaker", "good");
  s.players[2].alive = false;
  strat.vote = () => true;
  strat.demon = () => null;

  e.nominate(s.players[2].id);
  e.endDay();
  assert.equal(u.memories.at(-1).text, "Nobody was executed.");

  e.nominate(s.players[3].id); // Baron
  e.endDay();
  assert.equal(u.memories.at(-1).text, "Executed player was Baron.");

  e.endDay();
  assert.equal(u.memories.at(-1).text, "Nobody was executed.");
});

test("nothing harmful ever targets either twin", () => {
  let checked = 0;

  for (let seed = 0; seed < 60; seed++) {
    const s = createState(sv, 12, `twins-${seed}`);
    const strat = new SimpleStrategy();

    if (!s.twins) {
      continue;
    }

    s.night = 3;
    s.day = 2;

    const npcs = s.players.filter((x) => !x.human && !isTwin(s, x));
    const evil = npcs.find((x) => x.alignment === "evil");
    const good = npcs.find((x) => x.alignment === "good");
    const demon = s.players.find((x) => team(x.role) === "demon");

    if (!evil || !good || isTwin(s, demon)) {
      continue;
    }

    const picks = [
      strat.poison(s, evil),
      strat.assassin(s, evil),
      strat.witch(s, evil),
      strat.cerenovus(s, evil)?.target,
      strat.pithag(s, evil)?.target,
      strat.godfather(s, evil),
      strat.demon(s, demon),
      strat.sweetheart(s, good),
      strat.barber(s),
      strat.moonchild(s, good),
      strat.lunatic(s, good),
      strat.sailor(s, good),
      strat.innkeeper(s, good),
      strat.exorcist(s, good),
    ]
      .flat()
      .filter(Boolean);

    checked++;

    for (const x of picks) {
      assert.ok(!isTwin(s, x), `seed ${seed}: ${x.label} is a twin`);
    }
  }

  assert.ok(checked > 10);
});

test("a Demon that couldn't kill a protected player goes after their protector", () => {
  // Monk, Innkeeper and Tea Lady (Player 2) each protect Player 3 on Night 2.
  const setups = {
    monk: (g) => {
      g.strat.monk = () => g.p[2];
    },
    innkeeper: (g) => {
      g.strat.innkeeper = () => [g.p[2], g.p[3]];
    },
    tealady: () => {},
  };

  for (const [id, setup] of Object.entries(setups)) {
    const g = bmrNight(`protector-${id}`, [null, id]);

    setup(g);
    g.strat.demon = () => g.p[2];
    g.e.night();

    assert.equal(g.p[2].alive, true, id);
    assert.deepEqual(g.p[4].protectors, [g.p[1].id], id);

    // Night 3: the Demon chooses for itself, and picks the protector.
    delete g.strat.demon;
    g.e.endDay();

    assert.equal(g.p[1].death, "demon", id);
  }
});

test("your Good / Evil marks count as evidence for good NPCs", () => {
  const s = base("marks");
  const e = new Engine(s, new SimpleStrategy());
  const strat = new SimpleStrategy();
  const [, chef, butler] = s.players;

  assert.equal(strat.evidence(s, chef, butler).score, 0);

  // (Your marks count a little extra: humanTrusted.)
  const W = EVIDENCE_WEIGHT;

  e.mark(butler.id, "evil");
  assert.equal(strat.evidence(s, chef, butler).score, W.markedEvil + W.humanTrusted);
  assert.deepEqual(strat.evidence(s, chef, butler).reasons, [
    "you think they're evil",
  ]);

  e.mark(butler.id, "good");
  assert.equal(strat.evidence(s, chef, butler).score, W.markedGood - W.humanTrusted);

  e.mark(butler.id, "");
  assert.equal(strat.evidence(s, chef, butler).score, 0);
});

test("good NPCs give your nominations a little extra trust (humanTrusted)", () => {
  const s = base("human-trusted");
  const strat = new SimpleStrategy();
  const [human, chef, butler, baron] = s.players;
  const W = EVIDENCE_WEIGHT;
  // Whether the Chef votes for the Butler when s.r() rolls `roll`.
  const votes = (nominator, roll) => {
    s.r = () => roll;
    return strat.vote(s, chef, butler, { yes: 0, needed: 3, nominator });
  };

  strat.opinion = () => ({ type: "nothing" });

  // Someone else's nomination: the plain chance. Yours: plus
  // HUMAN_NOMINATION_BONUS, and humanTrusted as evidence.
  const theirs = GOOD_VOTE_CHANCE;
  const yours =
    GOOD_VOTE_CHANCE +
    HUMAN_NOMINATION_BONUS +
    GOOD_VOTE_EVIDENCE_STEP * W.humanTrusted;

  assert.equal(votes(baron, theirs - 0.01), true);
  assert.equal(votes(baron, theirs + 0.01), false);
  assert.equal(votes(human, yours - 0.01), true);
  assert.equal(votes(human, yours + 0.01), false);

  // Afterwards: "you nominated them" counts towards suspicion.
  s.voteHistory = [
    { day: 1, nominatorId: human.id, nomineeId: butler.id, voterIds: [] },
  ];

  const why = strat.evidence(s, chef, butler);

  assert.deepEqual(why.reasons, ["you nominated them"]);
  assert.equal(why.score, W.humanTrusted);
});

test("in the final 3, good NPCs vote for whoever you put up", () => {
  const s = base("final-three");
  const strat = new SimpleStrategy();
  const e = new Engine(s, strat);
  const [human, chef, butler, baron, imp] = s.players;
  const vote = (v, humanChoice) =>
    strat.vote(s, v, imp, { yes: 0, needed: 2, nominator: human, humanChoice });

  // The Chef trusts the Imp, and nearly never votes for them...
  strat.opinion = () => ({ type: "trust", targetId: imp.id });
  s.r = () => 0.5;
  assert.equal(vote(chef, true), false);

  // ...until the final 3, when it's your call (alive or dead, and also for
  // a nomination you asked for). Not someone else's nomination, though.
  baron.alive = false;
  butler.alive = false;
  butler.ghost = true;
  assert.equal(vote(chef, true), true);
  assert.equal(vote(butler, true), true);
  assert.equal(vote(chef, false), false);
  assert.equal(vote(imp, true), false);

  // Through the engine: you ask for the Imp's nomination, and they're marked.
  e.requestNomination(imp.id);
  assert.equal(s.block?.nomineeId, imp.id);
});

test("the log's player tables show who each NPC suspects", () => {
  const s = createState(script, 10, "suspects-log");
  const e = new Engine(s);

  e.start();
  settle(e);

  assert.match(e.debugLog(), /\| Suspects +\| Score +\| Why/);
  assert.match(e.debugLog(), /\| Player \d+ +\| -?\d+(\.\d)? +\| (a hunch|.*them)/);
  assert.ok(s.players.filter((p) => !p.human).every((p) => p.suspicion));
});

test("the Storyteller leans towards a final 3 of you, 1 good and 1 evil", () => {
  // 3 evil of 10. (Not a Zombuul, which steers for a final 2.)
  const game = () => {
    const g = createState(bmr, 10, "lean");

    g.players.find((p) => team(p.role) === "demon").role = "pukka";

    return g;
  };
  const s = game();

  assert.equal(lean(s), null);

  // 6 alive with 3 evil: evil is ahead (the path has 2), so help good.
  s.players
    .filter((p) => p.alignment === "good" && !p.human)
    .slice(0, 4)
    .forEach((p) => (p.alive = false));
  assert.equal(lean(s), "good");

  // 6 alive with only the Demon left: good is ahead, so help evil.
  const t = game();

  t.players
    .filter((p) => team(p.role) === "minion")
    .forEach((p) => (p.alive = false));
  t.players
    .filter((p) => p.alignment === "good" && !p.human)
    .slice(0, 2)
    .forEach((p) => (p.alive = false));
  assert.equal(lean(t), "evil");

  // Once you're dead it still steers, for a final 3 with at least 1 good
  // player: 6 alive with just the Demon is still behind (the band is 1.9
  // to 2.4 evil).
  t.players[0].alive = false;
  t.players.find((p) => !p.alive && p.alignment === "good").alive = true;
  assert.equal(t.players.filter((p) => p.alive).length, 6);
  assert.equal(lean(t), "evil");

  // 3 evil of 7 alive: too many while you live, fine once you're dead.
  const u = game();

  u.players
    .filter((p) => p.alignment === "good" && !p.human)
    .slice(0, 3)
    .forEach((p) => (p.alive = false));
  assert.equal(u.players.filter((p) => p.alive).length, 7);
  assert.equal(lean(u), "good");
  u.players[0].alive = false;
  u.players.find((p) => !p.alive && !p.human).alive = true;
  assert.equal(lean(u), null);
});

test("with a Zombuul, the Storyteller steers down to a final 2", () => {
  const s = createState(bmr, 10, "lean-zombuul");
  const demon = s.players.find((p) => team(p.role) === "demon");
  const minion = s.players.find((p) => team(p.role) === "minion");

  // You, the Demon and a Minion left.
  s.players
    .filter((p) => !p.human && p !== demon && p !== minion)
    .forEach((p) => (p.alive = false));

  // Any other Demon: 3 alive is the end of the path, so no steering.
  demon.role = "pukka";
  assert.equal(lean(s), null);

  // A Zombuul can go on to a final 2, so 2 evil of 3 is too many.
  demon.role = "zombuul";
  assert.equal(lean(s), "good");

  // A Zombuul registering as dead still counts as evil; with 2 shown alive
  // (you and the Minion), that's the end of its path.
  demon.alive = false;
  demon.undead = true;
  assert.equal(lean(s), null);
});

test("while helping good, a Gossip's statement kills an evil player", () => {
  for (let seed = 0; seed < 20; seed++) {
    const { s, p, e } = bmrDay(`lean-gossip-${seed}`, ["gossip"]);

    // 3 evil of 5 alive, from 2 evil at the start: the path to a final 3
    // has 2 now, so evil is ahead.
    role(p[2], "godfather", "evil");
    s.players.forEach((x) => (x.startRole = "chef"));
    s.players[3].startRole = "godfather";
    s.players[4].startRole = "imp";
    assert.equal(lean(s), "good");

    e.gossip(p[4].id, "demon");
    e.endDay();

    const died = p.find((x) => x.death === "gossip");

    assert.equal(died?.alignment, "evil", `seed ${seed}`);
  }
});

test("information that contradicts a player's claim makes its owner suspect them", () => {
  const s = base("contradiction");
  const strat = new SimpleStrategy();
  const [, chef, butler, baron] = s.players;
  const claims = (x, id) =>
    Object.assign(x, { claim: id, claimKnown: true, publicClaim: id });

  claims(butler, "butler");
  claims(baron, "librarian");

  // A Ravenkeeper's character.
  chef.memories = [
    {
      night: 2,
      role: "ravenkeeper",
      text: `${butler.label} is Empath.`,
      targets: [butler.id],
    },
  ];

  const why = strat.evidence(s, chef, butler);

  assert.equal(why.score, 2);
  assert.deepEqual(why.reasons, [
    "my information says they're the Empath, but they claim the Butler",
  ]);

  chef.memories[0].text = `${butler.label} is Butler.`;
  assert.ok(strat.trusted(s, chef).has(butler.id));

  // A Grandmother's grandchild.
  chef.memories = [
    {
      night: 1,
      role: "grandmother",
      text: `Grandmother: your grandchild is ${butler.label}, the Chef.`,
      targets: [butler.id],
    },
  ];
  assert.equal(strat.evidence(s, chef, butler).score, 2);

  // A Dreamer's two characters, neither of them their claim.
  chef.memories = [
    {
      night: 1,
      role: "dreamer",
      text: `Dreamer: ${butler.label} is the Chef or the Imp.`,
      targets: [butler.id],
    },
  ];
  assert.equal(strat.evidence(s, chef, butler).score, 2);

  // A Washerwoman's pair where neither claims the character: one is lying.
  chef.memories = [
    {
      night: 1,
      role: "washerwoman",
      text: `One of ${butler.label} and ${baron.label} is Empath.`,
      targets: [butler.id, baron.id],
    },
  ];
  assert.equal(strat.evidence(s, chef, butler).score, 2);
  assert.equal(strat.evidence(s, chef, baron).score, 2);

  // ...and where one of them claims it: they're trusted.
  claims(baron, "empath");
  assert.ok(strat.trusted(s, chef).has(baron.id));
  assert.ok(!strat.trusted(s, chef).has(butler.id));
  assert.equal(strat.evidence(s, chef, butler).score, 0);
});

test("dead players keep their ghost vote until late, unless it's decisive", () => {
  const s = createState(script, 10, "ghost-late");
  const strat = new SimpleStrategy();
  const [, dead, suspect] = s.players.filter(
    (x) => !x.human && x.alignment === "good",
  );

  dead.alive = false;
  dead.certainSuspect = suspect.id;

  // 9 alive: they save it...
  assert.equal(strat.vote(s, dead, suspect, { yes: 1, needed: 5 }), false);
  // ...unless their vote marks the nominee.
  assert.equal(strat.vote(s, dead, suspect, { yes: 4, needed: 5 }), true);

  // With 5 alive, they spend it on their suspect (only).
  s.players
    .filter((x) => x.alive && x !== suspect && !x.human)
    .slice(0, 4)
    .forEach((x) => (x.alive = false));
  assert.equal(s.players.filter((x) => x.alive).length, 5);
  assert.equal(strat.vote(s, dead, suspect, { yes: 0, needed: 3 }), true);

  const other = s.players.find((x) => x.alive && !x.human && x !== suspect);

  assert.equal(strat.vote(s, dead, other, { yes: 0, needed: 3 }), false);
});

// A 12-player Bad Moon Rising game with an NPC Lunatic.
function lunaticGame() {
  for (let seed = 0; ; seed++) {
    const s = createState(bmr, 12, `lunatic-${seed}`);
    const l = s.players.find((p) => p.role === "lunatic");

    if (l) {
      return { s, l, demon: s.players.find((p) => team(p.role) === "demon") };
    }
  }
}

test("the Lunatic is shown another Demon, its own bluffs and false Minions", () => {
  let lunatics = 0;

  for (let seed = 0; seed < 300; seed++) {
    const s = createState(bmr, 12, seed);
    const demon = s.players.find((p) => team(p.role) === "demon");
    const minions = s.players.filter((p) => team(p.role) === "minion");

    assert.ok(!["tinker", "goon", "lunatic"].includes(s.players[0].role));
    assert.ok(!s.demonBluffs.includes("lunatic"));

    for (const p of s.players.filter((x) => x.role === "lunatic")) {
      lunatics++;
      assert.equal(team(p.shown), "demon");
      assert.notEqual(p.shown, demon.role);
      assert.equal(p.alignment, "good");

      // Their own 3 bluffs (good, never the Lunatic), and they claim one.
      assert.equal(p.bluffs.length, 3);
      assert.ok(p.bluffs.every((id) => alignment(id) === "good" && id !== "lunatic"));
      assert.ok(p.bluffs.includes(p.claim));

      // "Minions": the real Demon and good NPCs.
      const team_ = p.lunaticTeam.map((id) => s.players.find((x) => x.id === id));

      assert.equal(team_.length, Math.max(2, minions.length));
      assert.ok(team_.includes(demon));
      assert.ok(
        team_.filter((x) => x !== demon).every((x) => x.alignment === "good" && !x.human),
      );
    }
  }

  assert.ok(lunatics > 0);
});

test("the Lunatic plays for its imagined team", () => {
  const { s, l } = lunaticGame();
  const strat = new SimpleStrategy();
  const mates = s.players.filter((p) => l.lunaticTeam.includes(p.id));

  for (let i = 0; i < 20; i++) {
    const t = strat.suspect(s, l, strat.others(s, l));

    assert.ok(!mates.includes(t));
    assert.ok(!mates.includes(strat.lunatic(s, l)));
  }

  // It votes like the Demon: rarely for a "Minion" when it matters.
  const r = s.r;

  s.r = () => 0.99;
  assert.equal(strat.vote(s, l, mates[0], { yes: 0, needed: 1 }), false);
  s.r = r;
});

test("the evil team frames the Lunatic and never targets them", () => {
  const { s, l, demon } = lunaticGame();
  const strat = new SimpleStrategy();

  s.night = 3;
  assert.equal(scapegoat(s), l);

  for (let i = 0; i < 30; i++) {
    assert.notEqual(strat.demon(s, demon), l);
    assert.notEqual(strat.godfather(s, demon), l);
    assert.notEqual(strat.assassin(s), l);
  }
});

test("a dead Lunatic says the next day who their Minions were", () => {
  const { s, l, demon } = lunaticGame();
  const e = new Engine(s);

  s.phase = "day";
  s.day = 1;
  s.night = 1;
  // (Executed today; marked dead directly, as a Tea Lady or Sailor nearby
  // could stop a real death.)
  l.alive = false;
  l.death = "execution";
  assert.ok(!s.publicLog.some((x) => x.includes("I was the Lunatic")));

  e.endDay();
  settle(e);

  const said = s.publicLog.find((x) => x.includes("I was the Lunatic"));

  assert.ok(said, s.publicLog.join("\n"));
  assert.ok(said.includes(demon.label));
  assert.equal(l.claim, "lunatic");
  assert.ok(
    s.statements.some(
      (x) => x.byId === l.id && x.targetId === demon.id && x.type === "suspicious",
    ),
  );
});

test("a failed Professor exposes a liar, whose word then counts the other way", () => {
  const { s, p, strat, e } = bmrNight("professor-liar", [null, "professor"]);
  const [, prof, butler, baron] = p;

  // The Baron (dead) claimed the Chef, and vouched for the Butler.
  baron.alive = false;
  Object.assign(baron, { claim: "chef", claimKnown: true, publicClaim: "chef" });
  s.statements = [
    { byId: baron.id, day: 1, type: "trust", targetId: butler.id, source: "info" },
  ];
  strat.professor = () => baron;
  e.night();

  assert.equal(baron.alive, false);
  assert.match(prof.memories.at(-1).text, /who stayed dead/);
  assert.ok(
    s.publicLog.some((x) => x.includes(`I chose ${baron.label}, and they didn't come back`)),
  );
  assert.deepEqual(s.exposed, [baron.id]);

  const why = new SimpleStrategy().evidence(s, p[0], butler);

  assert.equal(why.score, 2);
  assert.match(why.reasons[0], /vouched for them, but .* lied/);
});

test("each speaker counts once in a player's reasons", () => {
  const s = base("one-reason");
  const strat = new SimpleStrategy();
  const [, chef, butler, baron] = s.players;

  baron.alive = false;
  baron.diedAtNight = 1;
  s.statements = [
    { byId: baron.id, day: 1, type: "suspicious", targetId: butler.id, source: "info" },
    { byId: baron.id, day: 1, type: "suspicious", targetId: butler.id, source: "opinion" },
  ];

  const why = strat.evidence(s, chef, butler);

  assert.equal(why.reasons.length, 1);
  // Not enough, on its own, to suspect someone.
  assert.ok(why.score < 1);
});

test("the log shows each NPC's reasons, used abilities and the Storyteller's lean", () => {
  const s = createState(bmr, 12, "log-detail");
  const e = new Engine(s);

  e.start();
  settle(e);

  const log = e.debugLog();

  assert.match(log, /\n {2}Player +\| Character +\| Claims/);
  assert.match(log, /\| Player \d+ +\| /);
  assert.match(log, /Storyteller (is helping (good|evil)|isn't leaning): /);
  assert.match(log, /\d+ evil of \d+ shown alive/);

  if (s.players.some((p) => ["courtier", "professor", "assassin"].includes(p.role))) {
    assert.match(log, /\| (used|unused) +\|/);
  }
});

test("ongoing abilities don't pick the same player twice while anyone else is left", () => {
  const s = createState(script, 12, "no-repeats");
  const strat = new SimpleStrategy();
  const monk = s.players.find((p) => !p.human && p.alignment === "good");
  const others = strat.others(s, monk);
  const seen = [];

  // One night each for every other living NPC: all different.
  for (let night = 2; night < 2 + others.length; night++) {
    s.night = night;
    seen.push(strat.monk(s, monk).id);
  }

  assert.equal(new Set(seen).size, others.length);

  // Then, with nobody new left, they may repeat (not last night's pick).
  s.night++;
  const again = strat.monk(s, monk);

  assert.ok(seen.includes(again.id));
  assert.notEqual(again.id, seen.at(-1));
});

test("the Monk and Innkeeper protect players claiming important characters", () => {
  const s = base("protect-important");
  const strat = new SimpleStrategy();
  const [, monk, butler, baron, imp] = s.players;
  const claims = (x, id) =>
    Object.assign(x, { claim: id, claimKnown: true, publicClaim: id });

  claims(butler, "butler"); // low
  claims(baron, "fortuneteller"); // high
  claims(imp, "saint"); // low

  for (let night = 2; night < 6; night++) {
    s.night = night;
    monk.picked = {};
    monk.lastPicks = {};
    assert.equal(strat.monk(s, monk), baron);
  }

  // ...but never their own suspect.
  monk.suspicion = { targetId: baron.id, day: 1 };
  monk.picked = {};
  assert.notEqual(strat.monk(s, monk), baron);
  monk.suspicion = null;

  // The Innkeeper's first pick is the Fortune Teller too.
  const inn = monk;

  inn.picked = {};
  assert.ok(strat.innkeeper(s, inn).includes(baron));
});

test("the twins look alike: the Evil Twin's copied information points at the good twin", () => {
  for (let seed = 0; seed < 60; seed++) {
    const s = createState(sv, 12, `twin-look-${seed}`);

    if (!s.twins) {
      continue;
    }

    const strat = new SimpleStrategy();
    const evil = s.players.find((p) => p.id === s.twins.evilId);
    const good = s.players.find((p) => p.id === s.twins.goodId);

    good.memories = [evilTwinInfo({ night: 1 }, evil)];

    const copy = strat.twinCopy(s, evil);

    assert.deepEqual(copy.memories[0].targets, [good.id]);

    // The evil team never frames or accuses either twin.
    assert.ok(!isTwin(s, scapegoat(s) ?? { id: null }));

    for (const p of s.players.filter(
      (x) => !x.human && x.alignment === "evil" && !isTwin(s, x),
    )) {
      assert.ok(!isTwin(s, strat.suspect(s, p, strat.others(s, p))));
    }
  }
});

test("an NPC Gossip always makes their statement before the day ends", () => {
  for (let seed = 0; seed < 20; seed++) {
    const { s, p, e } = bmrDay(`gossip-daily-${seed}`, [null, "gossip"]);
    const said = () =>
      s.publicLog.filter((x) =>
        x.startsWith(`Day 1 — ${p[1].label} claims Gossip and says`),
      );

    // Quiet at dawn...
    const r = s.r;

    s.r = () => 0.99;
    e.bmrDawn();
    s.r = r;
    assert.equal(said().length, 0);

    // ...so they speak up before the day ends (and the execution).
    e.nominate(p[3].id);
    e.endDay();

    const log = s.publicLog;
    const at = log.findIndex((x) => x.includes("claims Gossip and says"));

    assert.equal(said().length, 1, `seed ${seed}`);
    assert.ok(at < log.findIndex((x) => x.includes("is executed")));
  }
});

test("the public log says when an executed player doesn't die, or was already dead", () => {
  // Saved by the Devil's Advocate.
  const s = base("exec-survives");
  const strat = new SimpleStrategy();
  const e = new Engine(s, strat);
  const butler = s.players[2];

  strat.vote = () => true;
  strat.demon = () => null;
  s.advocate = { targetId: butler.id, day: 1, effective: true };
  e.nominate(butler.id);
  e.endDay();

  assert.equal(butler.alive, true);
  assert.ok(
    s.publicLog.includes(`Day 1 — ${butler.label} is executed. But does not die.`),
    s.publicLog.join("\n"),
  );

  // Already dead.
  const t = base("exec-dead");
  const strat2 = new SimpleStrategy();
  const e2 = new Engine(t, strat2);
  const chef = t.players[1];

  strat2.vote = () => true;
  strat2.demon = () => null;
  chef.alive = false;
  e2.nominate(chef.id);
  e2.endDay();

  assert.ok(
    t.publicLog.includes(
      `Day 1 — ${chef.label} is executed. And nothing happens because they are already dead.`,
    ),
  );

  // A Zombuul that only registers as dead dies (no "already dead").
  const z = bmrDay("exec-zombuul", [null, null, null, null, "zombuul"]);

  z.p[4].alive = false;
  z.p[4].undead = true;
  z.p[4].zombuulUsed = true;
  z.e.nominate(z.p[4].id);
  z.e.endDay();

  assert.ok(z.s.publicLog.includes(`Day 1 — ${z.p[4].label} is executed.`));
  assert.equal(z.s.winner, "good");
});

test("a regurgitated player is alive, can't die that night, and is announced at dawn", () => {
  const { s, p, e } = bmrNight("regurgitate", [
    null,
    null,
    null,
    null,
    "shabaloth",
  ]);
  const chef = p[1];

  // Last night the Shabaloth chose the Chef, who died.
  chef.alive = false;
  chef.death = "demon";
  s.shabaloth = [chef.id];

  // Tonight it regurgitates them (forced), then tries to kill them again.
  const r = s.r;

  s.r = () => 0;
  e.regurgitate(p[4]);
  s.r = r;

  assert.equal(chef.alive, true);

  s.night = 3;
  s.shabaloth = [];
  e.attack(p[4], chef);
  assert.equal(chef.alive, true);
  assert.ok(s.audit.some((x) => /came back to life tonight/.test(x.text)));

  // At dawn the Storyteller announces it (without saying how).
  e.bmrDawn();
  assert.ok(
    s.publicLog.includes(
      `Day ${s.day} — The Storyteller announces that ${chef.label} is alive again.`,
    ),
  );
  assert.ok(!s.publicLog.some((x) => /regurgitat/i.test(x)));

  // The Demon doesn't pick them while they're freshly back.
  s.revived = [chef.id];
  assert.notEqual(new SimpleStrategy().demon(s, p[4]), chef);
});

test("misinformation in the log says who caused it (never shown to you)", () => {
  const s = base("misinfo-cause");
  const [human, chef, , baron] = s.players;

  role(human, "chef", "good");
  role(baron, "poisoner", "evil");
  s.phase = "night";
  s.night = 1;
  s.day = 0;

  const strat = new SimpleStrategy();

  strat.poison = () => chef;
  strat.demon = () => null;

  const e = new Engine(s, strat);

  e.start();

  const cause = `(misinformation: poisoned by ${baron.label}, the Poisoner)`;
  const log = e.debugLog();

  assert.equal(chef.memories[0].functioning, false);
  assert.ok(
    s.audit.some((x) => x.type === "information" && x.text.endsWith(cause)),
  );
  assert.ok(log.includes(`${chef.memories[0].text} ${cause}`));

  // The human (a sober Chef) sees nothing of it.
  assert.ok(!s.privateLog.some((x) => x.includes("misinformation")));
  assert.ok(!s.publicLog.some((x) => x.includes("misinformation")));

  // Drunk until dusk, by a Sailor's choice.
  const g = bmrNight("misinfo-sailor", [null, "chambermaid", "sailor"]);

  g.strat.sailor = () => g.p[1];
  g.strat.chambermaid = () => [g.p[3], g.p[4]];

  // (Nothing at stake: force the Storyteller to make the Chambermaid drunk.)
  const r = g.s.r;

  g.s.r = () => 0.99;
  g.e.night();
  g.s.r = r;

  const info = g.p[1].memories.at(-1);

  assert.equal(info.misinfo, `drunk until dusk by ${g.p[2].label}, the Sailor`);
});

// ── Onion Pies ───────────────────────────────────────────────

const op = JSON.parse(
  fs.readFileSync(new URL("../scripts/Onion Pies_1_0_0.json", import.meta.url)),
);

test("Onion Pies loads, and plays whole games without errors", () => {
  const s = createState(op, 10, "op");

  assert.equal(s.script.meta.name, "Onion Pies");
  assert.equal(s.script.ids.length, 24);

  for (const seats of [8, 10, 12, 13, 15]) {
    for (let seed = 0; seed < 16; seed++) {
      const { s: g, e } = playOut(op, seats, `op-${seats}-${seed}`);

      assert.ok([null, "good", "evil"].includes(g.winner));
      assert.ok(e.debugLog().length > 0);
    }
  }
});

// A 5-player Onion Pies game (the base roles: Mayor (you), Chef, Butler,
// Baron, Imp), with `roles` by seat, on Night `night`.
function opNight(seed, roles = [], night = 1) {
  const s = base(seed, op);

  roles.forEach((id, i) => id && role(s.players[i], id, alignment(id)));
  s.phase = "night";
  s.night = night;
  s.day = night - 1;

  const strat = new SimpleStrategy();

  strat.demon = () => null;

  return { s, p: s.players, strat, e: new Engine(s, strat) };
}

test("the Marionette sits next to the Demon, thinks they're good, and hears false information", () => {
  let seen = 0;

  for (let seed = 0; seed < 400; seed++) {
    const s = createState(op, 10, seed);
    const m = s.players.find((p) => p.role === "marionette");

    if (!m) {
      continue;
    }

    seen++;

    const n = s.players.length;
    const i = s.players.indexOf(m);
    const near = [s.players[(i + n - 1) % n], s.players[(i + 1) % n]];

    assert.ok(near.some((x) => team(x.role) === "demon"), `seed ${seed}`);
    assert.equal(m.alignment, "evil");
    assert.equal(team(m.shown), "townsfolk");
    assert.equal(m.claim, m.shown);
    assert.ok(!s.players.some((x) => x !== m && x.role === m.shown));
    assert.deepEqual(m.bluffs, []);
    assert.ok(!m.human);
  }

  assert.ok(seen > 0);

  // Their (Chef) information is false, and the log says why.
  const { p, e } = opNight("marionette-info", [null, "marionette"]);

  p[1].shown = "chef";
  p[1].claim = "chef";
  e.night();

  assert.equal(p[1].memories[0].functioning, false);
  assert.match(p[1].memories[0].misinfo, /they are the Marionette/);

  // They play as good: they suspect on the evidence, and don't bluff.
  assert.ok(!e.s.audit.some((x) => x.type === "bluff" && x.data.playerId === p[1].id));
});

test("the Noble learns 3 players, exactly 1 of them evil", () => {
  for (let seed = 0; seed < 30; seed++) {
    const { s, p, e } = opNight(`noble-${seed}`, [null, "noble"]);

    e.night();

    const info = p[1].memories[0];
    const named = info.targets.map((id) => s.players.find((x) => x.id === id));

    assert.match(info.text, /^Noble: one of .+ is evil\.$/);
    assert.equal(named.length, 3);
    assert.equal(named.filter((x) => x.alignment === "evil").length, 1);
  }
});

test("a mad Pixie claims their Townsfolk, and gains its ability when its holder dies", () => {
  // (You're the Saint, so the Empath is the only other Townsfolk.)
  const { s, p, e } = opNight("pixie", ["saint", "pixie", "empath"]);

  e.night();

  assert.equal(p[1].memories[0].text, "Pixie: the Empath is in play.");
  assert.equal(p[1].pixieMad, true);
  assert.equal(p[1].claim, "empath");

  // When asked, they claim the Empath (with made-up information).
  assert.match(e.ask(p[1].id), /^I claim Empath\./);

  // The Empath dies: the Pixie gains the Empath ability.
  e.kill(p[2], "execution");
  assert.equal(p[1].gained, "empath");
  assert.ok(s.audit.some((x) => x.type === "pixie" && /gains the Empath/.test(x.text)));
});

test("the Cannibal gains the ability of the last player who died by execution", () => {
  const { s, p, strat, e } = opNight("cannibal", [null, "cannibal", "monk"]);

  e.night();
  s.phase = "day";
  strat.vote = () => true;

  // A good executee: the Monk ability, working.
  e.nominate(p[2].id);
  e.endDay();
  assert.equal(p[1].gained, "monk");
  assert.equal(p[1].cannibalPoison, null);

  // An evil executee: a (fake) good ability, poisoned...
  e.nominate(p[3].id); // Baron
  e.endDay();
  assert.notEqual(p[1].gained, "baron");
  assert.equal(alignment(p[1].gained), "good");
  assert.equal(p[1].poisoned, true);
  assert.match(p[1].poisonedBy, /eating .*the Baron/);
});

test("a Cannibal's poison from an evil executee ends when a good player is executed", () => {
  const { s, p, e } = opNight("cannibal-2", [null, "cannibal"]);
  const [, c, butler, baron] = p;

  s.phase = "day";
  s.day = 1;
  e.execute(baron);
  assert.equal(c.poisoned, true);

  e.execute(butler);
  assert.equal(c.gained, "butler");
  assert.equal(c.poisoned, false);
  assert.equal(c.cannibalPoison, null);
});

test("a Cannibal who gains a first-night ability uses it that night", () => {
  const { s, p, e } = opNight("cannibal-chef", [null, "cannibal", "chef"]);
  const [, c, chef] = p;

  e.night();
  s.phase = "day";
  e.execute(chef);
  assert.equal(c.gained, "chef");

  s.night++;
  e.night();
  assert.ok(c.memories.some((m) => m.night === 2 && /^Chef number/.test(m.text)));

  // Only the night after they gained it.
  s.night++;
  e.night();
  assert.ok(!c.memories.some((m) => m.night === 3));
});

test("a dead player's execution gives the Cannibal nothing", () => {
  const { s, p, e } = opNight("cannibal-dead", [null, "cannibal"]);

  s.phase = "day";
  s.day = 1;
  p[2].alive = false;
  e.execute(p[2]);
  assert.equal(p[1].gained, null);
});

test("a misinformed Ravenkeeper is only shown characters on the script", () => {
  const { s, p } = opNight("raven-script", [null, "ravenkeeper"]);

  p[1].poisoned = true;

  for (let i = 0; i < 50; i++) {
    const seen = ravenInfo(s, p[1], p[2]).text.replace(/^.+ is (.+)\.$/, "$1");

    assert.ok(s.script.ids.some((id) => name(id) === seen), seen);
  }
});

test("the Game Over table doesn't repeat tonight's information", () => {
  const { s, p, e } = opNight("gameover-info", [null, "chef"]);

  e.night();
  e.finish("good", "Test.");

  const states = s.audit.filter((x) => x.type === "state");

  assert.ok(states[0].data.players[1].info.length);
  assert.deepEqual(states.at(-1).data.players[1].info, []);
});

test("on Night 1, the Poisoner's first-night pick hears a lie that helps evil", () => {
  for (let seed = 0; seed < 20; seed++) {
    // A Noble: never the 1 evil player in 3, and never the Demon. (With a
    // Minion and a Recluse to name, 2 evil and 1 good.)
    const { s, p, strat, e } = opNight(`poison-n1-${seed}`, [
      null,
      "noble",
      "recluse",
      "poisoner",
    ]);

    strat.poison = () => p[1];
    e.night();

    const named = p[1].memories[0].targets.map((id) => byId(s, id));

    assert.equal(p[1].memories[0].functioning, false);
    assert.equal(named.length, 3);
    assert.ok(!named.some((x) => x.role === "imp"));
    assert.deepEqual(
      named.filter((x) => x.role !== "mayor").map((x) => x.role).sort(),
      ["poisoner", "recluse"],
    );
  }

  // A Librarian's "Outsider" pair covers an evil player.
  const { s, p, strat, e } = opNight("poison-n1-lib", [null, "librarian", null, "poisoner"]);

  strat.poison = () => p[1];
  e.night();
  assert.ok(
    p[1].memories[0].targets.some((id) => byId(s, id).alignment === "evil"),
  );
});

test("a good NPC Courtier picks an in-play Demon or Minion at COURTIER_CORRECT_CHANCE", () => {
  const s = base("courtier", bmr);
  const strat = new SimpleStrategy();
  const [, c, , baron, imp] = s.players;
  const inPlay = [baron.role, imp.role];

  strat.onceReady = () => true;
  c.alignment = "good";

  s.r = () => COURTIER_CORRECT_CHANCE - 0.01;
  assert.ok(inPlay.includes(strat.courtier(s, c)));

  // Otherwise (and always, for an evil bluffer) one that isn't in play.
  for (const [who, roll] of [[c, COURTIER_CORRECT_CHANCE + 0.01], [baron, 0]]) {
    s.r = () => roll;

    const id = strat.courtier(s, who);

    assert.ok(["demon", "minion"].includes(team(id)));
    assert.ok(!inPlay.includes(id));
  }
});

test("an NPC Ogre becomes the alignment of the player they choose", () => {
  const { s, p, strat, e } = opNight("ogre", [null, "ogre"]);

  strat.ogre = () => p[4]; // the Imp
  e.night();

  assert.equal(p[1].alignment, "evil");
  // They don't know: they play as good, and don't bluff.
  assert.ok(!s.audit.some((x) => x.type === "bluff" && x.data.playerId === p[1].id));
});

test("you're never dealt the Pixie, Ogre or Marionette", () => {
  for (let seed = 0; seed < 300; seed++) {
    const human = createState(op, 10, seed).players[0];

    assert.ok(!["pixie", "ogre", "marionette"].includes(human.role));
  }
});

test("the Demon tells its Marionette only when evil is losing or it's under suspicion", () => {
  const { s, p, e } = opNight("marionette-tell", [null, "marionette"], 2);
  const [, m, butler, , imp] = p;
  const r = s.r;

  s.r = () => 0;

  // 5 alive, 2 evil, from 2: on track, and nobody suspects the Demon.
  butler.suspicion = { targetId: m.id, day: 1 };
  e.marionetteReveal(imp);
  assert.ok(!m.toldEvil);

  // The good NPCs suspect the Demon: it tells them.
  butler.suspicion = { targetId: imp.id, day: 1 };
  e.marionetteReveal(imp);
  assert.equal(m.toldEvil, 2);
  assert.ok(s.audit.some((x) => x.type === "marionette" && /tells/.test(x.text)));
  s.r = r;
});

test("a Marionette who knows keeps their claim, spreads misleading information and plays for evil", () => {
  const { s, p, e } = opNight("marionette-decoy", [null, "marionette"], 2);
  const [, m, butler, , imp] = p;

  m.shown = "chef";
  m.claim = "chef";
  m.toldEvil = 2;
  m.memories = [
    {
      night: 1,
      role: "chef",
      text: "Chef number: 0.",
      targets: [],
      functioning: false,
    },
  ];
  s.phase = "day";
  s.day = 2;
  e.marionetteDawn();

  // Their (false) information goes public; they still claim the Chef.
  assert.equal(m.claim, "chef");
  assert.ok(
    s.publicLog.includes(`Day 2 — ${m.label} says: "I am the Chef. Night 1: My number is 0."`),
  );

  // With nothing new to share, they accuse a good player instead.
  s.day = 3;
  e.marionetteDawn();

  const accusation = s.publicLog.find((x) => x.startsWith(`Day 3 — ${m.label} says:`));

  assert.ok(accusation, s.publicLog.join("\n"));
  assert.match(accusation, /I'm suspicious of/);
  assert.ok(!accusation.includes(imp.label));

  // They play for evil: never suspecting the Demon, voting for good nominees.
  const strat = new SimpleStrategy();

  for (let i = 0; i < 20; i++) {
    assert.notEqual(strat.suspect(s, m, strat.others(s, m)), imp);
  }

  s.r = () => 0;
  assert.equal(strat.vote(s, m, butler, { yes: 0, needed: 3 }), true);
});

test("a misinformed Noble sees any 3 players", () => {
  const counts = new Set();

  for (let seed = 0; seed < 40; seed++) {
    const { s, p, e } = opNight(`noble-drunk-${seed}`, [null, "drunk"]);

    p[1].shown = "noble";
    p[1].claim = "noble";
    e.night();

    const named = p[1].memories[0].targets.map((id) =>
      s.players.find((x) => x.id === id),
    );

    assert.equal(named.length, 3);
    counts.add(named.filter((x) => x.alignment === "evil").length);
  }

  // Not always 0 (or always 2): any mix.
  assert.ok(counts.size >= 2, [...counts].join(","));
});

test("the Storyteller's Pacifist note only appears with a working Pacifist", () => {
  const { s, p, e } = bmrDay("no-pacifist");

  // Evil is behind (the Baron turned good: only the Imp left of the 2 evil
  // players the game started with), so the Storyteller leans evil.
  role(p[3], "chef", "good");
  p[3].startRole = "baron";
  assert.equal(lean(s), "evil");

  e.nominate(p[2].id);
  e.endDay();

  assert.equal(p[2].alive, false);
  assert.ok(!s.audit.some((x) => /Pacifist/.test(x.text)));
});

test("a reason found more than once is given once, saying how often", () => {
  const s = base("merged-reasons");
  const strat = new SimpleStrategy();
  const [, chef, butler, baron] = s.players;

  // The Chef trusts the Baron; the Butler voted for the Baron twice.
  chef.memories = [
    {
      night: 1,
      role: "washerwoman",
      text: `One of ${baron.label} and ${butler.label} is Chef.`,
      targets: [baron.id],
    },
  ];
  s.voteHistory = [1, 2].map((day) => ({
    day,
    nominatorId: s.players[0].id,
    nomineeId: baron.id,
    voterIds: [butler.id],
  }));

  const why = strat.evidence(s, chef, butler);

  assert.equal(why.score, 1);
  assert.deepEqual(why.reasons, [
    `they voted for ${baron.label}, whom I trust (twice)`,
  ]);
});

test("dawn and dusk cards hold only what the Storyteller announced", () => {
  const s = base("phase-cards");
  const e = new Engine(s);
  const [, , butler, baron] = s.players;

  // Dusk, nobody marked: the log (and the card) says so.
  const before = s.publicLog.length;

  e.endDay();

  const dusk = s.phaseCards.find((c) => c.kind === "dusk");

  assert.equal(dusk.day, 1);
  assert.deepEqual(dusk.lines, ["Day 1 — Nobody was executed."]);
  assert.equal(s.publicLog[before], "Day 1 — Nobody was executed.");

  // Dawn: the night's deaths (or that nobody died), word for word as the
  // public log has them, but not what players said, or how many are alive.
  const dawn = s.phaseCards.at(-1);

  assert.equal(dawn.kind, "dawn");
  assert.equal(dawn.day, 2);
  assert.ok(dawn.lines.length);

  for (const x of dawn.lines) {
    assert.ok(s.publicLog.includes(x));
    assert.match(x, /died|Nobody died/);
  }

  // An execution: the card has the execution line, as the log has it.
  s.block = { nomineeId: butler.id, count: 3 };
  e.endDay();

  const executed = s.phaseCards.filter((c) => c.kind === "dusk").at(-1);

  assert.ok(
    executed.lines.some((x) => x.startsWith(`Day 2 — ${butler.label} is executed.`)),
  );
  assert.ok(executed.lines.every((x) => s.publicLog.includes(x)));

  // A player's statement is in the log, but not on a card.
  s.phase = "day";
  s.winner = null;
  s.publicLog.push(`Day 3 — ${baron.label} says: "I am the Chef."`);
  const cards = s.phaseCards.length;

  e.phaseCard("dusk", s.publicLog.length - 1);
  assert.equal(s.phaseCards.length, cards);
});

test("unprompted public claims flag the NPC (claimAlert); answering you doesn't", () => {
  const s = base("claim-alert");
  const e = new Engine(s);
  const [, chef, butler] = s.players;

  e.ask(chef.id);
  assert.equal(chef.claimAlert, undefined);

  e.claimPublicly(butler);
  e.claimPublicly(chef);
  assert.ok(chef.claimAlert > butler.claimAlert);
});
