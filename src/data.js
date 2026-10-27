import { CHARACTERS, TRAVELLERS } from "./characters/catalog.js";

// ── Characters ───────────────────────────────────────────────

// Every character's record, and the Travellers left out, are in
// src/characters/catalog.js (re-exported here).
export { CHARACTERS, TRAVELLERS };

// The ids of the characters whose record passes `test`, and each one's
// `key` (for those that have it).
const where = (test) => Object.keys(CHARACTERS).filter((id) => test(CHARACTERS[id]));
const each = (key) =>
  Object.fromEntries(
    where((c) => c[key] !== undefined).map((id) => [id, CHARACTERS[id][key]]),
  );

// Fabled (`team: "fabled"`): a script's rules for the Storyteller, never
// dealt. They're kept out of the script's characters (see parseScript());
// the Sentinel changes the Outsiders dealt (see OUTSIDER_MODIFIERS).
export const FABLED = where((c) => c.team === "fabled");

// id: [display name, team]
export const ROLES = Object.fromEntries(
  Object.entries(CHARACTERS).map(([id, c]) => [id, [c.name, c.team]]),
);

// Official ability text (`ability` in CHARACTERS), shown on the script
// sheet. "*" means "not the first night".
export const ABILITIES = each("ability");
// Where this game simplifies a character's ability, how (see the
// catalogue's `note`).
export const NOTES = each("note");

export const name = (id) => ROLES[id]?.[0] ?? id;
export const team = (id) => ROLES[id]?.[1];
export const alignment = (id) =>
  ["townsfolk", "outsider"].includes(team(id)) ? "good" : "evil";


// ── Setup: seats and dealing ─────────────────────────────────

// The number of seats selected on the setup screen when the page opens.
export const DEFAULT_SEATS = 12;

// seats: [townsfolk, outsiders, minions, demons]
export const COUNTS = {
  8: [5, 1, 1, 1],
  9: [5, 2, 1, 1],
  10: [7, 0, 2, 1],
  11: [7, 1, 2, 1],
  12: [7, 2, 2, 1],
  13: [9, 0, 3, 1],
  14: [9, 1, 3, 1],
  15: [9, 2, 3, 1],
};

// Characters that change the number of Outsiders dealt at setup (`outsiders`
// in CHARACTERS). (A list is a choice: the Godfather deals 1 fewer or 1
// more, at random; the Sentinel, a Fabled, 1 fewer, the same or 1 more.)
export const OUTSIDER_MODIFIERS = each("outsiders");

// Roles the human can't be dealt (`notForHuman` in CHARACTERS): their
// abilities depend on things the solo human never faces (night choices,
// night attacks, being nominated, public claims), or could turn you evil.
export const FORBIDDEN_HUMAN = new Set(where((c) => c.notForHuman));


// ── Jinxes ───────────────────────────────────────────────────

