# CLAUDE.md

Solo Clocktower: a dependency-free, single-player Blood on the Clocktower in
the browser. The human is always seat 1 and always good; every other seat is
an NPC, and the code is the Storyteller. Plain ES modules, no build step, no
npm packages. Deployed as-is to GitHub Pages from `main`, at
www.solobotc.com (the `CNAME` file; grrarrgh.github.io/solobotc redirects).
See README.md for how the game plays and the file table.

## Commands

```sh
npm test         # node --test tests/*.test.js (~500 tests, ~25 s)
npm run check    # node --check every file in src/
npm start        # serve.js on http://localhost:8000 (ES modules: can't open index.html from disk)
node --test --test-name-pattern="Lleech" tests/engine.test.js   # a subset
```

In Windows PowerShell use `npm.cmd`. Node 22+ (developed on v24).

To run, drive or screenshot the real page, use the `run-solobotc` skill
(`.claude/skills/run-solobotc/`): a headless-Chrome driver with `start`,
`playout`, `shot`, `eval`... commands. Screenshots go in
`Desktop\Solo Clocktower\<YYYYMMDDHHMM>`, one folder per conversation.

## Architecture

- **State** (`s`) is one plain object made by `createState(script, seats, seed)`
  in `src/setup.js`: `s.players` (each with `role`, `shown`, `claim`,
  `alignment`, `alive`, `memories`, `talks`, `bluffState`...), `s.phase`,
  `s.night`, `s.day`, `s.r` (the seeded RNG), `s.audit`, `s.publicLog`,
  `s.privateLog`, `s.winner`.
- **`Engine`** (`src/engine.js`) runs nights, days, talks, nominations,
  votes, deaths and win checks over `s`. `night()` → `resolveNight()` calls
  each character's step in night order; it pauses on `s.pending` when the
  human must choose, until `choose()`.
- **Character modules** (`src/characters/<team>/<id>.js`) export a mixin
  object (`export const wizard = {...}`) that is `Object.assign`ed onto
  `Engine.prototype` (bottom of engine.js), so `this` is the Engine.
  Register new ones in `src/characters/index.js`; hook their night step into
  `resolveNight()` / `night()` (the `*Lasting()` effects) and their wake
  into `src/characters/nightorder.js` (the script sheet's order). Shared
  mechanics are in `src/abilities.js`, also mixed in.
- **Information**: a module may also `export const info` (`truth`, `lie`,
  `random`, `story`, `choice`, `bluff`, `once`, `stance`, `named`, `nights`,
  `keep`...), registered in `src/characters/info.js` (`infoOf()`, built
  lazily because the character modules and storyteller.js import each
  other: don't read it at module load). `storyteller.js` decides which mode
  applies (`infoMode()`: truth, or lie/random when drunk, poisoned or
  Vortox). The Washerwoman/Librarian/Investigator share `pairinfo.js`.
- **Bluffs** (`src/bluff.js`): everything said in a character's name by
  someone without its ability: evil bluffers, the Lunatic, the
  Cerenovus-mad, good cover stories. Made-up info must pass `fits()` (re-rolled
  up to `BLUFF_TRIES` by `madeUp()`); evil bluffs help evil and never give a
  teammate away; good pretenders never claim `neverBluffed` characters.
- **NPC decisions** (`src/strategy.js`, `SimpleStrategy`): suspicion and
  evidence, answers when asked, votes, nominations, night choices. The
  human is never any NPC's suspect.
- **Data**: every character's record is in `src/characters/catalog.js`
  (`CHARACTERS`: name, team, ability, `note`, `info`, `kill`, `notForHuman`,
  `neverBluffed`...). `src/data.js` re-exports it, builds the derived sets
  (`ROLES`, `FORBIDDEN_HUMAN`...), and holds `COUNTS`, `JINXES` and all
  tuning constants, each with a comment.
- **Scripts** (`scripts/*.json`, listed in `scripts/index.json`) are
  official script-tool JSON: just lists of character ids, so any characters
  can share a game. Travellers are dropped; Fabled are rules, never dealt.
- **UI**: `index.html`, `styles.css`, `src/app.js` (town square, dialogs,
  vote animation, Final reveal). `tests/ui.test.js` checks these as text
  (regexes over the HTML/CSS/JS), not in a browser.
- **Log**: `engine.audit(type, text, data)` records every event; `src/log.js`
  formats it into the downloadable log.txt and names players by character
  ("Assassin (Gossip)").

## Rules for changes

- **Determinism.** The same script, seats and seed always deal and play the
  same game. Engine, setup, strategy and bluff code draws randomness only
  from `s.r` (pass it to `pick`/`shuffle`/`sample`; their `Math.random`
  default is for the UI). Draw order matters: an extra `s.r()` call changes
  every later game.
- **Regression check for behaviour that shouldn't change**: play hundreds of
  seeded games (8–15 seats, every script) with tests/engine.test.js's
  `playOut()` before and after, and compare the log.txt output; changes
  meant to affect one character or script should leave the others
  byte-identical. Keep such harnesses in the scratchpad, not the repo.
- **Always add logging** (`audit()` in the engine, `setupLog()` in setup) for
  any new or changed behaviour, so its choices and effects show up in log.txt.
- **New characters**: add the record to catalog.js, a module if it needs the
  Engine, night order, `info`/bluff support (every good character must be
  bluffable), and any jinxes from the Djinn
  (https://wiki.bloodontheclocktower.com/Djinn) to `JINXES` in data.js,
  including pairs with characters from other scripts. Where the game
  simplifies an ability, say so in its `note`.
- **Tests**: add tests to `tests/engine.test.js` (helpers: `base()` for a
  5-player Day 1, `role()` to force a character, `playOut()` for a whole
  game). Run `npm test` and `npm run check` before calling work done.
- **CHANGES.md**: every round of changes gets an entry at the top (below
  `# Changes`), headed like `## New Features: …`, `## Bug Fixes: …`,
  `## Improvements: …`, `## Superficial Changes: …` (cosmetic/UI-only),
  or combinations, then `- ` bullets. Wrap identifiers
  with `*` or `<…>` in backticks.

## Style

- Prettier-like formatting: 2 spaces, double quotes, semicolons, trailing
  commas; blank lines around blocks.
- Comments are plain English sentences about the game, in British spelling
  ("behaviour", "colours"), explaining why, and naming where related logic
  lives ("see strategy fresh()"). Match the density of the surrounding code.
- Short names for the common things: `s` state, `p` player, `e` engine,
  `t` target, `x` any player in a filter.
