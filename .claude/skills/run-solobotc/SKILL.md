---
name: run-solobotc
description: Run, play, drive and screenshot Solo Clocktower (the single-player Blood on the Clocktower browser game in this repo). Use when asked to start the game, run its tests, take a screenshot of its UI, check a UI change in the real page, or play a game through to the end on a script (Trouble Brewing, Catfishing...).
---

Solo Clocktower is a static browser game (no build, no npm packages). An
agent drives it with `.claude/skills/run-solobotc/driver.mjs`: it starts
the game's own server and headless Chrome, runs commands piped to it (one
per line), screenshots the page, then shuts both down. It talks to Chrome
over the DevTools protocol with Node's built-in `WebSocket`, so nothing
needs installing. All paths are relative to the repo root.

## Prerequisites

- Node 22 or later (for the global `WebSocket`; verified on v24.22.0).
- Chrome (or Edge). The driver looks in the usual Windows, Linux and
  macOS install paths; otherwise set `CHROME=/path/to/chrome`.

## Run (agent path)

**Screenshots go in `Solo Clocktower` on the user's Desktop, one folder per
conversation**, named by when the conversation's first screenshot was taken:
`YYYYMMDDHHMM`, 24-hour (e.g. `202610241335`). Pick the folder once, at the
first screenshot, and pass the same folder to every run in that
conversation. (With no argument, the driver makes a new one named now, under
`~/OneDrive/Desktop` if that exists, else `~/Desktop`.)

```bash
SHOTS="$(powershell -NoProfile -Command '[Environment]::GetFolderPath("Desktop")')/Solo Clocktower/$(date +%Y%m%d%H%M)"
```

```bash
node .claude/skills/run-solobotc/driver.mjs "$SHOTS" <<'EOF'
# You're dealt the Amnesiac on this seed: make a guess (or click [data-question="demon"] to ask instead).
start 7 12 Catfishing
eval document.getElementById("private").innerText
click [data-guess="evilpairs"]
eval document.getElementById("day-answer").innerText
shot guess #day-controls
EOF
```

Screenshots land in `$SHOTS/<name>.png`. **Look at them**: the Read tool
shows the image. Tell the user the folder's full path.

| Command | Does |
| --- | --- |
| `start <seed> [seats] [script name]` | New game; the script by its menu name (`Catfishing`, `Trouble Brewing`...). The same seed and settings always deal the same game. |
| `night` | Makes your night choice if you're woken (skips if allowed, else picks the first players offered). |
| `nominations` | Start Nominations, confirming its dialog. |
| `npc` | One NPC nomination, waiting for the vote to finish. |
| `endday` | End day. |
| `playout` | night → nominations → every NPC nomination → end day, until game over (about 45 s for 12 seats). |
| `seat <n>` | Clicks seat n (1 is you): selects that player. |
| `click <css>` | Clicks the first element matching the selector. |
| `eval <js>` | Prints a JS expression's value from the page. |
| `state` | Prints your character, which buttons are shown / disabled, and which panels are open. |
| `cards` | Closes any open dawn / dusk / nominations card. |
| `shot <name> [css]` | Screenshots the page, or 40px around the first *shown* element matching css. |
| `wait <ms>` | Waits. |

A whole game, with the nomination row and the game-over view (verified):

```bash
printf '%s\n' "start 7 12 Catfishing" "state" "nominations" "shot noms #day-controls" \
  "seat 4" "shot noms-selected #day-controls" "playout" "state" "shot over" \
  | node .claude/skills/run-solobotc/driver.mjs "$SHOTS"
```

Find a seed that deals you a given character with a quick Node check
(no browser): `createState(script, seats, seed).players[0].role` from
`src/setup.js`.

## Test

```bash
npm test          # node --test: engine and UI (HTML/CSS/app.js text) tests
npm run check     # syntax-checks every file in src/
```

## Run (human path)

`npm start`, then open <http://localhost:8000>. It can't be opened from
disk (it loads ES modules).

## Gotchas

- **The cards are `<dialog>`s.** `document.body.click()` doesn't close a
  dawn / dusk / nominations card from script; `dialog.close()` does (that's
  what `cards` does). A card left open sits over the town square in every
  screenshot.
- **"Start nominations? You won't be able to talk to any more players
  today." is an in-page dialog, not `window.confirm`.** Stubbing
  `window.confirm` does nothing; click its "Start nominations" button
  (lower-case n; the page's own button is "Start Nominations").
- **Set the viewport.** Without `Emulation.setDeviceMetricsOverride`
  (the driver sets 1200×1600), headless Chrome lays the page out at its
  default size and clipped screenshots come out off-centre.
- **NPC nominations animate.** A vote takes a few seconds; End day
  (`#pass`) is disabled until it's counted, so wait for that (`npc` does).
- **The Desktop may be OneDrive's** (`C:\Users\<you>\OneDrive\Desktop`),
  not `~/Desktop`: ask Windows (the `SHOTS=` line above) rather than guess.
- **Ports 8123 (game) and 9333 (Chrome)**, not `npm start`'s 8000, so a
  game you have open isn't disturbed. Override with `PORT` / `CDP_PORT`.
- **Disabled buttons are faded** (`button:disabled` in styles.css); check
  `.disabled` with `eval` or `state`, not by eye alone.
- **Writing the driver with a Git Bash heredoc failed** ("unexpected EOF
  while looking for matching `'`"): long JS with quotes and backticks
  inside a heredoc. Command lists piped in by heredoc or `printf` are fine.

## Troubleshooting

- `driver: no script X`: the name must match the Script menu exactly
  (from each script's `_meta.name`), e.g. `Trouble Brewing`.
- `driver: nothing shown matches #x`: the element exists but is hidden
  (no `offsetParent`): it isn't on screen in this phase. Run `state`.
- `driver: timed out`: the server or Chrome didn't come up; something
  else may hold port 8123 or 9333.
