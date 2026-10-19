# Solo Clocktower MVP

A dependency-free, browser-based solo simulation for the supplied Trouble Brewing JSON script.

## Solo-mode rules

- The human is assigned a good character and is never targeted by the Demon or Poisoner.
- NPC night choices are seeded and automatic. Human information is shown in the private Storyteller log.
- One human-selected nomination resolves per day. The threshold is half the living count, rounded up.
- Evil never votes for an evil nominee. Dead players have one tracked ghost vote. A functioning living Butler needs their master to attempt the same vote.
- Dead NPCs remain conversational targets. They repeat stored memories but receive no new normal night information. Ravenkeeper death information is stored after the trigger.
- Virgin activation ends the day but the solo safeguard does not execute the human.
- Human plot armour makes a human Soldier/Ravenkeeper less useful than in the tabletop game.
- Full hidden roles and structured audit events appear only after the game ends.

## Architecture

- `setup.js`: script validation, legal type counts, Baron, Drunk, bluffs, red herring.
- `storyteller.js`: registration, information generation, death-trigger information.
- `strategies.js`: replaceable NPC decisions and bluffing.
- `engine.js`: phases, deaths, voting, succession, wins, audit events.
- `app.js`: browser rendering and controls.

This is an unofficial fan project. It uses original code and concise implementation descriptions; it includes no official art.
