import { COUNTS, name, team, alignment } from "../../data.js";
import {
  ability,
  infoMode,
  bluffing,
  registersEvil,
  isDemon,
  nameable,
  neigh,
  scapegoat,
} from "../../storyteller.js";
import { pick, sample, shuffle } from "../../util.js";
import { bluffMode, bluffState } from "../../bluff.js";

// The Savant, mixed into Engine.prototype (see characters/index.js),
// so `this` is the Engine.
export const savant = {
  // NPC Savants (and Savant bluffers; see bluffing()) visit the Storyteller each day.
  npcSavants() {
    const s = this.s;

    for (const p of s.players.filter(
      (x) =>
        !x.human &&
        x.alive &&
        x.savantDay !== s.day &&
        (ability(x) === "savant" || bluffing(x, "savant")),
    )) {
      p.savantDay = s.day;

      if (ability(p) === "savant" && p.alignment === "good") {
        this.remember(p, savantInfo(s, p, infoMode(s, p)));
      } else {
        this.rememberBluff(
          p,
          bluffMode(p) === "truth" ? savantInfo(s, p, "truth") : savantBluff(s, p),
        );
      }
    }
  },

  // The human Savant's daily visit to the Storyteller.
  savant() {
    const s = this.s;
    const h = this.human();

    if (
      s.phase !== "day" ||
      s.winner ||
      ability(h) !== "savant" ||
      !h.alive ||
      h.savantDay === s.day
    ) {
      throw Error("Savant unavailable.");
    }

    h.savantDay = s.day;

    const info = savantInfo(s, h, infoMode(s, h));

    this.remember(h, info);

    return info.text;
  },
};

// Things a Savant can be told, each as a true and a false statement (and
// the players it names). Never about the human, and about different players
// from the Savant's last visit where possible.
function savantFacts(s, p) {
  const all = nameable(s, p).filter((x) => !x.human);
  const last = p.lastPicks?.savant ?? [];
  const fresh = all.filter((x) => !last.includes(x.id));
  const others = fresh.filter((x) => x.alive).length >= 2 ? fresh : all;
  const t = pick(
    others.filter((x) => x.alive),
    s.r,
  );
  const c = pick(others, s.r);
  const d = s.players.find((x) => x.alive && isDemon(x));
  const x = pick(
    others.filter((y) => y.alive && y !== d),
    s.r,
  );
  const outsiders = s.players.filter(
    (y) => team(y.role) === "outsider",
  ).length;
  const thereAre = (n) =>
    `There ${n === 1 ? "is 1 Outsider" : `are ${n} Outsiders`} in play.`;
  const near = Boolean(d && x && neigh(s, x).includes(d));

  return [
    t && {
      ids: [t.id],
      yes: `${t.label} is ${registersEvil(t) ? "evil" : "good"}.`,
      no: `${t.label} is ${registersEvil(t) ? "good" : "evil"}.`,
    },
    {
      ids: [],
      yes: thereAre(outsiders),
      no: thereAre(outsiders ? outsiders + (s.r() < 0.5 ? -1 : 1) : 1),
    },
    c && {
      ids: [c.id],
      yes: `${c.label} is the ${name(c.role)}.`,
      no: `${c.label} is the ${name(
        pick(
          s.script.ids.filter((id) => id !== c.role),
          s.r,
        ),
      )}.`,
    },
    d &&
      x && {
        ids: [x.id],
        yes: `The Demon is ${near ? "" : "not "}a neighbour of ${x.label}.`,
        no: `The Demon is ${near ? "not " : ""}a neighbour of ${x.label}.`,
      },
  ].filter(Boolean);
}

