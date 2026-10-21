// id: [display name, team]
export const ROLES = {
  washerwoman: ["Washerwoman", "townsfolk"],
  librarian: ["Librarian", "townsfolk"],
  investigator: ["Investigator", "townsfolk"],
  chef: ["Chef", "townsfolk"],
  empath: ["Empath", "townsfolk"],
  fortuneteller: ["Fortune Teller", "townsfolk"],
  undertaker: ["Undertaker", "townsfolk"],
  monk: ["Monk", "townsfolk"],
  ravenkeeper: ["Ravenkeeper", "townsfolk"],
  virgin: ["Virgin", "townsfolk"],
  slayer: ["Slayer", "townsfolk"],
  soldier: ["Soldier", "townsfolk"],
  mayor: ["Mayor", "townsfolk"],
  clockmaker: ["Clockmaker", "townsfolk"],
  grandmother: ["Grandmother", "townsfolk"],
  gambler: ["Gambler", "townsfolk"],
  artist: ["Artist", "townsfolk"],
  fool: ["Fool", "townsfolk"],
  dreamer: ["Dreamer", "townsfolk"],
  snakecharmer: ["Snake Charmer", "townsfolk"],
  mathematician: ["Mathematician", "townsfolk"],
  flowergirl: ["Flowergirl", "townsfolk"],
  towncrier: ["Town Crier", "townsfolk"],
  oracle: ["Oracle", "townsfolk"],
  savant: ["Savant", "townsfolk"],
  seamstress: ["Seamstress", "townsfolk"],
  philosopher: ["Philosopher", "townsfolk"],
  juggler: ["Juggler", "townsfolk"],
  sage: ["Sage", "townsfolk"],
  butler: ["Butler", "outsider"],
  drunk: ["Drunk", "outsider"],
  recluse: ["Recluse", "outsider"],
  saint: ["Saint", "outsider"],
  moonchild: ["Moonchild", "outsider"],
  mutant: ["Mutant", "outsider"],
  sweetheart: ["Sweetheart", "outsider"],
  barber: ["Barber", "outsider"],
  klutz: ["Klutz", "outsider"],
  poisoner: ["Poisoner", "minion"],
  spy: ["Spy", "minion"],
  scarletwoman: ["Scarlet Woman", "minion"],
  baron: ["Baron", "minion"],
  assassin: ["Assassin", "minion"],
  devilsadvocate: ["Devil's Advocate", "minion"],
  eviltwin: ["Evil Twin", "minion"],
  witch: ["Witch", "minion"],
  cerenovus: ["Cerenovus", "minion"],
  pithag: ["Pit-Hag", "minion"],
  imp: ["Imp", "demon"],
  fanggu: ["Fang Gu", "demon"],
  vigormortis: ["Vigormortis", "demon"],
  nodashii: ["No Dashii", "demon"],
  vortox: ["Vortox", "demon"],
};

// Characters that change the number of Outsiders dealt at setup.
export const OUTSIDER_MODIFIERS = { baron: 2, fanggu: 1, vigormortis: -1 };

// Townsfolk who learn something on the first night only, and those who keep
// learning on later nights. Setup deals at least two of each when it can.
export const FIRST_NIGHT_INFO = [
  "washerwoman",
  "librarian",
  "investigator",
  "chef",
  "clockmaker",
  "grandmother",
];
export const ONGOING_INFO = [
  "empath",
  "fortuneteller",
  "undertaker",
  "dreamer",
  "mathematician",
  "flowergirl",
  "towncrier",
  "oracle",
];

// Chance (0–1) that each Minion also learns the Demon's three bluffs.
// Adjust here: 0 = Minions never know them, 1 = they always do.
export const MINION_BLUFF_CHANCE = 1;

