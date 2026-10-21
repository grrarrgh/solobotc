# Changes

Newest first.

## Improvements: Code Clean-up, Start Script & README

- `npm start` now runs a small built-in Node server (serve.js) instead of `python3`, which usually isn't available on Windows. `npm run check` syntax-checks every file in src/ without a hand-kept list.
- README.md is rewritten: how to play, the scripts, the tuning constants in src/data.js, the code layout and the tests.
- index.html declares `<!doctype html>` and a language, so browsers no longer render it in quirks mode.
- Removed unused files (src/strategies.js, src/talk-limit.js and an empty test file) and stale comments about the old `SLAYER_*` and SEAMSTRESS_NIGHT_CHANCE settings. The Slayer's timing is now its own row in ONCE_PER_GAME.
- Shared helpers replace repeated code: `byId` (in src/util.js) for looking up a player, and the strategy's `others()` for "living NPCs other than me".

## Bug Fixes & Improvements: Picks, Bluffs, Votes, Timing & Dawn Deaths

- Vigormortis: its own Minions are a high kill priority (VIGORMORTIS_MINION_PRIORITY in src/data.js), since a Minion it kills keeps their ability.
- Evil bluffs never name the human: every pick and pair in an evil player's bluffed information (Washerwoman/Librarian/Investigator pairs, Fortune Teller and Dreamer picks, Grandmother, Sage, Savant, Butler, Gambler, Ravenkeeper...) leaves the human out, including the Spy's true bluffs.
- Night picks vary: NPCs avoid picking the same player(s) as last time when anyone else is available (Monk, Fortune Teller, Dreamer, Snake Charmer, Butler, Gambler, Poisoner, Witch, Cerenovus, Pit-Hag).
- False information is less obvious: wrong numbers are just above or below the truth; the Oracle never says more evil are dead than are dead; the Flowergirl and Town Crier don't claim a vote or nomination on a day with none.
- Dead votes: a dead good NPC keeps their one ghost vote and only spends it on a nominee they're suspicious of.
- Game over: the status line just says "Game Over!" (the winner is in the Final reveal), and the Public log and Final reveal are both collapsed; click a heading to open it. Reset and Download log.txt stay visible.
- Once-per-game timing: ONCE_PER_GAME in src/data.js sets AFTER_DAY, START_CHANCE and STEP_CHANCE for when NPCs use (or evil bluffers "use") the Slayer (replacing the old `SLAYER_*` settings), Artist, Seamstress, Philosopher and Assassin abilities. The Juggler still juggles on their first day.
- Dawn deaths: night deaths are announced in the morning ("Player X died in the night." or "Nobody died in the night."), which is when the human learns they died too. "When you learn that you died" abilities (Moonchild, Klutz) trigger then. The Ravenkeeper still wakes during the night.

## New Features: Madness & Pit-Hag Improvements

