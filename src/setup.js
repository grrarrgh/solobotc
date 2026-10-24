import {
  ROLES,
  COUNTS,
  FORBIDDEN_HUMAN,
  FIRST_NIGHT_INFO,
  ONGOING_INFO,
  FIRST_NIGHT_INFO_SHARE,
  ONGOING_INFO_SHARE,
  MINION_BLUFF_CHANCE,
  OUTSIDER_MODIFIERS,
  HUMAN_DRUNK_CHANCE,
  team,
  alignment,
  name,
} from "./data.js";
import { rng, pick, sample, shuffle } from "./util.js";
import { logNames } from "./log.js";

// The number of each kind of information Townsfolk to deal among n
// Townsfolk (see FIRST_NIGHT_INFO_SHARE and ONGOING_INFO_SHARE).
export const infoTarget = (n) => ({
  first: Math.round(n * FIRST_NIGHT_INFO_SHARE),
  ongoing: Math.round(n * ONGOING_INFO_SHARE),
});

// Draws n Townsfolk, alternating first-night and ongoing information roles
// until each has its share (or the script runs out, or no Townsfolk slots
// are left), then fills the rest at random.
function drawTownsfolk(pool, n, r) {
  const target = infoTarget(n);
  const groups = [
    {
      left: shuffle(
        pool.filter((x) => FIRST_NIGHT_INFO.includes(x)),
        r,
      ),
      want: target.first,
    },
    {
      left: shuffle(
        pool.filter((x) => ONGOING_INFO.includes(x)),
        r,
      ),
      want: target.ongoing,
    },
  ];
  const picked = [];
  const open = () =>
    picked.length < n && groups.some((g) => g.want > 0 && g.left.length);

  while (open()) {
    for (const g of groups) {
      if (picked.length < n && g.want > 0 && g.left.length) {
        picked.push(g.left.shift());
        g.want--;
      }
    }
  }

  const rest = pool.filter((x) => !picked.includes(x));

  return [...picked, ...sample(rest, n - picked.length, r)];
}

export function parseScript(raw) {
  const meta = raw.find((x) => typeof x === "object" && x.id === "_meta") ?? {
      name: "Unnamed",
    },
    // Scripts list roles either as "id" strings or as { "id": ... } objects.
    ids = raw
      .map((x) => (typeof x === "string" ? x : x?.id))
      .filter((id) => id && id !== "_meta"),
    bad = ids.filter((x) => !ROLES[x]);

  if (bad.length) throw Error(`Unsupported: ${bad}`);

  return { meta, ids };
}