// When an NPC Slayer (or evil Slayer bluffer) fires their one shot. They never
// shoot before SLAYER_SHOOT_AFTER_DAY; that day the chance is SLAYER_START_CHANCE,
// rising by SLAYER_CHANCE_STEP each day after (capped at 100%).
// With the defaults: Day 1 0%, Day 2 20%, Day 3 40%, ... Day 6 onwards 100%.
export const SLAYER_SHOOT_AFTER_DAY = 2;
export const SLAYER_START_CHANCE = 0.2;
export const SLAYER_CHANCE_STEP = 0.2;

// How the Demon picks its nightly kill. It "finds" a good player's character
// when they have publicly claimed it, and always knows its own Minions'
// characters. It checks the priority levels from high to low: at each level
// with someone to kill, it attacks one of them at that level's chance, else
// moves down a level. "avoid" characters are never attacked while anyone else
// is available. If no level fires, it attacks any good NPC it isn't avoiding;
// with no good NPC left to attack, any random NPC.
export const KILL_PRIORITY_CHANCE = {
  avoid: 0,
  low: 0.25,
  med: 0.5,
  high: 0.75,
};

// Kill priority for each character (unlisted good characters: "low"; unlisted
// Minions: "avoid").
export const DEMON_KILL_PRIORITY = {
  // Ongoing information and protection: the biggest threats.
  empath: "high",
  fortuneteller: "high",
  undertaker: "high",
  monk: "high",

  // First-night information (already learned) and once-per-game abilities.
  washerwoman: "med",
  librarian: "med",
  investigator: "med",
  chef: "med",
  clockmaker: "med",
  grandmother: "med",
  slayer: "med",
  artist: "med",

  // Little to gain.
  ravenkeeper: "low", // learns a character when killed at night
  virgin: "low",
  gambler: "low",
  butler: "low",
  recluse: "low",
  saint: "low",

  // Killing these wastes the night (or backfires).
  soldier: "avoid",
  mayor: "avoid",
  fool: "avoid",
  moonchild: "avoid",

  // Sects & Violets.
  dreamer: "high",
  oracle: "high",
  savant: "high",
  snakecharmer: "high", // could swap with the Demon
  mathematician: "med",
  flowergirl: "med",
  towncrier: "med",
  seamstress: "med",
  philosopher: "med",
  juggler: "med",
  sweetheart: "med", // dying makes someone drunk
  barber: "med", // dying lets the Demon swap two characters
  mutant: "low",
  sage: "avoid", // learns the Demon is 1 of 2 players
  klutz: "avoid", // might pick an evil player... or might not

  // The Demon's own Minions (by true character). Killing one can make the
  // Demon look good; the useful ones are avoided.
  baron: "low", // no ability left after setup
  spy: "low",
  assassin: "low",
  poisoner: "avoid",
  scarletwoman: "avoid", // the Demon's backup
  devilsadvocate: "avoid",
  eviltwin: "avoid",
  witch: "avoid",
  cerenovus: "avoid",
  pithag: "avoid",
};

// DEMON_STAR_PASS_CHANCE: chance the Demon kills itself to pass the Demon to
// a Minion, on a night after it was nominated and survived.
export const DEMON_STAR_PASS_CHANCE = 0.75;

// Chance an NPC Gambler makes a wild guess (a random character on the
// script) instead of guessing the character their target claims. A wrong
// guess kills a working Gambler.
export const GAMBLER_WILD_GUESS_CHANCE = 0.25;

// Chance that an evil NPC's suspicion (and Slayer, Moonchild and Artist
// targets) points at the evil team's shared scapegoat, when one is alive.
export const SCAPEGOAT_CHANCE = 0.8;

// Sects & Violets NPC behaviour.
// WITCH_HUMAN_CHANCE: chance the Witch curses the human (the player most
//   likely to nominate) rather than a random good NPC.
// SEAMSTRESS_NIGHT_CHANCE: chance an NPC Seamstress uses their once-per-game
//   ability on any given night.
export const WITCH_HUMAN_CHANCE = 0.5;
export const SEAMSTRESS_NIGHT_CHANCE = 0.5;

