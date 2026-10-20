import { name, team, COUNTS, ARTIST_QUESTIONS, ABILITIES } from "./data.js";
import { createState } from "./setup.js";
import { Engine } from "./engine.js";

const $ = (id) => document.getElementById(id);

const esc = (x) =>
  String(x ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c],
  );

let scripts = [];
let s;
let e;
let selectedPlayerId = null;

async function load() {
  try {
    const files = await fetch("scripts/index.json").then((r) => r.json());

    scripts = await Promise.all(
      files.map(async (f) => ({
        file: f,
        raw: await fetch(`scripts/${encodeURIComponent(f)}`).then((r) =>
          r.json(),
        ),
      })),
    );

    $("script").innerHTML = scripts
      .map(
        (x, i) =>
          `<option value="${i}">${esc(
            x.raw.find((y) => y?.id === "_meta")?.name ?? x.file,
          )}</option>`,
      )
      .join("");
  } catch (err) {
    $("error").textContent = err.message;
  }
}

function start() {
  try {
    s = createState(
      scripts[+$("script").value].raw,
      +$("seats").value,
      $("seed").value,
    );

    e = new Engine(s);
    e.start();

    selectedPlayerId = null;

    $("setup").hidden = true;
    $("game").hidden = false;

    render();
  } catch (err) {
    $("error").textContent = err.message;
  }
}

// ── Rendering ────────────────────────────────────────────────

function circle() {
  const voters = new Set(
    (s.lastVote?.records ?? [])
      .filter((x) => x.counted)
      .map((x) => x.playerId),
  );

  $("circle").style.setProperty("--n", s.players.length);

  $("circle").innerHTML = s.players
    .map((p, i) => {
      const token = p.human || p.claimKnown ? name(p.claim) : "Unknown";

      return `
        <button
          title="${esc(p.label)}"
          class="seat ${p.human ? "human" : ""} ${p.alive ? "" : "dead"} ${
            p.id === selectedPlayerId ? "selected" : ""
          }"
          style="--a:${i / s.players.length * 360}deg"
          data-id="${p.id}"
          ${p.human ? "disabled" : ""}
        >
          ${voters.has(p.id) ? '<span class="vote-hand">✋</span>' : ""}

          <span class="token ${p.claimKnown || p.human ? "" : "unknown"}">
            ${esc(token)}
          </span>

          <small>
            ${esc(p.label)}
          </small>

          <br>

          <small>
            ${p.alive ? "alive" : "DEAD"}
          </small>
        </button>
      `;
    })
    .join("");

  $("circle").insertAdjacentHTML(
    "beforeend",
    `<button
      id="fireplace"
      type="button"
      class="fireplace"
      title="Show the script"
      aria-label="Show the script and character abilities"
    >${FIREPLACE_SVG}</button>`,
  );

  $("fireplace").onclick = showScript;

  $("circle")
    .querySelectorAll("[data-id]:not(:disabled)")
    .forEach((b) => {
      b.onclick = () => {
        selectedPlayerId = b.dataset.id;

        $("answer").textContent = "";
        render();
      };
    });
}

// ── Script sheet ─────────────────────────────────────────────

// A hearth with a fire, drawn in the town square's gold and ember colours.
const FIREPLACE_SVG = `<svg viewBox="0 0 64 64" aria-hidden="true">
  <rect x="4" y="8" width="56" height="8" rx="2" fill="#b69455" />
  <rect x="10" y="16" width="44" height="40" fill="#5a3b2e" />
  <path d="M20 56V36a12 12 0 0 1 24 0v20z" fill="#1a1110" />
  <path
    d="M32 54c-8 0-10-6-7-11 1 4 4 4 4 2 0-5 3-8 6-11 0 4 4 6 4 11 2-1 2-3 2-4 3 4 2 13-9 13z"
    fill="#f39c3d"
  />
  <path
    d="M32 54c-4 0-5-3-3-6 1 2 2 2 2 0 0-2 2-4 3-5 0 3 3 4 3 7 0 2-2 4-5 4z"
    fill="#f0cf83"
  />
  <rect x="6" y="56" width="52" height="4" rx="1" fill="#b69455" />
</svg>`;

const TEAMS = [
  ["townsfolk", "Townsfolk"],
  ["outsider", "Outsiders"],
  ["minion", "Minions"],
  ["demon", "Demons"],
];

