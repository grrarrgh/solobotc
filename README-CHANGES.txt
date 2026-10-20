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

## Evil Bluff Information

- Evil NPCs now report night information that fits the role they are bluffing, on the nights that role would wake: Washerwoman, Librarian, Investigator and Chef on Night 1; Empath and Fortune Teller every night; Undertaker from Night 2; Monk choices from Night 2; and a Ravenkeeper reading if they are killed at night. Bluffing a role with no night information gets "I have no stored information.", the same as a good NPC.
- A Spy who isn't poisoned has seen the Grimoire, so their bluffed information is true.
- All other evil NPCs give information that is definitely wrong: a wrong Chef or Empath number, the opposite Fortune Teller answer, a wrong Undertaker or Ravenkeeper character, and Washerwoman/Librarian/Investigator pairs where neither player has the named character (good players are framed where possible).
- Bluffed information is recorded as a "bluff" in the post-game event log, not as real information.
- Washerwoman, Librarian and Investigator information never names the player receiving it.

## New Script: Everyone Can Play

- Added the Everyone Can Play script (scripts/Everyone Can Play_1_0_2.json) to the Script menu. Scripts can now list characters as plain ids or as { "id": ... } objects.
- New characters, following the official wiki:
  - Clockmaker (Townsfolk): learns on Night 1 how many seats the Demon is from its nearest Minion.
  - Grandmother (Townsfolk): learns a good player and their character on Night 1. If the Demon kills that grandchild, the Grandmother dies too.
  - Gambler (Townsfolk): from Night 2, guesses a player's character each night and dies if wrong. Never told if the guess was right.
  - Artist (Townsfolk): once per game, asks the Storyteller a yes/no question by day. A human Artist picks a player and a question ("Is this player evil / the Demon / a Minion / an Outsider / a Townsfolk?"). NPC Artists ask on Day 1 whether a suspect is the Demon and share the answer when asked.
  - Fool (Townsfolk): the first time they would die, they don't. This includes execution, where they are declared executed but stay alive. Doesn't apply against the Assassin.
  - Moonchild (Outsider): when they die, they publicly choose a living player. If that player is good, they die the following night (unless Monk-protected).
  - Assassin (Minion): once per game, from Night 2, kills a player. Nothing can prevent it.
  - Devil's Advocate (Minion): each night, chooses a living player (not the same as last night). If that player is executed the next day, they don't die. Favours protecting evil teammates.
- Drunk or poisoned versions of these characters get unreliable information or have no effect, as with the other characters. Evil NPCs bluffing them report appropriate information (true for a working Spy, false otherwise), and evil Moonchild bluffers make a public choice with no effect.
- The human can't be dealt the Gambler, Fool or Moonchild, because the solo human never makes night choices or faces night attacks.
- New Key Moments: Gambler guesses, Fool saves, Moonchild curses, Assassin kills and Devil's Advocate protection.

## Bug Fixes

- Drunk: evil players can no longer bluff as the Drunk, so no NPC ever claims to be the Drunk. A real Drunk always believes they are the Townsfolk on their token and claims it.
- Drunk: a Drunk's information is now always wrong for the Townsfolk they think they are (wrong number, wrong YES/NO, wrong character, or a pair that doesn't include the named character), instead of random information that could be right by chance. The same goes for a Drunk Artist's answer and a Drunk Ravenkeeper's reading. Poisoned players still get random information.
- Nominations: each player can be nominated only once per day. After a failed vote, the Nominate button is disabled for that player until the next day.
- Washerwoman, Librarian and Investigator: the two players named are always two other players, never the player receiving the information, including when drunk or poisoned.

## Bug Fixes: Information Layout, Debug Log, Night Choices & Monk

