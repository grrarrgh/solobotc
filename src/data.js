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
  butler: ["Butler", "outsider"],
  drunk: ["Drunk", "outsider"],
  recluse: ["Recluse", "outsider"],
  saint: ["Saint", "outsider"],
  moonchild: ["Moonchild", "outsider"],
  poisoner: ["Poisoner", "minion"],
  spy: ["Spy", "minion"],
  scarletwoman: ["Scarlet Woman", "minion"],
  baron: ["Baron", "minion"],
  assassin: ["Assassin", "minion"],
  devilsadvocate: ["Devil's Advocate", "minion"],
  imp: ["Imp", "demon"],
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
export const ONGOING_INFO = ["empath", "fortuneteller", "undertaker"];

// Chance (0–1) that each Minion also learns the Demon's three bluffs.
// Adjust here: 0 = Minions never know them, 1 = they always do.
export const MINION_BLUFF_CHANCE = 0.5;

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
]);

export const name = (id) => ROLES[id]?.[0] ?? id;
export const team = (id) => ROLES[id]?.[1];
export const alignment = (id) =>
  ["townsfolk", "outsider"].includes(team(id)) ? "good" : "evil";