// Opens a popup listing the script's characters and abilities by team.
function showScript() {
  const { meta, ids } = s.script;

  const sections = TEAMS.map(([t, title]) => {
    const roles = ids.filter((id) => team(id) === t);

    return roles.length
      ? `<h3 class="team-${t}">${title}</h3>
        <dl class="ability-list">
          ${roles
            .map(
              (id) =>
                `<dt>${esc(name(id))}</dt><dd>${esc(ABILITIES[id] ?? "")}</dd>`,
            )
            .join("")}
        </dl>`
      : "";
  }).join("");

  $("script-sheet").innerHTML = `<h2>${esc(meta.name)}</h2>
    ${meta.author ? `<p class="script-author">by ${esc(meta.author)}</p>` : ""}
    ${sections}
    <p class="script-footnote">* Not the first night.</p>`;

  $("script-dialog").showModal();
}

// Groups log lines by their "Day N" prefix, newest first.
function renderPublic() {
  const groups = [];
  let current = null;

  for (const text of s.publicLog) {
    const m = text.match(/^Day\s+(\d+)/i);
    const day = m?.[1] ?? current?.day ?? String(s.day || 1);

    if (!current || current.day !== day) {
      current = { day, items: [] };
      groups.push(current);
    }

    current.items.push(
      m ? text.replace(/^Day\s+\d+\s*[:—-]?\s*/i, "") : text,
    );
  }

  $("public").innerHTML = [...groups]
    .reverse()
    .map(
      (g) =>
        `<li class="day-break">
          <span>
            Day ${esc(g.day)}
          </span>
        </li>
        ${[...g.items]
          .reverse()
          .map(
            (x) =>
              // No whitespace around the text: entries keep their line breaks.
              `<li class="log-entry">${esc(x)}</li>`,
          )
          .join("")}`,
    )
    .join("");
}

function reveal() {
  const r = e.reveal();

  $("reveal").hidden = !r;

  if (!r) {
    return;
  }

  updateLogLink();

  $("result").innerHTML = `<div class="result-banner">
    <strong>
      ${esc(r.winner.toUpperCase())} WINS
    </strong>
    <span>
      ${esc(r.reason)}
    </span>
  </div>`;

  $("roles").innerHTML = r.players
    .map(
      (p) =>
        `<article class="reveal-card">
          <header>
            ${esc(p.label)}
          </header>

          <strong class="true-role">
            ${esc(name(p.startRole))}
          </strong>

          <span class="alignment ${p.alignment}">
            ${esc(p.alignment)}
          </span>

          ${
            p.role !== p.startRole
              ? `<p>
                  Became ${esc(name(p.role))}
                </p>`
              : ""
          }

          <p>
            ${
              p.alive
                ? "Survived"
                : `Died by ${esc(p.death ?? "unknown cause")}`
            }
          </p>

          ${
            p.claim !== p.startRole
              ? `<small>
                  Claimed ${esc(name(p.claim))}
                </small>`
              : ""
          }
        </article>`,
    )
    .join("");

  const key = r.keyMoments;

  $("audit").innerHTML = key.length
    ? `<h3>Key moments</h3>
      ${[...key]
        .reverse()
        .map(
          (x) =>
            `<div class="key-event">
              <b>
                ${esc(x.group)}
              </b>
              <span>
                ${esc(x.text)}
              </span>
            </div>`,
        )
        .join("")}`
    : "";
}

// Points the "Download log.txt" link at a fresh copy of the debug log.
function updateLogLink() {
  const link = $("download-log");

  if (link.href.startsWith("blob:")) {
    URL.revokeObjectURL(link.href);
  }

  link.href = URL.createObjectURL(
    new Blob([e.debugLog()], { type: "text/plain" }),
  );
}

