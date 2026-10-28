import { name, ROLES } from "./data.js";
import { byId } from "./util.js";

const CHARACTER_NAMES = new Set(Object.keys(ROLES).map(name));

// What player p claims, and what that claim says they have since (each
// shown "->" after it): a Philosopher's or Cannibal's gained ability (a
// Pixie's too), then an Alchemist's Minion ability ("Philosopher",
// "Alchemist", "Poisoner"). Their real ones when they're telling the truth;
// otherwise the ones they've made up (see bluff.js gainedRole(), its
// `philosopher` story, and alchemist.js pretended()).
export function claimChain(p) {
  const claim = p.cover?.as ?? p.claim;

  if (!claim) {
    return [];
  }

  const honest = claim === p.role;
  const chain = [claim];
  const state = p.bluffState;

  if (["philosopher", "cannibal", "pixie"].includes(claim)) {
    const gained = honest
      ? p.gained
      : (state?.gained?.role ?? (claim === "philosopher" ? state?.philosopher : null));

    if (gained) {
      chain.push(gained);
    }
  }

  if (chain.at(-1) === "alchemist") {
    const minion = honest || p.gained === "alchemist" ? p.alchemist : state?.said?.alchemist;

    if (minion) {
      chain.push(minion);
    }
  }

  return chain;
}

// Player p as log.txt names them: 'P2 Damsel "Philosopher->Alchemist->Poisoner"'.
// Their seat; their character, with each one they had before it when it
// changed (the Pit-Hag, Barber, Snake Charmer, Fang Gu, a Demon's
// successor...: "P6 SNAKE CHARMER->IMP"), in capitals while they're evil;
// then, in quotes, what they claim (see claimChain()), unless it's just the
// character they are ("P3 Chef"), so the evil team, and whoever claims
// something else, stand out. (`roles`: their characters so far, kept by
// logNames().)
function logName(p, roles = [p.role]) {
  const chain = claimChain(p);
  const honest = chain.length === 1 && chain[0] === p.role;
  const character = roles.map(name).join("->");

  return `P${p.seat} ${p.alignment === "evil" ? character.toUpperCase() : character}${
    chain.length && !honest ? ` "${chain.map(name).join("->")}"` : ""
  }`;
}

// Each player's characters so far, oldest first, from the first log entry
// (kept in `s.logRoles` by seat).
function rolesSoFar(s, p) {
  const roles = ((s.logRoles ??= {})[p.seat] ??= [p.role]);

  if (roles.at(-1) !== p.role) {
    roles.push(p.role);
  }

  return roles;
}

// How log.txt names each player (by seat number), as things stand (see
// logName()). You stay "You" (log.txt's header names you in full: see
// formatLog()). Each log entry keeps the names as they were when it was
// written (see engine audit()), so one shared object is kept until a
// character or claim changes.
export function logNames(s) {
  const named = s.players.map((p) => [p, p.human ? p.label : logName(p, rolesSoFar(s, p))]);
  const key = named.map(([, x]) => x).join(",");

  if (s.logNames?.key !== key) {
    s.logNames = {
      key,
      names: Object.fromEntries(named.map(([p, x]) => [p.seat, x])),
    };
  }

  return s.logNames.names;
}

// Text with each "Player N" replaced by their name in `names` (see
// logNames()), dropping a character right after it that the name already
// gives: in brackets ("Player 5 (Po)", "Player 7 (the Devil's Advocate)"),
// or closing a bracket ("(poisoned by Player 4, the Poisoner)").
function renamed(text, names) {
  if (!names) {
    return text;
  }

  return text.replace(
    /\bPlayer (\d+)\b(?: \((?:the )?([^()]+)\)|, the ([^(),.]+)(?=\)))?/g,
    (all, seat, inner, closing) => {
      const extra = all.slice(`Player ${seat}`.length);
      const known = CHARACTER_NAMES.has(inner ?? closing);

      return (names[seat] ?? `Player ${seat}`) + (known ? "" : extra);
    },
  );
}

const pad = (x, n) => String(x).padEnd(n);