// PITHAG_EVIL_CHANCE: chance the Pit-Hag changes an evil teammate into a
//   not-in-play character of the same kind (Minion or Demon) instead of
//   turning a good NPC into an Outsider.
// CERENOVUS_EVIL_CHANCE: chance the Cerenovus makes an evil teammate mad
//   (about a good character not in play) instead of a good NPC.
export const PITHAG_EVIL_CHANCE = 0.25;
export const CERENOVUS_EVIL_CHANCE = 0.2;

// Vote animation: how long (in ms) the clock hands point at the nominator
// and nominee before the large hand starts counting votes.
export const VOTE_COUNT_DELAY_MS = 1500;

// Vote animation: how long (in ms) the large hand takes per seat as it
// counts votes. (A voter's hand goes up just before the clock hand arrives.)
export const VOTE_TICK_MS = 450;

// Chance an NPC Juggler guesses a player's claimed character; otherwise they
// guess a random character on the script.
export const JUGGLER_CLAIM_GUESS_CHANCE = 0.5;

// Official ability text, shown on the script sheet. "*" means "not the first
// night".
export const ABILITIES = {
  washerwoman:
    "You start knowing that 1 of 2 players is a particular Townsfolk.",
  librarian:
    "You start knowing that 1 of 2 players is a particular Outsider. (Or that zero are in play.)",
  investigator:
    "You start knowing that 1 of 2 players is a particular Minion.",
  chef: "You start knowing how many pairs of evil players there are.",
  empath: "Each night, you learn how many of your 2 alive neighbours are evil.",
  fortuneteller:
    "Each night, choose 2 players: you learn if either is a Demon. There is a good player that registers as a Demon to you.",
  undertaker:
    "Each night*, you learn which character died by execution today.",
  monk: "Each night*, choose a player (not yourself): they are safe from the Demon tonight.",
  ravenkeeper:
    "If you die at night, you are woken to choose a player: you learn their character.",
  virgin:
    "The 1st time you are nominated, if the nominator is a Townsfolk, they are executed immediately.",
  slayer:
    "Once per game, during the day, publicly choose a player: if they are the Demon, they die.",
  soldier: "You are safe from the Demon.",
  mayor:
    "If only 3 players live & no execution occurs, your team wins. If you die at night, another player might die instead.",
  clockmaker:
    "You start knowing how many steps from the Demon to its nearest Minion.",
  grandmother:
    "You start knowing a good player & their character. If the Demon kills them, you die too.",
  gambler:
    "Each night*, choose a player & guess their character: if you guess wrong, you die.",
  artist:
    "Once per game, during the day, privately ask the Storyteller any yes/no question.",
  fool: "The 1st time you die, you don't.",
  butler:
    "Each night, choose a player (not yourself): tomorrow, you may only vote if they are voting too.",
  drunk:
    "You do not know you are the Drunk. You think you are a Townsfolk character, but you are not.",
  recluse:
    "You might register as evil & as a Minion or Demon, even if dead.",
  saint: "If you die by execution, your team loses.",
  moonchild:
    "When you learn that you died, publicly choose 1 alive player. Tonight, if it was a good player, they die.",
  poisoner:
    "Each night, choose a player: they are poisoned tonight and tomorrow day.",
  spy: "Each night, you see the Grimoire. You might register as good & as a Townsfolk or Outsider, even if dead.",
  scarletwoman:
    "If there are 5 or more players alive & the Demon dies, you become the Demon.",
  baron: "There are extra Outsiders in play. [+2 Outsiders]",
  assassin:
    "Once per game, at night*, choose a player: they die, even if for some reason they could not.",
  devilsadvocate:
    "Each night, choose a living player (different to last night): if executed tomorrow, they don't die.",
  imp: "Each night*, choose a player: they die. If you kill yourself this way, a Minion becomes the Imp.",
  dreamer:
    "Each night, choose a player (not yourself or Travellers): you learn 1 good & 1 evil character, 1 of which is correct.",
  snakecharmer:
    "Each night, choose an alive player: a chosen Demon swaps characters & alignments with you & is then poisoned.",
  mathematician:
    "Each night, you learn how many players' abilities worked abnormally (since dawn) due to another character's ability.",
  flowergirl: "Each night*, you learn if a Demon voted today.",
  towncrier: "Each night*, you learn if a Minion nominated today.",
  oracle: "Each night*, you learn how many dead players are evil.",
  savant:
    "Each day, you may visit the Storyteller to learn 2 things in private: 1 is true & 1 is false.",
  seamstress:
    "Once per game, at night, choose 2 players (not yourself): you learn if they are the same alignment.",
  philosopher:
    "Once per game, at night, choose a good character: gain that ability. If this character is in play, they are drunk.",
  juggler:
    "On your 1st day, publicly guess up to 5 players' characters. That night, you learn how many you got correct.",
  sage: "If the Demon kills you, you learn that it is 1 of 2 players.",
  mutant: 'If you are "mad" about being an Outsider, you might be executed.',
  sweetheart: "When you die, 1 player is drunk from now on.",
  barber:
    "If you died today or tonight, the Demon may choose 2 players (not another Demon) to swap characters.",
  klutz:
    "When you learn that you died, publicly choose 1 alive player: if they are evil, your team loses.",
  eviltwin:
    "You & an opposing player know each other. If the good player is executed, evil wins. Good can't win if you both live.",
  witch:
    "Each night, choose a player: if they nominate tomorrow, they die. If just 3 players live, you lose this ability.",
  cerenovus:
    'Each night, choose a player & a good character: they are "mad" they are this character tomorrow, or might be executed.',
  pithag:
    "Each night*, choose a player & a character they become (if not-in-play). If a Demon is made, deaths tonight are arbitrary.",
  fanggu:
    "Each night*, choose a player: they die. The 1st Outsider this kills becomes an evil Fang Gu & you die instead. [+1 Outsider]",
  vigormortis:
    "Each night*, choose a player: they die. Minions you kill keep their ability & poison 1 Townsfolk neighbour. [−1 Outsider]",
  nodashii:
    "Each night*, choose a player: they die. Your 2 Townsfolk neighbours are poisoned.",
  vortox:
    "Each night*, choose a player: they die. Townsfolk abilities yield false info. Each day, if no-one is executed, evil wins.",
};