- Ongoing information: when an NPC is asked, their claim, each night's (or day's) information and their suspicion each appear on a separate line, in both the answer and the Public Log.
- Debug log: after the game ends, a "Download log.txt" link appears next to the Reset button. The log is plain text, grouped into Setup / Night N / Day N / Game Over sections in the order things happened. It contains:
  - every night action in night order (Poisoner, Devil's Advocate, Monk, Gambler, Moonchild curse, Demon, Assassin, deaths, information received, bluffs);
  - every interaction (conversations and their full answers, nominations with who voted and whether each vote counted, Slayer shots, Artist questions, ending the day);
  - at the end of every night and at Game Over, a table of every player: seat, true character (and the Townsfolk a Drunk believes they are), claim, alignment, alive/DEAD, DRUNK, POISONED, PROTECTED, and the information they received that night.
- Night choices: the Fortune Teller and Ravenkeeper now only pick living players, like every other character that chooses at night.
- Monk: each night's protection is reported as "Night N: Monk: protected Player X from the Demon.", one line per night.

## Bug Fixes: Setup, Bluffs, Suspicion & Town Square

- Character setup: the Townsfolk dealt always include at least two first-night information characters (Washerwoman, Librarian, Investigator, Chef, Clockmaker, Grandmother) and two ongoing information characters (Empath, Fortune Teller, Undertaker). When there are fewer than four Townsfolk seats (e.g. 5 players with a Baron), every Townsfolk dealt is an information character, alternating between the two kinds.
- Demon bluffs: the Demon learns three good characters that are not in play (never the Drunk, and never a token a Drunk was shown) and bluffs as one of them.
- Minion bluffs: each Minion also learns the Demon's three bluffs at an adjustable chance, set by MINION_BLUFF_CHANCE in src/data.js (default 0.5 = 50%). A Minion who doesn't know them bluffs as a random Townsfolk on the script. Evil teammates avoid claiming the same character when they can. The bluffs, and which Minions know them, are recorded in the Setup section of log.txt.
- Suspicion: each NPC keeps one suspect instead of picking a new one every time they're asked. At the start of each day there is a 35% chance it moves, and it always moves if the suspect has died. It only ever moves to a living NPC, never the human.
- Town square: the circle grows with the number of seats (from about 320px at 5 seats to 720px at 15), but never wider than the screen; there's a smaller scale on narrow screens.

## New Feature: Fireplace Script Sheet

- A fireplace sits in the centre of the town square. Pressing it opens a popup showing the script being played (name and author) and every character on it, grouped into Townsfolk, Outsiders, Minions and Demons (good teams in blue, evil in red), each with its official ability text. Close it with the Close button, the Escape key, or by clicking outside it.

## Bug Fixes: Bluffs in Log, Role Popups, Script Popup & Storyteller Log

- Debug log: the header now lists the Demon's three bluffs, and the Setup section records which player was told them and which one they bluff as.
- Role popups: every character name outside the town square (your role heading, NPC answers, the Storyteller and Public logs, the final reveal and Key Moments) is now a dotted-underlined link. Pressing it opens a popup with the character's name, team and ability; pressing the popup closes it. The town square seats are unchanged.
- Script popup: the Close button is gone; pressing the popup (or the area around it) closes it.
- Storyteller log: entries no longer have list numbers ("1.", "2.", ...); each line starts with its "Night N" label, styled like the Public Log.
- Increase chance that Minions get bluffs by 25%

## Bug Fix: Human Night Choices

- If the human's character chooses players at night, the Storyteller now wakes them. A panel below the town square shows the prompt; the human clicks living players in the town square (clicking again un-picks; a new pick replaces the oldest once the limit is reached) and presses "Select". The night then carries on in night order.
  - Monk (from Night 2): choose 1 player to protect from the Demon.
  - Fortune Teller (every night): choose 2 players; you learn if either is the Demon.
  - Butler (every night): choose your master; tomorrow your vote only counts if they vote too.
- Drunk or poisoned: the human is still woken and still chooses, but the result may be wrong: a Monk's protection fails, a Fortune Teller's answer is wrong (Drunk) or random (poisoned), and a Butler's vote restriction doesn't apply.
- NPC Butlers now choose a master each night too (before, their votes never counted). Evil NPCs bluffing as the Butler report a choice.
- The wake-up and the human's choice are recorded in log.txt.
