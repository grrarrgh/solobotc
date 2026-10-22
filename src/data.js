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
  sailor: ["Sailor", "townsfolk"],
  chambermaid: ["Chambermaid", "townsfolk"],
  exorcist: ["Exorcist", "townsfolk"],
  innkeeper: ["Innkeeper", "townsfolk"],
  gossip: ["Gossip", "townsfolk"],
  courtier: ["Courtier", "townsfolk"],
  professor: ["Professor", "townsfolk"],
  minstrel: ["Minstrel", "townsfolk"],
  tealady: ["Tea Lady", "townsfolk"],
  pacifist: ["Pacifist", "townsfolk"],
  butler: ["Butler", "outsider"],
  drunk: ["Drunk", "outsider"],
  recluse: ["Recluse", "outsider"],
  saint: ["Saint", "outsider"],
  moonchild: ["Moonchild", "outsider"],
  mutant: ["Mutant", "outsider"],
  sweetheart: ["Sweetheart", "outsider"],
  barber: ["Barber", "outsider"],
  klutz: ["Klutz", "outsider"],
  tinker: ["Tinker", "outsider"],
  goon: ["Goon", "outsider"],
  lunatic: ["Lunatic", "outsider"],
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
  godfather: ["Godfather", "minion"],
  mastermind: ["Mastermind", "minion"],
  imp: ["Imp", "demon"],
  fanggu: ["Fang Gu", "demon"],
  vigormortis: ["Vigormortis", "demon"],
  nodashii: ["No Dashii", "demon"],
  vortox: ["Vortox", "demon"],
  zombuul: ["Zombuul", "demon"],
  pukka: ["Pukka", "demon"],
  shabaloth: ["Shabaloth", "demon"],
  po: ["Po", "demon"],
};

// Characters that change the number of Outsiders dealt at setup. (A list is
// a choice: the Godfather deals 1 fewer or 1 more, at random.)
export const OUTSIDER_MODIFIERS = {
  baron: 2,
  fanggu: 1,
  vigormortis: -1,
  godfather: [-1, 1],
};

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
  "chambermaid",
];

// Chance (0–1) that each Minion also learns the Demon's three bluffs.
// Adjust here: 0 = Minions never know them, 1 = they always do.
export const MINION_BLUFF_CHANCE = 1;

// When NPCs use their once-per-game abilities (and evil NPCs "use" bluffed
// ones). Never before AFTER_DAY (a day for day abilities, a night for night
// ones); then START_CHANCE that day, rising by STEP_CHANCE each day after
// (capped at 100%). E.g. the Slayer: Day 1 0%, Day 2 20%, Day 3 40%, ...
// Day 6 onwards 100%. (The Juggler always juggles on their first day, as
// their ability says.)
export const ONCE_PER_GAME = {
  slayer: { AFTER_DAY: 2, START_CHANCE: 0.2, STEP_CHANCE: 0.2 }, // day
  artist: { AFTER_DAY: 1, START_CHANCE: 0.5, STEP_CHANCE: 0.25 }, // day
  seamstress: { AFTER_DAY: 1, START_CHANCE: 0.5, STEP_CHANCE: 0.25 }, // night
  philosopher: { AFTER_DAY: 1, START_CHANCE: 1, STEP_CHANCE: 0 }, // night
  assassin: { AFTER_DAY: 2, START_CHANCE: 0.3, STEP_CHANCE: 0.15 }, // night
  courtier: { AFTER_DAY: 1, START_CHANCE: 0.4, STEP_CHANCE: 0.2 }, // night
  professor: { AFTER_DAY: 2, START_CHANCE: 0.5, STEP_CHANCE: 0.25 }, // night
};

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

  // Bad Moon Rising.
  chambermaid: "high",
  exorcist: "high", // could stop the Demon waking
  innkeeper: "high", // protects 2 players a night
  professor: "high", // could bring back an information Townsfolk
  courtier: "med", // could make the Demon drunk
  gossip: "med",
  tealady: "med", // her good neighbours can't die
  minstrel: "low",
  pacifist: "low",
  tinker: "low",
  lunatic: "low",
  sailor: "avoid", // can't die
  goon: "avoid", // makes the Demon drunk (and joins its team)

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
  godfather: "avoid",
  mastermind: "avoid",
};

