# Changes

Newest first.

## Bug Fix & New Feature: Professor Bluff, Performance Timing

- Professor bluffers: an evil NPC claiming the Professor now "uses" the ability once (from Night 2, timed like a real Professor): they choose a dead good player who claimed a Townsfolk, preferring one who accused their team, and say in the morning that they stayed dead, so they weren't the Townsfolk they claimed. That player's word then counts against them (see liars() in src/strategy.js), discrediting their accusations. Before, a Professor bluffer never used it. A real Professor's failed revival is now also public information against that player.
- Performance timing (PERF_LOGGING and PERF_SLOW_MS in src/data.js, on by default): every click, change and key press is timed until the next frame is drawn, and each redraw is timed. The browser's long tasks (50 ms or more) are recorded with the action before them. Anything at PERF_SLOW_MS (50) or more is written to the browser console as "[perf] ...". log.txt ends with a Performance section (each action's count, average and slowest, then the slowest 15), and soloPerf() in the browser console prints the same at any time.

## Bug Fixes: Courtier & First-Night Poisoning

- Courtier NPCs: a good Courtier now chooses a Demon or Minion character that's really in play at COURTIER_CORRECT_CHANCE (0.35, in src/data.js), and otherwise one that isn't. Before, they only ever guessed a Demon, at random from the script, so they rarely hit anything. An evil Courtier bluffer still chooses one that isn't in play.
- Poisoner: on Night 1 only, a player the Poisoner poisons who has first-night information always hears a lie that helps the evil team, whichever way the Storyteller leans. A poisoned Noble now sees 3 players with no evil among them (or, failing that, 2 evil), never including the Demon, not 3 at random; a poisoned Librarian's "Outsider" pair gives an evil player cover, like the Washerwoman's. (The Chef, Investigator and Grandmother already lied that way.)

## New Features: Dawn & Dusk Cards, Claim Alerts

- Dawn and dusk cards: each change of phase pops up a card with what the Storyteller announced: at dusk, the execution and what came of it (or "Nobody was executed."); at dawn, who died in the night (or "Nobody died in the night."), and any other deaths or returns to life. What players say (claims, shared information, Gossip) stays in the Public Log only, for you to weigh. Each card line is word for word the Public Log line. Press anywhere (or Esc) to close it; a second card (dusk, then dawn) follows. A dawn with nothing to announce (the first) has no card.
- Public Log: a day ending with nobody marked now says "Nobody was executed."
- Claim alerts: an NPC who claims their character in public without being asked (sharing information, a Gossip statement, a Slayer shot, a character change at dawn...) gets a ⚠ on their seat that fades away. Your conversations don't count. It stays for CLAIM_ALERT_HOLD_MS (2500) and then fades over CLAIM_ALERT_FADE_MS (2000), both in src/data.js, and only starts once no dawn or dusk card covers the town square.

## Bug Fixes: Off-Script Characters & Game Over Log

- Ravenkeeper: when drunk, poisoned or lied to, they're now only shown characters on the script being played. Before, they could be shown any character in the game (e.g. "Player 9 is Mutant" in Onion Pies). The same goes for a misinformed Undertaker.
- log.txt: the Game Over player table no longer repeats the last night's "Information tonight" when that night's table already listed it.

## Bug Fix: Protectors Trusting Their Own Picks

- Monk, Innkeeper and Butler NPCs no longer say "I trust Player X, because of what I learned on Night N" about the player they chose to protect (or their master). Picking a player isn't information: an Innkeeper could end up vouching for the Assassin or the Demon, and other NPCs then held votes and nominations against that player's accusers ("they nominated Player 11, whom I trust").

## New Feature: The Final Call Is Yours

- Final 3 (or final 2 with a Zombuul): good NPCs, living or dead, now vote for whoever you nominate, or ask to have nominated, whatever they think of that player. They no longer outvote your pick, so if you pick wrong, that's on you. Evil NPCs vote as before.

## Bug Fix: Cannibal First-Night Abilities

- Cannibal: a first-night ability gained from an executee (Chef, Librarian, Washerwoman, Noble...) is now used the night after the execution, as the rules say. Before, the Cannibal gained it but never woke, since those characters only act on Night 1.
- log.txt: the player table's Character column shows a gained ability, e.g. "Cannibal (has Chef)".

