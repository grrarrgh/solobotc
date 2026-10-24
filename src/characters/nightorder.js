// The night order, for the script sheet's Night order view (see app.js
// showNightOrder()): who the Storyteller wakes, in the official order, with
// a reminder of what happens. A script shows the characters it has, plus the
// steps every game has (NIGHT_STEPS). Characters not listed don't wake (or
// act by day).

// Steps that aren't characters.
export const NIGHT_STEPS = {
  dusk: "Dusk",
  minioninfo: "Minion info",
  demoninfo: "Demon info",
  dawn: "Dawn",
};

export const FIRST_NIGHT = [
  ["dusk", "Everyone closes their eyes."],
  ["philosopher", "Chooses a good character: gains its ability."],
  ["minioninfo", "The Minions learn who each other are, and who the Demon is."],
  [
    "lunatic",
    "Learns they're the Demon, with Minions and bluffs. The real Demon learns who they are.",
  ],
  ["demoninfo", "The Demon learns who their Minions are, and 3 characters not in play to bluff."],
  ["sailor", "Chooses a living player: either the Sailor or they are drunk until dusk."],
  ["marionette", "The Demon learns which neighbour is the Marionette."],
  ["poisoner", "Chooses a player: poisoned tonight and tomorrow."],
  [
    "widow",
    "Sees the Grimoire and chooses a player to poison. A good player learns a Widow is in play.",
  ],
  ["courtier", "Once per game, may choose a character: drunk for 3 nights and 3 days."],
  [
    "snakecharmer",
    "Chooses a living player: if it's the Demon, they swap characters and alignments.",
  ],
  ["godfather", "Learns which Outsiders are in play."],
  ["devilsadvocate", "Chooses a living player: if executed tomorrow, they don't die."],
  ["eviltwin", "The twins learn who each other are, and the other's character."],
  ["witch", "Chooses a player: if they nominate tomorrow, they die."],
  ["cerenovus", "Chooses a player and a good character: they must be mad about it tomorrow."],
  ["pukka", "Chooses a player: they're poisoned."],
  ["pixie", "Learns a Townsfolk in play."],
  [
    "huntsman",
    "Once per game, may choose a living player: the Damsel, if chosen, becomes a Townsfolk not in play.",
  ],
  ["damsel", "The Minions learn a Damsel is in play."],
  ["amnesiac", "Learns what their secret ability tells them."],
  ["washerwoman", "Learns that 1 of 2 players is a particular Townsfolk."],
  ["librarian", "Learns that 1 of 2 players is a particular Outsider (or that there are none)."],
  ["investigator", "Learns that 1 of 2 players is a particular Minion."],
  ["chef", "Learns how many pairs of evil players sit next to each other."],
  ["empath", "Learns how many of their alive neighbours are evil."],
  ["fortuneteller", "Chooses 2 players: learns if either is the Demon."],
  ["butler", "Chooses a master (not themself)."],
  ["grandmother", "Learns a good player and their character: their grandchild."],
  ["clockmaker", "Learns how many steps the Demon is from its nearest Minion."],
  ["dreamer", "Chooses a player: learns 1 good and 1 evil character, 1 of which is theirs."],
  ["seamstress", "Once per game, may choose 2 players: learns if they're the same alignment."],
  ["noble", "Learns 3 players, 1 and only 1 of which is evil."],
  ["balloonist", "Learns a player (of a different character type each night)."],
  ["spy", "Sees the Grimoire."],
  ["ogre", "Chooses a player (not themself): becomes their alignment."],
  ["chambermaid", "Chooses 2 living players: learns how many woke tonight for their ability."],
  ["mathematician", "Learns how many abilities worked abnormally tonight."],
  ["dawn", "Everyone opens their eyes."],
];