// Official rulings for characters whose abilities clash (from the Djinn),
// shown on the script sheet when both are on it. Each notes where it's
// handled.
export const JINXES = [
  // characters/outsider/damsel.js
  { ids: ["spy", "damsel"], text: "If the Spy is (or has been) in play, the Damsel is poisoned." },
  // characters/outsider/damsel.js
  { ids: ["widow", "damsel"], text: "If the Widow is (or has been) in play, the Damsel is poisoned." },
  // never shown the Huntsman without the Damsel (setup.js)
  {
    ids: ["marionette", "huntsman"],
    text: "If the Marionette thinks that they are the Huntsman, the Damsel was added during setup.",
  },
  // the Outsider "might" have been added (setup.js)
  {
    ids: ["marionette", "balloonist"],
    text: "If the Marionette thinks that they are the Balloonist, an Outsider might have been added during setup.",
  },
  // characters/minion/pithag.js
  {
    ids: ["pithag", "damsel"],
    text: "If a Pit-Hag creates a Damsel, the Storyteller chooses which player it is.",
  },
  // counted when it fails (storyteller.js mathCount())
  {
    ids: ["mathematician", "drunk"],
    text: "The Mathematician learns if the Drunk's ability yielded false info or failed to work properly.",
  },
  // counted when it fails (storyteller.js mathCount())
  {
    ids: ["mathematician", "marionette"],
    text: "The Mathematician learns if the Marionette's ability yielded false info or failed to work properly.",
  },
  // the Mathematician wakes before she learns (engine resolveNight())
  {
    ids: ["mathematician", "chambermaid"],
    text: "The Chambermaid can detect if the Mathematician will wake tonight.",
  },
  // counted on a stray "attack" (mathCount(); s.demonChose in abilities.js)
  {
    ids: ["mathematician", "lunatic"],
    text: "The Mathematician learns if the Lunatic attacks a different player than the real Demon attacked.",
  },
  // characters/townsfolk/cannibal.js
  {
    ids: ["cannibal", "butler"],
    text: "If the Cannibal gains the Butler ability, the Cannibal learns this.",
  },
  // the count goes to the Cannibal (cannibal.js, juggler.js)
  {
    ids: ["cannibal", "juggler"],
    text: "If the Juggler guesses on their first day and dies by execution, tonight the living Cannibal learns how many guesses the Juggler got correct.",
  },
  // the Ogre turns evil and knows it (characters/outsider/ogre.js)
  { ids: ["recluse", "ogre"], text: "If the Recluse registers as evil to the Ogre, the Ogre learns that they are evil." },
  // at RECLUSE_SAGE_CHANCE (storyteller.js sageInfo())
  { ids: ["recluse", "sage"], text: "The Recluse might register as the Demon to the Sage." },
  // characters/outsider/ogre.js
  { ids: ["spy", "ogre"], text: "The Spy registers as evil to the Ogre." },
  // characters/demon/vigormortis.js, characters/minion/mastermind.js
  {
    ids: ["mastermind", "vigormortis"],
    text: "A Mastermind that has their ability keeps it if the Vigormortis dies.",
  },
  // never turns good (abilities.js chose())
  {
    ids: ["pithag", "goon"],
    text: "If the Pit-Hag turns an evil player into the Goon, they can't turn good due to their own ability.",
  },
  // an Ogre only chooses on Night 1, before the Pit-Hag acts
  {
    ids: ["pithag", "ogre"],
    text: "If the Pit-Hag turns an evil player into the Ogre, they can't turn good due to their own ability.",
  },
  // a jumping Fang Gu never passes it on (characters/demon/fanggu.js)
  {
    ids: ["scarletwoman", "fanggu"],
    text: "If there would be two Demons, one of which was the Scarlet Woman, the Scarlet Woman remains the Scarlet Woman.",
  },
  // the evil team counts the Magician as a teammate (strategy teammate())
  {
    ids: ["magician", "legion"],
    text: "If the Magician is in play, during the Demon info step, Legion wake in separate groups. Each group learns which players are good, but does not learn the Magician.",
  },
  // no reveal while the Magician lives (characters/minion/marionette.js)
  {
    ids: ["magician", "marionette"],
    text: "If the Magician is alive, the Demon doesn't know which neighbor is the Marionette.",
  },
  // the team doesn't see either character (strategy seenRole())
  {
    ids: ["magician", "spy"],
    text: "When the Spy sees the Grimoire, the Demon and Magician's character tokens are removed.",
  },
  // the team doesn't see either character (strategy seenRole())
  {
    ids: ["magician", "widow"],
    text: "When the Widow sees the Grimoire, the Demon and Magician's character tokens are removed.",
  },
  // never arises: the Pit-Hag only makes good players Outsiders (strategy pithag())
  {
    ids: ["pithag", "villageidiot"],
    text: "If there is a spare token, the Pit-Hag can create an extra Village Idiot. If so, the drunk Village Idiot might change.",
  },
  // at LEGION_MINSTREL_CHANCE (characters/townsfolk/minstrel.js)
  {
    ids: ["legion", "minstrel"],
    text: "If Legion died by execution today, Legion keeps their ability, but the Minstrel might learn they are Legion.",
  },
  // `exclusive`: never both in play (setup.js; the Pit-Hag never makes the
  // Heretic, as she's one of them: strategy pithag())
  ...["baron", "godfather", "lleech", "pithag", "spy", "widow"].map((id) => ({
    ids: ["heretic", id],
    text: "Only 1 jinxed character can be in play.",
    exclusive: true,
  })),
  // never arises: the Pit-Hag only makes good players Outsiders (strategy
  // pithag()); characters/minion/pithag.js
  {
    ids: ["pithag", "politician"],
    text: "If the Pit-Hag turns an evil player into the Politician, they can't turn good due to their own ability.",
  },
  // never arise: the Alchemist is never given these abilities (see
  // ALCHEMIST_ABILITIES): by these jinxes, they'd have no ability (and an
  // Alchemist only has one that's not in play)
  {
    ids: ["alchemist", "marionette"],
    text: "An Alchemist-Marionette has no Marionette ability & the Marionette is in play.",
  },
  {
    ids: ["alchemist", "mastermind"],
    text: "An Alchemist-Mastermind has no Mastermind ability & the Mastermind is not-in-play.",
  },
  {
    ids: ["alchemist", "spy"],
    text: "An Alchemist-Spy has no Spy ability & a Spy is in play. After each execution, a living Alchemist-Spy may publicly guess a living player as the Spy. If correct, the Demon must choose the Spy tonight.",
  },
  {
    ids: ["alchemist", "widow"],
    text: "An Alchemist-Widow has no Widow ability & a Widow is in play. After each execution, a living Alchemist-Widow may publicly guess a living player as the Widow. If correct, the Demon must choose the Widow tonight.",
  },
  // characters/demon/lleech.js lleechHostDied()
  {
    ids: ["lleech", "mastermind"],
    text: "If the Mastermind is alive and the Lleech host dies by execution, the Lleech lives but loses their ability.",
  },
  // characters/townsfolk/slayer.js shoot()
  { ids: ["lleech", "slayer"], text: "If the Slayer slays the Lleech host, the host dies." },
  // poppyBlocks() in storyteller.js (strategy spyWorks(), bluff.js
  // bluffMode(), characters/minion/widow.js)
  {
    ids: ["spy", "poppygrower"],
    text: "If the Poppy Grower has their ability, the Spy does not see the Grimoire.",
  },
  {
    ids: ["widow", "poppygrower"],
    text: "If the Poppy Grower has their ability, the Widow does not see the Grimoire.",
  },
  // at CERENOVUS_GOBLIN_CHANCE (strategy cerenovus()); they claim it when
  // nominated (characters/minion/goblin.js)
  {
    ids: ["cerenovus", "goblin"],
    text: "The Cerenovus may choose to make a player mad that they are the Goblin.",
  },
  // at LEGION_POLITICIAN_CHANCE (characters/demon/legion.js legionVeto())
  { ids: ["legion", "politician"], text: "The Politician might register as evil to Legion." },
  // characters/townsfolk/bountyhunter.js bountyEvil(), from philosopherGain()
  {
    ids: ["bountyhunter", "philosopher"],
    text: "If the Philosopher gains the Bounty Hunter ability, a Townsfolk might turn evil.",
  },
  // setup.js seats them beside the first babysitter
  {
    ids: ["marionette", "lilmonsta"],
    text: "If there would be a Marionette in play, they enter play after the Demon & must start as their neighbor.",
  },
  // characters/demon/lilmonsta.js lilMonsta(): the babysitter keeps it
  {
    ids: ["lilmonsta", "poppygrower"],
    text: "If Lil' Monsta & the Poppy Grower are alive, Minions wake one by one, until one of them chooses to take the Lil' Monsta token.",
  },
  // characters/minion/psychopath.js psychopathExecuted()
  {
    ids: ["lilmonsta", "psychopath"],
    text: "If the Psychopath is babysitting Lil' Monsta, they die when executed.",
  },
  // characters/demon/lilmonsta.js lilMonsta()
  {
    ids: ["lilmonsta", "magician"],
    text: "If the Magician is alive, the Storyteller chooses which Minion babysits Lil' Monsta.",
  },
  // characters/demon/lilmonsta.js lilMonstaSuccessor()
  {
    ids: ["lilmonsta", "scarletwoman"],
    text: "If Lil' Monsta dies with 5 or more players alive, the Scarlet Woman babysits Lil' Monsta for the rest of the game.",
  },
  // characters/demon/leviathan.js leviathanExecuted() (an NPC Leviathan
  // never nominates a player claiming the Soldier: strategy nomination())
  ...[
    ["exorcist", "the Exorcist-chosen player"],
    ["innkeeper", "an Innkeeper-protected player"],
    ["monk", "the Monk-protected player"],
    ["soldier", "the Soldier"],
  ].map(([id, who]) => ({
    ids: ["leviathan", id],
    text: `If the Leviathan nominates and executes ${who}, good wins.`,
  })),
  // characters/demon/leviathan.js leviathanExecuted()
  {
    ids: ["leviathan", "grandmother"],
    text: "If the Leviathan is in play and the Grandchild dies by execution, evil wins.",
  },
  // characters/demon/leviathan.js leviathanDusk()
  {
    ids: ["leviathan", "mayor"],
    text: "If the Leviathan and the Mayor are alive on day 5 & no execution occurs, good wins.",
  },
  // strategy pithag()
  { ids: ["leviathan", "pithag"], text: "The Leviathan cannot enter play after day 5." },
  // characters/demon/leviathan.js leviathanNight() (never you: strategy
  // leviathan())
  {
    ids: ["leviathan", "ravenkeeper"],
    text: "Each night*, the Leviathan chooses an alive player (different to previous nights): a chosen Ravenkeeper uses their ability but does not die.",
  },
  {
    ids: ["leviathan", "sage"],
    text: "Each night*, the Leviathan chooses an alive good player (different to previous nights): a chosen Sage uses their ability but does not die.",
  },
];

