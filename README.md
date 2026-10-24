# Solo Clocktower

A dependency-free, single-player browser version of
[Blood on the Clocktower](https://bloodontheclocktower.com/). You are always
on the good team; every other seat is an NPC, and the game is the Storyteller.

## Playing

Navigate to <https://grrarrgh.github.io/solobotc/> 
- Select your seat size (number of players)
- Select your script
- Click "Random Seed"
- Press start

- **Night:** the Storyteller tells you what you learn. If your character makes a
  choice, pick player(s) in the town square and press **Select**.
- **Day:** click a player to **Ask** them, in private, what they claim, what
  they learned and who they trust or suspect; then **Share My Info** (your
  character and what you've learned) or **Leave conversation**. When you're
  done talking, press **Start Nominations**. Then you can **Nominate** a
  player, **Request nomination** (ask someone else to nominate them), or press
  **NPC nominations X** to let the next of the X NPCs who want to nominate do
  so, saying why. Before a vote, anyone who decides to come clean about a cover story
  says so on a card; click anywhere to continue. Your hand starts lowered:
  press **Raise hand** to vote (and **Lower hand** to take it back), in the
  few seconds before the count or as the clock hand ticks round, until it
  reaches you and counts your vote. NPCs can lie, good ones included: some hide a valuable
  character or claim one to bait the Demon.
  Some characters add buttons (Slayer, Artist, Savant, Gossip, Amnesiac,
  Fisherman, Puzzlemaster). If a Boomdandy is executed, you have 10
  seconds to select the player you point at before night falls. With 4 or
  fewer players alive and nominations open, **Round Robin** (once per game)
  has every player, from Seat 1, say their character and information in
  public. Dead players
  can be nominated too. Press **End day** to
  execute whoever is marked for execution (💀) and go to night.
- **Game over:** the **Final reveal** shows the Grimoire and a timeline of the
  whole game; **Download log.txt** saves it.

Click a character name anywhere to read its ability, or the clock tower in the
middle of the town square for the whole script.

## Scripts

`scripts/` holds the scripts listed in `scripts/index.json`: Trouble Brewing,
Everyone Can Play, Sects & Violets, Bad Moon Rising, Onion Pies, Catfishing
and Extension Cord, in the official script-tool JSON format. Travellers
aren't supported: a script's Travellers are left out (`TRAVELLERS` in
`src/characters/catalog.js`). Fabled (such as the Sentinel) are Storyteller rules, never
dealt (`FABLED`). Jinxes between a script's characters are listed on its
script sheet (`JINXES`).

Characters don't belong to a script: a script is just a list of character
ids, so a custom script can mix characters from any of these (say, the Imp
with a Sailor, a Pixie and a Witch). To add one, save its JSON in `scripts/`
and add the file name to `scripts/index.json`.

## Tuning

NPC behaviour is set by constants in [`src/data.js`](src/data.js), each with a
comment explaining it. What's particular to one character (its kill
priority, once-per-game timing, whether you can be dealt it...) is a field
in its record in `CHARACTERS`. These include:

- when NPCs use once-per-game abilities (`ONCE_PER_GAME`);
- who the Demon kills (`DEMON_KILL_PRIORITY`, `KILL_PRIORITY_CHANCE`), and how
  often a Demon with a Spy hides it (`SPY_COVER_CHANCE`);
- how often Minions know the Demon's bluffs (`MINION_BLUFF_CHANCE`);
- how often good NPCs hide or bait (`HIDE_CHANCE`, `BAIT_CHANCE`), when they
  come clean (`COME_CLEAN_*`), and how often evil NPCs fake it or lie about
  what they heard (`FAKE_CLEAN_CHANCE`, `DISTORT_CHANCE`);
- how sure an NPC must be to nominate (`NPC_NOMINATE_EVIDENCE`), or to say
  they trust someone (`TRUST_EVIDENCE`);
- the vote animation speed (`VOTE_COUNT_DELAY_MS`, `VOTE_TICK_MS`), and how
  long you have to lower your hand (`HAND_WAIT_MS`);
- the characters the human can't be dealt (`notForHuman`).

> **If you don't want to spoil yourself don't look too deep into it as it would give you pointers on how the Evil Team "behaves"**

## Code

| File | What it does |
| --- | --- |
| `src/characters/catalog.js` | Every character (`CHARACTERS`: name, team, ability text and its settings), and the Travellers left out |
| `src/data.js` | Role counts, jinxes and the tuning constants, in sections (re-exports the catalogue) |
| `src/setup.js` | Deals a new game from a script, seat count and seed |
| `src/engine.js` | Runs nights, days, NPC conversations, nominations, deaths and win checks |
| `src/characters/` | Each character's own mechanics, one file per character, by team (`townsfolk/`, `outsider/`, `minion/`, `demon/`), mixed into the engine |
| `src/abilities.js` | Ability mechanics several characters share (waking, protection, coming back to life, madness, claims) |
| `src/storyteller.js` | What each character learns: true, false or bluffed |
| `src/strategy.js` | How NPCs choose, vote, nominate, claim and suspect |
| `src/log.js` | Formats the downloadable log |
| `src/app.js` | The page: town square, panels, vote animation, reveal |
| `src/util.js` | The seeded random number generator and small helpers |

## Tests

```sh
npm test        # npm.cmd test in Windows PowerShell
npm run check   # syntax-check every file in src/
```

Changes are listed in [`CHANGES.md`](CHANGES.md), newest first.

## Acknowledgements

This is not affiliated with The Pandemonium Institute. All roles and characters are the property of Steven Medway and The Pandemonium Institute.

Blood on the Clocktower is a trademark of Steven Medway and The Pandemonium Institute.
