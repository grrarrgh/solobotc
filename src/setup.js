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
  TRAVELLERS,
  FABLED,
  HIDDEN_OUTSIDERS,
  HIDDEN_BLUFF_CHANCE,
  HIDE_NEVER_AS,
  VILLAGE_IDIOT_EXTRAS,
  MEZEPHELES_NIGHTS,
  LEGION_MAJORITY,
  LEGION_STRONG,
  LEGION_STRONG_SHARE,
  exclusiveWith,
  ALCHEMIST_ABILITIES,
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

// The No Dashii poisons its nearest Townsfolk on each side, so the
// Marionette (who isn't one) beside it pushes that poison along. The seat
// next to the Demon (`di`) to swap the Marionette (`mi`) into that leaves
// its two poisoned Townsfolk furthest away, counting seats both ways; a tie
// at random. Never your seat (0).
function marionetteSeat(roles, mi, di, r) {
  const n = roles.length;
  const reach = (order) => {
    let total = 0;

    for (const d of [-1, 1]) {
      for (let k = 1; k < n; k++) {
        if (team(order[(di + d * k + n) % n]) === "townsfolk") {
          total += k;
          break;
        }
      }
    }

    return total;
  };
  const options = [(di + n - 1) % n, (di + 1) % n]
    .filter((i) => i !== 0)
    .map((i) => {
      const order = [...roles];

      [order[mi], order[i]] = [order[i], order[mi]];

      return { i, far: reach(order) };
    });
  const best = Math.max(...options.map((x) => x.far));

  return pick(
    options.filter((x) => x.far === best),
    r,
  )?.i;
}

