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
  NOT_YET,
  FABLED,
  HIDDEN_OUTSIDERS,
  FACE_DOWN_OUTSIDERS,
  DEMON_KILL_PRIORITY,
  HIDDEN_BLUFF_CHANCE,
  HIDE_NEVER_AS,
  VILLAGE_IDIOT_EXTRAS,
  MEZEPHELES_NIGHTS,
  LEGION_MAJORITY,
  LEGION_STRONG,
  LEGION_STRONG_SHARE,
  ATHEIST_CHANCE,
  ATHEIST_DUPLICATES,
  ATHEIST_DUPLICABLE,
  ATHEIST_MUDDLERS,
  EVIL_ATHEIST_BLUFF_CHANCE,
  exclusiveWith,
  ALCHEMIST_ABILITIES,
  team,
  alignment,
  name,
} from "./data.js";
import { rng, pick, sample, shuffle } from "./util.js";
import { logNames } from "./log.js";
import { pixieStart } from "./characters/townsfolk/pixie.js";

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
    // (Travellers are left out: see TRAVELLERS; so are characters the game
    // doesn't run yet: see NOT_YET. Fabled are kept apart: see FABLED.)
    all = raw
      .map((x) => (typeof x === "string" ? x : x?.id))
      .filter((id) => id && id !== "_meta" && !TRAVELLERS.includes(id) && !NOT_YET.includes(id)),
    ids = all.filter((id) => !FABLED.includes(id)),
    fabled = all.filter((id) => FABLED.includes(id)),
    bad = ids.filter((x) => !ROLES[x]);

  if (bad.length) throw Error(`Unsupported: ${bad}`);

  return { meta, ids, fabled };
}