// Characters never in play with `id`, by their jinx (`exclusive`).
export const exclusiveWith = (id) =>
  JINXES.filter((j) => j.exclusive && j.ids.includes(id)).flatMap((j) =>
    j.ids.filter((x) => x !== id),
  );

// The Legion and Politician jinx: the chance a Politician's vote counts as
// evil to Legion ("Executions fail if only evil voted").
export const LEGION_POLITICIAN_CHANCE = 0.5;

// The Recluse and Sage jinx: the chance a Demon-killed Sage is shown a
// living Recluse in the Demon's place.
export const RECLUSE_SAGE_CHANCE = 0.5;


// ── The Storyteller ──────────────────────────────────────────

// The Storyteller steers for a final 3 of you, 1 good NPC and 1 evil player
// (with you dead, 1 good; with a Zombuul, a final 2; see lean() in
// src/storyteller.js). When evil is more than this many players ahead of
// that path, its choices help good; that far behind, evil. (Who pair
// information shows, whether misinformation frames or is random, random
// deaths, and the Sailor, Sweetheart, Pacifist, Tinker and Shabaloth.)
export const FINAL_THREE_MARGIN = 0.5;


// ── Information ──────────────────────────────────────────────

// Townsfolk who learn something on the first night only, and those who keep
// learning on later nights (`info` in CHARACTERS). Setup deals at least a share of each (see
// FIRST_NIGHT_INFO_SHARE and ONGOING_INFO_SHARE below) when it can.
export const FIRST_NIGHT_INFO = where((c) => c.info === "first");
export const ONGOING_INFO = where((c) => c.info === "ongoing");

// Setup deals at least this share of the Townsfolk slots (rounded) to each
// kind of information character, when the script has them: at 0.3, 7
// Townsfolk get at least 2 of each.
export const FIRST_NIGHT_INFO_SHARE = 0.3;
export const ONGOING_INFO_SHARE = 0.3;

// With this many seats or more, NPCs (and bluffers) may say first-night or
// spent-ability information in public the morning they get it, at each
// character's `publicInfo` chance.
export const PUBLIC_INFO_MIN_SEATS = 12;
export const PUBLIC_INFO_CHANCE = each("publicInfo");

// Each night, the chance the Poisoner picks you (not two nights running);
// otherwise they pick as usual, and still might.
export const HUMAN_POISON_CHANCE = 0.10;

// When an evil NPC passes on what a player the team wants discredited told
// them (see strategy told()), the chance it's a lie (always the same one).
export const DISTORT_CHANCE = 0.25;

