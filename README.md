# Solo Clocktower

A dependency-free, single-player browser version of
[Blood on the Clocktower](https://bloodontheclocktower.com/). You are always
on the good team; every other seat is an NPC, and the game is the Storyteller.

## Playing

You need [Node.js](https://nodejs.org/) (any recent version).

```sh
npm start
```

Then open <http://localhost:8000>. (On Windows PowerShell, use `npm.cmd start`
if `npm` is blocked. Any static file server also works; the page can't be
opened straight from disk because it loads its scripts as modules.)

Pick the number of seats, a script and a seed, then press **Start**. The same
seed and settings always deal and play out the same game; **Random Seed**
picks a new one.

- **Night:** the Storyteller tells you what you learn. If your character makes a
  choice, pick player(s) in the town square and press **Select**.
- **Day:** click a player to **Ask** them, in private, what they claim and think
  (and what other players have told them); then **Share My Info** (your
  character and what you've learned) or **Leave conversation**. Once you've used your conversations, nominations open,
  and NPCs nominate the players they strongly suspect, saying why. You can
  **Nominate** a player, or **Request nomination** (ask someone else to
  nominate them). Before a vote, anyone who decides to come clean about a cover story
  says so on a card; click anywhere to continue. Your hand goes up for the
  vote unless you press **Lower hand** in the few seconds before the votes
  are counted. NPCs can lie, good ones included: some hide a valuable
  character or claim one to bait the Demon.
  Some characters add buttons (Slayer, Artist, Savant, Gossip). Dead players
  can be nominated too. Press **End day** to
  execute whoever is marked for execution (💀) and go to night.
- **Game over:** the **Final reveal** shows the Grimoire and a timeline of the
  whole game; **Download log.txt** saves it.

Click a character name anywhere to read its ability, or the clock tower in the
middle of the town square for the whole script.

## Scripts

`scripts/` holds the scripts listed in `scripts/index.json`: Trouble Brewing,
Everyone Can Play, Sects & Violets, Bad Moon Rising and Onion Pies, in the
official script-tool JSON format.

## Tuning

NPC behaviour is set by constants in [`src/data.js`](src/data.js), each with a
comment explaining it. These include:

- when NPCs use once-per-game abilities (`ONCE_PER_GAME`);
- who the Demon kills (`DEMON_KILL_PRIORITY`, `KILL_PRIORITY_CHANCE`), and how
  often a Demon with a Spy hides it (`SPY_COVER_CHANCE`);
- how often Minions know the Demon's bluffs (`MINION_BLUFF_CHANCE`);
- how often good NPCs hide or bait (`HIDE_CHANCE`, `BAIT_CHANCE`), when they
  come clean (`COME_CLEAN_*`), and how often evil NPCs fake it or lie about
  what they heard (`FAKE_CLEAN_CHANCE`, `DISTORT_CHANCE`);
- when nominations open (`NOMINATIONS_DELAY_MS`) and how sure an NPC must be
  to nominate (`NPC_NOMINATE_EVIDENCE`);
- the vote animation speed (`VOTE_COUNT_DELAY_MS`, `VOTE_TICK_MS`), and how
  long you have to lower your hand (`HAND_WAIT_MS`);
- the characters the human can't be dealt (`FORBIDDEN_HUMAN`).

## Code

| File | What it does |
| --- | --- |
| `src/data.js` | Characters, ability text, role counts and the tuning constants |
| `src/setup.js` | Deals a new game from a script, seat count and seed |
| `src/engine.js` | Runs nights, days, NPC conversations, nominations, deaths and win checks |
| `src/sects.js` | Sects & Violets characters (mixed into the engine) |
| `src/bmr.js` | Bad Moon Rising characters (mixed into the engine) |
| `src/onion.js` | Onion Pies characters (mixed into the engine) |
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
