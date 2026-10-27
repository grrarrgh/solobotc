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
  PIXIE_DOUBLE_CLAIM_FACTOR,
  HUMAN_NOMINATION_BONUS,
  NEAR_FINAL_HUMAN_VOTE_CHANCE,
  GOOD_VOTE_CHANCE,
  GOOD_VOTE_EVIDENCE_STEP,
  ARTIST_QUESTIONS,
  COURTIER_CORRECT_CHANCE,
  ROLES,
  JINXES,
  LEGION_STRONG,
  LEGION_STRONG_SHARE,
  ALCHEMIST_ABILITIES,
  PHILOSOPHER_AVOID,
  name,
  team,
  alignment,
} from "../src/data.js";
import { createState, infoTarget } from "../src/setup.js";
import {
  AMNESIAC_ABILITIES,
  AMNESIAC_GUESSES,
  AMNESIAC_QUESTIONS,
  AMNESIAC_SHAPES,
  amnesiacShape,
} from "../src/characters/townsfolk/amnesiac.js";
import { logNames, formatLog } from "../src/log.js";
import {
  NIGHT_STEPS,
  FIRST_NIGHT,
  OTHER_NIGHTS,
  nightOrder,
} from "../src/characters/nightorder.js";
import { Engine, canPick } from "../src/engine.js";
import { SelfPlay } from "../src/selfplay.js";
import {
  SimpleStrategy,
  speak,
  isTwin,
  claimTo,
  stanceOn,
  heard,
  fooledBy,
  sideOf,
  teammate,
  spares,
  twinSafe,
} from "../src/strategy.js";
import {
  nightInfo,
  infoMode,
  amnesiacKey,
  lean,
  scapegoat,
  jinxBarred,
  adviceLevel,
  minionAbility,
  ability,
  isDemon,
  covered,
} from "../src/storyteller.js";
import { fishermanInfo } from "../src/characters/townsfolk/fisherman.js";
import { ravenInfo } from "../src/characters/townsfolk/ravenkeeper.js";
import { artistInfo } from "../src/characters/townsfolk/artist.js";
import { savantInfo, savantBluff } from "../src/characters/townsfolk/savant.js";
import { sageInfo } from "../src/characters/townsfolk/sage.js";
import { evilTwinInfo } from "../src/characters/minion/eviltwin.js";
import {
  bluffTonight,
  backStory,
  gainedRole,
  hiddenStory,
  bluffMode,
  bluffState,
  knows,
} from "../src/bluff.js";
import { NEVER_BLUFFED, NOTES } from "../src/data.js";
import { infoOf } from "../src/characters/info.js";
import { shuffle, sample, rng, byId, claimHeard as claimHeardBy } from "../src/util.js";

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
    const line = response.split("\n").at(-1);
    const named = line.startsWith("Who I suspect: ")
      ? [...line.matchAll(/Player \d+/g)].map((m) =>
          s.players.find((x) => x.label === m[0]),
        )
      : [];

    assert.match(line, /^Who I (trust|suspect)/);

    for (const target of named) {
      assert.equal(target.human, false);
      assert.notEqual(target.id, speaker.id);

      if (kind === "evil") {
        assert.equal(target.alignment, "good");
      }
    }
  }
});

