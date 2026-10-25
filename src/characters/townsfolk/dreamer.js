import { name, alignment } from "../../data.js";
import { byId, pick, shuffle } from "../../util.js";
import { goodRoles, evilRoles } from "../../storyteller.js";
import { bluffState } from "../../bluff.js";

const dreamText = (t, a, b) =>
  `Dreamer: ${t.label} is the ${name(a)} or the ${name(b)}.`;

// The Dreamer: a chosen player is 1 of 2 characters, one good and one evil.
export const info = {
  truth(s, p, strat) {
    const t = strat.dream(s, p);

    if (!t) {
      return { targets: [], text: "No information." };
    }

    // Either twin: the Evil Twin and the good twin's character, so the
    // twins look the same.
    const twins = s.twins && [s.twins.evilId, s.twins.goodId].includes(t.id);
    const evilTwin = twins && byId(s, s.twins.evilId);
    const goodTwin = twins && byId(s, s.twins.goodId);

    if (evilTwin?.role === "eviltwin" && goodTwin) {
      return {
        targets: [t.id],
        text: dreamText(t, ...shuffle(["eviltwin", goodTwin.role], s.r)),
      };
    }

    // One correct character, and one of the opposite alignment.
    const other = pick(
      (alignment(t.role) === "good" ? evilRoles(s) : goodRoles(s)).filter(
        (id) => id !== t.role,
      ),
      s.r,
    );

    return {
      targets: [t.id],
      text: dreamText(t, ...shuffle([t.role, other], s.r)),
    };
  },

  lie(s, p, strat) {
    const t = strat.dream(s, p);

    if (!t) {
      return { targets: [], text: "No information." };
    }

    // Neither character is right (unless the only evil character on the
    // script is theirs, as with Legion).
    const good = pick(
      goodRoles(s).filter((id) => id !== t.role),
      s.r,
    );
    const bad =
      pick(
        evilRoles(s).filter((id) => id !== t.role),
        s.r,
      ) ?? pick(evilRoles(s), s.r);

    return {
      targets: [t.id],
      text: dreamText(t, ...shuffle([good, bad], s.r)),
    };
  },

  random(s, p, targets) {
    const t = byId(s, targets[0]);
    const pair = [pick(goodRoles(s), s.r), pick(evilRoles(s), s.r)];

    return t
      ? { targets, text: dreamText(t, ...shuffle(pair, s.r)) }
      : { targets: [], text: "No information." };
  },

  // An evil player bluffing the Dreamer: the player they dream is the
  // character they claim, or an evil character not in play (so it doesn't
  // give away the evil team's characters) and not claimed, so their story
  // holds up against the town's claims. The same player dreamed again gets
  // the same pair, while their claim stands.
  bluff(s, p, strat) {
    const t = strat.dream(s, p);

    if (!t) {
      return { targets: [], text: "No information." };
    }

    const claimed = new Set(s.players.map((x) => x.claim));
    const said = bluffState(p).dreamed[t.id];
    const good = goodRoles(s).includes(t.claim)
      ? t.claim
      : pick(goodRoles(s).filter((id) => !claimed.has(id)), s.r) ?? pick(goodRoles(s), s.r);
    const inPlay = new Set(s.players.map((x) => x.role));
    const evils = evilRoles(s).filter((id) => !inPlay.has(id));
    // (With every evil character in play, as with Legion, one that isn't
    // theirs; failing that, any.)
    const bad =
      pick(evils.filter((id) => !claimed.has(id)), s.r) ??
      pick(evils, s.r) ??
      pick(evilRoles(s).filter((id) => id !== t.role), s.r) ??
      pick(evilRoles(s), s.r);
    // (Unless they've since claimed something else.)
    const pair = said?.includes(t.claim) ? said : shuffle([good, bad], s.r);

    bluffState(p).dreamed[t.id] = pair;

    return { targets: [t.id], text: dreamText(t, ...pair) };
  },
};
