# Changes

Newest first.

## Improvements: Trouble Brewing by Default, and the Seed Tucked Away

- The setup page's Script menu starts on Trouble Brewing, the beginner script, rather than whichever comes first alphabetically.
- The Seed box and Random Seed button are under a collapsed **Advanced Options** (`#advanced-options`), since every visit already starts on a random seed. How to play and the README say so.

## Improvements: Alphabetical Scripts and a Random Starting Seed

- The setup page's Script menu lists scripts alphabetically by name, whatever order `scripts/index.json` gives them.
- The Seed box starts on a random seed each time the page loads, instead of always 42; the Random Seed button still rolls a new one.

## New Features: www.solobotc.com & a Clock Tower Icon

- The game is ready to move to its own address, www.solobotc.com: a `CNAME` file for GitHub Pages, and `.nojekyll` so Pages serves the files as they are.
- A clock tower icon (the town square's own, inside its gold ring) for browser tabs, bookmarks and phone home screens: `favicon.ico`, `images/icons/` (SVG, 192 and 512 px, maskable versions for Android, and an Apple touch icon), and `site.webmanifest`, so it can be added to a home screen as an app.
- A shared link now shows a preview card (`images/social.png`) with the title and a line about the game, and the page has a description for search engines.
- The README links to the new address; the local server (`npm start`) serves the new file types.

## Improvements: The Storyteller's Advice Leans, and Grows With the Game

- The Fisherman's tip and the Savant's true statement are still true, but how much they give away now depends on the stage of the game and the Storyteller's lean (`adviceLevel()` in storyteller.js, `ADVICE_STAGES` in data.js), from 0 to 3:
  - 0, early: general: a good player (the one the town suspects most) is good, or two are; the Outsider count.
  - 1: a Minion is evil; the Demon isn't one of 3 players.
  - 2: the Demon is one of 3 players (or next to one).
  - 3: the Demon is one of 2 players (or a player's evil character).
- Each third of the way to the final 3 is a level; a Storyteller helping good adds one, helping evil takes one away. Helping evil, its truths mislead where they can: a Recluse "is evil", a Spy "is good"; otherwise vouching goes to a good player nobody suspects.
- The Artist: how a Recluse or Spy registers follows the lean too: as they really are when the Storyteller helps good, as they'd mislead otherwise.
- The Fisherman's advice can now also say "X and Y are both good." or "The Demon is not one of X, Y and Z." (both vouch for them), and its role popup says it's better saved for later.
- log.txt gives each piece of advice its level and why (`[advice level 1 of 3 (50% of the way to the final 3; no lean); a level 1 tip]`).

## New Features: Three New Wizard Wishes

- **"I wish to hear the Demon's whispers."** (good only: an Alchemist with the Wizard's ability.) The Storyteller tells the town the 3 characters the Demon was told are not in play. Price: the Demon (and every teammate who knew them) learns 3 new ones. Clue: anyone claiming one of the old 3 in public is now strongly suspected (`exposedBluff` in `EVIDENCE_WEIGHT`). log.txt's header shows both sets.
- **"I wish for a second execution today."** (5 or more alive; never on the Mastermind's extra day.) After the day's execution, nominations open again once, with a Nominations card: everyone can nominate and be nominated again. Price: the Wizard can't nominate or vote in the second round. The Vortox and the Mayor go by the whole day: an execution in either round counts.
- **"I wish that the Demon has the ability of a Townsfolk not in play."** (evil only, Day 1 only.) The Demon gains the Fool or the Virgin ability (`WIZARD_GIFTS`, whichever isn't in play, preferring the one it claims) on top of its own: it survives its first death, or the first Townsfolk to nominate it is executed (and the town takes it for the real Virgin). Price: the Wizard dies that night. Clue: at dawn, the Storyteller says a wish cost them their life.
- NPC Wizards use them: a good one picks among its wishes; an evil one wishes for the gift on Day 1 half the time (`WIZARD_GIFT_CHANCE`), and for a second execution while the town suspects a good player most.
- A declined wish now says why in log.txt, and the Wizard's role popup (`note`) lists every wish.

## Bug Fixes & Improvements: The Dead Juggler, the Klutz's Reasons & Self-Play's Saint

From 30 self-played games, one on each script in turn, 8–15 seats.

- A Juggler who dies before they wake (killed by the Demon that night, or executed the day before) no longer learns how many of their guesses were right: the dead don't wake. Bluffers who die (a Savant mad as the Juggler, say) don't "learn" one either. The log says so (`juggler`).
- The Klutz's choice now says why in log.txt: a player their information trusts, or one they don't suspect, or at random (and how many they chose from).
- Self-play no longer nominates or votes for someone who told you they're the Saint (unless there's nobody else to nominate), and its hand in the log says why (`your nomination`, `no vote left`, how many suspect them...).

## New Features: Self-Play (Testing Only)

- Open the page with `?selfplay` in the address (e.g. `http://localhost:8000/?selfplay`) and the game plays your seat for you, one move every `SELF_PLAY_STEP_MS` (0.7 s), through the same controls and vote animation as your own. A Self-play button under the day counter pauses and resumes it, so you can take over at any point.
- Its moves are simple (`src/selfplay.js`): random night picks (optional abilities half the time), it asks NPCs until it runs out of conversations, uses any day ability once a day, closes cards, and nominates and votes for whoever the most NPCs suspect (always voting for its own nomination).
- Its decisions draw from their own seeded RNG, not the game's, so the same seed still deals the same game. Every move is logged as `selfplay` in log.txt.
- `new SelfPlay(e).play()` plays a whole game headless, for tests and scripts.

## Bug Fixes: Choosing Dead Players, Votes on the Dead & the Mastermind's Extra Day

From 10 auto-played games (random nominations by you, then every NPC nomination), and a check of every ability that chooses players.

- Who you can choose goes by the ability's wording: "choose a player" takes living and dead players, "choose an alive (or living) player" only the living, "choose a dead player" only the dead (`canPick()` in src/engine.js, used by the night choice, the town square and the tests).
  - Now any player: the Fortune Teller, Monk, Butler, Dreamer, Village Idiot, Seamstress, Exorcist and Innkeeper, an Alchemist's Poisoner and Fearmonger choice, the Slayer's shot and an Alchemist's Psychopath kill. (These used to take only the living.)
  - Still only the living: the Sailor, Chambermaid and Huntsman (and, for NPCs, the Snake Charmer, Devil's Advocate, Moonchild, Klutz and the Lleech's host). Still only the dead: the Professor.
  - NPCs still choose among the living for "choose a player" abilities: a dead player is rarely worth their pick.
- Slayer: a shot that kills nobody (a dead player, even a dead Demon, or a Lleech whose host lives) has no effect. It used to be logged as a kill, confirm the Slayer as good, and pass the Demon on.
- Votes: good NPCs, living or dead, never vote to execute a dead player. It kills nobody and uses up the day's execution. The exceptions: your pick in the final 3 (your call, as before), and their suspect when the Zombuul is on the script (it might only register as dead). In the logs, a Fortune Teller voted to execute a dead Librarian, so their own nomination of the Imp couldn't beat it; and 7 dead players spent their last vote on a dead Imp. The log says so ("[workings] … is dead: good players don't vote to execute them.").
- Mastermind: on the extra day after the Demon's execution, the evil team nominates a good player (their scapegoat first) and votes for any good nominee, never a teammate. Good players vote only for the player they suspect, since with nobody executed, good wins. In the logs, the Mastermind sat out its extra day, so nobody was executed and good won. Logged as "[workings] Mastermind's extra day: …".

## Superficial Changes: Report a Bug, How to Play, About & the Footer

- The ☰ menu by the title has a "🐛 Report a bug" link, under the town square size. It opens a new GitHub issue (github.com/grrarrgh/solobotc/issues/new) in a new tab.
- Setup page: under the New game card, a "How to play" guide, collapsed until opened: the goal, starting a game, night, talking to (asking) players, nominating, voting, and tips. Under it, "About": a fan-made project, built for fun, and not for commercial use. Both are hidden once a game starts.
- Every page has a footer: "This project is not affiliated with The Pandemonium Institute. All roles, content are the property of Steven Medway and The Pandemonium Institute."

## Bug Fixes & Improvements: Varied Bluffs, the Gambler, the Mathematician, Self-Votes & the Setup Page

From logs 19–21 (Extension Cord, Catfishing, Bad Moon Rising), and a check across every script of how often made-up information names the same player as the night before, against how often real information does.

- Bluffs naming the same player:
  - Made-up information (`madeUp()` in src/bluff.js) that names just the player(s) the same character's made-up information named last time counts as a poor fit. They try again, passing over those players (`p.avoidTargets`, honoured by strategy `fresh()`, which every choice goes through), and only keep it if nothing else fits. The log says so ("names the same player(s) as last time, for want of anything else that fits"). The Empath (the same 2 neighbours) and the Amnesiac are exempt.
  - A made-up story is made night by night in one go (`backStory()`), and the nights made so far now count as said (`bluffState(p).building`). So "never someone shown before" (`shownBefore()`, e.g. the High Priestess) and the check above hold within it. What was really said wins over a story remade for the same night (`keepStory()`).
  - Previous-night repeats in bluffs dropped sharply, now close to real players' rates: the Gambler from 9% to 2%, the Fortune Teller from 15% to 7%. Evil Monk bluffers now vary night to night, and repeat only in end games where nobody else fits (logged).
- Gossip: never says just what they said yesterday. They pick someone they haven't talked about before while they suspect anyone else, and another statement if it's the same player. An evil bluffer slanders other good players they haven't yet, never a teammate, their Lleech's host or you. Real Gossips repeated themselves 70% of the time, now 1%; Gossip bluffers 60%, now 16%. In log 21 the Pukka (Gossip) said "Goon is the Demon" two days running.
- Gambler: only ever guesses a character they've heard claimed, in public or to them, never a hunch (the guess that their suspect was a random Demon or Minion on the script, GAMBLER_WILD_GUESS_CHANCE, is gone). Someone they haven't guessed before comes first. The same goes for a Gambler bluffer or cover story.
- Mathematician, kept simple: every living player who is drunk or poisoned counts, once each, however many times and whatever their ability did tonight (it used to need their ability to have acted tonight). Dead players don't count. The Vortox and the Lunatic jinx count as before. The script sheet and character popup say so, under the ability: characters can now have a `note` in src/characters/catalog.js (`NOTES` in src/data.js) on how this game simplifies them.
- Round Robin: a player made mad today says they're the character they're mad about, and nothing else, as when asked. In log 20, a Snake Charmer mad as the Savant read out their Snake Charmer choices as the Savant's.
- Votes: nobody votes to execute themself, not even for your pick in the final 3. The exceptions are a Goblin (or Alchemist-Goblin) who claimed it today, and a Boomdandy. In logs 19–21, a Puzzlemaster, a Grandmother, a Spy and a Dreamer voted for their own execution.
- High Priestess bluffs: kept apart by the Poppy Grower, an evil bluffer never sends you to a teammate they don't know.
- Setup page: a card of its own (New game: Script, Seats, Seed, Start), with an i next to the script that opens the selected script's sheet. It closes like any popup.
- Script sheet: each team's characters (Townsfolk, Outsiders, Minions, Demons, and the Fabled) are listed alphabetically.
- Final reveal: each day's NPC talks are collapsed ("Who talked to whom") until opened, and "Open all" leaves them be.

## Bug Fixes: Outed Evil Bluffs

Every claim and bluff by or of the 10 Outed Evil characters was checked against what that character would really do, and what the bluffer knows. A new test plays 120 whole games on Outed Evil (8 to 15 seats) and checks every claim after every logged event.

- Alchemist bluffs: a pretender said they had a random Minion's ability. That could be a teammate's character, or a "loud" one whose use would visibly never happen. Now they say a quiet one (the Poisoner's or Wizard's), else one whose use is up to them (the Psychopath's or Goblin's), never the Fearmonger's (its every choice is announced). An evil one never names their own character, nor (unless the Poppy Grower keeps them apart) a teammate's. It's kept, in `bluffState(p).said`.
- Minions no longer favour bluffing the Alchemist as a "first-night information" character: what it learns names nobody, so it can't back up the Demon's claim. (Kept apart by the Poppy Grower, 3 of 4 evil players could end up claiming it.)
- The Poppy Grower is never an evil player's open claim, since a real one always hides. Setup's last-resort Townsfolk claims were missing that check. A faked coming clean as the Poppy Grower is still possible, as a real one comes clean too.
- The Demon's bluffs are never the Poppy Grower or the Heretic, whom nobody claims openly. With 3 or 4 evil players sharing 3 bluffs, an unusable one pushed a teammate onto a Townsfolk that might be in play. On Outed Evil, evil players (not kept apart) who double-claim a character went from 24% to 17%. The rest is 4 evil players sharing 3 bluffs on a script with 11 Townsfolk.
- The Lunatic never claims the Heretic: a real one only says so in the final 3.
- The evil team's scapegoat (whom its false information frames) is never their Lleech's host, whose execution would kill the Lleech. It's the evil Fearmonger's chosen player when they have one: if the Fearmonger nominates and executes them, good loses. The log's "Evil team is framing" line gives that reason.
- Kept apart by the Poppy Grower, an evil bluffer's false information no longer covers for teammates they don't know (`covered()` in src/storyteller.js, used for an Empath's "0" next to one), only for themselves.
- The 8 other scripts are unchanged: 640 seeded games, 8 to 15 seats, gave byte-identical logs before and after.

### Phase 4: the Alchemist and Wizard, and Outed Evil in the Script menu

- Alchemist (src/characters/townsfolk/alchemist.js): has the ability of a Minion on the script that isn't in play, picked at setup (ALCHEMIST_ABILITIES: the Poisoner, Fearmonger, Psychopath, Goblin or Wizard), and learns it on Night 1 ("Alchemist: you have the Goblin ability."). A Drunk shown the Alchemist has one too, to no effect. It works for the good team, through `minionAbility()` in src/storyteller.js, which the Fearmonger, Psychopath, Goblin and Wizard now go by. The log names it ("Player 3 (Alchemist-Fearmonger) chose…"). You can be dealt it, with any of them.
  - Poisoner: each night, poisons a player tonight and tomorrow. An NPC poisons their suspect; you're woken to choose.
  - Fearmonger: each night, chooses a player. An NPC chooses their suspect, and nominates them when they'd nominate them anyway; you're woken to choose. If they nominate and execute an evil player, evil loses (and good, if it's a good one: careful). The town hears a new choice as usual.
  - Psychopath: once a day, before nominations, a player dies in public ("…publicly chooses Player 6 (with the Alchemist's Psychopath ability): they die."). An NPC only kills a player they strongly suspect. They say they're the Alchemist, and aren't taken for evil. You get a "Choose them to die (Psychopath)" button for the selected player. Executed, they play roshambo like the Psychopath.
  - Goblin: claimed when nominated, as the Goblin's ("Execute me today, and my team wins."). Executed that day, good wins. The evil team never votes for a Goblin they know isn't theirs (unless the Poppy Grower keeps them from knowing), and good players hardly ever vote for any. You get a "Nominate yourself (claim the Goblin)" button once nominations open.
  - Wizard: see below. You get a wish menu (`#wish-controls`).
  - Jinxes: Alchemist & Marionette, Mastermind, Spy and Widow are in `JINXES`. They never come up: the Alchemist is never given those abilities, since by these jinxes they'd have no ability, and an Alchemist-Spy or -Widow needs one in play.
- Wizard (src/characters/minion/wizard.js): once per game, a wish, kept simple (WIZARD_WISHES). The Storyteller grants it, or declines it, and they may wish again:
  - "I wish that a player I choose dies tonight.": they die that night, and at dawn the town hears "a wish was granted, and Player 4 died of it." Never the Demon (declined).
  - "I wish to see the Grimoire.": the evil team knows every character, as after a Widow's look. Evil only (declined for a good one: it would win the game).
  - "I wish to know who the Demon is.": they learn it. Good only (an Alchemist with the ability). Price: the Demon learns who wished, and goes after them.
  - An NPC Wizard wishes at dawn, at WIZARD_WISH_CHANCE (0.35) a day: an evil one from Day 1 (the Grimoire half the time if the team hasn't seen it, else a death), a good one from Day 2 (the Demon, which they then go after). You make yours by day: what the Storyteller says goes in your log. The Wizard has no jinxes.
- Goblin claims get a popup card of their own, in red ("👺 Goblin claim"), after the nomination's card.
- Outed Evil is in the Script menu (scripts/index.json) and the README's script list. Every good character on it can be bluffed (the test that covers every listed script now covers it too). 160 whole games on it, 8 to 15 seats, see every character act.
- The 8 other scripts are unchanged: 640 seeded games, 8 to 15 seats, gave byte-identical logs before and after.

### Phase 3: the Lleech and Poppy Grower

- Lleech (src/characters/demon/lleech.js):
  - On Night 1, the Lleech chooses a host: a living good NPC, preferring one who claims an information character. Never you: NPCs never nominate you, so you could never be executed. The host is poisoned every night while the Lleech lives (`lleechLasting()`). A Lleech that fails to choose (drunk or poisoned), or that became the Lleech later, chooses on a later night.
  - Each night after that, it kills like any Demon, never its own host.
  - It can't die while its host lives, unless it's drunk or poisoned (`lleechSafe()` in `guard()`). Nothing but the Assassin gets past that.
  - When the host dies, by any cause, the Lleech dies too (`lleechHostDied()`), and good wins unless someone takes over as Demon.
  - Executed and surviving with no claim to explain it (no Fool, Sailor, Pacifist or Tea Lady neighbour), with the Lleech on the script and no Devil's Advocate, the town takes them for the Lleech. They're outed as evil, and good NPCs stop nominating them (`s.lleechSuspects`).
  - The evil team spares its Lleech's host (`spares()` in src/strategy.js). The Demon, Assassin, Godfather, Witch, Psychopath and Fearmonger never choose them, the Boomdandy's countdown never points at them, and evil NPCs never nominate or vote for them. That's while they know who their Demon is: not while the Poppy Grower keeps the team apart.
  - Left with only their host and you to kill, the Lleech kills you, and evil wins (`lleechCornered()`). This is the one time the Demon kills you: otherwise the game could never end.
- Poppy Grower (src/characters/townsfolk/poppygrower.js):
  - While a Poppy Grower dealt at setup has their ability (alive, sober and healthy; `poppyBlocks()`), the Minions and Demon don't know who each other are (`p.poppyBlind`).
  - Each of them picks a bluff on their own. Nobody gets the Demon's bluffs, not even a Spy or Widow, and nothing falls back on them (a Minion guessing the Damsel, faking coming clean, juggling).
  - To each other they're just players (`teammate()`, `goodTo()`, kill priority, the Cerenovus's and Pit-Hag's picks), so the Demon may kill its own Minion, and a Fearmonger may choose a teammate.
  - The setup log says so, and the Demon's bluffs line reads "not told: the Poppy Grower".
  - The Lunatic, who thinks they're the Demon, isn't shown their "Minions" or bluffs either, just as a real Demon wouldn't be, and claims a Townsfolk on their own. The setup log says so. The Demon still knows who the Lunatic is and whom they attack: that's the Lunatic's own ability. A Lunatic who dies before learning them says "I was never shown my Minions."
  - When the Poppy Grower dies with their ability, the evil team learns who each other are that night (`poppyWakes()`), the Demon learns its bluffs, and the Lunatic is shown their "Minions" and bluffs. All of it is logged.
  - An NPC Poppy Grower always hides behind a cover story (a "low" character), and comes clean only once dead, never "late in the game" or because of their information. Their kill priority is "high": the evil team goes after them, if it can find them.
- Jinxes, checked against the Djinn:
  - Heretic & Lleech: "Only 1 jinxed character can be in play." This joins the Heretic's other `exclusive` jinxes, and the whole-game test now covers it.
  - Lleech & Mastermind: if the host is executed while the Mastermind lives, the Lleech lives but loses their ability.
  - Lleech & Slayer: a Slayer's shot at the host kills the host (and so the Lleech).
  - Spy & Poppy Grower, and Widow & Poppy Grower: while the Poppy Grower has their ability, the Spy and Widow don't see the Grimoire. The Spy's made-up information is a lie, not the truth, and the Widow still poisons.
- Every jinx between the 10 Outed Evil characters and characters in the game is now in, except the Alchemist's 4 (Phase 4). The others are with characters the game doesn't have.
- The 8 existing scripts are unchanged: 640 seeded games, 8 to 15 seats, gave byte-identical logs before and after.

### Phase 2: the Goblin, Fearmonger and Psychopath

- Goblin (src/characters/minion/goblin.js): when nominated, an NPC Goblin claims it in public at GOBLIN_CLAIM_CHANCE (0.75) ("Player 6 says: "I'm the Goblin! Execute me today, and evil wins.""). If they're executed that day, dead or not and not drunk or poisoned, their team wins.
  - Good NPCs vote to execute a player who claimed the Goblin today only at GOBLIN_GOOD_VOTE_CHANCE (0.05), even in the final 3 when it's your pick. They never nominate one who has claimed it, and the evil team always votes for them.
  - Once the evil team's living votes are at most GOBLIN_PUSH_SHORT (1) short of marking anyone, an evil NPC nominates their Goblin at GOBLIN_PUSH_CHANCE (0.5), decided once a day.
- Fearmonger (src/characters/minion/fearmonger.js): each night, chooses a player. That's the same one while they live; otherwise the good NPC the most good NPCs suspect, as the town's likely next execution, and never you. A new choice that worked is announced at dawn ("The Storyteller: the Fearmonger has chosen a new player."). If the Fearmonger nominates and executes that player, the player's team loses.
  - An NPC Fearmonger nominates their player whenever a good NPC suspects them, or else at FEARMONGER_PUSH_CHANCE (0.3), decided once a day.
  - Once a Fearmonger has chosen, good NPCs hold back on nominations made by NPCs they don't trust: they vote at FEARMONGER_CAUTION (0.5) times their usual chance, even on their own suspect. Your nominations are exempt.
- Psychopath (src/characters/minion/psychopath.js):
  - At dawn, before nominations, an NPC Psychopath may choose a player in public, and that player dies ("Player 3 publicly chooses Player 7: they die."). Until they've done it once, it's at PSYCHOPATH_KILL_CHANCE (0.35) a day; after that, every day. They pick whoever the Demon would kill, never a teammate. Drunk or poisoned, nothing happens.
  - If executed, a working Psychopath plays roshambo against their nominator, and only dies if they lose. They win ties, so they die 1 time in 3. Each round is announced ("Roshambo: Player 3 throws rock; Player 5 throws scissors. The Psychopath wins.").
  - If you nominated them, ending the day waits for your throw: Rock, Paper or Scissors buttons appear in place of the day's controls (`#roshambo-choice`; `roshambo()`). Then the day ends as usual.
- Publicly outed evil: a Psychopath's kill, or a Goblin claim, goes in `s.outed` (engine `outed()`), and good NPCs weigh it as evidence (EVIDENCE_WEIGHT.outedEvil, 8).
- Executions: `execute()` is split. `executionEnds()` holds what follows the execution, and `dayEnds()` the rest of the day, so a roshambo can wait for you. A Goblin's or Fearmonger's win is checked first, whether the player died or not.
- Jinx: Cerenovus & Goblin: "The Cerenovus may choose to make a player mad that they are the Goblin." At CERENOVUS_GOBLIN_CHANCE (0.2), a good NPC (never you) is made mad that they're the Goblin. They claim it when nominated, and executing them does nothing. The Goblin has no other jinxes with characters in the game; the Fearmonger's and Psychopath's are with characters the game doesn't have.
- Logging: the Goblin's claim (real, real but drunk or poisoned, or mad), and their win. The Fearmonger's choice each night (new, or "again"; failed if drunk or poisoned), the announcement, and the win. The Psychopath's kill, and every roshambo round with its result.

### Phase 1: the General, Heretic and Politician

- General (src/characters/townsfolk/general.js): each night, learns which alignment the Storyteller believes is winning ("General: evil is winning.", "General: neither team is winning."). That's the side the Storyteller's lean (`lean()` in src/storyteller.js) isn't helping: when it's helping good, evil is winning. With no lean, neither. Drunk or poisoned, they hear that good is winning when it isn't, and "neither" when it is. The log shows the Storyteller's workings with what they learned. It can be bluffed like any other information character. You can be dealt it.
- Heretic (src/characters/outsider/heretic.js): whoever wins, loses, and whoever loses, wins, even if the Heretic is dead (not while drunk or poisoned). The result banner gives the reason ("Demon died. But the Heretic turns it around: evil wins."), and the log and Final reveal have a "heretic" entry. An NPC Heretic quietly works against their own team's in-game win: they vote for players they trust, hold back from their suspect, and never nominate their suspect. You can be dealt it.
  - An NPC Heretic hides behind a Townsfolk claim, with made-up information, as the Mutant and Damsel do (it joins HIDDEN_OUTSIDERS). Unlike them, they don't admit it once dead.
  - In the final 3, once per game, they say so in public at dawn if evil looks about to lose: they're sure a living player is evil, or you marked one evil ("Player 4 says: "I said I was the Chef, but I'm the Heretic: whoever wins, loses. If good wins today, good loses."").
  - Evil can bluff it. With no Heretic speaking up, and evil looking about to lose (you marked the Demon evil, or a living good NPC is sure of them), an evil NPC claims to be the Heretic at HERETIC_BLUFF_CHANCE (0.5), to have you spare the Demon. They pick, in order: whoever took the Heretic as their bluff, a dead teammate, a living Minion, and the Demon last. The bluff counts as a lie to you, and the log says which claim was real or fake and why, including when an evil NPC could have bluffed but didn't.
  - Good players never pretend to be the Heretic as a cover story (`neverHiddenAs`).
- Politician (src/characters/outsider/politician.js): if they were the player most responsible for their team losing, they change alignment and win, even if dead (not while drunk or poisoned). Most responsible means the game was lost by an execution the Politician nominated, or one where they voted and it got exactly the votes it needed (`politicianBlame()`). Executions now record who they were lost by while under way (`s.executing`). Each vote in `s.voteHistory` also keeps the votes it got (`count`) and needed (`needed`). At game end, every Politician on the losing team gets a log line saying whether they were responsible, and whether they turned. You can be dealt it.
- Jinxes (`JINXES` in src/data.js), from the official list (wiki.bloodontheclocktower.com/Djinn):
  - Heretic & Baron, Godfather, Pit-Hag, Spy, Widow: "Only 1 jinxed character can be in play." These are marked `exclusive`. Setup leaves the Heretic out once one of the others is dealt, with a "jinx" line in the setup log ("The Heretic is left out: only 1 of it and the Baron can be in play."). The Pit-Hag never makes a Heretic. A Philosopher can't gain an ability jinxed with a character in play (`jinxBarred()` in src/storyteller.js): NPCs never choose it, and you aren't offered it. Other ways characters change (the Barber, Snake Charmer, Fang Gu, Huntsman, Demon succession) can't bring one in. A test plays 120 whole games full of these characters and checks the rule after every logged event. (Heretic & Lleech join these in a later phase.)
  - A Philosopher who gains the Heretic ability (with nothing jinxed in play) turns the result around too.
  - Pit-Hag & Politician: an evil player she makes the Politician can't turn good. (It never comes up: the Pit-Hag only makes good players Outsiders.)
  - Legion & Politician: a good Politician's vote counts as evil to Legion at LEGION_POLITICIAN_CHANCE (0.5), so an execution where every other voter is Legion can fail. The log says when it does.
- `exclusiveWith()` in src/data.js lists the characters jinxed never to be in play with a given one.

## New Script: Outed Evil

Outed Evil (scripts/Outed Evil_5_0_0.json, by Manny) has 10 characters the game didn't have yet, added in 4 phases (above). With Phase 4 it's in the script list (scripts/index.json) and the Script menu. Its Travellers (Thief, Bureaucrat, Butcher, Apprentice, Deviant) are left out, as on every script. The Sentinel was already in the game.

- scripts/Outed Evil_5_0_0.json reformatted to match the other scripts: one character per line.

## New Features & Improvements: Bluffs for Every Good Character

A rework of how information and bluffs are made, in three phases. Every good character can now be bluffed, by good and evil players alike, through one set of rules, and each character's information lives in that character's own module. Phases 1 and 2 only moved code: 640 seeded games (every script, 8 to 15 seats) gave byte-identical logs before and after each step. Phase 3 changed how bluffs play.

### Phase 1: each character's information in its own module

- Each character's information moved out of the long `if (role === …)` chains in src/storyteller.js and into its own module (`src/characters/<team>/<id>.js`), as `export const info = { … }`. It holds the true information (`truth`), the false information a drunk or poisoned player hears (`lie`, which helps the evil team, or `random`), and, for the 8 characters who choose each night (Monk, Sailor, Butler, Gambler...), what someone without the ability says they chose (`choice`).
- 17 new modules for characters that had none: Washerwoman, Librarian, Investigator, Chef, Empath, Fortune Teller, Undertaker, Clockmaker, Dreamer, Mathematician, Balloonist, Village Idiot, High Priestess, Flowergirl, Town Crier, Oracle and Noble. The Washerwoman, Librarian and Investigator share src/characters/pairinfo.js.
- src/characters/info.js finds any character's `info` (`infoOf()`). It's built on first use: the character modules and storyteller.js import each other.
- src/storyteller.js went from 2,499 lines to 1,367.

### Phase 2: one place for bluffs

- The day and death information moved into its characters' modules too: Artist, Seamstress, Sage, Juggler, Savant, Fisherman, Puzzlemaster and Chambermaid, and what the Monk, Butler, Gambler, Snake Charmer, Gossip, Philosopher and Evil Twin remember. A new src/characters/townsfolk/ravenkeeper.js took the Ravenkeeper out of `engine kill()`.
- New src/bluff.js: everything said in a character's name by someone without its ability goes through it.
  - `bluffTonight()`: an evil player's bluff each night (was `bluffInfo()`).
  - `backStory()`: the story so far for anyone who takes up a claim mid-game: Cerenovus madness, a mad Pixie, an evil player faking coming clean (was `madInfo()`).
  - `keepStory()` and `hiddenStory()`: a good player's cover story, or a hiding Mutant or Damsel, growing each morning (were two near-identical strategy methods).
  - `bluffMode()`: the one rule that a working Spy, who has seen the Grimoire, tells the truth. It was written out separately in 7 modules.
- `p.bluffState` holds everything a pretender has made up, so their story holds together. It replaces 10 scattered fields: `bluffGained`, `bluffGainedNight`, a bluffer's `cannibalFrom`, `madGained`, `madCannibal`, `hideInfo`, `pixieMemories` / `pixieDay`, `dreamBluffs`, `savantSaid` and `balloonClaimed`.
- Character-specific bluffs live with their character: the Seamstress's and Courtier's once-per-game bluff (`info.once`), and the Philosopher's and Professor's bluffs (out of `engine bluffs()`).
- src/storyteller.js went down to 592 lines: the Storyteller's own logic (who gets what information, the lean, the scapegoat).

### Phase 3: bluffs that fit what the bluffer knows

- What a bluffer knows (`knows()` in src/bluff.js):
  - a good player: who they trust, from their own information or because the town is sure of them; and who they know lied in public, or whom their own information suspects;
  - an evil player: their team (the Lunatic's imagined team, for the Lunatic), and who the town is sure of.
  - Either way, each piece of information is read against the claims they've heard.
- One rule, `fits()`, that all made-up information goes through, made-up night choices included:
  - it never casts suspicion on you: you're always good, and never anyone's suspect. This rule wins over the others: when nothing fits, the bluffer says the last thing they made up that doesn't suspect you;
  - it never casts suspicion on someone the bluffer is sure is good, or on an evil bluffer's teammate;
  - a good bluffer's never vouches for someone they know is evil;
  - a good bluffer's never names the Pixie, the Mutant, the Lunatic or the Drunk (the new `neverBluffed` in src/characters/catalog.js, NEVER_BLUFFED). Nor do they ever claim one. Evil bluffers still bluff the Pixie and fake the Lunatic, never claiming either while alive.
  - Information that doesn't fit is made up again, up to BLUFF_TRIES (6) times. If nothing fits, log.txt says so: "Player 4 (Imp) could make up nothing that fits what they know, so says: …". (It never happened in 640 test games.)
- A good pretender's information is random, but sensible (each character's `story`):
  - Empath: the same number while the same neighbours sit either side (0 next to you).
  - Oracle: never fewer evil dead than they said before, never more than are dead.
  - Undertaker: the character the executed player claimed; "Nobody was executed." when nobody was. Before, a made-up Undertaker named a random character on a day with no execution.
  - Flowergirl and Town Crier: never "a Demon voted" (or "a Minion nominated") on a day with no votes (or nominations).
  - Grandmother: the grandchild's claim. Dreamer: the dreamed player's claim as the good character.
  - Washerwoman, Librarian, Investigator: 2 other NPCs (never you), and a believable character, one of the pair claims if they do; otherwise that none is in play.
  - Fortune Teller and Noble: other NPCs of their own (never you). Amnesiac: NO, or 0, next to you; any players it names are other NPCs.
- A made-up Philosopher or Cannibal story never "gains" a character in NEVER_BLUFFED. Before, a good player's made-up Cannibal could "eat" a Mutant or Lunatic they'd heard claimed.
- The Spy and evil bluffs:
  - A Spy's true information from a day or death ability (Artist, Fisherman, Juggler, Savant, Sage, Ravenkeeper, Puzzlemaster) becomes a lie when it would give a teammate away, as night information already did.
  - A Spy never tells the truth about a Townsfolk while the Vortox lives: the evil team knows every Townsfolk's information is false.
  - A Spy bluffing the Puzzlemaster follows the same rule as everywhere else (before, it always lied).
  - An evil Ravenkeeper bluffer who chooses a teammate, or a player the town is sure of, names the character they claim. Before, it named a random one, which looked like suspicion of the teammate.
  - An evil Village Idiot bluffer never calls a player the town is sure of evil.
  - An evil Empath or Amnesiac bluffer next to you says 0 (or NO), as they already did next to a teammate: anything more would cast suspicion on you.
  - A Lunatic bluffing the Village Idiot no longer "learns" that one of their imagined teammates is evil.
- Good pretenders act out their claim, as a real one would, to no effect:
  - A hiding Mutant or Damsel, or a player the Cerenovus made mad, uses their claim's day ability: Slayer shots, Gossip statements, Artist, Fisherman, Juggler, Huntsman, Puzzlemaster, Amnesiac. Before, only evil players, the Lunatic and a mad Pixie did.
  - A good player's cover story uses its Professor too.
  - A good pretender's public act (a Slayer shot, a Gossip statement, a Professor's "chose X, who stayed dead") only ever goes at a player they strongly suspect (STRONG_EVIDENCE), or know lied (`strongSuspect()` in src/strategy.js). With nobody like that, they don't act. Evil bluffers' acts still go at a good player who claims the same character, then the scapegoat (at SCAPEGOAT_CHANCE), then any good player.
  - What a good pretender makes up goes into their story (the cover story's, the hiding Mutant's, or today's madness), never into what they really learned (`madeUpMemories()`). Anything that comes after the act ends (a Juggler's count the night after madness ends) is dropped.
  - A mad Savant's made-up visit counts as today's visit: before, they could visit twice.
- Everything about a character's information is in its module (`info`). Besides what it says, there's when it wakes (`nights`: "first", "each" or "later"), what it leaves behind (`keep`: the Grandmother's grandchild link, the Balloonist's type, the Amnesiac's secret ability, the Mathematician's log note), and how it reads (`stance`: does it trust or suspect the players it names? `named` and `claimStance`: the characters it names, against their claims). These were the hard-coded lists in `actsTonight()` and `infoStance()`, `namedCharacters()` and `stanceOn()` in src/strategy.js. (This step only moved code: the logs were byte-identical.)
- You're never anyone's suspect: an NPC's statement is never recorded as suspicion of you (strategy `heard()`). NPCs already never suspected, accused, nominated or acted against you. The Storyteller's own information is unchanged: an Empath next to you with an evil neighbour still gets 1, and you can still be an Investigator's "other" player.
- Checked over 640 games on every script:
  - no bluff or made-up story cast suspicion on you;
  - nearly all of the 3,219 evil bluffs and 412 good made-up pieces fit what their bluffer knew. The 32 that didn't were all safe for you. 25 were an evil Exorcist bluffer late in the game with only teammates left to choose from;
  - no living evil player ever claimed the Pixie or the Lunatic (35 Pixie bluffers, 46 fake Lunatics);
  - no good pretender named a NEVER_BLUFFED character;
  - win rates are unchanged: good won 285 games, as before.
- 8 new tests, including one that plays every good character on every script as a good and an evil pretender.

## New Features: Lunatic Reveals & Fake Lunatic Bluffs

- A Lunatic claiming the Mayor comes clean the morning after a day with 3 alive ends with no execution and no Mayor win: "I'm not the Mayor: there was no Mayor win. I'm the Lunatic: I thought I was the Pukka. My Minions were Player 3 and Player 7." As before, a Lunatic who dies says so the next morning if the game goes on. Once they know, they play for good and stop "killing" at night.
- The Lunatic can now be one of the Demon's bluffs (not in Legion games). Nobody claims it while alive. The first evil player who knows it and dies, with the game going on, says the next morning that they were the Lunatic. They name a Demon that isn't in play, and good NPCs as their "Minions" (never a teammate), so the town thinks a good player died. The log marks it "(fake: they're the Assassin)", and it's one of the clues to the evil team. In 2,250 test games, 183 evil players faked it.
- A Cannibal who eats the Lunatic is told they're a Demon: a Demon that isn't in play, "Minions" (the real Demon among them, as a Lunatic's are) and 3 bluffs. They stay good and play as the Cannibal.
- The Pit-Hag, the Philosopher, the Cerenovus and the Barber never pick the Lunatic: a Lunatic made, gained, swapped or claimed in madness mid-game has no Demon or "Minions" to believe in. Before, a Cerenovus could make a player mad as the Lunatic, and the Pit-Hag could make one who openly claimed it.
- Checked (no change needed): players who change character keep their alignment unless their character says otherwise. Over 2,250 test games, every alignment change came from the Goon, the Mezepheles or the Fang Gu jumping to an Outsider, including one the Pit-Hag made that night.

## Bug Fixes: Puzzlemaster, Drunk & Poisoned Minions, Mathematician, Poisoner, Marionette & Fake Coming Clean

- Puzzlemaster: the puzzle's drunk is always a good player, never a Minion or the Demon. Before, only the Demon was left out, and a Spy could be drunk all game.
- A drunk or poisoned Minion's ability doesn't work, including when it's only drunk or poisoned for a while (a No Dashii's neighbour, a Poisoner's choice, a Sailor's...):
  - The Scarlet Woman doesn't become the Demon when the Demon dies.
  - The Spy registers as evil to information abilities, not good.
  - A dead Spy who bluffed the Sage or Ravenkeeper only learns true information if they weren't drunk or poisoned. (The Sage checked poison but not drunkenness, and the Ravenkeeper checked neither.)
- Mathematician: a poisoned or drunk player counts only if their ability did something that night: information, waking in the night order (a Monk, Butler, Spy, Poisoner, the Demon...), or a Soldier the Demon chose. Before, everyone poisoned or drunk counted, whether or not their ability was used. In one Night 1, a poisoned Ravenkeeper (alive, so their ability never triggered) and the puzzle's drunk Spy were counted along with a poisoned Empath, giving 3 instead of 1. Players drunk until dusk (Sailor, Innkeeper...) now count too, by the same rule.
- Poisoner: never picks a player who is already poisoned (a No Dashii's neighbour, a Widow's choice...) while there's anyone else; their information is already false. In one game it poisoned the No Dashii's poisoned neighbour two nights running.
- A Marionette who has been told they're the Marionette only spreads information from the character they claim. A Marionette shown the Pixie who went mad as the Monk said "I am the Monk. Night 1: The Monk is in play.", repeating the Pixie's information as the Monk's. Now they accuse a good player instead.
- An evil player bluffing the Pixie who fakes coming clean now drops the Pixie's "madness". A Boomdandy "mad" about the Artist faked coming clean as the Dreamer, with Dreamer information, but in conversation still said "I claim Artist. I have no stored information.", because they kept answering as the mad Pixie. They now answer as the Dreamer, with that information. The log line says so: "(fake: they're the Boomdandy; no longer "mad" about the Artist)".
- An evil NPC never fakes coming clean as a character a teammate claims, even one they never heard it from: the team knows each other's bluffs. A Legion faked coming clean as the Monk while another Legion claimed it.
- An evil Pixie bluffer (or a Spy bluffing the Pixie) is never "mad" about a character a teammate claims: once mad, they'd claim it too. A Vigormortis went mad as the Magician, the Baron's claim, and a Legion as the High Priestess, another Legion's claim.
- Legion and the Mayor: when the Storyteller steers Legion's kill to a good player and it lands on the Mayor, the Mayor's bounce now lands on another good player (or on a Legion, if the kill was steered to a Legion), when there is one. Before, it landed on anyone at random. In one game it killed a Legion two nights running, undoing the steering.
- A dead Lunatic who was bluffing a mad Pixie no longer "reveals they were the Pixie" the same morning they say they were the Lunatic.
- log.txt: the Mathematician's information gives the true count and who it counts, and why: "Mathematician number: 3. [true count 3: Player 3, they are the Marionette; Player 5, poisoned by Player 4, the No Dashii; ...]". A poisoned Mathematician's random number can match the truth, and the log now shows when it does.
- log.txt: the Boomdandy's countdown line lists who pointed at whom, the dead included ("Who pointed at whom: You → Player 8; Player 2 (dead) → Player 3; ..."). Before, only the counts were there.
- log.txt: a Lunatic with nobody to "kill" says so ("only you and their imagined team are left"). Before, the night just had no Lunatic line.
- log.txt: "Player 4 claims the Village Idiot, which you really are" (was "which You really is"), and "You are the drunk one" for the Village Idiots.

## Bug Fixes: Legion Night Kills & Evil Made-Up Information

- Legion's night kill now always steers for a final 3 of you, 1 good NPC and 1 Legion (2 good NPCs and 1 Legion with you dead). The Legion left should shrink in step with the players alive, from the number dealt down to 1 (`legionWant()`). Each night the Storyteller weighs nobody dying, a Legion dying and a good NPC dying, and takes whichever leaves the Legion closest to that path, at random among near ties (LEGION_STEER_SLACK, 0.35); nobody dies only after a day with an execution, so the game moves on. Before, it only steered when lean() named a side; otherwise it rolled at random (nobody 20%, a Legion or a good player 40% each), which could leave good with no way to win. log.txt says what each choice would have left, and who's alive: "steering for a final 3 with 1 Legion, which wants 2.3 Legion with 5 alive: nobody leaves 0.3 off, a Legion leaves 0.3 off, a good player leaves 1.0 off; nobody, at random of 2; 2 Legion and 3 good alive". In 160 test games, 123 of the 130 that reached 3 players were you, 1 good NPC and 1 Legion; the other 7 came from your own nominations executing good players. LEGION_NO_DEATH_CHANCE and LEGION_SELF_CHANCE are gone.
- An evil player's made-up information now helps their team, as their bluffs do: when they fake coming clean, and when the Cerenovus makes them mad as a fresh bluff. Before, it was random, like a good player's cover story: a Legion faking coming clean as the Village Idiot "checked" two fellow Legion as evil. A made-up Dreamer uses the Dreamer bluff, and a made-up Savant the Savant bluff.
- Dreamer bluffs in Legion games said "Player 4 is the null or the Magician": the evil character has to be one not in play, and with Legion every evil character on the script is. It now names another evil character, or Legion.
- Evil bluffs that could still point at a teammate: a Fortune Teller's YES with a teammate among the pair (with no one to frame); a Grandmother naming a teammate's real claim rather than the one the bluffer heard; and a Washerwoman's random pair holding a teammate (common with Legion), which named a Townsfolk neither claimed. Each now vouches for the teammate, or says NO. Checked over 2,604 made-up pieces of information: none give a known teammate away.
- High Priestess: the Storyteller treats a good player with true information (an Oracle's number, say, which names nobody) as worth talking to. Before, only information naming an evil player counted, so a helpful Oracle could be her "dull" choice.
- Legion never kills a good player at night once only 2 good players are alive, you included (LEGION_GOOD_MIN): it kills a Legion, or nobody. Good needs 2 to win, executing the Legion one by one; with 1, executing a Legion leaves 2 alive and evil wins. Before, the Storyteller's random choice could kill the second-to-last good player (in one game, the Lunatic, leaving you against 2 Legion with no way to win). When the Storyteller is helping evil then, nobody dies, rather than a Legion. The log says why ("only 2 good players are left").

## Bug Fixes: Oracle Bluffs, Marionette, Cover Stories & Logging

- An evil Oracle bluffer never says fewer dead players are evil than they said before: the dead don't come back, so a count that went down (2, then 0) gave the lie away. It's still never more than the number of dead players. The same holds for a drunk or poisoned Oracle's wrong answer.
- High Priestess: never shown a player she was shown before, while there's anyone else (about 30% of nights repeated one before). The same goes for her made-up information, and an evil bluffer's.
- Village Idiot: never checks a player they checked before, while there's anyone else. Repeats were rare for a working one, but a drunk one's and an evil bluffer's ran out of fresh players early: every pick counted, even ones that never reached their information. It now goes by what they've learned or said (`shownBefore()` in src/storyteller.js), and they pick one player a night.
- Vigormortis (checked, no change): a Minion it kills poisons exactly one Townsfolk, the nearest one on either side, alive or dead (825 test kills, every one right).
- A Marionette who doesn't know they're the Marionette is no longer listed as having lied to you (in the log's clues and the final reveal) when they claim the Townsfolk they believe they are. Once the Demon has told them, their claim counts as a bluff, as before.
- Cover stories: two good players could hide behind (or bait as) the same character, in one test game three of them as the Ravenkeeper, so each looked like a liar to the town. A cover story now never uses a character someone else's cover story already uses. Checked over 640 games on every script: none shared.
- log.txt:
  - When you first talk to someone with a cover story, it says whether they drop it for you ("Player 5 tells you the truth: they're the Village Idiot, not the Ravenkeeper") or keep it, decided once at COVER_TELL_HUMAN_CHANCE. Before, a player listed as baiting as the Monk who told you they're the Ravenkeeper looked like a mistake.
  - The Storyteller's choice of who a High Priestess should talk to is only noted when that's what they learn. Before, it was noted for a drunk High Priestess (or a Marionette who thinks they're one), whose information was something else.

## UI Fix: Death Shroud Size

- Death shroud: 25% bigger, 50% of the seat's width (was 40%), still in proportion to the seat at any size.

## Bug Fix: Seamstress & Recluse

- An NPC Seamstress never chooses a player they know claims the Recluse (in public, or to them, or passed on), while they have anyone else to choose: the Recluse might register as evil, and the Seamstress only gets one use. So does an evil player bluffing the Seamstress, whose "choice" works the same way. You can still choose anyone.

## Bug Fixes: Pixie Claims & Evil Bluffs

- A Pixie never learns the Pixie (that already held), and never claims the Pixie while alive: only once dead, or once they've been changed into another character. The same goes for anyone bluffing the Pixie: an evil player, and now the Lunatic too. Checked over 325 games on Onion Pies, Extension Cord and Trust Redux.
- A Pixie who gains their ability keeps claiming that character (now truly theirs) and says nothing of the Pixie. Before, they said in public: "I was the Pixie, mad about being the X. I now have the X ability," and claimed the Pixie from then on. An evil Pixie bluffer who "gains" it does the same.
- Asked, a living Pixie leaves out their Night 1 information ("Pixie: the X is in play."), which would give them away (`spoken()` in src/strategy.js). So does an Evil Twin repeating a good twin who's the Pixie. In the Round Robin, a living Pixie gives their character's claim.
- A Pixie (or Pixie bluffer) the Cerenovus made mad on Night 1 went back to claiming the Pixie when the madness ended, and explained "I am actually the Pixie." The madness started before they took on their character, so the Pixie was the claim it went back to. They now go back to their character.
- A Drunk (or Marionette) shown the Pixie claimed the Pixie all game, sharing their Night 1 Pixie information: only a real Pixie or a Pixie bluffer went mad about their Townsfolk. They now act as the Pixie they think they are: mad about the Townsfolk they learned, never claiming the Pixie while alive, and admitting it once dead. (With no ability, they never gain one.)
- A Lunatic whose bluff was the Pixie claimed the Pixie all game. They now act like any other Pixie bluffer: mad about a Townsfolk, until they die.
- The Cerenovus never makes anyone mad they're the Pixie (nor the Drunk, Mutant or Damsel, as before): nobody claims those openly while alive.
- Bluffs, checked for every good character on nights 1 to 4: an evil bluffer reports information whenever the real character would, and so does a good player made mad or with a cover story (made up at random). That already held. What an evil bluffer said could point at their own team, though: 54 bluffs across 24 test games (every character, 4 nights each), down to 1 (the Exorcist case below).
  - A working Spy tells the truth (it has seen the Grimoire), except when the truth points at a teammate (a Fortune Teller's YES on the Imp, an Investigator's Minion, a Noble's 3 with the Imp...). Then it bluffs like any other evil player (`givesAway()` in src/storyteller.js).
  - Other evil bluffers no longer frame the Spy: they know it's on their team, though it registers as good to information. A Noble's 3, a Village Idiot's "evil", and an Amnesiac's pair now go by who's really evil.
  - An evil Empath or Amnesiac bluffer next to a teammate says 0, or NO ("Is a neighbour evil?", "Is a neighbour the Demon?"). Before, a number above 0, or a YES, pointed at the teammate. (This came up most with Legion.)
  - An evil Washerwoman bluffer vouching for a teammate names the Townsfolk that teammate claims, so the two stories match. Before, it was any Townsfolk, which neither of the pair claimed, so both looked like liars.
  - An evil Exorcist bluffer never "chooses" a teammate, unless there's nobody else to choose.
- A good Mutant or Damsel, hiding behind a Townsfolk claim, now makes up that Townsfolk's information, at random, as a good player's cover story does (`hiddenInfo()` in src/strategy.js). It's kept from day to day, with each night's added in the morning. Before, they claimed (say) the Village Idiot but said "I have no stored information.", which gave them away (67 of 69 test games where they claimed a Townsfolk that learns something). Once dead they say what they were, as before. An evil player bluffing the Mutant or Damsel already made up information for their Townsfolk.
- Made-up information for the Cannibal and Philosopher: anyone claiming one without its ability gave no information at all, even after executions. That's a good player with a cover story, one made mad by the Cerenovus, a mad Pixie, or a hiding Mutant or Damsel. Now, through `madGained()` in src/storyteller.js:
  - A made-up Cannibal works like an evil Cannibal bluffer's, but its information is random rather than helping evil. At each execution, every living good NPC notes whose ability they'd "eat", and as what: the character they heard the executee claim then (or, if they never heard one, an information character chosen once). Claiming the Cannibal, they say "I have Player 5's ability, since they were executed.", and make up that character's information from the next night (a first-night ability gives just that night's).
  - A made-up Philosopher "gains" a good information character on Night 1 (chosen once, so it never changes) and makes up its information from then on.
  - Never the Pixie: making up a Pixie's information would give them away.
- A hiding Mutant or Damsel never claims a Townsfolk nobody claims openly (the Pixie, the Virgin, the Fool; `neverHiddenAs`), nor does an evil player who keeps the Mutant or Damsel bluff.
- A working Spy bluffing the Amnesiac checked whether the truth gave a teammate away without knowing what the Amnesiac's information meant, so it let a neighbour count through that pointed at a teammate. It now checks it the way the town reads it.
- A Cannibal the Mezepheles turned evil bluffs the ability they last ate, from the night they ate it, so a first-night one (the Noble, the Librarian) gives its information that night. Before, they kept bluffing the first ability they ate and never got the first-night information, so they said "I have no stored information." (6 of 69 test Cannibals who'd eaten an information character). A Philosopher turned evil does the same.
- An evil Noble bluffer always names 3 players. In an 8-seat Legion game there are only 2 good players they can name (never you, and never a Demon, which every Legion is), so they name another Legion too (`falseNoble()` in src/storyteller.js). Before, they said "No information." With any other Demon, and in Legion games of 9 seats or more, they already named 3.

## New Script: Trust Redux

- New script: Trust Redux (scripts/Trust Redux_1_0_0.json), with 5 new characters. The others were already in the game.
- High Priestess: each night, learns which player the Storyteller believes she should talk to most ("High Priestess: talk to Player 5."). It's a living NPC worth talking to: an evil player, or a good player whose information is wrong or points at an evil one. When the Storyteller is helping evil (lean()), it's one who isn't worth it. Drunk or poisoned, she's sent to a good player who isn't worth it, and an evil bluffer names a teammate. An NPC High Priestess talks to that player first at dawn. You can be dealt her.
- Village Idiot: each night, chooses a player and learns their alignment ("Village Idiot: Player 4 is good."). Setup adds 0, 1 or 2 more (VILLAGE_IDIOT_EXTRAS) in other Townsfolk's places, and with more than 1, the Storyteller makes one of them drunk for the game (shown in the Grimoire). Good NPCs check their suspect first, then players they haven't checked. An evil bluffer "checks" the scapegoat and always lies. Several players claiming the Village Idiot isn't held against them as a double claim. You can be dealt it: you're woken to choose a player.
- Magician: on Night 1 the evil team is shown the Magician as one of its own, so evil NPCs treat them as a teammate (`fooledBy()` in src/strategy.js). The Demon never kills them (they're a "Minion"), and Minions don't poison, curse or frame them. A Minion backing up the Demon's claim backs up whichever of the 2 they think it is. Each evil NPC sees through it once they hear the Magician claim the Magician. NPC Magicians usually keep quiet behind a cover story (MAGICIAN_HIDE_CHANCE, 0.75) and come clean later, as other hiders do. You're never dealt the Magician (`notForHuman`).
- Mezepheles (simplified: no secret word): on Night 2 or 3 (MEZEPHELES_NIGHTS, set at random during setup), if the Mezepheles is alive, a random living good NPC becomes evil (never you, nor a twin). They learn it, and from then on play for the evil team: they know their teammates, and their information is made up to help evil. A drunk or poisoned Mezepheles fails, and has used its ability. The script sheet still shows the official ability text.
- Legion: most players are Legion (half the seats, rounded down, plus LEGION_MAJORITY), with no Minions. The rest are good: any mix of Townsfolk and Outsiders, as the rules allow. The number of Outsiders is random, from 0 to the standard count for the seats (12 seats: 0, 1 or 2 of the 5 good players; 10 and 13 seats: none), and which Outsiders are dealt is random too.
  - Bluffs: every Legion is told the same bluffs, half as many as there are Legion, rounded up (7 Legion: 4 bluffs). When the game has an Outsider, 1 of them is an Outsider (unless every Outsider that can be bluffed is in play), and the rest are Townsfolk. Legion claim the bluffs first. Once they're taken, the rest claim a Townsfolk no teammate claims, which may be in play. A Lunatic in a Legion game still gets 3 bluffs of their own, never one of the Legion's.
  - Strong Townsfolk: at least LEGION_STRONG_SHARE (0.6, rounded up) of the Townsfolk dealt are strong ones against Legion, when the script has them, and you're dealt one where possible. They're marked `vsLegion` in src/characters/catalog.js: those who learn who's good or evil (Village Idiot, Seamstress, Oracle, Noble, Empath, Chef, Fortune Teller, Dreamer, Artist, Savant, Fisherman), those who can win outright (Slayer, Mayor), and the Philosopher, who can gain any of them.
  - Each night*, the Storyteller chooses who dies (src/characters/demon/legion.js), steering for a final 3 of you, 1 good NPC and 1 Legion (see Legion Night Kills, above). It's never you, and never the last Legion. The Monk, Soldier, Mayor and the Exorcist work against it as against any Demon.
  - Executions fail if only evil voted: a vote with enough hands to mark the nominee, all of them evil, counts for nothing. The clock and the Public Log say "Execution failed" ("Player 10 nominated Player 6: 6 votes (5 needed); Execution failed."). That's public, so good NPCs know everyone who voted is evil (EVIDENCE_WEIGHT.failedExecution, 6), and say so when they nominate them.
  - An executed Legion dies and the game goes on while another lives (a dead Demon only ends the game when no other Demon lives).
  - Legion registers as a Minion too: to the Investigator, the Town Crier and the Clockmaker.
  - Legion NPCs vote to execute another Legion at LEGION_SACRIFICE_VOTE_CHANCE while more than 2 live: they're many, and good can't reach the votes alone.
- With Legion on the script, good NPCs are more cautious. On other scripts, they vote as before.
  - They vote for a nominee who isn't their suspect (nor your pick) only at LEGION_GOOD_VOTE_CHANCE (0.1): a good vote on a hunch could be the one an evil nomination needs.
  - What other players say counts LEGION_HEARSAY_FACTOR (0.3) of its usual weight, since most of them may be Legion.
- Jinxes (`JINXES` in src/data.js), checked against the official list. Only the first 2 are between characters on Trust Redux; the others pair a new character with one from another script, since any characters can share a game:
  - Magician & Legion: Legion don't learn the Magician, so they count them as Legion.
  - Magician & Marionette: while the Magician lives, the Demon never tells its Marionette who they are, and goes by the Marionette's claim like anyone else's.
  - Magician & Spy, Magician & Widow: the team never sees the Demon's or the Magician's character from the Grimoire.
  - Legion & Minstrel: an executed Legion registers as a Minion to the Minstrel at LEGION_MINSTREL_CHANCE. Everyone but the Minstrel and Legion is drunk, and the Minstrel learns it was Legion.
  - Pit-Hag & Village Idiot: listed, but it never arises, since the Pit-Hag only turns good players into Outsiders.
  - The Mezepheles and High Priestess have no jinxes.
- Mayor (bug fix, all scripts): an NPC Mayor now wins for their team with 3 alive and no execution: good, or evil if the Mezepheles turned them. Before, only a human Mayor could, and you're never dealt the Mayor, so it never happened.
- A player the Mezepheles turns evil is never the Demon's kill (they're on its team now). A Philosopher or Cannibal turned evil keeps bluffing the ability they really gained, instead of "gaining" another.
- The Lunatic is never shown Legion. The Lunatic lists their "Minions" with commas ("My Minions were Player 9, Player 10 and Player 12.").
- Public announcements (bug fixes, all scripts with the Cerenovus): a Pixie who gains their ability, or an evil player who fakes coming clean, on a day the Cerenovus made them mad, now keeps that claim when the madness ends. Before, they went back to their old claim at dusk, and the next dawn announced they "woke up as" it.

## Improvements: Evil Cannibal Bluffs

- An evil player bluffing the Cannibal now "gains" the executee's character as best they know it, so their made-up information matches what a real Cannibal would get (`eatenAs()` in src/characters/townsfolk/cannibal.js): a good executee's real character if they've seen it in the Grimoire (a working Spy, or the Widow, who saw it on Night 1); a teammate's bluff, as a real Cannibal eating an evil player is told; else the character they heard the executee claim. Only with none of these do they pick any good character, as before. (Before, a Spy or Widow went by the claim too, and a teammate's bluff was only used if they'd heard it.)

## Bug Fixes: Barber, Popups & Philosopher

- You're never dealt the Barber (`notForHuman`): its ability is the Demon's choice, not yours. (The Pit-Hag and the Barber's swap already never picked you.)
- Popups: every one now closes when you press anywhere. The role counts popup (the "i" by the town square) closes on any press, not only its own button. The menu closes on any press but its − and + buttons. The "Start nominations?" popup counts a press anywhere but its buttons as Keep talking. Escape closes the menu and role counts too. (The script, role and dawn / dusk popups already did.)
- You can be dealt the Philosopher. Once per game, the Storyteller wakes you to choose a good character on the script (not one you can't be dealt), or skip until another night. You gain its ability at once (a player who has it is drunk from now on), so a night ability you gain wakes you again that night: choose the Fortune Teller and you then choose your 2 players. A first-night ability you gain (the Chef, the Investigator...) gives its information that night, and so does one an NPC Philosopher gains after Night 1 (`philosopherGain()`, `gainedNight`).

## Bug Fix: No Dashii & Vigormortis Poison

- No Dashii: its 2 Townsfolk neighbours are the nearest Townsfolk on each side, alive or dead, as the official rules have it. A dead Townsfolk keeps the poison; it no longer passes on to the next living Townsfolk beyond them. (Outsiders, Minions and the Demon are still skipped.)
- Vigormortis: the same for the Townsfolk neighbour a killed Minion poisons: it can be a dead one, and never a living Townsfolk behind them.

## New Feature: Night Order

- Script sheet: a **Night order** button (with a crescent moon) in the top corner of the script popup, which stays there as the script scrolls. Pressing it shows the script's night order: who the Storyteller wakes on the first night and on other nights, in the official order, numbered, with a reminder of what each does, and the Dusk, Minion info, Demon info and Dawn steps. Only the script's characters are listed; characters who don't wake at night are left out. The button then reads **Characters**, to go back. Pressing anywhere else still closes the popup.
- The order and reminders are in src/characters/nightorder.js (`FIRST_NIGHT`, `OTHER_NIGHTS`, `nightOrder()`), for every character the game has.

## Bug Fixes: Madness, Ravenkeeper, Evil Votes & Bluffs, Amnesiac, Death Shroud

- Cerenovus madness in the debug log: the Player states Claims column shows it ("Fortune Teller (mad as Ravenkeeper)"). Before, a mad claim never showed (madness starts at dawn and ends at dusk, between tables), except at Game Over, where it looked like a real claim.
- When a player's madness ends, they explain it ("Yesterday the Cerenovus made me mad as the Savant, I am actually the Balloonist."), dead or alive: in public if they had claimed in public, else to everyone they told in private, you included (in your Public log). Their changed story then counts as much as a cover story they came clean about (changedStoryCleared), and so does anyone passing on the mad claim. Before, only a living player who'd claimed in public explained, so a good player made mad was suspected for the rest of the game.
- A player killed the night they're made mad as the Ravenkeeper comes clean at dawn, in public, with their character (or an evil player's bluff): "The Cerenovus made me mad as the Ravenkeeper last night, but I was killed. I am actually the Fortune Teller." The madness ends there. Before, they claimed the Ravenkeeper all day with "I have no stored information."
- A player who dies at night claiming the Ravenkeeper (the real one, or an evil bluffer) says so in public at dawn, with the character they learned, in any size of game ("Player 5 says: "I am the Ravenkeeper. Night 2: Player 3 is Gambler.""). Before, it only came out at 12+ seats, at PUBLIC_INFO_CHANCE.
- Evil votes: an evil NPC no longer votes for a teammate when their vote would tie the player already marked (so nobody is marked). Before, the Imp could vote for themself to a tie and save the player the evil team was framing.
- The Lunatic counts themself on their imagined team, so they never vote to execute themself.
- An evil Grandmother bluffer names their grandchild as the character that player claims. Before, it was a random good character, which contradicted their own teammate's claim.
- An evil Savant bluffer's statements are made up at random, each true or false, but never one that hurts their team (`savantBluff()`). A teammate is only ever "good", or the character they claim; only a good player is ever "evil", and the evil team's scapegoat is never "good"; a character named is never an evil one in play; the Demon is only ever misplaced, and never put next to a teammate; the Outsider count is only true when no Minion changed it. No statement is ever repeated, nor the same kind of statement about the same player, and a day's two are about different things. Before, both were always false, which you could catch.
- The Lunatic claims one of their bluffs that nobody is and nobody claims, when there is one. Before, they often double-claimed with the Demon (or a real good player).
- Amnesiac guesses: the Storyteller now answers BINGO (right), HOT (wrong, but the information looks the same; was "close"), WARM (it looks different, but it's about the same thing: neighbours, the Demon, or who is good or evil) or COLD (was "not close"), for you and the NPCs.
- Amnesiac conversations: an NPC says what they guessed or asked, with the Storyteller's answer on its own line ("Day 1: I guessed my ability is "…"" / "And I got: HOT."; "I asked the Storyteller "Is my ability about the Demon?"" / "And I got: NO."). An evil NPC (or the Lunatic) bluffing the Amnesiac now makes daily guesses too, so they have the same to tell.
- Death shroud: smaller (40% of the seat's width, was 54px on a 92px seat), in proportion to the seat at any size.

## Fixes: Round Robin Log, Dreamer Bluffs, Evil Twin & Widow

- Round Robin: the Public Log shows it as one entry, in seat order, from the "Round Robin:" line to the last seat. (Before, each player was a separate line, so the newest-first log showed it backwards, with the "Round Robin:" line last.)
- An evil player bluffing the Dreamer (or a Philosopher who "gained" it) no longer reuses a drunk Dreamer's lie, which contradicted every claim it named. Each dream is now the character the player claims, or an evil character nobody is in play as or claims. It never gives away the evil team's characters, and dreaming the same player again gives the same pair while that player's claim stands.
- An Evil Twin whose good twin is you says "You are my Evil Twin." (not "You is my Evil Twin.").
- The Widow: a Widow already couldn't poison herself (the engine drops that pick), but when you were the Widow (made one by the Pit-Hag), the pick made for you could be you, and then nobody was poisoned. It now never picks the Widow.

## New Features: Amnesiac Abilities & Guessing

- Amnesiac: 3 more secret abilities, so the Storyteller picks from 6 (AMNESIAC_ABILITIES in src/characters/townsfolk/amnesiac.js): if either alive neighbour is the Demon (YES / NO), how many alive neighbours are evil, and how many pairs of evil players sit next to each other (both "Amnesiac number: 1."). Drunk or poisoned, each gives a wrong answer like the Empath's and Chef's do. Once an NPC Amnesiac knows their ability, a YES about the Demon or a non-zero neighbour count makes them suspect their neighbours.
- Amnesiac guesses: 12 to choose from, 3 of each kind of information (YES or NO, a player, 2 players, a number). New decoys: the Demon voted today, a player who isn't the Demon, 2 players 1 of which is the Demon, how many steps the Demon is from you.
- Amnesiac questions: instead of guessing, you can ask the Storyteller one yes/no question a day about your ability ("Is my ability about who is good or evil?", "…about the Demon?", "…about my neighbours?"). The answer is always true.
- The dropdown is gone. The Amnesiac panel shows the questions, then the guesses as buttons grouped by kind. The group that looks like your latest information is open and marked "like your information"; the others fold under "Other kinds of information". Questions and guesses you've made stay on the panel, greyed out, with the Storyteller's answer. The panel is gone once you've guessed right.

## Code Maintenance

- src/data.js is organised into sections, each with a header: Characters; Setup: seats and dealing; Jinxes; The Storyteller; Information; Bluffs and cover stories; Suspicion and evidence; Nominations and voting; The Demon's kill; Character abilities; Timings and display; Debugging. No setting changed, only where it sits.
- The character catalogue (`CHARACTERS`, `TRAVELLERS`) moved from src/data.js to src/characters/catalog.js. data.js re-exports it, so nothing that imports it changed.
- src/data.js comments are shorter: no comment runs past 6 lines. Each setting's detail sits on its own line, and each jinx notes where it's handled, next to its entry in JINXES (instead of a list above them). No setting changed.

## New Features: Damsel Guess Timing, Logging, Boomdandy Countdown Timer & Round Robin Death Shroud & Jinxes

- Death shroud: a dead player's seat has the death shroud (images/death-shroud.png) hanging from the top of it for the rest of the game, behind the text, so you can still read what they claimed. The text in front gets a dark shadow. (serve.js now serves .png files.)
- Jinxes: every jinx from the Djinn between characters the game has is now listed (JINXES in src/data.js) and handled. The 11 new ones:
  - Mathematician & Lunatic: the Lunatic counts on a night they "attack" a player the Demon didn't choose.
  - Mathematician & Chambermaid: the Mathematician already wakes before the Chambermaid learns who woke, so she can detect them.
  - Cannibal & Butler: a Cannibal who gains the Butler ability learns it ("You now have the ability of Player 4, who was executed: the Butler.").
  - Cannibal & Juggler: a Juggler executed on the day they juggled leaves their count to the living Cannibal that night ("Cannibal: 2 of Player 4's 3 guesses were correct.").
  - Recluse & Ogre: an Ogre who chooses the Recluse becomes evil and knows it. Spy & Ogre: an Ogre who chooses the Spy becomes evil.
  - Recluse & Sage: at RECLUSE_SAGE_CHANCE (50%) a Demon-killed Sage is shown the Recluse in the Demon's place.
  - Mastermind & Vigormortis: a Mastermind the Vigormortis killed keeps their ability when the Vigormortis dies, so executing the Vigormortis gives the Mastermind's extra day.
  - Pit-Hag & Goon: a Goon the Pit-Hag made from an evil player never turns good. Pit-Hag & Ogre: an Ogre only chooses on Night 1, before the Pit-Hag acts, so one the Pit-Hag makes never turns good.
  - Scarlet Woman & Fang Gu: a Fang Gu that jumps never makes the Scarlet Woman a second Demon (it never did).
- Mathematician & Marionette (and Drunk): the Mathematician now also counts a Marionette or Drunk whose pretend ability failed on a night they woke to choose (a Monk, Innkeeper, Sailor...), not only one who got information.
- Ravenkeeper: never chooses you (good or evil).
- Cannibal & Pixie: a Cannibal who eats the Pixie now learns an in-play Townsfolk that night ("Pixie: the Chef is in play."), like any other first-night ability they gain. Before, they learned nothing.
- Voting: your hand starts lowered, and one button under the clock raises or lowers it ("✋ Raise hand" / "Lower hand"). You can press it in the few seconds before the count (HAND_WAIT_MS) and as the votes are counted, while the clock hand ticks round, until it reaches your seat and counts your vote (then the button goes). The NPCs decide when the count starts, seeing your hand as it is then (engine `openVote()`), and their votes stand. Your vote is cast as the clock hand reaches you.
- Barber: the Demon's swap now helps evil (strategy barber(), BARBER_* in src/data.js). Judging by what players claim, it values each character's ability to good (by kill priority; Outsiders count against good; a spent once-per-game ability counts for half) and weighs each player by how much the town believes them (more if confirmed, less for each good NPC who suspects them or as the scapegoat). It swaps the 2 good NPCs whose swap moves the most ability off believed players onto doubted ones, counting it against a swap that gives good a "start knowing" ability. With nothing worth BARBER_MIN_GAIN, it swaps nobody. The log says why ("(why: Player 6 (claims the Sweetheart, believed 0.75) and Player 8 (claims the Savant, believed 1): evil gains 1)").
- First-night abilities start the night someone gains them: eaten by the Cannibal, swapped in by the Barber, or made by the Pit-Hag (`startsTonight()`, from `p.gainedNight`). "Start knowing" information (Chef, Washerwoman, Pixie...) comes that night. A new Widow looks at the Grimoire and poisons, a new Godfather learns the Outsiders, a new Ogre chooses, and a Puzzlemaster's puzzle starts if there wasn't one. Before, players swapped by the Barber or made by the Pit-Hag never used them.
- You're never dealt the Drunk (`notForHuman`); HUMAN_DRUNK_CHANCE is gone. You can still be made drunk (Sailor, Courtier, Puzzlemaster...) or poisoned.
- Ravenkeeper bluff: an evil Ravenkeeper bluffer who dies at night still names the Storyteller's scapegoat as an evil character (false information; only a Spy's is true). With no scapegoat, they now never name a teammate, whose made-up character could have given them away.
- Round Robin: a button under the nomination buttons, shown once nominations are open with ROUND_ROBIN_ALIVE (4, in src/data.js) or fewer players alive. It can be used once per game; after that it stays, disabled, for the rest of the game. When pressed, every player, living or dead, from Seat 1, says their character and information in public, on a 🔄 Round Robin card and in the Public log.
- You go first, with your claim and everything you've learned (as Share My Info does). You're always good, so the NPCs weigh what you share like anything else said in public. Good NPCs tell the truth, and one with a cover story comes clean. A living Damsel keeps to her bluff, and so do evil NPCs (counted in "Who lied to you").
- NPC Minions don't guess the Damsel before DAMSEL_GUESS_FROM_DAY (Day 3, in src/data.js), even one they've found out. The exception: when their Demon is marked for execution and you press End day, one Minion who hasn't guessed yet guesses first, whatever the day. It's a last chance, so they always guess their best candidate, skipping the chances. If they're right, evil wins and the execution doesn't happen ("(why: their Demon, Player 6, is about to be executed (a last chance): they said they're the Damsel)").
- The Storyteller log says why an NPC Minion guessed a player is the Damsel ("Player 4 (Baron) guessed Player 3 (Chef) is the Damsel (why: they claim the Chef, one of the Demon's bluffs, so not in play: they may be hiding (1 of 2); a 50% chance): wrong."). The reasons are: a teammate bluffing the Huntsman was told it in private; they said they're the Damsel; they claim one of the Demon's bluffs; or a late guess at a player claiming an Outsider, else anyone not confirmed. It also says how many players they chose from and the chance that made them guess. The strategy notes the reason in `p.damselWhy`, as `p.killWhy` does for the Demon.
- The same for an NPC Huntsman's choice (`p.huntsmanWhy`): "Player 2 (Huntsman) chose Player 3 (why: they said they're the Damsel), the Damsel." Otherwise it's a guess at a player they don't trust, suspect or know about, with what that player claims.
- Boomdandy: the countdown is now a real one. When the Boomdandy is executed, you have BOOM_WAIT_MS (10 seconds, in src/data.js) to select one of the living players. The seconds count down in the countdown's panel, and you can change your pick until it runs out. Then everyone points, and the one with the most players pointing at them dies (on a tie, nobody does). If you haven't selected anyone, you don't point ("You don't point; Player 2 points at Player 7; …"). The "Point at them" button is gone. The countdown pauses while a dawn / dusk card is up.

## New Script: Extension Cord

- New script: Extension Cord (scripts/Extension Cord_5_1_0.json), with 5 new characters and the Sentinel Fabled. Its 5 Travellers (Bishop, Bone Collector, Bureaucrat, Butcher, Matron) are left out, as before.
- The extension cord: the No Dashii poisons its nearest Townsfolk on each side, so a Minion or Outsider between them pushes the poison along. Seating stays random, but a Marionette next to the No Dashii sits on whichever side leaves its two poisoned Townsfolk furthest away (`marionetteSeat()` in src/setup.js). With any other Demon, the Marionette still just sits next to it.
- Fabled (`team: "fabled"` in src/data.js, `FABLED`): a script's Storyteller rules, never dealt. They're kept apart from the script's characters (`s.script.fabled`) and listed on the script sheet. The Sentinel deals 1 fewer, the same or 1 more Outsider.
- Fisherman: once per game, by day, visits the Storyteller for advice: one true tip, never about you: a player is evil, the Demon is one of 3 players, or a player is good, so don't execute them ("Fisherman: the Storyteller's advice: Player 3 is evil."). You visit with "Ask the Storyteller for advice". NPCs visit from Day 1 (ONCE_PER_GAME); bluffers make up false tips.
- Huntsman: once per game, at night, chooses a living player: the Damsel, if chosen, becomes a Townsfolk that isn't in play. Deals the Damsel (in an Outsider's place, or a Townsfolk's with no Outsiders). You choose at night, or skip. NPC Huntsmen choose at once a player who told them they're the Damsel; otherwise they wait (from Night 3, rising), then guess. A Damsel the Huntsman found says so in public at dawn ("I was the Damsel, hiding as the Chef. The Huntsman chose me last night, and I woke up as the Artist."): the Minions stop guessing, and the town counts it for her and for whoever publicly claims the Huntsman (confirmedMaybe).
- Puzzlemaster: on Night 1 the Storyteller makes 1 player drunk for the rest of the game, even once the Puzzlemaster dies (never the Puzzlemaster or the Demon). Once, by day, the Puzzlemaster guesses who: right, they learn the Demon; wrong, a player who isn't ("Puzzlemaster: guessed Player 4 is drunk; the Demon is Player 9."). You guess by selecting a player and pressing "Guess they're the puzzle's drunk".
- Damsel: never dealt to you (`notForHuman`). She hides until she dies. An NPC Damsel claims a Townsfolk instead, then admits it once dead (`HIDDEN_OUTSIDERS` in src/data.js). She only knows her own character, so it's any Townsfolk on the script, which may be in play (a double claim); one made the Damsel later (by the Pit-Hag or Barber) keeps the Townsfolk she was claiming, so nothing gives her away. The one exception: she and the Huntsman look for each other. She tells, in private, a player who claims the Huntsman to her (you included) and whom she doesn't suspect, and good players never pass that on.
- The Minions learn on Night 1 that a Damsel is in play and hunt for her: each Minion guesses once, in public, at dawn (one a dawn for the team). They guess:
  - at once, a player who told a teammate bluffing the Huntsman that she's the Damsel;
  - at DAMSEL_CLAIM_CHANCE, a player who says they're the Damsel (it may be a decoy);
  - at DAMSEL_HIDER_CHANCE, a player claiming one of the Demon's bluffs (which the Minions know aren't in play);
  - and, with DAMSEL_GUESS_ALIVE or fewer alive, at DAMSEL_GUESS_CHANCE, anyone.
  A right guess wins for evil. A wrong one gives the Minion away: good NPCs count it against them (EVIDENCE_WEIGHT.damselGuess, 6).
- Damsel decoys: with the Damsel on the script, a good NPC may claim the Damsel as a cover story (DAMSEL_DECOY_CHANCE; at most one at a time; never a "high" character, who hides instead), so a Minion wastes its guess on them and gives itself away. They tell a Huntsman the truth, so the Huntsman isn't wasted, and come clean like any cover story ("I said I was the Damsel to draw a Minion's guess").
- Evil bluffs: the new characters can be bluffed, with made-up information: a Fisherman bluffer's false tip (framing the scapegoat, or vouching for a teammate), a Puzzlemaster bluffer's false "Demon", a Huntsman bluffer's invented choice. With the Damsel dealt, a Minion who knows the Demon's bluffs takes the Huntsman if it's one of them, to fish for her, and keeps what she tells them for the team's guess. A Damsel bluffer hides as a Townsfolk, with that Townsfolk's bluffed information. The team knows there's no Damsel, so it never guesses.
- Mutant and Damsel bluffs: the evil team only knows its 3 bluffs are out of play, and neither of these can be claimed openly. An evil player who gets one keeps it at HIDDEN_BLUFF_CHANCE (0.25), hiding behind a Townsfolk that might be in play; otherwise they take another of the bluffs, or with none free, bluff a Townsfolk that might be in play. A team with a Spy or Widow has seen the Grimoire, so it hides behind a Townsfolk that isn't in play. Either way, a Mutant or Damsel bluffer says so in public when they die, by execution or at night ("Player 4 reveals they were the Damsel."), just as the real ones do. (Before, they always hid behind a Townsfolk that wasn't in play, as if they knew.)
- Bluffs: when every one of the Demon's bluffs is taken by a teammate, a Minion now bluffs a Townsfolk that might be in play, instead of doubling up on a teammate's claim.
- Mutant: like the Damsel, they only know their own character, so they claim any Townsfolk on the script (which may be in play), not one that isn't. One made the Mutant later (Pit-Hag, Barber) keeps the Townsfolk they were claiming.
- Boomdandy: they and the evil team want them executed. From BOOMDANDY_FROM_DAY (Day 2), while less than BOOMDANDY_HEAT of the good NPCs suspect the Demon, an evil NPC nominates the Boomdandy (with a made-up reason), and evil NPCs vote for them at BOOMDANDY_VOTE_CHANCE (the Boomdandy too). With the Demon under suspicion, nobody evil nominates them, and they vote at BOOMDANDY_HOT_VOTE_CHANCE.
- Boomdandy: when executed, all but 3 players die: you (if alive), the Demon and one more, chosen by the Storyteller's lean. Then a 10-to-1 countdown waits for you: select a living player and press "Point at them". Every player, living or dead, points (good NPCs at their suspect, evil ones at a good player, never at you). The one with the most pointing at them dies; on a tie, nobody does.
- Jinxes (`JINXES` in src/data.js, from the Djinn), listed on the script sheet when both characters are on it:
  - Spy or Widow & Damsel: if the Spy (or Widow) is or has been in play, the Damsel is poisoned. The Minions know, so they don't guess.
  - Marionette & Huntsman: the Marionette is never shown the Huntsman unless the Damsel is in play.
  - Marionette & Balloonist: an Outsider "might" have been added (no change needed).
  - Pit-Hag & Damsel: if the Pit-Hag makes a Damsel, the Storyteller chooses which good player it is, and the Minions learn she's in play.
  - Mathematician & Drunk or Marionette: their false information counts towards the Mathematician's number.
  - The Djinn's other 12 jinxes (Cannibal & Butler, Recluse & Sage...) only involve older characters, so aren't handled yet.

## UI Fix: Nomination Buttons

- Once nominations have started, the nomination buttons (Nominate, Request nomination, NPC nominations) are always shown, whether or not a player is selected. They're now just below End day. Before, they were in the selected-player panel, so they vanished when nobody was selected. Nominate and Request nomination are disabled until you select a player; NPC nominations is disabled while no NPC wants to nominate. (Nominate is still hidden once you're dead: you can only request nominations.)
- When the game is over, the Storyteller section collapses, as the Public log does (click its title to open it). It's now a collapsible panel like the Public log.
- Disabled buttons now look it (faded, with no pointer), everywhere: before, a button you couldn't press looked just like one you could.

## New Script: Catfishing

- New script: Catfishing (scripts/Catfishing_11_1_1.json), with 3 new characters. Its 5 Travellers (Apprentice, Barista, Beggar, Bone Collector, Harlot) are left out: Travellers aren't supported, so any script's Travellers are skipped when it loads (`TRAVELLERS` in src/data.js).
- Balloonist: each night, learns a player of a different character type (Townsfolk, Outsider, Minion, Demon) from last night's ("Balloonist: shown Player 4."). A working Balloonist sees each type in play once, in random order, then starts again with another random order. A misinformed one is shown a player of the same type. An evil Balloonist bluffer goes by what players claim, so the players they name have a different claimed type each night and their story holds up. Deals 0 or 1 extra Outsider.
- Widow: on Night 1 she looks at the Grimoire and poisons a good player (never herself; you at HUMAN_POISON_CHANCE), who stays poisoned while she's alive with her ability. Like the Spy, the Grimoire tells the evil team every character, so the Demon picks its kills by them, but only as they were on Night 1: a character changed since (the Pit-Hag, say) isn't seen. A good player learns "Widow: a Widow is in play." on Night 1, and when the Pit-Hag makes a Widow.
- Amnesiac: the Storyteller gives them one of 3 secret abilities (AMNESIAC_ABILITIES in src/characters/townsfolk/amnesiac.js): each night they learn if either alive neighbour is evil, a good player, or 2 players of which exactly 1 is evil, said without saying which ("Amnesiac: YES.", "Amnesiac: Player 5."). Each day they may guess their ability from 6 (AMNESIAC_GUESSES), and learn if it's correct, close (information that looks the same) or not close. You guess with the "Guess my ability" button. NPC Amnesiacs guess each morning until they're right; until then, their information doesn't make them trust or suspect anyone.
- NPCs say a Balloonist's information as "I was shown Player 4."

## Bug Fixes & New Features: Gambler, Failed Abilities Said in Public, Cover Story Information, Courtier Countdown, Log Names

- Gambler: NPC Gamblers no longer throw their lives away. Before, a Gambler who had heard no claims guessed a random character from the whole script (often an evil one, for a good player), so most died on Night 2. Now they test a claim they've heard; at GAMBLER_WILD_GUESS_CHANCE they follow a hunch instead (their suspect is a Demon or Minion on the script); with nothing to go on, they guess themselves, which is safe ("I guessed myself, to be safe."). Gambler bluffers and cover stories guess the same way.
- Gambler: one who dies because a claim was a lie says so in public ("…, and died. Player 4 claimed to be the Sailor, so they lied."), and the town weighs that player's word the other way round, as for the Professor. A dead Gambler now names that player as their suspect ("Who I suspect"); before, it could be someone else. log.txt no longer says a Gambler "died" when the Tea Lady (say) saved them, and says why they guessed. A guess about you reads "guessed you are the …".
- Moonchild: when the Moonchild's (or a Moonchild bluffer's) pick is still alive the morning after the curse, they say so in public ("As the Moonchild I chose Player 11, and they didn't die."), and good NPCs count it against that player. The Monk's protection no longer stops the curse (it only protects from the Demon).
- Professor: a Professor whose choice stayed dead without having claimed a Townsfolk now says so in public too ("…, and they didn't come back.").
- Cover stories: good NPCs hiding as another character now give made-up information for it, as baiters do (a hiding Gambler's guesses, a hiding Sailor's or Exorcist's choices…). Evil bluffers, "mad" players and cover stories now share the same made-up choices for every character who chooses at night (Monk, Snake Charmer, Chambermaid, Sailor, Exorcist, Innkeeper, Butler, Gambler).
- Courtier: a Courtier who has chosen (or says they have) counts down how long their choice is drunk: "My choice, the Pukka, is drunk for 2 more nights and 3 more days (counting today).", then "… is no longer drunk."
- Exorcist: the Exorcist (and an Exorcist bluffer, such as the Lunatic) never chooses you.
- Coming clean: each sentence is on its own line.
- Several players in one sentence are in seat order where the order means nothing: "One of Player 3 and Player 7 is the …" (which also no longer gives away which is real), the Chambermaid, Seamstress, Fortune Teller, Noble, Innkeeper, Courtier and Lunatic lists.
- log.txt: the Demon's kills say why it chose that player ("why: "high" priority (it heard they're the Chambermaid): 1 of 2 at that level, on its 75% chance"; following the Lunatic; going after a protector or the Exorcist; covering for the Spy; star-passing), and "attack the attack failed" now reads "the attack failed".
- log.txt: the Storyteller's chosen deaths (the Pit-Hag's random death, the Gossip's, the Mayor's bounce, the Tinker) say why: the Storyteller's lean and how many players it chose from.
- log.txt: players are named by their character, with their claim in brackets when it's different ("Assassin (Gossip)", "Chambermaid (Gambler)" while hiding), as it was at the time. You stay "You"; two players with the same character get their seat added. The Player States tables and the Setup's list of who sits where still use seats.
- log.txt: "[talks]" lists who each player talked to, one per line.

## New Feature: Characters From Any Script

- Characters no longer belong to a script, so a custom script can mix characters from Trouble Brewing, Sects & Violets, Bad Moon Rising and Onion Pies (say, the Imp with a Sailor, a Pixie and a Witch). A script is still just a list of character ids in `scripts/`.
- Each character's mechanics now have their own file in `src/characters/`, filed by team: `townsfolk/`, `outsider/`, `minion/` and `demon/` (49 characters; those that only need information or NPC choices live in storyteller.js and strategy.js as before). Mechanics several characters share (waking, protection, coming back to life, madness, claims) are in `src/abilities.js`. `src/sects.js`, `src/bmr.js` and `src/onion.js` are gone, and so are the Poisoner, Monk, Butler, Gambler, Devil's Advocate, Assassin, Moonchild, Artist, Fool, Grandmother, Virgin and Slayer code in engine.js.
- The engine's night order calls each character in turn, rather than one step per script ("Bad Moon Rising at dusk", "Sects & Violets at dawn"...). The order is unchanged.
- `src/data.js`: each character has one record in `CHARACTERS` with everything about it: name, team, ability text, and its settings (`kill` priority, `info`, `outsiders`, `oncePerGame`, `publicInfo`, `bait`, `neverHides`, `neverHiddenAs`, `protects`, `notForHuman`). The old tables (`ROLES`, `ABILITIES`, `DEMON_KILL_PRIORITY`, `FORBIDDEN_HUMAN`...) are built from it, with the same values as before.
- A new test plays 80 whole games on random scripts mixing characters from every edition.

## Bug Fix & New Feature: Abilities Seen to Work or Fail

- A confirmed Virgin was still suspected. When a Townsfolk nominates a working Virgin and is executed, the town now knows the Virgin is real, so good. Before, nothing recorded it: the evil team went on framing them, and good NPCs believed the accusations. Now they're confirmed good: good NPCs trust them (EVIDENCE_WEIGHT.confirmedGood, -6, in src/data.js), never suspect them, and say so ("Who I trust"); the evil team stops framing them (a new scapegoat, and no accusations from evil NPCs while there's anyone else to accuse). log.txt says "[confirmed]".
- Levels of confirmed: other abilities seen to work count for the player too, by how sure the town can be (log.txt says how sure):
  - certain (confirmedGood, -6): the Virgin, above; a Slayer whose shot killed a player;
  - near certain (confirmedLikely, -4): a Professor whose choice came back to life (a Shabaloth also brings players back). The Professor now says so the next morning ('As the Professor I chose Player 5, and they came back.');
  - partly (confirmedMaybe, -2): a claimed Fool or Sailor executed who doesn't die, a claimed Pacifist when any execution doesn't kill, a claimed Tea Lady (and her neighbour) when her neighbour survives execution, a Moonchild whose pick dies that night, a Gossip whose statement is followed by an extra death. (A Devil's Advocate, or a Demon kill, could explain each.)
  - Only "certain" and "near certain" players are trusted outright, never suspected and never framed. They also top the Demon's kill list (a new "top" level in KILL_PRIORITY_CHANCE, 0.9, above "high"): the evil team can't frame them, so it kills them.
- Abilities seen to fail count against the player (abilityFailed, 1.5), and log.txt says "[failed]":
  - a player claiming the Virgin is nominated for the first time by a player claiming a Townsfolk (both in public), and nothing happens: one of them is lying, so it counts against both;
  - a Monk or Innkeeper said they protected a player the Demon killed that night (to an NPC who heard it).
- No longer counted as evidence (removed from EVIDENCE_WEIGHT): a player who accused or trusted someone, then died in the night (accusedByNightDeath, trustedByNightDeath); nominating or voting for a player I trust (nominatedTrusted, votedTrusted). What a player said before dying in the night now counts like anyone else's word.
- Abilities left unused count a little (abilityUnused, 0.5): a claimed Slayer who still hasn't shot from Day 4 (two days after a real one starts), or a claimed Juggler who never juggled on Day 1.

## Bug Fixes & New Features: NPC Nomination Button, Who I Trust or Suspect, Clues in the Log, Pixie Bluffs

- NPC nominations button: NPCs never nominate by themselves. Once nominations have started, "NPC nominations X" (next to Nominate and Request nomination) shows how many NPCs want to nominate. Each press runs one NPC nomination: the strongest case first, with their reason on the card, and the vote. Then X updates to how many still want to (counted when nominations open and after every vote).
- Who I trust or suspect: an NPC's answer now ends with one line instead of their opinion and "What others have told me": either "Who I trust: ..." or "Who I suspect: ... (their strongest reason)", whichever they feel more strongly about, or "Who I trust or suspect: I have nothing." It names their top player, and any others they feel as strongly about, or strongly (3 or more): an Empath's 0, say, vouches for both neighbours. They trust players their own information vouches for, or with evidence of TRUST_EVIDENCE (-1, in src/data.js) or less for them; they suspect players with EVIDENCE_TO_SUSPECT (1) or more against them. A hidden hunch (no evidence) isn't mentioned. Evil NPCs never name a teammate as a suspect, and always name the scapegoat. A hider gives names without reasons. Claims passed between NPCs (and evil NPCs' lies in them) still work as before, but are no longer passed on to you.
- log.txt: each conversation is followed by the NPC's workings ("[workings]"): every living NPC's evidence score from their point of view, whether they trust or suspect them, and why.
- log.txt: under each player table, "Clues to the evil team": tonight's true information (a good player's) that points at an evil player, each evil player claiming a character a good player really has (or thinks they have), and each lie an evil NPC told you since the last table.
- Pixie bluffers: an evil player bluffing the Pixie now acts like a real Pixie. They "learn" a Townsfolk on Night 1, and from Day 1 they claim it, mad about it, rather than claiming the Pixie (which a real Pixie never does). When someone they know as that character dies, they say they were the Pixie and now have its ability; if they die first, they reveal they were the Pixie and what they were mad about.

## Bug Fixes: NPC Nominations, Bluffers, Cannibal & Pixie Claims, "You's"

- NPC nominations only happen once nominations have started. Before, if you used your last conversation and the day ended within the 2-second delay before nominations opened by themselves (say, a Virgin execution), they opened on the next day, so NPCs nominated before you'd talked to anyone. Nominations no longer open by themselves (see Start Nominations, below), and the engine refuses NPC nominations until they've started.
- Start Nominations: nominations wait for you. When you're done talking, press Start Nominations (next to where End day was): if you could still talk to someone, it asks first ("Start nominations? You won't be able to talk to any more players today."). Then the "⚖️ Nominations" card shows, and Nominate, Request nomination, NPC nominations and End day appear. Before, nominations opened by themselves 2 seconds after your last conversation, or when you pressed Nominate, Request nomination or End day.
- Cannibal bluffers: an evil player bluffing the Cannibal now "gains" the executee's ability too (the good character they claimed, as far as the bluffer knows; else any good one), and makes up information for it from that night, a first-night ability the night after, like a real Cannibal. Before, they never had any information after an execution. A Cannibal (real or bluffing) also says whose ability they have ("I have Player 7's ability, since they were executed.").
- Pixie:
  - A mad Pixie who dies before gaining the ability says so in public: "Player 9 reveals they were the Pixie, mad about being the Fortune Teller." Before, they went on claiming the character (next to their real Pixie information) after death.
  - A mad Pixie who gains the ability (its holder died) says so in public, at once, or at dawn if it happened at night: 'Player 9 says: "I was the Pixie, mad about being the Fortune Teller. I now have the Fortune Teller ability."' They claim the Pixie from then on.
  - With a Pixie on the script, two players claiming the same Townsfolk may just be a mad Pixie, so it counts for PIXIE_DOUBLE_CLAIM_FACTOR (0.4, in src/data.js) of the usual weight, and the reason says "(a Pixie could explain it)". A mad Pixie no longer holds it against the real one: they know they're out there.
- log.txt: lines about you say "Your false information..." and "your Sailor choice", not "You's".
- Bluffers who aren't evil now use the character they claim, too: the Lunatic, and a mad Pixie (claiming a Townsfolk that's in play). Before, only evil bluffers did. That's a Slayer shot, an Artist's question, a Gossip statement, a Savant's visit, a Juggler's guesses, a Moonchild's or Klutz's choice, and a Sage's pair, all with no effect and with made-up information (see bluffing() in src/storyteller.js). A mad Pixie claiming the Slayer, say, now shoots like one would.

## New Features: NPC Nominations, Telling NPCs, Second-Hand Claims, Who Lied to You

- Nominations open once a day, with a "⚖️ Nominations" card ("Nominations are open."). Opening them while you could still talk to someone asks first: "Start nominations? You won't be able to talk to any more players today." (Start nominations / Keep talking). Once they're open, there are no more conversations that day.
- NPC nominations: once nominations open (and after each vote), an NPC whose suspect has at least NPC_NOMINATE_EVIDENCE (3) evidence against them nominates them, strongest case first, saying why on the card before the vote ('Player 2 nominates Player 6: "My information points at them; Player 3's information points at them."'). At most half the living players (rounded down) a day, each NPC once, never you. You vote on them like any other nomination (your hand, the Lower hand countdown).
- Conversations: once you ask an NPC, the Ask button goes, and their answer ends with two buttons. Share My Info tells them, in private, your character and what you've learned (once a day per NPC, before nominations open): good NPCs weigh it like anything else they're told, and pass your claim on. Leave conversation ends it. Nominate and Request nomination now have their own row at the bottom, under your Good / Evil mark.
- Second-hand claims: when NPCs talk, each also passes on what everyone else told them, which evil NPCs distort as they do to you. NPCs use second-hand claims for who to kill, protect or guess when they've heard nothing first-hand, but don't weigh them as evidence. A second-hand claim that doesn't match what that player told them counts against both the player (EVIDENCE_WEIGHT.heardOtherwise, 0.5) and whoever passed it on (passedOnOtherwise, 0.5), unless it was a cover story they've since come clean about.
- Final reveal: "Who lied to you" lists every lie an NPC told you, by day, with the truth: bluffs, cover stories (hiding or baiting), distorted passed-on claims, and fake comings-clean.

## New Features: Cover Stories, Coming Clean, Distorted Gossip

- Cover stories: on Day 1, some good NPCs claim a character they aren't, and keep it up until they come clean (settings in src/data.js):
  - Hiding: a good NPC with a character the Demon most wants dead (Empath, Fortune Teller, Undertaker, Monk, Dreamer, Oracle, Innkeeper...) hides it at HIDE_CHANCE (0.25), claiming a safe character instead (Soldier, Butler, Recluse...) with no information. The Demon looks elsewhere, unless it has a working Spy.
  - Baiting: a good NPC whose character doesn't mind a night kill (BAIT_ROLES: Soldier, Ravenkeeper, Mayor, Sage, Fool, Sailor) claims a valuable character at BAIT_CHANCE (0.25), with made-up information, to draw the Demon's attack.
  - The cover character is never in play, already claimed, or one of the Demon's bluffs. They tell the truth to players their own information vouches for, and to you at COVER_TELL_HUMAN_CHANCE (0.5, decided the first time you talk). So the same good player can tell different people different things.
- Coming clean: a player with a cover story says in public what they really are, with all their information ('Player 5 comes clean: "I was hiding as the Soldier; I'm really the Empath. Night 1: My number is 0."'):
  - at dawn, once they're dead, or with COME_CLEAN_ALIVE (5) or fewer alive; a hider also does when last night's information points at a living player, at COME_CLEAN_URGENT_CHANCE (0.5);
  - before a vote: the nominee at COME_CLEAN_NOMINATED_CHANCE (0.9), and anyone whose information vouches for or points at the nominee at COME_CLEAN_NOMINATION_CHANCE (0.5). A "🗣️ Before the vote" card shows what they said, like the dawn and dusk cards; click anywhere to continue, then decide on your hand.
  - Fakes: a nominated evil NPC fakes coming clean once at FAKE_CLEAN_CHANCE (0.3), claiming they were hiding a valuable character (a free Demon bluff if there is one) with made-up information, and claims it from then on.
- Distorted gossip: when you talk to an evil NPC, a claim they pass on about a player the evil team wants to discredit (its scapegoat, or someone who accused one of them) is a lie at DISTORT_CHANCE (0.25): a different character, the same lie every time. A passed-on claim that doesn't match what that player told you could mean the passer is lying, the player is evil, or the player is good and hiding.
- Changed stories: a good NPC counts it against a player who told them one character and said another, to them before or in public (EVIDENCE_WEIGHT.changedStory, 1). Once that player has come clean, it counts for much less (changedStoryCleared, 0.25).
- log.txt: the Claims column shows a cover story ("Empath (hiding as Recluse)"), and taking one, coming clean and faking it are listed ("[cover]", "[come_clean]").

## New Feature: Lower Your Hand

- Voting is now your choice: when a vote starts (your nomination, or one you asked for), your hand starts raised and a "✋ Lower hand" button under the clock counts down for HAND_WAIT_MS (3000, in src/data.js). Press it to lower your hand (and again to raise it); when the countdown ends, the votes are cast and counted as before. Before, your hand always went up for every nomination.
- Ghost vote: dead, you keep your one vote by lowering your hand. Before, it was spent on the first nomination of the day. With it spent, there's no wait.
- Evil NPCs, who vote last, see whether you voted, as before.

## New Features: NPC Conversations, Private Talks, Spy Kills

- NPC conversations: every dawn, each NPC (living or dead) talks in private to as many other NPCs as you can talk to that day (half the living players, rounded down). They pick people they've never talked to first, then the ones they talked to longest ago, so over the game each builds up their own picture of the town. Each conversation works like yours: the NPC they talk to tells them their claim, their information and their opinion (an evil player tells their bluff). Nobody talks to you. log.txt lists who talked to whom each day ("[talks]").
- Decisions use what each NPC has heard: who they suspect, how they vote, who a Monk or Innkeeper protects, who a Gambler or Juggler guesses, who a Professor brings back and who the Demon kills all depend on the claims and information that NPC has heard, in public or in private. Before, everyone used the same public knowledge. Claim-based reasons ("they and Player 5 both claim the Chef", "they claim the Chef, but I'm the Chef") now come only from claims that NPC heard.
- Evil bluffs work the same way: bluffers use the same conversations to choose their made-up picks (a Monk, Innkeeper, Gambler or Juggler bluffer, say), and the evil team frames a good player its members have heard claim an information character.
- Your conversations are private: no NPC hears what an NPC tells you, and it doesn't make their claim public. It stays in your log, and you still see their claim on their seat. Public information works as before: shared information at dawn, Gossip statements, Slayer shots, claims that change at dawn and so on are heard by everyone.
- Passed-on claims: when you talk to an NPC, they end with what other NPCs told them in private ("What others have told me: Player 5 told me they're the Chef."). Claims already made in public are left out.
- Spy kills: the Demon only goes after good players by their true character when a working Spy (not drunk or poisoned) is on its team, since the Spy sees the Grimoire. Otherwise it goes by what it has heard players claim. To keep the Spy hidden, on SPY_COVER_CHANCE (0.3, in src/data.js) of nights a Demon with a Spy kills a less valuable ("low") good player instead.

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
