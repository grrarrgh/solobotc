// The character catalogue: every character's record (and the Travellers
// the game leaves out). The game's settings that come from these records
// (ROLES, ABILITIES, DEMON_KILL_PRIORITY...) are built in src/data.js,
// which re-exports these too.

// Every character, from any script: any of them can share a game (a script
// is just a list of these ids; see scripts/). Each record holds all the game
// needs to know about that character, so a character from another edition
// is added here (and, if its ability needs the Engine, in
// src/characters/<team>/<id>.js):
//   name, team ("townsfolk", "outsider", "minion", "demon", or "fabled": a
//     Storyteller's rule for the game, never dealt; see FABLED), ability (the
//     official text, shown on the script sheet; "*" means "not the first
//     night");
//   note: how this game runs the character, where it simplifies the
//     official ability (shown under it on the script sheet: see NOTES);
//   info: "first" (learns something on the first night only) or "ongoing"
//     (keeps learning on later nights; see FIRST_NIGHT_INFO_SHARE);
//   kill: how keen the Demon is to kill them (see DEMON_KILL_PRIORITY);
//   outsiders: how it changes the Outsiders dealt (see OUTSIDER_MODIFIERS);
//   oncePerGame: when NPCs use the ability (see ONCE_PER_GAME);
//   publicInfo: chance an NPC shares their information in public (see
//     PUBLIC_INFO_CHANCE);
//   bait, neverHides, neverHiddenAs: cover stories (see BAIT_ROLES);
//   neverBluffed: a good player pretending never claims it, and their
//     made-up information never names it (see NEVER_BLUFFED);
//   protects: a protection character (see PROTECTION_ROLES);
//   notForHuman: never dealt to you (see FORBIDDEN_HUMAN);
//   vsLegion: a strong Townsfolk against Legion, favoured in Legion games
//     (see LEGION_STRONG).
export const CHARACTERS = {
  washerwoman: {
    name: "Washerwoman",
    team: "townsfolk",
    ability: "You start knowing that 1 of 2 players is a particular Townsfolk.",
    info: "first",
    kill: "med",
    publicInfo: 0.5,
  },
  librarian: {
    name: "Librarian",
    team: "townsfolk",
    ability:
      "You start knowing that 1 of 2 players is a particular Outsider. (Or that zero are in play.)",
    info: "first",
    kill: "med",
    publicInfo: 0.5,
  },
  investigator: {
    name: "Investigator",
    team: "townsfolk",
    ability: "You start knowing that 1 of 2 players is a particular Minion.",
    info: "first",
    kill: "med",
    publicInfo: 0.4,
  },
  chef: {
    name: "Chef",
    team: "townsfolk",
    ability: "You start knowing how many pairs of evil players there are.",
    info: "first",
    kill: "med",
    publicInfo: 0.6,
    vsLegion: true,
  },
  empath: {
    name: "Empath",
    team: "townsfolk",
    ability:
      "Each night, you learn how many of your 2 alive neighbours are evil.",
    info: "ongoing",
    kill: "high",
    vsLegion: true,
  },
  fortuneteller: {
    name: "Fortune Teller",
    team: "townsfolk",
    ability:
      "Each night, choose 2 players: you learn if either is a Demon. There is a good player that registers as a Demon to you.",
    info: "ongoing",
    kill: "high",
    vsLegion: true,
  },
  undertaker: {
    name: "Undertaker",
    team: "townsfolk",
    ability: "Each night*, you learn which character died by execution today.",
    info: "ongoing",
    kill: "high",
  },
  monk: {
    name: "Monk",
    team: "townsfolk",
    ability:
      "Each night*, choose a player (not yourself): they are safe from the Demon tonight.",
    kill: "high",
    protects: true,
  },
  ravenkeeper: {
    name: "Ravenkeeper",
    team: "townsfolk",
    ability:
      "If you die at night, you are woken to choose a player: you learn their character.",
    kill: "low", // learns a character when killed at night
    publicInfo: 0.7,
    bait: true,
    notForHuman: true,
  },
  virgin: {
    name: "Virgin",
    team: "townsfolk",
    ability:
      "The 1st time you are nominated, if the nominator is a Townsfolk, they are executed immediately.",
    kill: "low",
    neverHiddenAs: true,
    notForHuman: true,
  },
  slayer: {
    name: "Slayer",
    team: "townsfolk",
    ability:
      "Once per game, during the day, publicly choose a player: if they are the Demon, they die.",
    kill: "med",
    oncePerGame: { AFTER_DAY: 2, START_CHANCE: 0.2, STEP_CHANCE: 0.2 }, // day
    vsLegion: true,
  },
  soldier: {
    name: "Soldier",
    team: "townsfolk",
    ability: "You are safe from the Demon.",
    kill: "avoid",
    bait: true,
    protects: true,
    notForHuman: true,
  },
  mayor: {
    name: "Mayor",
    team: "townsfolk",
    ability:
      "If only 3 players live & no execution occurs, your team wins. If you die at night, another player might die instead.",
    kill: "avoid",
    bait: true,
    notForHuman: true,
    vsLegion: true,
  },
  clockmaker: {
    name: "Clockmaker",
    team: "townsfolk",
    ability:
      "You start knowing how many steps from the Demon to its nearest Minion.",
    info: "first",
    kill: "med",
    publicInfo: 0.6,
  },
  grandmother: {
    name: "Grandmother",
    team: "townsfolk",
    ability:
      "You start knowing a good player & their character. If the Demon kills them, you die too.",
    info: "first",
    kill: "med",
    publicInfo: 0.4,
  },
  gambler: {
    name: "Gambler",
    team: "townsfolk",
    ability:
      "Each night*, choose a player & guess their character: if you guess wrong, you die.",
    kill: "low",
    notForHuman: true,
  },
  artist: {
    name: "Artist",
    team: "townsfolk",
    ability:
      "Once per game, during the day, privately ask the Storyteller any yes/no question.",
    kill: "med",
    oncePerGame: { AFTER_DAY: 1, START_CHANCE: 0.5, STEP_CHANCE: 0.25 }, // day
    vsLegion: true,
  },
  fool: {
    name: "Fool",
    team: "townsfolk",
    ability: "The 1st time you die, you don't.",
    kill: "avoid",
    bait: true,
    neverHiddenAs: true,
    notForHuman: true,
  },
  dreamer: {
    name: "Dreamer",
    team: "townsfolk",
    ability:
      "Each night, choose a player (not yourself or Travellers): you learn 1 good & 1 evil character, 1 of which is correct.",
    info: "ongoing",
    kill: "high",
    vsLegion: true,
  },
  snakecharmer: {
    name: "Snake Charmer",
    team: "townsfolk",
    ability:
      "Each night, choose an alive player: a chosen Demon swaps characters & alignments with you & is then poisoned.",
    kill: "high", // could swap with the Demon
    notForHuman: true,
  },
  mathematician: {
    name: "Mathematician",
    team: "townsfolk",
    ability:
      "Each night, you learn how many players' abilities worked abnormally (since dawn) due to another character's ability.",
    note: "Kept simple here: every living player who is drunk or poisoned counts, once each, however many times.",
    info: "ongoing",
    kill: "med",
  },
  flowergirl: {
    name: "Flowergirl",
    team: "townsfolk",
    ability: "Each night*, you learn if a Demon voted today.",
    info: "ongoing",
    kill: "med",
  },
  towncrier: {
    name: "Town Crier",
    team: "townsfolk",
    ability: "Each night*, you learn if a Minion nominated today.",
    info: "ongoing",
    kill: "med",
  },
  oracle: {
    name: "Oracle",
    team: "townsfolk",
    ability: "Each night*, you learn how many dead players are evil.",
    info: "ongoing",
    kill: "high",
    vsLegion: true,
  },
  savant: {
    name: "Savant",
    team: "townsfolk",
    ability:
      "Each day, you may visit the Storyteller to learn 2 things in private: 1 is true & 1 is false.",
    kill: "high",
    neverHides: true,
    vsLegion: true,
  },
  seamstress: {
    name: "Seamstress",
    team: "townsfolk",
    ability:
      "Once per game, at night, choose 2 players (not yourself): you learn if they are the same alignment.",
    kill: "med",
    oncePerGame: { AFTER_DAY: 1, START_CHANCE: 0.5, STEP_CHANCE: 0.25 }, // night
    publicInfo: 0.5,
    vsLegion: true,
  },
  philosopher: {
    name: "Philosopher",
    team: "townsfolk",
    ability:
      "Once per game, at night, choose a good character: gain that ability. If this character is in play, they are drunk.",
    kill: "med",
    note: "Can't choose the Atheist, whose ability is about setup (no evil characters), so would give nothing.",
    oncePerGame: { AFTER_DAY: 1, START_CHANCE: 1, STEP_CHANCE: 0 }, // night
    vsLegion: true,
  },
  juggler: {
    name: "Juggler",
    team: "townsfolk",
    ability:
      "On your 1st day, publicly guess up to 5 players' characters. That night, you learn how many you got correct.",
    kill: "med",
    publicInfo: 0.6,
    notForHuman: true,
  },
  sage: {
    name: "Sage",
    team: "townsfolk",
    ability: "If the Demon kills you, you learn that it is 1 of 2 players.",
    kill: "avoid", // learns the Demon is 1 of 2 players
    publicInfo: 0.8,
    bait: true,
    notForHuman: true,
  },
  sailor: {
    name: "Sailor",
    team: "townsfolk",
    ability:
      "Each night, choose an alive player: either you or they are drunk until dusk. You can't die.",
    kill: "avoid", // can't die
    bait: true,
    protects: true,
  },
  chambermaid: {
    name: "Chambermaid",
    team: "townsfolk",
    ability:
      "Each night, choose 2 alive players (not yourself): you learn how many woke tonight due to their ability.",
    info: "ongoing",
    kill: "high",
  },
  exorcist: {
    name: "Exorcist",
    team: "townsfolk",
    ability:
      "Each night*, choose a player (different to last night): the Demon, if chosen, learns who you are then doesn't wake tonight.",
    kill: "high", // could stop the Demon waking
  },
  innkeeper: {
    name: "Innkeeper",
    team: "townsfolk",
    ability:
      "Each night*, choose 2 players: they can't die tonight, but 1 is drunk until dusk.",
    kill: "high", // protects 2 players a night
    protects: true,
  },
  gossip: {
    name: "Gossip",
    team: "townsfolk",
    ability:
      "Each day, you may make a public statement. Tonight, if it was true, a player dies.",
    kill: "med",
  },
  courtier: {
    name: "Courtier",
    team: "townsfolk",
    ability:
      "Once per game, at night, choose a character: they are drunk for 3 nights & 3 days.",
    kill: "med", // could make the Demon drunk
    oncePerGame: { AFTER_DAY: 1, START_CHANCE: 0.4, STEP_CHANCE: 0.2 }, // night
  },
  professor: {
    name: "Professor",
    team: "townsfolk",
    ability:
      "Once per game, at night*, choose a dead player: if they are a Townsfolk, they are resurrected.",
    kill: "high", // could bring back an information Townsfolk
    oncePerGame: { AFTER_DAY: 2, START_CHANCE: 0.5, STEP_CHANCE: 0.25 }, // night
  },
  minstrel: {
    name: "Minstrel",
    team: "townsfolk",
    ability:
      "When a Minion dies by execution, all other players (except Travellers) are drunk until dusk tomorrow.",
    kill: "low",
  },
  tealady: {
    name: "Tea Lady",
    team: "townsfolk",
    ability: "If both your alive neighbours are good, they can't die.",
    kill: "med", // her good neighbours can't die
    protects: true,
  },
  pacifist: {
    name: "Pacifist",
    team: "townsfolk",
    ability: "Executed good players might not die.",
    kill: "low",
  },
  noble: {
    name: "Noble",
    team: "townsfolk",
    ability: "You start knowing 3 players, 1 and only 1 of which is evil.",
    info: "first",
    kill: "med",
    publicInfo: 0.5,
    vsLegion: true,
  },
  pixie: {
    name: "Pixie",
    team: "townsfolk",
    ability:
      "You start knowing 1 in-play Townsfolk. If you were mad that you were this character, you gain their ability when they die.",
    kill: "med",
    neverHiddenAs: true,
    neverBluffed: true,
    notForHuman: true,
  },
  bountyhunter: {
    name: "Bounty Hunter",
    team: "townsfolk",
    ability:
      "You start knowing 1 evil player. If the player you know dies, you learn another evil player tonight. [1 Townsfolk is evil]",
    note: "The evil Townsfolk learns they're evil, but not who the rest of the evil team is, and the team doesn't learn them: they play for evil blind, steering clear of the players they suspect (see strategy hunches()).",
    info: "first",
    kill: "high",
    publicInfo: 0.5,
  },
  shugenja: {
    name: "Shugenja",
    team: "townsfolk",
    ability:
      "You start knowing if your closest evil player is clockwise or anti-clockwise. If equidistant, this info is arbitrary.",
    note: "Clockwise is round the town square towards higher seat numbers. Steps are counted over living players. NPCs don't weigh the direction as evidence against anyone.",
    info: "first",
    kill: "med",
    publicInfo: 0.6,
  },
  highpriestess: {
    name: "High Priestess",
    team: "townsfolk",
    ability:
      "Each night, learn which player the Storyteller believes you should talk to most.",
    info: "ongoing",
    kill: "med",
  },
  alchemist: {
    name: "Alchemist",
    team: "townsfolk",
    ability:
      "You have a Minion ability. When using this, the Storyteller may prompt you to choose differently.",
    info: "first",
    kill: "med",
  },
  poppygrower: {
    name: "Poppy Grower",
    team: "townsfolk",
    ability:
      "Minions & Demons do not know each other. If you die, they learn who each other are that night.",
    kill: "high", // once they die, the evil team knows each other
    neverHiddenAs: true, // a real one always hides, so nobody claims it openly
  },
  atheist: {
    name: "Atheist",
    team: "townsfolk",
    ability:
      "The Storyteller can break the game rules, and if executed, good wins, even if you are dead. [No evil characters]",
    note: "The Storyteller pretends some players are the Demon and Minions, kills at night as that Demon, and gives information as if they were the Demon. Abilities that act, not inform (the Slayer, Snake Charmer...), see the truth. The Atheist can't be made mad (by a Cerenovus, real or pretend). Any living player may nominate the Storyteller (press the Sun), once a day: executing it needs votes from half the living players (rounded up), whatever anyone else got today, and ends the game at once. In other games, an evil player may claim to be the Atheist.",
    kill: "med",
    // (No good player pretends to be one, nor hides as one: claiming it is a
    // call to execute the Storyteller. An evil Minion may claim it: see
    // setup.js, EVIL_ATHEIST_BLUFF_CHANCE.)
    neverBluffed: true,
    neverHiddenAs: true,
  },
  general: {
    name: "General",
    team: "townsfolk",
    ability:
      "Each night, you learn which alignment the Storyteller believes is winning: good, evil, or neither.",
    info: "ongoing",
    kill: "med",
  },
  villageidiot: {
    name: "Village Idiot",
    team: "townsfolk",
    ability:
      "Each night, choose a player: you learn their alignment. [+0 to +2 Village Idiots. 1 of the extras is drunk]",
    info: "ongoing",
    kill: "high",
    vsLegion: true,
  },
  magician: {
    name: "Magician",
    team: "townsfolk",
    ability:
      "The Demon thinks you are a Minion. Minions think you are a Demon.",
    kill: "low", // the evil team thinks they're a teammate
    notForHuman: true, // the evil team's confusion is the NPCs'
  },
  balloonist: {
    name: "Balloonist",
    team: "townsfolk",
    ability:
      "Each night, you learn a player of a different character type than last night. [+0 or +1 Outsider]",
    info: "ongoing",
    kill: "med",
    outsiders: [0, 1],
  },
  amnesiac: {
    name: "Amnesiac",
    team: "townsfolk",
    ability:
      "You do not know what your ability is. Each day, privately guess what it is: you learn how accurate you are.",
    kill: "med", // a secret ability (see characters/townsfolk/amnesiac.js)
  },
  fisherman: {
    name: "Fisherman",
    team: "townsfolk",
    ability:
      "Once per game, during the day, visit the Storyteller for some advice to help your team win.",
    note: "Kept simple here: the advice is one tip, chosen from a set list of tips.",
    kill: "med",
    oncePerGame: { AFTER_DAY: 1, START_CHANCE: 0.4, STEP_CHANCE: 0.3 }, // day
    vsLegion: true,
  },
  huntsman: {
    name: "Huntsman",
    team: "townsfolk",
    ability:
      "Once per game, at night, choose a living player: the Damsel, if chosen, becomes a not-in-play Townsfolk. [+the Damsel]",
    kill: "med", // could save the Damsel
    // (A guess: NPCs wait for the Damsel to tell them; see strategy huntsman().)
    oncePerGame: { AFTER_DAY: 3, START_CHANCE: 0.3, STEP_CHANCE: 0.2 }, // night
  },
  puzzlemaster: {
    name: "Puzzlemaster",
    team: "townsfolk",
    ability:
      "1 player is drunk, even if you die. If you guess (once) who it is, learn the Demon player, but guess wrong & get false info.",
    kill: "med", // could learn the Demon
    oncePerGame: { AFTER_DAY: 2, START_CHANCE: 0.4, STEP_CHANCE: 0.2 }, // day
  },
  cannibal: {
    name: "Cannibal",
    team: "townsfolk",
    ability:
      "You have the ability of the recently killed executee. If they are evil, you are poisoned until a good player dies by execution.",
    kill: "med", // gains the executed player's ability
  },
  butler: {
    name: "Butler",
    team: "outsider",
    ability:
      "Each night, choose a player (not yourself): tomorrow, you may only vote if they are voting too.",
    kill: "low",
  },
  drunk: {
    name: "Drunk",
    team: "outsider",
    ability:
      "You do not know you are the Drunk. You think you are a Townsfolk character, but you are not.",
    neverHiddenAs: true,
    neverBluffed: true,
    notForHuman: true,
  },
  recluse: {
    name: "Recluse",
    team: "outsider",
    ability: "You might register as evil & as a Minion or Demon, even if dead.",
    kill: "low",
  },
  saint: {
    name: "Saint",
    team: "outsider",
    ability: "If you die by execution, your team loses.",
    kill: "low",
    neverHiddenAs: true,
    notForHuman: true,
  },
  moonchild: {
    name: "Moonchild",
    team: "outsider",
    ability:
      "When you learn that you died, publicly choose 1 alive player. Tonight, if it was a good player, they die.",
    kill: "avoid",
    neverHiddenAs: true,
    notForHuman: true,
  },
  mutant: {
    name: "Mutant",
    team: "outsider",
    ability:
      "If you are \"mad\" about being an Outsider, you might be executed.",
    kill: "low",
    neverHiddenAs: true,
    neverBluffed: true,
    notForHuman: true,
  },
  damsel: {
    name: "Damsel",
    team: "outsider",
    ability:
      "All Minions know a Damsel is in play. If a Minion publicly guesses you (once), your team loses.",
    kill: "low", // the Minions want her alive, to guess her
    neverHiddenAs: true,
    notForHuman: true,
  },
  sweetheart: {
    name: "Sweetheart",
    team: "outsider",
    ability: "When you die, 1 player is drunk from now on.",
    kill: "med", // dying makes someone drunk
    neverHiddenAs: true,
  },
  barber: {
    name: "Barber",
    team: "outsider",
    ability:
      "If you died today or tonight, the Demon may choose 2 players (not another Demon) to swap characters.",
    kill: "med", // dying lets the Demon swap two characters
    neverHiddenAs: true,
    notForHuman: true, // its ability is the Demon's choice, not yours
  },
  klutz: {
    name: "Klutz",
    team: "outsider",
    ability:
      "When you learn that you died, publicly choose 1 alive player: if they are evil, your team loses.",
    kill: "avoid", // might pick an evil player... or might not
    neverHiddenAs: true,
    notForHuman: true,
  },
  tinker: {
    name: "Tinker",
    team: "outsider",
    ability: "You might die at any time.",
    kill: "low",
    neverHiddenAs: true,
    notForHuman: true,
  },
  goon: {
    name: "Goon",
    team: "outsider",
    ability:
      "Each night, the 1st player to choose you with their ability is drunk until dusk. You become their alignment.",
    kill: "avoid", // makes the Demon drunk (and joins its team)
    neverHiddenAs: true,
    notForHuman: true,
  },
  lunatic: {
    name: "Lunatic",
    team: "outsider",
    ability:
      "You think you are a Demon, but you are not. The Demon knows who you are & who you choose at night.",
    kill: "avoid", // thinks they're the Demon, and the Demon knows who they pick
    neverHiddenAs: true,
    neverBluffed: true,
    notForHuman: true,
  },
  ogre: {
    name: "Ogre",
    team: "outsider",
    ability:
      "On your 1st night, choose a player (not yourself): you become their alignment (you don't know which) even if drunk or poisoned.",
    kill: "low",
    neverHiddenAs: true,
    notForHuman: true,
  },
  politician: {
    name: "Politician",
    team: "outsider",
    ability:
      "If you were the player most responsible for your team losing, you change alignment & win, even if dead.",
    kill: "low",
  },
  heretic: {
    name: "Heretic",
    team: "outsider",
    ability: "Whoever wins, loses & whoever loses, wins, even if you are dead.",
    kill: "low",
    // (Only claimed once dead, or in the final 4 or 3: see
    // characters/outsider/heretic.js.)
    neverHiddenAs: true,
  },
  poisoner: {
    name: "Poisoner",
    team: "minion",
    ability:
      "Each night, choose a player: they are poisoned tonight and tomorrow day.",
    kill: "avoid",
  },
  spy: {
    name: "Spy",
    team: "minion",
    ability:
      "Each night, you see the Grimoire. You might register as good & as a Townsfolk or Outsider, even if dead.",
    kill: "low",
  },
  scarletwoman: {
    name: "Scarlet Woman",
    team: "minion",
    ability:
      "If there are 5 or more players alive & the Demon dies, you become the Demon.",
    kill: "avoid", // the Demon's backup
  },
  baron: {
    name: "Baron",
    team: "minion",
    ability: "There are extra Outsiders in play. [+2 Outsiders]",
    kill: "low", // no ability left after setup
    outsiders: 2,
  },
  assassin: {
    name: "Assassin",
    team: "minion",
    ability:
      "Once per game, at night*, choose a player: they die, even if for some reason they could not.",
    kill: "low",
    oncePerGame: { AFTER_DAY: 2, START_CHANCE: 0.3, STEP_CHANCE: 0.15 }, // night
  },
  devilsadvocate: {
    name: "Devil's Advocate",
    team: "minion",
    ability:
      "Each night, choose a living player (different to last night): if executed tomorrow, they don't die.",
    kill: "avoid",
  },
  eviltwin: {
    name: "Evil Twin",
    team: "minion",
    ability:
      "You & an opposing player know each other. If the good player is executed, evil wins. Good can't win if you both live.",
    kill: "avoid",
  },
  witch: {
    name: "Witch",
    team: "minion",
    ability:
      "Each night, choose a player: if they nominate tomorrow, they die. If just 3 players live, you lose this ability.",
    kill: "avoid",
  },
  cerenovus: {
    name: "Cerenovus",
    team: "minion",
    ability:
      "Each night, choose a player & a good character: they are \"mad\" they are this character tomorrow, or might be executed.",
    kill: "avoid",
  },
  pithag: {
    name: "Pit-Hag",
    team: "minion",
    ability:
      "Each night*, choose a player & a character they become (if not-in-play). If a Demon is made, deaths tonight are arbitrary.",
    kill: "avoid",
  },
  godfather: {
    name: "Godfather",
    team: "minion",
    ability:
      "You start knowing which Outsiders are in play. If 1 died today, choose a player tonight: they die. [−1 or +1 Outsider]",
    kill: "avoid",
    outsiders: [-1, 1],
  },
  mastermind: {
    name: "Mastermind",
    team: "minion",
    ability:
      "If the Demon dies by execution (ending the game), play for 1 more day. If a player is then executed, their team loses.",
    kill: "avoid",
  },
  widow: {
    name: "Widow",
    team: "minion",
    ability:
      "On your 1st night, look at the Grimoire & choose a player: they are poisoned. 1 good player knows a Widow is in play.",
    kill: "avoid",
  },
  goblin: {
    name: "Goblin",
    team: "minion",
    ability:
      "If you publicly claim to be the Goblin when nominated & are executed that day, your team wins.",
    kill: "avoid",
  },
  fearmonger: {
    name: "Fearmonger",
    team: "minion",
    ability:
      "Each night, choose a player: if you nominate & execute them, their team loses. All players know if you choose a new player.",
    kill: "avoid",
  },
  psychopath: {
    name: "Psychopath",
    team: "minion",
    ability:
      "Each day, before nominations, you may publicly choose a player: they die. If executed, you only die if you lose roshambo.",
    kill: "avoid",
  },
  wizard: {
    name: "Wizard",
    team: "minion",
    ability:
      "Once per game, choose to make a wish. If granted, it might have a price & leave a clue as to its nature.",
    note: "Kept simple here: Select from a list of wishes, each with a price.",
    kill: "avoid",
  },
  boomdandy: {
    name: "Boomdandy",
    team: "minion",
    ability:
      "If you are executed, all but 3 players die. After a 10 to 1 countdown, the player with the most players pointing at them, dies.",
    kill: "avoid",
  },
  marionette: {
    name: "Marionette",
    team: "minion",
    ability:
      "You think you are a good character, but you are not. The Demon knows who you are. [You neighbour the Demon]",
    kill: "avoid", // thinks they're good: a hidden teammate
  },
  mezepheles: {
    name: "Mezepheles",
    team: "minion",
    ability:
      "You start knowing a secret word. The 1st good player to say this word becomes evil that night.",
    kill: "avoid",
  },
  imp: {
    name: "Imp",
    team: "demon",
    ability:
      "Each night*, choose a player: they die. If you kill yourself this way, a Minion becomes the Imp.",
  },
  fanggu: {
    name: "Fang Gu",
    team: "demon",
    ability:
      "Each night*, choose a player: they die. The 1st Outsider this kills becomes an evil Fang Gu & you die instead. [+1 Outsider]",
    outsiders: 1,
  },
  vigormortis: {
    name: "Vigormortis",
    team: "demon",
    ability:
      "Each night*, choose a player: they die. Minions you kill keep their ability & poison 1 Townsfolk neighbour. [−1 Outsider]",
    outsiders: -1,
  },
  nodashii: {
    name: "No Dashii",
    team: "demon",
    ability:
      "Each night*, choose a player: they die. Your 2 Townsfolk neighbours are poisoned.",
  },
  lleech: {
    name: "Lleech",
    team: "demon",
    ability:
      "Each night*, choose a player: they die. You start by choosing an alive player: they are poisoned - you die if & only if they are dead.",
  },
  vortox: {
    name: "Vortox",
    team: "demon",
    ability:
      "Each night*, choose a player: they die. Townsfolk abilities yield false info. Each day, if no-one is executed, evil wins.",
  },
  zombuul: {
    name: "Zombuul",
    team: "demon",
    ability:
      "Each night*, if no-one died today, choose a player: they die. The 1st time you die, you live but register as dead.",
  },
  pukka: {
    name: "Pukka",
    team: "demon",
    ability:
      "Each night, choose a player: they are poisoned. The previously poisoned player dies then becomes healthy.",
  },
  shabaloth: {
    name: "Shabaloth",
    team: "demon",
    ability:
      "Each night*, choose 2 players: they die. A dead player you chose last night might be regurgitated.",
  },
  po: {
    name: "Po",
    team: "demon",
    ability:
      "Each night*, you may choose a player: they die. If your last choice was no-one, choose 3 players tonight.",
  },
  legion: {
    name: "Legion",
    team: "demon",
    ability:
      "Each night*, a player might die. Executions fail if only evil voted. You register as a Minion too. [Most players are Legion]",
  },
  lilmonsta: {
    name: "Lil' Monsta",
    team: "demon",
    ability:
      "Each night, Minions choose who babysits Lil' Monsta & \"is the Demon\". Each night*, a player might die. [+1 Minion]",
    note: "Lil' Monsta isn't a player: an extra Minion is dealt instead. Each night the Minions choose which of them babysits it (the babysitter registers as the Demon, and keeps their own Minion ability); if the babysitter dies, so does Lil' Monsta. Each night* the Storyteller chooses who might die (never the babysitter, steering for a close finish): drunkenness and poison can't stop it, though protection like the Monk's still can.",
  },
  leviathan: {
    name: "Leviathan",
    team: "demon",
    ability:
      "If more than 1 good player is executed, evil wins. All players know you are in play. After day 5, evil wins.",
    note: "The Leviathan doesn't kill at night. Each morning the Storyteller announces that it's in play, and the day. A good player's execution counts even if they don't die, or were already dead.",
  },
  sentinel: {
    name: "Sentinel",
    team: "fabled",
    ability: "There might be 1 extra or 1 fewer Outsider in play.",
    outsiders: [-1, 0, 1],
  },
};

// Travellers aren't supported: a script's Travellers are left out (as in a
// game no Traveller joins).
export const TRAVELLERS = [
  "scapegoat",
  "gunslinger",
  "beggar",
  "bureaucrat",
  "thief",
  "butcher",
  "bonecollector",
  "harlot",
  "barista",
  "deviant",
  "apprentice",
  "matron",
  "judge",
  "bishop",
  "voudon",
  "gangster",
  "gnome",
  "cacklejack",
];
