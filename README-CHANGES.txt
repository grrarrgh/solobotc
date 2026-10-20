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