- Public announcements: at dawn, a living NPC whose claim no longer matches what they last claimed in public (to the human when asked, or publicly) says so in the Public Log; if they never claimed in public, nothing is said: "Player 2 now claims to be the Mayor." (made mad; the madness isn't given away), 'Player 2: "Yesterday the Cerenovus made me mad as the Mayor, I am actually the Chef."' (no longer mad, or made mad again about something else, which they then name as what they actually are), or "Player 4 says they woke up as the Klutz." (changed by the Pit-Hag, Barber or Snake Charmer).
- Mad NPCs share only made-up information for the character they're mad about; once the madness ends, they go back to their real information (or, for evil players, their bluffed information).
- Pit-Hag and the evil team: at PITHAG_EVIL_CHANCE (in src/data.js, default 25%) the Pit-Hag changes an evil teammate into a not-in-play character of the same kind instead: a Minion into another Minion, or the Demon into another Demon (never the Evil Twin). Evil players changed this way keep their bluff, so nothing is announced. When the Pit-Hag makes a Demon, that night's death is random instead of the Demon's choice: any living NPC except the Demon dies (never the human), or, at PITHAG_NO_DEATH_CHANCE (default 30%), nobody does. This is noted in log.txt. "If you die at night" abilities still trigger on a random death: the Ravenkeeper learns a character (as on any night death, e.g. from the Assassin or a Moonchild curse), and a Mayor picked for it has someone else die instead.
- Cerenovus and the evil team: at CERENOVUS_EVIL_CHANCE (default 20%) the Cerenovus makes an evil teammate mad about a good character that isn't in play, giving them a fresh claim for a day; once the madness ends they return to their previous bluff.

## Bug Fixes: Dead Claims, Unused Abilities, Evil Bluffs & Clock Hands

- Once dead, the Mutant (no longer at risk of execution) claims the Mutant when asked. The Mutant can be one of the Demon's bluffs: an evil player who takes it claims a Townsfolk that isn't in play (like a real Mutant), and once dead claims the Mutant. Other evil players stick to their bluffs, dead or alive.
- NPCs whose claimed character has a once-per-game ability they haven't used say so when asked ("I haven't used my Slayer ability yet."): Slayer, Artist, Seamstress, Juggler, Philosopher, Virgin and Fool. Evil bluffers say it too, until they've "used" it.
- Juggler: when a guess isn't the player's claim, it's another plausible character: one somebody is claiming, or one of the evil team's bluffs.
- Evil Philosopher bluffers "gain" a Townsfolk that is in play (preferring information characters, which implies its real holder is drunk) and then give false information for that character each night.
- Evil bluffers now give false information for every character they can bluff, including the Seamstress (once), the Snake Charmer (a nightly choice) and the Sage (a false Demon pair if the Demon kills them). The Spy still tells the truth for their bluff.
- The clock hands in the vote animation are thinner.

## Bug Fixes: Twins, Juggler, Mutant, Log Layout & Vote Speed

- Twins: while both twins live, each is suspicious of the other ("I'm suspicious of Player X, my evil twin."), above any other opinion. Once the other twin dies, they form a new opinion from their information. When asked, each twin says "Player X is my twin, and I am the good twin.", and on Day 1 each NPC twin says so publicly in the Public Log.
- Juggler: guesses a player's claimed character only at JUGGLER_CLAIM_GUESS_CHANCE (in src/data.js, default 50%), otherwise a random character on the script, so their guesses are no longer always right. Every NPC Juggler juggles on their first day as the Juggler (Day 1, or the day after they become one), once.
- Mutant: nobody alive claims the Mutant. It's never a Cerenovus madness, and a player turned into the Mutant by the Pit-Hag or Barber claims a Townsfolk that isn't in play instead. (An evil player can take the Mutant as a bluff; see above.)
- Information on its own line: in the logs, information now starts on a new line after "Player X claimed Y:" and "You received:", and each of the Savant's two statements is on its own line.
- Vote animation: the time the large hand takes per seat is set by VOTE_TICK_MS (in src/data.js, default 450 ms); the hand's swing and the raised hands scale with it.

## New Features: Improved Nomination Phase

- Nominations no longer execute anyone straight away. If at least half the living players vote, and that's more votes than any nomination so far today, the nominee is marked for execution with a skull on their seat. A later nomination takes the mark only with more votes. Following the official rules, a tie with the highest count so far leaves nobody marked, and a later nomination must beat that count.
- End day executes whoever has the skull and ends the day. With nobody marked, nobody is executed. Everything that happens on an execution (Saint, Demon death and succession, Devil's Advocate, Fool, Evil Twin, Moonchild) now happens then; the Vortox and the Mayor's final-three win apply only when nobody was executed. The Virgin still executes a Townsfolk nominator immediately and ends the day, and a Witch-cursed nominator still dies as they nominate.
- Each player can nominate once per day and be nominated once per day. "Request nomination" is always available (next to Nominate while you're alive); the NPC who nominates must be alive and not have nominated yet today.
- The bar above End day shows who is marked for execution (or that a tie leaves nobody marked).
- Vote animation: when someone is nominated, clock hands fade in over the clock tower, the small hand pointing at the nominator and the large hand at the nominee. After VOTE_COUNT_DELAY_MS (in src/data.js, default 2000 ms) the large hand ticks clockwise round the town square, from the seat after the nominee round to the nominee, with each voter's hand going up just before the clock hand reaches them (faded if the vote doesn't count, e.g. a Butler's) and glowing as it's counted, with a running tally. Then the skull marks the nominee if they're now marked, the clock hands fade out and the clock tower fades back in. Buttons and seats are disabled while the vote is shown.
- The final reveal and log.txt record each nomination's outcome and each end-of-day execution.

## Bug Fixes: Juggler & Grimoire Layout

- Juggler: each public guess is on its own line in the Public Log, and the guesses are now also recorded in log.txt and the final reveal's timeline.
- Grimoire: the # and Team columns are gone; each row is tinted blue (good) or red (evil) instead. Long text wraps so the whole table fits the screen without scrolling sideways (with a smaller size on narrow screens).
- Grimoire: the Demon's bluffs are listed once, under the table ("Demon bluffs: ... (known by ...)"), instead of under each evil player.

## New Features: Final Reveal Grimoire & Timeline

- The final reveal now follows log.txt more closely. Under the result banner (which now also shows the script, player count and seed):
  - Grimoire: a table of every player with their seat, character (and what it changed to, e.g. "Clockmaker → Klutz"), what they claimed, their team, and how their game ended ("Survived", "Executed Day 3", "Died Night 2 (Demon)"). A notes line underneath shows what happened to them: the character a Drunk thought they were, abilities gained, Pit-Hag / Barber / Demon changes, lasting drunkenness or poison, the Evil Twin pairing, and the bluffs an evil player knew.
  - Timeline: every event in order, grouped into collapsible Setup / Night / Day sections, each with a short summary (conversations, nominations, executions, deaths). Votes list who voted and whose votes didn't count. "Key moments only" filters down to the important events; "Open all" / "Close all" expands or collapses every section.
- The per-night player tables stay in log.txt.

## New Script: Sects & Violets

- A "mad" NPC now makes up plausible information to match the character they're mad about: what that character would have learned on each night so far (e.g. Empath numbers, Fortune Teller answers, a Monk's protections), with random answers. They share it when asked, and their trust/suspicion comes from it. Their real information is kept, and comes back with their real claim the next night.
- The Cerenovus picks its target the same way the Demon picks its kills (DEMON_KILL_PRIORITY and KILL_PRIORITY_CHANCE in src/data.js): public high-priority claims first, never "avoid" claims while anyone else is available. The two share one priority helper.
- The madness is always a good character other than the target's own: not their true character, not the character they think they are (a Drunk's token), not their current claim, and never the Drunk.
- Added the Sects & Violets script (scripts/Sects and Violets_1_0_0.json), formatted one character per line with a name and author, and added it to the Script menu.
- Any Demon, not just the Imp, now counts as the Demon everywhere: win checks, the Slayer, Fortune Teller, Clockmaker and Artist, and Demon succession (a new Demon is the same character as the old one; only an Imp that kills itself passes to a Minion).
- New Townsfolk:
  - Dreamer: each night, picks a player and learns 1 good and 1 evil character, 1 of which is theirs. A human Dreamer is woken to pick.
  - Snake Charmer: each night, picks a player; if it's the Demon, they swap characters and alignments, and the old Demon becomes a good Snake Charmer, poisoned from now on.
  - Mathematician: each night, learns how many players' abilities worked abnormally (poisoned, made drunk, or Townsfolk under the Vortox).
  - Flowergirl / Town Crier: each night after the first, learns whether a Demon voted / a Minion nominated that day.
  - Oracle: each night after the first, learns how many dead players are evil.
  - Savant: each day, learns two statements, one true and one false. A human Savant uses the new "Visit the Storyteller" button (once a day).
  - Seamstress: once per game, at night, learns whether two players share an alignment. A human Seamstress is woken each night until they use it, with a "Not tonight" option.
  - Philosopher: once per game (NPCs on Night 1), gains a good character's ability; if that character is in play, its holder is drunk from now on.
  - Juggler: on Day 1, publicly guesses up to 5 players' characters, and learns that night how many were right.
  - Sage: if the Demon kills them, learns the Demon is 1 of 2 players.
- New Outsiders:
  - Mutant: claims a Townsfolk that isn't in play.
  - Sweetheart: when they die, a good player (ideally one with information) is drunk from now on.
  - Barber: when they die, the Demon swaps two good NPCs' characters (they learn and claim their new ones).
  - Klutz: when they die, publicly picks a living player (someone they trust); if evil, good loses.
- New Minions:
  - Evil Twin: paired at setup with a good player (possibly the human), who learns on Night 1 who their Evil Twin is. The Evil Twin claims their good twin's character. If the good twin is executed, evil wins; good can't win while both twins live.
  - Witch: each night, curses a player (the human at WITCH_HUMAN_CHANCE, default 50%, otherwise a good NPC); if they nominate the next day, they die. No ability once only 3 players live.
  - Cerenovus: each night, makes a good NPC "mad" about another character; all the next day they claim that character and say nothing else.
  - Pit-Hag: from Night 2, turns a good NPC (preferring public information claimers) into an Outsider that isn't in play.
- New Demons:
  - Fang Gu [+1 Outsider]: the first Outsider it kills becomes an evil Fang Gu instead, and the old Fang Gu dies.
  - Vigormortis [-1 Outsider]: a Minion it kills keeps their ability and poisons one of their Townsfolk neighbours while the Vigormortis lives.
  - No Dashii: its nearest Townsfolk on each side are poisoned.
  - Vortox: all Townsfolk information is false (including the Artist's and Savant's), and if a day ends with no execution, evil wins.
- Setup: the Fang Gu and Vigormortis change the Outsider count (OUTSIDER_MODIFIERS in src/data.js, alongside the Baron's +2). The Sects & Violets information Townsfolk count towards the "two first-night and two ongoing information characters" rule.
- The human can't be dealt the Snake Charmer, Philosopher, Juggler, Sage, Mutant or Klutz (they need choices the UI doesn't offer, a night death the human never faces, or could turn the human evil).
- Kill priorities, ability text and role popups cover every new character. New Key Moments include Snake Charmer swaps, Witch curses, Pit-Hag changes, Barber swaps, Klutz picks, Sweetheart deaths and Philosopher choices.
- Tests now also play hundreds of complete games on all three scripts to check nothing crashes.

## Bug Fixes: Demon Targets

- The Demon can target its own Minions again. Minions are in DEMON_KILL_PRIORITY by their true character (the Demon knows who they are): Baron, Spy and Assassin default to "low" (killing one can make the Demon look good); Poisoner, Scarlet Woman (the Demon's backup) and Devil's Advocate default to "avoid". Unlisted Minions count as "avoid".
- A Minion who has publicly bluffed a "med" or "high" character is ranked at that higher level (e.g. a Baron publicly claiming Empath becomes a "high" target), since killing a "confirmed" information role makes good cover for the Demon. A Minion whose true character is set to "avoid" stays avoided whatever they claim.
- With no good NPC left to attack, the Demon attacks any random living NPC.

## Bug Fixes: Gambler, Demon Kill Priorities, End Day & NPC Opinions

- Gambler: an NPC Gambler now takes a wild guess (a random character on the script) at GAMBLER_WILD_GUESS_CHANCE (default 25%) instead of guessing their target's claim, so a working Gambler has a real chance to die by their own ability.
- Demon kill priorities: each character has a kill priority in DEMON_KILL_PRIORITY ("avoid", "low", "med" or "high"), and each level's chance is set in KILL_PRIORITY_CHANCE (default avoid 0%, low 25%, med 50%, high 75%), both in src/data.js. The Demon "finds" a character when a good NPC has publicly claimed it, then works down from high to low: at each level with someone to kill it attacks one of them at that level's chance. "Avoid" claims (Soldier, Mayor, Fool, Moonchild by default) are never attacked while anyone else is available. If no level fires, it attacks any good NPC it isn't avoiding. This replaces DEMON_INFO_KILL_CHANCE.
- End day: the "End day" button now sits in its own bar under the town square and is always available during the day, so the day can be ended (and the night started) without selecting a player or nominating anyone.
- NPC opinions: instead of "I heard Player X is suspicious", NPCs end their answer with one of:
  - Nothing: "I have nothing else to add." (a good NPC with no information);
  - Trust: "I trust Player X, because of what I learned on Night N.";
  - Suspicious: "I'm suspicious of Player X, because of what I learned on Night N."
  The opinion comes from the NPC's latest information that names a living NPC (e.g. Fortune Teller NO or Empath 0 means trust; Fortune Teller YES, Empath 1+ or an Investigator pair means suspicion; Washerwoman, Grandmother, Monk, Butler and Gambler picks mean trust; Artist and Ravenkeeper answers depending on what they say). A Drunk's or poisoned NPC's wrong information gives a wrong opinion. Evil NPCs' bluffed information vouches for their teammates and accuses the scapegoat. With no information that names anyone, NPCs fall back on their general suspicion ("I'm suspicious of Player X.").

## Minor Change: Clock Tower

- The fireplace in the centre of the town square is now a clock tower (spire, clock face, belfry and door) in the same gold and stone colours. It still opens the script popup when pressed, and glows gold on hover.

## New Features: Improving Evil

- Demon kills: the Demon never attacks its own teammates, and skips NPCs who have publicly claimed Soldier or Mayor. It goes after good NPCs who have publicly claimed an information role (ongoing ones such as Empath, Fortune Teller and Undertaker first) at a 75% chance; otherwise it attacks a random good NPC. (Since replaced by the kill priority list, see above.)
- Star-passing: the old random 6% self-kill is gone. On a night after the Demon was nominated and survived, it kills itself at DEMON_STAR_PASS_CHANCE (default 75%) so a Minion becomes the Demon, but only if a Minion is alive to take over.
- Scapegoat: the evil team agrees on one good NPC to frame, preferring good NPCs who have publicly claimed an information role, and picks a new one when they die. Evil suspicion (and evil Slayer, Moonchild and Artist targets) points at the scapegoat at SCAPEGOAT_CHANCE (default 80%).
- Framing: evil information bluffs back up the accusation while still being lies. An evil Investigator names the scapegoat as one of the two "Minions"; an evil Fortune Teller gets a YES on the scapegoat and another good player; an evil Empath's number goes up when the scapegoat is a neighbour; an evil Artist only asks about good players; and a dying evil Ravenkeeper bluffer names the scapegoat as an evil character.
- log.txt shows who the evil team is framing in each night's player states.
- The new settings live in src/data.js: DEMON_STAR_PASS_CHANCE and SCAPEGOAT_CHANCE.
- Minions back up the Demon: a Minion bluffing a first-night information role uses their Night 1 "information" to confirm the Demon's claim. As Washerwoman (or Librarian, if the Demon claims an Outsider) they name the Demon as one of their two players, as the character the Demon claims; as Grandmother they name the Demon as their grandchild. Roles that can't confirm a claim (Chef, Clockmaker, Investigator) still give false information. This applies to the Spy too.
- Demon bluffs: the Demon avoids bluffing first-night information roles when one of their three bluffs allows it. Minions who know the bluffs prefer the first-night ones, so they can vouch for the Demon.
- Requested Virgin nominations: only NPCs claiming a Townsfolk step up to nominate a claimed Virgin: real Townsfolk, the Drunk (who claims their Townsfolk token) and evil Townsfolk bluffers. Those claiming a first-night information role go first. The Virgin still only triggers for a real Townsfolk nominator.
- Poisoner: targets good players with ongoing information roles (Empath, Fortune Teller, Undertaker) when there are any.
- Empath bluffs: an evil (or Drunk) Empath repeats the same wrong number while their neighbours are unchanged, and reports a different wrong number once a neighbour dies.

## Bug Fixes: Spy Bluffs, Virgin Nominations, Minion Suspicion & Artist Questions

- Spy: always knows the Demon's three bluffs, and claims a good character that is not in play and is not one of the Demon's bluffs, so the Spy never double-claims with anyone.
- Virgin: when the human (a true Townsfolk) nominates a working Virgin for the first time, the human is executed immediately and the day ends. Once the human is dead, the Nominate button is replaced by "Request nomination".
- Request nomination: when the selected player is a known Virgin claimer, or when the human is dead, a "Request nomination" button lets the human ask the town to nominate that player; a living NPC makes the nomination. If the Virgin is real, sober and healthy, and the NPC nominator is a Townsfolk, that NPC is executed immediately and the day ends; if either is evil, an Outsider, drunk or poisoned, it goes to a normal vote. Requests are recorded in the Public Log and log.txt.
- Suspicion: evil Minions never cast suspicion on the Demon (or any evil teammate). A remembered suspect is dropped if they have since become evil, died, or are the human.
- Artist: NPC Artists now ask `Is any of X, Y and Z <evil / the Demon / a Minion / an Outsider / a Townsfolk>?` about 1–3 living players (always including someone they suspect), with a random question type. The answer is YES if any of them matches.

## Bug Fix: NPC Slayer Timing

- NPC Slayers (and evil NPCs bluffing as Slayer) never shoot on Day 1. At dawn on Day 2 they have a 20% chance to shoot a living NPC they're suspicious of, rising by 20% each day after (40% on Day 3, 60% on Day 4, ... 100% from Day 6) until they've fired. This replaces the old 35% chance every day.
- The timing is configurable in src/data.js: SLAYER_SHOOT_AFTER_DAY (default 2), SLAYER_START_CHANCE (default 0.2) and SLAYER_CHANCE_STEP (default 0.2).

## Bug Fix: Human Night Choices

- If the human's character chooses players at night, the Storyteller now wakes them. A panel below the town square shows the prompt; the human clicks living players in the town square (clicking again un-picks; a new pick replaces the oldest once the limit is reached) and presses "Select". The night then carries on in night order.
  - Monk (from Night 2): choose 1 player to protect from the Demon.
  - Fortune Teller (every night): choose 2 players; you learn if either is the Demon.
  - Butler (every night): choose your master; tomorrow your vote only counts if they vote too.
- Drunk or poisoned: the human is still woken and still chooses, but the result may be wrong: a Monk's protection fails, a Fortune Teller's answer is wrong (Drunk) or random (poisoned), and a Butler's vote restriction doesn't apply.
- NPC Butlers now choose a master each night too (before, their votes never counted). Evil NPCs bluffing as the Butler report a choice.
- The wake-up and the human's choice are recorded in log.txt.

## Bug Fixes: Bluffs in Log, Role Popups, Script Popup & Storyteller Log

- Debug log: the header now lists the Demon's three bluffs, and the Setup section records which player was told them and which one they bluff as.
- Role popups: every character name outside the town square (your role heading, NPC answers, the Storyteller and Public logs, the final reveal and Key Moments) is now a dotted-underlined link. Pressing it opens a popup with the character's name, team and ability; pressing the popup closes it. The town square seats are unchanged.
- Script popup: the Close button is gone; pressing the popup (or the area around it) closes it.
- Storyteller log: entries no longer have list numbers ("1.", "2.", ...); each line starts with its "Night N" label, styled like the Public Log.
- Increase chance that Minions get bluffs by 25%

## New Feature: Fireplace Script Sheet

- A fireplace sits in the centre of the town square. Pressing it opens a popup showing the script being played (name and author) and every character on it, grouped into Townsfolk, Outsiders, Minions and Demons (good teams in blue, evil in red), each with its official ability text. Close it with the Close button, the Escape key, or by clicking outside it.

## Bug Fixes: Setup, Bluffs, Suspicion & Town Square

- Character setup: the Townsfolk dealt always include at least two first-night information characters (Washerwoman, Librarian, Investigator, Chef, Clockmaker, Grandmother) and two ongoing information characters (Empath, Fortune Teller, Undertaker). When there are fewer than four Townsfolk seats (e.g. 5 players with a Baron), every Townsfolk dealt is an information character, alternating between the two kinds.
- Demon bluffs: the Demon learns three good characters that are not in play (never the Drunk, and never a token a Drunk was shown) and bluffs as one of them.
- Minion bluffs: each Minion also learns the Demon's three bluffs at an adjustable chance, set by MINION_BLUFF_CHANCE in src/data.js (default 0.5 = 50%). A Minion who doesn't know them bluffs as a random Townsfolk on the script. Evil teammates avoid claiming the same character when they can. The bluffs, and which Minions know them, are recorded in the Setup section of log.txt.
- Suspicion: each NPC keeps one suspect instead of picking a new one every time they're asked. At the start of each day there is a 35% chance it moves, and it always moves if the suspect has died. It only ever moves to a living NPC, never the human.
- Town square: the circle grows with the number of seats (from about 320px at 5 seats to 720px at 15), but never wider than the screen; there's a smaller scale on narrow screens.

## Bug Fixes: Information Layout, Debug Log, Night Choices & Monk

- Ongoing information: when an NPC is asked, their claim, each night's (or day's) information and their suspicion each appear on a separate line, in both the answer and the Public Log.
- Debug log: after the game ends, a "Download log.txt" link appears next to the Reset button. The log is plain text, grouped into Setup / Night N / Day N / Game Over sections in the order things happened. It contains:
  - every night action in night order (Poisoner, Devil's Advocate, Monk, Gambler, Moonchild curse, Demon, Assassin, deaths, information received, bluffs);
  - every interaction (conversations and their full answers, nominations with who voted and whether each vote counted, Slayer shots, Artist questions, ending the day);
  - at the end of every night and at Game Over, a table of every player: seat, true character (and the Townsfolk a Drunk believes they are), claim, alignment, alive/DEAD, DRUNK, POISONED, PROTECTED, and the information they received that night.
- Night choices: the Fortune Teller and Ravenkeeper now only pick living players, like every other character that chooses at night.
- Monk: each night's protection is reported as "Night N: Monk: protected Player X from the Demon.", one line per night.

## Bug Fixes: Drunk, Nominations & Washerwoman

- Drunk: evil players can no longer bluff as the Drunk, so no NPC ever claims to be the Drunk. A real Drunk always believes they are the Townsfolk on their token and claims it.
- Drunk: a Drunk's information is now always wrong for the Townsfolk they think they are (wrong number, wrong YES/NO, wrong character, or a pair that doesn't include the named character), instead of random information that could be right by chance. The same goes for a Drunk Artist's answer and a Drunk Ravenkeeper's reading. Poisoned players still get random information.
- Nominations: each player can be nominated only once per day. After a failed vote, the Nominate button is disabled for that player until the next day.
- Washerwoman, Librarian and Investigator: the two players named are always two other players, never the player receiving the information, including when drunk or poisoned.

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

## New Feature: Evil Bluff Information

- Evil NPCs now report night information that fits the role they are bluffing, on the nights that role would wake: Washerwoman, Librarian, Investigator and Chef on Night 1; Empath and Fortune Teller every night; Undertaker from Night 2; Monk choices from Night 2; and a Ravenkeeper reading if they are killed at night. Bluffing a role with no night information gets "I have no stored information.", the same as a good NPC.
- A Spy who isn't poisoned has seen the Grimoire, so their bluffed information is true.
- All other evil NPCs give information that is definitely wrong: a wrong Chef or Empath number, the opposite Fortune Teller answer, a wrong Undertaker or Ravenkeeper character, and Washerwoman/Librarian/Investigator pairs where neither player has the named character (good players are framed where possible).
- Bluffed information is recorded as a "bluff" in the post-game event log, not as real information.
- Washerwoman, Librarian and Investigator information never names the player receiving it.

## New Features: NPC Night Choices, Slayer, Virgin & Drunk

- NPCs who choose players at night now say so when asked. Monks report who they protected ("Night 2: Monk: protected Player 3."), alongside the existing Fortune Teller and Ravenkeeper reports. Evil NPCs bluffing as a Monk or Fortune Teller invent a choice each night and report it the same way; these bluffs appear in the post-game event log.
- NPC Slayers, and evil NPCs bluffing as Slayer, may shoot once per game. Each dawn they have a 35% chance to shoot a living NPC they find suspicious. Good Slayers aim at evil players (wrongly half the time if drunk or poisoned); evil bluffers aim at good players. Only a working Slayer hitting the Imp (or the Recluse) kills. The shot and its result go in the Public Log and Key Moments.
- NPC Virgins: the first time the human nominates a Virgin who isn't drunk or poisoned, the human is executed if their true character is a Townsfolk, and the day ends. A human who is secretly the Drunk does not trigger it. Dead players can no longer nominate or use the Slayer ability.
- The Drunk (an Outsider) is shown a Townsfolk token that is not in play, and gets unreliable information for that role. A human Drunk is never shown a Ravenkeeper, Virgin or Soldier token. Fixed: a Drunk who thinks they are the Ravenkeeper now gets unreliable information instead of the truth.
- A Slayer shot that kills the Recluse now checks for the two-players-left victory.

## Bug Fixes: Votes, Information Logging, Suspicion & Key Moments

- Votes: a failed vote no longer ends the day, so the human can nominate someone else. Every vote result is recorded in the Public Log.
- Information logging: the human's nightly information is logged exactly as they received it, including wrong information when they are drunk or poisoned.
- Suspicion: NPCs share a suspicion when asked. Good NPCs are truthful unless drunk or poisoned; evil NPCs always lie.
- Key Moments: the post-game reveal now includes detailed night actions: Poisoner targets, Monk protection, Demon attacks, deaths and Demon succession.

## New Features: Random Seed, Reset, Newest-First Logs & Role Counts

- Random Seed: a new button fills in a random positive seed without starting the game.
- Reset: a button at the bottom of the final reveal returns to setup, keeping the chosen seat count, script and seed.
- Logs: the logs shown to the player list the newest entries first.
- Role counts: an info button on the town square shows the Townsfolk / Outsiders / Minions / Demons counts for the chosen number of seats. The good counts are blue and the evil counts red.
- Tests: automated checks of the UI source cover the new controls and where the role counts come from.

## New Features: Town Square Selection & Layout

- Setup: the setup panel is hidden once Start is pressed.
- Selecting players: the target dropdown is gone. Clicking an NPC's seat in the town square selects that player.
- Actions: the interaction controls appear below the town square only once a player is selected.
- Ending the day clears the selection.
