Replace these files in the repository:
- index.html
- src/app.js
- styles.css

Changes:
1. Setup is hidden once Start is clicked.
2. Removed the target dropdown.
3. Clicking a non-human town-square seat selects that player.
4. Interaction controls appear below the town square only after selection.
5. Selection clears when the day ends.

Feature update:
6. Added a Random Seed button that generates a random positive integer without starting the game.
7. Added a Reset button at the bottom of the completed-game reveal. Reset returns to setup while preserving the current seat, script, and seed selections.
8. User-visible logs now display newest details first.
9. Added a Town Square info button showing Townsfolk/Outsiders/Minions/Demons counts for the selected player count. The first two values are blue and the last two are red.
10. Added automated UI-source checks covering the new controls and role-count source.

## Latest Updates

- Failed votes now allow repeated nominations, with vote results recorded in the Public Log.
- The Human’s nightly information is logged exactly as received, including potentially incorrect drunk or poisoned information.
- NPCs provide suspicion information when asked: good NPCs are truthful unless drunk or poisoned, while evil NPCs always lie.
- Post-game Key Moments now include detailed night actions such as Poisoner targets, Monk protection, Demon attacks, deaths, and Demon succession.
## Night Choices, Slayer, Virgin & Drunk

- NPCs who choose players at night now say so when asked. Monks report who they protected ("Night 2: Monk: protected Player 3."), alongside the existing Fortune Teller and Ravenkeeper reports. Evil NPCs bluffing as a Monk or Fortune Teller invent a choice each night and report it the same way; these bluffs appear in the post-game event log.
- NPC Slayers, and evil NPCs bluffing as Slayer, may shoot once per game. Each dawn they have a 35% chance to shoot a living NPC they find suspicious. Good Slayers aim at evil players (wrongly half the time if drunk or poisoned); evil bluffers aim at good players. Only a working Slayer hitting the Imp (or the Recluse) kills. The shot and its result go in the Public Log and Key Moments.
- NPC Virgins: the first time the Human nominates a Virgin who isn't drunk or poisoned, the Human is executed if their true character is a Townsfolk, and the day ends. A Human who is secretly the Drunk does not trigger it. Dead players can no longer nominate or use the Slayer ability.
- The Drunk (an Outsider) is shown a Townsfolk token that is not in play, and gets unreliable information for that role. A human Drunk is never shown a Ravenkeeper, Virgin or Soldier token. Fixed: a Drunk who thinks they are the Ravenkeeper now gets unreliable information instead of the truth.
- A Slayer shot that kills the Recluse now checks for the two-players-left victory.
