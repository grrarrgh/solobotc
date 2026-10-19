# Solo Clocktower MVP 2.3.0

Dependency-free browser game for the supplied Trouble Brewing JSON script.

## Run
```bash
python3 -m http.server 8000
```
Open `http://localhost:8000`.

## Integrated behaviour
- The human is good and never the Imp, Ravenkeeper, Virgin, or Soldier.
- Daily conversations are limited to half the alive count, rounded down.
- Dead NPCs remain conversational targets and repeat stored information.
- Conversation responses are stored in the public log.
- Before an NPC is asked, their circular token says `Unknown`.
- After an NPC gives a claim, their circular token displays that claimed character.
- The town square does not display seat numbers.
- A raised hand emoji marks each counted voter from the latest nomination.
- Final reveal cards are headed by each player's true starting role, not their seat number.
- Per-player votes and vote totals are omitted from the final reveal.

## Validate
```bash
npm run check
npm test
```
No installation or build step is required.
