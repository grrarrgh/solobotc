import {
  ROLES,
  COUNTS,
  FORBIDDEN_HUMAN,
  FIRST_NIGHT_INFO,
  ONGOING_INFO,
  MINION_BLUFF_CHANCE,
  team,
  alignment,
  name,
} from "./data.js";
import { rng, pick, sample, shuffle } from "./util.js";

// Draws n Townsfolk, alternating first-night and ongoing information roles
// until there are two of each (or no Townsfolk slots left), then fills the
// rest at random.
function drawTownsfolk(pool, n, r) {
  const first = shuffle(
    pool.filter((x) => FIRST_NIGHT_INFO.includes(x)),
    r,
  );
  const ongoing = shuffle(
    pool.filter((x) => ONGOING_INFO.includes(x)),
    r,
  );
  const picked = [];

  for (let k = 0; k < 2; k++) {
    for (const group of [first, ongoing]) {
      if (picked.length < n && group.length) {
        picked.push(group.shift());
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
  if (!base) throw Error("Choose 5–15 seats");

  const r = rng(seed),
    pool = (t) => script.ids.filter((id) => team(id) === t);

  // Draw roles; the Baron swaps two townsfolk for two outsiders.
  let [t, o, m] = base;
  const mins = sample(pool("minion"), m, r);
  if (mins.includes("baron")) {
    t -= 2;
    o += 2;
  }

  let roles = shuffle(
    [
      ...drawTownsfolk(pool("townsfolk"), t, r),
      ...sample(pool("outsider"), o, r),
      ...mins,
      ...sample(pool("demon"), 1, r),
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

  // Move the human's role into seat 1.
  const hi = pick(safe, r);
  [roles[0], roles[hi]] = [roles[hi], roles[0]];

  const used = new Set(roles),
    unusedTF = pool("townsfolk").filter((x) => !used.has(x));

  // The Drunk is shown a Townsfolk token that isn't in play; a human Drunk
  // is never shown a role that is unsafe in solo play.
  const drunkToken = (human) => {
    const k = unusedTF.findIndex((x) => !human || !FORBIDDEN_HUMAN.has(x));
    return k < 0 ? "chef" : unusedTF.splice(k, 1)[0];
  };

  const players = roles.map((role, i) => {
    const shown = role === "drunk" ? drunkToken(i === 0) : role;
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
      memories: [],
      talks: [],
      death: null,
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
  const tokens = new Set(players.map((p) => p.shown));
  const notInPlay = script.ids.filter(
    (x) => alignment(x) === "good" && x !== "drunk" && !tokens.has(x),
  );
  const demonBluffs = sample(notInPlay, 3, r);
  const spyOptions = notInPlay.filter((x) => !demonBluffs.includes(x));

  // The Demon picks first and the Spy last, so the Spy sees every claim.
  const order = (p) =>
    team(p.role) === "demon" ? 0 : p.role === "spy" ? 2 : 1;
  const evil = players
    .filter((x) => x.alignment === "evil")
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
    p.claim = p.bluff;
    taken.add(p.bluff);
  }

  // Fortune Teller red herring.
  const red = pick(
    players.filter((x) => x.alignment === "good"),
    r,
  )?.id;

  const s = {
    version: "2.3.1",
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
    pending: null,
    humanChoice: null,
  };

  const setupLog = (type, text) =>
    s.audit.push({ id: s.auditId++, group: "Setup", type, text });

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
