import { name } from "../../data.js";
import { ability, works, bluffing } from "../../storyteller.js";
import { claimHeard } from "../../strategy.js";

// The Pixie, mixed into Engine.prototype (see characters/index.js),
// so `this` is the Engine.
export const pixie = {
  // An NPC Pixie becomes "mad" about the Townsfolk they learned on Night 1:
  // from Day 1 they claim it (with made-up information to match; see
  // strategy ask()), so they can gain its ability. An evil Pixie bluffer
  // does the same with the one they "learned", so they act like one.
  //
  // A Pixie who gained the ability in the night says so now (see
  // pixieGains()).
  pixieMadness() {
    const s = this.s;

    for (const p of s.players.filter((x) => x.pixieNews)) {
      p.pixieNews = false;

      if (p.alive) {
        this.pixieAnnounces(p);
      }
    }

    for (const p of s.players.filter(
      (x) =>
        x.alive &&
        !x.human &&
        (x.role === "pixie" || (x.alignment === "evil" && x.claim === "pixie")) &&
        x.pixieRole &&
        !x.pixieMad,
    )) {
      p.pixieMad = true;
      p.claim = p.pixieRole;

      this.audit(
        "pixie",
        `${p.label} (${
          p.role === "pixie" ? "Pixie" : `${name(p.role)}, bluffing Pixie`
        }) is mad that they are the ${name(p.pixieRole)}, and claims it.`,
        { playerId: p.id, role: p.pixieRole },
      );
    }
  },

  // When the holder of a mad Pixie's character dies, a working Pixie gains
  // their ability, and (an NPC) says in public they were the Pixie: now, or
  // at dawn if it's night.
  pixieGains(dead) {
    for (const p of this.s.players.filter(
      (x) =>
        x.alive &&
        x.role === "pixie" &&
        x.pixieMad &&
        !x.gained &&
        x.pixieRole === dead.role &&
        works(x),
    )) {
      p.gained = dead.role;

      this.audit(
        "pixie",
        `${dead.label} (${name(dead.role)}) died: ${p.label} (Pixie) gains the ${name(
          dead.role,
        )} ability.`,
        { playerId: p.id, role: dead.role },
      );

      if (p.human) {
        continue;
      }

      if (this.s.phase === "day") {
        this.pixieAnnounces(p);
      } else {
        p.pixieNews = true;
      }
    }

    // An evil Pixie bluffer "gains" it too, when someone they know claimed
    // (or was) that character dies, and says so the same way.
    for (const p of this.s.players.filter(
      (x) =>
        x.alive &&
        !x.human &&
        x.alignment === "evil" &&
        x.bluff === "pixie" &&
        x.pixieMad &&
        !x.bluffGained &&
        (dead.role === x.pixieRole || claimHeard(dead, x) === x.pixieRole),
    )) {
      p.bluffGained = p.pixieRole;

      if (this.s.phase === "day") {
        this.pixieAnnounces(p);
      } else {
        p.pixieNews = true;
      }
    }
  },

  // A mad Pixie who gained the ability says in public they were the Pixie,
  // and claims it from now on.
  pixieAnnounces(p) {
    const s = this.s;
    const role = name(p.gained ?? p.bluffGained);
    const said = ` says: "I was the Pixie, mad about being the ${role}. I now have the ${role} ability."`;

    p.claim = "pixie";
    this.claimPublicly(p);
    s.publicLog.push(`Day ${s.day} — ${p.label}${said}`);
    this.audit("pixie", `${p.label}${said}`, {
      playerId: p.id,
      role: p.gained ?? p.bluffGained,
    });
  },
};