// Yes/no questions an Artist can ask the Storyteller about a player.
export const ARTIST_QUESTIONS = {
  evil: "evil",
  demon: "the Demon",
  minion: "a Minion",
  outsider: "an Outsider",
  townsfolk: "a Townsfolk",
};


// ── Bluffs and cover stories ─────────────────────────────────

// The chance each Minion also learns the Demon's 3 bluffs.
export const MINION_BLUFF_CHANCE = 1;

// Cover stories: on Day 1, some good NPCs claim a character they aren't
// (never one in play, claimed or a Demon bluff) until they come clean, and
// tell the truth to players their information vouches for (see strategy
// coverFor()).
export const HIDE_CHANCE = 0.25; // a "high" character claims a "low" or "avoid" one, with no information
export const BAIT_CHANCE = 0.25; // a BAIT_ROLES character claims a "high" one, with made-up information
export const COVER_TELL_HUMAN_CHANCE = 0.5; // they tell you the truth too (decided once)
export const BAIT_ROLES = where((c) => c.bait); // survive, or gain from, a night kill
// Never hide or bait (`neverHides`: they act in public every day); never
// pretended to (`neverHiddenAs`: they'd draw a nomination, or need a public act).
export const HIDE_NEVER = where((c) => c.neverHides);
export const HIDE_NEVER_AS = where((c) => c.neverHiddenAs);

// Never claimed, nor named in made-up information, by a good player who
// pretends (see bluff.js fits()): nobody would believably be one.
export const NEVER_BLUFFED = where((c) => c.neverBluffed);

// The character with this name ("Fortune Teller" → "fortuneteller"), or
// undefined: for reading the characters a piece of information names.
const ROLE_BY_NAME = new Map(Object.keys(CHARACTERS).map((id) => [CHARACTERS[id].name, id]));
export const roleByName = (n) => ROLE_BY_NAME.get(n);
// How many times a bluffer makes up a piece of information until it fits
// what they know (see bluff.js madeUp()); after that, the last one stands.
export const BLUFF_TRIES = 6;

// Outsiders who claim a Townsfolk while alive, and admit it once dead: the
// Mutant ("mad" they're not one) and the Damsel (hiding from the Minions).
// See claimFor() and strategy revealsWhenDead(). The Heretic hides too, but
// only says so in the final 3 (see characters/outsider/heretic.js).
export const HIDDEN_OUTSIDERS = ["mutant", "damsel", "heretic"];

// The Heretic in the final 3: the chance an evil NPC claims to be the
// Heretic when evil looks about to lose (so you'd want good to "lose").
export const HERETIC_BLUFF_CHANCE = 0.5;

// The Goblin (characters/minion/goblin.js): the chance an NPC Goblin claims
// it when nominated; the chance a good NPC votes to execute a player who
// claimed the Goblin today (evil wins if they're one); and, once the evil
// team's living votes are at most this many short of marking anyone, the
// chance a teammate nominates their Goblin.
export const GOBLIN_CLAIM_CHANCE = 0.75;
export const GOBLIN_GOOD_VOTE_CHANCE = 0.05;
export const GOBLIN_PUSH_SHORT = 1;
export const GOBLIN_PUSH_CHANCE = 0.5;
// The Cerenovus and Goblin jinx: the chance the Cerenovus makes a good
// player mad that they're the Goblin (when it's on the script).
export const CERENOVUS_GOBLIN_CHANCE = 0.2;

// The Fearmonger (characters/minion/fearmonger.js): the chance an NPC
// Fearmonger nominates their chosen player on a day nobody suspects them
// (they always do when a good NPC does); and, once a Fearmonger has chosen,
// how much less likely a good NPC is to vote on a hunch (their usual
// chance, times this), as any execution might be the one that loses.
export const FEARMONGER_PUSH_CHANCE = 0.3;
export const FEARMONGER_CAUTION = 0.5;

// The Philosopher's "avoid picking these" list: Townsfolk an NPC
// Philosopher never gains, as the ability would do the town no good (see
// strategy philosopher(), which never picks an Outsider either). The Poppy
// Grower's, Pixie's, Magician's and Amnesiac's only work from setup, the
// Cannibal's only for a real Cannibal, the Huntsman's only with a Damsel in
// play (which the Philosopher can't know), and the Gambler's mostly kills
// them. The Bounty Hunter's might turn a Townsfolk evil (their jinx). Add
// any other wasted pick here.
export const PHILOSOPHER_AVOID = [
  "poppygrower",
  "pixie",
  "magician",
  "amnesiac",
  "cannibal",
  "huntsman",
  "gambler",
  "bountyhunter",
  "damsel",
  "general",
  "steward",
];

// The Psychopath (characters/minion/psychopath.js): the chance an NPC
// Psychopath kills in public, each day, until they've done it once (then
// they're known, and kill every day).
export const PSYCHOPATH_KILL_CHANCE = 0.35;
// The Alchemist (characters/townsfolk/alchemist.js): the Minion abilities
// they can have, one on the script and not in play (the ones that work for
// a good player; not the Spy, Widow, Marionette or Mastermind: by their
// jinxes, the Alchemist would have no ability).
export const ALCHEMIST_ABILITIES = ["poisoner", "fearmonger", "psychopath", "goblin", "wizard"];

// The Wizard (characters/minion/wizard.js): the wishes (see WIZARD_WISHES
// there); the chance, each day from Day 1 (evil) or Day 2 (an
// Alchemist-Wizard), that an NPC makes theirs.
export const WIZARD_WISH_CHANCE = 0.35;