export function createState(
  raw,
  seats,
  seed = Date.now(),
  { minionBluffChance = MINION_BLUFF_CHANCE } = {},
) {
  const script = parseScript(raw),
    base = COUNTS[seats];
  if (!base) {
    const sizes = Object.keys(COUNTS);

    throw Error(`Choose ${sizes[0]}–${sizes.at(-1)} seats`);
  }

  const r = rng(seed),
    pool = (t) => script.ids.filter((id) => team(id) === t);

  // Draw roles. Some characters change the Outsider count (the Baron +2,
  // the Fang Gu +1, the Vigormortis -1, the Godfather -1 or +1), trading
  // Townsfolk for Outsiders.
  let [t, o, m] = base;
  const mins = sample(pool("minion"), m, r);
  const demons = sample(pool("demon"), 1, r);
  const shift = [...mins, ...demons].reduce((n, id) => {
    const k = OUTSIDER_MODIFIERS[id] ?? 0;

    return n + (Array.isArray(k) ? pick(k, r) : k);
  }, 0);
  const outsiders = Math.min(Math.max(0, o + shift), pool("outsider").length);

  t -= outsiders - o;
  o = outsiders;

  let roles = shuffle(
    [
      ...drawTownsfolk(pool("townsfolk"), t, r),
      ...sample(pool("outsider"), o, r),
      ...mins,
      ...demons,
    ],
    r,
  );

  // The human must get a good role that works in solo play.
  let safe = roles
    .map((x, i) =>
      alignment(x) === "good" && !FORBIDDEN_HUMAN.has(x) ? i : -1,
    )
    .filter((i) => i >= 0);

  if (!safe.length) {
    const i = roles.findIndex((x) => alignment(x) === "good"),
      replacement = pool("townsfolk").find(
        (x) => !roles.includes(x) && !FORBIDDEN_HUMAN.has(x),
      );
    if (i < 0 || !replacement) throw Error("No solo-safe human role");
    roles[i] = replacement;
    safe = [i];
  }

  // Move the human's role into seat 1. When the Drunk is dealt, it's the
  // human's at HUMAN_DRUNK_CHANCE. (A separate generator decides this, so the
  // random draws for the rest of the deal are the same either way.)
  const drunk = roles.indexOf("drunk");
  const dealt = pick(safe, r);
  const hi =
    drunk >= 0 && rng(`${seed}:drunk`)() < HUMAN_DRUNK_CHANCE ? drunk : dealt;
  [roles[0], roles[hi]] = [roles[hi], roles[0]];

  const used = new Set(roles),
    unusedTF = pool("townsfolk").filter((x) => !used.has(x));

  // The Drunk is shown a Townsfolk token that isn't in play; a human Drunk
  // is never shown a role that is unsafe in solo play.
  const drunkToken = (human) => {
    const k = unusedTF.findIndex((x) => !human || !FORBIDDEN_HUMAN.has(x));
    return k < 0 ? "chef" : unusedTF.splice(k, 1)[0];
  };

  // The Marionette sits next to the Demon (never in your seat).
  const mi = roles.indexOf("marionette");
  const di = roles.findIndex((x) => team(x) === "demon");

  if (mi > 0 && di >= 0) {
    const n = roles.length;
    const near = [(di + n - 1) % n, (di + 1) % n];
    const seat = near.find((i) => i !== 0);

    if (!near.includes(mi) && seat !== undefined) {
      [roles[mi], roles[seat]] = [roles[seat], roles[mi]];
    }
  }

  // The Lunatic is shown a Demon, but not the one in play.
  const demonToken =
    pick(
      pool("demon").filter((x) => x !== demons[0]),
      r,
    ) ??
    demons[0] ??
    "imp";

  const players = roles.map((role, i) => {
    // The Marionette, like the Drunk, is shown a Townsfolk not in play.
    const shown =
      role === "drunk" || role === "marionette"
        ? drunkToken(i === 0)
        : role === "lunatic"
          ? demonToken
          : role;
    return {
      id: `p${i + 1}`,
      seat: i + 1,
      label: i ? `Player ${i + 1}` : "You",
      human: i === 0,
      role,
      startRole: role,
      shown,
      alignment: alignment(role),
      alive: true,
      ghost: true,
      poisoned: false,
      protected: false,
      master: null,
      claim: shown,
      claimKnown: i === 0,
      bluff: null,
      bluffs: [],
      suspicion: null,
      shotUsed: false,
      virginUsed: false,
      artistUsed: false,
      assassinUsed: false,
      foolUsed: false,
      grandchild: null,
      drunkFrom: null, // drunk from now on (Sweetheart, Philosopher)
      lastingPoison: null, // poisoned from now on (Snake Charmer)
      vigor: false, // a Minion killed by the Vigormortis keeps their ability
      gained: null, // the ability a Philosopher (or Cannibal, Pixie) gained
      gainedNight: 0, // the night a gained first-night ability is used
      bluffGained: null, // ...or that an evil Philosopher bluffer "gained"
      seamUsed: false,
      juggled: false,
      savantDay: 0,
      mad: null, // { role, day, previous } from the Cerenovus
      memories: [],
      talks: [],
      death: null,
      drunkTonight: false, // drunk until dusk (Sailor, Innkeeper, Goon...)
      drunkTill: 0, // drunk through this night and the next day (Courtier)
      safeNight: 0, // can't die on this night (Innkeeper)
      courtierUsed: false,
      professorUsed: false,
      gossipDay: 0,
      undead: false, // a Zombuul that died once: registers as dead
      zombuulUsed: false,
    };
  });

  // The Demon learns three good characters that are not in play (nor shown
  // to a Drunk, and never the Drunk itself) and bluffs as one of them. Each
  // Minion also learns them with probability `minionBluffChance`; a Minion who
  // doesn't bluffs as any Townsfolk on the script.
  //
  // The Spy sees the Grimoire, so always knows the bluffs, and claims a
  // character that is neither in play nor one of the Demon's bluffs, so it
  // never doubles up with anyone.
  // (Neither shown nor dealt, and never the Lunatic.)
  const tokens = new Set(players.map((p) => p.shown));
  const notInPlay = script.ids.filter(
    (x) =>
      alignment(x) === "good" &&
      !["drunk", "lunatic"].includes(x) &&
      !tokens.has(x) &&
      !roles.includes(x),
  );
  const demonBluffs = sample(notInPlay, 3, r);
  const spyOptions = notInPlay.filter((x) => !demonBluffs.includes(x));

  // The Demon picks first and the Spy last, so the Spy sees every claim.
  const order = (p) =>
    team(p.role) === "demon" ? 0 : p.role === "spy" ? 2 : 1;
  // (Not the Marionette, who thinks they're good and claims their token.)
  const evil = players
    .filter((x) => x.alignment === "evil" && x.role !== "marionette")
    .sort((a, b) => order(a) - order(b));
  const taken = new Set();

  for (const p of evil) {
    const spy = p.role === "spy";
    const knows =
      team(p.role) === "demon" || spy || r() < minionBluffChance;
    const options = spy
      ? spyOptions.length
        ? spyOptions
        : demonBluffs
      : knows && demonBluffs.length
        ? demonBluffs
        : pool("townsfolk");

    // The Demon avoids first-night information roles; Minions favour them,
    // so their Night 1 "information" can back up the Demon's claim.
    // Teammates avoid claiming the same character when they can.
    const firstNight = (x) => FIRST_NIGHT_INFO.includes(x);
    const free = options.filter((x) => !taken.has(x));
    const preferred = free.filter((x) =>
      team(p.role) === "demon" ? !firstNight(x) : firstNight(x),
    );

    p.bluffs = knows ? demonBluffs : [];
    p.bluff = pick(preferred, r) ?? pick(free, r) ?? pick(options, r) ?? "chef";
    taken.add(p.bluff);

    // Like a real Mutant, a Mutant bluffer can't claim it openly: they claim
    // a Townsfolk that isn't in play instead (and can admit to the Mutant
    // once dead).
    p.claim =
      p.bluff === "mutant"
        ? (pick(
            pool("townsfolk").filter((x) => !tokens.has(x) && !taken.has(x)),
            r,
          ) ?? "chef")
        : p.bluff;
    taken.add(p.claim);
  }

  // The Lunatic thinks they're the Demon. They're shown their own 3 bluffs
  // (good characters, which may be in play) and claim one, and their own
  // "Minions": the real Demon and good NPCs, as many as there are Minions
  // (at least 2).
  const realDemon = evil.find((x) => team(x.role) === "demon");

  for (const p of players.filter((x) => x.role === "lunatic" && !x.human)) {
    const goods = script.ids.filter(
      (x) => alignment(x) === "good" && !["drunk", "lunatic"].includes(x),
    );
    const others = players.filter(
      (x) => !x.human && x !== p && x.alignment === "good",
    );

    p.bluffs = sample(goods, 3, r);
    p.claim = pick(p.bluffs, r) ?? p.claim;
    p.bluff = p.claim;
    p.lunaticTeam = shuffle(
      [
        realDemon,
        ...sample(others, Math.max(2, m) - 1, r),
      ].filter(Boolean),
      r,
    ).map((x) => x.id);
  }

  // The Mutant is "mad" that they're not an Outsider: they claim a Townsfolk
  // that isn't in play (and that no evil player is claiming).
  for (const p of players.filter((x) => x.role === "mutant" && !x.human)) {
    p.claim =
      pick(
        pool("townsfolk").filter((x) => !tokens.has(x) && !taken.has(x)),
        r,
      ) ?? p.claim;
  }

  // The Evil Twin is paired with a good player; they know each other. The
  // Evil Twin claims their good twin's character.
  const evilTwin = players.find((x) => x.role === "eviltwin");
  const goodTwin =
    evilTwin &&
    pick(
      players.filter((x) => x.alignment === "good"),
      r,
    );

  if (goodTwin) {
    evilTwin.claim = goodTwin.claim;
    evilTwin.bluff = goodTwin.claim;
  }

  // Fortune Teller red herring.
  const red = pick(
    players.filter((x) => x.alignment === "good"),
    r,
  )?.id;

  const s = {
    version: "2.4.0",
    script,
    seats,
    seed: String(seed),
    r,
    players,
    humanId: "p1",
    phase: "night",
    night: 1,
    day: 0,
    winner: null,
    reason: null,
    publicLog: [],
    privateLog: [],
    audit: [],
    auditId: 1,
    poisoned: null,
    lastExecution: null,
    lastVote: null,
    nominated: [],
    talked: [],
    talkDay: 0,
    red,
    demonBluffs,
    options: { minionBluffChance },
    slayerUsed: false,
    moonCurse: null,
    advocate: null,
    scapegoat: null,
    twins: goodTwin ? { evilId: evilTwin.id, goodId: goodTwin.id } : null,
    fangGuJumped: false,
    lastingPoison: [], // { id, by } poisoned while `by` lives (Vigormortis)
    witched: null, // { targetId, day, effective }
    arbitraryNight: null, // a night the Pit-Hag made a Demon
    barberPending: null, // a Barber executed today: the Demon swaps tonight
    juggle: null, // { byId, night, guesses: [{ id, role }] }
    executedToday: false,
    dayVoters: [],
    dayNominators: [],
    statements: [], // { byId, day, type, targetId, source }: said in public
    marks: {}, // your Good / Evil marks on players, by id
    voteHistory: [], // { day, nominatorId, nomineeId, voterIds }
    nightDeaths: [], // announced at dawn
    dawnLearn: [], // "when you learn that you died", at dawn
    woke: [], // who woke tonight due to their ability (the Chambermaid)
    sailorPending: [], // { sailorId, targetId }: who's drunk isn't decided yet
    diedToday: false, // anyone died today (the Zombuul)
    outsiderDiedToday: false, // an Outsider died today (the Godfather)
    gossip: [], // { byId, day, truth }: public statements made by a Gossip
    pukka: null, // { targetId }: poisoned by the Pukka, dies next night
    shabaloth: [], // ids the Shabaloth chose last night
    minstrelUntil: 0, // everyone else is drunk through this night (Minstrel)
    mastermindDay: null, // the extra day after the Demon was executed
    revived: [], // brought back to life tonight, announced at dawn
    block: null, // { nomineeId, count }: marked for execution today
    pending: null,
    humanChoice: null,
  };

  const setupLog = (type, text) =>
    s.audit.push({ id: s.auditId++, group: "Setup", type, text, names: logNames(s) });

  players.forEach((p) =>
    setupLog(
      "role",
      `${p.label}: ${name(p.role)}; shown ${name(p.shown)}; claim ${name(p.claim)}.`,
    ),
  );

  const demon = evil.find((x) => team(x.role) === "demon");

  setupLog(
    "bluffs",
    `Demon bluffs (told to ${demon?.label ?? "the Demon"}): ${
      demonBluffs.map(name).join(", ") || "none"
    }. ${demon ? `${demon.label} bluffs as ${name(demon.claim)}.` : ""}`.trim(),
  );

  if (goodTwin) {
    setupLog(
      "eviltwin",
      `${evilTwin.label} (Evil Twin) is paired with ${goodTwin.label} (${name(
        goodTwin.role,
      )}) and claims ${name(evilTwin.claim)}.`,
    );
  }

  for (const p of players.filter((x) => x.role === "marionette")) {
    setupLog(
      "marionette",
      `${p.label} is the Marionette, sitting next to the Demon; they think they are the ${name(
        p.shown,
      )}. The Demon knows who they are.`,
    );
  }

  for (const p of players.filter((x) => x.lunaticTeam)) {
    setupLog(
      "lunatic",
      `${p.label} (Lunatic) thinks they are the ${name(p.shown)}; bluffs ${p.bluffs
        .map(name)
        .join(", ")}; claims ${name(p.claim)}; "Minions": ${p.lunaticTeam
        .map((id) => players.find((x) => x.id === id).label)
        .join(", ")}. The Demon knows who they are.`,
    );
  }

  for (const p of evil.filter((x) => team(x.role) === "minion")) {
    setupLog(
      "bluffs",
      `${p.label} (${name(p.role)}) ${
        p.bluffs.length ? "knows" : "does not know"
      } the Demon's bluffs.`,
    );
  }

  return s;
}
