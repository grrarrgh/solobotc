import { ROLES, COUNTS, FORBIDDEN_HUMAN, team, alignment, name } from "./data.js";
import { rng, pick, sample, shuffle } from "./util.js";

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

export function createState(raw, seats, seed = Date.now()) {
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
      ...sample(pool("townsfolk"), t, r),
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

  // Evil players bluff as good characters not in play. Nobody claims the
  // Drunk: a real Drunk believes they are a Townsfolk.
  const bluffs = sample(
    script.ids.filter(
      (x) => alignment(x) === "good" && x !== "drunk" && !used.has(x),
    ),
    3,
    r,
  );
  players
    .filter((x) => x.alignment === "evil")
    .forEach((p, i) => {
      p.bluff = bluffs[i % Math.max(1, bluffs.length)] ?? "chef";
      p.claim = p.bluff;
    });

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
    slayerUsed: false,
    moonCurse: null,
    advocate: null,
  };

  players.forEach((p) =>
    s.audit.push({
      id: s.auditId++,
      group: "Setup",
      type: "role",
      text: `${p.label}: ${name(p.role)}; shown ${name(p.shown)}; claim ${name(p.claim)}.`,
    }),
  );

  return s;
}