// How pointed the Storyteller's true day advice is (the Fisherman's tip,
// the Savant's true statement; see storyteller.js adviceLevel()), from 0
// to 3:
//   0: general: vouches for good players ("X is good"), or the Outsider count;
//   1: names a Minion ("X is evil"), or clears 3 players of being the Demon;
//   2: the Demon is one of 3 players (or a neighbour of a player);
//   3: the Demon is one of 2 players (or a player's evil character).
// The stage of the game sets it: below ADVICE_STAGES[0] of the way to the
// final 3 it's 0, below ADVICE_STAGES[1] it's 1, and 2 after that. A
// Storyteller leaning good adds 1; leaning evil takes 1 away (and then the
// truth is one that helps evil, where there is one: a Recluse "is evil").
export const ADVICE_STAGES = [1 / 3, 2 / 3];

// The Townsfolk abilities a Wizard's wish can give the Demon (the "gift"
// wish): the ones that keep a Demon from being executed, and so are worth a
// Minion's life. Only one not in play.
export const WIZARD_GIFTS = ["fool", "virgin"];

// The chance an evil NPC Wizard wishes for the Demon's gift on Day 1 (the
// only day it's granted), if one can be given.
export const WIZARD_GIFT_CHANCE = 0.5;

// A second execution is only granted with at least this many alive.
export const WIZARD_SECOND_MIN_ALIVE = 5;

// Roshambo: what beats what.
export const ROSHAMBO = { rock: "scissors", paper: "rock", scissors: "paper" };

// The chance an evil player whose bluff is a Mutant or Damsel keeps it,
// hiding behind a Townsfolk (one not in play, if a Spy or Widow saw the
// Grimoire); otherwise they take another bluff.
export const HIDDEN_BLUFF_CHANCE = 0.25;

// Coming clean: a player with a cover story says in public what they really
// are, with all their information (at dawn once they're dead, or as below).
export const COME_CLEAN_ALIVE = 5; // at dawn, with this few alive
export const COME_CLEAN_URGENT_CHANCE = 0.5; // at dawn, a hider whose information last night points at someone
export const COME_CLEAN_NOMINATED_CHANCE = 0.9; // before the vote, when they're nominated...
export const COME_CLEAN_NOMINATION_CHANCE = 0.5; // ...or someone their information vouches for or points at is
export const FAKE_CLEAN_CHANCE = 0.3; // a nominated evil NPC fakes it (once), as a "high" character


// ── Suspicion and evidence ───────────────────────────────────

// How much each thing a good NPC has seen in public counts towards
// suspecting a player (see evidence() in src/strategy.js). Negative weights
// count towards trusting them.
export const EVIDENCE_WEIGHT = {
  claimsMyCharacter: 4, // claims the character I am
  doubleClaim: 2, // claims the same character as another player
  namedByInfo: 0.2, // someone's shared information points at them
  vouchedByInfo: -0.2, // someone's shared information vouches for them
  accused: 0.3, // someone says they're suspicious of them
  trusted: -0.3, // someone says they trust them
  myInfo: 2, // my own information points at them
  markedEvil: 1, // you've marked them Evil (in your notes)
  markedGood: -1, // you've marked them Good
  // How much good NPCs trust you: added to your marks, and to your
  // information when you share it (Share My Info)
  // Other values:
  //   0: turns it off.
  //   Above 1: your marks outweigh most public evidence.
  //   Above 2: your nomination alone (2 or more) would be enough for an NPC to suspect that player, since they need 1.
  humanTrusted: 0.5,
  vouchedByLiar: 2, // vouched for by a player shown to have lied (Professor)
  accusedByLiar: -0.5, // accused by a player shown to have lied
  changedStory: 1, // told me one character, and said another (to me before, or in public)
  changedStoryCleared: 0.25, // ...but they came clean in public, saying why
  heardOtherwise: 0.5, // someone passed on that they claimed something else
  passedOnOtherwise: 0.5, // passed on a claim that isn't what that player told me
  // Their claimed ability visibly worked (see engine confirm()), by how sure:
  confirmedGood: -6, // certain: a Virgin who executed a Townsfolk; a Slayer whose shot killed
  confirmedLikely: -4, // near certain: a Professor whose choice came back to life
  confirmedMaybe: -2, // partly: a Fool, Sailor or Pacifist saving an execution, a Tea Lady's neighbour surviving one, a Moonchild's pick dying, a Gossip's statement followed by a death
  abilityFailed: 1.5, // their claimed ability visibly failed (a Virgin, a Monk's protection)
  abilityUnused: 0.5, // late on, still hasn't used a public ability they claim (Slayer, Juggler)
  damselGuess: 6, // guessed the Damsel in public: only a Minion's guess counts
  failedExecution: 6, // voted for an execution that failed (Legion): only evil voted
  outedEvil: 8, // showed they're evil in public: a Psychopath's kill, a Goblin claim (s.outed)
  exposedBluff: 6, // claims one of the Demon's bluffs, which a Wizard's wish made public (s.exposedBluffs)
};

// With a Pixie on the script, a double claim of a Townsfolk might be a mad
// Pixie, so it counts this much of its usual weight.
export const PIXIE_DOUBLE_CLAIM_FACTOR = 0.4;

// An NPC trusts a player with an evidence score this low, or whom their own
// information vouches for ("Who I trust").
export const TRUST_EVIDENCE = -1;