test("good NPCs can't see alignments: with no evidence, their hunches are anyone", () => {
  const seen = new Set();

  for (let i = 0; i < 60; i++) {
    const s = askedState("good");
    const chef = s.players[1];

    s.r = rng(`hunch-${i}`);
    seen.add(s.players.find((x) => x.id === new SimpleStrategy().opinion(s, chef).targetId).alignment);
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

  // Someone who accused the Butler and then died in the night: their word
  // counts as anyone's (their death isn't evidence).
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

  assert.equal(why.score, EVIDENCE_WEIGHT.accused);
  assert.deepEqual(why.reasons, [`${a.label} is suspicious of them`]);
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

  // Told to the Butler in private: only the Butler hears it.
  const butler = s.players[2];

  new SimpleStrategy().told(s, chef, butler);

  assert.ok(
    butler.heard.some(
      (x) =>
        x.byId === chef.id &&
        x.targetId === baron.id &&
        x.type === "suspicious" &&
        x.source === "info",
    ),
  );
  assert.equal(butler.toldMe[chef.id].claim, "chef");
  assert.ok(!s.statements.some((x) => x.byId === chef.id));
});

test("what NPCs tell you is heard by no NPC, and doesn't make their claim public", () => {
  const s = base("statements-private");
  const [human, chef, , baron] = s.players;

  chef.memories.push({
    night: 1,
    role: "investigator",
    text: `One of ${baron.label} and Player 3 is the Baron.`,
    targets: [baron.id],
  });

  new Engine(s).ask(chef.id);

  assert.ok(!s.statements.some((x) => x.byId === chef.id));
  assert.ok(!s.players.some((x) => x.heard?.length));
  assert.equal(chef.claimKnown, false);
  assert.equal(claimTo(chef), null);
  assert.equal(claimTo(chef, human), "chef"); // you know it
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

  // Run bluffs() directly: night() would clear the poison first. (A
  // poisoned Spy registers as evil, so the true number changes too.)
  spy.poisoned = true;
  e.bluffs();

  const truth = nightInfo(s, s.players[1], strat).text;

  assert.notEqual(spy.memories[0].text, truth);
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

  // The Spy's neighbours are the Butler and the Imp: the truth (1) would
  // point at the Imp, so the Spy says 0.
  assert.equal(spy.memories[0].text, "Empath number: 0.");

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

test("the human is never the Damsel", () => {
  assert.ok(FORBIDDEN_HUMAN.has("damsel"));

  for (let seed = 0; seed < 300; seed++) {
    // (With the Huntsman, the Damsel is always dealt.)
    const s = createState(ec, 8 + (seed % 8), `no-damsel-${seed}`);

    assert.notEqual(s.players[0].role, "damsel", `seed ${seed}`);
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
    // (Named by character in the log: see logNames().)
    `${logNames(s)[chef.seat]}:`,
    chef.memories[0].text,
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
  // (The Boomdandy's countdown: you point at the first other living player.)
  if (e.s.boom) {
    e.boomPoint(e.s.players.find((p) => p.alive && !p.human).id);
  }

  // (Roshambo against a Psychopath you nominated: you throw rock.)
  if (e.s.roshambo) {
    e.roshambo("rock");
  }

  while (e.s.pending) {
    const c = e.s.pending;

    if (c.characters) {
      e.choose([], c.characters[0]);
      continue;
    }

    e.choose(
      e.s.players
        .filter((p) => canPick(c, p))
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
  assert.throws(() => e.choose([chef.id]), /Select 2 players/);

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
  assert.throws(() => e.choose([human.id]), /Select 1 player/);

  e.choose([chef.id]);

  assert.equal(chef.alive, true);
  assert.equal(
    human.memories[0].text,
    `Monk: protected ${chef.label} from the Demon.`,
  );
});

test("your night choices go by the ability's wording: \"a player\" takes the dead too, \"an alive player\" doesn't", () => {
  // The Fortune Teller: "choose 2 players".
  const ft = humanNight("pick-dead-ft", "fortuneteller");
  const [, chef, butler] = ft.s.players;

  butler.alive = false;
  ft.e.start();

  assert.equal(ft.s.pending.any, true);
  assert.ok(canPick(ft.s.pending, butler));
  ft.e.choose([chef.id, butler.id]);
  assert.equal(ft.s.phase, "day");

  // The Chambermaid: "choose 2 alive players". The Sailor: "an alive player".
  for (const id of ["chambermaid", "sailor"]) {
    const h = humanNight(`pick-dead-${id}`, id);
    const [, c, b] = h.s.players;

    b.alive = false;
    h.e.start();

    assert.ok(!h.s.pending.any);
    assert.ok(!canPick(h.s.pending, b));
    assert.throws(
      () => h.e.choose(id === "sailor" ? [b.id] : [c.id, b.id]),
      /living player/,
    );
  }
});

test("a Slayer can shoot a dead player, to no effect, even a dead Demon", () => {
  const s = base("slay-dead");
  const e = new Engine(s);
  const [human, chef, , , imp] = s.players;

  role(human, "slayer", "good");
  chef.alive = false;
  imp.alive = false;

  assert.equal(e.slay(imp.id), false);
  assert.equal(s.slayerUsed, true);
  assert.equal(s.winner, null);
  assert.match(s.audit.at(-1).text, /shot .*; no effect\./);
  assert.ok(!s.audit.some((x) => x.type === "confirmed"));
});

test("good NPCs never vote to execute a dead player; the evil team may", () => {
  const s = base("vote-dead");
  const strat = new SimpleStrategy();
  const [, chef, butler, baron] = s.players;

  butler.alive = false;

  for (let i = 0; i < 20; i++) {
    assert.equal(strat.vote(s, chef, butler), false);
  }

  assert.ok(Array.from({ length: 20 }, () => strat.vote(s, baron, butler)).some(Boolean));
});

test("on the Mastermind's extra day, evil nominates and votes for any good player, never a teammate", () => {
  const s = base("mastermind-day");
  const strat = new SimpleStrategy();
  const [, chef, butler, baron, imp] = s.players;

  s.mastermindDay = s.day;

  assert.equal(strat.vote(s, baron, chef), true);
  assert.equal(strat.vote(s, baron, imp), false);
  assert.ok([chef, butler].includes(strat.mastermindPush(s, baron)));
  assert.equal(strat.mastermindPush(s, chef), null);

  // (Good players only for the player they suspect.)
  chef.suspicion = null;
  assert.equal(strat.vote(s, chef, butler), false);

  s.mastermindDay = null;
  assert.equal(strat.mastermindPush(s, baron), null);
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

test("the Poisoner doesn't pick a player who is already poisoned, while there's anyone else", () => {
  const s = base("poison-already");
  const strat = new SimpleStrategy();
  const [, chef, empath] = s.players;

  role(empath, "empath", "good");
  s.night = 1;
  empath.poisoned = true;

  for (let i = 0; i < 30; i++) {
    assert.notEqual(strat.poison(s), empath);
  }

  // With nobody else, they're still a pick.
  chef.poisoned = true;
  s.players.filter((x) => x.alignment === "good").forEach((x) => (x.poisoned = true));
  assert.ok(strat.poison(s));
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

test("the human is never dealt the Drunk", () => {
  assert.ok(FORBIDDEN_HUMAN.has("drunk"));

  for (const raw of [script, bmr, ec, cf]) {
    for (let seed = 0; seed < 200; seed++) {
      const s = createState(raw, 10, `no-drunk-${seed}`);

      assert.notEqual(s.players[0].role, "drunk", `seed ${seed}`);
    }
  }
});

test("an evil Empath bluffer next to a teammate always says 0", () => {
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
    assert.equal(first, "Empath number: 0.");

    // The Butler dies; the new neighbours are the Chef and the Imp.
    s.players[2].alive = false;
    s.night = 3;
    assert.equal(report(), "Empath number: 0.");
  }
});

test("an evil Empath bluffer next to you says 0, and keeps it: you're never anyone's suspect", () => {
  for (let i = 0; i < 20; i++) {
    const s = base(`empath-bluff-good-${i}`);
    const imp = s.players[4];
    const e = new Engine(s);

    // (An evil player in the Chef's seat: their neighbours are you and the
    // Butler, both good.)
    const chef = s.players[1];

    chef.alignment = "evil";
    chef.claim = "empath";
    imp.claimKnown = false;

    const report = () => {
      e.bluffs();
      return chef.memories.at(-1).text;
    };

    s.night = 1;
    const first = report();

    s.night = 2;
    assert.equal(report(), first);
    assert.equal(first, "Empath number: 0.");

    // The Butler dies; the new neighbours are you and the Baron (a teammate).
    s.players[2].alive = false;
    s.night = 3;
    assert.equal(report(), "Empath number: 0.");
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

  assert.ok(
    e.debugLog().includes(`Evil team is framing: ${logNames(s)[goat.seat]}`),
  );
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

  assert.ok(
    e
      .ask(s.players[1].id)
      .endsWith("\nWho I trust or suspect: I have nothing."),
  );
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

  // The only claim they've heard is an evil player's lie: guessing it, they
  // die.
  const liar = s.players.find((x) => !x.human && x.alive && x.alignment === "evil");

  for (const x of s.players) {
    x.claimKnown = false;
    x.publicClaim = null;
  }

  gambler.toldMe = {};
  liar.claim = "chef";
  e.claimPublicly(liar);
  e.night();

  assert.equal(gambler.alive, false);
  assert.equal(gambler.death, "gambler");
  assert.ok(gambler.memories.some((m) => m.text === `Gambler: guessed ${liar.label} is the Chef, and died.`));
});

test("a Gambler (and a Gambler bluffer) only ever guesses a character they've heard claimed, never a hunch", () => {
  for (let seed = 0; seed < 60; seed++) {
    const strat = new SimpleStrategy();
    const s = createState(script, 10, `gambler-heard-${seed}`);
    const [gambler, bluffer] = s.players.filter((x) => !x.human);

    role(gambler, "gambler", "good");
    s.night = 2;
    gambler.suspicion = { targetId: bluffer.id, day: 1 };

    for (let i = 0; i < 5; i++) {
      s.r = rng(`gambler-heard-${seed}-${i}`);

      for (const p of [gambler, bluffer]) {
        const g = strat.gamble(s, p);

        assert.ok(g.self || g.role === claimHeardBy(g.target, p), `${p.label} guessed ${g.role}`);
      }
    }
  }
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

test("with only a working Soldier left to attack, the Demon kills you", () => {
  const s = base("kill-only-soldier");
  const strat = new SimpleStrategy();
  const [you, chef, butler, , imp] = s.players;

  butler.alive = false;
  role(chef, "soldier", "good");
  assert.equal(strat.demon(s, imp), you);

  // A poisoned one can die; so can a Sailor (made drunk, late on).
  chef.poisoned = true;
  assert.equal(strat.demon(s, imp), chef);

  role(chef, "sailor", "good");
  assert.equal(strat.demon(s, imp), chef);
});

test("with no good NPC left, the Demon kills you rather than its own Minion", () => {
  const s = base("kill-no-good");
  const strat = new SimpleStrategy();
  const [you, chef, butler, baron, imp] = s.players;

  chef.alive = false;
  butler.alive = false;
  s.r = () => 0.99; // no kill-priority chance fires

  // Only the Baron and you are left.
  assert.equal(strat.demon(s, imp), you);
  assert.match(imp.killWhy[you.id], /nobody but its own team is left to kill/);

  // Having chosen you already tonight (a Shabaloth's second), nobody.
  assert.equal(strat.demon(s, imp, [you]), null);

  // With you dead, any random NPC (the Baron).
  you.alive = false;
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
    /No conversation slots|Already asked|Nobody is able|Already nominated|already nominated today|Savant unavailable|Amnesiac unavailable|Fisherman unavailable|Puzzlemaster unavailable|Nominations are open/;
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

    if (e.human().shown === "amnesiac" && e.human().alive) {
      attempt(() => e.amnesiac("goodplayer"));
    }

    if (e.human().shown === "fisherman" && e.human().alive) {
      attempt(() => e.fisherman());
    }

    if (e.human().shown === "puzzlemaster" && e.human().alive) {
      attempt(() => e.puzzlemaster(s.players.find((x) => !x.human).id));
    }

    const target = s.players.find(
      (x) => x.alive && !x.human && !e.nominatedToday(x.id),
    );

    if (turn % 2 && target) {
      attempt(() =>
        e.human().alive ? e.nominate(target.id) : e.requestNomination(target.id),
      );

      // Then any NPC nominations (your hand up).
      while (s.phase === "day" && !s.winner && e.npcNomination()) {
        if (s.pendingVote) {
          e.castVotes(true);
        }
      }
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

const ec = JSON.parse(
  fs.readFileSync(
    new URL("../scripts/Extension Cord_5_1_0.json", import.meta.url),
  ),
);

const tr = JSON.parse(
  fs.readFileSync(new URL("../scripts/Trust Redux_1_0_0.json", import.meta.url)),
);

test("whole games play out on every script without errors", () => {
  for (const raw of [script, ecp, sv, bmr, ec, tr]) {
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

// Characters don't belong to a script: any mix of them plays together.
test("whole games play out on scripts mixing characters from every edition", () => {
  const ids = Object.keys(ROLES);
  const of = (t, n, r) => shuffle(ids.filter((id) => team(id) === t), r).slice(0, n);

  for (let g = 0; g < 80; g++) {
    const r = rng(`mixed-${g}`);
    const raw = [
      { id: "_meta", name: `Mixed ${g}` },
      ...of("townsfolk", 13, r),
      ...of("outsider", 4, r),
      ...of("minion", 4, r),
      ...of("demon", 4, r),
    ];
    const { s, e } = playOut(raw, 8 + (g % 8), `mixed-${g}`);

    assert.ok([null, "good", "evil"].includes(s.winner));
    assert.ok(s.players.every((p) => ["good", "evil"].includes(p.alignment)));
    assert.ok(e.debugLog().length > 0);
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

test("the Mutant claims any Townsfolk (they don't know what's in play)", () => {
  let mutants = 0;
  let inPlay = 0;

  for (let seed = 0; seed < 300; seed++) {
    const s = createState(sv, 10, seed);
    const tokens = new Set(s.players.map((p) => p.shown));

    for (const p of s.players.filter((x) => x.role === "mutant")) {
      mutants++;
      assert.equal(team(p.claim), "townsfolk");
      inPlay += tokens.has(p.claim) ? 1 : 0;
    }
  }

  assert.ok(mutants > 0 && inPlay > 0, `${inPlay} of ${mutants}`);
});

test("evil players with a Mutant or Damsel bluff mostly take another; with a Spy or Widow, they hide safely", () => {
  const hidden = ["mutant", "damsel"];
  let kept = 0;
  let swapped = 0;
  let grimoire = 0;

  for (let seed = 0; seed < 600; seed++) {
    const s = createState(ec, 12, `hidden-bluff-${seed}`);
    const evil = s.players.filter((x) => x.alignment === "evil" && x.role !== "marionette");
    const sees = evil.some((x) => ["spy", "widow"].includes(x.role));
    const tokens = new Set(s.players.map((x) => x.shown));

    for (const p of evil) {
      const offered = p.bluffs.filter((x) => hidden.includes(x));

      if (hidden.includes(p.bluff)) {
        // Hiding: behind a Townsfolk; one that isn't in play only with a Spy or Widow.
        assert.equal(team(p.claim), "townsfolk");

        if (sees) {
          grimoire++;
          assert.ok(!tokens.has(p.claim), `seed ${seed}`);
        } else {
          kept++;
        }
      } else if (offered.length && !sees) {
        swapped++;
      }
    }
  }

  assert.ok(kept > 0 && swapped > kept && grimoire > 0, `${kept} ${swapped} ${grimoire}`);
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

test("a dead Townsfolk is still the No Dashii's neighbour: the poison doesn't pass them", () => {
  const strat = new SimpleStrategy();
  const { s, e } = nightTwo("nodashii-dead", strat);
  const [human, chef, butler, baron, nodashii] = s.players;

  role(nodashii, "nodashii", "evil");
  role(butler, "monk", "good");

  // Anticlockwise: the Baron, then the Monk (dead), then the Chef.
  butler.alive = false;
  e.night();

  assert.equal(butler.poisoned, true);
  assert.equal(chef.poisoned, false);
  assert.equal(human.poisoned, true);
  assert.equal(baron.poisoned, false);
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

test("the Vigormortis's poison can land on a dead Townsfolk neighbour", () => {
  for (let seed = 0; seed < 10; seed++) {
    const strat = new SimpleStrategy();
    const { s, e } = nightTwo(`vigormortis-dead-${seed}`, strat);
    const [human, chef, butler, baron] = s.players;

    role(s.players[4], "vigormortis", "evil");
    role(butler, "monk", "good");
    butler.alive = false;
    strat.demon = () => baron;

    e.night();

    // The Baron's Townsfolk neighbours: the dead Monk, and past the
    // Vigormortis, you. Never the Chef behind the Monk.
    const poisoned = byId(s, s.lastingPoison[0].id);

    assert.ok([butler, human].includes(poisoned), poisoned.label);
    assert.notEqual(poisoned, chef);
  }
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

test("a Philosopher who gained the Snake Charmer's ability and picks the Demon becomes the Demon, without it", () => {
  const s = bluffNight("philosopher-snake");
  const phil = s.players[1];
  const imp = s.players[4];

  role(phil, "philosopher", "good");

  const strat = new SimpleStrategy();

  strat.philosopher = () => "snakecharmer";
  strat.snake = () => imp;
  new Engine(s, strat).start();

  assert.equal(phil.role, "imp");
  assert.equal(phil.alignment, "evil");
  assert.equal(phil.gained, null);
  assert.equal(ability(phil), "imp");
  assert.equal(imp.role, "snakecharmer");
  assert.ok(s.audit.some((x) => /became the Imp \(and lost the Snake Charmer ability they gained\);/.test(x.text)));
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

test("a drunk or poisoned Scarlet Woman doesn't become the Demon", () => {
  for (const sober of [true, false]) {
    const s = base(`scarlet-${sober}`);
    const [, , , sw, imp] = s.players;

    role(sw, "scarletwoman", "evil");
    sw.poisoned = !sober;

    const e = new Engine(s, new SimpleStrategy());

    e.execute(imp);

    assert.equal(sw.role, sober ? "imp" : "scarletwoman");
    assert.equal(s.winner, sober ? null : "good");
  }
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

  // The Mayor has no night information to make up. (Then what other NPCs
  // told them.)
  assert.equal(
    e.ask(chef.id).split("\n").slice(0, 2).join("\n"),
    "I claim Mayor.\nI have no stored information.",
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

test("a Juggler the Demon kills before they wake learns nothing", () => {
  const s = bluffNight("juggler");
  const [, juggler, butler] = s.players;

  role(juggler, "juggler", "good");

  const strat = new SimpleStrategy();

  strat.juggle = () => [{ id: butler.id, role: "butler" }];
  strat.demon = () => juggler;

  const e = new Engine(s, strat);

  e.start();
  e.endDay();

  assert.equal(juggler.alive, false);
  assert.ok(!juggler.memories.some((m) => m.text.startsWith("Juggler:")));
  assert.equal(juggler.juggle, null);
  assert.ok(
    s.audit.some((x) => x.type === "juggler" && /learns nothing/.test(x.text)),
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
  assert.match(lines[3], /^Who I (trust|suspect)/);
  assert.equal(lines.length, 4);

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
    assert.ok(lines.at(-1).startsWith(`Who I suspect: ${other.label} (my twin)`));
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
  assert.ok(after.includes(`Who I trust: ${butler.label}.`));
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
  assert.equal(strat.revealsWhenDead(baron), "mutant");

  // The Imp sticks to their bluff, dead or alive.
  assert.equal(strat.revealsWhenDead(imp), null);
  assert.ok(strat.ask(s, imp).startsWith("I claim Savant."));
});

test("an evil player who keeps the Mutant bluff claims a Townsfolk no teammate claims", () => {
  let mutantBluffs = 0;

  for (let seed = 0; seed < 600; seed++) {
    const s = createState(sv, 10, seed);

    for (const p of s.players.filter((x) => x.bluff === "mutant")) {
      // (The Evil Twin copies their good twin's claim instead.)
      const mates = s.players.filter(
        (x) => x !== p && x.alignment === "evil" && x.role !== "eviltwin",
      );

      mutantBluffs++;
      assert.equal(team(p.claim), "townsfolk");
      assert.ok(!mates.some((x) => x.claim === p.claim), p.claim);
    }
  }

  assert.ok(mutantBluffs > 0);
});

test("an evil Mutant or Damsel bluffer says so in public when they die, by execution or at night", () => {
  for (const bluff of ["mutant", "damsel"]) {
    // Executed: at once.
    const day = cfNight(`dead-${bluff}-day`);
    const baron = day.p[3];

    baron.bluff = bluff;
    baron.claim = "chef";
    day.s.phase = "day";
    day.s.day = 2;
    day.s.block = { nomineeId: baron.id, count: 3 };
    day.e.endDay();
    assert.ok(
      day.s.publicLog.some((l) => l === `Day 2 — Player 4 reveals they were the ${name(bluff)}.`),
      bluff,
    );
    assert.equal(baron.claim, bluff);

    // Killed at night: at dawn.
    const night = cfNight(`dead-${bluff}-night`, [], 2);
    const target = night.p[3];

    target.bluff = bluff;
    target.claim = "chef";
    night.strat.demon = () => target;
    night.e.night();
    assert.ok(
      night.s.publicLog.some((l) => l === `Day 2 — Player 4 reveals they were the ${name(bluff)}.`),
      bluff,
    );
  }
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

test("NPCs don't say they haven't used an ability they tell you they've used: a pretend Philosopher", () => {
  const s = base("unused-philosopher");
  const strat = new SimpleStrategy();
  const baron = s.players[3];

  baron.claim = "philosopher";
  assert.ok(strat.ask(s, baron).includes("I haven't used my Philosopher ability yet."));

  baron.memories.push({
    night: 1,
    role: "philosopher",
    text: "Philosopher: gained the Alchemist ability.",
    targets: [],
    trigger: "normal",
    functioning: false,
  });

  const said = strat.ask(s, baron);

  assert.ok(said.includes("Night 1: I gained the Alchemist ability."), said);
  assert.ok(!said.includes("haven't used"), said);
});

test("NPCs tell second-person information in the first person: the Alchemist's, a Lunatic-eating Cannibal's", () => {
  assert.equal(speak("Alchemist: you have the Poisoner ability."), "I have the Poisoner ability.");
  assert.equal(
    speak("Lunatic: you are the Imp. Your Minions are Player 2 and Player 3. Your bluffs are Chef, Monk, Mayor."),
    "I was told I am the Imp. My Minions are Player 2 and Player 3. My bluffs are Chef, Monk, Mayor.",
  );
});

test("an evil Philosopher bluffer gains an in-play Townsfolk and bluffs as it", () => {
  const s = bluffNight("philo-bluff");
  const imp = s.players[4];

  imp.claim = "philosopher";

  new Engine(s).start();

  // The only in-play information Townsfolk is the Chef (the Spy registers
  // good, so the true Chef number is 0).
  assert.equal(gainedRole(imp), "chef");
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
  e.claimPublicly(chef); // the Chef claims Chef in public on Day 1
  e.endDay();

  assert.ok(said(`Day 2 — ${chef.label} now claims to be the Mayor.`));

  e.claimPublicly(chef); // ...and Mayor on Day 2, while mad
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

test("Legion's kill on the Mayor bounces onto a good player, as the Storyteller steered it", () => {
  for (let i = 0; i < 30; i++) {
    const s = base(`mayor-bounce-legion-${i}`);
    const [, mayor, chef, a, b] = s.players;

    role(mayor, "mayor", "good");
    role(chef, "chef", "good");
    [a, b].forEach((x) => role(x, "legion", "evil"));
    s.phase = "night";
    s.night = 2;

    new Engine(s, new SimpleStrategy()).attack(a, mayor);

    assert.ok(a.alive && b.alive && !chef.alive, `seed ${i}`);
  }
});

test("an evil Pixie bluffer is never mad about a character a teammate claims", () => {
  for (let i = 0; i < 40; i++) {
    const { s, p, strat } = cfNight(`pixie-team-${i}`);
    const evil = p.filter((x) => x.alignment === "evil");
    const [bluffer, ...team_] = evil;
    const townsfolk = s.script.ids.filter((id) => team(id) === "townsfolk" && id !== "pixie");

    bluffer.claim = "pixie";
    bluffer.bluff = "pixie";
    team_.forEach((x, k) => (x.claim = townsfolk[k]));
    bluffTonight(s, bluffer, strat);

    assert.ok(!team_.some((x) => x.claim === bluffer.pixieRole), `seed ${i}: ${bluffer.pixieRole}`);
  }
});

test("the log says you hold a character an evil player claims", () => {
  const s = base("clue-you");
  const [human, , , , imp] = s.players;

  imp.claim = human.shown;

  const e = new Engine(s);

  assert.ok(
    e.clues().some((x) => x.includes(`claims the ${name(human.shown)}, which you really are.`)),
    e.clues().join("\n"),
  );
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
  e.claimPublicly(chef); // claims Mayor in public while mad
  e.endDay();

  assert.equal(chef.claim, "oracle");
  assert.ok(
    s.publicLog.includes(
      `Day 2 — ${chef.label}: "Yesterday the Cerenovus made me mad as the Mayor, I am actually the Oracle."`,
    ),
  );

  e.claimPublicly(chef); // claims Oracle in public while mad
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

  // With only the twins left to kill, the Demon kills you (see the next
  // test); with you dead too, the good twin (else the game could never end).
  s.players[2].alive = false;

  assert.equal(strat.demon(s, imp), s.players[0]);
  s.players[0].alive = false;
  assert.equal(strat.demon(s, imp), good);
  assert.match(imp.killWhy[good.id], /^a twin, as nobody else good is left to kill/);

  // Once either twin is dead, the other is a player like any other.
  s.players[0].alive = true;
  evil.alive = false;
  assert.ok(!twinSafe(s, good));
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
    `Chambermaid: 1 of ${p[3].label} and ${p[4].label} woke tonight.`,
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
    n.e.npcGossips();
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
    // (The Lunatic can be a Demon bluff, but nobody claims it while alive.)
    assert.ok(!s.players.some((x) => x.claim === "lunatic"));

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

test("a dead Lunatic bluffing a mad Pixie doesn't also reveal they were the Pixie", () => {
  const { s, l } = lunaticGame();
  const e = new Engine(s);

  l.bluff = "pixie";
  l.pixieRole = "chef";
  l.pixieMad = true;
  l.claim = "chef";
  l.alive = false;
  s.phase = "day";
  s.day = 1;
  e.learnsDeath(l);

  assert.notEqual(l.claim, "pixie");
  assert.ok(!s.publicLog.some((x) => x.includes("reveals they were the Pixie")));
});

test("an evil NPC never fakes coming clean as a character a teammate claims", () => {
  let checked = 0;

  for (let i = 0; i < 30; i++) {
    const s = coverGame(`cover-fake-team-${i}`);
    const evil = s.players.filter((x) => x.alignment === "evil" && !x.human);
    const [p, mate] = evil;
    const e = new Engine(s);
    const inPlay = s.players.map((x) => x.role);
    const options = s.script.ids.filter(
      (id) =>
        DEMON_KILL_PRIORITY[id] === "high" &&
        alignment(id) === "good" &&
        !inPlay.includes(id),
    );

    if (!mate || !options.length) {
      continue;
    }

    // (The teammate's claim is the only Demon bluff that fits.)
    s.demonBluffs = [options[0]];

    checked++;

    // (The teammate claims one, and p never heard it.)
    mate.claim = options[0];
    mate.toldMe = {};
    p.toldMe = {};
    p.claim = "chef";
    e.fakeClean(p);
    assert.notEqual(p.claim, mate.claim, `seed ${i}`);
  }

  assert.ok(checked > 10, `only ${checked} games checked`);
});

test("a Lunatic claiming the Mayor comes clean after a final-3 day with no execution and no Mayor win", () => {
  const { s, l } = lunaticGame();
  const e = new Engine(s);

  l.claim = "mayor";
  s.phase = "day";
  s.day = 4;
  e.lunaticReveals();
  assert.equal(l.claim, "mayor");

  s.mayorFailed = 4;
  s.day = 5;
  e.lunaticReveals();

  const said = s.publicLog.find((x) => x.includes("I'm not the Mayor"));

  assert.ok(said, s.publicLog.join("\n"));
  assert.ok(said.includes("I'm the Lunatic"));
  assert.equal(l.claim, "lunatic");
  // (They know now: they play for good.)
  assert.equal(sideOf(l), "good");
});

test("a dead evil player with the Lunatic bluff fakes being the Lunatic, naming good players", () => {
  let faked = 0;

  for (let seed = 0; seed < 40; seed++) {
    const s = createState(bmr, 12, `fake-lunatic-${seed}`);
    const m = s.players.find((x) => team(x.role) === "minion" && !x.human);

    if (!m || s.players.some((x) => x.role === "lunatic")) {
      continue;
    }

    m.bluffs = ["lunatic", ...(m.bluffs ?? [])];
    m.alive = false;
    s.phase = "day";
    s.day = 2;

    const e = new Engine(s);

    e.lunaticReveals();

    const said = s.publicLog.find((x) => x.startsWith(`Day 2 — ${m.label} says: "I was the Lunatic`));

    assert.ok(said, `seed ${seed}: ${s.publicLog.join("\n")}`);
    assert.equal(m.claim, "lunatic");
    assert.ok(m.memories.at(-1).targets.every((id) => byId(s, id).alignment === "good" && !byId(s, id).human));
    assert.ok(s.liesToYou.some((x) => x.byId === m.id && x.said === "lunatic"));

    // Once a game.
    const other = s.players.find((x) => x.alignment === "evil" && x !== m && team(x.role) !== "demon");

    if (other) {
      other.bluffs = ["lunatic"];
      other.alive = false;
      e.lunaticReveals();
      assert.notEqual(other.claim, "lunatic");
    }

    faked++;
  }

  assert.ok(faked > 10);
});

test("a Cannibal who eats the Lunatic is told they're a Demon, with Minions and bluffs, and stays good", () => {
  const { s, p, e } = cfNight("cannibal-lunatic", [null, "cannibal", "lunatic"]);

  s.phase = "day";
  s.day = 2;
  p[2].alive = false;
  e.cannibals(p[2]);

  const info = p[1].memories.at(-1);

  assert.equal(p[1].gained, "lunatic");
  assert.equal(p[1].alignment, "good");
  assert.equal(sideOf(p[1]), "good");
  assert.match(info.text, /^Lunatic: you are the .+\. Your Minions are .+\. Your bluffs are .+\.$/);
  assert.ok(info.targets.includes(p.find((x) => team(x.role) === "demon").id));
});

test("the Pit-Hag, Philosopher, Cerenovus and Barber never pick the Lunatic", () => {
  for (let i = 0; i < 60; i++) {
    const { s, p, strat } = cfNight(`no-lunatic-${i}`, [null, "lunatic"], 2);
    const hag = p.find((x) => x.alignment === "evil");

    assert.notEqual(strat.pithag(s, hag)?.role, "lunatic");
    assert.notEqual(strat.philosopher(s, p[2]), "lunatic");
    assert.notEqual(strat.cerenovus(s, hag)?.role, "lunatic");
    assert.ok(!(strat.barber(s, p.find((x) => team(x.role) === "demon")) ?? []).includes(p[1]));
  }
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
    e.npcGossips();
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
  e.revivedDawn();
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
  // (In the log, the Poisoner is named by character: see logNames().)
  assert.ok(
    log.includes(
      `${chef.memories[0].text.replace(chef.label, logNames(s)[chef.seat])} (misinformation: poisoned by ${logNames(s)[baron.seat]})`,
    ),
  );

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
    // (Shown the Pixie, a face-down character, they claim the Townsfolk the
    // Pixie was shown instead: see pixie.js pixieStart().)
    assert.equal(m.claim, m.shown === "pixie" ? m.pixieRole : m.shown);
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

test("a Professor bluffer 'fails' to revive a dead accuser, and says so", () => {
  const s = base("professor-bluff", bmr);
  const strat = new SimpleStrategy();
  const e = new Engine(s, strat);
  const [, chef, butler, baron] = s.players;

  // The Chef (dead, a claimed Townsfolk) accused the Baron; the Butler didn't.
  for (const x of [chef, butler]) {
    x.alive = false;
    x.claimKnown = true;
  }

  butler.claim = "chef";
  s.statements = [
    { byId: chef.id, day: 1, type: "suspicious", targetId: baron.id, source: "info" },
  ];
  baron.claim = "professor";
  strat.onceReady = () => true;
  s.night = 2;

  e.bluffs();
  assert.equal(baron.professorUsed, true);
  assert.equal(baron.professorExposed, chef.id);

  // In the morning: said in public, and the Chef's word now counts against them.
  e.professorReveals();
  assert.match(s.publicLog.at(-1), new RegExp(`${baron.label} says: "As the Professor I chose ${chef.label}`));
  assert.ok(s.exposed.includes(chef.id));
  assert.ok(strat.liars(s, butler).has(chef.id));
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

  // A Marionette shown the Pixie, mad as the Monk, doesn't spread the
  // Pixie's information as the Monk's.
  m.shown = "pixie";
  m.claim = "monk";
  m.lastSpread = null;
  m.memories = [
    { night: 1, role: "pixie", text: "Pixie: the Monk is in play.", targets: [], functioning: false },
  ];
  s.day = 4;
  e.marionetteDawn();

  assert.ok(
    !s.publicLog.some((x) => x.startsWith(`Day 4 — ${m.label} says: "I am the Monk.`)),
    s.publicLog.join("\n"),
  );

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

  // You nominated the Butler twice. (Votes for a trusted player no longer
  // count.)
  s.voteHistory = [1, 2].map((day) => ({
    day,
    nominatorId: s.players[0].id,
    nomineeId: butler.id,
    voterIds: [baron.id],
  }));

  const why = strat.evidence(s, chef, butler);

  assert.equal(why.score, 2 * EVIDENCE_WEIGHT.humanTrusted);
  assert.deepEqual(why.reasons, ["you nominated them (twice)"]);
  assert.equal(strat.evidence(s, chef, baron).score, 0);
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

// ── NPC conversations ───────────────────────────────────────

test("each NPC talks in private to as many NPCs a day as you can, new people first", () => {
  const s = createState(script, 10, "npc-talks");
  const e = new Engine(s);

  e.start();
  settle(e);

  const npcs = s.players.filter((x) => !x.human);
  const limit = e.talkLimit();

  // Day 1: everyone talked to `limit` different NPCs, and learned their claim.
  for (const p of npcs) {
    const talked = Object.keys(p.talkedTo ?? {});

    assert.equal(talked.length, limit);
    assert.ok(!talked.includes(p.id) && !talked.includes(s.humanId));

    for (const id of talked) {
      assert.ok(p.toldMe[id], `${p.label} learned ${id}'s claim`);
    }
  }

  // None of it is public, and nobody's claim was announced by it.
  assert.ok(!s.publicLog.some((x) => /talked to/.test(x)));

  e.endDay();
  settle(e);

  // Day 2: new people before anyone they've talked to.
  for (const p of npcs) {
    const days = Object.values(p.talkedTo);
    const fresh = Math.min(limit, npcs.length - 1 - limit);

    assert.ok(days.filter((d) => d === 2).length >= Math.min(limit, fresh));
    assert.equal(Object.keys(p.talkedTo).length, Math.min(npcs.length - 1, 2 * limit));
  }
});

test("NPCs weigh what they're told in private, and only the listener does", () => {
  const s = base("private-weigh");
  const [, chef, butler, baron] = s.players;
  const strat = new SimpleStrategy();

  // The Baron tells the Chef (only) that they're the Chef.
  baron.claim = "chef";
  strat.told(s, baron, chef);

  assert.ok(
    strat.evidence(s, chef, baron).reasons.some((x) => /claim the Chef, but I'm the Chef/.test(x)),
  );
  assert.equal(claimTo(baron, butler), null);
  assert.equal(strat.evidence(s, butler, baron).score, 0);
});

test("when you ask, an NPC says who they really trust and suspect, and the log shows why", () => {
  const s = base("trust-suspect");
  const [, chef, butler, baron] = s.players;
  const strat = new SimpleStrategy();
  const e = new Engine(s, strat);

  // Their information vouches for the Butler; the Baron claims their Chef.
  chef.memories.push(memory("empath", "Empath number: 0.", [butler]));
  baron.claim = "chef";
  strat.told(s, baron, chef);

  const said = e.ask(chef.id);

  // Just one: the Baron's 4 outweighs trusting the Butler (2, from their
  // own information).
  assert.ok(
    said.endsWith(`\nWho I suspect: ${baron.label} (they claim the Chef, but I'm the Chef).`),
  );
  assert.ok(!said.includes("Who I trust"));

  // Both neighbours their 0 vouches for, as strongly as each other.
  baron.claim = "baron";
  strat.told(s, baron, chef);
  chef.memories = [memory("empath", "Empath number: 0.", [butler, baron])];
  s.talked = [];

  assert.ok(e.ask(chef.id).endsWith(`\nWho I trust: ${butler.label}, ${baron.label}.`));
  assert.ok(!said.includes("What others have told me"));

  const workings = s.audit.find((x) => x.type === "workings");

  assert.match(workings.text, new RegExp(`${baron.label}: 4, suspected`));
  assert.match(workings.text, new RegExp(`${butler.label}: .*trusted \\(my information vouches for them\\)`));
});

test("the Demon goes after true characters only with a working Spy, with some cover kills", () => {
  const s = base("spy-kills");
  const strat = new SimpleStrategy();
  const [, chef, butler, baron, imp] = s.players;

  role(chef, "empath", "good"); // a "high" priority, though nobody knows it
  chef.claim = "empath";

  s.r = () => 0.5; // high fires (0.75); cover doesn't (0.3)
  assert.equal(strat.priorityLevel(s, chef, imp), null); // no Spy, no claim heard

  role(baron, "spy", "evil");
  assert.equal(strat.priorityLevel(s, chef, imp), "high");
  assert.equal(strat.demon(s, imp), chef);

  // A poisoned Spy sees nothing.
  baron.poisoned = true;
  assert.equal(strat.priorityLevel(s, chef, imp), null);
  baron.poisoned = false;

  // Cover: a less valuable good player instead.
  s.r = () => 0;
  assert.equal(strat.demon(s, imp), butler);
});

test("without a Spy, the Demon goes after the claims it has heard", () => {
  const s = base("heard-kills");
  const strat = new SimpleStrategy();
  const [, chef, , , imp] = s.players;

  chef.claim = "empath";
  assert.equal(strat.priorityLevel(s, chef, imp), null);

  strat.told(s, chef, imp);
  assert.equal(strat.priorityLevel(s, chef, imp), "high");
});

// ── Your hand in a vote ─────────────────────────────────────

test("a vote can wait for your hand, and a lowered hand doesn't vote", () => {
  const s = base("lower-hand");
  const e = new Engine(s);
  const [human, , butler, baron] = s.players;

  const waiting = e.nominate(butler.id, null);

  assert.equal(waiting.pending, true);
  assert.ok(s.pendingVote);
  assert.throws(() => e.endDay(), /Finish the vote first/);

  const result = e.castVotes(false);
  const mine = result.records.find((r) => r.playerId === human.id);

  assert.equal(mine.attempted, false);
  assert.equal(s.pendingVote, null);
  assert.ok(!s.voteHistory.at(-1).voterIds.includes(human.id));

  // Raised (the default when nominating straight through), it votes.
  const up = e.requestNomination(baron.id);

  assert.equal(up.records.find((r) => r.playerId === human.id).attempted, true);
});

test("dead, you keep your ghost vote by lowering your hand", () => {
  const s = base("ghost-hand");
  const e = new Engine(s);
  const [human, , butler, baron] = s.players;

  human.alive = false;

  e.requestNomination(butler.id, null);
  e.castVotes(false);
  assert.equal(human.ghost, true);
  assert.equal(e.canVote(), true);

  e.requestNomination(baron.id, null);
  e.castVotes(true);
  assert.equal(human.ghost, false);
  assert.equal(e.canVote(), false);
});

// ── Cover stories, coming clean, distortion ─────────────────

// A 7-player game (above COME_CLEAN_ALIVE) on Day 1.
function coverGame(seed) {
  const s = createState(script, 8, seed);

  s.players = s.players.slice(0, 7);
  s.seats = 7;
  s.twins = null;
  Object.assign(s, {
    phase: "day",
    night: 1,
    day: 1,
    winner: null,
    publicLog: [],
    privateLog: [],
    audit: [],
    auditId: 1,
    talked: [],
    talkDay: 1,
    demonBluffs: [],
  });

  const roles = [
    ["mayor", "good"],
    ["empath", "good"],
    ["soldier", "good"],
    ["chef", "good"],
    ["butler", "good"],
    ["baron", "evil"],
    ["imp", "evil"],
  ];

  s.players.forEach((p, i) => role(p, ...roles[i]));
  return s;
}

test("good NPCs hide a valuable character, or bait the Demon with one", () => {
  const s = coverGame("cover-pick");
  const [, empath, soldier, chef] = s.players;
  const strat = new SimpleStrategy();

  s.r = () => 0; // always within the chance

  const hide = strat.coverFor(s, empath);
  const bait = strat.coverFor(s, soldier);

  assert.equal(hide.kind, "hide");
  assert.ok(["low", "avoid"].includes(DEMON_KILL_PRIORITY[hide.as] ?? "low"));
  assert.equal(bait.kind, "bait");
  assert.equal(DEMON_KILL_PRIORITY[bait.as], "high");
  assert.equal(strat.coverFor(s, chef), null); // neither valuable nor bait

  // Never a character in play.
  const inPlay = s.players.flatMap((x) => [x.role, x.shown]);

  assert.ok(!inPlay.includes(hide.as) && !inPlay.includes(bait.as));
});

test("a hider tells most people their cover, and those they trust the truth", () => {
  const s = coverGame("cover-tell");
  const [human, empath, soldier, , , , imp] = s.players;
  const strat = new SimpleStrategy();

  empath.cover = { kind: "hide", as: "recluse", night: 1, human: false };
  empath.memories = [
    { night: 1, role: "empath", text: "Empath number: 0.", targets: [soldier.id] },
  ];

  strat.told(s, empath, imp);
  strat.told(s, empath, soldier); // vouched for by their 0

  assert.equal(imp.toldMe[empath.id].claim, "recluse");
  assert.ok(!(imp.heard ?? []).some((x) => x.source === "info"));
  assert.equal(soldier.toldMe[empath.id].claim, "empath");

  // You, this time, get the cover too (decided once).
  const said = new Engine(s, strat).ask(empath.id);

  assert.match(said, /^I claim Recluse\.\nI have no stored information\./);
  assert.equal(claimTo(empath, human), "recluse");
  assert.equal(claimTo(empath), null); // nothing in public
});

test("a nominated hider comes clean before the vote, on a card", () => {
  const s = coverGame("cover-nominated");
  const [, empath] = s.players;
  const e = new Engine(s);

  empath.cover = { kind: "hide", as: "recluse", night: 1 };
  empath.memories = [{ night: 1, role: "empath", text: "Empath number: 0.", targets: [] }];
  s.r = () => 0;

  e.nominate(empath.id, null);

  const card = s.phaseCards.at(-1);

  assert.equal(card.kind, "nomination");
  assert.equal(
    card.lines[0],
    `Day 1 — ${empath.label} comes clean: "I was hiding as the Recluse; I'm really the Empath.\nNight 1: My number is 0."`,
  );
  assert.equal(empath.cover, null);
  assert.equal(claimTo(empath), "empath");
  assert.ok(s.pendingVote); // the vote still waits for your hand
});

test("a nominated evil NPC may fake coming clean, once", () => {
  const s = coverGame("cover-fake");
  const baron = s.players[5];
  const e = new Engine(s);

  baron.claim = "chef";
  s.r = () => 0;

  e.nominate(baron.id);

  assert.equal(DEMON_KILL_PRIORITY[baron.claim], "high");
  assert.equal(claimTo(baron), baron.claim);
  assert.ok(baron.cameClean.fake);
  assert.ok(s.publicLog.some((x) => x.includes(`${baron.label} comes clean: "I was hiding as the Chef;`)));
});

test("an evil Pixie bluffer who fakes coming clean answers as the new claim, not the Pixie's character", () => {
  const s = coverGame("cover-fake-pixie");
  const baron = s.players[5];
  const e = new Engine(s);

  baron.bluff = "pixie";
  baron.pixieRole = "artist";
  baron.pixieMad = true;
  baron.claim = "artist";
  s.r = () => 0;

  assert.ok(e.fakeClean(baron));
  assert.notEqual(baron.claim, "artist");

  const answer = e.ask(baron.id);

  assert.ok(answer.includes(`I claim ${name(baron.claim)}.`), answer);
  assert.ok(!answer.includes("I claim Artist."), answer);
});

test("a dead player with a cover story comes clean at dawn", () => {
  const s = coverGame("cover-dead");
  const [, , soldier] = s.players;
  const e = new Engine(s);

  soldier.cover = { kind: "bait", as: "fortuneteller", night: 1, memories: [] };
  soldier.alive = false;
  e.dawnComeClean();

  assert.ok(
    s.publicLog.some((x) =>
      x.includes(`said I was the Fortune Teller to bait the Demon; I'm really the Soldier.`),
    ),
  );
  assert.equal(soldier.cover, null);
});

test("good NPCs count a changed story against a player, less once they came clean", () => {
  const s = coverGame("cover-story");
  const [, empath, , chef] = s.players;
  const strat = new SimpleStrategy();

  chef.toldMe = { [empath.id]: { claim: "recluse", at: 1 } };
  Object.assign(empath, { claimKnown: true, publicClaim: "empath", publicAt: 2 });

  const before = strat.evidence(s, chef, empath);

  assert.ok(before.reasons.some((x) => /told me they're the Recluse/.test(x)));

  empath.cameClean = { day: 1, from: "recluse" };
  assert.ok(strat.evidence(s, chef, empath).score < before.score);
});

test("an evil NPC distorts what the scapegoat told them, the same way each time", () => {
  const s = coverGame("distort");
  const [, , , chef, , baron] = s.players;
  const strat = new SimpleStrategy();

  const [, , , , butler, , imp] = s.players;

  s.scapegoat = chef.id;
  baron.toldMe = { [chef.id]: { claim: "chef", at: 1 } };
  s.r = () => 0;

  strat.told(s, baron, butler);

  const first = butler.secondHand[chef.id].claim;

  s.r = () => 0.99;
  strat.told(s, baron, imp);
  assert.notEqual(first, "chef");
  assert.equal(imp.secondHand[chef.id].claim, first);
});

// ── Bug fixes: NPC nominations, Cannibal bluffs, "You's" ────

test("NPCs only nominate once nominations are open", () => {
  const s = coverGame("npc-nominate-open");
  const e = new Engine(s);
  const strat = e.strat;
  const [, empath, , chef] = s.players;

  // A strong case, ready to nominate.
  strat.nomination = (_, p) =>
    p === empath ? { target: chef, score: 5, reasons: ["my information points at them"] } : null;

  assert.equal(e.npcNomination(), null);
  assert.ok(!s.nominationsOpen);
  assert.equal(s.nominated.length, 0);

  e.openNominations();

  const r = e.npcNomination();

  assert.ok(r.pending);
  assert.ok(s.publicLog.includes(`Day 1 — ${empath.label} nominates ${chef.label}: "My information points at them."`));
});

test("an evil Cannibal bluffer gains the executee's claimed ability, and bluffs with it", () => {
  const { s, p, strat, e } = opNight("cannibal-bluff", [null, null, "chef"]);
  const [, , chef, baron] = p;

  baron.claim = "cannibal";
  baron.bluff = "cannibal";
  strat.demon = () => null;

  e.night();
  s.phase = "day";
  e.claimPublicly(chef); // the town knows them as the Chef
  e.execute(chef);

  assert.equal(gainedRole(baron), "chef");
  assert.equal(baron.bluffState.gained.fromId, chef.id);

  // The next night they "learn" a Chef number (a first-night ability).
  s.night++;
  e.night();
  assert.ok(baron.memories.some((m) => m.night === 2 && /^Chef number/.test(m.text)));

  const said = e.strat.ask(s, baron);

  assert.match(said, /^I claim Cannibal\./);
  assert.ok(said.includes(`I have ${chef.label}'s ability, since they were executed.`));
});

test("log lines about you say 'your', not 'You's'", () => {
  for (const seed of ["you-1", "you-2", "you-3", "you-4"]) {
    const { e } = playOut(op, 10, seed);

    assert.ok(!e.debugLog().includes("You's"), seed);
  }
});

test("a dead mad Pixie admits to being the Pixie", () => {
  const { s, p, e } = opNight("pixie-dead", [null, "pixie", "fortuneteller"]);
  const [, pixie] = p;

  Object.assign(pixie, { pixieMad: true, pixieRole: "fortuneteller", claim: "fortuneteller" });
  s.phase = "day";
  s.day = 1;
  e.execute(pixie);

  assert.equal(pixie.claim, "pixie");
  assert.ok(
    s.publicLog.includes(
      `Day 1 — ${pixie.label} reveals they were the Pixie, mad about being the Fortune Teller.`,
    ),
  );
});

test("with a Pixie on the script, a double-claimed Townsfolk counts for less", () => {
  const { s, p, strat } = opNight("pixie-double", [null, "fortuneteller", "chef"]);
  const [, ft, chef, baron] = p;

  s.phase = "day";
  baron.claim = "fortuneteller";
  ft.toldMe = { [baron.id]: { claim: "fortuneteller", at: 1 } };

  const withPixie = strat.evidence(s, ft, baron);

  assert.equal(withPixie.score, EVIDENCE_WEIGHT.claimsMyCharacter * PIXIE_DOUBLE_CLAIM_FACTOR);
  assert.match(withPixie.reasons[0], /a Pixie could explain it/);

  s.script = { ...s.script, ids: s.script.ids.filter((id) => id !== "pixie") };
  assert.equal(strat.evidence(s, ft, baron).score, EVIDENCE_WEIGHT.claimsMyCharacter);

  // A mad Pixie knows the real one is out there.
  s.script = { ...s.script, ids: [...s.script.ids, "pixie"] };
  Object.assign(chef, { role: "pixie", pixieMad: true, pixieRole: "fortuneteller", claim: "fortuneteller" });
  chef.toldMe = { [ft.id]: { claim: "fortuneteller", at: 1 } };
  assert.equal(strat.evidence(s, chef, ft).score, 0);
});

test("a Pixie who gains the ability keeps claiming that character, and never the Pixie while alive", () => {
  const { s, p, e } = opNight("pixie-gains", [null, "pixie", "fortuneteller"]);
  const [, pixie, ft] = p;

  pixie.memories = [
    { night: 1, role: "pixie", text: "Pixie: the Fortune Teller is in play.", targets: [] },
  ];
  Object.assign(pixie, { pixieMad: true, pixieRole: "fortuneteller", claim: "fortuneteller" });
  s.phase = "day";
  s.day = 1;
  e.execute(ft);

  assert.equal(pixie.gained, "fortuneteller");
  assert.equal(pixie.claim, "fortuneteller");
  assert.ok(!s.publicLog.some((x) => /Pixie/.test(x)));

  // Asked, they claim the Fortune Teller, and keep quiet about the Pixie.
  const said = e.strat.ask(s, pixie);

  assert.match(said, /^I claim Fortune Teller\./);
  assert.ok(!/Pixie/.test(said), said);
});

test("a Pixie made mad by the Cerenovus on Night 1 goes back to their character, never the Pixie", () => {
  const { p, strat, e } = opNight("pixie-cerenovus", [null, "pixie", "fortuneteller"]);
  const pixie = p[1];

  p[3].role = "cerenovus";
  strat.cerenovus = () => ({ target: pixie, role: "chef" });
  e.night();

  assert.equal(pixie.claim, "chef");
  assert.equal(pixie.mad.previous, pixie.pixieRole);
});

test("a mad Pixie or the Lunatic acts out a claimed character, to no effect", () => {
  const { s, p, strat, e } = opNight("pixie-slayer", [null, "pixie", "slayer"]);
  const [, pixie, slayer, baron, imp] = p;

  Object.assign(pixie, { pixieMad: true, pixieRole: "slayer", claim: "slayer" });
  Object.assign(slayer, { shotUsed: true }); // (the real one has shot)
  strat.slay = (_, x) => (x === pixie ? imp : null);
  s.phase = "day";
  s.day = 3;

  e.npcShots();

  assert.equal(pixie.shotUsed, true);
  assert.equal(imp.alive, true); // no effect
  assert.ok(s.publicLog.includes(`Day 3 — ${pixie.label} claims Slayer and shoots ${imp.label}.`));

  // The Lunatic bluffing the Artist asks, and hears made-up information.
  role(baron, "lunatic", "good");
  baron.claim = "artist";
  strat.artist = (_, x) => (x === baron ? { targets: [imp.id], question: "demon" } : null);
  e.npcArtists();

  assert.equal(baron.artistUsed, true);
  assert.ok(baron.memories.some((m) => m.role === "artist" && m.functioning === false));
});

test("the NPC nominations count goes down as NPCs nominate, one at a time", () => {
  const s = coverGame("npc-count");
  const e = new Engine(s);
  const [, empath, soldier, chef, butler] = s.players;
  const wants = new Map([
    [empath, chef],
    [soldier, butler],
  ]);

  e.strat.nomination = (_, p) =>
    wants.has(p) ? { target: wants.get(p), score: 5, reasons: [] } : null;

  e.openNominations();
  assert.equal(s.npcWanting, 2);
  assert.equal(s.nominated.length, 0); // nobody nominated by themselves

  e.npcNomination();
  e.castVotes(false);
  assert.equal(s.npcWanting, 1);

  e.npcNomination();
  e.castVotes(false);
  assert.equal(s.npcWanting, 0);
  assert.equal(e.npcNomination(), null);
});

test("an evil Pixie bluffer acts like a real Pixie: mad, then admits it", () => {
  const { s, p, e } = opNight("pixie-bluff", [null, "chef", "fortuneteller"]);
  const baron = p[3];

  Object.assign(baron, { claim: "pixie", bluff: "pixie" });

  e.night(); // Night 1: they "learn" a Townsfolk; Day 1: mad about it
  assert.ok(baron.pixieRole);
  assert.equal(baron.pixieMad, true);
  assert.equal(baron.claim, baron.pixieRole);
  assert.match(e.strat.ask(s, baron), new RegExp(`^I claim ${name(baron.pixieRole)}\.`));

  // Never "I claim Pixie" while alive and mad; on death, they admit it.
  e.execute(baron);
  assert.ok(
    s.publicLog.includes(
      `Day 1 — ${baron.label} reveals they were the Pixie, mad about being the ${name(baron.pixieRole)}.`,
    ),
  );
});

// ── Abilities seen to work or fail ──────────────────────────

test("a Virgin who executes a Townsfolk is confirmed good: trusted, never framed", () => {
  const s = coverGame("virgin-confirmed");
  const e = new Engine(s);
  const [, empath, soldier, chef, butler, baron] = s.players;

  role(butler, "virgin", "good");
  s.scapegoat = butler.id; // the evil team was framing them
  e.claimPublicly(butler);
  e.openNominations();
  e.runNomination(chef, butler); // a Chef (Townsfolk) nominates the Virgin

  assert.equal(chef.alive, false);
  assert.ok(s.confirmed[butler.id]);

  // Good NPCs trust them, even with accusations against them.
  s.statements.push({ byId: baron.id, day: 1, type: "suspicious", targetId: butler.id, source: "opinion" });
  assert.ok(e.strat.evidence(s, empath, butler).score < 0);
  assert.ok(e.strat.trusted(s, soldier).has(butler.id));
  assert.notEqual(e.strat.suspicion(s, empath).targetId, butler.id);

  // The evil team frames someone else.
  assert.notEqual(scapegoat(s).id, butler.id);
});

test("a claimed Virgin nominated by a claimed Townsfolk, with nothing happening, counts against both", () => {
  const s = coverGame("virgin-failed");
  const e = new Engine(s);
  const [, empath, , chef, , baron] = s.players;

  baron.claim = "virgin";
  e.claimPublicly(baron);
  e.claimPublicly(chef);
  e.openNominations();
  e.runNomination(chef, baron, false, null);
  e.castVotes(false);

  assert.equal(chef.alive, true);
  assert.ok(e.strat.evidence(s, empath, baron).reasons.some((x) => /claim the Virgin, but nothing happened/.test(x)));
  assert.ok(e.strat.evidence(s, empath, chef).reasons.some((x) => /nominating .* did nothing/.test(x)));
});

test("a Monk whose protected player died to the Demon, and a Slayer who never shoots, look suspicious", () => {
  const s = coverGame("monk-failed");
  const strat = new SimpleStrategy();
  const [, empath, soldier, , butler, baron] = s.players;

  baron.claim = "monk";
  baron.memories = [{ night: 2, role: "monk", text: `Monk: protected ${butler.label} from the Demon.`, targets: [butler.id] }];
  Object.assign(butler, { alive: false, death: "demon", diedAtNight: 2 });
  strat.told(s, baron, empath);

  assert.ok(
    strat.evidence(s, empath, baron).reasons.some((x) => /they say they protected .* but the Demon killed them/.test(x)),
  );

  // A claimed Slayer, still not shooting by Day 4.
  Object.assign(soldier, { claim: "slayer" });
  strat.told(s, soldier, empath);
  s.day = 4;
  assert.ok(strat.evidence(s, empath, soldier).reasons.includes("they claim the Slayer, but haven't shot"));
});

test("confirmations come in levels: certain, near certain, and maybe", () => {
  const s = coverGame("confirm-levels");
  const e = new Engine(s);
  const [, empath, soldier, , butler, baron, imp] = s.players;

  // A Slayer whose shot kills the Demon: certain.
  role(soldier, "slayer", "good");
  e.shoot(soldier, imp);
  assert.equal(s.confirmed[soldier.id].level, "certain");

  // A claimed Fool who survives execution: only maybe.
  butler.claim = "fool";
  e.claimPublicly(butler);
  e.survivedExecution(butler);
  assert.equal(s.confirmed[butler.id].level, "maybe");

  const W = EVIDENCE_WEIGHT;

  assert.equal(e.strat.evidence(s, empath, soldier).score, W.confirmedGood);
  assert.equal(e.strat.evidence(s, empath, butler).score, W.confirmedMaybe);

  // Only the sure ones are trusted outright, and top the Demon's kill list.
  assert.ok(e.strat.trusted(s, empath).has(soldier.id));
  assert.ok(!e.strat.trusted(s, empath).has(butler.id));
  assert.equal(e.strat.priorityLevel(s, soldier, baron), "top");
  assert.notEqual(e.strat.priorityLevel(s, butler, baron), "top");

});

// ── Public failures, the Courtier's countdown, log names ─────

test("an Exorcist (or Exorcist bluffer) never chooses the human", () => {
  const s = base("exorcist-human");
  const strat = new SimpleStrategy();
  const exorcist = s.players[1];

  role(exorcist, "exorcist", "good");
  s.night = 2;

  for (let i = 0; i < 40; i++) {
    const r = rng(`exo-${i}`);

    s.r = r;
    exorcist.picked = {};
    exorcist.lastPicks = {};
    assert.ok(!strat.exorcist(s, exorcist)?.human);
  }
});

test("a Moonchild whose pick didn't die says so in public at dawn", () => {
  const s = base("moonchild-says");
  const e = new Engine(s);
  const [, moonchild, pick] = s.players;

  role(moonchild, "moonchild", "good");
  moonchild.alive = false;
  s.moonPicks = [{ byId: moonchild.id, targetId: pick.id, day: 1 }];
  s.day = 2;
  e.moonchildDawn();

  assert.ok(
    s.publicLog.includes(
      `Day 2 — ${moonchild.label} says: "As the Moonchild I chose ${pick.label}, and they didn't die."`,
    ),
  );
  assert.equal(moonchild.memories.at(-1).text, `Moonchild: chose ${pick.label}, who didn't die.`);
});

test("a Courtier counts down how long their choice is drunk", () => {
  const s = base("courtier-countdown");
  const strat = new SimpleStrategy();
  const chose = [{ night: 1, role: "courtier", character: "imp", text: "Courtier: chose the Imp." }];

  s.day = 1;
  assert.equal(
    strat.courtierLine(s, chose),
    "My choice, the Imp, is drunk for 2 more nights and 3 more days (counting today).",
  );
  s.day = 3;
  assert.equal(strat.courtierLine(s, chose), "My choice, the Imp, is drunk for 1 more day (counting today).");
  s.day = 4;
  assert.equal(strat.courtierLine(s, chose), "My choice, the Imp, is no longer drunk.");
});

test('log.txt names players by seat, character (in capitals when evil) and claim: P4 BARON "Butler", but P2 Chef when they claim what they are', () => {
  const s = base("log-names");
  const e = new Engine(s);
  const [human, chef, , baron] = s.players;

  role(chef, "chef", "good");
  role(baron, "baron", "evil");
  s.logRoles = null;
  baron.claim = "butler";
  e.audit("test", `${baron.label} (Baron) chose ${chef.label}; ${human.label} saw.`);

  // (No quotes for a claim that's just their character.)
  assert.ok(e.debugLog().includes(`[test] P4 BARON "Butler" chose P2 Chef; You saw.`));
  assert.match(e.debugLog(), /^You: +P1 [A-Za-z ]+$/m);

  // What you saw or heard is marked ▶: a public statement, your own
  // information; not the Storyteller's business.
  e.audit("gossip", `${chef.label} said "${baron.label} is a Minion." (true).`);
  e.audit("information", "You received: Mayor: nothing.");
  e.audit("poison", `${baron.label} chose ${chef.label}; poisoned.`);
  assert.match(e.debugLog(), /^▶ \[gossip\] P2 Chef said/m);
  assert.match(e.debugLog(), /^▶ \[information\] You received/m);
  assert.match(e.debugLog(), /^ {2}\[poison\] P4 BARON "Butler" chose/m);

  // A character change shows the one before: the Pit-Hag turns the Chef
  // into the Imp.
  chef.role = "imp";
  chef.alignment = "evil";
  e.audit("test", `${chef.label} woke.`);
  assert.ok(e.debugLog().includes(`[test] P2 CHEF->IMP "Chef" woke.`));
});

test("log.txt names a claim's gained abilities after it: a pretend Philosopher-Alchemist-Poisoner, a real Philosopher", () => {
  const s = base("log-names-chain");
  const e = new Engine(s);
  const [, philosopher, damsel] = s.players;

  role(philosopher, "philosopher", "good");
  role(damsel, "damsel", "good");
  s.logRoles = null;
  philosopher.gained = "snakecharmer";
  damsel.claim = "philosopher";
  bluffState(damsel).philosopher = "alchemist";
  bluffState(damsel).said.alchemist = "poisoner";
  e.audit("test", `${damsel.label} and ${philosopher.label}.`);

  assert.ok(
    e.debugLog().includes(
      '[test] P3 Damsel "Philosopher->Alchemist->Poisoner" and P2 Philosopher "Philosopher->Snake Charmer".',
    ),
  );
});

// ── Catfishing ───────────────────────────────────────────────

const cf = JSON.parse(
  fs.readFileSync(new URL("../scripts/Catfishing_11_1_1.json", import.meta.url)),
);

test("Catfishing loads without its Travellers, and plays whole games without errors", () => {
  const s = createState(cf, 10, "cf");

  assert.equal(s.script.meta.name, "Catfishing");
  assert.equal(s.script.ids.length, 25);
  assert.ok(!s.script.ids.includes("harlot"));

  for (const seats of [8, 10, 12, 13, 15]) {
    for (let seed = 0; seed < 16; seed++) {
      const { s: g, e } = playOut(cf, seats, `cf-${seats}-${seed}`);

      assert.ok([null, "good", "evil"].includes(g.winner));
      assert.ok(e.debugLog().length > 0);
    }
  }
});

// A 5-player Catfishing game (the base roles: Mayor (you), Chef, Butler,
// Baron, Imp), with `roles` by seat, on Night `night`.
function cfNight(seed, roles = [], night = 1) {
  const s = base(seed, cf);

  roles.forEach((id, i) => id && role(s.players[i], id, alignment(id)));
  s.phase = "night";
  s.night = night;
  s.day = night - 1;

  const strat = new SimpleStrategy();

  strat.demon = () => null;

  return { s, p: s.players, strat, e: new Engine(s, strat) };
}

test("the Balloonist is shown a player of a different character type each night", () => {
  for (let seed = 0; seed < 20; seed++) {
    const { s, p, strat } = cfNight(`balloon-${seed}`, [null, "balloonist"]);
    const types = [];

    for (let night = 1; night <= 4; night++) {
      s.night = night;

      const info = nightInfo(s, p[1], strat);

      assert.match(info.text, /^Balloonist: shown .+\.$/);
      types.push(team(byId(s, info.targets[0]).role));
    }

    types.slice(1).forEach((k, i) => assert.notEqual(k, types[i], `seed ${seed}`));
  }

  assert.equal(speak("Balloonist: shown Player 4."), "I was shown Player 4.");
});

test("a working Balloonist sees every character type once, in random order, then starts again", () => {
  const orders = new Set();

  for (let seed = 0; seed < 20; seed++) {
    // (Mayor (you), Balloonist, Butler, Baron, Imp: all 4 types to see.)
    const { s, p, strat } = cfNight(`balloon-cycle-${seed}`, [null, "balloonist"]);
    const types = [];

    for (let night = 1; night <= 8; night++) {
      s.night = night;

      const info = nightInfo(s, p[1], strat);

      assert.ok(info.functioning);
      types.push(team(byId(s, info.targets[0]).role));
    }

    const all = ["townsfolk", "outsider", "minion", "demon"];

    assert.deepEqual([...types.slice(0, 4)].sort(), [...all].sort(), `seed ${seed}`);
    assert.deepEqual([...types.slice(4)].sort(), [...all].sort(), `seed ${seed}`);
    assert.notEqual(types[4], types[3]);
    orders.add(types.slice(0, 4).join());
  }

  assert.ok(orders.size > 1);
});

test("a Balloonist bluffer names players whose claimed types change each night", () => {
  for (let seed = 0; seed < 20; seed++) {
    const { s, p, strat } = cfNight(`balloon-bluff-${seed}`, [null, "chef", "recluse", null, "imp"]);
    const claims = ["mayor", "chef", "recluse", "investigator", "balloonist"];

    p.forEach((x, i) => {
      x.claim = claims[i];
      x.claimKnown = true;
    });
    p[4].claim = "balloonist";

    const types = [];

    for (let night = 1; night <= 4; night++) {
      s.night = night;

      const info = bluffTonight(s, p[4], strat);

      types.push(team(byId(s, info.targets[0]).claim));
    }

    types.slice(1).forEach((k, i) => assert.notEqual(k, types[i], `seed ${seed}`));
  }
});

test("the Widow poisons a player (never herself) for the rest of the game, and a good player learns she's in play", () => {
  const { s, p, e } = cfNight("widow", [null, "empath", null, "widow"]);

  e.night();

  const t = byId(s, s.widowPick.targetId);

  assert.notEqual(t, p[3]);
  assert.equal(t.alignment, "good");
  assert.ok(t.poisoned);
  assert.ok(
    s.players.some((x) =>
      x.memories.some((m) => m.text === "Widow: a Widow is in play."),
    ),
  );

  // Still poisoned on later nights, while she lives.
  s.phase = "night";
  s.night = 2;
  e.widowLasting();
  assert.ok(t.poisoned);

  p[3].alive = false;
  t.poisoned = false;
  e.widowLasting();
  assert.ok(!t.poisoned);

  // A strategy that picks the Widow herself poisons nobody.
  const self = cfNight("widow-self", [null, null, null, "widow"]);

  self.strat.widow = (_, w) => w;
  self.e.night();
  assert.ok(!self.s.widowPick);
});

test("a good Widow (you, made one by the Pit-Hag) never picks herself", () => {
  for (let seed = 0; seed < 30; seed++) {
    const { s, p, strat } = cfNight(`widow-you-${seed}`, ["widow"]);

    p.slice(1).forEach((x) => (x.alignment = "evil"));
    assert.notEqual(strat.widow(s, p[0]), p[0]);
  }
});

test("an evil Dreamer bluffer's dreams hold up against the town's claims", () => {
  for (let seed = 0; seed < 20; seed++) {
    const { s, p, strat } = cfNight(`dream-bluff-${seed}`, [null, null, null, "baron", "imp"]);
    // (Claims on the script.)
    const good = s.script.ids.filter((id) => alignment(id) === "good");

    s.script.ids.push("dreamer");
    p.forEach((x, i) => (x.claim = good[i]));
    p[3].claim = "dreamer";

    const inPlay = new Set(p.map((x) => x.role));
    const seen = {};

    for (let night = 1; night <= 5; night++) {
      s.night = night;

      const info = bluffTonight(s, p[3], strat);
      const t = byId(s, info.targets[0]);
      const [, a, b] = info.text.match(/ is the (.+) or the (.+)\.$/);
      const ids = [a, b].map((x) => Object.keys(ROLES).find((id) => name(id) === x));

      // The character they claim, and an evil one nobody is.
      assert.ok(ids.includes(t.claim), `seed ${seed}: ${info.text}`);
      assert.ok(
        ids.some((id) => alignment(id) === "evil" && !inPlay.has(id)),
        `seed ${seed}: ${info.text}`,
      );
      // The same player dreamed again: the same pair.
      if (seen[t.id]) {
        assert.equal(info.text.replace(/^\w+ /, ""), seen[t.id]);
      }

      seen[t.id] = info.text.replace(/^\w+ /, "");
    }
  }
});

test("an Evil Twin whose good twin is you says \"You are my Evil Twin\"", () => {
  const { s, p } = cfNight("twin-you", []);

  assert.equal(speak(evilTwinInfo(s, p[0]).text), "You are my Evil Twin.");
});

test("the evil team knows the characters the Widow saw on Night 1, not later changes", () => {
  const { s, p, e, strat } = cfNight("widow-grim", [null, "empath", null, "widow"]);

  e.night();
  assert.equal(s.widowGrimoire[p[1].id], "empath");

  // The Empath is changed later: the Demon still sees the Empath.
  role(p[1], "sweetheart", "good");
  p[1].claim = null;
  assert.equal(strat.seenRole(s, p[1], p[4]), "empath");
  assert.equal(strat.priorityLevel(s, p[1], p[4]), DEMON_KILL_PRIORITY.empath);
  // (A good player doesn't know.)
  assert.equal(strat.seenRole(s, p[1], p[2]), null);
});

test("a Widow made by the Pit-Hag tells a living good player she's in play", () => {
  const { s, e } = cfNight("widow-pithag");

  e.widowKnown();

  const told = s.players.filter((x) =>
    x.memories.some((m) => m.text === "Widow: a Widow is in play."),
  );

  assert.equal(told.length, 1);
  assert.ok(told[0].alive && told[0].alignment === "good");
});

test("the Amnesiac's information doesn't say what it means, and guesses say how close they are", () => {
  const { s, p, strat, e } = cfNight("amnesiac", [null, "amnesiac"]);

  p[1].amnesiac = "goodplayer";

  const info = nightInfo(s, p[1], strat);

  assert.match(info.text, /^Amnesiac: (You|Player \d+)\.$/);
  assert.equal(byId(s, info.targets[0]).alignment, "good");
  e.remember(p[1], info);

  s.phase = "day";
  s.day = 1;
  assert.match(e.amnesiacGuess(p[1], "neighbours").text, /: WARM\.$/);
  assert.match(e.amnesiacGuess(p[1], "demonsteps").text, /: COLD\.$/);
  assert.ok(!p[1].memories[0].known);
  assert.match(e.amnesiacGuess(p[1], "evilplayer").text, /: HOT\.$/);
  assert.match(e.amnesiacGuess(p[1], "goodplayer").text, /: BINGO\.$/);
  assert.ok(p[1].memories[0].known);

  // Once they know, a good player they learned is trusted.
  assert.equal(stanceOn(s, p[1].memories[0], byId(s, info.targets[0]), p[1]), "trust");

  // Every secret ability works, true or not.
  for (const key of Object.keys(AMNESIAC_ABILITIES)) {
    for (const mode of ["truth", "lie", "random"]) {
      const g = cfNight(`amnesiac-${key}-${mode}`, [null, "amnesiac"]);

      g.p[1].amnesiac = key;
      if (mode === "lie") g.p[1].poisoned = true;

      const m = nightInfo(g.s, g.p[1], g.strat);

      assert.equal(amnesiacKey(g.s, g.p[1]), key);
      assert.match(
        m.text,
        /^Amnesiac( number: \d|: (YES|NO|(You|Player \d+)( and Player \d+)?))\.$/,
      );
      assert.equal(amnesiacShape(m.text), AMNESIAC_ABILITIES[key].shape);
    }
  }
});

test("the human Amnesiac guesses once a day", () => {
  const { s, p, e } = cfNight("amnesiac-human", ["amnesiac"]);

  p[0].amnesiac = "neighbours";
  s.phase = "day";
  s.day = 1;
  assert.match(e.amnesiac("neighbours"), /: BINGO\.$/);
  assert.throws(() => e.amnesiac("goodplayer"), /Amnesiac unavailable/);

  // Once they know, there's nothing more to guess.
  s.day = 2;
  assert.ok(!e.amnesiacOpen());
});

test("the Amnesiac can ask a yes/no question about their ability instead of guessing", () => {
  const { s, p, e } = cfNight("amnesiac-question", ["amnesiac"]);

  p[0].amnesiac = "demonneighbour";
  s.phase = "day";
  s.day = 1;
  assert.match(e.amnesiacQuestion("demon"), /: YES\.$/);
  assert.throws(() => e.amnesiac("demonneighbour"), /Amnesiac unavailable/);
  s.day = 2;
  assert.match(e.amnesiacQuestion("alignment"), /: NO\.$/);
  s.day = 3;
  assert.match(e.amnesiac("demonvoted"), /: HOT\.$/);
  assert.deepEqual(p[0].amnesiacAsked, { demon: true, alignment: false });
  assert.deepEqual(p[0].amnesiacSaid, { demonvoted: "HOT" });

  // Every ability and decoy is about something a question can ask, and
  // there are 3 guesses of each shape.
  for (const g of Object.values(AMNESIAC_GUESSES)) {
    assert.ok(g.about.length && g.about.every((q) => q in AMNESIAC_QUESTIONS));
  }

  for (const shape of Object.keys(AMNESIAC_SHAPES)) {
    assert.equal(
      Object.values(AMNESIAC_GUESSES).filter((g) => g.shape === shape).length,
      3,
    );
  }
});

test("the Amnesiac's new abilities tell the truth when healthy", () => {
  // Imp, Amnesiac, Washerwoman: the Imp is one of the Amnesiac's neighbours.
  const g = cfNight("amnesiac-new", ["imp", "amnesiac", "washerwoman"]);
  const me = g.p[1];
  const said = (key) => {
    me.amnesiac = key;

    return nightInfo(g.s, me, g.strat).text;
  };

  assert.equal(said("demonneighbour"), "Amnesiac: YES.");
  assert.equal(said("evilneighbours"), "Amnesiac number: 1.");
  assert.match(said("evilpairs"), /^Amnesiac number: \d\.$/);
  assert.equal(speak(said("evilneighbours")), "My number is 1.");
});

// ── Extension Cord ───────────────────────────────────────────

test("Extension Cord loads: its Travellers are left out, and the Sentinel is a Fabled", () => {
  const s = createState(ec, 10, "ec");

  assert.equal(s.script.meta.name, "Extension Cord");
  assert.deepEqual(s.script.fabled, ["sentinel"]);
  assert.equal(s.script.ids.length, 24);
  assert.ok(!s.script.ids.some((id) => ["bishop", "matron", "sentinel"].includes(id)));
});

test("the Sentinel deals 1 fewer, the same or 1 more Outsider", () => {
  const seen = new Set();
  // (No Huntsman, so the Damsel doesn't change the count.)
  const raw = ec.filter((x) => x.id !== "huntsman");

  for (let seed = 0; seed < 120; seed++) {
    const s = createState(raw, 9, seed); // normally 2 Outsiders

    seen.add(s.players.filter((p) => team(p.role) === "outsider").length);
  }

  assert.deepEqual([...seen].sort(), [1, 2, 3]);
});

test("the Huntsman brings the Damsel", () => {
  let huntsmen = 0;

  for (let seed = 0; seed < 200; seed++) {
    for (const seats of [10, 12]) {
      const s = createState(ec, seats, `hunt-${seed}`);
      const roles = s.players.map((p) => p.role);

      if (roles.includes("huntsman")) {
        huntsmen++;
        assert.ok(roles.includes("damsel"), `seed ${seed}`);
      }
    }
  }

  assert.ok(huntsmen > 0);
});

test("the Marionette sits by the No Dashii on the side that pushes its poison furthest", () => {
  let games = 0;
  // Seats from the Demon to its nearest Townsfolk each way.
  const reach = (roles, di) =>
    [-1, 1].reduce((n, d) => {
      for (let k = 1; k < roles.length; k++) {
        if (team(roles[(di + d * k + roles.length) % roles.length]) === "townsfolk") {
          return n + k;
        }
      }

      return n;
    }, 0);

  for (let seed = 0; seed < 400; seed++) {
    const s = createState(ec, 8 + (seed % 8), `cord-${seed}`);
    const roles = s.players.map((p) => p.role);
    const di = roles.indexOf("nodashii");
    const mi = roles.indexOf("marionette");
    const n = roles.length;

    if (di < 0 || mi < 0) {
      continue;
    }

    games++;

    const near = [(di + n - 1) % n, (di + 1) % n];

    assert.ok(near.includes(mi), `seed ${seed}`);

    // The other side (unless it's your seat) pushes it no further.
    const other = near.find((i) => i !== mi);

    if (other !== 0) {
      const swapped = [...roles];

      [swapped[mi], swapped[other]] = [swapped[other], swapped[mi]];
      assert.ok(reach(roles, di) >= reach(swapped, di), `seed ${seed}`);
    }
  }

  assert.ok(games > 20);
});

test("the Marionette is never shown the Huntsman without the Damsel in play", () => {
  const raw = [
    { id: "_meta", name: "Puppet" },
    ...["huntsman", "chef", "empath", "monk", "soldier", "mayor", "investigator"],
    ...["mutant", "recluse", "damsel", "marionette", "poisoner", "nodashii"],
  ];

  for (let seed = 0; seed < 200; seed++) {
    const s = createState(raw, 8, seed);
    const m = s.players.find((p) => p.role === "marionette");

    if (m?.shown === "huntsman") {
      assert.ok(s.players.some((p) => p.role === "damsel"), `seed ${seed}`);
    }
  }
});

test("an NPC Damsel claims any Townsfolk (she doesn't know what's in play), until she dies", () => {
  let damsels = 0;
  let inPlay = 0;

  for (let seed = 0; seed < 300; seed++) {
    const s = createState(ec, 12, `damsel-${seed}`);
    const tokens = new Set(s.players.map((p) => p.shown));

    for (const p of s.players.filter((x) => x.role === "damsel")) {
      damsels++;
      assert.equal(team(p.claim), "townsfolk");
      inPlay += tokens.has(p.claim) ? 1 : 0;
    }
  }

  // (Sometimes one that's in play, as anyone guessing would.)
  assert.ok(damsels > 0 && inPlay > 0, `${inPlay} of ${damsels}`);

  // Made the Damsel later, she keeps claiming the Townsfolk she claimed.
  const later = cfNight("damsel-made", [null, "empath"]);

  role(later.p[1], "damsel", "good");
  later.p[1].claim = "empath";
  assert.equal(later.e.claimFor(later.p[1]), "empath");

  const { p, strat } = cfNight("damsel-dead", [null, null, "damsel"]);

  assert.equal(strat.revealsWhenDead(p[2]), null);
  p[2].alive = false;
  assert.equal(strat.revealsWhenDead(p[2]), "damsel");
});

test("a Minion who guesses the Damsel in public wins for evil; a wrong guess gives them away", () => {
  const miss = cfNight("damsel-miss", [null, null, "damsel"]);

  miss.e.damselKnown();
  miss.s.phase = "day";
  miss.s.day = 3;
  miss.e.damselGuess(miss.p[3], miss.p[1]);
  assert.equal(miss.s.winner, null);
  assert.ok(miss.s.publicLog.some((l) => /guesses Player 2 is the Damsel/.test(l)));
  // (Good NPCs count it against the Minion.)
  assert.ok(
    miss.strat.evidence(miss.s, miss.p[2], miss.p[3]).score >= EVIDENCE_WEIGHT.damselGuess,
  );
  // ...and the team doesn't guess that player again.
  miss.p[1].claim = "damsel";
  miss.p[1].claimKnown = true;
  assert.notEqual(miss.strat.damselGuess(miss.s, miss.p[4]), miss.p[1]);

  // (Seat 2 is good: only the Baron guesses.)
  const hit = cfNight("damsel-hit", [null, "chef", "damsel"]);

  hit.e.damselKnown();
  hit.s.phase = "day";
  hit.s.day = 3;
  // A Damsel who said who she is is guessed at once (at DAMSEL_CLAIM_CHANCE).
  hit.s.r = () => 0;
  hit.p[2].claim = "damsel";
  hit.p[2].claimKnown = true;
  assert.equal(hit.strat.damselGuess(hit.s, hit.p[3]), hit.p[2]);
  hit.e.npcDamselGuesses();
  assert.equal(hit.s.winner, "evil");
});

test("with the Spy or Widow in play, the Damsel is poisoned, and the Minions don't guess", () => {
  for (const jinx of ["spy", "widow"]) {
    const { s, p, e, strat } = cfNight(`damsel-${jinx}`, [null, null, "damsel", jinx]);

    e.damselLasting();
    assert.ok(p[2].poisoned, jinx);
    assert.match(p[2].poisonedBy, /jinx/);

    e.damselKnown();
    s.day = 3;
    p[2].claim = "damsel";
    p[2].claimKnown = true;
    assert.equal(strat.damselGuess(s, p[3]), null);

    // ("Or has been": she stays poisoned once the jinxed Minion is gone.)
    role(p[3], "poisoner", "evil");
    p[2].poisoned = false;
    e.damselLasting();
    assert.ok(p[2].poisoned);

    s.phase = "day";
    e.damselGuess(p[3], p[2]);
    assert.equal(s.winner, null);
  }
});

test("the Huntsman turns the Damsel into a Townsfolk that isn't in play", () => {
  const { s, p, e, strat } = cfNight("huntsman", [null, "huntsman", "damsel"]);

  strat.huntsman = () => p[2];
  e.huntsmen();

  assert.ok(p[1].huntsmanUsed);
  assert.equal(team(p[2].role), "townsfolk");
  assert.ok(!s.players.some((x) => x !== p[2] && x.role === p[2].role));
  assert.equal(p[1].memories[0].text, "Huntsman: chose Player 3.");

  // Once per game.
  strat.huntsman = () => p[3];
  e.huntsmen();
  assert.equal(p[1].memories.length, 1);

  // A Huntsman with nothing to go on waits; one the Damsel told chooses her.
  const g = cfNight("huntsman-told", [null, "huntsman", "damsel"]);

  assert.equal(g.strat.huntsman(g.s, g.p[1]), null);
  (g.p[1].toldMe ??= {})[g.p[2].id] = { claim: "damsel", day: 1, at: 1 };
  assert.equal(g.strat.huntsman(g.s, g.p[1]), g.p[2]);
});

test("the human Huntsman wakes once, and can skip", () => {
  const { s, p, e } = cfNight("huntsman-human", ["huntsman", null, "damsel"]);

  e.night();
  assert.equal(s.pending.role, "huntsman");
  e.choose([]);
  assert.ok(!p[0].huntsmanUsed);

  s.night = 2;
  e.night();
  e.choose([p[2].id]);
  assert.ok(p[0].huntsmanUsed);
  assert.equal(team(p[2].role), "townsfolk");
});

test("the Puzzlemaster's puzzle makes 1 player drunk; a right guess learns the Demon", () => {
  const { s, p, e } = cfNight("puzzle", [null, "puzzlemaster"]);

  e.puzzleDrunk();

  const drunk = byId(s, s.puzzle.drunkId);

  assert.ok(drunk && drunk !== p[1] && team(drunk.role) !== "demon");
  assert.equal(drunk.drunkFrom, "puzzlemaster");

  // Never a Minion or the Demon.
  for (let seed = 0; seed < 30; seed++) {
    const t = cfNight(`puzzle-good-${seed}`, [null, "puzzlemaster"]);

    t.e.puzzleDrunk();

    const x = byId(t.s, t.s.puzzle.drunkId);

    assert.equal(x.alignment, "good", `seed ${seed}`);
    assert.ok(!["minion", "demon"].includes(team(x.role)), `seed ${seed}`);
  }

  s.phase = "day";
  s.day = 1;

  const right = e.puzzleGuess(p[1], drunk);

  assert.ok(right.right);
  assert.match(right.text, /the Demon is Player 5\.$/);
  assert.equal(stanceOn(s, right, p[4], p[1]), "suspicious");

  // A wrong guess: false information (never the Demon).
  const g = cfNight("puzzle-wrong", [null, "puzzlemaster"]);

  g.e.puzzleDrunk();

  const other = g.s.players.find(
    (x) => !x.human && x !== g.p[1] && x.id !== g.s.puzzle.drunkId,
  );
  const wrong = g.e.puzzleGuess(g.p[1], other);

  assert.ok(!wrong.right);
  assert.notEqual(wrong.targets[0], g.p[4].id);
});

test("the human Puzzlemaster guesses once", () => {
  const { s, p, e } = cfNight("puzzle-human", ["puzzlemaster"]);

  e.puzzleDrunk();
  s.phase = "day";
  s.day = 1;
  assert.match(
    e.puzzlemaster(p[2].id),
    /^Puzzlemaster: guessed Player 3 is drunk; the Demon is Player \d+\.$/,
  );
  assert.throws(() => e.puzzlemaster(p[3].id), /Puzzlemaster unavailable/);
});

test("the Fisherman's advice is true, and comes once", () => {
  for (let seed = 0; seed < 30; seed++) {
    const { s, p, e } = cfNight(`fisher-${seed}`, ["fisherman"]);

    s.phase = "day";
    s.day = 1;

    const text = e.fisherman();
    const named = (re) => byId(s, `p${text.match(re)[1]}`);
    const all = () => [...text.matchAll(/Player (\d+)/g)].map((m) => byId(s, `p${m[1]}`));

    if (/ is evil\.$/.test(text)) {
      assert.equal(named(/Player (\d+) is evil/).alignment, "evil");
    } else if (/is good: /.test(text)) {
      assert.equal(named(/Player (\d+) is good/).alignment, "good");
    } else if (/are both good\.$/.test(text)) {
      assert.ok(all().every((x) => x.alignment === "good"), text);
    } else if (/The Demon is not one of /.test(text)) {
      assert.ok(all().every((x) => !team(x.role).includes("demon")), text);
    } else {
      assert.match(text, /The Demon is one of .*Player 5/);
    }

    assert.throws(() => e.fisherman(), /Fisherman unavailable/);
    assert.equal(p[0].memories.length, 1);
  }

  assert.equal(
    speak("Fisherman: the Storyteller's advice: Player 4 is evil."),
    "The Storyteller's advice: Player 4 is evil.",
  );
});

// A 10-player Trouble Brewing game for the Storyteller's day advice: you
// (the Washerwoman), 6 good NPCs (Player 6 the Recluse), then the Poisoner,
// Spy and Imp. `dead`: the seats (0-based) already dead.
function adviceGame(seed, dead = []) {
  const s = createState(script, 10, seed);
  const roles = ["washerwoman", "chef", "empath", "monk", "soldier", "recluse", "virgin", "poisoner", "spy", "imp"];

  s.players.forEach((x, i) => role(x, roles[i], alignment(roles[i])));
  dead.forEach((i) => (s.players[i].alive = false));
  s.phase = "day";
  s.day = 2;
  s.night = 2;

  return { s, p: s.players };
}

test("the Storyteller's advice grows more pointed as the game goes on, and with its lean", () => {
  // Day 1-ish, no lean: general.
  assert.equal(adviceLevel(adviceGame("adv-0").s), 0);

  // Halfway, evil ahead (the Storyteller helps good): one stage, plus one.
  const half = adviceGame("adv-1", [1, 2, 3, 4]).s;

  assert.equal(lean(half), "good");
  assert.equal(adviceLevel(half), 2);

  // Late, evil well ahead: the most pointed.
  const late = adviceGame("adv-2", [1, 2, 3, 4, 5, 6]).s;

  assert.equal(lean(late), "good");
  assert.equal(adviceLevel(late), 3);

  // Good ahead (the Storyteller helps evil): one less.
  const behind = adviceGame("adv-3", [1, 2, 7, 8]).s;

  assert.equal(lean(behind), "evil");
  assert.equal(adviceLevel(behind), 0);
});

test("the Fisherman's true advice: general early (good players), the Demon among 2 late when helping good, a misleading truth when helping evil", () => {
  for (let k = 0; k < 20; k++) {
    // Early: vouches for good players, never narrows down the Demon.
    let { s, p } = adviceGame(`fish-early-${k}`);

    s.r = rng(`fish-early-${k}`);

    let info = fishermanInfo(s, p[0], "truth");

    assert.match(info.text, /is good: don't execute them\.$|are both good\.$/);
    assert.ok(info.targets.every((id) => byId(s, id).alignment === "good"));
    assert.match(info.logNote, /^advice level 0 of 3/);

    // Late, the Storyteller helping good: the Demon is one of 2.
    ({ s, p } = adviceGame(`fish-late-${k}`, [1, 2, 3, 4, 5, 6]));
    s.r = rng(`fish-late-${k}`);
    info = fishermanInfo(s, p[0], "truth");
    assert.match(info.text, /The Demon is one of Player \d+ and Player \d+\.$/);
    assert.ok(info.targets.includes(p[9].id));

    // The Storyteller helping evil: the Recluse "is evil", or the Spy "is good".
    ({ s, p } = adviceGame(`fish-evil-${k}`, [1, 7, 8]));
    s.r = rng(`fish-evil-${k}`);
    assert.equal(lean(s), "evil");
    info = fishermanInfo(s, p[0], "truth");
    assert.match(info.text, new RegExp(`${p[5].label} is evil\\.$|${p[8].label} is good: `));
    assert.match(info.logNote, /that helps evil/);
  }
});

test("the Savant's true statement is as pointed as the advice level", () => {
  for (let k = 0; k < 20; k++) {
    let { s, p } = adviceGame(`savant-early-${k}`);

    role(p[0], "savant", "good");
    s.r = rng(`savant-early-${k}`);
    assert.match(savantInfo(s, p[0], "truth").logNote, /^advice level 0 of 3.*the true one is level 0/);

    ({ s, p } = adviceGame(`savant-late-${k}`, [1, 2, 3, 4]));
    role(p[0], "savant", "good");
    s.r = rng(`savant-late-${k}`);
    assert.match(savantInfo(s, p[0], "truth").logNote, /^advice level 2 of 3.*the true one is level 2/);
  }
});

test("the Artist: a Recluse registers as good when the Storyteller helps good, as evil otherwise", () => {
  const even = adviceGame("artist-even");

  assert.match(artistInfo(even.s, even.p[5], "evil", "truth").text, /: YES\.$/);

  const helping = adviceGame("artist-good", [1, 2, 3, 4]);

  assert.equal(lean(helping.s), "good");

  const info = artistInfo(helping.s, helping.p[5], "evil", "truth");

  assert.match(info.text, /: NO\.$/);
  assert.match(info.logNote, /leaning good, has Player 6 register as good/);
  // (The Spy, likewise, registers as evil.)
  assert.match(artistInfo(helping.s, helping.p[8], "evil", "truth").text, /: YES\.$/);
});

// A 10-player Day 1 with a Boomdandy marked for execution.
function boomDay(seed) {
  const s = createState(ec, 10, seed);
  const e = new Engine(s);
  const b = s.players.find(
    (x) => !x.human && x.alignment === "evil" && team(x.role) === "minion",
  );

  role(b, "boomdandy", "evil");
  s.phase = "day";
  s.day = 1;
  s.night = 1;
  s.block = { nomineeId: b.id, count: 9 };

  return { s, e, d: s.players.find((x) => team(x.role) === "demon") };
}

test("an executed Boomdandy leaves 3 alive, and the countdown kills the most pointed at", () => {
  const { s, e, d } = boomDay("boom");

  e.endDay();

  assert.ok(s.boom);
  assert.equal(e.alive().length, 3);
  assert.ok(e.alive().some((x) => x.human) && d.alive);
  assert.throws(() => e.endDay(), /Point at a player first/);

  // Everyone points at the Demon: good wins.
  e.strat.boomPoint = () => d;
  e.boomPoint(d.id);
  assert.ok(!s.boom);
  assert.equal(s.winner, "good");
});

test("a Boomdandy countdown that ties kills nobody, and night falls", () => {
  const { s, e } = boomDay("boom-tie");

  e.endDay();

  const [x, y] = e.alive().filter((p) => !p.human);

  // You point at x, x at y, y at you: 1 each, a tie.
  e.strat.boomPoint = (_, p) => (p === x ? y : p === y ? e.human() : null);
  e.boomPoint(x.id);
  assert.equal(e.alive().length, 3);
  assert.equal(s.winner, null);
  assert.equal(s.night, 2);
});

test("a Boomdandy countdown that runs out before you point counts only the NPCs", () => {
  const { s, e } = boomDay("boom-late");

  e.endDay();

  const [x, y] = e.alive().filter((p) => !p.human);

  // Nobody selected: you don't point; x and y both point at y.
  e.strat.boomPoint = () => y;
  e.boomPoint();
  assert.ok(!s.boom);
  assert.ok(!y.alive && x.alive);
  assert.ok(s.publicLog.some((l) => /You don't point; /.test(l.text ?? l)));
});

test("the Mathematician counts a Drunk's false information (their jinx)", () => {
  const { s, p, strat } = cfNight("math-jinx", [null, "mathematician", "drunk"]);
  const count = () => Number(nightInfo(s, p[1], strat).text.match(/(\d+)/)[1]);

  p[2].shown = "empath";

  const n = count();

  role(p[2], "butler", "good");
  assert.equal(count(), n - 1);
});

test("the Mathematician counts a Lunatic who attacked a player the Demon didn't (their jinx)", () => {
  const { s, p, strat } = cfNight("math-lunatic", [null, "mathematician", "lunatic"], 2);
  const count = () => Number(nightInfo(s, p[1], strat).text.match(/(\d+)/)[1]);

  s.lunaticPick = p[3].id;
  s.lunaticPickNight = 2;
  s.demonChose = { night: 2, ids: [p[3].id] };

  const n = count();

  s.demonChose = { night: 2, ids: [p[4].id] };
  assert.equal(count(), n + 1);
});

test("an Ogre who chooses the Recluse becomes evil and knows it; one who chooses the Spy becomes evil (their jinxes)", () => {
  const rec = cfNight("ogre-recluse", [null, "ogre", "recluse"]);

  rec.strat.ogre = () => rec.p[2];
  rec.e.ogres();
  assert.equal(rec.p[1].alignment, "evil");
  assert.ok(rec.p[1].toldEvil);

  const spy = cfNight("ogre-spy", [null, "ogre", null, "spy"]);

  spy.strat.ogre = () => spy.p[3];
  spy.e.ogres();
  assert.equal(spy.p[1].alignment, "evil");
  assert.ok(!spy.p[1].toldEvil);
});

test("the Recluse might register as the Demon to the Sage (their jinx)", () => {
  const { s, p } = cfNight("sage-recluse", [null, "sage", "recluse"], 2);
  const d = s.players.find((x) => team(x.role) === "demon");

  s.r = () => 0;
  assert.ok(sageInfo(s, p[1], "truth").targets.includes(p[2].id));
  assert.ok(!sageInfo(s, p[1], "truth").targets.includes(d.id));
});

test("the Cannibal learns they have the Butler ability; an executed Juggler's count goes to the Cannibal (their jinxes)", () => {
  const b = cfNight("cannibal-butler", ["cannibal", null, "butler"]);

  b.s.phase = "day";
  b.s.day = 1;
  b.p[2].alive = false;
  b.e.cannibals(b.p[2]);
  assert.match(b.s.privateLog.at(-1), /who was executed: the Butler\.$/);

  const j = cfNight("cannibal-juggler", [null, "cannibal", "juggler"]);

  j.s.phase = "day";
  j.s.day = 1;
  j.p[2].juggle = { night: 2, guesses: [{ id: j.p[3].id, role: j.p[3].role }] };
  j.p[2].alive = false;
  j.e.cannibals(j.p[2]);
  j.s.phase = "night";
  j.s.night = 2;
  j.e.jugglerNight();
  assert.equal(j.p[1].memories.at(-1).text, "Cannibal: 1 of Player 3's 1 guess was correct.");
});

test("a Mastermind the Vigormortis killed keeps their ability when it dies (their jinx)", () => {
  const { s, p, e } = cfNight("vigor-mastermind", [null, "mastermind", null, "vigormortis"], 2);

  p[1].alive = false;
  p[1].vigor = true;
  p[3].alive = false;
  e.vigormortisDeath(p[3]);
  assert.ok(p[1].vigor);
  s.day = 2;
  assert.ok(e.mastermindContinues());
});

test("a Goon the Pit-Hag made from an evil player never turns good (their jinx)", () => {
  const { s, p, e } = cfNight("pithag-goon", [null, null, null, "pithag"], 2);

  e.strat.pithag = () => ({ target: p[3], role: "goon" });
  e.pitHag();
  assert.equal(p[3].role, "goon");
  assert.equal(p[3].alignment, "evil");

  e.chose(p[1], p[3]);
  assert.equal(p[3].alignment, "evil");
  assert.ok(p[1].drunkTonight);
});

test("the Mathematician counts a Marionette (their jinx), whatever their ability did tonight", () => {
  const { s, p, strat } = cfNight("math-marionette-monk", [null, "mathematician", "marionette"], 2);
  const count = () => Number(nightInfo(s, p[1], strat).text.match(/(\d+)/)[1]);

  p[2].shown = "soldier";
  s.woke = [];

  const n = count();

  // (Kept simple: a Marionette is drunk, so always counts, Soldier or Monk.)
  p[2].shown = "monk";
  assert.equal(count(), n);
  assert.ok(n >= 1);
});

test("the Mathematician counts every living drunk or poisoned player, once each, whatever their ability did tonight", () => {
  const { s, p, strat } = cfNight("math-idle-poisoned", [null, "mathematician", "ravenkeeper", "empath"], 1);
  const count = () => Number(nightInfo(s, p[1], strat).text.match(/(\d+)/)[1]);
  const n = count();

  // A poisoned Ravenkeeper didn't wake, and still counts; so does a poisoned
  // Empath.
  p[2].poisoned = true;
  assert.equal(count(), n + 1);
  p[3].poisoned = true;
  assert.equal(count(), n + 2);

  // Poisoned and drunk: still 1.
  p[3].drunkTonight = true;
  assert.equal(count(), n + 2);

  // Dead: not counted.
  p[2].alive = false;
  assert.equal(count(), n + 1);
  assert.match(NOTES.mathematician, /every living player who is drunk or poisoned counts, once each/);
});

test("the Ravenkeeper never chooses you", () => {
  for (let seed = 0; seed < 50; seed++) {
    const { s, p, strat } = cfNight(`raven-human-${seed}`, [null, "ravenkeeper"], 2);

    for (const evil of [false, true]) {
      p[1].alignment = evil ? "evil" : "good";
      assert.ok(!strat.raven(s, p[1])?.human, `seed ${seed}${evil ? ", evil" : ""}`);
    }
  }
});

test("a Cannibal who eats the Pixie learns an in-play Townsfolk that night", () => {
  const { s, p, e, strat } = cfNight("cannibal-pixie", [null, "cannibal", "pixie"]);
  const other = s.script.ids.find(
    (id) => team(id) === "townsfolk" && !["pixie", "cannibal"].includes(id),
  );

  role(p[0], other, "good");
  s.phase = "day";
  s.day = 1;
  p[2].alive = false;
  e.cannibals(p[2]);
  assert.equal(p[1].gained, "pixie");

  s.phase = "night";
  s.night = 2;

  const info = nightInfo(s, p[1], strat);
  const seen = Object.keys(ROLES).find((id) => info.text === `Pixie: the ${name(id)} is in play.`);

  assert.ok(seen, info.text);
  assert.equal(team(seen), "townsfolk");
  assert.ok(s.players.some((x) => x !== p[1] && x.role === seen));
  // (Only that night.)
  s.night = 3;
  assert.equal(nightInfo(s, p[1], strat), null);
});

test("players the Barber swaps use their new abilities, a first-night one that night", () => {
  for (const day of [true, false]) {
    const { s, p, e, strat } = cfNight(`barber-swap-${day}`, [null, "barber", "chef", "empath", "imp"], 2);

    e.strat.barber = () => [p[2], p[3]];

    if (day) {
      // (A Barber who died by day: the swap is at the start of the night.)
      s.barberPending = p[1].id;
      e.barberNight();
    } else {
      e.barberSwap(p[1]);
    }

    assert.equal(p[2].role, "empath");
    assert.equal(p[3].role, "chef");
    assert.match(nightInfo(s, p[2], strat).text, /^Empath number: /);
    assert.match(nightInfo(s, p[3], strat).text, /^Chef number: /);

    // (The Chef's only that night; the Empath's every night.)
    s.night = 3;
    assert.equal(nightInfo(s, p[3], strat), null);
    assert.match(nightInfo(s, p[2], strat).text, /^Empath number: /);
  }
});

test("first-night abilities start the night the Pit-Hag makes them", () => {
  const made = (seed, target, role_) => {
    const g = cfNight(seed, [null, "empath", null, "pithag", "poisoner"], 2);

    g.p[3].poisoned = false;
    g.e.strat.pithag = () => ({ target: g.p[target], role: role_ });
    g.e.pitHag();

    return g;
  };

  // A Chef learns their number tonight.
  const chef = made("pithag-chef", 1, "chef");

  assert.match(nightInfo(chef.s, chef.p[1], chef.strat).text, /^Chef number: /);

  // A Widow looks at the Grimoire and poisons tonight.
  const widow = made("pithag-widow", 4, "widow");

  assert.ok(widow.s.widowGrimoire);
  assert.ok(widow.s.players.some((x) => x.memories.some((m) => m.text === "Widow: a Widow is in play.")));

  // A Godfather learns the Outsiders in play.
  const gf = made("pithag-godfather", 4, "godfather");

  assert.ok(Array.isArray(gf.p[4].knownOutsiders));

  // A Puzzlemaster's puzzle starts.
  const pm = made("pithag-puzzle", 1, "puzzlemaster");

  assert.equal(pm.s.puzzle?.byId, pm.p[1].id);
});

test("a Cannibal who eats the Ogre chooses that night", () => {
  const { s, p, e } = cfNight("cannibal-ogre", [null, "cannibal", "ogre", "poisoner", "imp"]);

  s.phase = "day";
  s.day = 1;
  p[2].alive = false;
  e.cannibals(p[2]);
  s.phase = "night";
  s.night = 2;
  e.strat.ogre = () => p[3];
  e.ogres();
  assert.equal(p[1].alignment, "evil");

  // (Once.)
  p[1].alignment = "good";
  e.ogres();
  assert.equal(p[1].alignment, "good");
});

test("the Demon's Barber swap helps evil: a strong ability off a believed player, onto a doubted one", () => {
  const { s, p, e, strat } = cfNight("barber-evil", [null, "empath", "saint", "poisoner", "imp"], 2);

  p.forEach((x) => !x.human && e.claimPublicly(x));
  // The town believes the Empath, and doubts the player claiming the Saint.
  s.confirmed = { [p[1].id]: { level: "likely" } };
  s.scapegoat = p[2].id;
  assert.deepEqual(strat.barber(s, p[4]), [p[1], p[2]]);
  assert.match(p[4].barberWhy, /evil gains/);

  // With nothing to gain (both alike, equally believed), no swap.
  role(p[2], "empath", "good");
  p[2].claim = "empath";
  e.claimPublicly(p[2]);
  s.confirmed = {};
  s.scapegoat = null;
  assert.equal(strat.barber(s, p[4]), null);
  assert.match(p[4].barberWhy, /no swap helps evil enough/);
});

test("the NPCs' votes stand once the count starts; your hand can change until it's cast", () => {
  const s = createState(script, 10, "vote-live");
  const e = new Engine(s);

  e.start();
  s.phase = "day";
  s.day = 1;

  const n = s.players.find((x) => !x.human);

  e.nominate(n.id, null);

  const before = e.openVote(false);
  const mine = (records) => records.find((r) => r.playerId === s.humanId);

  assert.equal(mine(before).attempted, false);
  // Raising your hand changes only your record.
  const after = e.openVote(true);

  assert.equal(mine(after).attempted, true);
  assert.deepEqual(
    after.filter((r) => r.playerId !== s.humanId).map((r) => r.attempted),
    before.filter((r) => r.playerId !== s.humanId).map((r) => r.attempted),
  );

  // Cast with your hand up: the NPCs' votes are the ones decided above.
  const result = e.castVotes(true);

  assert.deepEqual(
    result.records.map((r) => r.attempted),
    after.map((r) => r.attempted),
  );
  assert.equal(result.count, after.filter((r) => r.counted).length);
});

test("a Pit-Hag's Damsel tells the Minions she's in play", () => {
  const { s, p, e } = cfNight("pithag-damsel", [null, null, null, "pithag"], 2);

  e.strat.pithag = () => ({ target: p[1], role: "damsel" });
  e.pitHag();

  assert.ok(s.damselKnown);
  assert.equal(s.players.filter((x) => x.role === "damsel").length, 1);
  assert.equal(s.players.find((x) => x.role === "damsel").alignment, "good");
});

test("evil NPCs bluff the Fisherman, Puzzlemaster and Huntsman, with made-up information", () => {
  // The Baron (Player 4) bluffs each in turn.
  const fish = cfNight("bluff-fisher");

  fish.p[3].claim = "fisherman";
  fish.s.phase = "day";
  fish.s.day = 2;
  fish.strat.fisherman = () => true;
  fish.e.npcFishermen();
  assert.match(fish.p[3].memories[0].text, /^Fisherman: the Storyteller's advice: /);
  assert.equal(fish.p[3].memories[0].functioning, false);
  assert.ok(fish.p[3].fishermanUsed);

  // (Its "tip" is false: never naming its own team as evil, nor the Demon among 3.)
  const tip = fish.p[3].memories[0].text;
  assert.ok(!/Player 5 is evil|The Demon is one of .*Player 5/.test(tip), tip);

  const puzzle = cfNight("bluff-puzzle");

  puzzle.p[3].claim = "puzzlemaster";
  puzzle.s.phase = "day";
  puzzle.s.day = 2;
  puzzle.strat.puzzle = () => puzzle.p[1];
  puzzle.e.npcPuzzlemasters();
  assert.match(puzzle.p[3].memories[0].text, /^Puzzlemaster: guessed Player 2 is drunk; the Demon is Player \d\.$/);
  assert.notEqual(puzzle.p[3].memories[0].targets[0], puzzle.p[4].id);

  const hunt = cfNight("bluff-hunt", [null, null, "damsel"]);

  hunt.p[3].claim = "huntsman";
  hunt.strat.huntsman = () => hunt.p[2];
  hunt.e.huntsmen();
  assert.equal(hunt.p[3].memories[0].text, "Huntsman: chose Player 3.");
  // (To no effect: she's still the Damsel.)
  assert.equal(hunt.p[2].role, "damsel");
});

test("a Damsel bluffer hides behind a Townsfolk claim, with that Townsfolk's information", () => {
  let bluffers = 0;

  for (let seed = 0; seed < 300 && bluffers < 5; seed++) {
    const s = createState(ec, 12, `damsel-bluff-${seed}`);
    const p = s.players.find((x) => x.alignment === "evil" && x.bluff === "damsel");

    if (!p) {
      continue;
    }

    bluffers++;
    assert.equal(team(p.claim), "townsfolk");

    const e = new Engine(s);

    e.start();
    settle(e);

    // They report what their claimed Townsfolk would learn (if anything).
    const info = p.memories.filter((m) => m.role === p.claim);

    if (["investigator", "empath", "dreamer", "mathematician", "pixie"].includes(p.claim)) {
      assert.ok(info.length, `${p.claim} (seed ${seed})`);
    }

    // No Damsel is in play (she's their bluff), so the Minions never guess.
    assert.ok(!s.damselKnown);
  }

  assert.ok(bluffers > 0);
});

test("the Damsel tells a Huntsman she doesn't suspect, and good players keep her secret", () => {
  const { s, p, strat } = cfNight("damsel-huntsman", [null, "huntsman", "damsel"]);
  const said = (to) => strat.answer(s, p[2], to).claim;

  p[2].claim = "chef";
  // (Her hunch is someone else.)
  p[2].suspicion = { targetId: p[4].id };

  // To anyone else, her cover.
  assert.equal(said(p[3]), "chef");

  // The Huntsman told her who they are: she tells them.
  (p[2].toldMe ??= {})[p[1].id] = { claim: "huntsman", day: 1, at: 1 };
  assert.equal(said(p[1]), "damsel");
  strat.told(s, p[2], p[1]);
  assert.equal(strat.huntsman(s, p[1]), p[2]);

  // ...who doesn't pass it on.
  strat.told(s, p[1], p[3]);
  assert.notEqual(p[3].secondHand?.[p[2].id]?.claim, "damsel");

  // Not to a Huntsman she suspects.
  p[2].suspicion = { targetId: p[1].id };
  assert.equal(said(p[1]), "chef");
});

test("Minions find the Damsel through a teammate bluffing the Huntsman, and guess at once", () => {
  const { s, p, strat, e } = cfNight("damsel-fished", [null, null, "damsel"]);

  e.damselKnown();
  s.day = 3;
  p[2].claim = "chef";
  p[4].claim = "huntsman";
  (p[4].toldMe ??= {})[p[2].id] = { claim: "damsel", day: 1, at: 1 };

  // The Baron hasn't heard it himself, but his teammate has.
  assert.equal(strat.damselGuess(s, p[3]), p[2]);
  // (The bluffer doesn't "use" the Huntsman on her.)
  assert.notEqual(strat.huntsman(s, p[4]), p[2]);
});

test("the log says why a Minion guessed the Damsel, and why the Huntsman chose who they did", () => {
  const logged = (s, type) => s.audit.filter((a) => a.type === type).at(-1).text;
  const fished = cfNight("damsel-why-fished", [null, null, "damsel"]);

  fished.e.damselKnown();
  fished.s.phase = "day";
  fished.s.day = 3;
  fished.p[4].claim = "huntsman";
  (fished.p[4].toldMe ??= {})[fished.p[2].id] = { claim: "damsel", day: 1, at: 1 };
  fished.e.npcDamselGuesses();
  assert.match(
    logged(fished.s, "damsel"),
    /\(why: they told their teammate Player 5, bluffing as the Huntsman, that they're the Damsel\)/,
  );

  // A late guess says how it narrowed it down.
  const late = cfNight("damsel-why-late", [null, null, "damsel"]);

  late.e.damselKnown();
  late.s.phase = "day";
  late.s.day = 3;
  late.s.r = () => 0;
  late.p[2].claim = "saint";
  late.p[2].claimKnown = true;
  late.p.slice(5).forEach((x) => (x.alive = false));
  assert.equal(late.strat.damselGuess(late.s, late.p[3]), late.p[2]);
  assert.match(late.p[3].damselWhy, /a late guess .*they claim the Saint, an Outsider/);

  const hunt = cfNight("huntsman-why", [null, "huntsman", "damsel"]);

  (hunt.p[1].toldMe ??= {})[hunt.p[2].id] = { claim: "damsel", day: 1, at: 1 };
  hunt.e.huntsmen();
  assert.match(hunt.s.audit.find((x) => x.type === "huntsman").text, /chose Player 3 \(why: they said they're the Damsel\), the Damsel/);
});

test("Minions don't guess the Damsel before Day 3, unless their Demon is about to be executed", () => {
  const { s, p, e, strat } = cfNight("damsel-wait", [null, null, "damsel"]);
  const d = s.players.find((x) => team(x.role) === "demon");

  e.damselKnown();
  p[2].claim = "damsel";
  p[2].claimKnown = true;
  s.r = () => 0;

  for (const day of [1, 2]) {
    s.day = day;
    assert.equal(strat.damselGuess(s, p[3]), null, `Day ${day}`);
  }

  s.day = 3;
  assert.equal(strat.damselGuess(s, p[3]), p[2]);
  delete p[3].damselWhy;

  // Day 1, with the Demon marked for execution: a last-chance guess at End
  // day, before the execution, without the chances. Right, so evil wins.
  s.day = 1;
  s.phase = "day";
  s.r = () => 0.99;
  s.block = { nomineeId: d.id, count: 9 };
  e.endDay();
  assert.equal(s.winner, "evil");
  assert.ok(d.alive);
  assert.ok(
    s.audit
      .find((x) => x.type === "damsel" && / guessed /.test(x.text))
      .text.includes(
        `(why: their Demon, ${d.label}, is about to be executed (a last chance): they said they're the Damsel)`,
      ),
  );
});

test("Round Robin: once, with 4 or fewer alive, everyone says their character and information in public", () => {
  const { s, p, e } = cfNight("round-robin", [null, "chef", "damsel", "baron"]);

  s.phase = "day";
  s.day = 2;
  p[1].cover = { kind: "hide", as: "soldier", night: 1, memories: [] };
  p[1].memories = [{ night: 1, text: "Chef: 1 pair of evil players." }];
  p[2].cover = { kind: "hide", as: "monk", night: 1, memories: [] };
  p[3].claim = "empath";
  p[3].bluff = "empath";
  p.slice(4).forEach((x) => (x.alive = false));

  // Not before nominations open.
  assert.equal(e.roundRobinReady(), false);
  assert.throws(() => e.roundRobin(), /nominations open/);

  s.nominationsOpen = true;

  const lines = e.roundRobin();
  const of = (x) => lines.find((l) => l.includes(`${x.label}`) && !l.startsWith("Day 2 — Round Robin"));

  // Everyone, living or dead, from Seat 1 (you first).
  assert.equal(lines.length, p.length + 1);
  assert.match(lines[1], /^Day 2 — You: "I am the /);
  assert.ok(p[0].claimKnown);
  // A good NPC comes clean, with their information.
  assert.match(of(p[1]), /comes clean: "I was hiding as the Soldier; I'm really the Chef\.\nNight 1: /);
  // A living Damsel and an evil NPC keep to their bluffs.
  assert.match(of(p[2]), /: "I am the Monk\."/);
  assert.match(of(p[3]), /: "I am the Empath\./);
  assert.ok(s.liesToYou.some((l) => l.byId === p[3].id && l.said === "empath"));
  assert.equal(s.phaseCards.at(-1).kind, "roundrobin");
  // In the Public Log as one entry, in seat order.
  assert.equal(s.publicLog.at(-1), [lines[0], ...lines.slice(1).map((x) => x.replace(/^Day 2 — /, ""))].join("\n"));
  assert.ok(!s.publicLog.slice(0, -1).some((x) => lines.includes(x)));

  // Once per game.
  assert.equal(e.roundRobinReady(), false);
  assert.throws(() => e.roundRobin(), /has been used/);
});

test("a good NPC may claim the Damsel as a decoy, and tells a Huntsman the truth", () => {
  const s = createState(ec, 10, "decoy");
  const strat = new SimpleStrategy();
  const good = s.players.filter(
    (x) =>
      !x.human &&
      x.alignment === "good" &&
      x.role !== "damsel" &&
      DEMON_KILL_PRIORITY[x.claim] !== "high",
  );
  const [a, b] = good;
  const r = s.r;

  s.day = 1;
  s.r = () => 0;
  a.cover = strat.coverFor(s, a);
  // (Only one decoy.)
  assert.notEqual(strat.coverFor(s, b)?.kind, "decoy");
  s.r = r;

  assert.deepEqual(a.cover, { kind: "decoy", as: "damsel", night: s.night });
  assert.equal(strat.answer(s, a, b).claim, "damsel");

  (a.toldMe ??= {})[b.id] = { claim: "huntsman", day: 1, at: 1 };
  assert.equal(strat.answer(s, a, b).claim, a.claim);
});

test("the evil team nominates and votes for its Boomdandy from Day 2, while the Demon is unsuspected", () => {
  const { s, p, strat } = cfNight("boom-push", [null, null, null, "boomdandy"]);

  s.phase = "day";
  s.nominated = [];
  s.day = 1;
  assert.equal(strat.boomPush(s, p[4]), null);

  s.day = 2;
  assert.equal(strat.boomPush(s, p[4]), p[3]);
  assert.equal(strat.nomination(s, p[4]).target, p[3]);
  // (Never the Boomdandy themself, nor a good player.)
  assert.equal(strat.boomPush(s, p[3]), null);
  assert.equal(strat.boomPush(s, p[1]), null);

  let yes = 0;

  for (let i = 0; i < 200; i++) {
    yes += strat.vote(s, p[4], p[3], { yes: 0, needed: 3 }) ? 1 : 0;
  }

  assert.ok(yes > 150, `${yes}`);

  // With the Demon under suspicion, nobody evil nominates them.
  for (const x of s.players.filter((y) => y.alignment === "good" && !y.human)) {
    x.suspicion = { targetId: p[4].id };
  }

  assert.equal(strat.boomPush(s, p[4]), null);
});

test("a Damsel the Huntsman found says so in public at dawn, and the Minions stop guessing", () => {
  const { s, p, e, strat } = cfNight("damsel-saved", [null, "huntsman", "damsel"]);

  p[1].claimKnown = true;
  p[2].claim = "chef";
  e.damselKnown();
  strat.huntsman = (_, x) => (x === p[1] ? p[2] : null);
  e.night();

  const line = s.publicLog.find((l) => /I was the Damsel/.test(l));

  assert.match(
    line,
    new RegExp(
      `^Day 1 — Player 3: "I was the Damsel, hiding as the Chef\\. The Huntsman chose me last night, and I woke up as the ${name(p[2].role)}\\."$`,
    ),
  );
  assert.equal(p[2].claim, p[2].role);
  assert.notEqual(p[2].role, "chef");
  assert.equal(s.confirmed[p[2].id].level, "maybe");
  assert.equal(s.confirmed[p[1].id].level, "maybe");

  // The Minions know there's no Damsel left.
  p[3].claim = "baron";
  assert.equal(strat.damselGuess(s, p[3]), null);

  // When asked, she says what she was.
  assert.match(strat.ask(s, p[2]), /before that I was the Damsel\./);
});

test("an evil Grandmother bluffer names their teammate as the character they claim", () => {
  for (let seed = 0; seed < 10; seed++) {
    const s = bluffNight(`gran-bluff-${seed}`);
    const [, , , minion, imp] = s.players;

    role(minion, "baron", "evil");
    minion.claim = "monk";
    imp.claim = "grandmother";

    const info = bluffTonight(s, imp, new SimpleStrategy());

    assert.equal(info.text, `Grandmother: your grandchild is ${minion.label}, the Monk.`);
  }
});

test("the Lunatic never votes to execute themself", () => {
  const s = base("lunatic-self-vote");
  const lunatic = s.players[1];
  const strat = new SimpleStrategy();

  role(lunatic, "lunatic", "good");
  lunatic.lunaticTeam = [s.players[4].id];
  s.r = () => 0;

  assert.equal(strat.vote(s, lunatic, lunatic, { yes: 2, needed: 3 }), false);
});

test("an evil NPC doesn't vote for a teammate when it would tie the player marked", () => {
  const s = base("teammate-tie");
  const [, chef, , baron, imp] = s.players;
  const strat = new SimpleStrategy();

  s.r = () => 0;

  // Their vote can't mark the Imp (4 needed), but it ties the Chef's 3.
  s.block = { nomineeId: chef.id, count: 3 };
  assert.equal(strat.vote(s, baron, imp, { yes: 2, needed: 4 }), false);

  // With nobody marked (already a tie), it changes nothing.
  s.block = { nomineeId: null, count: 3 };
  assert.equal(strat.vote(s, baron, imp, { yes: 2, needed: 4 }), true);
});

test("the debug log's Claims column shows a madness", () => {
  const s = bluffNight("mad-log");
  const chef = s.players[1];

  role(s.players[3], "cerenovus", "evil");

  const strat = new SimpleStrategy();

  strat.cerenovus = () => ({ target: chef, role: "mayor" });
  strat.demon = () => null;

  const e = new Engine(s, strat);

  e.start();
  e.snapshot("test");

  const row = s.audit.findLast((a) => a.type === "state").data.players[1];

  assert.equal(row.claim, "chef");
  assert.equal(row.mad, "mayor");
});

test("a player killed the night they're made mad as the Ravenkeeper comes clean at dawn", () => {
  const s = bluffNight("mad-raven");
  const [, chef, , , imp] = s.players;

  role(s.players[3], "cerenovus", "evil");

  const strat = new SimpleStrategy();
  // Night 2, the Chef; Night 3, the Imp (who passes the Demon on).
  const target = () => ({ 2: chef, 3: imp })[s.night] ?? null;

  strat.cerenovus = () => target() && { target: target(), role: "ravenkeeper" };
  strat.demon = target;

  const e = new Engine(s, strat);

  e.start();
  e.endDay();
  settle(e);

  assert.ok(!chef.alive);
  assert.ok(
    s.publicLog.includes(
      `Day 2 — ${chef.label} says: "The Cerenovus made me mad as the Ravenkeeper last night, but I was killed. I am actually the Chef."`,
    ),
  );
  assert.equal(chef.claim, "chef");
  assert.equal(chef.mad, null);
  assert.ok(!chef.memories.some((m) => m.role === "ravenkeeper"));
  assert.ok(!s.publicLog.some((x) => x.includes("I am the Ravenkeeper")));

  // An evil player comes clean with their bluff.
  imp.claim = "monk";
  e.endDay();
  settle(e);

  assert.ok(
    s.publicLog.includes(
      `Day 3 — ${imp.label} says: "The Cerenovus made me mad as the Ravenkeeper last night, but I was killed. I am actually the Monk."`,
    ),
  );
});

test("when a madness ends, the player explains it to whoever they told", () => {
  const s = bluffNight("mad-explain");
  const [, chef, butler] = s.players;

  role(s.players[3], "cerenovus", "evil");

  const strat = new SimpleStrategy();

  strat.cerenovus = () => (s.night === 1 ? { target: chef, role: "mayor" } : null);
  strat.demon = () => null;

  const e = new Engine(s, strat);

  e.start();
  e.ask(chef.id);
  strat.told(s, chef, butler);
  assert.equal(butler.toldMe[chef.id].claim, "mayor");

  e.endDay();
  settle(e);

  assert.ok(
    s.publicLog.includes(
      `Day 2 — ${chef.label} tells you: "Yesterday the Cerenovus made me mad as the Mayor, I am actually the Chef."`,
    ),
  );
  assert.equal(butler.toldMe[chef.id].claim, "chef");
  assert.deepEqual(chef.madAbout, ["mayor"]);

  // The changed story counts for less, as if they'd come clean.
  const before = strat.evidence(s, butler, chef).score;

  chef.madAbout = [];
  assert.equal(
    Math.round((strat.evidence(s, butler, chef).score - before) * 100) / 100,
    Math.round((EVIDENCE_WEIGHT.changedStory - EVIDENCE_WEIGHT.changedStoryCleared) * 100) / 100,
  );
});

test("an Amnesiac says what they guessed and what the Storyteller said; bluffers guess too", () => {
  assert.equal(
    speak('Amnesiac: guessed "Each night, you learn a good player.": HOT.'),
    'I guessed my ability is "Each night, you learn a good player."\nAnd I got: HOT.',
  );
  assert.equal(
    speak('Amnesiac: guessed "Each night, you learn a good player.": BINGO.'),
    'I guessed my ability is "Each night, you learn a good player."\nAnd I got: BINGO!',
  );
  assert.equal(
    speak('Amnesiac: asked "Is my ability about the Demon?": NO.'),
    'I asked the Storyteller "Is my ability about the Demon?"\nAnd I got: NO.',
  );

  const { s, p, e } = cfNight("amnesiac-bluffer", [null, null, null, null, "imp"]);

  p[4].claim = "amnesiac";
  s.phase = "day";
  s.day = 1;
  e.npcAmnesiacs();

  assert.match(p[4].memories.at(-1).text, /^Amnesiac: guessed ".+": (BINGO|HOT|WARM|COLD)\.$/);
});

test("an evil Savant bluffer's statements never hurt their team and are never repeated", () => {
  let truths = 0;

  for (let seed = 0; seed < 40; seed++) {
    const s = base(`savant-bluff-${seed}`);
    const [, chef, butler, baron, imp] = s.players;

    baron.claim = "monk";
    imp.claim = "savant";

    const all = [];

    for (let day = 1; day <= 4; day++) {
      s.day = day;

      const info = savantBluff(s, imp);
      const said = [...info.text.matchAll(/"([^"]+)"/g)].map((m) => m[1]);

      assert.equal(said.length, 2);
      assert.equal(info.functioning, false);
      all.push(...said);
    }

    assert.equal(new Set(all).size, all.length, all.join(" | "));

    for (const x of all) {
      // Never a teammate evil, or anyone the Baron or Imp; the Baron only
      // ever the Monk he claims.
      assert.ok(!x.startsWith(`${baron.label} is evil`) && !x.startsWith(`${imp.label} is`), x);
      assert.ok(!/is the (Baron|Imp)\.$/.test(x), x);
      assert.ok(!x.startsWith(`${baron.label} is the `) || x.endsWith("the Monk."), x);

      // The Demon is only ever misplaced, and never put next to the Baron.
      const near = /^The Demon is (not )?a neighbour of (.+)\.$/.exec(x);

      if (near) {
        const who = s.players.find((p) => p.label === near[2]);
        const n = [s.players.at(s.players.indexOf(who) - 1), s.players[(s.players.indexOf(who) + 1) % 5]];

        assert.equal(n.includes(imp), Boolean(near[1]), x);
        assert.ok(near[1] || !n.includes(baron), x);
      }

      truths += [`${chef.label} is good.`, `${butler.label} is good.`, "There is 1 Outsider in play."].includes(x);
    }
  }

  // Some are true.
  assert.ok(truths > 0);
});

test("a script's night order lists its characters in the official order, with the night's steps", () => {
  const tb = nightOrder(script.map((x) => x.id ?? x).filter((id) => id !== "_meta"));
  const first = tb.first.map((x) => x.id);
  const other = tb.other.map((x) => x.id);

  assert.deepEqual(first, [
    "dusk",
    "minioninfo",
    "demoninfo",
    "poisoner",
    "washerwoman",
    "librarian",
    "investigator",
    "chef",
    "empath",
    "fortuneteller",
    "butler",
    "spy",
    "dawn",
  ]);
  assert.deepEqual(other, [
    "dusk",
    "poisoner",
    "monk",
    "scarletwoman",
    "imp",
    "ravenkeeper",
    "empath",
    "fortuneteller",
    "undertaker",
    "butler",
    "spy",
    "dawn",
  ]);
  assert.ok(tb.first.every((x) => x.text));

  // Every character it names is one the game has.
  for (const [id] of [...FIRST_NIGHT, ...OTHER_NIGHTS]) {
    assert.ok(id in ROLES || id in NIGHT_STEPS, id);
  }
});

test("you can be the Philosopher: you choose a good character, and use a night ability you gain that night", () => {
  assert.ok(!FORBIDDEN_HUMAN.has("philosopher"));

  const { s, p, e } = cfNight("human-philosopher", ["philosopher", "fortuneteller"]);

  e.night();

  assert.equal(s.pending.role, "philosopher");
  assert.ok(s.pending.characters.includes("fortuneteller"));
  assert.ok(!s.pending.characters.includes("philosopher"));
  assert.ok(s.pending.characters.every((id) => alignment(id) === "good" && !FORBIDDEN_HUMAN.has(id)));

  e.choose([], "fortuneteller");

  // The Fortune Teller in play is drunk, and you wake again as one.
  assert.equal(p[0].gained, "fortuneteller");
  assert.equal(p[1].drunkFrom, "philosopher");
  assert.equal(s.pending.role, "fortuneteller");

  e.choose([p[2].id, p[4].id]);

  assert.equal(s.pending, null);
  assert.ok(p[0].memories.some((m) => m.text === "Philosopher: gained the Fortune Teller ability."));
  assert.ok(p[0].memories.some((m) => /^Fortune Teller: (YES|NO) for /.test(m.text)));
});

test("you can skip the Philosopher's choice, and are asked again the next night", () => {
  const { s, e } = cfNight("human-philosopher-skip", ["philosopher"]);

  e.night();
  assert.equal(s.pending.role, "philosopher");
  e.choose([]);
  assert.equal(s.pending, null);

  e.endDay();
  assert.equal(s.pending?.role, "philosopher");
});

test("you're never dealt the Barber", () => {
  assert.ok(FORBIDDEN_HUMAN.has("barber"));
});

test("an evil Cannibal bluffer gains the executee's character as best they know it", () => {
  const setup = (minion) => {
    const s = base(`cannibal-bluff-${minion}`);
    const [, chef, , m, imp] = s.players;

    role(m, minion, "evil");
    m.claim = "cannibal";
    imp.claim = "monk";

    // The Chef said in public they're the Empath.
    chef.claim = "empath";
    chef.claimKnown = true;
    chef.publicClaim = "empath";

    return { s, chef, m, imp, e: new Engine(s) };
  };

  // A working Spy sees the Grimoire: the Chef's real character.
  {
    const { chef, m, e } = setup("spy");

    e.cannibals(chef);
    assert.equal(gainedRole(m), "chef");
  }

  // The Widow saw it on Night 1.
  {
    const { chef, m, e } = setup("widow");

    e.cannibals(chef);
    assert.equal(gainedRole(m), "chef");
  }

  // Anyone else: what they heard the executee claim.
  {
    const { chef, m, e } = setup("baron");

    e.cannibals(chef);
    assert.equal(gainedRole(m), "empath");
  }

  // A teammate: their bluff, as a real Cannibal would be told.
  {
    const { imp, m, e } = setup("spy");

    e.cannibals(imp);
    assert.equal(gainedRole(m), "monk");
  }
});

// ── Trust Redux ──────────────────────────────────────────────

// A 5-player Night `night` on Trust Redux (see base()), with these roles.
function trNight(seed, roles = [], night = 1) {
  const s = base(seed, tr);

  roles.forEach((id, i) => id && role(s.players[i], id, alignment(id)));
  s.phase = "night";
  s.night = night;
  s.day = night - 1;

  const strat = new SimpleStrategy();

  strat.demon = () => null;

  return { s, p: s.players, strat, e: new Engine(s, strat) };
}

test("Trust Redux loads, with its 5 new characters, and the jinxes between them", () => {
  const s = createState(tr, 10, "tr");

  assert.equal(s.script.meta.name, "Trust Redux");
  assert.equal(s.script.ids.length, 24);

  for (const id of ["highpriestess", "villageidiot", "magician", "mezepheles", "legion"]) {
    assert.ok(s.script.ids.includes(id), id);
  }

  const on = JINXES.filter((j) => j.ids.every((id) => s.script.ids.includes(id)));

  assert.deepEqual(
    on.map((j) => j.ids.join("&")).sort(),
    ["magician&legion", "magician&marionette"],
  );
});

test("you're never dealt the Magician", () => {
  assert.ok(FORBIDDEN_HUMAN.has("magician"));

  for (let seed = 0; seed < 200; seed++) {
    assert.notEqual(createState(tr, 8 + (seed % 8), `mag-${seed}`).players[0].role, "magician");
  }
});

test("the Village Idiot brings 0 to 2 more; with more than 1, one of them is drunk", () => {
  const counts = new Set();

  for (let seed = 0; seed < 300; seed++) {
    const s = createState(tr, 12, `vi-${seed}`);
    const vis = s.players.filter((p) => p.role === "villageidiot");

    if (!vis.length) {
      continue;
    }

    counts.add(vis.length);
    assert.equal(
      vis.filter((p) => p.drunkFrom === "villageidiot").length,
      vis.length > 1 ? 1 : 0,
      `seed ${seed}`,
    );
  }

  assert.deepEqual([...counts].sort(), [1, 2, 3]);
});

test("the Village Idiot learns a player's alignment; drunk, the wrong one; several don't count as a double claim", () => {
  const { s, p, strat } = trNight("vi-info", [null, "villageidiot", "villageidiot"]);

  strat.villageIdiot = () => p[4];

  const info = nightInfo(s, p[1], strat);

  assert.equal(info.text, `Village Idiot: ${p[4].label} is evil.`);
  assert.equal(stanceOn(s, info, p[4], p[1]), "suspicious");

  // Drunk, a lie says the Imp is good (a random answer may say either).
  p[1].drunkFrom = "villageidiot";

  if (infoMode(s, p[1]) === "lie") {
    assert.equal(nightInfo(s, p[1], strat).text, `Village Idiot: ${p[4].label} is good.`);
  }

  // (Two players claiming the Village Idiot isn't held against either.)
  p[1].claimKnown = true;
  p[2].claimKnown = true;
  assert.ok(!strat.evidence(s, p[3], p[1]).reasons.some((x) => /both claim/.test(x)));
});

test("you can be the Village Idiot: you choose a player each night", () => {
  assert.ok(!FORBIDDEN_HUMAN.has("villageidiot"));

  const { s, p, e } = trNight("vi-human", ["villageidiot"]);

  e.night();
  assert.equal(s.pending?.role, "villageidiot");
  e.choose([p[3].id]);

  const m = p[0].memories.find((x) => x.role === "villageidiot");

  assert.deepEqual(m.targets, [p[3].id]);
});

test("the High Priestess learns a living NPC to talk to", () => {
  for (let seed = 0; seed < 20; seed++) {
    const { s, p, strat } = trNight(`hp-${seed}`, [null, "highpriestess"]);
    const info = nightInfo(s, p[1], strat);
    const t = byId(s, info.targets[0]);

    assert.match(info.text, /^High Priestess: talk to Player \d+\.$/);
    assert.ok(t.alive && !t.human && t !== p[1]);
  }
});

test("Legion: most players are Legion, with no Minions, and you're good", () => {
  const raw = tr.filter((x) => !["imp", "vigormortis"].includes(x.id));

  for (const seats of [8, 10, 12, 15]) {
    const s = createState(raw, seats, `legion-${seats}`);
    const legion = s.players.filter((p) => p.role === "legion");

    assert.equal(legion.length, Math.floor(seats / 2) + 1);
    assert.ok(!s.players.some((p) => team(p.role) === "minion"));
    assert.ok(legion.every((p) => p.alignment === "evil" && !p.human));
  }
});

test("Legion share half as many bluffs as there are Legion, 1 an Outsider when the game has Outsiders", () => {
  const raw = tr.filter((x) => !["imp", "vigormortis"].includes(x.id));

  for (const seats of [8, 9, 10, 11, 12, 13, 14, 15]) {
    for (let seed = 0; seed < 10; seed++) {
      const s = createState(raw, seats, `legion-bluffs-${seats}-${seed}`);
      const legion = s.players.filter((p) => p.role === "legion");
      const outsiders = s.players.filter((p) => team(p.role) === "outsider").length;
      const bluffOutsiders = s.demonBluffs.filter((id) => team(id) === "outsider").length;
      const inPlay = new Set(s.players.map((p) => p.role));
      // (The Drunk and Lunatic are never bluffs: with every other Outsider
      // in play, there's none to give.)
      const spare = s.script.ids.some(
        (id) => team(id) === "outsider" && !["drunk", "lunatic"].includes(id) && !inPlay.has(id),
      );

      assert.equal(s.demonBluffs.length, Math.ceil(legion.length / 2), `${seats} seats`);
      assert.equal(bluffOutsiders, outsiders && spare ? 1 : 0, `${seats} seats`);
      assert.ok(s.demonBluffs.every((id) => !inPlay.has(id)));
      assert.ok(legion.every((p) => p.bluffs.length === s.demonBluffs.length));
    }
  }
});

test("in a Legion game, good gets strong Townsfolk against Legion, you included", () => {
  const raw = tr.filter((x) => !["imp", "vigormortis"].includes(x.id));
  let yours = 0;
  let games = 0;

  for (const seats of [8, 10, 12, 15]) {
    for (let seed = 0; seed < 25; seed++) {
      const s = createState(raw, seats, `legion-strong-${seats}-${seed}`);
      const townsfolk = s.players.filter((p) => team(p.startRole) === "townsfolk");
      const strong = townsfolk.filter((p) => LEGION_STRONG.includes(p.startRole));
      const t = townsfolk.length;

      games++;
      yours += LEGION_STRONG.includes(s.players[0].role) ? 1 : 0;
      // (Extra Village Idiots can take a strong one's place.)
      assert.ok(
        strong.length >= Math.ceil(t * LEGION_STRONG_SHARE) ||
          townsfolk.some((p) => p.role === "villageidiot"),
        `${seats} seats, seed ${seed}`,
      );
    }
  }

  // (You can't be dealt every one of them: the Mayor.)
  assert.ok(yours > games * 0.8, `${yours} of ${games}`);
});

test("a Lunatic in a Legion game gets 3 bluffs of their own, never one of the Legion's", () => {
  const raw = tr.filter((x) => !["imp", "vigormortis"].includes(x.id));
  let lunatics = 0;

  for (let seed = 0; seed < 400; seed++) {
    const s = createState(raw, 12, `legion-lunatic-${seed}`);
    const lunatic = s.players.find((p) => p.role === "lunatic" && !p.human);

    if (!lunatic) {
      continue;
    }

    lunatics++;
    assert.equal(lunatic.bluffs.length, 3);
    assert.ok(!lunatic.bluffs.some((id) => s.demonBluffs.includes(id)), `seed ${seed}`);
  }

  assert.ok(lunatics > 0);
});

test("Legion: an execution fails if only evil players voted", () => {
  const s = base("legion-veto", tr);
  const [, chef, l1, l2, l3] = s.players;

  role(l1, "legion", "evil");
  role(l2, "legion", "evil");
  role(l3, "legion", "evil");

  const strat = new SimpleStrategy();

  strat.vote = (_, v) => v.alignment === "evil";

  const e = new Engine(s, strat);
  const only = e.nominate(chef.id, false);

  assert.equal(only.count, 0);
  assert.equal(only.marked, false);
  assert.ok(only.failed);
  assert.match(s.publicLog.at(-1), /: 3 votes \(3 needed\); Execution failed\.$/);

  // Good NPCs now know everyone who voted is evil.
  assert.ok(
    new SimpleStrategy().evidence(s, chef, l1).reasons.some((x) => /execution that failed/.test(x)),
  );

  // With a good vote (yours), it counts.
  assert.ok(e.requestNomination(l1.id, true).marked);
});

test("Legion: an executed Legion dies, and the game goes on while another lives", () => {
  const s = base("legion-exec", tr);
  const [, , , l1, l2] = s.players;

  role(l1, "legion", "evil");
  role(l2, "legion", "evil");

  const e = new Engine(s);

  e.execute(l1);
  assert.equal(l1.alive, false);
  assert.equal(s.winner, null);

  e.execute(l2);
  assert.equal(s.winner, "good");
});

test("Legion: each night the Storyteller chooses who might die: never you, nor the last Legion", () => {
  for (let seed = 0; seed < 30; seed++) {
    const { s, p, e } = trNight(`legion-night-${seed}`, [null, null, null, "legion", "legion"], 2);

    s.revived = [];
    e.legionNight();

    assert.ok(p[0].alive);
    assert.ok(p[3].alive || p[4].alive);
  }
});

test("the Magician: evil NPCs count them as one of their own, until they hear them claim it", () => {
  const { s, p, strat } = trNight("magician", [null, "magician"]);
  const [, mag, chef, baron, imp] = p;

  mag.magicianTrick = true;
  mag.claimKnown = false;

  assert.ok(fooledBy(imp, mag));
  assert.ok(!fooledBy(chef, mag));
  assert.equal(strat.priorityLevel(s, mag, imp), "avoid");
  assert.equal(strat.suspect(s, baron, [mag, chef]), chef);

  // Once they hear it, the trick is up.
  mag.claimKnown = true;
  mag.publicClaim = "magician";
  assert.ok(!fooledBy(imp, mag));
});

test("the Magician's jinxes: the Spy never sees the Demon or Magician; the Demon can't find its Marionette", () => {
  const { s, p, strat, e } = trNight("magician-jinx", [null, "magician", "marionette", "spy"], 2);

  assert.equal(strat.seenRole(s, p[4], p[3]), null);
  assert.equal(strat.seenRole(s, p[1], p[3]), null);

  // (The Demon would tell its Marionette, but the Magician lives.)
  s.r = () => 0;
  e.marionetteReveal(p[4]);
  assert.ok(!p[2].toldEvil);
});

test("the Mezepheles turns a random good NPC evil on its night, if alive", () => {
  const { s, p, e } = trNight("mez", [null, null, null, "mezepheles"], 2);

  s.mezepheles = { night: 2, used: false };
  e.mezepheles();

  const turned = p.filter((x) => x.turnedEvil);

  assert.equal(turned.length, 1);
  assert.equal(turned[0].alignment, "evil");
  assert.ok(!turned[0].human);
  assert.equal(alignment(turned[0].role), "good");

  // Dead, it does nothing.
  const dead = trNight("mez-dead", [null, null, null, "mezepheles"], 3);

  dead.s.mezepheles = { night: 3, used: false };
  dead.p[3].alive = false;
  dead.e.mezepheles();
  assert.ok(!dead.p.some((x) => x.turnedEvil));
});

test("an NPC Mayor wins for good with 3 alive and no execution", () => {
  const s = base("npc-mayor", tr);

  role(s.players[0], "chef", "good");
  role(s.players[1], "mayor", "good");
  s.players[2].alive = false;
  s.players[3].alive = false;

  const e = new Engine(s);

  e.endDay();
  assert.equal(s.winner, "good");
  assert.match(s.reason, /Mayor/);
});

test("the Legion and Minstrel jinx: an executed Legion leaves Legion sober, and the Minstrel learns it", () => {
  const s = base("legion-minstrel", tr);
  const [, minstrel, butler, l1, l2] = s.players;

  role(minstrel, "minstrel", "good");
  role(l1, "legion", "evil");
  role(l2, "legion", "evil");
  s.r = () => 0;

  const e = new Engine(s);

  e.execute(l1);
  assert.ok(butler.drunkTonight);
  assert.ok(!l2.drunkTonight);
  assert.match(minstrel.memories.at(-1).text, /was Legion/);
});

test("Trust Redux's night order has its new characters", () => {
  const ids = tr.map((x) => x.id).filter((id) => id !== "_meta");
  const { first, other } = nightOrder(ids);

  for (const id of ["magician", "villageidiot", "highpriestess"]) {
    assert.ok(first.some((x) => x.id === id), id);
  }

  for (const id of ["mezepheles", "legion", "villageidiot", "highpriestess"]) {
    assert.ok(other.some((x) => x.id === id), id);
  }
});

test("a Lunatic is never shown Legion", () => {
  for (let seed = 0; seed < 300; seed++) {
    const s = createState(tr, 8 + (seed % 8), `lunatic-token-${seed}`);

    for (const p of s.players.filter((x) => x.role === "lunatic")) {
      assert.notEqual(p.shown, "legion", `seed ${seed}`);
    }
  }
});

test("an evil Mayor (turned by the Mezepheles) wins for evil with 3 alive and no execution", () => {
  const s = base("evil-mayor", tr);

  role(s.players[0], "chef", "good");
  role(s.players[1], "mayor", "good");
  s.players[1].alignment = "evil";
  s.players[1].turnedEvil = 2;
  s.players[2].alive = false;
  s.players[3].alive = false;

  const e = new Engine(s);

  assert.equal(new SimpleStrategy().priorityLevel(s, s.players[1], s.players[4]), "avoid");
  e.endDay();
  assert.equal(s.winner, "evil");
});

test("an evil Noble bluffer always names 3 players, even in an 8-seat Legion game", () => {
  const raw = tr.filter((x) => !["imp", "vigormortis"].includes(x.id));
  let bluffers = 0;

  for (let seed = 0; seed < 60; seed++) {
    const s = createState(raw, 8, `legion-noble-${seed}`);
    const p = s.players.find((x) => x.role === "legion");

    p.claim = "noble";

    const info = bluffTonight(s, p, new SimpleStrategy());

    bluffers++;
    assert.match(info.text, /^Noble: one of .+ is evil\.$/, `seed ${seed}`);
    assert.equal(info.targets.length, 3);
    assert.ok(!info.targets.includes(s.humanId));
  }

  assert.ok(bluffers > 0);
});

test("the Cerenovus never makes anyone mad they're the Pixie", () => {
  const strat = new SimpleStrategy();

  for (let seed = 0; seed < 300; seed++) {
    const s = createState(tr, 12, `cerenovus-pixie-${seed}`);
    const c = s.players.find((p) => p.alignment === "evil" && !p.human);

    s.phase = "night";
    s.night = 1;

    const choice = strat.cerenovus(s, c);

    assert.notEqual(choice?.role, "pixie", `seed ${seed}`);
  }
});

test("a good Mutant or Damsel hiding behind a Townsfolk makes up its information", () => {
  for (const id of ["mutant", "damsel"]) {
    const { s, p, e } = trNight(`hidden-info-${id}`, [null, id]);
    const hider = p[1];

    hider.claim = "noble";
    e.night();

    // Day 1: a Noble's Night 1 information, made up (at random).
    const said = e.ask(hider.id);

    assert.match(said, /^I claim Noble\./);
    assert.match(said, /Night 1: One of .+ is evil\./, said);
    assert.ok(hider.memories.every((m) => m.role !== "noble"));

    // Once dead, they say what they were, with nothing made up.
    hider.alive = false;
    assert.deepEqual(e.strat.answer(s, hider).memories, []);
  }
});

test("a Cannibal the Mezepheles turned evil bluffs the ability they last ate, from the night they ate it", () => {
  const { s, p, e } = trNight("evil-cannibal", [null, "cannibal", "noble"], 2);
  const [, c, noble] = p;

  Object.assign(c, { alignment: "evil", turnedEvil: 2 });
  s.phase = "day";
  s.day = 2;
  e.execute(noble);
  assert.equal(c.gained, "noble");

  // That night they "learn" as the Noble (a first-night ability).
  s.night = 3;
  e.bluffs();
  assert.equal(gainedRole(c), "noble");
  assert.match(c.memories.at(-1)?.text ?? "", /^Noble: one of /);
});

test("made-up Cannibal information follows the executions; a made-up Philosopher gains a character", () => {
  const { s, p, strat, e } = trNight("made-up-cannibal", [null, "chef", "noble"], 1);
  const [, liar, noble] = p;

  e.night();
  e.claimPublicly(noble);

  // Nothing eaten yet: nothing to say.
  assert.deepEqual(backStory(s, liar, "cannibal", strat), []);

  // The Noble is executed: the next night, made-up Noble information.
  e.execute(noble);
  s.night = 2;

  const ate = backStory(s, liar, "cannibal", strat);

  assert.equal(ate.length, 1);
  assert.match(ate[0].text, /^Noble: one of /);
  assert.equal(ate[0].night, 2);

  // A made-up Philosopher gains a good character with information on Night 1.
  const phil = backStory(s, liar, "philosopher", strat);

  assert.match(phil[0].text, /^Philosopher: gained the .+ ability\.$/);
  assert.equal(backStory(s, liar, "philosopher", strat)[0].text, phil[0].text);
});

test("a hiding Mutant or Damsel never claims a Townsfolk nobody claims openly", () => {
  for (let seed = 0; seed < 300; seed++) {
    const s = createState(tr, 8 + (seed % 8), `hidden-claim-${seed}`);

    for (const p of s.players.filter((x) => ["mutant", "damsel"].includes(x.role))) {
      assert.ok(!["pixie", "virgin", "fool"].includes(p.claim), `seed ${seed}: ${p.claim}`);
    }
  }
});

test("a good player claiming the Cannibal without it 'eats' the executee as they heard them claim, and says whose ability", () => {
  const { s, p, e } = trNight("good-cannibal", [null, "mutant", "noble"], 1);
  const [, mutant, noble] = p;

  e.night();
  mutant.claim = "cannibal";
  e.claimPublicly(noble);
  e.execute(noble);

  // Recorded at the execution: the Noble, as they claimed it.
  assert.equal(mutant.bluffState.eaten.at(-1).as, "noble");
  assert.equal(mutant.bluffState.eaten.at(-1).fromId, noble.id);

  // The next day, the Cannibal line and made-up (random) Noble information.
  s.night = 2;
  s.day = 2;
  s.talked = [];
  hiddenStory(s, mutant, e.strat);

  const said = e.ask(mutant.id);

  assert.match(said, new RegExp(`I have ${noble.label}'s ability, since they were executed\.`));
  assert.match(said, /Night 2: One of .+ is evil\./);
  assert.ok(mutant.bluffState.hidden.memories.every((m) => m.functioning === false));
});

test("an NPC Seamstress never chooses a player they know claims the Recluse", () => {
  for (let seed = 0; seed < 40; seed++) {
    const { s, p, strat } = trNight(`seam-recluse-${seed}`, [null, "seamstress", "recluse"], 2);
    const recluse = p[2];

    recluse.claimKnown = true;
    recluse.publicClaim = "recluse";
    strat.onceReady = () => true;

    const picks = strat.seamstress(s, p[1]);

    assert.equal(picks.length, 2);
    assert.ok(!picks.includes(recluse), `seed ${seed}`);
  }
});

test("Legion games deal a random number of Outsiders, from 0 to the standard count", () => {
  const raw = tr.filter((x) => !["imp", "vigormortis"].includes(x.id));
  const seen = new Set();

  for (let seed = 0; seed < 120; seed++) {
    const s = createState(raw, 12, `legion-outsiders-${seed}`);
    const outsiders = s.players.filter((p) => team(p.startRole) === "outsider").length;

    assert.ok(outsiders >= 0 && outsiders <= COUNTS[12][1], `seed ${seed}`);
    seen.add(outsiders);
  }

  assert.deepEqual([...seen].sort(), [0, 1, 2]);
});

test("a Drunk shown the Pixie acts as a Pixie: mad about their Townsfolk, never claiming the Pixie while alive", () => {
  const { s, p, e } = trNight("drunk-pixie", [null, "drunk", "highpriestess"]);
  const drunk = p[1];

  drunk.shown = "pixie";
  drunk.claim = "pixie";
  e.night();

  assert.ok(drunk.pixieRole);
  assert.equal(drunk.pixieMad, true);
  assert.equal(drunk.claim, drunk.pixieRole);
  assert.ok(!/Pixie/.test(e.ask(drunk.id)));

  // Once dead, they say what they thought they were.
  s.phase = "day";
  e.execute(drunk);
  assert.ok(s.publicLog.some((x) => x.includes("reveals they were the Pixie")));
});

test("an Oracle bluff never says fewer dead players are evil than it said before", () => {
  for (let seed = 0; seed < 40; seed++) {
    const { s, p, strat } = trNight(`oracle-bluff-${seed}`, [null, null, "chef", "noble"], 2);
    const imp = p[4];
    let last = 0;

    imp.claim = "oracle";

    for (let night = 2; night <= 5; night++) {
      s.night = night;

      if (night === 3) {
        p[2].alive = false;
      }

      if (night === 4) {
        p[3].alive = false;
      }

      const n = Number(/(\d+) dead/.exec(bluffTonight(s, imp, strat).text)[1]);

      assert.ok(n >= last, `seed ${seed}, night ${night}: ${n} after ${last}`);
      assert.ok(n <= s.players.filter((x) => !x.alive).length);
      last = n;
    }
  }
});

test("a Marionette who doesn't know isn't recorded as lying to you", () => {
  const { s, p, e } = trNight("marionette-lie", [null, "marionette"], 1);
  const m = p[1];

  m.shown = "chef";
  m.claim = "chef";
  s.phase = "day";
  s.day = 1;
  e.ask(m.id);

  assert.ok(!(s.liesToYou ?? []).some((x) => x.byId === m.id));
});

test("a Village Idiot and a High Priestess never get the same player twice while there's anyone else", () => {
  for (const role of ["villageidiot", "highpriestess"]) {
    const { s, p, strat } = trNight(`no-repeat-${role}`, [null, role], 1);
    const seen = [];

    for (let night = 1; night <= 3; night++) {
      s.night = night;

      const info = nightInfo(s, p[1], strat);

      p[1].memories.push(info);
      seen.push(info.targets[0]);
    }

    // (4 others to choose from, never you: 3 nights, 3 different players.)
    assert.equal(new Set(seen).size, 3, `${role}: ${seen}`);
  }
});

test("Legion never kills a good player at night once only 2 good players are left", () => {
  for (let seed = 0; seed < 40; seed++) {
    // You, 1 good NPC and 3 Legion.
    const { s, p, e } = trNight(`legion-good-min-${seed}`, [null, null, "legion", "legion", "legion"], 3);

    s.revived = [];
    e.legionNight();

    assert.ok(p[1].alive, `seed ${seed}`);
  }
});

// ── Bluffs (see bluff.js) ────────────────────────────────────

test("a good pretender's made-up information never names a character nobody would believably be", () => {
  const believable = (m) =>
    !NEVER_BLUFFED.some((id) => m.text.replace(/^[^:]*: /, "").includes(name(id)));

  for (let seed = 0; seed < 40; seed++) {
    const { s, p, strat, e } = trNight(`never-bluffed-${seed}`, [null, "mutant", "noble"], 1);
    const mutant = p[1];

    e.night();
    e.execute(p[2]);
    s.night = 2;

    for (const id of s.script.ids.filter(
      (x) => alignment(x) === "good" && !NEVER_BLUFFED.includes(x),
    )) {
      for (const m of backStory(s, mutant, id, strat)) {
        assert.ok(believable(m), `seed ${seed}, as the ${id}: ${m.text}`);
      }
    }
  }
});

test("a good pretender's made-up Empath number stays the same while their neighbours do", () => {
  for (let seed = 0; seed < 20; seed++) {
    const { s, p, strat } = trNight(`story-empath-${seed}`, [null, "mutant"], 3);
    const numbers = backStory(s, p[1], "empath", strat).map((m) => m.text);

    assert.equal(numbers.length, 3);
    assert.equal(new Set(numbers).size, 1, `seed ${seed}: ${numbers.join(" / ")}`);
  }
});

test("made-up information never casts suspicion on a player the town is sure is good", () => {
  const { s, p, strat } = trNight("sure-good", [null, null, "villageidiot", "baron"], 2);
  const [, , sureGood, baron] = p;

  baron.claim = "villageidiot";
  s.confirmed = { [sureGood.id]: { level: "certain" } };
  strat.villageIdiot = () => sureGood;

  assert.equal(bluffTonight(s, baron, strat).text, `Village Idiot: ${sureGood.label} is good.`);
});

test("a Spy's bluff about a Townsfolk is never true while the Vortox lives", () => {
  const { s, p } = trNight("spy-vortox", [null, "spy", null, null, "vortox"], 2);
  const spy = p[1];

  assert.equal(bluffMode(s, spy, "empath"), "lie");
  // (An Outsider's information isn't false under the Vortox.)
  assert.equal(bluffMode(s, spy, "butler"), "truth");

  p[4].alive = false;
  assert.equal(bluffMode(s, spy, "empath"), "truth");
});

test("a hiding Mutant acts out their Townsfolk claim, and what they make up never mixes with what they learned", () => {
  const { s, p, e } = trNight("mutant-acts", [null, "mutant", "chef"], 1);
  const [, mutant, chef] = p;

  e.night();

  const learned = mutant.memories.length;

  // A Slayer's shot: in public, to no effect.
  mutant.claim = "slayer";
  e.strat.slay = () => chef;
  e.npcShots();

  assert.ok(chef.alive);
  assert.ok(mutant.shotUsed);
  assert.ok(s.publicLog.some((x) => x.includes(`${mutant.label} claims Slayer and shoots ${chef.label}.`)));

  // A Gossip's statement goes in their made-up story.
  mutant.claim = "gossip";
  hiddenStory(s, mutant, e.strat);
  e.gossipSays(mutant, chef, "demon");

  assert.equal(mutant.memories.length, learned);
  assert.match(mutant.bluffState.hidden.memories.at(-1).text, /^Gossip: said /);
});

test("every good character on every script can be bluffed, by a good or an evil pretender", () => {
  const files = JSON.parse(fs.readFileSync(new URL("../scripts/index.json", import.meta.url)));

  for (const file of files) {
    const raw = JSON.parse(fs.readFileSync(new URL(`../scripts/${file}`, import.meta.url)));
    const s = createState(raw, 10, `bluff-all-${file}`);
    const e = new Engine(s);

    e.start();
    settle(e);

    const good = s.players.find((x) => !x.human && x.alignment === "good");
    const evil = s.players.find((x) => !x.human && x.alignment === "evil");

    for (const id of s.script.ids.filter((x) => alignment(x) === "good")) {
      for (const p of [good, evil]) {
        const was = p.claim;

        p.claim = id;
        assert.doesNotThrow(() => backStory(s, p, id, e.strat), `${file}: ${p.alignment} as the ${id}`);
        assert.doesNotThrow(() => bluffTonight(s, p, e.strat), `${file}: ${p.alignment} as the ${id}`);
        p.claim = was;
      }
    }
  }
});

test("a good player's cover story acts out its Professor, only against a player they strongly suspect", () => {
  const { s, p, e } = trNight("cover-professor", [null, "chef", "noble"], 2);
  const [, chef, noble] = p;

  chef.cover = { kind: "bait", as: "professor", night: 1, memories: [] };
  noble.alive = false;
  noble.claim = "noble";
  e.claimPublicly(noble);
  e.strat.onceReady = () => true;

  // Nobody they suspect: they don't use it.
  e.bluffs();
  assert.ok(!chef.professorUsed);

  // A dead player they know lied: chosen, "and stayed dead".
  chef.certainSuspect = noble.id;
  e.bluffs();
  assert.ok(chef.professorUsed);
  assert.equal(chef.professorExposed, noble.id);
  assert.match(chef.cover.memories.at(-1).text, new RegExp(`^Professor: chose ${noble.label}, who stayed dead\.$`));
  assert.ok(!chef.memories.some((m) => m.role === "professor"));
});

test("you're never anyone's suspect: no made-up information, nor anything said, casts suspicion on you", () => {
  for (let seed = 0; seed < 20; seed++) {
    const { s, p, strat } = trNight(`never-you-${seed}`, [null, "mutant", null, "baron"], 2);
    const [you, mutant, , baron] = p;

    // A good pretender's and an evil bluffer's made-up information.
    for (const role of ["fortuneteller", "empath", "noble", "investigator", "amnesiac"]) {
      for (const owner of [mutant, baron]) {
        for (const m of backStory(s, owner, role, strat).filter((x) =>
          (x.targets ?? []).includes(you.id),
        )) {
          assert.notEqual(stanceOn(s, m, you, owner), "suspicious", `seed ${seed}: ${m.text}`);
        }
      }
    }

    // What an NPC says in public is never taken as suspicion of you.
    const yes = { role: "fortuneteller", text: `Fortune Teller: YES for You and ${baron.label}.`, targets: [you.id, baron.id] };

    s.statements = [];
    heard(s, mutant, [yes]);
    assert.ok(!s.statements.some((st) => st.targetId === you.id && st.type === "suspicious"));
    assert.ok(s.statements.some((st) => st.targetId === baron.id && st.type === "suspicious"));
  }
});

// ── Outed Evil, phase 1: the General, Heretic and Politician ─────

// Outed Evil's characters the game has so far, with a few more evil ones
// (and the Spy) for the Heretic's jinxes.
const outedSoFar = [
  { id: "_meta", name: "Outed Evil (so far)" },
  ...["sailor", "general", "snakecharmer", "fortuneteller", "savant", "philosopher", "huntsman", "fisherman", "juggler", "cannibal", "tealady"],
  ...["lunatic", "barber", "politician", "damsel", "heretic"],
  ...["poisoner", "baron", "spy", "scarletwoman"],
  "imp",
  "sentinel",
];

// The General's information, told truly or falsely.
const generalText = (s, p, mode) => infoOf("general")[mode](s, p).text;

test("the General learns who the Storyteller believes is winning, from the lean", () => {
  const s = createState(outedSoFar, 10, "general");
  const general = s.players.find((x) => !x.human && x.alignment === "good");

  role(general, "general", "good");
  s.night = 2;

  // Evil far ahead (every good NPC dead but the General): the Storyteller
  // helps good, so believes evil is winning.
  for (const p of s.players.filter((x) => x.alignment === "good" && x !== general && !x.human)) {
    p.alive = false;
  }

  assert.equal(lean(s), "good");
  assert.equal(generalText(s, general, "truth"), "General: evil is winning.");
  assert.equal(generalText(s, general, "lie"), "General: good is winning.");

  // Evil all dead but the Demon: good is winning.
  for (const p of s.players) {
    p.alive = p.alignment === "good" || team(p.role) === "demon";
  }

  assert.equal(lean(s), "evil");
  assert.equal(generalText(s, general, "truth"), "General: good is winning.");
  assert.equal(generalText(s, general, "lie"), "General: neither team is winning.");
});

test("the General's night information goes in the log with the Storyteller's workings", () => {
  const s = createState(outedSoFar, 10, "general-log");
  const general = s.players.find((x) => !x.human && x.alignment === "good");
  const e = new Engine(s);

  role(general, "general", "good");
  e.start();
  settle(e);

  assert.ok(general.memories.some((m) => m.role === "general" && /^General: /.test(m.text)));
  assert.ok(s.audit.some((x) => /General: .* winning\. \[the Storyteller (is helping|isn't leaning)/.test(x.text)));

  // A good or an evil pretender can bluff it.
  for (const p of [s.players.find((x) => !x.human && x.alignment === "good" && x !== general), s.players.find((x) => !x.human && x.alignment === "evil")]) {
    p.claim = "general";
    assert.ok(backStory(s, p, "general", e.strat).every((m) => /^General: .* winning\.$/.test(m.text)));
    assert.doesNotThrow(() => bluffTonight(s, p, e.strat));
  }
});

test("the Heretic turns the result around, even dead, unless drunk or poisoned", () => {
  for (const [state, winner] of [[{}, "evil"], [{ alive: false }, "evil"], [{ poisoned: true }, "good"]]) {
    const s = base(`heretic-${winner}`);
    const e = new Engine(s);

    role(s.players[2], "heretic", "good");
    Object.assign(s.players[2], state);
    e.finish("good", "Demon died.");

    assert.equal(s.winner, winner, JSON.stringify(state));

    if (winner === "evil") {
      assert.equal(s.reason, "Demon died. But the Heretic turns it around: evil wins.");
      assert.ok(s.audit.some((x) => x.type === "heretic"));
    }
  }
});

test("the Politician who nominated, or cast a deciding vote on, the execution that lost the game turns and wins", () => {
  let s;
  const pol = () => s.players[2];
  const vote = (nominatorId, voterIds, count, needed) => {
    s.voteHistory = [{ day: s.day, nominatorId, nomineeId: s.players[1].id, voterIds, count, needed }];
    s.executing = s.players[1].id;
  };
  const game = (seed) => {
    s = base(seed);
    role(pol(), "politician", "good");

    return new Engine(s);
  };

  // Nominated it.
  let e = game("politician-nominated");

  vote(pol().id, [], 3, 3);
  e.finish("evil", "Saint executed.");
  assert.equal(pol().alignment, "evil");
  assert.match(
    s.audit.find((x) => x.type === "politician").text,
    /nominated the execution that lost the game: they turn evil, and win\./,
  );

  // A deciding vote (exactly the votes needed); then one that wasn't.
  for (const [count, turned] of [[3, true], [4, false]]) {
    e = game(`politician-vote-${count}`);
    vote(s.players[3].id, [pol().id, s.players[3].id, s.players[4].id], count, 3);
    e.finish("evil", "Saint executed.");
    assert.equal(pol().alignment, turned ? "evil" : "good", `${count} votes`);
  }

  // Lost at night: nobody's execution.
  e = game("politician-night");
  e.finish("evil", "Two alive remain.");
  assert.equal(pol().alignment, "good");
  assert.match(s.audit.find((x) => x.type === "politician").text, /wasn't the most responsible/);

  // A poisoned one has no ability.
  e = game("politician-poisoned");
  pol().poisoned = true;
  vote(pol().id, [], 3, 3);
  e.finish("evil", "Saint executed.");
  assert.equal(pol().alignment, "good");
});

test("an execution records who it was lost by, only while it's under way", () => {
  const s = base("politician-executing");
  const e = new Engine(s);
  let seen = null;

  role(s.players[1], "saint", "good");
  e.finish = function (winner) {
    seen = this.s.executing;
    this.s.winner = winner;
  };
  e.execute(s.players[1]);

  assert.equal(seen, s.players[1].id);
  assert.equal(s.executing, null);
});

test("the Heretic is never in play with the Baron, Godfather, Pit-Hag, Spy or Widow (their jinx)", () => {
  const jinxed = ["baron", "godfather", "pithag", "spy", "widow"];
  const raw = [
    { id: "_meta", name: "Heretic jinxes" },
    ...["washerwoman", "librarian", "investigator", "chef", "empath", "fortuneteller", "undertaker", "monk", "slayer", "soldier", "ravenkeeper", "virgin", "mayor"],
    ...["heretic", "saint", "recluse", "butler"],
    ...jinxed,
    ...["poisoner", "scarletwoman", "assassin", "cerenovus", "witch"],
    "imp",
  ];
  let heretics = 0;
  let left = 0;

  for (const id of jinxed) {
    assert.ok(
      JINXES.some(
        (j) =>
          j.exclusive &&
          j.ids.includes("heretic") &&
          j.ids.includes(id) &&
          j.text === "Only 1 jinxed character can be in play.",
      ),
      id,
    );
  }

  for (let seed = 0; seed < 300; seed++) {
    const s = createState(raw, 12, `heretic-jinx-${seed}`);
    const roles = s.players.map((p) => p.role);

    if (roles.includes("heretic")) {
      heretics++;
      assert.ok(!roles.some((x) => jinxed.includes(x)), roles.join(","));
    }

    left += s.audit.some((x) => x.type === "jinx" && /^The Heretic is left out/.test(x.text)) ? 1 : 0;
  }

  assert.ok(heretics > 0 && left > 0, `${heretics} Heretics, ${left} left out`);
});

test("the Heretic and a Baron, Godfather, Lleech, Pit-Hag, Spy or Widow are never in play together, all game", () => {
  const jinxed = ["baron", "godfather", "lleech", "pithag", "spy", "widow"];
  // (With every character that changes who's what: the Philosopher, Barber,
  // Snake Charmer, Fang Gu, Huntsman, Scarlet Woman...)
  const raw = [
    { id: "_meta", name: "Heretic jinxes, all game" },
    ...["philosopher", "snakecharmer", "huntsman", "cannibal", "washerwoman", "librarian", "chef", "empath", "fortuneteller", "undertaker", "monk", "slayer", "mayor"],
    ...["heretic", "barber", "damsel", "politician", "saint", "recluse", "butler"],
    ...jinxed.filter((x) => x !== "lleech"),
    ...["scarletwoman", "poisoner"],
    ...["imp", "fanggu", "lleech"],
  ];
  const inPlay = (s) => s.players.flatMap((x) => [x.role, x.gained].filter(Boolean));
  let heretics = 0;
  let jinxedGames = 0;

  for (let g = 0; g < 120; g++) {
    const s = createState(raw, 8 + (g % 8), `heretic-all-game-${g}`);
    const e = new Engine(s);
    const audit = e.audit.bind(e);
    const check = (when) => {
      const roles = inPlay(s);

      assert.ok(
        !roles.includes("heretic") || !roles.some((x) => jinxed.includes(x)),
        `game ${g}, ${when}: ${roles.join(", ")}`,
      );
    };

    // (Checked after everything that happens.)
    e.audit = (...args) => {
      const r = audit(...args);

      check(args[1]);
      return r;
    };

    check("setup");
    heretics += inPlay(s).includes("heretic") ? 1 : 0;
    jinxedGames += inPlay(s).some((x) => jinxed.includes(x)) ? 1 : 0;
    e.start();

    for (let turn = 0; turn < 40 && !s.winner; turn++) {
      settle(e);

      if (s.winner) {
        break;
      }

      if (s.phase === "day") {
        e.endDay();
      }
    }

    check("game over");
  }

  assert.ok(heretics > 0 && jinxedGames > 0, `${heretics} with the Heretic, ${jinxedGames} with a jinxed one`);
});

test("an NPC Philosopher gains a useful Townsfolk: never an Outsider, nor one it should avoid; the most valuable first", () => {
  const oe = JSON.parse(
    fs.readFileSync(new URL("../scripts/Outed Evil_5_0_0.json", import.meta.url)),
  );
  const gains = new Set();

  for (let i = 0; i < 200; i++) {
    const s = createState(oe, 8 + (i % 8), `philosopher-useful-${i}`);
    const phil = s.players.find((x) => !x.human && x.alignment === "good");
    const strat = new SimpleStrategy();

    role(phil, "philosopher", "good");
    s.night = 1;
    strat.onceReady = () => true;

    const id = strat.philosopher(s, phil);

    gains.add(id);
    assert.equal(team(id), "townsfolk", `${i}: ${id}`);
    assert.ok(!PHILOSOPHER_AVOID.includes(id), `${i}: ${id}`);
    assert.notEqual(id, "philosopher");
    assert.match(phil.philosopherWhy, /Townsfolk/);

    // The most valuable ("high") on the script, in play or not, comes first.
    assert.equal(DEMON_KILL_PRIORITY[id], "high", `${i}: ${id}`);
  }

  assert.ok(gains.size > 1);
});

test("a Philosopher who gains the Alchemist's ability gets a Minion ability not in play, and uses it", () => {
  const oe = JSON.parse(
    fs.readFileSync(new URL("../scripts/Outed Evil_5_0_0.json", import.meta.url)),
  );
  const s = createState(oe, 8, "philosopher-alchemist");
  const phil = s.players.find((x) => !x.human && x.alignment === "good");
  const strat = new SimpleStrategy();

  role(phil, "philosopher", "good");
  strat.philosopher = () => "alchemist";

  const e = new Engine(s, strat);

  e.start();

  const inPlay = s.players.map((x) => x.role);

  assert.equal(phil.gained, "alchemist");
  assert.ok(ALCHEMIST_ABILITIES.includes(phil.alchemist));
  assert.ok(!inPlay.includes(phil.alchemist));
  assert.equal(minionAbility(phil), phil.alchemist);
  assert.ok(
    s.audit.some((x) =>
      x.text.includes(`gained the Alchemist ability (the ${name(phil.alchemist)} ability)`),
    ),
  );
  assert.ok(
    phil.memories.some((m) => m.text === `Alchemist: you have the ${name(phil.alchemist)} ability.`),
  );
});

test("a Philosopher can't gain the Heretic while a jinxed character is in play, and one who did turns the result around", () => {
  const s = createState([...outedSoFar, "pithag"], 10, "philosopher-heretic");
  const phil = s.players.find((x) => !x.human && x.alignment === "good");
  const human = s.players.find((x) => x.human);
  const strat = new SimpleStrategy();

  role(phil, "philosopher", "good");
  s.night = 1;

  for (const p of s.players.filter((x) => x.alignment === "evil" && team(x.role) === "minion").slice(0, 1)) {
    role(p, "baron", "evil");
  }

  strat.onceReady = () => true;
  assert.ok(jinxBarred(s).has("heretic"));

  for (let i = 0; i < 200; i++) {
    assert.notEqual(strat.philosopher(s, phil), "heretic");
  }

  // As you: it isn't offered.
  role(human, "philosopher", "good");
  const e = new Engine(s);

  e.night();
  assert.ok(!(s.pending?.characters ?? []).includes("heretic"));
  assert.ok((s.pending?.characters ?? []).length > 0);

  // With nothing jinxed in play, a Philosopher Heretic turns it around.
  const t = base("philosopher-heretic-flip");

  role(t.players[2], "philosopher", "good");
  t.players[2].gained = "heretic";
  new Engine(t).finish("good", "Demon died.");
  assert.equal(t.winner, "evil");
});

test("the Pit-Hag never makes a Heretic; one she makes the Politician from an evil player stays evil", () => {
  const strat = new SimpleStrategy();
  const s = createState([...outedSoFar, "pithag"], 10, "pithag-heretic");
  const h = s.players.find((x) => !x.human && x.alignment === "evil");

  role(h, "pithag", "evil");
  s.night = 2;

  for (let i = 0; i < 200; i++) {
    assert.notEqual(strat.pithag(s, h)?.role, "heretic");
  }

  const pol = s.players.find((x) => !x.human && x.alignment === "evil" && x !== h);

  role(pol, "politician", "evil");
  pol.politicianStaysEvil = true;
  s.voteHistory = [{ day: s.day, nominatorId: pol.id, nomineeId: h.id, voterIds: [], count: 9, needed: 9 }];
  s.executing = h.id;
  new Engine(s).politicianEnd("good");
  assert.equal(pol.alignment, "evil");
});

test("a good Politician's vote might count as evil to Legion (their jinx)", () => {
  let vetoed = 0;

  for (let seed = 0; seed < 40; seed++) {
    const s = base(`legion-politician-${seed}`);
    const e = new Engine(s);

    role(s.players[4], "legion", "evil");
    role(s.players[3], "legion", "evil");
    role(s.players[2], "politician", "good");

    const records = [2, 3, 4].map((i) => ({ playerId: s.players[i].id, counted: true }));

    if (e.legionVeto(records, 3)) {
      vetoed++;
      assert.ok(s.audit.some((x) => /\(Politician\) registered as evil to Legion/.test(x.text)));
    }
  }

  assert.ok(vetoed > 0 && vetoed < 40, `${vetoed} of 40`);
});

test("the Heretic votes for players they trust, not their suspect, and never nominates them", () => {
  const s = base("heretic-votes");
  const strat = new SimpleStrategy();
  const v = s.players[2];
  const sus = s.players[4];

  role(v, "heretic", "good");
  strat.opinion = () => ({ type: "suspicious", targetId: sus.id });
  strat.suspicion = (_, p) => (p.suspicion = { targetId: sus.id, score: 99, reasons: [] });

  let yes = 0;

  for (let i = 0; i < 200; i++) {
    yes += strat.vote(s, v, sus) ? 1 : 0;
  }

  assert.ok(yes < 100, `${yes} of 200`);
  assert.equal(strat.nomination(s, v), null);
});

test("an NPC Heretic hides behind a Townsfolk claim, even once dead", () => {
  let heretics = 0;

  for (let seed = 0; seed < 200; seed++) {
    const s = createState(outedSoFar, 12, `heretic-hides-${seed}`);

    for (const p of s.players.filter((x) => x.role === "heretic" && !x.human)) {
      heretics++;
      assert.equal(team(p.claim), "townsfolk", `seed ${seed}`);
      p.alive = false;
      assert.equal(new SimpleStrategy().revealsWhenDead(p), null);
    }
  }

  assert.ok(heretics > 0);
});

test("in the final 3, the Heretic says so if evil looks about to lose; else an evil NPC might bluff it", () => {
  // Final 3: you, the Heretic (a good NPC) and the Imp; the rest dead.
  const final3 = (seed) => {
    const s = base(seed);
    const e = new Engine(s);

    s.script = { ...s.script, ids: [...s.script.ids, "heretic"] };
    role(s.players[1], "heretic", "good");
    s.players[1].claim = "chef";
    s.players[2].alive = false;
    s.players[3].alive = false;

    return { s, e, heretic: s.players[1], minion: s.players[3], imp: s.players[4] };
  };

  // Not sure of anyone: they keep hiding, and the Imp, unsuspected, doesn't bluff.
  let { s, e, heretic, imp, minion } = final3("heretic-quiet");

  e.strat.suspicion = () => null;
  e.hereticReveals();
  assert.equal(heretic.claim, "chef");
  assert.equal(s.hereticClaim, undefined);

  // Sure of the Imp: they say so in public.
  ({ s, e, heretic, imp } = final3("heretic-sure"));
  e.strat.suspicion = (_, p) => (p === heretic ? { targetId: imp.id, score: 9 } : null);
  e.hereticReveals();
  assert.equal(heretic.claim, "heretic");
  assert.equal(s.hereticClaim, heretic.id);
  assert.equal(
    s.publicLog.at(-1),
    `Day 1 — ${heretic.label} says: "I said I was the Chef, but I'm the Heretic: whoever wins, loses. If good wins today, good loses."`,
  );
  assert.match(s.audit.at(-1).text, /\(the real Heretic; they're sure .* is evil\)$/);

  // Only once.
  e.hereticReveals();
  assert.equal(s.publicLog.filter((x) => /the Heretic: whoever wins/.test(x)).length, 1);

  // Not before the final 3.
  ({ s, e, heretic, imp } = final3("heretic-early"));
  s.players[2].alive = true;
  e.strat.suspicion = (_, p) => (p === heretic ? { targetId: imp.id, score: 9 } : null);
  e.hereticReveals();
  assert.equal(heretic.claim, "chef");

  // No Heretic in play, and you marked the Imp evil: a dead Minion might claim it.
  let bluffed = 0;

  for (let seed = 0; seed < 40; seed++) {
    ({ s, e, heretic, imp, minion } = final3(`heretic-bluff-${seed}`));
    role(heretic, "chef", "good");
    minion.alive = false;
    e.strat.suspicion = () => null;
    e.mark(imp.id, "evil");
    e.hereticReveals();

    if (s.hereticClaim) {
      bluffed++;
      assert.equal(s.hereticClaim, minion.id);
      assert.equal(minion.claim, "heretic");
      assert.match(s.audit.at(-1).text, /\(fake: they're the Baron; you marked the Demon .* evil\)$/);
      assert.ok(s.liesToYou?.some((x) => x.byId === minion.id && x.said === "heretic") ?? true);
    } else {
      assert.match(s.audit.at(-1).text, /could claim to be the Heretic .* but doesn't\.$/);
    }
  }

  assert.ok(bluffed > 0 && bluffed < 40, `${bluffed} of 40`);
});

// ── Outed Evil, phase 2: the Goblin, Fearmonger and Psychopath ───

// Outed Evil's characters the game has so far (no Spy or Baron: just the
// script's own Minions, and the Cerenovus for the Goblin's jinx).
const outedSoFar2 = [
  { id: "_meta", name: "Outed Evil (so far)" },
  ...["sailor", "general", "snakecharmer", "fortuneteller", "savant", "philosopher", "huntsman", "fisherman", "juggler", "cannibal", "tealady"],
  ...["lunatic", "barber", "politician", "damsel", "heretic"],
  ...["poisoner", "goblin", "fearmonger", "psychopath"],
  "imp",
  "sentinel",
];

// A 5-player Day 1 (see base()) where p[3] is `minion`, with the vote
// nominating `nominee` already recorded as marking them.
function minionDay(seed, minion) {
  const s = base(seed);
  const e = new Engine(s);

  role(s.players[3], minion, "evil");

  return { s, e, p: s.players };
}

const voted = (s, nominator, nominee, count = 3) =>
  (s.voteHistory ??= []).push({
    day: s.day,
    nominatorId: nominator.id,
    nomineeId: nominee.id,
    voterIds: [],
    count,
    needed: 3,
  });

test("the Goblin claims it when nominated; executed that day, evil wins", () => {
  const { s, e, p } = minionDay("goblin", "goblin");
  const goblin = p[3];

  s.r = () => 0; // (always claims)
  const lines = e.nominationReveals(goblin);

  assert.equal(lines[0], `Day 1 — ${goblin.label} says: "I'm the Goblin! Execute me today, and evil wins."`);
  assert.equal(goblin.claim, "goblin");
  assert.ok(goblin.claimKnown);
  assert.ok(s.outed.some((x) => x.id === goblin.id));
  assert.match(s.audit.find((x) => x.type === "goblin").text, /\(the real Goblin\)$/);

  // It gets a popup card of its own.
  assert.deepEqual(s.phaseCards.at(-1), { kind: "goblin", day: 1, lines: [lines[0]] });

  // Good NPCs hardly ever vote for them, even for your pick in the final 3;
  // the evil team does.
  s.r = () => 0.5;
  assert.equal(e.strat.vote(s, p[1], goblin, { humanChoice: true }), false);
  assert.equal(e.strat.vote(s, p[4], goblin), true);

  voted(s, p[1], goblin);
  e.execute(goblin);
  assert.equal(s.winner, "evil");
  assert.equal(s.reason, "The Goblin claimed it when nominated, and was executed.");
});

test("a Goblin who didn't claim it today, or is poisoned, is just executed", () => {
  for (const setup of [
    (s, g) => (s.goblinClaims = [{ id: g.id, day: s.day - 1 }]),
    (s, g) => {
      s.goblinClaims = [{ id: g.id, day: s.day }];
      g.poisoned = true;
    },
  ]) {
    const { s, e, p } = minionDay("goblin-no", "goblin");
    const goblin = p[3];

    setup(s, goblin);
    voted(s, p[1], goblin);
    e.execute(goblin);
    assert.equal(s.winner, null);
    assert.equal(goblin.alive, false);
  }
});

test("good NPCs never nominate a player who claimed the Goblin; the evil team nominates its Goblin once it nearly has the votes", () => {
  const { s, e, p } = minionDay("goblin-nominate", "goblin");
  const goblin = p[3];

  s.goblinClaims = [{ id: goblin.id, day: 1 }];
  s.day = 2;
  e.strat.suspicion = (_, x) => (x.suspicion = { targetId: goblin.id, score: 99, reasons: [] });
  assert.equal(e.strat.nomination(s, p[1]), null);

  // 2 evil of 5 alive: 1 vote short of the 3 needed.
  s.r = () => 0;
  assert.equal(e.strat.nomination(s, p[4])?.target, goblin);

  // 2 short (7 alive, 4 needed): not yet.
  const t = minionDay("goblin-nominate-far", "goblin");

  t.s.players.push(...createState(script, 8, "extra").players.slice(5, 7).map((x) => ({ ...x, alignment: "good", alive: true })));
  t.s.r = () => 0;
  assert.equal(t.e.strat.goblinPush(t.s, t.p[4]), null);
});

test("the Cerenovus may make a good NPC mad that they're the Goblin: they claim it when nominated, and it does nothing", () => {
  const { s, e, p } = minionDay("cerenovus-goblin", "cerenovus");
  const mad = p[1];

  s.script = { ...s.script, ids: [...s.script.ids, "goblin"] };
  s.phase = "night";
  s.night = 2;
  // (Not a teammate: the first draw; then the Goblin.)
  let draws = 0;

  s.r = () => (draws++ ? 0 : 0.99);
  assert.equal(e.strat.cerenovus(s, p[3])?.role, "goblin");

  mad.mad = { role: "goblin", day: 1, previous: "chef" };
  mad.claim = "goblin";
  s.phase = "day";
  s.night = 1;
  assert.match(e.nominationReveals(mad)[0], /says: "I'm the Goblin!/);
  assert.match(s.audit.find((x) => x.type === "goblin").text, /mad that they're the Goblin: the Cerenovus\)$/);
  assert.ok(JINXES.some((j) => j.ids.includes("cerenovus") && j.ids.includes("goblin")));

  voted(s, p[2], mad);
  e.execute(mad);
  assert.equal(s.winner, null);
});

test("the Fearmonger's new choice is announced at dawn; nominating and executing them makes their team lose", () => {
  const { s, e, p } = minionDay("fearmonger", "fearmonger");
  const f = p[3];
  const t = p[1];

  e.strat.fearmonger = () => t;
  s.phase = "night";
  s.night = 2;
  e.fearmonger();
  assert.equal(f.fearTarget, t.id);
  assert.match(s.audit.at(-1).text, new RegExp(`chose ${t.label}; if they nominate and execute them, good loses\\.$`));

  s.day = 2;
  e.fearmongerDawn();
  assert.equal(s.publicLog.at(-1), "Day 2 — The Storyteller: the Fearmonger has chosen a new player.");
  // (Announced: it's on the dawn card, the Storyteller's popup.)
  assert.ok(s.announced.includes(s.publicLog.length - 1));
  assert.equal(s.fearmongerChose, 2);

  // The same choice again: no announcement.
  s.night = 3;
  e.fearmonger();
  s.day = 3;
  e.fearmongerDawn();
  assert.equal(s.fearmongerChose, 2);
  assert.match(s.audit.findLast((x) => x.type === "fearmonger").text, / again;/);

  // Someone else nominated them: nothing.
  voted(s, p[2], t);
  e.execute(t);
  assert.equal(s.winner, null);

  // The Fearmonger did.
  const g = minionDay("fearmonger-win", "fearmonger");

  g.p[3].fearTarget = g.p[2].id;
  voted(g.s, g.p[3], g.p[2]);
  g.e.execute(g.p[2]);
  assert.equal(g.s.winner, "evil");
  assert.equal(g.s.reason, `The Fearmonger nominated and executed ${g.p[2].label}, their chosen player.`);

  // Poisoned: nothing.
  const h = minionDay("fearmonger-poisoned", "fearmonger");

  h.p[3].fearTarget = h.p[2].id;
  h.p[3].poisoned = true;
  voted(h.s, h.p[3], h.p[2]);
  h.e.execute(h.p[2]);
  assert.equal(h.s.winner, null);
});

test("the Fearmonger chooses the good NPC the town suspects, nominates them, and good NPCs grow wary", () => {
  const { s, e, p } = minionDay("fearmonger-choice", "fearmonger");
  const f = p[3];

  p[2].suspicion = { targetId: p[1].id };
  p[4].suspicion = { targetId: p[1].id };
  assert.equal(new SimpleStrategy().fearmonger(s, f), p[1]);
  assert.notEqual(new SimpleStrategy().fearmonger(s, f), p[0]);

  f.fearTarget = p[1].id;
  assert.equal(e.strat.nomination(s, f)?.target, p[1]);

  // On a hunch, good NPCs vote half as often once the Fearmonger has chosen.
  const strat = new SimpleStrategy();
  const count = (chose) => {
    let yes = 0;

    s.fearmongerChose = chose;

    for (let i = 0; i < 400; i++) {
      s.r = rng(`wary-${chose}-${i}`);
      yes += strat.vote(s, p[2], p[4], { nominator: p[3] }) ? 1 : 0;
    }

    return yes;
  };

  strat.opinion = () => ({ type: null, targetId: null });
  strat.evidence = () => ({ score: 0, reasons: [] });
  assert.ok(count(1) < count(null) * 0.75, `${count(1)} vs ${count(null)}`);
});

test("the Psychopath kills in public at dawn, and is known to be evil", () => {
  const { s, e, p } = minionDay("psychopath", "psychopath");
  const psycho = p[3];

  e.strat.psychopath = () => p[1];
  s.r = () => 0;
  e.psychopathKills();

  assert.equal(p[1].alive, false);
  assert.equal(p[1].death, "psychopath");
  assert.match(s.publicLog.join("\n"), new RegExp(`${psycho.label} publicly chooses ${p[1].label}: they die\\.`));
  assert.equal(psycho.claim, "psychopath");
  assert.ok(s.outed.some((x) => x.id === psycho.id));
  assert.ok(new SimpleStrategy().evidence(s, p[2], psycho).score >= 8);

  // Once they've killed, every day.
  s.day = 2;
  s.r = () => 0.99;
  e.strat.psychopath = () => p[2];
  e.psychopathKills();
  assert.equal(p[2].alive, false);

  // Drunk or poisoned: nothing happens (but they're still outed).
  const t = minionDay("psychopath-poisoned", "psychopath");

  t.p[3].poisoned = true;
  t.e.strat.psychopath = () => t.p[1];
  t.s.r = () => 0;
  t.e.psychopathKills();
  assert.ok(t.p[1].alive);
  assert.match(t.s.publicLog.at(-1), /But nothing happens\.$/);
});

test("the Psychopath never chooses you while a good NPC is left, nor again a player who can't die", () => {
  const { s, e, p } = minionDay("psychopath-foiled", "psychopath");
  const [you, tea, butler, psycho] = p;
  const strat = new SimpleStrategy();

  // The Tea Lady's living neighbours, you and the Butler, are good: the
  // Butler can't die.
  role(you, "empath", "good");
  role(tea, "tealady", "good");
  e.strat.psychopath = () => butler;
  s.r = () => 0;
  e.psychopathKills();

  assert.ok(butler.alive);
  assert.deepEqual(psycho.foiled, [butler.id]);
  assert.ok(
    s.audit.some((x) => x.text === `${psycho.label} (Psychopath) won't choose ${butler.label} again: protected by the Tea Lady.`),
  );

  // So the Tea Lady, never the Butler or you.
  for (let i = 0; i < 40; i++) {
    s.r = rng(`psychopath-foiled-${i}`);
    assert.equal(strat.psychopath(s, psycho), tea);
  }

  // With the Tea Lady dead, the Butler can die again.
  tea.alive = false;
  s.r = rng("psychopath-unshielded");
  assert.equal(strat.psychopath(s, psycho), butler);

  // With no good NPC left, you.
  butler.alive = false;
  assert.equal(strat.psychopath(s, psycho), you);
});

test("with only the Lunatic and teammates to kill, the Psychopath and the Demon kill the Lunatic, not you or a teammate", () => {
  const { s, p } = minionDay("psychopath-lunatic", "psychopath");
  const [you, lunatic, butler, psycho, imp] = p;
  const strat = new SimpleStrategy();

  role(lunatic, "lunatic", "good");
  butler.alive = false;

  for (let i = 0; i < 40; i++) {
    s.r = rng(`psychopath-lunatic-${i}`);
    assert.equal(strat.psychopath(s, psycho), lunatic);
    assert.equal(strat.demon(s, imp), lunatic);
  }

  assert.ok(you.alive);
});

test("an executed Psychopath plays roshambo against their nominator, winning ties", () => {
  let survived = 0;
  let died = 0;

  for (let seed = 0; seed < 60; seed++) {
    const { s, e, p } = minionDay(`roshambo-${seed}`, "psychopath");

    voted(s, p[1], p[3]);
    e.execute(p[3]);

    const line = s.publicLog.find((x) => /Roshambo: /.test(x));
    const [, mine, theirs] = line.match(/throws (\w+); .* throws (\w+)\./);
    const wins = mine === theirs || { rock: "scissors", paper: "rock", scissors: "paper" }[mine] === theirs;

    assert.equal(p[3].alive, wins, line);
    assert.match(line, mine === theirs ? /A tie: the Psychopath wins ties\.$/ : wins ? /The Psychopath wins\.$/ : /The Psychopath loses\.$/);
    survived += wins ? 1 : 0;
    died += wins ? 0 : 1;
  }

  // (About 2 in 3 survive.)
  assert.ok(survived > died && died > 0, `${survived} survived, ${died} died`);
});

test("roshambo against a Psychopath you nominated waits for your throw, then the day ends", () => {
  const { s, e, p } = minionDay("roshambo-you", "psychopath");
  const psycho = p[3];

  s.block = { nomineeId: psycho.id, count: 3 };
  voted(s, p[0], psycho);
  e.endDay();

  assert.equal(s.roshambo?.psychopathId, psycho.id);
  assert.equal(s.phase, "day");
  assert.throws(() => e.endDay(), /Throw first/);
  assert.throws(() => e.roshambo("lizard"), /rock, paper or scissors/);

  e.roshambo("rock");
  assert.equal(s.roshambo, null);
  assert.ok(s.publicLog.some((x) => /Roshambo: .* you throw rock\./.test(x)));
  // (Night fell, and a new day began.)
  assert.ok(s.day === 2 || s.winner, `day ${s.day}`);
});

test("whole games play out with the Goblin, Fearmonger and Psychopath, and each does its thing", () => {
  const seen = { goblin: 0, fearmonger: 0, announce: 0, psychopath: 0, roshambo: 0 };

  for (let g = 0; g < 80; g++) {
    const { s } = playOut(outedSoFar2, 8 + (g % 8), `outed-2-${g}`);
    const text = s.audit.map((x) => x.text).join("\n");

    assert.ok([null, "good", "evil"].includes(s.winner));
    seen.goblin += /I'm the Goblin!/.test(text) ? 1 : 0;
    seen.fearmonger += s.audit.some((x) => x.type === "fearmonger") ? 1 : 0;
    seen.announce += s.publicLog.some((x) => /the Fearmonger has chosen a new player/.test(x)) ? 1 : 0;
    seen.psychopath += /publicly chooses/.test(s.publicLog.join("\n")) ? 1 : 0;
    seen.roshambo += /Roshambo: /.test(text) ? 1 : 0;
  }

  for (const [k, n] of Object.entries(seen)) {
    assert.ok(n > 0, `${k}: ${JSON.stringify(seen)}`);
  }
});

// ── Outed Evil, phase 3: the Lleech and Poppy Grower ─────────────

const outedSoFar3 = [
  { id: "_meta", name: "Outed Evil (so far)" },
  ...["sailor", "general", "snakecharmer", "fortuneteller", "savant", "philosopher", "huntsman", "fisherman", "juggler", "cannibal", "tealady", "poppygrower"],
  ...["lunatic", "barber", "politician", "damsel", "heretic"],
  ...["poisoner", "goblin", "fearmonger", "psychopath"],
  ...["imp", "lleech"],
  "sentinel",
];

// A 5-player Night 2 (see base()): p[4] is the Lleech, with p[1] (the Chef)
// as their host.
function lleechGame(seed) {
  const s = base(seed);
  const e = new Engine(s);

  role(s.players[4], "lleech", "evil");
  s.players[4].lleechHost = s.players[1].id;

  return { s, e, p: s.players, d: s.players[4], host: s.players[1] };
}

test("log.txt's player table shows the Lleech's host as its host, and a failed Philosopher as only thinking they gained it", () => {
  const { s, e, p, host } = lleechGame("lleech-host-log");

  host.poisoned = true;
  role(p[2], "philosopher", "good");
  p[2].poisoned = true;
  e.philosopherGain(p[2], "snakecharmer");
  e.snapshot();

  const row = (x) => formatLog(s).split("\n").find((l) => l.startsWith(`  ${x.label} `));

  assert.match(row(host), /\| alive, Lleech's host +\|/);
  assert.match(row(p[2]), /Philosopher \(thinks they have Snake Charmer\)/);
  assert.match(row(p[2]), /\| alive, poisoned +\|/);
});

test("the Lleech chooses a host on Night 1 (a good NPC, never you): poisoned for as long as the Lleech lives", () => {
  for (let seed = 0; seed < 40; seed++) {
    const s = base(`lleech-host-${seed}`);
    const e = new Engine(s);
    const d = s.players[4];

    role(d, "lleech", "evil");
    s.phase = "night";
    s.night = 1;
    e.lleechHosts();

    const host = e.player(d.lleechHost);

    assert.ok(host && !host.human && host.alignment === "good", `seed ${seed}`);
    assert.ok(host.poisoned);
    assert.match(s.audit.at(-1).text, /chose .* as their host; poisoned, and the Lleech dies if and only if they're dead\.$/);

    // Every dusk, poisoned again.
    host.poisoned = false;
    e.lleechLasting();
    assert.ok(host.poisoned);

    // Chosen once.
    e.lleechHosts();
    assert.equal(d.lleechHost, host.id);
  }
});

test("the Lleech can't die while their host lives; executed, the town takes them for the Lleech", () => {
  const { s, e, p, d, host } = lleechGame("lleech-safe");

  s.script = { ...s.script, ids: [...s.script.ids, "lleech"] };
  voted(s, p[2], d);
  e.execute(d);

  assert.ok(d.alive);
  assert.equal(s.winner, null);
  assert.match(s.publicLog.at(-1), /is executed\. But does not die\.$/);
  assert.ok(s.lleechSuspects.includes(d.id));
  assert.ok(s.outed.some((x) => x.id === d.id));

  // Good NPCs stop nominating them.
  e.strat.suspicion = (_, x) => (x.suspicion = { targetId: d.id, score: 99, reasons: [] });
  assert.equal(e.strat.nomination(s, p[2]), null);

  // Poisoned, they can die.
  d.poisoned = true;
  assert.ok(e.kill(d, "slayer"));
  assert.ok(host.alive);
});

test("the Lleech's host dies: so does the Lleech, and good wins", () => {
  const { s, e, p, d, host } = lleechGame("lleech-host-dies");

  voted(s, p[2], host);
  e.execute(host);

  assert.equal(host.alive, false);
  assert.equal(d.alive, false);
  assert.equal(d.death, "lleech");
  assert.equal(s.winner, "good");
  assert.ok(s.audit.some((x) => /the Lleech's host, died: .* \(Lleech\) dies too\./.test(x.text)));
});

test("the Lleech and Mastermind jinx: the host executed while the Mastermind lives, the Lleech lives without their ability", () => {
  const { s, e, p, d, host } = lleechGame("lleech-mastermind");

  role(p[3], "mastermind", "evil");
  voted(s, p[2], host);
  e.execute(host);

  assert.ok(d.alive);
  assert.equal(s.winner, null);
  assert.equal(d.drunkFrom, "lleech");
  assert.match(s.audit.find((x) => /Mastermind\) lives/.test(x.text)).text, /lives, but loses their ability\.$/);
  assert.ok(JINXES.some((j) => j.ids.includes("lleech") && j.ids.includes("mastermind")));
});

test("the Lleech and Slayer jinx: the Slayer's shot kills the Lleech's host (and so the Lleech)", () => {
  const { s, e, p, d, host } = lleechGame("lleech-slayer");

  role(p[2], "slayer", "good");
  assert.ok(e.shoot(p[2], host));
  assert.equal(host.alive, false);
  assert.equal(d.alive, false);
  assert.equal(s.winner, "good");
  assert.ok(JINXES.some((j) => j.ids.includes("lleech") && j.ids.includes("slayer")));
});

test("final 4, you the Tea Lady between the Lleech's host and another good player: the Lleech kills you", () => {
  const s = base("lleech-tealady-final-4");
  const e = new Engine(s);
  const [you, host, d, baron, other] = s.players;

  // Seats go round: other, you, host. Both your neighbours are good.
  role(you, "tealady", "good");
  role(other, "empath", "good");
  role(d, "lleech", "evil");
  d.lleechHost = host.id;
  baron.alive = false;
  s.phase = "night";

  // Your other neighbour can't die (your Tea Lady ability), nor can it
  // kill its host: with nobody else it can kill, it kills you.
  s.night = 3;
  e.demon();
  assert.equal(you.alive, false);
  assert.ok(other.alive && host.alive);
  assert.ok(s.audit.some((x) => /chose You \(why: nobody but its own team is left to kill, besides you\); You was killed\./.test(x.text)));
});

test("left with only their host and you, the Lleech kills you (else the game could never end)", () => {
  const { s, e, p, d, host } = lleechGame("lleech-cornered");

  // (Not the Mayor, whose death might bounce.)
  role(p[0], "empath", "good");
  p[2].alive = false;
  p[3].alive = false;
  s.phase = "night";
  s.night = 3;
  e.demon();

  assert.equal(p[0].alive, false);
  assert.ok(host.alive);
  assert.equal(s.winner, "evil");
  assert.ok(s.audit.some((x) => /chose You \(why: nobody but its own team is left to kill, besides you\); You was killed\./.test(x.text)));

  // With only their host, a Minion and you: you, not their Minion.
  const m = lleechGame("lleech-minion-left");

  role(m.p[0], "empath", "good");
  m.p[2].alive = false;
  m.s.phase = "night";
  m.s.night = 3;
  m.e.demon();
  assert.equal(m.p[0].alive, false);
  assert.ok(m.p[3].alive);

  // With a good NPC to kill, never you.
  const t = lleechGame("lleech-not-cornered");

  t.s.phase = "night";
  t.s.night = 3;
  t.e.demon();
  assert.ok(t.p[0].alive);
});

test("the evil team never kills, curses, chooses, nominates or votes for their Lleech's host", () => {
  const { s, e, p, d, host } = lleechGame("lleech-spared");
  const strat = new SimpleStrategy();
  const minion = p[3];

  s.phase = "night";
  s.night = 3;

  for (let i = 0; i < 100; i++) {
    s.r = rng(`spared-${i}`);
    assert.notEqual(strat.demon(s, d), host);

    for (const r of ["assassin", "godfather", "witch", "psychopath", "fearmonger"]) {
      role(minion, r, "evil");
      minion.fearTarget = null;

      const pick = r === "assassin" ? (strat.onceReady = () => true, strat.assassin(s)) : strat[r](s, minion);

      assert.notEqual(pick, host, r);
    }
  }

  s.phase = "day";
  strat.suspicion = (_, x) => (x.suspicion = { targetId: host.id, score: 99, reasons: [] });
  assert.equal(strat.nomination(s, minion), null);
  assert.equal(strat.vote(s, minion, host), false);
  assert.equal(strat.vote(s, d, host), false);
});

test("kept apart by the Poppy Grower, Minions don't know the Lleech's host; the Lleech still spares them", () => {
  const { s, p, d, host } = lleechGame("lleech-poppy");
  const strat = new SimpleStrategy();
  const minion = p[3];

  role(minion, "godfather", "evil");
  minion.poppyBlind = true;
  d.poppyBlind = true;

  assert.ok(!spares(s, minion, host));
  assert.ok(spares(s, d, host));
  assert.ok(strat.godfather(s, minion) !== undefined);
});

test("the Heretic and the Lleech are never in play together", () => {
  let lleechs = 0;

  for (let seed = 0; seed < 200; seed++) {
    const s = createState(outedSoFar3, 12, `heretic-lleech-${seed}`);
    const roles = s.players.map((x) => x.role);

    lleechs += roles.includes("lleech") ? 1 : 0;
    assert.ok(!(roles.includes("lleech") && roles.includes("heretic")), roles.join(","));
  }

  assert.ok(lleechs > 0);
  assert.ok(JINXES.some((j) => j.exclusive && j.ids.includes("heretic") && j.ids.includes("lleech")));
});

// A setup with the Poppy Grower dealt (as a good NPC).
function poppyGame(seed, extra = []) {
  const raw = [...outedSoFar3.filter((x) => x !== "lleech"), ...extra];

  for (let k = 0; k < 400; k++) {
    const s = createState(raw, 10, `${seed}-${k}`);

    if (s.players.some((x) => x.role === "poppygrower" && !x.human)) {
      return s;
    }
  }

  throw Error("no Poppy Grower dealt");
}

test("with the Poppy Grower in play, the Minions and Demon don't know each other, nor the Demon its bluffs", () => {
  const s = poppyGame("poppy-setup");
  const evil = s.players.filter((x) => x.alignment === "evil");
  const demon = evil.find((x) => team(x.role) === "demon");
  const minion = evil.find((x) => team(x.role) === "minion");

  assert.ok(evil.every((x) => x.poppyBlind));
  assert.deepEqual(demon.bluffs, []);
  assert.ok(!teammate(demon, minion) && !teammate(minion, demon));
  assert.ok(teammate(demon, demon));
  assert.ok(s.audit.some((x) => x.type === "poppygrower" && /don't learn who each other are/.test(x.text)));
  assert.match(s.audit.find((x) => x.type === "bluffs").text, /not told: the Poppy Grower/);
});

test("with the Poppy Grower in play, no Minion gets any bluffs either, not even a Spy or Widow", () => {
  let spies = 0;

  for (let seed = 0; seed < 300; seed++) {
    const s = createState([...outedSoFar3, "spy", "widow"], 12, `poppy-bluffs-${seed}`);

    if (!s.players.some((x) => x.role === "poppygrower")) {
      continue;
    }

    for (const p of s.players.filter((x) => x.alignment === "evil" && x.role !== "lunatic")) {
      spies += ["spy", "widow"].includes(p.role) ? 1 : 0;
      assert.deepEqual(p.bluffs, [], `${p.role}, seed ${seed}`);
      assert.ok(p.poppyBlind);
    }
  }

  assert.ok(spies > 0);
});

test("with the Poppy Grower in play, the Lunatic isn't shown their Minions or bluffs, until the Poppy Grower dies", () => {
  let s = null;

  for (let k = 0; k < 2000 && !s; k++) {
    const t = createState(outedSoFar3, 12, `poppy-lunatic-${k}`);

    if (
      t.players.some((x) => x.role === "poppygrower") &&
      t.players.some((x) => x.role === "lunatic" && !x.human)
    ) {
      s = t;
    }
  }

  assert.ok(s, "no game with both");

  const lunatic = s.players.find((x) => x.role === "lunatic");
  const pg = s.players.find((x) => x.role === "poppygrower");
  const e = new Engine(s);

  assert.deepEqual(lunatic.lunaticTeam, []);
  assert.deepEqual(lunatic.bluffs, []);
  assert.equal(team(lunatic.claim), "townsfolk");
  assert.match(
    s.audit.find((x) => x.type === "lunatic").text,
    /bluffs none \(the Poppy Grower\); .* "Minions": not shown \(the Poppy Grower\)\. The Demon knows who they are\./,
  );

  // Dead, they say they never saw them.
  s.phase = "day";
  s.day = 1;
  e.lunaticSays(lunatic, lunatic.shown, lunatic.lunaticTeam);
  assert.match(s.publicLog.at(-1), /I was never shown my Minions\."$/);

  // Once the Poppy Grower dies: shown that night.
  const later = lunatic.lunaticLater;

  e.kill(pg, "execution");
  s.phase = "night";
  e.poppyWakes();
  assert.deepEqual(lunatic.lunaticTeam, later.team);
  assert.deepEqual(lunatic.bluffs, later.bluffs);
  assert.ok(lunatic.lunaticTeam.length >= 2);
  assert.ok(s.audit.some((x) => /\(Lunatic\) is shown their "Minions"/.test(x.text)));
});

test("the Spy and Widow don't see the Grimoire while the Poppy Grower has their ability (their jinxes)", () => {
  const { s, e, p } = minionDay("poppy-spy", "spy");
  const strat = new SimpleStrategy();

  role(p[2], "poppygrower", "good");
  assert.ok(!strat.spyWorks(s, p[3]));
  assert.equal(bluffMode(s, p[3], "chef"), "lie");

  p[2].alive = false;
  assert.ok(strat.spyWorks(s, p[3]));
  assert.equal(bluffMode(s, p[3], "chef"), "truth");

  // The Widow still poisons, but sees nothing.
  const w = minionDay("poppy-widow", "widow");

  role(w.p[2], "poppygrower", "good");
  w.s.phase = "night";
  w.e.strat.widow = () => w.p[1];
  w.e.widows();
  assert.equal(w.s.widowGrimoire, undefined);
  assert.ok(w.p[1].poisoned);

  for (const id of ["spy", "widow"]) {
    assert.ok(JINXES.some((j) => j.ids.includes(id) && j.ids.includes("poppygrower")), id);
  }
});

test("a good Poppy Grower always hides, is a high-priority kill, and only comes clean once dead", () => {
  assert.equal(DEMON_KILL_PRIORITY.poppygrower, "high");

  const s = poppyGame("poppy-hides");
  const pg = s.players.find((x) => x.role === "poppygrower");
  const e = new Engine(s);

  s.day = 1;
  s.phase = "day";

  for (let i = 0; i < 20; i++) {
    s.r = rng(`hide-${i}`);
    assert.equal(e.strat.coverFor(s, pg)?.kind, "hide");
  }

  pg.cover = e.strat.coverFor(s, pg);
  assert.notEqual(pg.cover.as, "poppygrower");

  // Late in the game, alive: still hiding.
  for (const x of s.players.filter((y) => y !== pg && !y.human).slice(0, 6)) {
    x.alive = false;
  }

  e.dawnComeClean();
  assert.ok(pg.cover);

  // Dead: they come clean.
  pg.alive = false;
  e.dawnComeClean();
  assert.equal(pg.cover, null);
  assert.ok(s.publicLog.some((x) => /comes clean: "I was hiding as the .*; I'm really the Poppy Grower\./.test(x)));
});

test("when the Poppy Grower dies, the evil team learns who each other are that night (and the Demon its bluffs)", () => {
  const s = poppyGame("poppy-dies");
  const e = new Engine(s);
  const pg = s.players.find((x) => x.role === "poppygrower");
  const demon = s.players.find((x) => team(x.role) === "demon");
  const minion = s.players.find((x) => team(x.role) === "minion");

  s.phase = "day";
  s.day = 2;
  e.kill(pg, "execution");
  assert.ok(s.poppyWake);
  assert.ok(demon.poppyBlind);

  s.phase = "night";
  e.poppyWakes();
  assert.ok(!demon.poppyBlind && !minion.poppyBlind);
  assert.deepEqual(demon.bluffs, s.demonBluffs);
  assert.ok(teammate(demon, minion));
  assert.ok(s.audit.some((x) => /The Poppy Grower is dead: .* learn who each other are; .* learns its bluffs/.test(x.text)));

  // A drunk or poisoned one, dying, does nothing.
  const t = poppyGame("poppy-dies-poisoned");
  const tpg = t.players.find((x) => x.role === "poppygrower");

  tpg.poisoned = true;
  t.phase = "day";
  new Engine(t).kill(tpg, "execution");
  assert.ok(!t.poppyWake);
});

test("whole games play out with the Lleech and Poppy Grower, and each does its thing", () => {
  const seen = { host: 0, hostDied: 0, survived: 0, poppy: 0, poppyDied: 0 };

  for (let g = 0; g < 120; g++) {
    const { s } = playOut(outedSoFar3, 8 + (g % 8), `outed-3-${g}`);
    const text = s.audit.map((x) => x.text).join("\n");
    const hosts = s.players.filter((x) => x.role === "lleech").map((d) => d.lleechHost);

    assert.ok([null, "good", "evil"].includes(s.winner));
    assert.ok(!hosts.some((id) => byId(s, id)?.human), "never you");
    seen.host += /as their host/.test(text) ? 1 : 0;
    seen.hostDied += /the Lleech's host, died/.test(text) ? 1 : 0;
    seen.survived += /takes them for the Lleech/.test(text) ? 1 : 0;
    seen.poppy += s.audit.some((x) => x.type === "poppygrower") ? 1 : 0;
    seen.poppyDied += /The Poppy Grower is dead/.test(text) ? 1 : 0;
  }

  for (const [k, n] of Object.entries(seen)) {
    assert.ok(n > 0, `${k}: ${JSON.stringify(seen)}`);
  }
});

// ── Outed Evil, phase 4: the Alchemist and Wizard, and the whole script ──

const outed = JSON.parse(
  fs.readFileSync(new URL("../scripts/Outed Evil_5_0_0.json", import.meta.url)),
);

// A 5-player Day 1 (see base()) where p[2] is an Alchemist with `minion`'s
// ability (you, with `you`).
function alchemistDay(seed, minion, you = false) {
  const s = base(seed);
  const e = new Engine(s);
  const a = you ? s.players[0] : s.players[2];

  role(a, "alchemist", "good");
  a.alchemist = minion;

  return { s, e, p: s.players, a };
}

test("Outed Evil loads from the script list: 32 entries, its Travellers left out, the Sentinel kept apart", () => {
  const files = JSON.parse(fs.readFileSync(new URL("../scripts/index.json", import.meta.url)));

  assert.ok(files.includes("Outed Evil_5_0_0.json"));

  const s = createState(outed, 12, "outed");

  assert.equal(s.script.meta.name, "Outed Evil");
  assert.equal(s.script.ids.length, 25);
  assert.deepEqual(s.script.fabled, ["sentinel"]);

  for (const id of ["thief", "bureaucrat", "butcher", "apprentice", "deviant"]) {
    assert.ok(!s.script.ids.includes(id), id);
  }
});

test("the Alchemist has a Minion ability from the script that isn't in play, learned on Night 1", () => {
  const seen = new Set();

  for (let seed = 0; seed < 600; seed++) {
    const s = createState(outed, 10, `alchemist-${seed}`);

    for (const p of s.players.filter((x) => x.role === "alchemist" || x.shown === "alchemist")) {
      const roles = s.players.map((x) => x.role);

      assert.ok(ALCHEMIST_ABILITIES.includes(p.alchemist), `${p.alchemist}, seed ${seed}`);
      assert.ok(s.script.ids.includes(p.alchemist));
      assert.ok(!roles.includes(p.alchemist), `${p.alchemist} is in play, seed ${seed}`);
      assert.ok(s.audit.some((x) => x.type === "alchemist" && x.text.includes(`has the ${name(p.alchemist)} ability`)));
      seen.add(p.alchemist);
    }
  }

  assert.deepEqual([...seen].sort(), ["fearmonger", "goblin", "poisoner", "psychopath", "wizard"]);

  // Never the Spy, Widow, Marionette or Mastermind: by their jinxes, they'd
  // have no ability.
  for (const id of ["spy", "widow", "marionette", "mastermind"]) {
    assert.ok(!ALCHEMIST_ABILITIES.includes(id));
    assert.ok(JINXES.some((j) => j.ids.includes("alchemist") && j.ids.includes(id)), id);
  }

  // On Night 1 they learn it.
  const { s, p } = alchemistDay("alchemist-info", "goblin");

  assert.equal(infoOf("alchemist").truth(s, p[2]).text, "Alchemist: you have the Goblin ability.");
});

test("an Alchemist-Poisoner poisons the player they suspect; you choose", () => {
  const { s, e, p, a } = alchemistDay("alchemist-poisoner", "poisoner");

  s.phase = "night";
  s.night = 2;
  e.strat.suspicion = (_, x) => (x.suspicion = { targetId: p[4].id, score: 5, reasons: [] });
  e.alchemists();
  assert.ok(p[4].poisoned);
  assert.match(s.audit.at(-1).text, /\(Alchemist-Poisoner\) chose .*; poisoned\.$/);

  // You: woken, and your pick is poisoned.
  const y = alchemistDay("alchemist-poisoner-you", "poisoner", true);

  y.s.phase = "night";
  y.s.night = 2;
  assert.equal(y.e.wakeHuman()?.count, 1);
  assert.match(y.e.wakeHuman().prompt, /^Poisoner ability:/);
  y.s.humanChoice = { night: 2, players: [y.p[3]] };
  y.e.alchemists();
  assert.ok(y.p[3].poisoned);
  void a;
});

test("an Alchemist-Poisoner NPC tells you who they chose each night, after which ability they have", () => {
  const { s, e, p, a } = alchemistDay("alchemist-poisoner-tells", "poisoner");

  s.phase = "night";
  s.night = 2;
  e.strat.suspicion = (_, x) => (x.suspicion = { targetId: p[4].id, score: 5, reasons: [] });
  a.memories.push({ night: 1, role: "alchemist", text: "Alchemist: you have the Poisoner ability.", targets: [] });
  e.alchemists();
  e.alchemistTells();
  assert.equal(a.memories.at(-1).text, `Alchemist: chose ${p[4].label} to poison.`);
  assert.deepEqual(a.memories.at(-1).targets, []);

  s.phase = "day";
  s.day = 2;

  const said = e.strat.ask(s, a);

  assert.ok(said.includes("Night 1: I have the Poisoner ability."), said);
  assert.ok(said.includes(`Night 2: I chose ${p[4].label} to poison.`), said);

  // A pretend Alchemist-Poisoner (an evil bluffer) says so too.
  const b = p[3];

  b.claim = "alchemist";
  bluffState(b).said.alchemist = "poisoner";
  s.phase = "night";
  e.alchemistBluff(b);
  assert.match(b.memories.at(-1).text, /^Alchemist: chose .* to poison\.$/);
  assert.equal(b.memories.at(-1).functioning, false);
  void a;
});

test("an Alchemist-Fearmonger chooses their suspect: nominating and executing them, evil loses", () => {
  const { s, e, p, a } = alchemistDay("alchemist-fearmonger", "fearmonger");

  e.strat.suspicion = (_, x) => (x.suspicion = { targetId: p[4].id, score: 5, reasons: [] });
  s.phase = "night";
  s.night = 2;
  e.fearmonger();
  assert.equal(a.fearTarget, p[4].id);
  assert.match(s.audit.at(-1).text, /\(Alchemist-Fearmonger\) chose .*; if they nominate and execute them, evil loses\.$/);

  // They nominate them, and executing them wins it for good.
  s.phase = "day";
  s.day = 2;
  assert.equal(e.strat.nomination(s, a)?.target, p[4]);
  voted(s, a, p[4]);
  e.execute(p[4]);
  assert.equal(s.winner, "good");

  // You're woken to choose.
  const y = alchemistDay("alchemist-fearmonger-you", "fearmonger", true);

  y.s.phase = "night";
  y.s.night = 2;
  assert.match(y.e.wakeHuman().prompt, /^Fearmonger ability:/);
});

test("an Alchemist-Psychopath only kills a player they're sure of, saying so, and isn't taken for evil; you can too, before nominations", () => {
  const { s, e, p, a } = alchemistDay("alchemist-psychopath", "psychopath");

  e.strat.strongSuspect = () => null;
  e.psychopathKills();
  assert.ok(p.every((x) => x.alive));

  e.strat.strongSuspect = () => p[4];
  e.psychopathKills();
  assert.equal(p[4].alive, false);
  assert.match(s.publicLog.join("\n"), /publicly chooses .* \(with the Alchemist's Psychopath ability\): they die\./);
  assert.equal(a.claim, "alchemist");
  assert.ok(!(s.outed ?? []).some((x) => x.id === a.id));

  // You.
  const y = alchemistDay("alchemist-psychopath-you", "psychopath", true);

  y.e.psychopathKill(y.p[3].id);
  assert.equal(y.p[3].alive, false);
  assert.match(y.s.publicLog.join("\n"), /You publicly choose .*: they die\./);
  assert.throws(() => y.e.psychopathKill(y.p[1].id), /unavailable/);

  const z = alchemistDay("alchemist-psychopath-late", "psychopath", true);

  z.s.nominationsOpen = true;
  assert.throws(() => z.e.psychopathKill(z.p[3].id), /unavailable/);

  // A player their kill failed on (here, the Lleech, whose host lives),
  // they don't choose again while that holds.
  const w = alchemistDay("alchemist-psychopath-foiled", "psychopath");

  role(w.p[4], "lleech", "evil");
  w.p[4].lleechHost = w.p[1].id;
  w.e.strat.strongSuspect = (s, x, pool) => pool.find((y) => y === w.p[4]) ?? null;
  w.e.psychopathKills();
  assert.ok(w.p[4].alive);
  assert.deepEqual(w.a.foiled, [w.p[4].id]);
  assert.equal(w.e.strat.psychopath(w.s, w.a), null);
});

test("an Alchemist-Goblin claims it when nominated; executed, good wins; the evil team never votes for them", () => {
  const { s, e, p, a } = alchemistDay("alchemist-goblin", "goblin");

  s.r = () => 0;
  assert.match(e.nominationReveals(a)[0], /says: "I'm the Goblin! Execute me today, and my team wins\."/);
  s.r = () => 0.5;
  assert.equal(e.strat.vote(s, p[4], a), false);
  voted(s, p[1], a);
  e.execute(a);
  assert.equal(s.winner, "good");

  // You nominate yourself, and claim it.
  const y = alchemistDay("alchemist-goblin-you", "goblin", true);

  y.e.openNominations();
  y.e.goblinSelfNomination(true);
  assert.ok(y.s.publicLog.some((x) => x === "Day 1 — You nominate yourself."));
  assert.ok(y.s.publicLog.some((x) => /You say: "I'm the Goblin! Execute me today, and my team wins\."/.test(x)));
  assert.throws(() => y.e.goblinSelfNomination(true), /already nominated/);
});

test("the Wizard's wishes: a death (never the Demon), the Grimoire (evil only), or who the Demon is (good only, at a price)", () => {
  // An evil Wizard: a death, at night, with a clue at dawn.
  let { s, e, p } = minionDay("wizard-death", "wizard");
  const w = p[3];

  assert.match(e.wishFor(w, "death", p[4]), /isn't granted/);
  assert.ok(!w.wished);
  assert.match(e.wishFor(w, "demon"), /isn't granted/);
  assert.equal(e.wishFor(w, "death", p[1]), `Your wish is granted: ${p[1].label} dies tonight.`);
  assert.equal(w.wished, 1);
  s.phase = "night";
  s.night = 2;
  e.wizardNight();
  assert.equal(p[1].alive, false);
  assert.equal(p[1].death, "wizard");
  s.day = 2;
  e.wizardDawn();
  assert.equal(s.publicLog.at(-1), `Day 2 — The Storyteller: a wish was granted, and ${p[1].label} died of it.`);

  // The Grimoire: the evil team knows every character.
  ({ s, e, p } = minionDay("wizard-grimoire", "wizard"));
  e.wishFor(p[3], "grimoire");
  assert.equal(new SimpleStrategy().seenRole(s, p[1], p[4]), p[1].role);

  // A good one (you, an Alchemist): the Demon, and the Demon learns who wished.
  const y = alchemistDay("wizard-you", "wizard", true);

  assert.match(y.e.wish("grimoire"), /isn't granted/);
  assert.throws(() => y.e.wish("death"), /Select a living player/);
  y.e.wish("demon");
  assert.equal(y.p[4].wisherId, y.p[0].id);
  assert.ok(y.p[0].memories.some((m) => m.text === `Wizard: the Demon is ${y.p[4].label}.`));
  assert.throws(() => y.e.wish("demon"), /unavailable/);
});

test("an NPC Wizard wishes in time; a good one learns the Demon, whom the Demon then goes after", () => {
  const { s, e, p, a } = alchemistDay("wizard-npc", "wizard");

  s.day = 2;
  s.r = () => 0;
  e.npcWishes();
  assert.equal(a.wished, 2);
  assert.equal(a.certainSuspect, p[4].id);
  assert.equal(p[4].wisherId, a.id);

  s.phase = "night";
  s.night = 3;
  assert.equal(new SimpleStrategy().demon(s, p[4]), a);
});

test("the Wizard's whispers wish (good only): the town hears the Demon's bluffs, and the Demon learns new ones", () => {
  // An evil Wizard knows them already.
  const evil = minionDay("wizard-whispers-evil", "wizard");

  assert.match(evil.e.wishFor(evil.p[3], "whispers"), /isn't granted/);

  const { s, e, p } = alchemistDay("wizard-whispers", "wizard", true);
  const old = [...s.demonBluffs];

  // (The Demon claims one of them, in public.)
  Object.assign(p[4], { claim: old[0], publicClaim: old[0], claimKnown: true, bluffs: old });
  assert.match(e.wish("whispers"), /granted/);
  assert.deepEqual(s.exposedBluffs, old);
  assert.equal(s.demonBluffs.length, old.length);
  assert.ok(s.demonBluffs.every((x) => !old.includes(x) && !s.players.some((y) => y.role === x)));
  assert.deepEqual(p[4].bluffs, s.demonBluffs);
  assert.ok(s.announced.includes(s.publicLog.length - 1));
  assert.match(s.publicLog.at(-1), /The Demon was told these characters are not in play: /);
  assert.ok(s.audit.some((x) => /Clue: exposed: .* claims the /.test(x.text)));

  // Claiming one of them is now evidence of being evil.
  assert.ok(
    e.strat.evidence(s, p[1], p[4]).reasons.some((x) => /one of the Demon's bluffs/.test(x)),
  );
  assert.match(formatLog(s), /made public by a Wizard's wish/);
});

test("the Wizard's second-execution wish: nominations open again after the execution, without the Wizard", () => {
  const { s, e, p } = minionDay("wizard-second", "wizard");
  const w = p[3];

  assert.match(e.wishFor(w, "second"), /granted/);
  assert.match(s.publicLog.at(-1), /there will be a second execution today/);
  assert.match(e.wishFor(p[3], "second"), /isn't granted|Not today/);

  e.openNominations();
  s.block = { nomineeId: p[1].id, count: 3 };
  e.endDay();
  assert.equal(p[1].alive, false);
  assert.equal(s.phase, "day");
  assert.equal(s.nominationsOpen, true);
  assert.deepEqual(s.dayNominators, []);
  assert.ok(s.phaseCards.some((c) => c.kind === "nominations" && c.lines.some((x) => /open again/.test(x))));

  // The price: the Wizard can't nominate or vote in it.
  assert.ok(!e.npcNominators().some((o) => o.p === w));
  assert.equal(e.intents(p[2])[w.id], false);
  assert.equal(e.strat.nominator(s, p[2]) === w, false);

  // Then the day ends.
  e.endDay();
  assert.notEqual(s.day, 1);
});

test("the Wizard's second execution is only granted with 5 or more alive", () => {
  const { s, e, p } = minionDay("wizard-second-few", "wizard");

  p[1].alive = false;
  assert.match(e.wishFor(p[3], "second"), /Not today/);
});

test("the Wizard's gift wish (evil, Day 1 only): the Demon gains a Virgin or Fool ability not in play, and the Wizard dies that night", () => {
  // A good Wizard, or too late: not granted.
  const y = alchemistDay("wizard-gift-good", "wizard", true);

  assert.match(y.e.wish("gift"), /too much/);

  const late = minionDay("wizard-gift-late", "wizard");

  late.s.day = 2;
  assert.match(late.e.wishFor(late.p[3], "gift"), /too late/);

  // The Virgin: the Demon claims it, so it gets it.
  let { s, e, p } = minionDay("wizard-gift-virgin", "wizard");
  const w = p[3];

  p[4].claim = "virgin";
  assert.match(e.wishFor(w, "gift"), /granted/);
  assert.equal(p[4].wishGift, "virgin");

  // You (the Mayor, a Townsfolk) nominate the Demon: you're executed.
  e.openNominations();
  e.nominate(p[4].id, true);
  assert.equal(p[0].alive, false);
  assert.ok(s.audit.some((x) => /with the Virgin ability from a Wizard's wish/.test(x.text)));

  // The price: the Wizard dies that night, and the town hears of it.
  s.phase = "night";
  s.night = 2;
  e.wizardNight();
  assert.equal(w.alive, false);
  s.day = 2;
  e.wizardDawn();
  assert.equal(
    s.publicLog.at(-1),
    `Day 2 — The Storyteller: a wish was granted, and ${w.label} paid for it with their life.`,
  );

  // The Fool: the Demon survives its first execution.
  ({ s, e, p } = minionDay("wizard-gift-fool", "wizard"));
  p[4].claim = "fool";
  e.wishFor(p[3], "gift");
  assert.equal(p[4].wishGift, "fool");
  e.execute(p[4]);
  assert.equal(p[4].alive, true);
  assert.equal(s.winner, null);
});

test("an evil NPC Wizard wishes for the Demon's gift on Day 1; a good one picks among the good wishes", () => {
  const { s, p } = minionDay("wizard-gift-npc", "wizard");
  const strat = new SimpleStrategy();

  s.r = () => 0;
  assert.deepEqual(strat.wish(s, p[3]), { kind: "gift" });

  const g = alchemistDay("wizard-good-npc", "wizard");

  g.s.day = 2;
  g.s.r = () => 0.99;
  assert.equal(strat.wish(g.s, g.a).kind, "second");
});

test("whole games play out on Outed Evil, with every character doing its thing", () => {
  const seen = {};
  const note = (k, yes) => (seen[k] = (seen[k] ?? 0) + (yes ? 1 : 0));

  for (let g = 0; g < 160; g++) {
    const { s } = playOut(outed, 8 + (g % 8), `outed-${g}`);
    const text = s.audit.map((x) => x.text).join("\n");

    assert.ok([null, "good", "evil"].includes(s.winner));
    note("alchemist", s.audit.some((x) => x.type === "alchemist"));
    note("wish", /wished: /.test(text));
    note("host", /as their host/.test(text));
    note("goblin", /I'm the Goblin!/.test(text));
    note("fearmonger", s.audit.some((x) => x.type === "fearmonger"));
    note("psychopath", /publicly chooses/.test(s.publicLog.join("\n")));
    note("general", /General: .* winning/.test(text));
    note("poppy", s.audit.some((x) => x.type === "poppygrower"));
  }

  for (const [k, n] of Object.entries(seen)) {
    assert.ok(n > 0, `${k}: ${JSON.stringify(seen)}`);
  }
});

test("on Outed Evil, every claim and bluff fits its character, all game", () => {
  const seen = { alchemistBluff: 0, feared: 0 };

  for (let g = 0; g < 120; g++) {
    const s = createState(outed, 8 + (g % 8), `outed-bluffs-${g}`);
    const e = new Engine(s);
    const first = new Map();
    const check = (when) => {
      const host = s.players.find((d) => d.alive && d.role === "lleech")?.lleechHost;
      const fear = s.players.find((f) => f.alive && f.role === "fearmonger" && f.fearTarget)?.fearTarget;
      const goat = s.scapegoat && byId(s, s.scapegoat);

      // The evil team never frames their Lleech's host, and frames the
      // Fearmonger's player when it can.
      assert.ok(!host || s.scapegoat !== host, `game ${g}, ${when}: framing the host`);
      seen.feared += fear && s.scapegoat === fear ? 1 : 0;

      for (const p of s.players.filter((x) => !x.human && x.alive)) {
        const claim = p.cover?.as ?? p.claim;

        // Evil players claim good characters: only the Psychopath, Goblin,
        // Heretic and Lunatic are claimed as themselves, or in a fake.
        if (p.alignment === "evil" && !["psychopath", "goblin", "heretic", "lunatic", "alchemist"].includes(claim)) {
          assert.equal(alignment(claim), "good", `game ${g}, ${when}: ${p.label} (${p.role}) claims ${claim}`);
        }

        // Nobody claims the Heretic openly before saying so in the final 3.
        if (claim === "heretic") {
          assert.equal(s.hereticClaim, p.id, `game ${g}, ${when}: ${p.label} claims the Heretic`);
        }

        // An Alchemist pretender has a quiet ability, never a teammate's.
        const said = p.bluffState?.said?.alchemist;

        if (said && claim === "alchemist" && p.role !== "alchemist") {
          seen.alchemistBluff++;
          assert.notEqual(said, "fearmonger", `game ${g}`);

          // (Judged by what they knew when they first said it.)
          if (p.alignment === "evil" && !first.has(p.id)) {
            const known = p.poppyBlind ? [p] : s.players.filter((x) => x.alignment === "evil");

            first.set(p.id, said);
            assert.ok(!known.some((x) => x.role === said), `game ${g}: ${p.label} says the ${said}, one of theirs`);
          }
        }
      }

      void goat;
    };

    // Nobody evil bluffs the Poppy Grower openly at setup.
    for (const p of s.players.filter((x) => x.alignment === "evil")) {
      assert.notEqual(p.claim, "poppygrower", `game ${g}`);
    }

    const audit = e.audit.bind(e);

    e.audit = (...args) => {
      const r = audit(...args);

      check(args[1]);
      return r;
    };

    e.start();

    for (let turn = 0; turn < 40 && !s.winner; turn++) {
      settle(e);

      if (s.winner) {
        break;
      }

      for (const p of s.players.filter((x) => !x.human && x.alive).slice(0, 2)) {
        try {
          e.ask(p.id);
        } catch {
          // (No conversations left.)
        }
      }

      if (s.phase === "day" && !s.pendingVote && !s.roshambo && !s.boom) {
        e.endDay();
      }
    }
  }

  assert.ok(seen.feared > 0, JSON.stringify(seen));
});

// ── Bluffs that don't keep naming the same player; log 19–21 fixes ──

test("a Gossip never says just what they said yesterday, and an evil one slanders other good players", () => {
  const s = base("gossip-fresh");
  const strat = new SimpleStrategy();
  const [, chef, butler, baron] = s.players;

  role(baron, "baron", "evil");
  baron.claim = "gossip";
  strat.strongSuspect = (st, p, pool) => pool.find((x) => x === chef) ?? null;
  strat.suspect = (st, p, pool) => pool.find((x) => x === chef) ?? null;

  const said = [];

  for (let day = 1; day <= 4; day++) {
    s.day = day;
    s.r = rng(`gossip-fresh-${day}`);

    const g = strat.gossip(s, baron, true);

    said.push(`${g.target.label}:${g.question}`);
  }

  for (let i = 1; i < said.length; i++) {
    assert.notEqual(said[i], said[i - 1], said.join(" | "));
  }

  assert.ok(said.some((x) => x.startsWith(butler.label)), said.join(" | "));
});

test("made-up choices don't name last time's player while anyone else fits; when nobody does, the log says why", () => {
  let varied = 0;
  let nights = 0;

  for (let seed = 0; seed < 30; seed++) {
    const s = createState(script, 12, `monk-vary-${seed}`);
    const e = new Engine(s);
    const imp = s.players.find((x) => x.role === "imp");

    imp.claim = "monk";
    imp.bluff = "monk";
    e.start();

    for (let t = 0; t < 4 && !s.winner; t++) {
      settle(e);

      if (s.phase === "day" && !s.winner) {
        e.endDay();
      }
    }

    const ms = imp.memories.filter((m) => m.role === "monk");

    for (let i = 1; i < ms.length; i++) {
      nights++;
      varied += ms[i].targets[0] !== ms[i - 1].targets[0] ? 1 : 0;

      if (ms[i].targets[0] === ms[i - 1].targets[0]) {
        assert.ok(
          s.audit.some((x) => /names the same player\(s\) as last time, for want of anything else that fits/.test(x.text)),
          `seed ${seed}`,
        );
      }
    }
  }

  assert.ok(nights > 0 && varied / nights > 0.9, `${varied} of ${nights}`);
});

test("in the Round Robin, a player made mad today says they're the character they're mad about, and nothing else", () => {
  const s = base("rr-mad");
  const e = new Engine(s);
  const chef = s.players[1];

  s.players.forEach((x, i) => (x.alive = i < 4));
  s.nominationsOpen = true;
  chef.memories = [{ night: 1, role: "chef", text: "Chef number: 0.", targets: [] }];
  chef.mad = { role: "savant", day: s.day, previous: "chef", memories: [] };
  chef.claim = "savant";
  e.roundRobin();

  const line = s.publicLog.at(-1).split("\n").find((x) => x.startsWith(`${chef.label}:`));

  assert.match(line, /I am the Savant\./);
  assert.doesNotMatch(line, /Chef number/);
});

test("nobody votes to execute themself, even for your pick in the final 3, but a Goblin who claimed it or a Boomdandy", () => {
  const s = base("self-vote");
  const strat = new SimpleStrategy();
  const [, chef, , baron] = s.players;

  // Good or evil, any day, your nomination or not.
  for (let i = 0; i < 50; i++) {
    s.r = rng(`self-vote-${i}`);
    assert.equal(strat.vote(s, chef, chef, { yes: 4, needed: 3, nominator: s.players[0] }), false);
    assert.equal(strat.vote(s, baron, baron, { yes: 4, needed: 3 }), false);
  }

  s.players.forEach((x, i) => (x.alive = i < 3));
  assert.equal(strat.vote(s, chef, chef, { humanChoice: true }), false);
  assert.equal(strat.vote(s, s.players[2], chef, { humanChoice: true }), true);

  // A Goblin who claimed it today votes for themself.
  const t = minionDay("self-vote-goblin", "goblin");

  t.s.goblinClaims = [{ id: t.p[3].id, day: t.s.day }];
  assert.equal(strat.vote(t.s, t.p[3], t.p[3]), true);
});

test("an evil High Priestess bluffer kept apart by the Poppy Grower never sends you to an unknown teammate", () => {
  const s = base("hp-blind");
  const [, , , baron, imp] = s.players;

  role(baron, "baron", "evil");
  baron.poppyBlind = true;
  baron.claim = "highpriestess";

  for (let i = 0; i < 30; i++) {
    s.r = rng(`hp-blind-${i}`);
    assert.notEqual(infoOf("highpriestess").lie(s, baron).targets[0], imp.id);
  }
});

test("whole games play out with the General, Heretic and Politician", () => {
  for (let g = 0; g < 40; g++) {
    const { s } = playOut(outedSoFar, 8 + (g % 8), `outed-1-${g}`);

    assert.ok([null, "good", "evil"].includes(s.winner));
  }
});

// ── Self-play (testing only) ─────────────────────────────────────

test("self-play plays whole games to the end on every script, logging its moves", () => {
  const files = JSON.parse(
    fs.readFileSync(new URL("../scripts/index.json", import.meta.url)),
  );

  for (const f of files) {
    const raw = JSON.parse(
      fs.readFileSync(new URL(`../scripts/${encodeURIComponent(f)}`, import.meta.url)),
    );

    for (let g = 0; g < 12; g++) {
      const s = createState(raw, 8 + (g % 8), `selfplay-${g}`);
      const e = new Engine(s);

      e.start();
      new SelfPlay(e).play();

      assert.ok(["good", "evil"].includes(s.winner), `${f} game ${g} didn't end`);
      assert.ok(s.audit.some((x) => x.type === "selfplay"));
    }
  }
});

test("self-play is deterministic: the same seed plays the same game", () => {
  const run = () => {
    const s = createState(script, 10, "selfplay-same");
    const e = new Engine(s);

    e.start();
    new SelfPlay(e).play();
    return e.debugLog();
  };

  assert.equal(run(), run());
});

// ── No Roles Barred: the Bounty Hunter and Lil' Monsta ───────────

const nrb = JSON.parse(
  fs.readFileSync(new URL("../scripts/No Roles Barred_1_0_1.json", import.meta.url)),
);

// A 5-player Day 1 (see base()) with Lil' Monsta: you (Mayor), a Chef, a
// Butler, and two Minions, `a` (p[3]) babysitting it, and `b` (p[4]).
function lilDay(seed, a = "poisoner", b = "godfather") {
  const s = base(seed);
  const e = new Engine(s);
  const p = s.players;

  role(p[3], a, "evil");
  role(p[4], b, "evil");

  for (const x of p) {
    x.babysitting = x === p[3];
  }

  s.lilMonsta = { fixed: null };

  return { s, e, p };
}

// A 5-player Day 1 (see base()) with a Bounty Hunter (p[1]) and their evil
// Townsfolk, a Chef (p[2]); the Baron (p[3]) and Imp (p[4]) as usual.
function bountyDay(seed) {
  const s = base(seed);
  const e = new Engine(s);
  const p = s.players;

  role(p[1], "bountyhunter", "good");
  role(p[2], "chef", "evil");
  p[2].evilTownsfolk = true;

  return { s, e, p };
}

test("No Roles Barred loads from the script list: 25 characters, with the Bounty Hunter's and Lil' Monsta's jinxes", () => {
  const files = JSON.parse(fs.readFileSync(new URL("../scripts/index.json", import.meta.url)));

  assert.ok(files.includes("No Roles Barred_1_0_1.json"));

  const s = createState(nrb, 12, "nrb");

  assert.equal(s.script.meta.name, "No Roles Barred");
  assert.equal(s.script.ids.length, 25);

  for (const pair of [
    ["bountyhunter", "philosopher"],
    ["marionette", "lilmonsta"],
    ["lilmonsta", "poppygrower"],
    ["lilmonsta", "psychopath"],
    ["lilmonsta", "magician"],
    ["lilmonsta", "scarletwoman"],
  ]) {
    assert.ok(
      JINXES.some((j) => pair.every((id) => j.ids.includes(id))),
      pair.join(" / "),
    );
  }

  // Both have night order steps, and a note on how the game runs them.
  assert.ok(FIRST_NIGHT.some(([id]) => id === "lilmonsta"));
  assert.ok(OTHER_NIGHTS.some(([id]) => id === "lilmonsta"));
  assert.ok(FIRST_NIGHT.some(([id]) => id === "bountyhunter"));
  assert.ok(OTHER_NIGHTS.some(([id]) => id === "bountyhunter"));
  assert.ok(NOTES.lilmonsta && NOTES.bountyhunter);
});

test("Lil' Monsta is never dealt: an extra Minion is, and one Minion babysits it and registers as the Demon", () => {
  let games = 0;

  for (let g = 0; g < 300 && games < 20; g++) {
    const seats = 8 + (g % 8);
    const s = createState(nrb, seats, `lil-deal-${g}`);

    if (!s.lilMonsta) {
      continue;
    }

    games++;

    const sitters = s.players.filter((x) => x.babysitting);
    const minions = s.players.filter((x) => team(x.role) === "minion");

    assert.ok(!s.players.some((x) => team(x.role) === "demon"), `game ${g}`);
    assert.equal(minions.length, COUNTS[seats][2] + 1);
    assert.equal(sitters.length, 1);
    assert.equal(team(sitters[0].role), "minion");
    assert.ok(isDemon(sitters[0]));
    assert.ok(!s.players.some((x) => x.role === "lilmonsta" || x.shown === "lilmonsta"));
    assert.ok(s.audit.some((x) => x.type === "lilmonsta" && /babysits it first/.test(x.text)));

    // The Minions know each other (unless the Poppy Grower keeps them apart).
    for (const m of minions.filter((x) => !x.poppyBlind)) {
      assert.ok(minions.every((x) => teammate(m, x)), `game ${g}`);
    }
  }

  assert.ok(games >= 10, `${games} Lil' Monsta games`);
});

test("by their jinx, a Marionette starts next to Lil' Monsta's first babysitter", () => {
  const raw = [
    { id: "_meta", name: "Marionette test" },
    ..."lilmonsta marionette poisoner chef empath monk soldier mayor slayer librarian investigator butler recluse".split(" "),
  ];
  let checked = 0;

  for (let g = 0; g < 60; g++) {
    const s = createState(raw, 8, `lil-marionette-${g}`);
    const m = s.players.findIndex((x) => x.role === "marionette");
    const d = s.players.findIndex((x) => x.babysitting);
    const n = s.players.length;

    assert.ok(d >= 0 && s.players[d].role === "poisoner", `game ${g}`);

    if (m > 0) {
      checked++;
      assert.ok([(d + 1) % n, (d + n - 1) % n].includes(m), `game ${g}: Marionette ${m}, babysitter ${d}`);
    }
  }

  assert.ok(checked > 0);
});

test("each night the Minions move Lil' Monsta to the Minion the town suspects least, logged with why", () => {
  const { s, e, p } = lilDay("lil-choose");

  s.phase = "night";
  s.night = 2;
  p[1].suspicion = { targetId: p[3].id };
  p[2].suspicion = { targetId: p[3].id };
  e.lilMonsta();

  assert.ok(p[4].babysitting && !p[3].babysitting);
  assert.ok(isDemon(p[4]) && !isDemon(p[3]));
  assert.ok(
    s.audit.some((x) =>
      /Lil' Monsta moves to Player 5 \(Godfather\), from Player 4: .*why: the Minion the town suspects least: Player 4 2, Player 5 0/.test(x.text),
    ),
  );

  // On a tie it stays where it is.
  p[1].suspicion = null;
  p[2].suspicion = null;
  e.lilMonsta();
  assert.ok(p[4].babysitting);
  assert.ok(s.audit.some((x) => /Lil' Monsta stays with Player 5/.test(x.text)));
});

test("with the Poppy Grower alive, Lil' Monsta's babysitter keeps it; with the Magician alive, the Storyteller chooses (their jinxes)", () => {
  const poppy = lilDay("lil-poppy");

  role(poppy.p[2], "poppygrower", "good");
  poppy.s.phase = "night";
  poppy.s.night = 2;
  poppy.p[1].suspicion = { targetId: poppy.p[3].id };
  poppy.e.lilMonsta();
  assert.ok(poppy.p[3].babysitting);
  assert.ok(poppy.s.audit.some((x) => /Poppy Grower is alive, so the Minions wake one by one/.test(x.text)));

  const magician = lilDay("lil-magician");

  role(magician.p[2], "magician", "good");
  magician.s.phase = "night";
  magician.s.night = 2;
  magician.s.r = () => 0.99;
  magician.e.lilMonsta();
  assert.ok(magician.p[4].babysitting);
  assert.ok(magician.s.audit.some((x) => /Magician is alive, so the Storyteller chooses/.test(x.text)));
});

test("Lil' Monsta's night kill: the Storyteller's choice, never its babysitter, and drunkenness or poison can't stop it", () => {
  const { s, e, p } = lilDay("lil-kill");

  s.phase = "night";
  s.night = 2;
  p[3].poisoned = true;
  e.demon();

  const kill = s.audit.find((x) => x.type === "demon");

  assert.ok(p[3].alive);
  assert.match(kill.text, /^Lil' Monsta \(babysat by Player 4, the Poisoner\) chose .*why: the Storyteller's choice.*was killed\./);
  assert.equal(s.players.filter((x) => !x.alive).length, 1);

  // With no NPC it can kill (each protected by the Monk), it kills you, as
  // any Demon does; with you dead too, nobody dies.
  const t = lilDay("lil-kill-you");

  role(t.p[0], "empath", "good");
  t.s.phase = "night";
  t.s.night = 2;

  for (const x of [t.p[1], t.p[2], t.p[4]]) {
    x.protected = true;
  }

  t.e.demon();
  assert.equal(t.p[0].alive, false);
  assert.ok(t.s.audit.some((x) => /chose You \(why: the Storyteller's choice: nobody but its own team is left to kill, besides you\)/.test(x.text)));

  t.s.night = 3;
  t.e.demon();
  assert.ok([t.p[1], t.p[2], t.p[3], t.p[4]].every((x) => x.alive));
  assert.ok(t.s.audit.some((x) => /Lil' Monsta: nobody dies tonight/.test(x.text)));
});

test("if Lil' Monsta's babysitter dies, good wins; by their jinx, with 5 or more alive the Scarlet Woman babysits it for good", () => {
  const plain = lilDay("lil-dies");

  plain.e.execute(plain.p[3]);
  assert.equal(plain.s.winner, "good");
  assert.equal(plain.s.reason, "Lil' Monsta's babysitter died.");

  const { s, e, p } = lilDay("lil-scarlet", "poisoner", "scarletwoman");

  e.execute(p[3]);
  assert.equal(s.winner, null);
  assert.ok(p[4].babysitting && isDemon(p[4]));
  assert.equal(p[4].role, "scarletwoman");
  assert.equal(s.lilMonsta.fixed, p[4].id);
  assert.ok(s.audit.some((x) => /Scarlet Woman\) babysits it for the rest of the game/.test(x.text)));

  // (And keeps it, whatever the town thinks.)
  role(p[2], "poisoner", "evil");
  s.phase = "night";
  s.night = 2;
  p[1].suspicion = { targetId: p[4].id };
  e.lilMonsta();
  assert.ok(p[4].babysitting && !p[2].babysitting);
});

test("a Psychopath babysitting Lil' Monsta dies when executed, with no roshambo (their jinx)", () => {
  const { s, e, p } = lilDay("lil-psychopath", "psychopath");

  s.voteHistory = [{ day: 1, nominatorId: p[1].id, nomineeId: p[3].id, voterIds: [] }];
  assert.equal(e.psychopathExecuted(p[3]), null);
  assert.ok(s.audit.some((x) => /is babysitting Lil' Monsta, so they die when executed: no roshambo/.test(x.text)));

  e.execute(p[3]);
  assert.equal(p[3].alive, false);
  assert.equal(s.winner, "good");
});

test("a Snake Charmer who swaps with Lil' Monsta's babysitter takes their Minion character, and Lil' Monsta with it", () => {
  const { s, e, p } = lilDay("lil-snake");

  role(p[1], "snakecharmer", "good");
  e.snakeSwap(p[1], p[3]);

  assert.equal(p[1].role, "poisoner");
  assert.equal(p[1].alignment, "evil");
  assert.ok(p[1].babysitting && !p[3].babysitting);
  assert.equal(p[3].role, "snakecharmer");
  assert.ok(s.audit.some((x) => /became the Poisoner, babysitting Lil' Monsta/.test(x.text)));
});

test("the Bounty Hunter makes one Townsfolk NPC evil at setup, who doesn't know the evil team, nor it them", () => {
  let games = 0;

  for (let g = 0; g < 300 && games < 20; g++) {
    const s = createState(nrb, 8 + (g % 8), `bounty-deal-${g}`);
    const bh = s.players.find((x) => x.role === "bountyhunter");

    if (!bh) {
      assert.ok(!s.players.some((x) => x.evilTownsfolk), `game ${g}`);
      continue;
    }

    games++;

    const t = s.players.filter((x) => x.evilTownsfolk);

    assert.equal(t.length, 1, `game ${g}`);
    assert.ok(!t[0].human && t[0] !== bh);
    assert.equal(team(t[0].role), "townsfolk");
    assert.equal(t[0].alignment, "evil");
    assert.equal(t[0].claim, t[0].role);
    assert.deepEqual(t[0].bluffs, []);
    assert.ok(s.audit.some((x) => x.type === "bountyhunter" && /is evil\. They know they're evil/.test(x.text)));

    for (const x of s.players.filter((y) => y.alignment === "evil" && y !== t[0])) {
      assert.ok(!teammate(x, t[0]) && !teammate(t[0], x), `game ${g}`);
    }
  }

  assert.ok(games >= 10, `${games} Bounty Hunter games`);
});

test("the Bounty Hunter learns an evil player, and another each night after the one they know dies", () => {
  const { s, e, p } = bountyDay("bounty-info");
  const strat = new SimpleStrategy();

  s.phase = "night";
  s.night = 1;

  const first = nightInfo(s, p[1], strat);

  assert.equal(first.targets.length, 1);

  const known = byId(s, first.targets[0]);

  assert.equal(known.alignment, "evil");
  assert.equal(first.text, `Bounty Hunter: ${known.label} is evil.`);
  e.remember(p[1], first);

  // Not while that player lives.
  s.night = 2;
  assert.equal(nightInfo(s, p[1], strat), null);

  // Once they're dead, another evil player, never the same one twice.
  known.alive = false;

  const next = nightInfo(s, p[1], strat);

  assert.equal(next.targets.length, 1);
  assert.notEqual(next.targets[0], known.id);
  assert.equal(byId(s, next.targets[0]).alignment, "evil");
});

test("an evil NPC bluffing the Bounty Hunter names a good player, never a teammate, nor you", () => {
  for (let g = 0; g < 30; g++) {
    const s = base(`bounty-bluff-${g}`);
    const p = s.players;

    p[3].claim = "bountyhunter";
    s.phase = "night";

    const m = bluffTonight(s, p[3], new SimpleStrategy());

    assert.equal(m.targets.length, 1, `game ${g}`);

    const t = byId(s, m.targets[0]);

    assert.equal(t.alignment, "good");
    assert.ok(!t.human);
  }
});

test("the evil Townsfolk keeps their own information to themself, and holds back from the players they suspect, saying so in log.txt", () => {
  const { s, p } = bountyDay("bounty-blind");
  const strat = new SimpleStrategy();

  // Their own information points at the Baron and Imp.
  p[2].ownInfo = [
    {
      night: 1,
      role: "noble",
      text: "Noble: one of Player 4, Player 5 and You is evil.",
      targets: [p[0].id, p[3].id, p[4].id],
    },
  ];

  assert.deepEqual(strat.hunches(s, p[2]), [p[3].id, p[4].id]);
  assert.ok(
    s.audit.some((x) =>
      /Player 3 \(Chef\), the evil Townsfolk, suspects Player 4 \(their own information\), Player 5 \(their own information\) of being on their team/.test(x.text),
    ),
  );

  // They don't point at them...
  assert.equal(strat.suspicion(s, p[2]).targetId, p[1].id);

  // ...nor make up information against them, while the rest of the team
  // doesn't cover for them.
  assert.ok(covered(p[2], p[3]) && covered(p[2], p[4]) && !covered(p[2], p[1]));
  assert.ok(!covered(p[3], p[2]) && covered(p[3], p[4]));
  assert.ok(knows(s, p[2], strat).evil.has(p[3].id));

  // ...and mostly don't vote for them.
  s.r = () => 0.5;
  assert.equal(strat.vote(s, p[2], p[3]), false);
  assert.ok(s.audit.some((x) => /Player 3 \(Chef\), the evil Townsfolk, holds back from voting for Player 4: they suspect them of being on their team/.test(x.text)));
  assert.equal(strat.vote(s, p[2], p[1]), true);

  s.r = () => 0;
  assert.equal(strat.vote(s, p[2], p[4]), true);
  assert.ok(s.audit.some((x) => /votes for Player 5, though they suspect them of being on their team/.test(x.text)));
});

test("by their jinx, a Philosopher who gains the Bounty Hunter's ability turns a Townsfolk evil", () => {
  const s = base("bounty-philosopher");
  const e = new Engine(s);
  const p = s.players;

  role(p[1], "philosopher", "good");
  role(p[2], "chef", "good");
  s.phase = "night";
  s.night = 2;
  e.philosopherGain(p[1], "bountyhunter");

  assert.equal(p[2].alignment, "evil");
  assert.ok(p[2].evilTownsfolk);
  assert.ok(s.audit.some((x) => /Player 3 \(Chef\) becomes evil \(the Philosopher gained the Bounty Hunter ability\)/.test(x.text)));

  // An NPC Philosopher never picks it.
  assert.ok(PHILOSOPHER_AVOID.includes("bountyhunter"));
});

test("whole games play out on No Roles Barred, with the new characters doing their thing", () => {
  const seen = {};
  const note = (k, yes) => (seen[k] = (seen[k] ?? 0) + (yes ? 1 : 0));

  for (let g = 0; g < 160; g++) {
    const { s } = playOut(nrb, 8 + (g % 8), `nrb-${g}`);
    const text = s.audit.map((x) => x.text).join("\n");

    assert.ok([null, "good", "evil"].includes(s.winner));
    note("babysitter moves", /Lil' Monsta moves to/.test(text));
    note("Lil' Monsta kills", /^Lil' Monsta \(babysat by .*was killed/m.test(text));
    note("babysitter dies", s.reason === "Lil' Monsta's babysitter died.");
    note("Bounty Hunter info", /received: Bounty Hunter: .* is evil\./.test(text));
    note("Bounty Hunter bluff", /bluffed: Bounty Hunter: /.test(text));
    note("hunches", /the evil Townsfolk, suspects/.test(text));
    note("holds back", /the evil Townsfolk, holds back from voting/.test(text));

    // Nobody is, claims or is shown Lil' Monsta; the evil Townsfolk claims
    // a good character (their own, unless it's one that hides, like the
    // Poppy Grower).
    for (const p of s.players) {
      assert.ok(![p.role, p.claim, p.shown].includes("lilmonsta"), `game ${g}`);
    }

    for (const p of s.players.filter((x) => x.evilTownsfolk)) {
      assert.equal(alignment(p.claim), "good", `game ${g}`);
    }
  }

  for (const [k, n] of Object.entries(seen)) {
    assert.ok(n > 0, `${k}: ${JSON.stringify(seen)}`);
  }
});

// ── Games that couldn't end (random-script fuzzing) ──────────────

test("a Boomdandy executed on the Mastermind's extra day loses the game for evil, with no explosion", () => {
  const { s, e } = boomDay("boom-mastermind");

  s.mastermindDay = s.day;
  e.endDay();

  assert.ok(!s.boom);
  assert.equal(s.winner, "good");
  assert.equal(s.reason, "An evil player was executed on the Mastermind's extra day.");
});

test("with only the evil team alive, an evil NPC nominates a teammate who isn't the Demon, and the team votes for it", () => {
  const s = base("only-evil");
  const strat = new SimpleStrategy();
  const [you, chef, butler, baron, imp] = s.players;

  you.alive = false;
  chef.alive = false;
  role(butler, "poisoner", "evil");

  const n = strat.nomination(s, imp);

  assert.ok([butler, baron].includes(n.target));
  assert.match(n.why, /^only the evil team is left alive: their teammate Player \d \((Poisoner|Baron)\), to reach the final 2$/);
  assert.equal(strat.vote(s, baron, butler), true);
  assert.equal(strat.vote(s, butler, butler), true);

  // (Never the Demon.)
  assert.equal(strat.vote(s, baron, imp), false);

  // With anyone good alive, as before.
  chef.alive = true;
  assert.ok(!strat.nomination(s, imp)?.why);
});

test("the Demon never chooses you the night you came back to life (you can't die again tonight)", () => {
  const s = base("revived-you");
  const strat = new SimpleStrategy();
  const [you, chef, butler, , imp] = s.players;

  role(you, "empath", "good");
  chef.alive = false;
  butler.alive = false;
  s.revived = [you.id];

  assert.notEqual(strat.demon(s, imp), you);

  s.revived = [];
  assert.equal(strat.demon(s, imp), you);
});

// ── The Pixie is face-down ───────────────────────────────────────

test("the Pixie is face-down: every NPC Pixie (real, shown or bluffed) claims their Townsfolk from setup, and nobody alive ever claims the Pixie", () => {
  const kinds = new Set();

  for (let g = 0; g < 120; g++) {
    const raw = g % 2 ? tr : nrb;
    const s = createState(raw, 8 + (g % 8), `pixie-face-down-${g}`);
    const e = new Engine(s);
    const pixies = s.players.filter(
      (x) => !x.human && (x.role === "pixie" || x.shown === "pixie" || x.bluff === "pixie"),
    );

    for (const p of pixies.filter((x) => x.pixieRole)) {
      kinds.add(p.role === "pixie" ? "real" : p.shown === "pixie" ? "shown" : "bluffed");
      assert.equal(p.claim, p.pixieRole, `game ${g}`);
      assert.ok(p.pixieMad);
      assert.equal(team(p.pixieRole), "townsfolk");
      assert.ok(s.audit.some((x) => x.type === "pixie" && /is face-down: shown the .+, they're mad that they are it, and claim it\./.test(x.text)));

      // (A real one is shown a Townsfolk in play.)
      if (p.role === "pixie") {
        assert.ok(s.players.some((x) => x !== p && x.role === p.pixieRole), `game ${g}`);
      }
    }

    const audit = e.audit.bind(e);

    e.audit = (...args) => {
      for (const p of s.players.filter((x) => x.alive && !x.human)) {
        assert.notEqual(p.claim, "pixie", `game ${g}: ${p.label} claims the Pixie (${args[1]})`);
      }

      return audit(...args);
    };

    e.start();

    for (let turn = 0; turn < 12 && !s.winner; turn++) {
      settle(e);

      if (s.phase === "day" && !s.winner && !s.pendingVote && !s.roshambo && !s.boom) {
        e.endDay();
      }
    }
  }

  assert.ok(kinds.has("real") && kinds.has("bluffed"), [...kinds].join(", "));
});

test("log.txt lists whom each NPC talked to in seat order", () => {
  const { s } = playOut(nrb, 12, "talks-in-seat-order");

  for (const entry of s.audit.filter((x) => x.type === "talks")) {
    for (const line of entry.text.split("\n")) {
      const seats = line
        .split(" → ")[1]
        .split(", ")
        .map((x) => (x === "You" ? 1 : Number(x.replace("Player ", ""))));

      assert.deepEqual(seats, [...seats].sort((a, b) => a - b), line);
    }
  }
});

test("a good player pretending to be the Gossip (a Damsel hiding as one) still makes a statement by the end of the day", () => {
  const s = base("damsel-gossip");
  const strat = new SimpleStrategy();
  const damsel = s.players[2];

  role(damsel, "damsel", "good");
  damsel.claim = "gossip";
  s.r = () => 0.99; // (no statement on the day's chance)

  // Strongly suspecting nobody, nothing during the day...
  assert.equal(strat.gossip(s, damsel), null);

  // ...but at the end of the day, about their suspect, as a real Gossip.
  const said = strat.gossip(s, damsel, true);

  assert.ok(said?.target && !said.target.human && said.target !== damsel);
});

test("a good player pretending to be a character acts it out in public as a real one does: shares made-up information, uses a Seamstress's once-per-game choice, and shoots as the Slayer", () => {
  // Sharing: a Damsel hiding as the Noble shares her made-up Night 1
  // information in public (12+ seats), never her real character's.
  const s = createState(script, 12, "pretend-share");
  const e = new Engine(s);
  const damsel = s.players[2];

  role(damsel, "damsel", "good");
  damsel.claim = "noble";
  bluffState(damsel).hidden = {
    as: "noble",
    memories: [{ night: 1, role: "noble", text: "Noble: one of Player 4, Player 5 and Player 6 is evil.", targets: [] }],
  };
  s.day = 1;
  s.night = 1;
  s.r = () => 0; // (every share's chance comes up)
  e.shareInfo();
  assert.ok(s.audit.some((x) => x.type === "share" && /Player 3 says: "I am the Noble\. Night 1: .* \(made up: they aren't the Noble\)$/.test(x.text)));

  // A Seamstress's once-per-game choice, in a made-up story.
  const t = base("pretend-seamstress");
  const mutant = t.players[2];

  role(mutant, "mutant", "good");
  mutant.claim = "seamstress";
  t.night = 2;
  t.r = () => 0; // (the once-per-game chance comes up)

  const story = backStory(t, mutant, "seamstress", new SimpleStrategy());

  assert.ok(story.some((m) => m.role === "seamstress" && m.night === 2 && /^Seamstress: /.test(m.text)));
  assert.ok(mutant.seamUsed);

  // The Slayer: with nobody they strongly suspect, their suspect.
  const u = base("pretend-slayer");
  const d = u.players[2];

  role(d, "damsel", "good");
  d.claim = "slayer";
  u.day = 3; // (the Slayer's once-per-game timing: not on Day 1)
  u.r = () => 0;

  const shot = new SimpleStrategy().slay(u, d);

  assert.ok(shot && !shot.human && shot !== d);
});
