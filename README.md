## Solo Clocktower MVP

A dependency-free, browser-based solo simulation for the supplied Trouble Brewing JSON script.

### Solo-mode rules
- The human is assigned a good character and is never the Demon, Ravenkeeper, Virgin, or Soldier.
- The Demon and Poisoner never select the human.
- NPC night choices are seeded and automatic. Human information is shown in the private Storyteller log.
- Each day, the human may talk to distinct NPCs equal to half the alive-player count, rounded down. The human is included in the alive count. Dead NPCs remain eligible targets but use one slot. The same NPC cannot be asked twice on one day.
- Information gathered by asking another player is retained and displayed in the public log.
- One human-selected nomination resolves per day. The threshold is half the living count, rounded up.
- Evil never votes for an evil nominee. Dead players have one tracked ghost vote. A functioning living Butler needs their master to attempt the same vote.
- Counted votes from the latest nomination appear as a raised-hand emoji over each voting seat on the town square. There is no separate vote table.
- Per-player vote events and the vote count are omitted from the final reveal. Executions and their consequences remain visible.
- Dead NPCs repeat stored memories but receive no new normal night information. Ravenkeeper death information is stored after the trigger.
- Full hidden roles and non-vote audit events appear only after the game ends.

### Architecture
- `setup.js`: script validation, setup counts, Baron, Drunk, bluffs, red herring, and solo-safe human assignment.
- `storyteller.js`: registration, information generation, death-trigger information.
- `strategies.js`: replaceable NPC decisions and bluffing.
- `talk-limit.js`: daily distinct-player conversation quota.
- `engine.js`: phases, public conversation notes, deaths, voting, succession, wins, and audit events.
- `app.js`: circular seating, raised-hand vote markers, browser rendering, and controls.

This is an unofficial fan project. It uses original code and includes no official art.