// DEMON_STAR_PASS_CHANCE: chance the Demon kills itself to pass the Demon to
// a Minion, on a night after it was nominated and survived.
export const DEMON_STAR_PASS_CHANCE = 0.75;

// The Vigormortis's kill priority for its own Minions: a Minion it kills
// keeps their ability (and poisons a Townsfolk neighbour), so it's keen to.
export const VIGORMORTIS_MINION_PRIORITY = "high";

// Chance an NPC Gambler makes a wild guess (a random character on the
// script) instead of guessing the character their target claims. A wrong
// guess kills a working Gambler.
export const GAMBLER_WILD_GUESS_CHANCE = 0.25;

// Chance that an evil NPC's suspicion (and Slayer, Moonchild and Artist
// targets) points at the evil team's shared scapegoat, when one is alive.
export const SCAPEGOAT_CHANCE = 0.8;

// How NPCs vote on a nomination.
// GOOD_VOTE_CHANCE: a good NPC's chance to vote when nothing makes them lean
//   either way. Each point of public evidence against the nominee (see
//   evidence() in src/strategy.js) adds GOOD_VOTE_EVIDENCE_STEP, between
//   GOOD_VOTE_MIN and GOOD_VOTE_MAX. They vote at GOOD_VOTE_MAX for someone
//   they suspect and GOOD_VOTE_MIN for someone they trust.
// HUMAN_NOMINATION_BONUS: added to a good NPC's chance when you nominated.
// EVIL_VOTE_CHANCE: an evil NPC's chance to vote for a good nominee.
// EVIL_TEAMMATE_VOTE_CHANCE: an evil NPC's chance to vote for a teammate,
//   which they only do when their vote can't change the outcome (the
//   nominee already has the votes needed, or can't reach them).
export const GOOD_VOTE_CHANCE = 0.5;
export const GOOD_VOTE_EVIDENCE_STEP = 0.15;
export const GOOD_VOTE_MIN = 0.1;
export const GOOD_VOTE_MAX = 0.9;
export const HUMAN_NOMINATION_BONUS = 0.1;
export const EVIL_VOTE_CHANCE = 0.85;
export const EVIL_TEAMMATE_VOTE_CHANCE = 0.5;

// How much each thing a good NPC has seen in public counts towards
// suspecting a player (see evidence() in src/strategy.js). Negative weights
// count towards trusting them.
export const EVIDENCE_WEIGHT = {
  claimsMyCharacter: 4, // claims the character I am
  doubleClaim: 2, // claims the same character as another player
  accusedByNightDeath: 2, // a player suspected them, then died in the night
  trustedByNightDeath: -1, // a player trusted them, then died in the night
  namedByInfo: 1, // someone's shared information points at them
  vouchedByInfo: -1, // someone's shared information vouches for them
  accused: 0.5, // someone says they're suspicious of them
  trusted: -0.5, // someone says they trust them
  nominatedTrusted: 1.5, // nominated a player I trust
  votedTrusted: 0.5, // voted for a player I trust
  nominatedNightDeath: 1, // nominated a player who later died in the night
};

// The evidence a good NPC needs before it changes who they suspect (less,
// and they stick with their hunch). At 1, one player's say-so (0.5) isn't
// enough, so the town doesn't all pile onto the first accusation.
export const EVIDENCE_TO_SUSPECT = 1;

// You, the human, can be misinformed like anyone else.
// HUMAN_DRUNK_CHANCE: when the Drunk is dealt, the chance it's you (shown a
//   Townsfolk, and never told). Otherwise you're dealt a good character at
//   random, which can still be the Drunk.
// HUMAN_POISON_CHANCE: each night, the chance the Poisoner picks you (not
//   two nights running). Otherwise they pick as usual, and can still pick you.
export const HUMAN_DRUNK_CHANCE = 0.15;
export const HUMAN_POISON_CHANCE = 0.10;

