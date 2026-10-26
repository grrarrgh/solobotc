# Solo Clocktower

A dependency-free, single-player browser version of
[Blood on the Clocktower](https://bloodontheclocktower.com/). You are always
on the good team; every other seat is an NPC, and the game is the Storyteller.

## Playing

Go to <https://www.solobotc.com/>, then:

1. Choose a script (Trouble Brewing to begin with).
2. Choose the number of seats.
3. Press **Start**.

Each game gets a random seed; open **Advanced Options** to type one in, as
the same seed always deals the same game.

Click a character name anywhere to read its ability, or the clock tower in
the middle of the town square for the whole script. The **Night order**
button in the script's top corner shows who wakes, in order, on the first
night and the others.

### Night

The Storyteller tells you what you learn. If your character makes a choice,
pick player(s) in the town square and press **Select**.

### Day

**Talk.** Click a player and **Ask** them, in private, what they claim,
what they learned, and who they trust or suspect. Then **Share My Info**
(your character and what you've learned) or **Leave conversation**.

> NPCs can lie, good ones included: some hide a valuable character, or
> claim one to bait the Demon.

**Nominate.** When you're done talking, press **Start Nominations**. Then:

- **Nominate** a player (dead players can be nominated too);
- **Request nomination**: ask someone else to nominate them;
- **NPC nominations X**: the next of the X NPCs who want to nominate does
  so, saying why.

Before a vote, anyone who comes clean about a cover story says so on a
card; click anywhere to continue.

**Vote.** Your hand starts lowered. Press **Raise hand** to vote (and
**Lower hand** to take it back) before the count, or as the clock hand ticks
round, until it reaches you.

**End the day.** Press **End day** to execute whoever is marked for
execution (💀) and go to night.

**Extras:**

- Some characters add their own buttons: Slayer, Artist, Savant, Gossip,
  Amnesiac, Fisherman, Puzzlemaster.
- If a Boomdandy is executed, you have 10 seconds to select the player you
  point at before night falls.
- **Round Robin** (once per game, with 4 or fewer players alive and
  nominations open): every player, from Seat 1, says their character and
  information in public.

### Game over

The **Final reveal** shows the Grimoire and a timeline of the whole game;
**Download log.txt** saves it.

## Scripts

`scripts/` holds the scripts listed in `scripts/index.json`: Trouble Brewing,
Everyone Can Play, Sects & Violets, Bad Moon Rising, Onion Pies, Catfishing,
Extension Cord, Trust Redux and Outed Evil, in the official script-tool JSON format. Travellers
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
| `src/characters/nightorder.js` | The night order (first night, other nights) shown on the script sheet |
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
| `src/selfplay.js` | Self-play, for testing: plays your seat for you (open the page with `?selfplay`) |
| `images/icons/`, `favicon.ico`, `site.webmanifest` | The clock tower icon: browser tabs, bookmarks, home screens |
| `images/social.png` | The picture a shared link shows |
| `CNAME`, `.nojekyll` | GitHub Pages: the custom domain (www.solobotc.com), and serving the files as they are |

## Tests

```sh
npm test        # npm.cmd test in Windows PowerShell
npm run check   # syntax-check every file in src/
```

Changes are listed in [`CHANGES.md`](CHANGES.md), newest first.

## Acknowledgements

This is not affiliated with The Pandemonium Institute. All roles and characters are the property of Steven Medway and The Pandemonium Institute.

Blood on the Clocktower is a trademark of Steven Medway and The Pandemonium Institute.
