# Solo Clocktower MVP 2.2.1

Dependency-free browser game for the supplied Trouble Brewing JSON script.

## Run

```bash
python3 -m http.server 8000
```

Open `http://localhost:8000`.

## Latest integrated rules

- The human is good and is never the Imp, Ravenkeeper, Virgin, or Soldier.
- The Demon and Poisoner never target the human.
- Daily conversations are limited to half the alive count, rounded down; each NPC may be asked once per day.
- Dead NPCs can be asked and repeat their stored information.
- Information gathered in conversations is retained in the public log.
- Counted voters in the latest nomination have a raised hand emoji over their circular town-square seat.
- Per-player votes and the vote result are omitted from the final reveal; executions remain visible.
- The final reveal includes roles, claims, bluffs, deaths, information, conversations, night actions, and succession.

## Validate

```bash
npm run check
npm test
```

No installation or build step is required.