// Sects & Violets NPC behaviour.
// WITCH_HUMAN_CHANCE: chance the Witch curses the human (the player most
//   likely to nominate) rather than a random good NPC.
export const WITCH_HUMAN_CHANCE = 0.2;

// PITHAG_EVIL_CHANCE: chance the Pit-Hag changes an evil teammate into a
//   not-in-play character of the same kind (Minion or Demon) instead of
//   turning a good NPC into an Outsider.
// CERENOVUS_EVIL_CHANCE: chance the Cerenovus makes an evil teammate mad
//   (about a good character not in play) instead of a good NPC.
export const PITHAG_EVIL_CHANCE = 0.25;
export const CERENOVUS_EVIL_CHANCE = 0.2;

// When the Pit-Hag makes a Demon, that night's death is random instead of
// the Demon's kill: any living NPC except the Demon. This is the chance
// that nobody dies that night instead.
export const PITHAG_NO_DEATH_CHANCE = 0.3;

// Bad Moon Rising Storyteller choices.
// The Sailor: the Storyteller decides who is drunk (the Sailor or the player
// they chose) when it first matters: an attack on either of them, their
// pick using an ability, or dawn. When the choice decides whether an attack
// kills, the Storyteller favours good: a good victim lives, an evil one
// dies. Otherwise:
// SAILOR_DRUNK_SELF_CHANCE: chance the Sailor (rather than the player they
//   chose) is drunk until dusk.
// SAILOR_LATE_ALIVE, SAILOR_LATE_DRUNK_CHANCE: with fewer than
//   SAILOR_LATE_ALIVE players alive, the Sailor is drunk at this chance
//   whatever is at stake, so their ability usually fails.
// PACIFIST_SAVE_CHANCE: chance an executed good player doesn't die while a
//   working Pacifist lives.
// TINKER_DEATH_CHANCE: each night, the chance a working Tinker dies.
// SHABALOTH_REGURGITATE_CHANCE: each night, the chance a dead player the
//   Shabaloth chose last night comes back to life.
export const SAILOR_DRUNK_SELF_CHANCE = 0.3;
export const SAILOR_LATE_ALIVE = 6;
export const SAILOR_LATE_DRUNK_CHANCE = 0.7;
export const PACIFIST_SAVE_CHANCE = 0.5;
export const TINKER_DEATH_CHANCE = 0.1;
export const SHABALOTH_REGURGITATE_CHANCE = 0.25;

// Bad Moon Rising NPC behaviour.
// GOSSIP_CHANCE: each day, the chance an NPC Gossip (or Gossip bluffer)
//   makes a public statement.
// PO_CHARGE_CHANCE: each night, the chance the Po chooses no-one, to kill 3
//   the next night.
// LUNATIC_FOLLOW_CHANCE: the Demon learns who the Lunatic chose to "kill";
//   the chance it kills them, so the Lunatic keeps believing.
export const GOSSIP_CHANCE = 0.4;

// Sinking a kill: on a night when an evil player is publicly claiming one
// of PROTECTION_ROLES, the chance the Demon kills nobody, so the claimed
// protection looks like it worked.
export const PROTECTION_ROLES = [
  "monk",
  "soldier",
  "sailor",
  "innkeeper",
  "tealady",
];
export const SINK_KILL_CHANCE = 0.2;
export const PO_CHARGE_CHANCE = 0.25;
export const LUNATIC_FOLLOW_CHANCE = 0.5;

// Vote animation: how long (in ms) the clock hands point at the nominator
// and nominee before the large hand starts counting votes.
export const VOTE_COUNT_DELAY_MS = 500;

// Vote animation: how long (in ms) the large hand takes per seat as it
// counts votes. (A voter's hand goes up just before the clock hand arrives.)
export const VOTE_TICK_MS = 200;