export const OTHER_NIGHTS = [
  ["dusk", "Everyone closes their eyes."],
  ["philosopher", "If they haven't yet, chooses a good character: gains its ability."],
  ["sailor", "Chooses a living player: either the Sailor or they are drunk until dusk."],
  ["poisoner", "Chooses a player: poisoned tonight and tomorrow."],
  ["courtier", "Once per game, may choose a character: drunk for 3 nights and 3 days."],
  ["innkeeper", "Chooses 2 players: they can't die tonight, but 1 is drunk until dusk."],
  ["gambler", "Chooses a player and guesses their character: if wrong, the Gambler dies."],
  [
    "snakecharmer",
    "Chooses a living player: if it's the Demon, they swap characters and alignments.",
  ],
  ["monk", "Chooses a player (not themself): safe from the Demon tonight."],
  ["devilsadvocate", "Chooses a living player (not last night's): if executed tomorrow, they don't die."],
  ["witch", "Chooses a player: if they nominate tomorrow, they die."],
  ["cerenovus", "Chooses a player and a good character: they must be mad about it tomorrow."],
  ["pithag", "Chooses a player and a character: they become that character."],
  ["scarletwoman", "If she became the Demon today, she learns it."],
  ["lunatic", "Chooses who to attack, as if the Demon. The real Demon learns who."],
  ["exorcist", "Chooses a player (not last night's): if it's the Demon, the Demon doesn't wake tonight."],
  ["imp", "Chooses a player: they die. If the Imp chooses themself, a Minion becomes the Imp."],
  ["zombuul", "If nobody died today, chooses a player: they die."],
  ["pukka", "Chooses a player: they're poisoned. Last night's choice dies, and is healthy."],
  ["shabaloth", "Chooses 2 players: they die. A player chosen last night might come back to life."],
  ["po", "May choose nobody; if so, chooses 3 players next night. Else chooses a player: they die."],
  [
    "fanggu",
    "Chooses a player: they die. The first Outsider chosen becomes an evil Fang Gu instead, and the Fang Gu dies.",
  ],
  ["nodashii", "Chooses a player: they die."],
  ["vortox", "Chooses a player: they die."],
  [
    "vigormortis",
    "Chooses a player: they die. A Minion killed keeps their ability, and poisons a Townsfolk neighbour.",
  ],
  ["assassin", "Once per game, may choose a player: they die, even if they'd be safe."],
  ["godfather", "If an Outsider died today, chooses a player: they die."],
  ["gossip", "If what they said today was true, a player dies."],
  ["barber", "If the Barber died today, the Demon may swap 2 players' characters."],
  ["sweetheart", "If she died today, a player becomes drunk from now on."],
  ["sage", "If the Demon killed them, learns 2 players, 1 of which is the Demon."],
  ["professor", "Once per game, may choose a dead player: if a Townsfolk, they come back to life."],
  [
    "huntsman",
    "Once per game, may choose a living player: the Damsel, if chosen, becomes a Townsfolk not in play.",
  ],
  ["damsel", "A player who became a Minion learns a Damsel is in play."],
  ["amnesiac", "Learns what their secret ability tells them."],
  ["tinker", "Might die."],
  ["moonchild", "If she died today, the player she chose dies, if good."],
  ["grandmother", "If the Demon killed her grandchild, she dies too."],
  ["ravenkeeper", "If they died tonight, chooses a player: learns their character."],
  ["empath", "Learns how many of their alive neighbours are evil."],
  ["fortuneteller", "Chooses 2 players: learns if either is the Demon."],
  ["undertaker", "Learns the character of the player executed today."],
  ["dreamer", "Chooses a player: learns 1 good and 1 evil character, 1 of which is theirs."],
  ["flowergirl", "Learns if the Demon voted today."],
  ["towncrier", "Learns if a Minion nominated today."],
  ["oracle", "Learns how many dead players are evil."],
  ["seamstress", "Once per game, may choose 2 players: learns if they're the same alignment."],
  ["juggler", "The night after they juggled, learns how many of their guesses were right."],
  ["balloonist", "Learns a player (of a different character type each night)."],
  ["butler", "Chooses a master (not themself)."],
  ["spy", "Sees the Grimoire."],
  ["chambermaid", "Chooses 2 living players: learns how many woke tonight for their ability."],
  ["mathematician", "Learns how many abilities worked abnormally tonight."],
  ["dawn", "Everyone opens their eyes."],
];

// The night order for a script's characters (`ids`): each night's steps as
// { id, text }, without characters it doesn't have.
export function nightOrder(ids) {
  const has = (id) => id in NIGHT_STEPS || ids.includes(id);
  const steps = (list) =>
    list.filter(([id]) => has(id)).map(([id, text]) => ({ id, text }));

  return { first: steps(FIRST_NIGHT), other: steps(OTHER_NIGHTS) };
}