// Continuation lines of a multi-line entry line up under its first line.
const indent = (text, prefix) =>
  text
    .split("\n")
    .map((line, i) => (i ? " ".repeat(prefix.length) : prefix) + line)
    .join("\n");

// A text table: a header row, a rule, then one line per row, each column
// as wide as its widest cell.
function table(headers, rows) {
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => String(r[i]).length)),
  );
  const line = (cells) =>
    `  ${cells.map((c, i) => pad(c, widths[i])).join(" | ")}`.trimEnd();

  return [
    line(headers),
    `  ${widths.map((w) => "-".repeat(w)).join("-+-")}`,
    ...rows.map(line),
  ];
}

// The player states as a table (one row per player: their character, claim,
// team, state, once-per-game ability, who they suspect, how strongly (their
// evidence score) and why), then the
// information each received that night.
function stateLines(players, rename) {
  // (An Alchemist's Minion ability after the character, or the ability a
  // Philosopher gained: "Alchemist (has Fearmonger)", "Philosopher (has
  // Alchemist->Poisoner)". A Drunk shown the Alchemist only thinks they have
  // it.)
  const minion = (p) => (p.alchemist ? `->${name(p.alchemist)}` : "");
  const rows = players.map((p) => [
    p.label,
    `${
      p.role === p.shown ? name(p.role) : `${name(p.role)} (as ${name(p.shown)})`
    }${
      p.gained
        ? ` (${p.gainFailed ? "thinks they have" : "has"} ${name(p.gained)}${p.gained === "alchemist" ? minion(p) : ""})`
        : p.alchemist
          ? ` (${p.role === "alchemist" ? "has" : "thinks they have"} ${name(p.alchemist)})`
          : ""
    }`,
    // (Their claim, with what it says they have since: see claimChain().)
    `${(p.claims?.length ? p.claims : [p.claim]).map(name).join("->")}${
      p.cover
        ? ` (${
            { hide: "hiding as", bait: "baiting as", decoy: "a decoy as" }[p.cover.kind]
          } ${name(p.cover.as)})`
        : ""
    }${p.mad ? ` (mad as ${name(p.mad)})` : ""}`,
    p.alignment,
    [
      p.alive ? "alive" : "DEAD",
      p.drunk && "drunk",
      // (Poisoned by the Lleech, as its host; poisoned by anyone else too
      // shows only as its host.)
      p.poisoned && (p.host ? "Lleech's host" : "poisoned"),
      p.babysitting && "babysits Lil' Monsta",
      p.protected && "protected",
    ]
      .filter(Boolean)
      .join(", "),
    p.used === true ? "used" : p.used === false ? "unused" : "",
    p.suspects ?? "",
    // The evidence behind it (EVIDENCE_WEIGHT in data.js), to 1 decimal.
    p.suspects ? String(Math.round((p.score ?? 0) * 10) / 10) : "",
    p.suspects ? (p.why?.length ? p.why.join("; ") : "a hunch") : "",
  ]);
  // (Below the table, players are named as everywhere else.)
  const who = (p) => rename(`${p.label}:`);
  const width =
    Math.max(10, ...players.filter((p) => p.info.length).map((p) => who(p).length)) + 1;
  const info = players.flatMap((p) =>
    p.info.map((x) => indent(rename(x), `    ${pad(who(p), width)}`)),
  );

  return [
    "  -- Player states --",
    ...table(
      [
        "Player",
        "Character",
        "Claims",
        "Team",
        "State",
        "Ability",
        "Suspects",
        "Score",
        "Why",
      ],
      rows,
    ),
    ...(info.length ? ["", "  Information tonight:", ...info] : []),
  ];
}

// Kinds of log entry the town sees or hears in public (see seen()).
const PUBLIC = new Set([
  "share",
  "come_clean",
  "damsel",
  "mutant",
  "lunatic",
  "goblin",
  "gossip",
  "execution",
  "nominations",
  "npc_nomination",
  "vote_result",
  "request",
  "virgin",
  "slayer",
  "psychopath",
  "juggler",
  "pacifist",
  "conversation",
  "tell",
  "wish",
]);