// The Demon's 3 bluffs, from `pool` (the good characters it may be told):
// 1 high-value Townsfolk (`kill: "high"` in CHARACTERS), 1 of medium or low
// value, and a 3rd: an Outsider if a face-down Outsider is in play
// (`faceDown`: the town sees one Outsider fewer than the count for the
// seats, so a Demon claiming one fills the gap), else another medium or
// low Townsfolk. Never more than 1 Outsider: short of a kind, any other
// Townsfolk, and only then an Outsider.
export function demonBluffSet(pool, faceDown, r) {
  const tf = pool.filter((x) => team(x) === "townsfolk");
  const high = tf.filter((x) => DEMON_KILL_PRIORITY[x] === "high");
  const lesser = tf.filter((x) => DEMON_KILL_PRIORITY[x] !== "high");
  const outsiders = pool.filter((x) => team(x) === "outsider");
  const out = [];
  const take = (list, n = 1) => {
    if (n > 0) {
      out.push(...sample(list.filter((x) => !out.includes(x)), n, r));
    }
  };

  take(high);
  take(lesser, faceDown ? 1 : 2);

  if (faceDown) {
    take(outsiders);
  }

  take(tf, 3 - out.length);

  if (!out.some((x) => team(x) === "outsider")) {
    take(outsiders, Math.min(1, 3 - out.length));
  }

  return shuffle(out, r);
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
  // (The Atheist is dealt only in an Atheist game: see below.)
  let barred = [];
  let atheistGame = false;
  const r = rng(seed),
    pool = (t) =>
      script.ids.filter(
        (id) => team(id) === t && !barred.includes(id) && (id !== "atheist" || atheistGame),
      );

  // Draw roles. Some characters change the Outsider count (the Baron +2,
  // the Fang Gu +1, the Vigormortis -1, the Godfather -1 or +1, the
  // Sentinel Fabled -1, 0 or +1), trading Townsfolk for Outsiders.
  let [t, o, m] = base;

  // The Atheist: with it on the script, at ATHEIST_CHANCE nobody is evil.
  // The Storyteller still picks a Demon (one that kills at night) and
  // Minions to pretend are in play (see characters/townsfolk/atheist.js),
  // and Townsfolk are dealt in their places; the Outsiders are as many as
  // that pretend team would make them (one more for a Fang Gu). (Never a
  // pretend Evil Twin or Marionette: with nobody evil, neither could work.
  // With too few other Minions on the script, the pretend team is smaller.)
  atheistGame = script.ids.includes("atheist") && r() < ATHEIST_CHANCE;

  const pretend = atheistGame
    ? [
        pick(
          pool("demon").filter((x) => !["legion", "lilmonsta", "leviathan", "alhadikhia"].includes(x)),
          r,
        ) ?? "imp",
        ...sample(
          pool("minion").filter((x) => !["eviltwin", "marionette"].includes(x)),
          m,
          r,
        ),
      ]
    : [];

  if (atheistGame) {
    t += m + 1;
  }

  let mins = atheistGame ? [] : sample(pool("minion"), m, r);
  let demons = atheistGame ? [] : sample(pool("demon"), 1, r);

  // Lil' Monsta isn't a player: an extra Minion is dealt in its place, and
  // the Minions choose which of them babysits it (see
  // characters/demon/lilmonsta.js).
  const lilMonsta = demons[0] === "lilmonsta";

  if (lilMonsta) {
    demons = [];
    mins = [...mins, ...sample(pool("minion").filter((x) => !mins.includes(x)), 1, r)];
  }

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
  const shift = [...mins, ...demons, ...pretend, ...script.fabled].reduce((n, id) => {
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
  const forced = atheistGame ? ["atheist"] : [];
  const townsfolk = [
    ...forced,
    ...strong,
    ...drawTownsfolk(
      pool("townsfolk").filter((x) => !strong.includes(x) && !forced.includes(x)),
      t - strong.length - forced.length,
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
  // no Outsiders) a Townsfolk's (never the Atheist's, in an Atheist game).
  if (
    townsfolk.includes("huntsman") &&
    pool("outsider").includes("damsel") &&
    !outsiderRoles.includes("damsel")
  ) {
    const others = townsfolk
      .map((x, i) => (["huntsman", "atheist"].includes(x) ? -1 : i))
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

  // In an Atheist game, a few duplicates (see ATHEIST_DUPLICATES; fewer with
  // ATHEIST_MUDDLERS in play): each takes the place of a character of the
  // same kind (a Townsfolk's or an Outsider's, so the counts hold; not the
  // Atheist's, the Damsel's or a muddler's, nor one already a duplicate's
  // or copied) with a second copy of a character in play (yours only if you
  // can be dealt it). Logged below.
  const duplicates = [];
  const muddled = roles.filter((x) => ATHEIST_MUDDLERS.includes(x)).length;

  for (let k = 0; atheistGame && k < (ATHEIST_DUPLICATES[seats] ?? 1) - muddled; k++) {
    const copied = duplicates.map((d) => d.role);
    const role = pick(
      [...new Set(roles)].filter((x) => ATHEIST_DUPLICABLE.includes(x) && !copied.includes(x)),
      r,
    );
    const slots = roles
      .map((x, i) =>
        team(x) === team(role) &&
        !["atheist", "damsel", ...ATHEIST_MUDDLERS].includes(x) &&
        x !== role &&
        !copied.includes(x) &&
        !duplicates.some((d) => d.i === i) &&
        (i > 0 || !FORBIDDEN_HUMAN.has(role))
          ? i
          : -1,
      )
      .filter((i) => i >= 0);
    const i = role ? pick(slots, r) : null;

    if (i === null || i === undefined) {
      break;
    }

    duplicates.push({ i, role, was: roles[i] });
    roles[i] = role;
  }

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

  // Lil' Monsta's first babysitter: a Minion at random (not the Marionette,
  // who thinks they're good). On later nights the Minions choose (see
  // lilmonsta.js).
  const sitter = lilMonsta
    ? (pick(
        roles
          .map((x, i) => (team(x) === "minion" && x !== "marionette" ? i : -1))
          .filter((i) => i >= 0),
        r,
      ) ?? -1)
    : -1;

  // The Marionette sits next to the Demon (never in your seat); everyone
  // else stays where they were dealt. Next to the No Dashii, the side that
  // pushes its poison furthest away (see marionetteSeat()). (By their jinx,
  // next to Lil' Monsta's first babysitter.)
  const mi = roles.indexOf("marionette");
  const di = lilMonsta ? sitter : roles.findIndex((x) => team(x) === "demon");

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
  // (Never Legion: they'd think most players were on their team. Nor Lil'
  // Monsta, which nobody is. Nor the Leviathan, which everyone would know
  // isn't in play; but with the Leviathan in play, the Leviathan: everyone
  // knows it is, so it's the Demon they must think they are.)
  const demonToken =
    demons[0] === "leviathan"
      ? "leviathan"
      : (pick(
          pool("demon").filter(
            (x) => x !== demons[0] && !["legion", "lilmonsta", "leviathan", "alhadikhia"].includes(x),
          ),
          r,
        ) ??
        demons[0] ??
        "imp");

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
      cannibal: false, // has the Cannibal ability without being the Cannibal (a Philosopher's)
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
      babysitting: i === sitter, // babysits Lil' Monsta: "is the Demon"
      babysat: i === sitter, // has babysat it (the Final reveal says so)
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
      !["poppygrower", "heretic", "atheist"].includes(x) &&
      !tokens.has(x) &&
      !roles.includes(x),
  );
  // (Nor the Poppy Grower: a real one always hides. See poppygrower.js.)
  const claimable = (x) => x !== "lunatic" && x !== "poppygrower";
  // Legion are many: half as many bluffs as Legion (rounded up), 1 of them
  // an Outsider when the game has Outsiders (all Legion share them). (Never
  // the Lunatic: Legion would have no use for it.)
  const legions = demons.length > 1 ? demons.length : 0;
  // (A face-down Outsider in play: the Demon gets an Outsider bluff.)
  const faceDown = roles.find((x) => FACE_DOWN_OUTSIDERS.includes(x)) ?? null;
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
    : demonBluffSet(notInPlay, faceDown, r);
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

  // With the Atheist on the script but not in play, a Minion may claim it
  // (EVIL_ATHEIST_BLUFF_CHANCE): a trap, as executing the Storyteller then
  // wins for evil. Only one who knows they're evil and has a bluff of their
  // own (never the Marionette, nor the Evil Twin, who claims their twin's
  // character), and never the Demon: executed, they'd lose the game. (The
  // draw is made only on a script with the Atheist.)
  const atheistLiar =
    script.ids.includes("atheist") &&
    !atheistGame &&
    r() < EVIL_ATHEIST_BLUFF_CHANCE &&
    pick(
      evil.filter((x) => team(x.role) === "minion" && x.role !== "eviltwin"),
      r,
    );

  if (atheistLiar) {
    atheistLiar.bluff = "atheist";
    atheistLiar.claim = "atheist";
  }

  // The Lunatic thinks they're the Demon. They're shown their own 3 bluffs
  // (good characters, which may be in play) and claim one, and their own
  // "Minions": the real Demon and good NPCs, as many as there are Minions
  // (at least 2).
  // (With Lil' Monsta, its babysitter.)
  const realDemon = evil.find((x) => team(x.role) === "demon" || x.babysitting);

  // (In a Legion game, never one of the Legion's bluffs.)
  for (const p of players.filter((x) => x.role === "lunatic" && !x.human)) {
    const goods = script.ids.filter(
      (x) =>
        alignment(x) === "good" &&
        // (Nor the Atheist: a good player never claims it falsely.)
        !["drunk", "lunatic", "atheist"].includes(x) &&
        !(legions && demonBluffs.includes(x)),
    );
    const others = players.filter(
      (x) => !x.human && x !== p && x.alignment === "good",
    );

    // (Shaped like a real Demon's: with the Lunatic in play, a face-down
    // Outsider, one of them is an Outsider.)
    p.bluffs = demonBluffSet(goods, true, r);
    // (Preferably one nobody is, or claims: a double claim would count
    // against them, and against whoever else claims it. With the Poppy
    // Grower, they get no bluffs, as a real Demon wouldn't: any Townsfolk.)
    // (Never one who claims a Townsfolk while alive, the HIDDEN_OUTSIDERS:
    // the Heretic only says so in the final 3, see heretic.js; the Mutant
    // is "mad" they're not one; the Damsel hides. If those are all they
    // have, any Townsfolk on the script.)
    const fit = (x) => !HIDDEN_OUTSIDERS.includes(x);
    const bluffed = (poppy ? goods.filter((x) => team(x) === "townsfolk") : p.bluffs).filter(fit);
    const claims = bluffed.length ? bluffed : goods.filter((x) => team(x) === "townsfolk");

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

  // The Bounty Hunter makes a Townsfolk evil: an NPC (never the Bounty
  // Hunter themself, nor you). They learn they're evil, but not who the
  // rest of the team is, and the team doesn't learn them (see
  // characters/townsfolk/bountyhunter.js). They keep their character and its
  // ability, and claim it.
  const evilTownsfolk = players.some((x) => x.role === "bountyhunter")
    ? pick(
        players.filter((x) => !x.human && team(x.role) === "townsfolk" && x.role !== "bountyhunter"),
        r,
      )
    : null;

  if (evilTownsfolk) {
    evilTownsfolk.alignment = "evil";
    evilTownsfolk.evilTownsfolk = true;
  }

  // The Pixie is face-down: each NPC Pixie is shown their Townsfolk now, and
  // claims it from the start, never the Pixie (see pixie.js pixieStart()):
  // a real one (or a Drunk or Marionette shown the Pixie), and an evil
  // player or the Lunatic bluffing it.
  for (const p of players.filter(
    (x) =>
      !x.human &&
      (x.role === "pixie" ||
        x.shown === "pixie" ||
        ((x.alignment === "evil" || x.role === "lunatic") && x.bluff === "pixie")),
  )) {
    pixieStart({ players, script, r, demonBluffs }, p);
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

  // In an Atheist game, the players the Storyteller pretends are the Demon
  // and Minions (p.pretend; never you, nor the Atheist): Townsfolk, dealt in
  // their places, so the Outsiders are the ones the pretend team made. (Any
  // other player only when no Townsfolk is left: a few seats with a pretend
  // Baron, say.)
  const pretenders = players.filter((x) => !x.human && x.role !== "atheist");
  const pretender = () => {
    const free = pretenders.filter((x) => !x.pretend);
    const townsfolk = free.filter((x) => team(x.role) === "townsfolk");

    return pick(townsfolk.length ? townsfolk : free, r);
  };
  const pretendDemon = atheistGame ? pretender() : null;

  if (pretendDemon) {
    pretendDemon.pretend = pretend[0];

    for (const id of pretend.slice(1)) {
      const p = pretender();

      if (p) {
        p.pretend = id;
      }
    }
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
    version: "2.17.0",
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
    lilMonsta: lilMonsta ? { fixed: null } : null, // fixed: the Scarlet Woman babysits for good (their jinx)
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

  // (An Atheist game: how many times the Storyteller has broken the rules.
  // See characters/townsfolk/atheist.js.)
  if (atheistGame) {
    s.atheist = { breaks: 0 };
  }

  const setupLog = (type, text) =>
    s.audit.push({ id: s.auditId++, group: "Setup", type, text, names: logNames(s) });

  // (What they were shown, and what they claim, only where it isn't their
  // character.)
  players.forEach((p) =>
    setupLog(
      "role",
      `${p.label}: ${name(p.role)}${p.shown === p.role ? "" : `, shown the ${name(p.shown)}`}${
        p.claim === p.role ? "" : `; claims ${name(p.claim)}`
      }.`,
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
  const babysitter = players.find((x) => x.babysitting);
  const herring = players.find((x) => x.id === red);

  // (The red herring, with a Fortune Teller dealt, or shown to the Drunk.)
  if (herring && players.some((x) => [x.role, x.shown].includes("fortuneteller"))) {
    setupLog(
      "fortuneteller",
      `The Fortune Teller's red herring: ${herring.label} (${name(herring.role)}), a good player who registers as the Demon to them.`,
    );
  }

  if (lilMonsta) {
    setupLog(
      "lilmonsta",
      `Lil' Monsta is in play: no Demon is dealt, but ${mins.length} Minions. ${
        babysitter
          ? `${babysitter.label} (${name(babysitter.role)}) babysits it first, and "is the Demon".`
          : "No Minion can babysit it."
      }`,
    );
  }

  // (Everyone knows the Leviathan is in play: the Storyteller says so each
  // morning, see characters/demon/leviathan.js.)
  if (demon?.role === "leviathan") {
    setupLog(
      "leviathan",
      `The Leviathan is in play (${demon.label}), and everyone knows it: it doesn't kill at night; if a 2nd good player is executed, or it lives through Day 5, evil wins.`,
    );
  }

  // (The Sentinel's choice shows in the Outsiders dealt; the Spirit of
  // Ivory's rule is said here: see characters/fabled/spiritofivory.js.)
  if (script.fabled.includes("spiritofivory")) {
    const normal = base[2] + 1;

    setupLog(
      "spiritofivory",
      `The Spirit of Ivory is on the script: there can't be more than 1 extra evil player (the setup sheet has ${normal} for ${seats} seats, so at most ${normal + 1} can ever be evil; anyone else who would turn evil stays good).`,
    );
  }

  if (evilTownsfolk) {
    setupLog(
      "bountyhunter",
      `The Bounty Hunter is in play: ${evilTownsfolk.label} (${name(evilTownsfolk.role)}) is evil. They know they're evil, but not who the rest of the evil team is, and the team doesn't know them.`,
    );
  }

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

  if (atheistGame) {
    const atheist = players.find((x) => x.role === "atheist");
    // (The pretend Demon first.)
    const fake = [pretendDemon, ...players.filter((x) => x.pretend && x !== pretendDemon)];
    const more = pretend.filter((x) => OUTSIDER_MODIFIERS[x]);

    setupLog(
      "atheist",
      `The Atheist is in play (${atheist.label}): nobody is evil. The Storyteller pretends ${fake
        .map((x) => `${x.label} (${name(x.role)}) is the ${name(x.pretend)}`)
        .join(", ")}, and deals Townsfolk in their places${
        more.length ? `; the Outsiders are as many as the pretend ${more.map(name).join(" and ")} would make them` : ""
      }.`,
    );

    for (const d of duplicates) {
      setupLog(
        "atheist",
        `A duplicate (the Atheist is in play): ${players[d.i].label} is a second ${name(d.role)}, in the place of the ${name(d.was)}.`,
      );
    }
  }

  if (atheistLiar) {
    setupLog(
      "atheist",
      `${atheistLiar.label} (${name(atheistLiar.role)}) claims the Atheist, though no Atheist is in play: a trap (executing the Storyteller would win for evil), at ${Math.round(
        EVIL_ATHEIST_BLUFF_CHANCE * 100,
      )}%.`,
    );
  }

  // (With no Demon, nobody is told any bluffs.)
  if (!atheistGame) {
    setupLog(
      "bluffs",
      `Demon bluffs (${poppy ? "not told: the Poppy Grower" : `told to ${legions ? "every Legion" : lilMonsta ? "the Minions, for Lil' Monsta" : (demon?.label ?? "the Demon")}`}): ${
        demonBluffs
          .map((x) =>
            legions
              ? name(x)
              : `${name(x)} (${
                  team(x) === "outsider"
                    ? "Outsider"
                    : `${DEMON_KILL_PRIORITY[x] === "high" ? "high" : "medium/low"}-value Townsfolk`
                })`,
          )
          .join(", ") || "none"
      }${
        legions
          ? ""
          : faceDown
            ? demonBluffs.some((x) => team(x) === "outsider")
              ? ` (an Outsider: the ${name(faceDown)}, a face-down Outsider, is in play)`
              : ` (no Outsider left to give, though the ${name(faceDown)}, a face-down Outsider, is in play)`
            : " (no Outsider: no face-down Outsider is in play)"
      }. ${demon ? `${demon.label} bluffs as ${name(demon.claim)}.` : ""}`.trim(),
    );
  }

  for (const p of players.filter((x) => x.pixieMad)) {
    setupLog(
      "pixie",
      `${p.label} (${
        p.role === "pixie"
          ? "Pixie"
          : p.shown === "pixie"
            ? `${name(p.role)}, who thinks they're the Pixie`
            : `${name(p.role)}, bluffing the Pixie`
      }) is face-down: shown the ${name(p.pixieRole)}, they're mad that they are it, and claim it.`,
    );
  }

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