export function parseScript(raw) {
  const meta = raw.find((x) => typeof x === "object" && x.id === "_meta") ?? {
      name: "Unnamed",
    },
    // Scripts list roles either as "id" strings or as { "id": ... } objects.
    // (Travellers are left out: see TRAVELLERS. Fabled are kept apart: see
    // FABLED.)
    all = raw
      .map((x) => (typeof x === "string" ? x : x?.id))
      .filter((id) => id && id !== "_meta" && !TRAVELLERS.includes(id)),
    ids = all.filter((id) => !FABLED.includes(id)),
    fabled = all.filter((id) => FABLED.includes(id)),
    bad = ids.filter((x) => !ROLES[x]);

  if (bad.length) throw Error(`Unsupported: ${bad}`);

  return { meta, ids, fabled };
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

  // (Once the evil team is drawn, characters jinxed never to be in play
  // with any of them are left out: the Heretic with a Baron, Spy...)
  let barred = [];
  const r = rng(seed),
    pool = (t) => script.ids.filter((id) => team(id) === t && !barred.includes(id));

  // Draw roles. Some characters change the Outsider count (the Baron +2,
  // the Fang Gu +1, the Vigormortis -1, the Godfather -1 or +1, the
  // Sentinel Fabled -1, 0 or +1), trading Townsfolk for Outsiders.
  let [t, o, m] = base;
  let mins = sample(pool("minion"), m, r);
  let demons = sample(pool("demon"), 1, r);

  // Legion: most players are Legion (see LEGION_MAJORITY), with no Minions.
  // The rest are good: any mix of Townsfolk and Outsiders, as the
  // Storyteller likes. Here, a random number of Outsiders from 0 to the
  // standard count for the seats (at 12: 0, 1 or 2 of the 5).
  if (demons[0] === "legion") {
    const legion = Math.floor(seats / 2) + LEGION_MAJORITY;
    const good = seats - legion;

    mins = [];
    demons = Array(legion).fill("legion");
    o = Math.min(Math.floor(r() * (o + 1)), good - 1);
    t = good - o;
  }

  barred = [...new Set([...mins, ...demons])].flatMap((x) =>
    exclusiveWith(x).filter((id) => script.ids.includes(id)),
  );
  const shift = [...mins, ...demons, ...script.fabled].reduce((n, id) => {
    const k = OUTSIDER_MODIFIERS[id] ?? 0;

    return n + (Array.isArray(k) ? pick(k, r) : k);
  }, 0);
  const outsiders = Math.min(Math.max(0, o + shift), pool("outsider").length);

  t -= outsiders - o;
  o = outsiders;

  // In a Legion game, good gets strong Townsfolk first (see LEGION_STRONG).
  const legionGame = demons[0] === "legion";
  const strong = legionGame
    ? sample(
        pool("townsfolk").filter((x) => LEGION_STRONG.includes(x)),
        Math.min(t, Math.ceil(t * LEGION_STRONG_SHARE)),
        r,
      )
    : [];
  const townsfolk = [
    ...strong,
    ...drawTownsfolk(
      pool("townsfolk").filter((x) => !strong.includes(x)),
      t - strong.length,
      r,
    ),
  ];

  // The Village Idiot brings 0, 1 or 2 more, in other Townsfolk's places
  // (see VILLAGE_IDIOT_EXTRAS).
  if (townsfolk.includes("villageidiot")) {
    const extras = pick(VILLAGE_IDIOT_EXTRAS, r);
    const others = townsfolk
      .map((x, i) => (x === "villageidiot" ? -1 : i))
      .filter((i) => i >= 0);

    for (const i of sample(others, extras, r)) {
      townsfolk[i] = "villageidiot";
    }
  }
  const outsiderRoles = sample(pool("outsider"), o, r);

  // The Huntsman brings the Damsel: she takes an Outsider's place, or (with
  // no Outsiders) a Townsfolk's.
  if (
    townsfolk.includes("huntsman") &&
    pool("outsider").includes("damsel") &&
    !outsiderRoles.includes("damsel")
  ) {
    const others = townsfolk
      .map((x, i) => (x === "huntsman" ? -1 : i))
      .filter((i) => i >= 0);

    if (outsiderRoles.length) {
      outsiderRoles[Math.floor(r() * outsiderRoles.length)] = "damsel";
    } else if (others.length) {
      townsfolk[pick(others, r)] = "damsel";
    }
  }

  let roles = shuffle([...townsfolk, ...outsiderRoles, ...mins, ...demons], r);

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

  // Move the human's role into seat 1 (never the Drunk: see notForHuman).
  // In a Legion game, a strong one if there is one.
  const strongSafe = legionGame ? safe.filter((i) => LEGION_STRONG.includes(roles[i])) : [];
  const hi = pick(strongSafe.length ? strongSafe : safe, r);
  [roles[0], roles[hi]] = [roles[hi], roles[0]];

  const used = new Set(roles),
    unusedTF = pool("townsfolk").filter((x) => !used.has(x));

  // The Drunk is shown a Townsfolk token that isn't in play; a human Drunk
  // is never shown a role that is unsafe in solo play.
  // (The Marionette is never shown the Huntsman without the Damsel in play:
  // see JINXES.)
  const drunkToken = (human, puppet = false) => {
    const k = unusedTF.findIndex(
      (x) =>
        (!human || !FORBIDDEN_HUMAN.has(x)) &&
        !(puppet && x === "huntsman" && !roles.includes("damsel")),
    );
    return k < 0 ? "chef" : unusedTF.splice(k, 1)[0];
  };

  // The Marionette sits next to the Demon (never in your seat); everyone
  // else stays where they were dealt. Next to the No Dashii, the side that
  // pushes its poison furthest away (see marionetteSeat()).
  const mi = roles.indexOf("marionette");
  const di = roles.findIndex((x) => team(x) === "demon");

  if (mi > 0 && di >= 0) {
    const n = roles.length;
    const near = [(di + n - 1) % n, (di + 1) % n];
    const seat =
      roles[di] === "nodashii"
        ? marionetteSeat(roles, mi, di, r)
        : near.includes(mi)
          ? mi
          : near.find((i) => i !== 0);

    if (seat !== undefined && seat !== mi) {
      [roles[mi], roles[seat]] = [roles[seat], roles[mi]];
    }
  }

  // The Lunatic is shown a Demon, but not the one in play.
  // (Never Legion: they'd think most players were on their team.)
  const demonToken =
    pick(
      pool("demon").filter((x) => x !== demons[0] && x !== "legion"),
      r,
    ) ??
    demons[0] ??
    "imp";

  const players = roles.map((role, i) => {
    // The Marionette, like the Drunk, is shown a Townsfolk not in play.
    const shown =
      role === "drunk" || role === "marionette"
        ? drunkToken(i === 0, role === "marionette")
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
      gainedNight: 0, // the night a gained first-night ability is used (Cannibal, Barber swap)
      seamUsed: false,
      juggled: false,
      savantDay: 0,
      fishermanUsed: false,
      huntsmanUsed: false,
      puzzleUsed: false,
      damselGuessed: false, // a Minion's one Damsel guess
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

  // With more than one Village Idiot, the Storyteller makes one drunk.
  const idiots = players.filter((x) => x.role === "villageidiot");

  if (idiots.length > 1) {
    const d = pick(idiots, r);

    d.drunkFrom = "villageidiot";
    d.drunkFromBy = "the Storyteller (the drunk Village Idiot)";
  }

  // The Demon learns three good characters that are not in play (nor shown
  // to a Drunk, and never the Drunk itself) and bluffs as one of them. Each
  // Minion also learns them with probability `minionBluffChance`; a Minion who
  // doesn't bluffs as any Townsfolk on the script.
  //
  // The Spy sees the Grimoire, so always knows the bluffs, and claims a
  // character that is neither in play nor one of the Demon's bluffs, so it
  // never doubles up with anyone.
  // (Neither shown nor dealt, and never the Drunk.) The Lunatic can be a
  // bluff, but nobody claims it while alive: an evil player who dies may
  // say they were the Lunatic (see characters/outsider/lunatic.js). Never
  // the Poppy Grower or Heretic, whom nobody claims openly (a real Poppy
  // Grower always hides; a Heretic only says so in the final 3): bluffs the
  // team couldn't use.
  const tokens = new Set(players.map((p) => p.shown));
  const notInPlay = script.ids.filter(
    (x) =>
      alignment(x) === "good" &&
      x !== "drunk" &&
      !["poppygrower", "heretic"].includes(x) &&
      !tokens.has(x) &&
      !roles.includes(x),
  );
  // (Nor the Poppy Grower: a real one always hides. See poppygrower.js.)
  const claimable = (x) => x !== "lunatic" && x !== "poppygrower";
  // Legion are many: half as many bluffs as Legion (rounded up), 1 of them
  // an Outsider when the game has Outsiders (all Legion share them). (Never
  // the Lunatic: Legion would have no use for it.)
  const legions = demons.length > 1 ? demons.length : 0;
  const outsiderBluff =
    legions && o > 0
      ? sample(notInPlay.filter((x) => team(x) === "outsider" && claimable(x)), 1, r)
      : [];
  const demonBluffs = legions
    ? [
        ...outsiderBluff,
        ...sample(
          notInPlay.filter((x) => !outsiderBluff.includes(x) && team(x) !== "outsider"),
          Math.ceil(legions / 2) - outsiderBluff.length,
          r,
        ),
      ]
    : sample(notInPlay, 3, r);
  const spyOptions = notInPlay.filter((x) => !demonBluffs.includes(x) && claimable(x));

  // The Demon picks first and the Spy last, so the Spy sees every claim.
  const order = (p) =>
    team(p.role) === "demon" ? 0 : p.role === "spy" ? 2 : 1;
  // (Not the Marionette, who thinks they're good and claims their token.)
  const evil = players
    .filter((x) => x.alignment === "evil" && x.role !== "marionette")
    .sort((a, b) => order(a) - order(b));
  const taken = new Set();
  // (A Spy or Widow on the team has seen the Grimoire: see
  // HIDDEN_BLUFF_CHANCE.)
  // With a Poppy Grower dealt (one who has their ability: never the Drunk's
  // token), the Minions and Demon don't learn who each other are, nor the
  // Demon its bluffs; and (their jinxes) the Spy and Widow don't see the
  // Grimoire. Each picks a bluff on their own: they don't know each other's.
  // (They learn when the Poppy Grower dies: see poppygrower.js.)
  const poppy = players.some((x) => x.role === "poppygrower");
  const grimoire = !poppy && evil.some((x) => ["spy", "widow"].includes(x.role));

  for (const p of evil) {
    const spy = p.role === "spy" && !poppy;
    const knows =
      !poppy && (team(p.role) === "demon" || spy || r() < minionBluffChance);

    if (poppy) {
      p.poppyBlind = true;
      taken.clear();
    }
    const options = (
      spy
        ? spyOptions.length
          ? spyOptions
          : demonBluffs
        : knows && demonBluffs.length
          ? demonBluffs
          : pool("townsfolk")
    ).filter(claimable);

    // The Demon avoids first-night information roles; Minions favour them,
    // so their Night 1 "information" can back up the Demon's claim.
    // Teammates avoid claiming the same character when they can.
    // (Not the Alchemist: what they learn names nobody, so backs up nobody.)
    const firstNight = (x) => FIRST_NIGHT_INFO.includes(x) && x !== "alchemist";
    const free = options.filter((x) => !taken.has(x));
    const preferred = free.filter((x) =>
      team(p.role) === "demon" ? !firstNight(x) : firstNight(x),
    );

    // With the Damsel dealt, a Minion who knows the bluffs takes the
    // Huntsman if it's one: she may tell them who she is (see strategy
    // damselTo()).
    const fishing =
      team(p.role) === "minion" &&
      knows &&
      roles.includes("damsel") &&
      free.includes("huntsman");

    // (With every bluff taken by a teammate, a Townsfolk that might be in
    // play.)
    p.bluffs = knows ? demonBluffs : [];
    p.bluff = fishing
      ? "huntsman"
      : (pick(preferred, r) ??
        pick(free, r) ??
        pick(
          pool("townsfolk").filter((x) => claimable(x) && !taken.has(x)),
          r,
        ) ??
        pick(options, r) ??
        "chef");

    // A Mutant or Damsel bluff can't be claimed openly: usually they take
    // another bluff instead, or with none free, a Townsfolk that might be in
    // play (see HIDDEN_BLUFF_CHANCE).
    if (
      HIDDEN_OUTSIDERS.includes(p.bluff) &&
      !grimoire &&
      r() >= HIDDEN_BLUFF_CHANCE
    ) {
      p.bluff =
        pick(
          free.filter((x) => x !== p.bluff && !HIDDEN_OUTSIDERS.includes(x)),
          r,
        ) ??
        pick(
          pool("townsfolk").filter((x) => claimable(x) && !taken.has(x)),
          r,
        ) ??
        p.bluff;
    }

    taken.add(p.bluff);

    // Like a real Mutant (or Damsel), one who keeps the bluff claims a
    // Townsfolk instead (and can admit to it once dead): one that isn't in
    // play if the team has seen the Grimoire, else any it isn't using.
    p.claim = HIDDEN_OUTSIDERS.includes(p.bluff)
      ? (pick(
          pool("townsfolk").filter(
            (x) =>
              claimable(x) &&
              !taken.has(x) &&
              !(grimoire && tokens.has(x)) &&
              !HIDE_NEVER_AS.includes(x),
          ),
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

  // (In a Legion game, never one of the Legion's bluffs.)
  for (const p of players.filter((x) => x.role === "lunatic" && !x.human)) {
    const goods = script.ids.filter(
      (x) =>
        alignment(x) === "good" &&
        !["drunk", "lunatic"].includes(x) &&
        !(legions && demonBluffs.includes(x)),
    );
    const others = players.filter(
      (x) => !x.human && x !== p && x.alignment === "good",
    );

    p.bluffs = sample(goods, 3, r);
    // (Preferably one nobody is, or claims: a double claim would count
    // against them, and against whoever else claims it. With the Poppy
    // Grower, they get no bluffs, as a real Demon wouldn't: any Townsfolk.)
    // (Never the Heretic, who only says so in the final 3: see heretic.js.)
    const claims = (poppy ? goods.filter((x) => team(x) === "townsfolk") : p.bluffs).filter(
      (x) => x !== "heretic",
    );

    p.claim =
      pick(
        claims.filter((x) => !taken.has(x) && !tokens.has(x)),
        r,
      ) ??
      pick(claims.filter((x) => !taken.has(x)), r) ??
      pick(claims, r) ??
      p.claim;
    taken.add(p.claim);
    p.bluff = p.claim;
    p.lunaticTeam = shuffle(
      [
        realDemon,
        ...sample(others, Math.max(2, m) - 1, r),
      ].filter(Boolean),
      r,
    ).map((x) => x.id);

    // (With the Poppy Grower, a Demon learns neither its Minions nor its
    // bluffs, so nor does the Lunatic, who thinks they're one. They learn
    // them when the Poppy Grower dies: see poppygrower.js. The Demon still
    // knows who they are: that's the Lunatic's own ability.)
    if (poppy) {
      p.lunaticLater = { team: p.lunaticTeam, bluffs: p.bluffs };
      p.lunaticTeam = [];
      p.bluffs = [];
    }
  }

  // The Mutant is "mad" that they're not an Outsider, and the Damsel hides
  // from the Minions: they claim a Townsfolk (see HIDDEN_OUTSIDERS). (The
  // Damsel tells a Huntsman the truth: see strategy damselTo().) They don't
  // know what's in play: any Townsfolk on the script (but never one nobody
  // claims openly, like the Pixie or Virgin: see HIDE_NEVER_AS).
  for (const p of players.filter(
    (x) => HIDDEN_OUTSIDERS.includes(x.role) && !x.human,
  )) {
    p.claim =
      pick(
        pool("townsfolk").filter((x) => !HIDE_NEVER_AS.includes(x)),
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

  // The Magician dealt at setup: on Night 1 the evil team is shown them as
  // one of its own (see strategy fooledBy()).
  for (const p of players.filter((x) => x.role === "magician")) {
    p.magicianTrick = true;
  }

  // The night the Mezepheles turns a good NPC evil (see
  // characters/minion/mezepheles.js).
  const mezepheles = players.some((x) => x.role === "mezepheles")
    ? { night: pick(MEZEPHELES_NIGHTS, r), used: false }
    : null;

  const s = {
    version: "2.5.0",
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
    mezepheles,
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

  // Each Alchemist (or a Drunk shown the Alchemist, to no effect) has the
  // ability of a Minion on the script that isn't in play (see
  // ALCHEMIST_ABILITIES), learned on Night 1 (see alchemist.js).
  for (const p of players.filter((x) => x.role === "alchemist" || x.shown === "alchemist")) {
    const inPlay = new Set(players.map((x) => x.role));

    p.alchemist =
      pick(
        script.ids.filter((id) => ALCHEMIST_ABILITIES.includes(id) && !inPlay.has(id)),
        r,
      ) ?? null;
    setupLog(
      "alchemist",
      p.alchemist
        ? `${p.label} (${p.role === "alchemist" ? "Alchemist" : `${name(p.role)}, shown the Alchemist`}) has the ${name(p.alchemist)} ability.`
        : `${p.label} (Alchemist) has no Minion ability: every one they could have is in play.`,
    );
  }

  const demon = evil.find((x) => team(x.role) === "demon");

  for (const id of new Set(barred)) {
    setupLog(
      "jinx",
      `The ${name(id)} is left out: only 1 of it and the ${players
        .filter((x) => exclusiveWith(id).includes(x.role))
        .map((x) => name(x.role))
        .join(", ")} can be in play.`,
    );
  }

  if (poppy) {
    setupLog(
      "poppygrower",
      "The Poppy Grower is in play: the Minions and Demon don't learn who each other are, the Demon isn't told its bluffs, and the Spy and Widow don't see the Grimoire, until the Poppy Grower dies.",
    );
  }

  setupLog(
    "bluffs",
    `Demon bluffs (${poppy ? "not told: the Poppy Grower" : `told to ${legions ? "every Legion" : (demon?.label ?? "the Demon")}`}): ${
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

  for (const p of idiots.filter((x) => x.drunkFrom)) {
    setupLog(
      "villageidiot",
      `${idiots.length} Village Idiots: ${idiots
        .map((x) => x.label)
        .join(", ")}. ${p.human ? "You are" : `${p.label} is`} the drunk one.`,
    );
  }

  if (demons[0] === "legion") {
    setupLog(
      "legion",
      `${demons.length} of ${seats} players are Legion, and there are no Minions.`,
    );
  }

  if (mezepheles) {
    setupLog(
      "mezepheles",
      `The Mezepheles turns a good player evil on Night ${mezepheles.night}, if alive.`,
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
        .join(", ") || "none (the Poppy Grower)"}; claims ${name(p.claim)}; "Minions": ${
        p.lunaticTeam.map((id) => players.find((x) => x.id === id).label).join(", ") ||
        "not shown (the Poppy Grower)"
      }. The Demon knows who they are.`,
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

  // (log.txt's character histories start from the deal as it ends up: see
  // log.js rolesSoFar().)
  s.logRoles = null;

  return s;
}