// The Savant's daily visit: two statements, one true and one false (both
// false for a Drunk or under the Vortox; either way when poisoned).
export function savantInfo(s, p, mode) {
  const [a, b] = sample(savantFacts(s, p), 2, s.r);

  // Remembered so the next visit is about other players.
  p.lastPicks = { ...p.lastPicks, savant: [...a.ids, ...b.ids] };

  const said =
    mode === "truth"
      ? shuffle([a.yes, b.no], s.r)
      : mode === "lie"
        ? [a.no, b.no]
        : [a, b].map((f) => (s.r() < 0.5 ? f.yes : f.no));

  return {
    day: s.day,
    night: s.night,
    role: "savant",
    text: `Savant: one of these is true:\n"${said[0]}"\n"${said[1]}"`,
    targets: [],
    trigger: "day",
    functioning: mode === "truth",
  };
}

// An evil Savant bluffer's daily visit: two made-up statements, each one
// true or false at random, but never one that hurts their team. A teammate
// is only ever "good", or the character they claim; only a good player is
// ever "evil" (never the evil team's scapegoat "good"); a character named is
// never an evil one in play (that would give it away); the Demon is only
// ever misplaced, never next to a teammate; and the Outsider count is only
// true when no Minion changed it. Never the same statement twice, nor the
// same kind of statement about a player twice (see bluffState()), and the
// two are about different things. (The Lunatic's team is the one they
// imagine, with themself as the Demon.)
export function savantBluff(s, p) {
  const lunatic = p.role === "lunatic";
  const mine = (x) =>
    lunatic
      ? x === p || (p.lunaticTeam ?? []).includes(x.id)
      : x.alignment === "evil";
  const demon = lunatic ? p : s.players.find((x) => x.alive && isDemon(x));
  const goat = lunatic ? null : scapegoat(s);
  const inPlay = new Set(s.players.map((x) => x.role));
  const said = new Set(bluffState(p).savantSaid);
  const options = [];
  // `group`: what it's about (only one statement each a day); `keys`: what
  // can't be said again.
  const add = (group, kind, text, ids = []) => {
    const keys = [text, ...ids.map((id) => `${kind}:${id}`)];

    if (!keys.some((k) => said.has(k))) {
      options.push({ group, keys, text, ids });
    }
  };

  for (const x of s.players.filter((y) => y.alive && !y.human && y !== p)) {
    if (x !== goat) {
      add(x.id, "alignment", `${x.label} is good.`, [x.id]);
    }

    if (!mine(x)) {
      add(x.id, "alignment", `${x.label} is evil.`, [x.id]);
    }

    const role = mine(x)
      ? alignment(x.claim) === "good" && x.claim !== x.role
        ? x.claim
        : null
      : pick(
          s.script.ids.filter(
            (id) =>
              !(alignment(id) === "evil" && inPlay.has(id)) &&
              !(x === goat && id === x.role),
          ),
          s.r,
        );

    if (role) {
      add(x.id, "character", `${x.label} is the ${name(role)}.`, [x.id]);
    }

    const near = neigh(s, x);

    if (demon && near.includes(demon)) {
      add(x.id, "demon", `The Demon is not a neighbour of ${x.label}.`, [x.id]);
    } else if (demon && !near.some(mine)) {
      add(x.id, "demon", `The Demon is a neighbour of ${x.label}.`, [x.id]);
    }
  }

  const outsiders = s.players.filter((y) => team(y.role) === "outsider").length;
  const base = COUNTS[s.players.length]?.[1] ?? outsiders;

  for (let n = Math.max(0, base - 1); n <= base + 1; n++) {
    if (n !== outsiders || outsiders === base) {
      add(
        "outsiders",
        "outsiders",
        `There ${n === 1 ? "is 1 Outsider" : `are ${n} Outsiders`} in play.`,
      );
    }
  }

  const a = pick(options, s.r);
  const b = a && pick(options.filter((o) => o.group !== a.group), s.r);

  // (With nothing left to say, which takes many days, a plain lie.)
  if (!b) {
    return savantInfo(s, p, "lie");
  }

  bluffState(p).savantSaid = [...said, ...a.keys, ...b.keys];

  return {
    day: s.day,
    night: s.night,
    role: "savant",
    text: `Savant: one of these is true:\n"${a.text}"\n"${b.text}"`,
    targets: [],
    trigger: "day",
    functioning: false,
  };
}