// The evidence a good NPC needs to suspect a player (less, and they keep
// their hunch): at 1, one player's say-so (0.5) isn't enough.
export const EVIDENCE_TO_SUSPECT = 1;

// The chance an evil NPC's suspicion (and Slayer, Moonchild and Artist
// targets) is the team's scapegoat, while one lives.
export const SCAPEGOAT_CHANCE = 0.8;


// ── Nominations and voting ───────────────────────────────────

// An NPC nominates their suspect with this much evidence against them,
// saying why: strongest case first, each NPC once, at most half the living
// players a day.
export const NPC_NOMINATE_EVIDENCE = 3;

// How NPCs vote (see strategy vote()). A good NPC votes at GOOD_VOTE_CHANCE,
// plus GOOD_VOTE_EVIDENCE_STEP a point of evidence against the nominee,
// from GOOD_VOTE_MIN (someone they trust) to GOOD_VOTE_MAX (their suspect).
// In the final 3, they always vote for your pick.
export const GHOST_VOTE_ALIVE = 5; // the dead keep their ghost vote until this few live (unless it's the deciding vote on their suspect)
export const GOOD_VOTE_CHANCE = 0.5;
export const GOOD_VOTE_EVIDENCE_STEP = 0.15;
export const GOOD_VOTE_MIN = 0.1;
export const GOOD_VOTE_MAX = 0.9;
export const HUMAN_NOMINATION_BONUS = 0.1; // added when you nominated
// In the final 4 (or 3, with a Zombuul), one execution from the final 3,
// good NPCs vote for your pick (nominated, or asked for) at least this
// often, whatever they think of the nominee (in the final 3, always).
export const NEAR_FINAL_HUMAN_VOTE_CHANCE = 0.85;
export const EVIL_VOTE_CHANCE = 0.85; // an evil NPC, for a good nominee
export const EVIL_TEAMMATE_VOTE_CHANCE = 0.5; // ...for a teammate, only when it can't change the outcome
// The Bounty Hunter's evil Townsfolk doesn't know their team: for a nominee
// they suspect of being evil (one of their own, as far as they can tell;
// see strategy hunches()), they vote this often.
export const EVIL_TOWNSFOLK_HUNCH_VOTE_CHANCE = 0.1;
// With the Vortox on the script, a day without an execution may lose the
// game: while nobody is marked for execution, a good NPC votes for a
// nominee they don't trust at least this often (see strategy vote()).
export const VORTOX_VOTE_CHANCE = 0.8;
// With the Leviathan in play (everyone knows: see
// characters/demon/leviathan.js), a 2nd good execution loses, and so does
// the end of Day 5 (see strategy leviathanRisk() and vote()). On Days 1 and
// 2, before any execution, a good NPC votes this much less often (their
// usual chance, times this), waiting for more information; after an
// execution (which might have been good's one miss), less often still. On
// Day 5, while nobody is marked, they vote for a nominee they don't trust
// at least this often, as with the Vortox.
export const LEVIATHAN_EARLY_CAUTION = 0.8;
export const LEVIATHAN_CAUTION = 0.6;
export const LEVIATHAN_LAST_DAY_VOTE_CHANCE = 0.8;

// Round Robin (once per game, with nominations open and this few alive):
// every player from Seat 1 says their character and information in public,
// evil NPCs and a living Damsel bluffing (see engine roundRobin()).
export const ROUND_ROBIN_ALIVE = 4;


// ── The Demon's kill ─────────────────────────────────────────

// The Demon's kill (see strategy demon()): from the top priority down, it
// attacks someone at a level at that level's chance, else tries the next
// (none fire: any good NPC; "avoid" only if no-one else is left). "top" is
// a good player the town is sure of. It knows characters from claims, its
// own Minions, and the Grimoire with a working Spy.
export const KILL_PRIORITY_CHANCE = {
  top: 0.9,
  avoid: 0,
  low: 0.25,
  med: 0.5,
  high: 0.75,
};

// Each character's kill priority (`kill` in CHARACTERS; unlisted good
// characters: "low"; unlisted Minions: "avoid").
export const DEMON_KILL_PRIORITY = each("kill");

// With a working Spy, the chance each night the Demon kills a "low" good
// player instead of the most valuable, to keep the Spy hidden.
export const SPY_COVER_CHANCE = 0.3;

// The chance the Demon kills itself to pass to a Minion, the night after it
// was nominated and survived.
export const DEMON_STAR_PASS_CHANCE = 0.75;

// The Vigormortis's kill priority for its own Minions: a Minion it kills
// keeps their ability (and poisons a Townsfolk neighbour), so it's keen to.
export const VIGORMORTIS_MINION_PRIORITY = "high";


// ── Character abilities ──────────────────────────────────────

// When NPCs use once-per-game abilities (`oncePerGame` in CHARACTERS): not
// before AFTER_DAY, then at START_CHANCE, rising by STEP_CHANCE a day. E.g.
// the Slayer: Day 2 20%, Day 3 40%... (The Juggler always juggles on Day 1.)
export const ONCE_PER_GAME = each("oncePerGame");

// The chance an NPC Juggler guesses a player's claim, not a random character.
export const JUGGLER_CLAIM_GUESS_CHANCE = 0.5;

// The chance a good NPC Courtier chooses an evil character really in play
// (a bluffer never does).
export const COURTIER_CORRECT_CHANCE = 0.35;

// The chance the Witch curses you (the likeliest nominator), not a good NPC.
export const WITCH_HUMAN_CHANCE = 0.2;

