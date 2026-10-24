import { name } from "../../data.js";
import { works } from "../../storyteller.js";
import { acts } from "../../abilities.js";

// The Cerenovus, mixed into Engine.prototype (see characters/index.js),
// so `this` is the Engine.
export const cerenovus = {
  // The Cerenovus makes a good NPC "mad" about another character tomorrow:
  // all day, they claim that character and say nothing else.
  cerenovus() {
    const s = this.s;
    const c = s.players.find((x) => acts(x) && x.role === "cerenovus");
    const choice = c && this.strat.cerenovus(s, c);

    if (!choice) {
      return;
    }

    this.woke(c);
    this.chose(c, choice.target);

    const effective = works(c);

    if (effective) {
      choice.target.mad = { role: choice.role, day: s.night, previous: null };
    }

    this.audit(
      "cerenovus",
      `${c.label} (Cerenovus) made ${choice.target.label} mad that they are the ${name(
        choice.role,
      )}${effective ? "" : ", but it failed"}.`,
      { actorId: c.id, targetId: choice.target.id, role: choice.role, effective },
    );
  },

  // Whether NPC p was killed the night the Cerenovus made them mad as the
  // Ravenkeeper (and hasn't yet said so).
  madRavenkeeper(p) {
    const s = this.s;

    return (
      !p.human &&
      !p.alive &&
      p.diedAtNight === s.night &&
      p.mad?.day === s.day &&
      p.mad.previous === null &&
      p.mad.role === "ravenkeeper"
    );
  },

  // At dawn, an NPC killed the night they were made mad as the Ravenkeeper
  // doesn't pretend to have woken: they say in public they were made mad, and
  // what they really are (a good player's character, ending any cover story;
  // an evil player's bluff). The madness ends there.
  madRavenkeeperClean() {
    const s = this.s;

    for (const p of s.players.filter((x) => this.madRavenkeeper(x))) {
      if (p.alignment === "good") {
        p.cover = null;
      }

      const claim = p.cover?.as ?? p.claim;
      const said = ` says: "The Cerenovus made me mad as the Ravenkeeper last night, but I was killed. I am actually the ${name(claim)}."`;

      p.mad = null;
      (p.madAbout ??= []).push("ravenkeeper");
      this.claimPublicly(p);
      s.publicLog.push(`Day ${s.day} — ${p.label}${said}`);
      this.audit("claim", `${p.label}${said}`, {
        playerId: p.id,
        from: "ravenkeeper",
        to: claim,
      });
    }
  },

  // At dusk, yesterday's madness ends: the player goes back to their claim.
  cerenovusLasting() {
    const s = this.s;

    for (const p of s.players) {
      if (p.mad && p.mad.day < s.night) {
        if (p.mad.previous !== null) {
          p.claim = p.mad.previous;
          p.wasMad = p.mad.role;
        }

        p.mad = null;
      }
    }
  },
};