// Town square size, set from the menu (☰) by the title (as a fraction of
// the normal size). The −/+ buttons step it by TOWN_SQUARE_SIZE_STEP, between
// TOWN_SQUARE_SIZE_MIN and TOWN_SQUARE_SIZE_MAX. (It never grows past the
// width of the screen.) The browser remembers the last size used.
export const TOWN_SQUARE_SIZE = 1;
export const TOWN_SQUARE_SIZE_STEP = 0.1;
export const TOWN_SQUARE_SIZE_MIN = 0.6;
export const TOWN_SQUARE_SIZE_MAX = 1.5;

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
  sailor:
    "Each night, choose an alive player: either you or they are drunk until dusk. You can't die.",
  chambermaid:
    "Each night, choose 2 alive players (not yourself): you learn how many woke tonight due to their ability.",
  exorcist:
    "Each night*, choose a player (different to last night): the Demon, if chosen, learns who you are then doesn't wake tonight.",
  innkeeper:
    "Each night*, choose 2 players: they can't die tonight, but 1 is drunk until dusk.",
  gossip:
    "Each day, you may make a public statement. Tonight, if it was true, a player dies.",
  courtier:
    "Once per game, at night, choose a character: they are drunk for 3 nights & 3 days.",
  professor:
    "Once per game, at night*, choose a dead player: if they are a Townsfolk, they are resurrected.",
  minstrel:
    "When a Minion dies by execution, all other players (except Travellers) are drunk until dusk tomorrow.",
  tealady: "If both your alive neighbours are good, they can't die.",
  pacifist: "Executed good players might not die.",
  tinker: "You might die at any time.",
  goon:
    "Each night, the 1st player to choose you with their ability is drunk until dusk. You become their alignment.",
  lunatic:
    "You think you are a Demon, but you are not. The Demon knows who you are & who you choose at night.",
  godfather:
    "You start knowing which Outsiders are in play. If 1 died today, choose a player tonight: they die. [−1 or +1 Outsider]",
  mastermind:
    "If the Demon dies by execution (ending the game), play for 1 more day. If a player is then executed, their team loses.",
  zombuul:
    "Each night*, if no-one died today, choose a player: they die. The 1st time you die, you live but register as dead.",
  pukka:
    "Each night, choose a player: they are poisoned. The previously poisoned player dies then becomes healthy.",
  shabaloth:
    "Each night*, choose 2 players: they die. A dead player you chose last night might be regurgitated.",
  po: "Each night*, you may choose a player: they die. If your last choice was no-one, choose 3 players tonight.",
};

// Yes/no questions an Artist can ask the Storyteller about a player.
export const ARTIST_QUESTIONS = {
  evil: "evil",
  demon: "the Demon",
  minion: "a Minion",
  outsider: "an Outsider",
  townsfolk: "a Townsfolk",
};

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

// In bigger games (PUBLIC_INFO_MIN_SEATS or more seats), NPCs with
// first-night information, or information from an ability that's now spent,
// may say it publicly the morning they get it (evil bluffers share their
// bluffed information the same way). The chance for each character:
export const PUBLIC_INFO_MIN_SEATS = 13;
export const PUBLIC_INFO_CHANCE = {
  // First night.
  washerwoman: 0.5,
  librarian: 0.5,
  investigator: 0.4,
  chef: 0.6,
  clockmaker: 0.6,
  grandmother: 0.4,
  // Spent abilities.
  seamstress: 0.5,
  juggler: 0.6,
  ravenkeeper: 0.7,
  sage: 0.8,
};

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
  // Bad Moon Rising: the Tinker's death and the Goon's and Lunatic's
  // alignment tricks don't fit a human who is always good.
  "tinker",
  "goon",
  "lunatic",
]);

export const name = (id) => ROLES[id]?.[0] ?? id;
export const team = (id) => ROLES[id]?.[1];
export const alignment = (id) =>
  ["townsfolk", "outsider"].includes(team(id)) ? "good" : "evil";