function render() {
  const h = e.human();
  const t = selectedPlayerId ? e.player(selectedPlayerId) : null;
  const talk = e.talkStatus(t?.id);

  $("role").textContent = `You are ${name(h.shown)}`;

  $("status").textContent = s.winner
    ? `${s.winner.toUpperCase()}: ${s.reason}`
    : `${s.phase} ${s.day || s.night} — ${e.alive().length} alive`;

  $("selected-player").textContent = t ? `Selected: ${t.label}` : "";

  $("talk").textContent = t
    ? `Conversations: ${talk.used}/${talk.limit}; ${talk.remaining} remaining${
        talk.already ? "; already asked this player" : ""
      }.`
    : "";

  circle();

  $("private").innerHTML = [...s.privateLog]
    .reverse()
    .map((x) => `<li>${esc(x)}</li>`)
    .join("");

  renderPublic();

  $("actions").hidden = !!s.winner || !t;
  $("ask").disabled = !t || talk.already || !talk.remaining;
  $("nominate").disabled = !t?.alive || !h.alive || e.nominatedToday(t.id);
  $("slay").hidden = !(h.shown === "slayer" && !s.slayerUsed && h.alive);
  $("artist-controls").hidden = !(
    h.shown === "artist" &&
    !h.artistUsed &&
    h.alive
  );

  reveal();
}

// ── Setup controls ───────────────────────────────────────────

function randomSeed() {
  let n = 0;

  while (!n) {
    if (globalThis.crypto?.getRandomValues) {
      const a = new Uint32Array(1);

      crypto.getRandomValues(a);
      n = a[0];
    } else {
      n = Math.floor(Math.random() * 4294967295) + 1;
    }
  }

  $("seed").value = String(n);
}

function toggleCountInfo() {
  const box = $("count-popup");
  const btn = $("count-info");
  const c = COUNTS[+$("seats").value];

  if (!c) {
    return;
  }

  box.innerHTML = `<strong aria-label="Townsfolk Outsiders Minions Demons">
    <span class="good-count">
      ${c[0]}/${c[1]}
    </span>
    /
    <span class="evil-count">
      ${c[2]}/${c[3]}
    </span>
  </strong>
  <small>
    Townsfolk / Outsiders /
    Minions / Demons
  </small>`;

  box.hidden = !box.hidden;

  btn.setAttribute("aria-expanded", String(!box.hidden));
}

function resetGame() {
  s = null;
  e = null;
  selectedPlayerId = null;

  $("game").hidden = true;
  $("setup").hidden = false;
  $("reveal").hidden = true;
  $("actions").hidden = true;

  $("answer").textContent = "";
  $("error").textContent = "";

  $("count-popup").hidden = true;
  $("count-info").setAttribute("aria-expanded", "false");
}

// ── Event wiring ─────────────────────────────────────────────

$("random-seed").onclick = randomSeed;
$("count-info").onclick = toggleCountInfo;

$("seats").onchange = () => {
  if (!$("count-popup").hidden) {
    $("count-popup").hidden = true;
    $("count-info").setAttribute("aria-expanded", "false");
  }
};

// Clicking the dimmed backdrop (outside the sheet) closes the script popup.
$("script-dialog").onclick = (ev) => {
  if (ev.target === $("script-dialog")) {
    $("script-dialog").close();
  }
};

$("reset").onclick = resetGame;
$("start").onclick = start;

$("ask").onclick = () => {
  try {
    $("answer").textContent = e.ask(selectedPlayerId);
    render();
  } catch (err) {
    $("answer").textContent = err.message;
  }
};

$("nominate").onclick = () => {
  try {
    e.nominate(selectedPlayerId);
    selectedPlayerId = null;
    render();
  } catch (err) {
    $("answer").textContent = err.message;
  }
};

$("slay").onclick = () => {
  try {
    e.slay(selectedPlayerId);
    render();
  } catch (err) {
    $("answer").textContent = err.message;
  }
};

$("artist-ask").onclick = () => {
  try {
    $("answer").textContent = e.artist(
      selectedPlayerId,
      $("artist-question").value,
    );
    render();
  } catch (err) {
    $("answer").textContent = err.message;
  }
};

$("pass").onclick = () => {
  try {
    e.endDay();
    selectedPlayerId = null;
    render();
  } catch (err) {
    $("answer").textContent = err.message;
  }
};

$("seats").innerHTML = Array.from(
  { length: 11 },
  (_, i) => `<option>${i + 5}</option>`,
).join("");

$("seats").value = 10;

$("artist-question").innerHTML = Object.entries(ARTIST_QUESTIONS)
  .map(([k, v]) => `<option value="${k}">Is this player ${esc(v)}?</option>`)
  .join("");

load();