// The chance the Pit-Hag or Cerenovus picks an evil teammate, not a good NPC.
export const PITHAG_EVIL_CHANCE = 0.25; // into another Minion or Demon, not in play
export const CERENOVUS_EVIL_CHANCE = 0.2; // made mad about a good character not in play

// The night the Pit-Hag makes a Demon, the death is random: the chance
// nobody dies.
export const PITHAG_NO_DEATH_CHANCE = 0.3;

// From Night 2, the Demon tells its Marionette who they are (who then plays
// for evil) at MARIONETTE_REVEAL_CHANCE a night, when evil is losing or at
// least MARIONETTE_HEAT of good NPCs suspect the Demon.
export const MARIONETTE_HEAT = 0.3;
export const MARIONETTE_REVEAL_CHANCE = 0.5;

// Storyteller choices. (The Sailor's drunk is decided when it first
// matters; if it decides an attack, a good victim lives, an evil one dies.)
export const SAILOR_DRUNK_SELF_CHANCE = 0.3; // otherwise, the Sailor (not their pick) is drunk
export const SAILOR_LATE_ALIVE = 6; // with fewer alive than this...
export const SAILOR_LATE_DRUNK_CHANCE = 0.7; // ...the Sailor is drunk at this chance, whatever's at stake
export const PACIFIST_SAVE_CHANCE = 0.5; // an executed good player survives
export const TINKER_DEATH_CHANCE = 0.1; // each night
export const SHABALOTH_REGURGITATE_CHANCE = 0.25; // each night, last night's dead pick comes back

// The chance an NPC Gossip makes their statement at dawn (else at the end of
// the day: they gossip every day).
export const GOSSIP_CHANCE = 0.4;

// Sinking a kill: the chance the Demon kills nobody while an evil player
// claims one of PROTECTION_ROLES (`protects`), so it looks like it worked.
export const PROTECTION_ROLES = where((c) => c.protects);
export const SINK_KILL_CHANCE = 0.2;
export const PO_CHARGE_CHANCE = 0.25; // each night, the Po chooses no-one, to kill 3 the next
export const LUNATIC_FOLLOW_CHANCE = 0.5; // the Demon kills the Lunatic's pick, so they keep believing

// The Damsel hides behind a Townsfolk, telling only a Huntsman she trusts.
// Each NPC Minion guesses her once, in public, at dawn (one a dawn for the
// team) from DAMSEL_GUESS_FROM_DAY; or, any day, as a last chance (without
// the chances below) when their Demon is about to be executed. They guess a
// player a teammate bluffing the Huntsman found out, else at a chance a day
// (see strategy damselGuess()):
export const DAMSEL_GUESS_FROM_DAY = 3;
export const DAMSEL_CLAIM_CHANCE = 0.4; // a player who says they're the Damsel
export const DAMSEL_HIDER_CHANCE = 0.5; // a player claiming a Demon bluff (not in play, so hiding)
export const DAMSEL_GUESS_ALIVE = 5; // with this few alive...
export const DAMSEL_GUESS_CHANCE = 0.5; // ...a player claiming an Outsider, else anyone unconfirmed
export const DAMSEL_DECOY_CHANCE = 0.15; // a good NPC claims the Damsel on Day 1, to waste a guess (one at a time)

// From BOOMDANDY_FROM_DAY, the evil team wants its Boomdandy executed: while
// less than BOOMDANDY_HEAT of good NPCs suspect the Demon, one nominates it
// and they vote at BOOMDANDY_VOTE_CHANCE; above that (the countdown might
// find the Demon), nobody nominates it, and at BOOMDANDY_HOT_VOTE_CHANCE.
export const BOOMDANDY_FROM_DAY = 2;
export const BOOMDANDY_HEAT = 0.3;
export const BOOMDANDY_VOTE_CHANCE = 0.9;
export const BOOMDANDY_HOT_VOTE_CHANCE = 0.3;

// The Barber's swap: the Demon swaps the 2 good NPCs whose swap moves the
// most claimed ability off believed players onto doubted ones (see strategy
// barber()), or nobody, if it gains less than BARBER_MIN_GAIN.
export const BARBER_VALUE = { top: 4, high: 3, med: 2, low: 1, avoid: 2 }; // a claim's worth to good, by kill priority (half once spent)
export const BARBER_OUTSIDER_VALUE = -1; // an Outsider's
export const BARBER_CONFIRMED_WEIGHT = 2; // belief in a confirmed player (others 1)...
export const BARBER_SUSPECTED_WEIGHT = 0.25; // ...less this for each good NPC who suspects them (or as scapegoat)...
export const BARBER_MIN_WEIGHT = 0.25; // ...never below this
export const BARBER_NEW_INFO_COST = 1.5; // a swap into a "start knowing" character: they learn it tonight
export const BARBER_MIN_GAIN = 0.5;


// The Village Idiot: setup adds 0, 1 or 2 more (in other Townsfolk's
// places), and the Storyteller makes one of the extras drunk.
export const VILLAGE_IDIOT_EXTRAS = [0, 1, 2];

// The chance an NPC Magician hides behind a cover story on Day 1 (see
// strategy coverFor()): once the evil team hears them claim the Magician,
// the trick is up for whoever heard it.
export const MAGICIAN_HIDE_CHANCE = 0.75;

// The Mezepheles (simplified: no secret word): on one of these nights, at
// random, if they're alive (and their ability works), a random living good
// NPC turns evil and plays for the evil team from then on (see
// characters/minion/mezepheles.js).
export const MEZEPHELES_NIGHTS = [2, 3];