## New Feature: Good NPCs Trust You a Little More

- EVIDENCE_WEIGHT.humanTrusted (0.5, in src/data.js): good NPCs give your view a little extra weight, so it's easier to sway votes your way.
  - Your marks: marking a player Evil counts humanTrusted on top of markedEvil; Good takes it off (markedGood).
  - Your nominations: good NPCs count them as evidence against the nominee: during that vote (on top of HUMAN_NOMINATION_BONUS, a good NPC's chance to vote yes rises by GOOD_VOTE_EVIDENCE_STEP × humanTrusted), and afterwards, in who they suspect ("you nominated them").

## Bug Fix: Marks on Dead Players

- Town square: your Good / Evil mark (the dashed blue or red ring) on a dead player is no longer greyed out with their seat. The seat still fades; the ring keeps its colour.

## New Feature: Suspicion Score in the Log

- log.txt: the player table has a Score column after Suspects: the evidence behind each NPC's suspicion (the EVIDENCE_WEIGHT values of their reasons added up; 0 for a hunch).
- Suspicion reasons: the same reason found more than once (two votes for the same player, say) is given once, saying how often: "they voted for Player 4, whom I trust (twice)". It still counts each time.

## New Feature: Information Townsfolk Share

- How many information Townsfolk are dealt is now a setting, as a share of the Townsfolk slots, so it works at any seat count: FIRST_NIGHT_INFO_SHARE and ONGOING_INFO_SHARE in src/data.js (0.3 each). Each is rounded to the nearest whole number: at 0.3, 5 or 7 Townsfolk get at least 2 of each, and 9 get at least 3. Before, it was a fixed 2 of each. Setup still alternates between the two groups until each has its share (as far as the script has them), then fills the rest at random. Only Townsfolk count.

## Bug Fix: Pacifist Log Note

- log.txt: "Storyteller (evil): the Pacifist doesn't save Player 12." appeared when a good player was executed while the Storyteller was leaning, even with no Pacifist in play. It now appears only when a working Pacifist is alive (who could have saved them). Only the log line was wrong: without a Pacifist, nobody was ever saved.

## New Script: Onion Pies

- New script: Onion Pies (scripts/Onion Pies_1_0_0.json), with 5 new characters. The rest (Trouble Brewing's) work as before.
  - Noble: starts knowing 3 players, exactly 1 of them evil. A misinformed Noble sees any 3 players (any number of them evil). An evil player bluffing the Noble names 3 good players, the evil team's scapegoat among them.
  - Pixie: starts knowing a Townsfolk in play. An NPC Pixie is "mad" about being it: from Day 1 they claim it, with made-up information to match. When its holder dies, they gain its ability (if sober). You're never dealt the Pixie.
  - Cannibal: has the ability of the last player who died by execution. If that player was evil, they get a good ability instead (the one the executee claimed), and are poisoned until a good player dies by execution. Executing a player who's already dead gives them nothing. You can be the Cannibal: you're told whose ability you have, and your night choices and day buttons (Slay, Artist, Savant, Gossip) follow it.
  - Ogre: on their first night, an NPC Ogre chooses a player they don't suspect and becomes their alignment, even if drunk or poisoned. They don't know which, so they play on as good. You're never dealt the Ogre.
  - Marionette: a Minion who thinks they're a good character. They're shown a Townsfolk that isn't in play (like the Drunk), sit next to the Demon, and the Demon knows who they are. They're evil (for every win and every piece of information), but play as good: they claim their Townsfolk, suspect on the evidence and vote like a good player. Their "information" is false, in the way that helps evil. The evil team treats them as a teammate.
    - The Demon may tell them who they are: from Night 2, when evil is losing (the Storyteller is helping evil) or at least 30% of the living good NPCs suspect the Demon (MARIONETTE_HEAT), at 50% a night (MARIONETTE_REVEAL_CHANCE). From then on they draw suspicion away from the Demon. They keep claiming their Townsfolk, but every morning they publicly spread misleading information: their latest (false) information, or else an accusation of a good player. Their information frames good players (a Noble's names the evil team's scapegoat). They also play for evil: accusing good players and voting like the evil team.
- log.txt: the Marionette's information is marked "(misinformation: they are the Marionette)"; the setup lists who the Marionette is.

## Bug Fixes: Gossip, Claims Section, Executions & Suspicion Reasons

- log.txt: information that isn't working says why, and who caused it: "Chef number: 0. (misinformation: poisoned by Player 4, the Poisoner)". This covers the Drunk, the Poisoner, Pukka, No Dashii, Vigormortis, Snake Charmer swaps, Sailor, Innkeeper, Goon, Courtier, Minstrel, Sweetheart, Philosopher and the Vortox. It appears in the Storyteller entries and the night's information under the player table; you never see it during play.
- Gossip: an NPC Gossip (or an evil player bluffing Gossip) makes a public statement every day. Some speak at dawn (GOSSIP_CHANCE); any who haven't by the end of the day speak then, before the execution. Before, they only spoke at dawn, and only 40% of days. Your own statement is still optional.
- The Claims section is gone. Your Good / Evil marks still ring the seats in the town square.
- Executions in the public log: a player who is executed but survives (the Devil's Advocate, Pacifist, Fool, Sailor, Tea Lady or Innkeeper) gets "Player 4 is executed. But does not die." Executing a player who's already dead gets "Player 4 is executed. And nothing happens because they are already dead." A Zombuul that only registers as dead isn't really dead: it's executed (and dies) as normal.
- Suspicion reasons: "they nominated Player 12, who later died in the night" is gone. It isn't a good reason to suspect someone.
- Coming back to life (the Shabaloth's regurgitation, the Professor): the player is alive again and can't die that night. Before, the Shabaloth could regurgitate a player and then kill them again straight away, so they stayed dead. At dawn the Storyteller announces it ("The Storyteller announces that Player 5 is alive again."), without saying how, since "regurgitated" would give the Shabaloth away. Anything their death would have triggered at dawn (a Gambler admitting a wrong guess, say) doesn't happen.

## Bug Fixes: Log Table, Twins, Repeat Picks & Protectors

- Your marks: all you can note about a player is Good, Evil or ? (clear). The character guess and the free-text note are gone, from the controls and from the town square.

- log.txt: each night's player states are a proper table, with columns for Player, Character, Claims, Team, State, Ability (used / unused), Suspects and Why. There's no seat number column. The night's information is listed under the table.
- Twins: both twins now look alike to the town until public information tells them apart.
  - When the Evil Twin repeats their twin's "X is your Evil Twin" word for word, it now points at the good twin. Before, only the good twin's accusation counted publicly.
  - Evil NPCs never accuse or frame either twin. Before, they could accuse only the good twin, which gave it away.
- Repeat picks: NPCs with an ongoing ability don't pick a player they've ever picked with it before, while anyone else is left; then never last night's pick if they can help it. This covers the Monk, Fortune Teller, Butler, Gambler, Dreamer, Snake Charmer, Sailor, Chambermaid, Exorcist, Innkeeper, Poisoner, Witch, Cerenovus and Pit-Hag.
- Protectors: the Monk and Innkeeper protect players who have publicly claimed the characters the Demon most wants dead (DEMON_KILL_PRIORITY "high", then "med"), trusted ones first. They never protect their own suspect, and never you (the Demon never attacks you).

## Bug Fixes: Professor, Suspicion Reasons, Log Details & Lunatic

- Professor: when their resurrection fails on a player who claimed a Townsfolk, that player lied. The Professor says so the next morning ("As the Professor I chose Player 4, and they didn't come back: they weren't the Chef."). From then on everyone weighs that player's word the other way round: anyone they vouched for is suspicious (EVIDENCE_WEIGHT.vouchedByLiar), and their accusations count slightly in favour (accusedByLiar).
- Suspicion reasons: each player who said something counts once, by their strongest statement, so a reason no longer repeats ("Player 7 was suspicious of them, then died in the night; Player 7 was suspicious of them..."). "Suspected them, then died in the night" now weighs the same as a plain accusation (0.5), so it isn't enough on its own.
- log.txt:
  - each NPC's suspect, with their reasons (or "a hunch");
  - whether their once-per-game ability is used or unused;
  - what the Storyteller is doing and why ("is helping good: 3 evil of 7 shown alive; the path to a final 3 wants 2.1"), plus an entry for every choice the lean decided ("the Pacifist saves Player 2", "who dies for the Gossip: one of Player 4, Player 9").
  The Game Over table shows up-to-date suspicions.
- Lunatic:
  - Shown a Demon that isn't the one in play, and their own 3 bluffs (good characters, which may be in play). They claim one of them.
  - Shown false Minions: the real Demon and good NPCs (as many as there are Minions, at least 2).
  - Plays as the Demon of that imagined team: points at and "kills" players outside it, votes like the Demon, and backs up their "Minions". Their kills never happen.
  - Never one of the Demon's bluffs.
  - The evil team never targets them (Demon, Godfather and Assassin), and frames them: a living Lunatic is always the evil team's scapegoat.
  - When they die (and the game goes on), the next morning they claim the Lunatic and name their "Minions", the real Demon among them ("I was the Lunatic: I thought I was the Po. My Minions were Player 3 and Player 12."). The town weighs it.

## Bug Fixes: Suspicions, Ghost Votes, Gambler, Contradicted Claims, Claims Table & Final 3

- log.txt: each night's player table shows who every NPC suspects, and whether the Storyteller is helping good or evil (see below).
- Suspicions: every NPC, dead or alive, rethinks who they suspect each night. A player's own information now counts as evidence (EVIDENCE_WEIGHT.myInfo), so their suspect follows it.
- Contradicted claims: information that says what character someone is now gets checked against their public claim. If it doesn't match, its owner suspects them and says why ("my information says they're the Empath, but they claim the Butler"). This covers:
  - Ravenkeeper and Grandmother: a different character than they claim.
  - Dreamer: neither character is their claim.
  - Washerwoman, Librarian and Investigator: neither player in the pair claims the character, so one of them is lying.
  When it matches, they're trusted. Before, NPCs went only by the kind of information (an Investigator's pair is suspicious, a Grandmother's grandchild is trusted...), whatever anyone claimed.
- Ghost votes: a dead player (good or evil) keeps their vote until 5 or fewer players are alive (GHOST_VOTE_ALIVE), unless theirs is the vote that marks the nominee. Then they spend it only on the player they suspect. Before, dead good players voted for anyone they suspected, at any time, and dead evil players for most good nominees.
- Gambler: a Gambler who dies from a wrong guess knows it. They suspect that player for certain, and say so the next morning ("I was the Gambler. I guessed Player 4 is the Chef, and died."), so the town can weigh it.
- Claims table: the Your notes column is gone. Marking a player Good or Evil tints their whole row blue or red.
- Your marks count: good NPCs weigh your Good or Evil mark on a player like your stated view: Evil adds to suspicion (EVIDENCE_WEIGHT.markedEvil), Good adds to trust (markedGood). It shows in their reasons as "you think they're evil".
- Final 3: the Storyteller steers for a final 3 of you, 1 good NPC and 1 evil player. Each night it checks the evil team against a path from its starting size down to 1 at 3 alive. If evil is ahead by more than FINAL_THREE_MARGIN, its choices help good; if behind, they help evil. Once you're dead it keeps steering (you still have a vote), for a final 3 with at least 1 good player (1 or 2 evil). With a Zombuul it steers for a final 2 shown alive, since a "dead" Zombuul keeps the game going. The Storyteller's choices that lean:
  - Which other player a Washerwoman, Librarian, Investigator or Sage sees.
  - Whether a drunk or poisoned good player's information frames good players (as before) or is just random.
  - Who the Gossip, the Pit-Hag's random death and the Mayor's bounce kill.
  - Pacifist saves, Tinker deaths, Shabaloth regurgitation, who the Sweetheart makes drunk, and the Sailor's drunk when no kill is at stake.

## New Script: Bad Moon Rising

- New script: Bad Moon Rising (scripts/Bad Moon Rising_1_0_0.json), with 19 new characters. The Grandmother, Gambler, Fool, Moonchild, Devil's Advocate and Assassin work as before.
- Townsfolk:
  - Sailor: each night chooses a player, and one of them is drunk until dusk. A sober Sailor can't die. The Storyteller decides who is drunk when it first matters: when either of them is attacked (or the Sailor chose the Demon and it attacks), when the Sailor's pick uses an ability, or at dawn. If the choice decides whether an attack kills, the Storyteller favours good: a good victim lives and an evil one dies. Otherwise the Sailor is drunk at SAILOR_DRUNK_SELF_CHANCE. With fewer than 6 players alive (SAILOR_LATE_ALIVE), the Sailor is drunk more often than not (SAILOR_LATE_DRUNK_CHANCE), so the ability usually fails.
  - Chambermaid: each night chooses 2 players and learns how many woke tonight due to their ability. She wakes last, so she knows about everyone.
  - Exorcist: from Night 2 chooses a player, not last night's. A chosen Demon learns who the Exorcist is and doesn't wake (no kill tonight). The Demon then goes after the Exorcist.
  - Innkeeper: from Night 2, 2 players can't die tonight, and 1 of them is drunk until dusk.
  - Gossip: each day may make a public statement ("Player X is the Demon / a Minion / evil..."). If it's true, a player dies that night: any NPC alive but the Demon, an NPC Gossip included (never you, even as the Gossip). NPC Gossips speak at GOSSIP_CHANCE each day.
  - Courtier: once per game chooses a character; whoever has it is drunk for 3 nights and 3 days. NPC Courtiers guess the Demon.
  - Professor: once per game, from Night 2, chooses a dead player; a Townsfolk comes back to life.
  - Minstrel: when a Minion dies by execution, everyone else is drunk until dusk tomorrow.
  - Tea Lady: while both her living neighbours are good, they can't die.
  - Pacifist: an executed good player survives at PACIFIST_SAVE_CHANCE.
- Outsiders:
  - Tinker: dies at TINKER_DEATH_CHANCE each night.
  - Goon: the first player each night to choose them is drunk until dusk, and the Goon joins their team.
  - Lunatic: shown the Demon in play and bluffs like one. Each night they "kill" someone, with no effect. The Demon knows who they are, keeps them alive as a decoy, and kills their pick at LUNATIC_FOLLOW_CHANCE so they keep believing.
- Minions:
  - Godfather: deals 1 fewer or 1 more Outsider. Learns the Outsiders in play, and kills the night after an Outsider died.
  - Mastermind: if the Demon is executed, play 1 more day. Execute a good player and evil wins; execute an evil player, or nobody, and good wins.
- Demons:
  - Zombuul: kills only after a day when nobody died. Its first death only looks real: it registers as dead (it can't nominate, it has a ghost vote) and the game goes on until it and one other player are alive. Execute it while it's "dead" to kill it.
  - Pukka: poisons a player each night (from Night 1); last night's victim dies.
  - Shabaloth: kills 2 players a night, and may bring back one it chose the night before (SHABALOTH_REGURGITATE_CHANCE).
  - Po: may choose no-one (at PO_CHARGE_CHANCE), then kills 3 the next night.
- You can be dealt any of the new Townsfolk. The Courtier picks a character from a drop-down at night; the Professor picks a dead player in the town square; the Gossip picks a player and says a statement in public. You're never dealt the Tinker, Goon or Lunatic.
- Dead players can be nominated, on every script. Executing one does nothing, unless it's a Zombuul that only registers as dead. It still counts as the day's execution, so it stops the Vortox's win.
- Demons whose attack fails on the Soldier, Sailor, Tea Lady or Innkeeper avoid that player afterwards. When a Monk, Innkeeper or Tea Lady saved the target, the Demon goes after them on later nights. A drunk or poisoned Demon's attack fails.
- Sinking a kill: when an evil player has publicly claimed a protection character (Monk, Soldier, Sailor, Innkeeper or Tea Lady; PROTECTION_ROLES), the Demon may kill nobody that night (SINK_KILL_CHANCE), so the protection seems to have worked. A Po that does this has chosen no-one, so it kills 3 the next night.
- Twins: no ability ever kills, poisons, makes drunk, curses, maddens or changes the character of either twin. Before, only the Demon's kill and the Mayor's bounce avoided them; now the Assassin, Poisoner, Witch, Cerenovus, Pit-Hag (and its random deaths), Moonchild, Sweetheart, Barber and the new characters do too.
- Bug fixes:
  - Undertaker: after a day with no execution they used to learn about the last executed player again. Now they learn "Nobody was executed." They also learn nothing when a dead player is executed (they didn't die by execution).
  - Demon bluffs (and the Lunatic's) are never a character that's in play but shown as something else.

## New Features: Public Reasoning, Honest Votes, Your Notes, Claims Table & Misinformed Human

- No more hidden giveaways: a good NPC's suspicion used to land on an evil player (sober good NPCs only ever suspected evil players), so you could read the answer off their opinions. Good NPCs now can't see alignments. They suspect players for reasons anyone could see, and say them ("I'm suspicious of Player 4: they claim the Chef, but I'm the Chef."):
  - someone claiming their own character, or two players claiming the same one;
  - a player who suspected (or trusted) someone and then died in the night;
  - information shared in public that names a player, and what others say they suspect;
  - nominating or voting for someone they trust, or nominating someone who later died in the night.
  Each kind of evidence has a weight in EVIDENCE_WEIGHT (src/data.js). They change suspects only on at least EVIDENCE_TO_SUSPECT, so one accusation doesn't send the whole town after the same player. With nothing to go on, they keep a hunch. Strong evidence (a counter-claim) outweighs their own information.
- Evil NPCs accuse anyone claiming their own character, then (as before) mostly the scapegoat. An NPC with no information, good or evil, only gives an opinion when there's evidence, so having nothing to add is no longer a tell.
- Votes: evil NPCs used to never vote for a teammate. Now they vote for one at EVIL_TEAMMATE_VOTE_CHANCE, but only when their vote can't change the outcome. Good NPCs used to vote at random. Now they vote by what they think of the nominee: likely for someone they suspect, rarely for someone they trust, and otherwise more readily the more public evidence there is (GOOD_VOTE_* and HUMAN_NOMINATION_BONUS in src/data.js).
- Your notes: select a player to mark them Good, Evil or ? and to note a character you think they are, plus a short note. A guess rings their seat with a dashed blue or red line, and the character shows under their name. Notes are cleared with Reset.
- Claims table: above the logs, every NPC in one table: their claim, the information and opinion they last gave (and the day you asked), and your notes. Press a row to select that player.
- You can be misinformed:
  - when the Drunk is dealt, it's yours at HUMAN_DRUNK_CHANCE (you're shown a Townsfolk and never told);
  - the Poisoner picks you at HUMAN_POISON_CHANCE each night (not two nights running);
  - on Night 1 the Poisoner also goes after first-night information characters (Washerwoman, Chef...), not just those who learn something every night.
  Either way you hear false information, as an NPC would.

## Bug Fixes: Witch, Snake Charmer, Character Changes, Public Info & Conversations

- Witch: never curses the human for Day 1.
- Snake Charmer: NPC Snake Charmers never pick the Demon. With nobody else left to pick, they pick themselves.
- Character changes: every good NPC whose character changed in the night says so the next morning, with what they were before ("Player X says they woke up as the Sweetheart; they were the Chef."), even if they'd never claimed in public. Evil players say nothing about a change.
- Barber: swaps happen at night. If the Barber is executed, the Demon swaps two players that night; if the Barber dies at night, the swap is immediate. Either way the swapped players wake up as their new characters and announce it the next morning.
- When you first talk to a good NPC after their character changed, they tell you ("I woke up as the Sweetheart on Night 2; before that I was the Chef.").
- Public information in big games: in games of PUBLIC_INFO_MIN_SEATS (13) or more seats, NPCs with first-night information (Washerwoman, Librarian, Investigator, Chef, Clockmaker, Grandmother) or a spent ability (Seamstress, Juggler, Ravenkeeper, Sage) may say it publicly the morning they get it. The chance for each character is in PUBLIC_INFO_CHANCE in src/data.js. Evil bluffers share their bluffed information the same way.
- Conversations: the public log heads a conversation with just the player's name, and NPCs say their information in their own words without repeating their character ("Night 1: I chose Player 3." instead of "Night 1: Snake Charmer: chose Player 3."; "My number is 0." instead of "Chef number: 0.").
- Player colours: the silver (near-white) colour is replaced with fuchsia.

## Bug Fix: Klutz Picks

- A dying Klutz now picks a player they believe is good: someone their information vouches for, as long as nothing else they know makes them suspect that player. Failing that, they pick someone they have no reason to suspect: no information against them, not their current suspect, not their twin. Before, without a trusted player they picked at random, sometimes someone they'd said they suspected. An evil Klutz bluffer picks a good player.

## New Feature: Misinformation Helps the Evil Team

- Poisoned players now hear false information, the same as a Drunk, instead of random answers. This covers night information and the Artist, Seamstress, Sage, Savant and Juggler.
- False information for a Drunk or poisoned good player is now the kind that helps the evil team, like the evil team's own bluffs:
  - Washerwoman: one of the two players is evil, so they look like a Townsfolk.
  - Investigator: the evil team's scapegoat is named as one of the two "Minions".
  - Grandmother: the "grandchild" is an evil player, vouched for as a good character.
  - Chef: one fewer evil pair than there is (or 1 when there are none).
  - Empath: higher with the scapegoat as a neighbour; lower with an evil neighbour.
  - Undertaker: an executed good player "was" an evil character, and an executed evil player "was" a good one.
  - A misinformed Fortune Teller keeps their own picks; a Demon among them reads NO.

## Bug Fixes: Twins, Savant, Mutant, Dreamer, Reset & Colours

- Evil Twin: when asked, the Evil Twin answers exactly as their good twin does: the same claim, the same information word for word (their "X is your Evil Twin" names the good twin), and the same kind of opinion.
- The Demon never kills either twin, and the Mayor's bounce never lands on one.
- Savant: statements are never about the human, and each visit is about different players from the last one where possible.
- Mutant: when a Mutant (or an evil player bluffing the Mutant) learns they died, they publicly reveal they were the Mutant ("Player X reveals they were the Mutant.").
- Vigormortis: when the Vigormortis dies, every dead Minion it killed loses the ability it kept, and the poison on their Townsfolk neighbours ends (unless the Poisoner or a Snake Charmer swap poisoned them too).
- Dreamer: picking either twin shows "the Evil Twin or the <good twin's character>", so the twins look alike.
- Reset is now at the bottom of the Final reveal, so it's hidden while the reveal is collapsed. Download log.txt stays visible.
- Colours: each player has their own colour (PLAYER_COLOURS in src/data.js, no reds or blues) for their name everywhere it appears: the town square, the Storyteller and public logs, the selected player, the marked-for-execution line, night choices and the Final reveal (Grimoire, notes and timeline). Character names everywhere (logs, answers, tokens, the script sheet, role popups and the Final reveal) are blue for good and red for evil.
- Town square tokens with long names (Investigator, Mathematician) use a smaller font so they fit on one line.
- Games now start at 8 seats (COUNTS in src/data.js), and the setup error message follows COUNTS. The tests' 5-player scenarios are dealt from 8 seats.

## New Features: Votes Needed, Round Seats & Capitalised Day

- Votes needed: the middle of the town square, under the clock tower, shows how many votes a nomination needs right now to mark someone for execution: half the living players (rounded up), or one more than the player already marked (or tied) got today. While a vote is counted, the tally counts towards that number ("3 / 5 needed").
- While a vote is being counted, the line under the town square keeps showing how things stood before the vote, instead of giving away the result early.
- Player tokens in the town square are always circles.
- The status line is capitalised ("Day 1 — 10 alive", "Night 2 — 8 alive"), and at night it shows the night's number.

## New Features: Town Square Size & Vote Icons

- Raised hands and the skull now sit over the player's token, slightly see-through, instead of at its corner. A player with both shows them side by side.
- A menu button (☰) to the left of the "Solo Clocktower" title opens a town square size setting: the current size (100% by default) with − / + buttons. Pressing the menu button again, or anywhere outside the popup, closes it. The browser remembers the last size. The default, step and limits are TOWN_SQUARE_SIZE, TOWN_SQUARE_SIZE_STEP, TOWN_SQUARE_SIZE_MIN and TOWN_SQUARE_SIZE_MAX in src/data.js. It never grows wider than the screen.
- On a phone (e.g. an iPhone 16, 393px wide) the town square now fills the screen width: the circle is sized from the space actually available, and seat tokens narrow a little with many players so they don't overlap. Long names end in "…"; hover or long-press a seat to see the full one.
- Seats no longer say "alive" under the player's name; dead players still show "DEAD".

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
