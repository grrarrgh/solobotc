import { name, ROLES } from "./data.js";
import { byId } from "./util.js";

const CHARACTER_NAMES = new Set(Object.keys(ROLES).map(name));

// How log.txt names each player (by seat number), as things stand: their
// character, then what they claim in brackets when that's different
// ("Assassin (Gossip)", "Chambermaid (Gambler)" while hiding). You stay
// "You". Two players with the same name get their seat added. Each log entry
// keeps the names as they were when it was written (see engine audit()), so
// one shared object is kept until a character or claim changes.
export function logNames(s) {
  const key = s.players
    .map((p) => `${p.role}/${p.cover?.as ?? p.claim}`)
    .join(",");

  if (s.logNames?.key !== key) {
    const named = s.players.map((p) => {
      const claim = p.cover?.as ?? p.claim;

      return [
        p,
        p.human
          ? p.label
          : !claim || claim === p.role
            ? name(p.role)
            : `${name(p.role)} (${name(claim)})`,
      ];
    });
    const count = (x) => named.filter(([, y]) => y === x).length;

    s.logNames = {
      key,
      names: Object.fromEntries(
        named.map(([p, x]) => [
          p.seat,
          count(x) > 1 && !p.human ? `${x} [${p.label}]` : x,
        ]),
      ),
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
  const rows = players.map((p) => [
    p.label,
    `${
      p.role === p.shown ? name(p.role) : `${name(p.role)} (as ${name(p.shown)})`
    }${p.gained ? ` (has ${name(p.gained)})` : ""}`,
    `${name(p.claim)}${
      p.cover
        ? ` (${p.cover.kind === "hide" ? "hiding as" : "baiting as"} ${name(p.cover.as)})`
        : ""
    }`,
    p.alignment,
    [
      p.alive ? "alive" : "DEAD",
      p.drunk && "drunk",
      p.poisoned && "poisoned",
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

// A human-readable record of the whole game, grouped by night and day in
// the order things happened. Players are named by character and claim (see
// logNames()), except in the Player States tables and the Setup's list of
// who sits where, which name their seats.
export function formatLog(s) {
  const lines = [
    "SOLO CLOCKTOWER — DEBUG LOG",
    `Script:  ${s.script.meta.name}`,
    `Seats:   ${s.seats}`,
    `Seed:    ${s.seed}`,
    `Version: ${s.version}`,
    `Bluffs:  ${(s.demonBluffs ?? []).map(name).join(", ") || "none"}`,
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
        lines.push(`  Evil team is framing: ${rename(goat.label)}`);
      }

      if (e.data.lean) {
        lines.push(`  Storyteller ${e.data.lean}`);
      }

      continue;
    }

    // (The Setup's roles are the key to who sits where.)
    lines.push(
      indent(e.type === "role" ? e.text : rename(e.text), `  [${e.type}] `),
    );

    if (e.type === "vote_result") {
      lines.push(voteLine(s, e.data.records, e.names));
    }
  }

  return `${lines.join("\n")}\n`;
}
