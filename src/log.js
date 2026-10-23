import { name } from "./data.js";
import { byId } from "./util.js";

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
function stateLines(players) {
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
  const info = players.flatMap((p) =>
    p.info.map((x) => indent(x, `    ${pad(`${p.label}:`, 11)}`)),
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

function voteLine(s, records) {
  const label = (id) => byId(s, id)?.label ?? id;
  const voted = records.filter((r) => r.attempted);

  if (!voted.length) {
    return "      votes: none";
  }

  return `      votes: ${voted
    .map((r) => `${label(r.playerId)}${r.counted ? "" : " (not counted)"}`)
    .join(", ")}`;
}

// A human-readable record of the whole game, grouped by night and day in
// the order things happened.
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

    if (e.type === "state") {
      lines.push(...stateLines(e.data.players));

      const goat = byId(s, e.data.scapegoat);

      if (goat) {
        lines.push(`  Evil team is framing: ${goat.label}`);
      }

      if (e.data.lean) {
        lines.push(`  Storyteller ${e.data.lean}`);
      }

      continue;
    }

    lines.push(indent(e.text, `  [${e.type}] `));

    if (e.type === "vote_result") {
      lines.push(voteLine(s, e.data.records));
    }
  }

  return `${lines.join("\n")}\n`;
}
