import { name } from "./data.js";
import { byId } from "./util.js";

const pad = (x, n) => String(x).padEnd(n);

// Continuation lines of a multi-line entry line up under its first line.
const indent = (text, prefix) =>
  text
    .split("\n")
    .map((line, i) => (i ? " ".repeat(prefix.length) : prefix) + line)
    .join("\n");

// One row per player, plus any information they received that night.
function stateLines(players) {
  const lines = ["  -- Player states --"];

  for (const p of players) {
    const role =
      p.role === p.shown ? name(p.role) : `${name(p.role)} (as ${name(p.shown)})`;

    const flags = [
      p.alive ? "alive" : "DEAD",
      p.drunk && "DRUNK",
      p.poisoned && "POISONED",
      p.protected && "PROTECTED",
      p.used === true && "ability used",
      p.used === false && "ability unused",
    ]
      .filter(Boolean)
      .join(" ");

    lines.push(
      `  ${pad(p.seat, 3)}${pad(p.label, 11)}${pad(role, 28)}${pad(
        `claims ${name(p.claim)}`,
        24,
      )}${pad(p.alignment, 6)}${flags}`.trimEnd(),
    );

    if (p.suspects) {
      lines.push(
        `       suspects ${p.suspects}${
          p.why?.length ? `: ${p.why.join("; ")}` : " (a hunch)"
        }`,
      );
    }

    for (const info of p.info) {
      lines.push(`       info: ${info}`);
    }
  }

  return lines;
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