// Yes/no questions an Artist can ask the Storyteller about a player.
export const ARTIST_QUESTIONS = {
  evil: "evil",
  demon: "the Demon",
  minion: "a Minion",
  outsider: "an Outsider",
  townsfolk: "a Townsfolk",
};

// seats: [townsfolk, outsiders, minions, demons]
export const COUNTS = {
  5: [3, 0, 1, 1],
  6: [3, 1, 1, 1],
  7: [5, 0, 1, 1],
  8: [5, 1, 1, 1],
  9: [5, 2, 1, 1],
  10: [7, 0, 2, 1],
  11: [7, 1, 2, 1],
  12: [7, 2, 2, 1],
  13: [9, 0, 3, 1],
  14: [9, 1, 3, 1],
  15: [9, 2, 3, 1],
};

// Roles the human can't be dealt: their abilities depend on things the solo
// human never faces (night choices, night attacks, being nominated).
export const FORBIDDEN_HUMAN = new Set([
  "ravenkeeper",
  "virgin",
  "soldier",
  "gambler",
  "fool",
  "moonchild",
  "mayor",
  "saint",
  // Sects & Violets: these need a character choice or public guesses the UI
  // doesn't offer, a night death the human never faces, or (the Snake
  // Charmer) could turn the human evil.
  "snakecharmer",
  "philosopher",
  "juggler",
  "sage",
  "mutant",
  "klutz",
]);

export const name = (id) => ROLES[id]?.[0] ?? id;
export const team = (id) => ROLES[id]?.[1];
export const alignment = (id) =>
  ["townsfolk", "outsider"].includes(team(id)) ? "good" : "evil";
