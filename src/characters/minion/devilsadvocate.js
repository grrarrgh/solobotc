import { name } from "../../data.js";
import { works } from "../../storyteller.js";
import { acts } from "../../abilities.js";

// The Devil's Advocate, mixed into Engine.prototype (see characters/index.js),
// so `this` is the Engine.
export const devilsadvocate = {
  // The Devil's Advocate picks someone (not last night's pick) who survives
  // execution tomorrow.
  advocate() {
    const s = this.s;
    const lastId = s.advocate?.targetId ?? null;
    const da = s.players.find((x) => acts(x) && x.role === "devilsadvocate");

    s.advocate = null;

    if (!da) {
      return;
    }

    const t = this.strat.advocate(s, da, lastId);

    if (!t) {
      return;
    }

    this.woke(da);
    this.chose(da, t);

    const effective = works(da);

    s.advocate = { targetId: t.id, day: s.night, effective };

    this.audit(
      "advocate",
      `${da.label} (${name(da.role)}) chose ${t.label}; ${
        effective ? "protected from execution" : "protection failed"
      }.`,
      { actorId: da.id, targetId: t.id, effective },
    );
  },

  // Whether the Devil's Advocate saves p from execution today.
  advocated(p) {
    const a = this.s.advocate;

    return Boolean(a?.effective && a.targetId === p.id && a.day === this.s.day);
  },
};