// Whether you saw or heard log entry e (marked ▶ in log.txt): said or
// announced in public, said to you or by you (your conversations), or your own
// information, wake-ups and choices. Deaths are announced, but not what
// saved anyone; a Devil's Advocate's save shows at the execution, not their
// choice.
function seen(e) {
  const you = /^You\b/.test(e.text);

  switch (e.type) {
    case "death":
      return / died: /.test(e.text);
    case "advocate":
      return /was executed but survived/.test(e.text);
    case "boomdandy":
      return /was executed/.test(e.text) || /^The countdown/.test(e.text);
    case "information":
    case "wake":
    case "choice":
      return you;
    // (The Minions giving up on the Damsel is the Storyteller's note.)
    case "damsel":
      return !/^The Minions stop guessing/.test(e.text);
    default:
      return PUBLIC.has(e.type);
  }
}

function voteLine(s, records, names) {
  const label = (id) => renamed(byId(s, id)?.label ?? id, names);
  const voted = records.filter((r) => r.attempted);

  if (!voted.length) {
    return "      votes: none";
  }

  return `      votes: ${voted
    .map((r) => `${label(r.playerId)}${r.counted ? "" : " (not counted)"}`)
    .join(", ")}`;
}

// You as log.txt names the other players (see logName()), as things stand.
function humanName(s) {
  const p = s.players.find((x) => x.human);

  return p ? logName(p, s.logRoles?.[p.seat] ?? [p.role]) : "nobody";
}

// A human-readable record of the whole game, grouped by night and day in
// the order things happened. Players are named by seat, character and claim
// (see logNames()), except in the Player States tables and the Setup's list of
// who sits where, which name their seats.
export function formatLog(s) {
  const lines = [
    "SOLO CLOCKTOWER — DEBUG LOG",
    `Script:  ${s.script.meta.name}`,
    `Seats:   ${s.seats}`,
    `Seed:    ${s.seed}`,
    `Version: ${s.version}`,
    // (Elsewhere you're "You".)
    `You:     ${humanName(s)}`,
    'Names:   P5 FEARMONGER "Gossip" is seat 5: the Fearmonger (in capitals: evil), claiming the Gossip. P7 Damsel->Gossip: the Damsel, then the Gossip, claiming what they are (no quotes).',
    "Seen:    ▶ marks what you saw or heard: said or announced in public, said to you, or your own information.",
    `Bluffs:  ${(s.demonBluffs ?? []).map(name).join(", ") || "none"}${
      s.exposedBluffs
        ? ` (at first ${s.exposedBluffs.map(name).join(", ")}, made public by a Wizard's wish)`
        : ""
    }`,
    `Result:  ${
      s.winner ? `${s.winner.toUpperCase()} wins — ${s.reason}` : "in progress"
    }`,
  ];

  let group = null;

  for (const e of s.audit) {
    if (e.group !== group) {
      group = e.group;
      lines.push("", `=== ${group} ${"=".repeat(Math.max(0, 50 - group.length))}`);
    }

    const rename = (x) => renamed(x, e.names);

    if (e.type === "state") {
      lines.push(...stateLines(e.data.players, rename));

      if (e.data.clues?.length) {
        lines.push(
          "",
          "  Clues to the evil team:",
          ...e.data.clues.map((x) => indent(rename(x), "    - ")),
        );
      }

      const goat = byId(s, e.data.scapegoat);

      if (goat) {
        lines.push(
          `  Evil team is framing: ${rename(goat.label)}${e.data.scapegoatWhy ? ` (${e.data.scapegoatWhy})` : ""}`,
        );
      }

      if (e.data.lean) {
        lines.push(`  Storyteller ${e.data.lean}`);
      }

      continue;
    }

    // (The Setup's roles are the key to who sits where.)
    lines.push(
      indent(e.type === "role" ? e.text : rename(e.text), `${seen(e) ? "▶" : " "} [${e.type}] `),
    );

    if (e.type === "vote_result") {
      lines.push(voteLine(s, e.data.records, e.names));
    }
  }

  return `${lines.join("\n")}\n`;
}
