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