// Legion: most players are Legion (half the seats, rounded down, plus
// LEGION_MAJORITY), with no Minions. Each night* the Storyteller chooses who
// dies (see characters/demon/legion.js), steering for a final 3 with 1
// Legion: nobody, a Legion or a good NPC, whichever leaves the Legion
// closest to that path, or at random among those within LEGION_STEER_SLACK
// (a Legion's worth is about 1) of the closest.
export const LEGION_MAJORITY = 1;
export const LEGION_STEER_SLACK = 0.35;
// Legion never kills a good player at night once only this many good
// players are alive (you included): good needs 2 to win, executing the
// Legion one by one (evil wins with 2 alive).
export const LEGION_GOOD_MIN = 2;
// In a Legion game, at least this share of the Townsfolk dealt (rounded up)
// are strong ones against Legion (`vsLegion` in CHARACTERS: they learn who's
// good or evil, or can win outright), when the script has them, and you're
// dealt one if one you can be dealt is in play.
export const LEGION_STRONG = where((c) => c.vsLegion);
export const LEGION_STRONG_SHARE = 0.6;
// With Legion on the script, a good NPC votes for a nominee who isn't their
// suspect (nor your pick) only at this chance, whatever the evidence:
// executions fail if only evil voted, so a good vote on a hunch could be the
// one an evil nomination needs.
export const LEGION_GOOD_VOTE_CHANCE = 0.1;
// The chance a Legion votes to execute another Legion, while more than 2
// Legion live: they're many, and one sacrificed makes the voters look good.
export const LEGION_SACRIFICE_VOTE_CHANCE = 0.4;
// With Legion on the script, what other players say (their information and
// opinions, in public or in private) counts this much of its usual weight
// as evidence: most of them may be Legion.
export const LEGION_HEARSAY_FACTOR = 0.3;
// The Legion and Minstrel jinx: the chance an executed Legion registers as a
// Minion to the Minstrel (everyone else but Legion is drunk, and the
// Minstrel learns it was Legion).
export const LEGION_MINSTREL_CHANCE = 0.5;


// ── Timings and display ──────────────────────────────────────

// Vote animation: how long (in ms) the clock hands point at the nominator
// and nominee before the large hand starts counting votes.
export const VOTE_COUNT_DELAY_MS = 750;

// Vote animation: how long (in ms) the large hand takes per seat as it
// counts votes. (A voter's hand goes up just before the clock hand arrives.)
export const VOTE_TICK_MS = 450;

// Vote: how long (in ms) you have to raise your hand (it starts lowered)
// before the votes are counted; you can still raise or lower it as they're
// counted, until the clock hand reaches you. Skipped when you can't vote
// (dead, with your ghost vote spent).
export const HAND_WAIT_MS = 4000;

// The Boomdandy's countdown: how long (in ms) you have to select the living
// player you point at. When it runs out, whoever has the most players
// pointing at them dies (with nobody selected, you don't point). It's paused
// while a dawn / dusk card is up.
export const BOOM_WAIT_MS = 10000;

// Town square: the ⚠ on an NPC who just claimed their character in public
// without being asked (sharing information, a Gossip statement, a Slayer
// shot...). It stays CLAIM_ALERT_HOLD_MS, then fades out over
// CLAIM_ALERT_FADE_MS. (It waits while a dawn or dusk card is showing.)
export const CLAIM_ALERT_HOLD_MS = 2500;
export const CLAIM_ALERT_FADE_MS = 2000;

// Town square size, set from the menu (☰) by the title (as a fraction of
// the normal size). The −/+ buttons step it by TOWN_SQUARE_SIZE_STEP, between
// TOWN_SQUARE_SIZE_MIN and TOWN_SQUARE_SIZE_MAX. (It never grows past the
// width of the screen.) The browser remembers the last size used.
export const TOWN_SQUARE_SIZE = 1;
export const TOWN_SQUARE_SIZE_STEP = 0.1;
export const TOWN_SQUARE_SIZE_MIN = 0.6;
export const TOWN_SQUARE_SIZE_MAX = 1.5;

// Each seat's colour for player names in the town square and the public log,
// in seat order (seat 1 is you). No reds or blues (they mark evil and good
// characters), and no white.
export const PLAYER_COLOURS = [
  "#f2c14e", // gold
  "#8bd450", // lime
  "#e8873a", // orange
  "#4fd1a5", // mint
  "#c79bf2", // lavender
  "#f29bd0", // orchid
  "#c8c85a", // olive
  "#5ed6c0", // turquoise
  "#c49a6c", // tan
  "#b6eab0", // pale green
  "#e070f0", // fuchsia
  "#ffcf99", // peach
  "#9fbf3b", // moss
  "#fff07a", // lemon
  "#d6a8e0", // lilac
];


// ── Debugging ────────────────────────────────────────────────

// Performance timing (for finding lag): with PERF_LOGGING on, the game times
// every click (until the next frame is drawn), each redraw of the page, and
// any long task the browser reports. Anything that takes PERF_SLOW_MS or
// more is written to the browser console ("[perf] ..."); a summary is added
// to the end of log.txt, and soloPerf() in the console prints it any time.
export const PERF_LOGGING = true;
export const PERF_SLOW_MS = 50;

// Self-play (testing only: open the page with ?selfplay, see selfplay.js):
// the pause between its moves, so a game can be watched.
export const SELF_PLAY_STEP_MS = 700;
