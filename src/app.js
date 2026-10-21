import {
  ROLES,
  name,
  team,
  COUNTS,
  ARTIST_QUESTIONS,
  ABILITIES,
  VOTE_COUNT_DELAY_MS,
  VOTE_TICK_MS,
  TOWN_SQUARE_SIZE,
  TOWN_SQUARE_SIZE_STEP,
  TOWN_SQUARE_SIZE_MIN,
  TOWN_SQUARE_SIZE_MAX,
} from "./data.js";
import { createState } from "./setup.js";
import { Engine } from "./engine.js";
import { byId } from "./util.js";

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

// ── Role links ───────────────────────────────────────────────

const ROLE_BY_NAME = new Map(Object.keys(ROLES).map((id) => [name(id), id]));

const escapeRegExp = (x) => x.replace(/[.*+?^$()|[\]\\{}]/g, "\\$&");

// Every character name, longest first so "Scarlet Woman" beats shorter ones.
const ROLE_PATTERN = new RegExp(
  `\\b(${[...ROLE_BY_NAME.keys()]
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp)
    .join("|")})\\b`,
  "g",
);

// A character name that can be pressed to read about the role.
const roleLink = (id) =>
  `<button type="button" class="role-link" data-role="${esc(id)}">${esc(
    name(id),
  )}</button>`;

// Escapes text, turning every character name in it into a role link.
// (split() with a capture group puts the matched names at odd indexes.)
const linkRoles = (text) =>
  String(text ?? "")
    .split(ROLE_PATTERN)
    .map((part, i) => (i % 2 ? roleLink(ROLE_BY_NAME.get(part)) : esc(part)))
    .join("");

const TEAM_NAMES = {
  townsfolk: "Townsfolk",
  outsider: "Outsider",
  minion: "Minion",
  demon: "Demon",
};

// Opens a popup describing one character; pressing the popup closes it.
function showRole(id) {
  const ability = ABILITIES[id] ?? "";

  $("role-sheet").innerHTML = `<h2>${esc(name(id))}</h2>
    <p class="role-team team-${team(id)}">${esc(TEAM_NAMES[team(id)] ?? "")}</p>
    <p>${esc(ability)}</p>
    ${
      ability.includes("*")
        ? '<p class="script-footnote">* Not the first night.</p>'
        : ""
    }`;

  $("role-dialog").showModal();
}

let scripts = [];
let s;
let e;
let selectedPlayerId = null;

// Players picked in the town square while the Storyteller has woken you.
let nightPicks = [];

// Script files are re-checked with the server on every load ("no-cache"), so
// newly added or edited scripts show up without the browser using a stale
// copy (python's http.server sends no caching headers).
const getJson = (url) =>
  fetch(url, { cache: "no-cache" }).then((r) => {
    if (!r.ok) {
      throw Error(`Couldn't load ${decodeURIComponent(url)} (${r.status}).`);
    }

    return r.json();
  });

async function load() {
  try {
    const files = await getJson("scripts/index.json");

    scripts = await Promise.all(
      files.map(async (f) => ({
        file: f,
        raw: await getJson(`scripts/${encodeURIComponent(f)}`),
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
  // While a vote is being counted, only the hands counted so far are up, and
  // the skull stays where it was before the vote.
  const voters = voteAnim
    ? voteAnim.revealed
    : new Set(
        (s.lastVote?.records ?? [])
          .filter((x) => x.counted)
          .map((x) => x.playerId),
      );
  const skullId = voteAnim ? voteAnim.previousBlock : s.block?.nomineeId;

  $("circle").style.setProperty("--n", s.players.length);

  $("circle").innerHTML = s.players
    .map((p, i) => {
      const token = p.human || p.claimKnown ? name(p.claim) : "Unknown";

      return `
        <button
          title="${esc(`${p.label}: ${token}`)}"
          class="seat ${p.human ? "human" : ""} ${p.alive ? "" : "dead"} ${
            (s.pending ? nightPicks.includes(p.id) : p.id === selectedPlayerId)
              ? "selected"
              : ""
          }"
          style="--a:${i / s.players.length * 360}deg"
          data-id="${p.id}"
          ${p.human ? "disabled" : ""}
        >
          ${voters.has(p.id) ? '<span class="vote-hand">✋</span>' : ""}
          ${
            p.id === skullId
              ? '<span class="skull" title="Marked for execution">💀</span>'
              : ""
          }

          <span class="token ${p.claimKnown || p.human ? "" : "unknown"}">
            ${esc(token)}
          </span>

          <small>
            ${esc(p.label)}
          </small>

          ${p.alive ? "" : "<br><small>DEAD</small>"}
        </button>
      `;
    })
    .join("");

  // Under the clock tower: the votes a nomination needs now (as things stood
  // before the vote, while one is being counted).
  const needed = voteAnim ? voteAnim.before.needed : e.votesNeeded();

  $("circle").insertAdjacentHTML(
    "beforeend",
    `${
      s.phase === "day" && !s.winner
        ? `<span class="votes-needed">${needed} votes needed</span>`
        : ""
    }
    <button
      id="clocktower"
      type="button"
      class="clocktower"
      title="Show the script"
      aria-label="Show the script and character abilities"
    >${CLOCKTOWER_SVG}</button>
    <div class="clock-hands" aria-hidden="true">
      <div class="hand hour"></div>
      <div class="hand minute"></div>
      <div class="clock-pin"></div>
      <span class="vote-count"></span>
    </div>`,
  );

  $("clocktower").onclick = showScript;

  $("circle")
    .querySelectorAll("[data-id]:not(:disabled)")
    .forEach((b) => {
      b.onclick = () => {
        if (voteAnim) {
          return;
        }

        if (s.pending) {
          pickAtNight(b.dataset.id);
        } else {
          selectedPlayerId = b.dataset.id;
          $("answer").textContent = "";
        }

        render();
      };
    });
}

// ── Vote animation ─────────────────────────────────────────

// Set while a vote is being shown: { previousBlock, revealed: Set of ids }.
let voteAnim = null;

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

const seatAngle = (id) =>
  (s.players.findIndex((p) => p.id === id) / s.players.length) * 360;

// Points a clock hand at an angle, optionally without animating the move.
function aim(hand, angle, instant = false) {
  if (instant) {
    hand.style.transition = "none";
  }

  hand.style.transform = `rotate(${angle}deg)`;

  if (instant) {
    void hand.offsetWidth; // apply now, then restore the transition
    hand.style.transition = "";
  }
}

// Runs a nomination (`fn` calls the engine), then shows its vote: clock hands
// fade in over the clock tower, the small hand on the nominator and the
// large hand on the nominee; after 2 seconds the large hand ticks clockwise
// round the circle (starting after the nominee, ending on them), raising
// each voter's hand; then the skull marks the nominee if they're now marked
// for execution, and the clock tower returns.
async function runVote(fn) {
  if (voteAnim) {
    return;
  }

  // The mark and votes needed before this vote, shown until it's counted.
  const previousBlock = s.block?.nomineeId ?? null;
  const before = { block: s.block && { ...s.block }, needed: e.votesNeeded() };
  let result;

  try {
    result = fn();
  } catch (err) {
    $("answer").textContent = err.message;
    return;
  }

  selectedPlayerId = null;

  // The Virgin (or a Witch curse ending the game) settles it without a vote.
  if (!result.records.length || s.phase !== "day") {
    render();
    return;
  }

  voteAnim = { previousBlock, before, revealed: new Set() };
  render();

  const c = $("circle");
  const hour = c.querySelector(".hand.hour");
  const minute = c.querySelector(".hand.minute");
  const tally = c.querySelector(".vote-count");
  const n = s.players.length;
  const start = s.players.findIndex((p) => p.id === result.nomineeId);
  let angle = seatAngle(result.nomineeId);
  let votes = 0;

  aim(hour, seatAngle(result.nominatorId), true);
  aim(minute, angle, true);

  // The large hand's swing between seats takes most of each tick.
  minute.style.transitionDuration = `${Math.round(VOTE_TICK_MS * 0.8)}ms`;
  tally.textContent = `0 / ${result.needed} needed`;
  c.classList.add("voting");

  // Let the hands fade in (0.4s), then pause before counting starts.
  await sleep(400 + VOTE_COUNT_DELAY_MS);

  for (let k = 1; k <= n; k++) {
    const p = s.players[(start + k) % n];
    const record = result.records.find((x) => x.playerId === p.id);
    const seat = c.querySelector(`[data-id="${p.id}"]`);

    // A voter's hand goes up before the clock hand reaches them...
    if (record?.attempted) {
      seat?.insertAdjacentHTML(
        "afterbegin",
        `<span class="vote-hand ${record.counted ? "" : "not-counted"}">✋</span>`,
      );

      await sleep(Math.round(VOTE_TICK_MS * 0.55));
    }

    angle += 360 / n;
    aim(minute, angle);

    await sleep(VOTE_TICK_MS);

    // ...and is counted as it passes over them.
    if (record?.counted) {
      voteAnim.revealed.add(p.id);
      votes++;
      tally.textContent = `${votes} / ${result.needed} needed`;
      seat?.querySelector(".vote-hand")?.classList.add("counted");
    }
  }

  await sleep(600);

  // Move the skull to the newly marked player (or clear it on a tie).
  c.querySelectorAll(".skull").forEach((x) => x.remove());

  if (s.block?.nomineeId) {
    c.querySelector(`[data-id="${s.block.nomineeId}"]`)?.insertAdjacentHTML(
      "afterbegin",
      '<span class="skull" title="Marked for execution">💀</span>',
    );
  }

  await sleep(1200);

  // Fade the hands out and the clock tower back in.
  c.classList.remove("voting");

  await sleep(500);

  voteAnim = null;
  render();
}

// Toggles a living player in or out of tonight's picks. Once the limit is
// reached, a new pick replaces the oldest one.
function pickAtNight(id) {
  if (!e.player(id)?.alive) {
    return;
  }

  if (nightPicks.includes(id)) {
    nightPicks = nightPicks.filter((x) => x !== id);
  } else {
    nightPicks = [...nightPicks, id].slice(-s.pending.count);
  }

  $("night-error").textContent = "";
}

// The "Storyteller wakes you" panel shown during a night choice.
function renderNightChoice() {
  const p = s.pending;

  $("night-choice").hidden = !p;

  if (!p) {
    return;
  }

  const labels = nightPicks.map((id) => e.player(id).label).join(" and ");

  $("night-prompt").innerHTML = `Night ${p.night}: the Storyteller wakes you (${roleLink(
    p.role,
  )}). ${esc(p.prompt)}`;

  $("night-picks").textContent = nightPicks.length
    ? `Selected: ${labels}`
    : `Click ${p.count} player${p.count > 1 ? "s" : ""} in the town square.`;

  $("night-select").disabled = nightPicks.length !== p.count;
  $("night-skip").hidden = !p.optional;
}

// ── Script sheet ─────────────────────────────────────────────

// A clock tower (spire, clock face, belfry and door), drawn in the town
// square's gold and stone colours.
const CLOCKTOWER_SVG = `<svg viewBox="0 0 64 64" aria-hidden="true">
  <circle cx="32" cy="3" r="1.5" fill="#f0cf83" />
  <path d="M32 4 21 19h22z" fill="#b69455" />
  <rect x="22" y="19" width="20" height="21" fill="#5a4a3a" />
  <circle cx="32" cy="29" r="7" fill="#f0cf83" stroke="#b69455" stroke-width="1.5" />
  <path
    d="M32 29v-5M32 29l3.5 2"
    stroke="#1a1110"
    stroke-width="1.6"
    stroke-linecap="round"
  />
  <rect x="19" y="39" width="26" height="3" fill="#b69455" />
  <rect x="20" y="42" width="24" height="16" fill="#4a3c30" />
  <path d="M28 58v-7a4 4 0 0 1 8 0v7z" fill="#1a1110" />
  <rect x="14" y="58" width="36" height="4" rx="1" fill="#b69455" />
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
              `<li class="log-entry">${linkRoles(x)}</li>`,
          )
          .join("")}`,
    )
    .join("");
}

// ── Final reveal ─────────────────────────────────────────────

// Timeline labels for event types (others are just capitalised).
const EVENT_TAGS = {
  information: "Info",
  conversation: "Talk",
  vote_result: "Vote",
  end_day: "End day",
  game_over: "Game over",
  day: "Dawn",
  eviltwin: "Evil Twin",
  pithag: "Pit-Hag",
  snakecharmer: "Snake Charmer",
  devilsadvocate: "Devil's Advocate",
  advocate: "Devil's Advocate",
};

const capitalise = (x) => x.charAt(0).toUpperCase() + x.slice(1);

const eventTag = (type) =>
  EVENT_TAGS[type] ?? capitalise(type.replace(/_/g, " "));

// How each cause of death reads in the Grimoire.
const CAUSES = { fanggu: "Fang Gu" };

const DRUNK_FROM = { sweetheart: "Sweetheart", philosopher: "Philosopher" };

// "Key moments only" survives re-renders of the reveal.
let keyOnly = false;

// How a player's game ended, e.g. "Executed Day 3" or "Died Night 2 (Demon)".
function fate(p, events) {
  if (p.alive) {
    return "Survived";
  }

  const death = [...events]
    .reverse()
    .find((x) => x.type === "death" && x.data?.playerId === p.id);
  const when = death?.group ?? "";

  return p.death === "execution"
    ? `Executed ${when}`
    : `Died ${when} (${CAUSES[p.death] ?? capitalise(p.death ?? "unknown")})`;
}

// The extra lines under a player's Grimoire row: what happened to their
// character, lasting effects and twins.
function playerNotes(p, r) {
  const label = (id) => esc(byId(r, id)?.label ?? id);
  const notes = [];

  if (p.startRole === "drunk") {
    notes.push(`thought they were the ${roleLink(p.shown)}`);
  }

  if (p.gained) {
    notes.push(`gained the ${roleLink(p.gained)} ability`);
  }

  for (const ev of r.events) {
    const d = ev.data ?? {};
    const when = esc(ev.group);

    if (ev.type === "pithag" && d.targetId === p.id && d.effective) {
      notes.push(`made the ${roleLink(d.role)} by the Pit-Hag (${when})`);
    } else if (ev.type === "barber" && d.swapped?.includes(p.id)) {
      notes.push(`character swapped by the Barber (${when})`);
    } else if (ev.type === "succession" && d.playerId === p.id) {
      notes.push(`became the Demon (${when})`);
    } else if (ev.type === "succession" && d.previousDemonId === p.id && p.alive) {
      notes.push(`stopped being the Demon (${when})`);
    }
  }

  if (p.drunkFrom) {
    notes.push(`drunk from then on (${DRUNK_FROM[p.drunkFrom] ?? p.drunkFrom})`);
  }

  if (p.lastingPoison) {
    notes.push("poisoned from then on (Snake Charmer)");
  }

  if (p.vigor) {
    notes.push("kept their ability after death (Vigormortis)");
  }

  if (r.twins?.evilId === p.id) {
    notes.push(`Evil Twin of ${label(r.twins.goodId)}`);
  } else if (r.twins?.goodId === p.id) {
    notes.push(`good twin of ${label(r.twins.evilId)}`);
  }

  return notes;
}

// Every player: character (and how it changed), claim and fate, with the
// row coloured by their team; then the Demon's bluffs and who knew them.
function grimoire(r) {
  const rows = r.players
    .map((p) => {
      const character =
        p.startRole === p.role
          ? roleLink(p.role)
          : `${roleLink(p.startRole)} → ${roleLink(p.role)}`;
      const notes = playerNotes(p, r);

      const team = `team-row-${p.alignment}${p.alive ? "" : " is-dead"}`;

      return `<tr class="${team}" title="${esc(p.alignment)}">
          <td>${esc(p.label)}</td>
          <td>${character}</td>
          <td>${roleLink(p.claim)}</td>
          <td>${esc(fate(p, r.events))}</td>
        </tr>
        ${
          notes.length
            ? `<tr class="notes ${team}"><td colspan="4">↳ ${notes.join(
                " · ",
              )}</td></tr>`
            : ""
        }`;
    })
    .join("");

  return `<h3>Grimoire</h3>
    <div class="grimoire-wrap">
      <table class="grimoire">
        <thead>
          <tr>
            <th>Player</th><th>Character</th><th>Claimed</th><th>Fate</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    ${bluffLine(r)}`;
}

// "Demon bluffs: X, Y, Z (known by Player 2, Player 6)" under the Grimoire.
function bluffLine(r) {
  if (!r.bluffs.length) {
    return "";
  }

  const knew = r.players
    .filter((p) => p.alignment === "evil" && p.bluffs?.length)
    .map((p) => esc(p.label));

  return `<p class="grimoire-bluffs">
    <strong>Demon bluffs:</strong> ${r.bluffs.map(roleLink).join(", ")}${
      knew.length ? ` <small>(known by ${knew.join(", ")})</small>` : ""
    }
  </p>`;
}

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

// A short summary of a timeline section, e.g. "4 conversations · 1 execution".
function sectionSummary(events) {
  const count = (type) => events.filter((x) => x.type === type).length;
  const votes = events.filter((x) => x.type === "vote_result");
  const executions = count("execution") + count("virgin");
  const parts = [];

  if (count("conversation")) {
    parts.push(plural(count("conversation"), "conversation"));
  }

  if (votes.length) {
    parts.push(plural(votes.length, "nomination"));
  }

  if (executions) {
    parts.push(plural(executions, "execution"));
  }

  if (count("death")) {
    parts.push(plural(count("death"), "death"));
  }

  return parts.length ? ` · ${parts.join(" · ")}` : "";
}

// Who voted on a nomination (and whose votes didn't count).
function voters(ev, r) {
  const label = (id) => byId(r, id)?.label ?? id;
  const voted = (ev.data?.records ?? []).filter((x) => x.attempted);

  return voted.length
    ? `<small class="event-detail">votes: ${voted
        .map(
          (x) =>
            `${esc(label(x.playerId))}${x.counted ? "" : " (not counted)"}`,
        )
        .join(", ")}</small>`
    : "";
}

// Every event, grouped into collapsible Setup / Night / Day sections in the
// order they happened, with a "Key moments only" filter.
function timeline(r) {
  const keyIds = new Set(r.keyMoments.map((x) => x.id));
  const sections = [];

  for (const ev of r.events) {
    let section = sections.at(-1);

    if (!section || section.name !== ev.group) {
      section = { name: ev.group, events: [] };
      sections.push(section);
    }

    section.events.push(ev);
  }

  const html = sections
    .map(
      (sec) => `<details class="tl-section ${
        sec.events.some((x) => keyIds.has(x.id)) ? "has-key" : ""
      }" ${keyOnly ? "open" : ""}>
        <summary>${esc(sec.name)}<small>${sectionSummary(sec.events)}</small></summary>
        <ol class="events">${sec.events
          .map(
            (ev) => `<li class="event ${keyIds.has(ev.id) ? "key" : ""}">
              <span class="event-tag">${esc(eventTag(ev.type))}</span>
              <span class="event-text">${linkRoles(ev.text)}${
                ev.type === "vote_result" ? voters(ev, r) : ""
              }</span>
            </li>`,
          )
          .join("")}</ol>
      </details>`,
    )
    .join("");

  return `<h3>Timeline</h3>
    <div class="timeline-controls">
      <label>
        <input id="key-only" type="checkbox" ${keyOnly ? "checked" : ""} />
        Key moments only
      </label>
      <button id="timeline-open" type="button">Open all</button>
    </div>
    <div class="timeline">${html}</div>`;
}

// Whether this game's end has been shown (the panels collapse just once).
let shownGameOver = false;

function reveal() {
  const r = e.reveal();

  $("reveal").hidden = !r;

  if (!r) {
    return;
  }

  // When the game ends, collapse the Public log and show the Final reveal
  // collapsed too.
  if (!shownGameOver) {
    shownGameOver = true;
    $("public-panel").open = false;
    $("reveal-panel").open = false;
  }

  updateLogLink();

  $("result").innerHTML = `<div class="result-banner">
    <strong>
      ${esc(r.winner.toUpperCase())} WINS
    </strong>
    <span>
      ${linkRoles(r.reason)}
    </span>
    <small>
      ${esc(r.script)} · ${r.seats} players · seed ${esc(r.seed)}
    </small>
  </div>`;

  $("roles").innerHTML = grimoire(r);
  $("audit").innerHTML = timeline(r);
  $("audit").classList.toggle("key-only", keyOnly);

  $("key-only").onchange = (ev) => {
    keyOnly = ev.target.checked;
    $("audit").classList.toggle("key-only", keyOnly);

    // Key moments are few, so show them all at once.
    if (keyOnly) {
      $("audit")
        .querySelectorAll("details")
        .forEach((d) => (d.open = true));
    }
  };

  $("timeline-open").onclick = () => {
    const all = [...$("audit").querySelectorAll("details")];
    const open = !all.every((d) => d.open);

    all.forEach((d) => (d.open = open));
    $("timeline-open").textContent = open ? "Close all" : "Open all";
  };
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

  $("role").innerHTML = `You are ${roleLink(h.shown)}`;

  // The winner is only shown in the Final reveal.
  $("status").textContent = s.winner
    ? "Game Over!"
    : s.phase === "night"
      ? `Night ${s.night} — ${e.alive().length} alive`
      : `Day ${s.day} — ${e.alive().length} alive`;

  $("selected-player").textContent = t ? `Selected: ${t.label}` : "";

  $("talk").textContent = t
    ? `Conversations: ${talk.used}/${talk.limit}; ${talk.remaining} remaining${
        talk.already ? "; already asked this player" : ""
      }.`
    : "";

  circle();

  $("private").innerHTML = [...s.privateLog]
    .reverse()
    .map((x) => `<li class="log-entry">${linkRoles(x)}</li>`)
    .join("");

  renderPublic();
  renderNightChoice();

  $("actions").hidden = !!s.winner || !t || !!s.pending;
  $("day-controls").hidden = !!s.winner || !!s.pending || s.phase !== "day";
  $("savant").hidden = !(
    h.shown === "savant" &&
    h.alive &&
    h.savantDay !== s.day
  );
  $("ask").disabled = !t || talk.already || !talk.remaining;
  // Each player can nominate and be nominated once a day. You can always ask
  // an NPC to nominate instead (the only way once you're dead). Nothing can
  // be pressed while a vote is being counted.
  const blocked = !t?.alive || e.nominatedToday(t.id) || !!voteAnim;

  $("nominate").hidden = !h.alive;
  $("nominate").disabled = blocked || s.dayNominators.includes(h.id);
  $("request-nomination").hidden = false;
  $("request-nomination").disabled = blocked;
  $("pass").disabled = !!voteAnim;
  // While a vote is being counted, this shows how things stood before it.
  const block = voteAnim ? voteAnim.before.block : s.block;
  const marked = block?.nomineeId ? e.player(block.nomineeId) : null;

  $("block-status").textContent =
    s.phase !== "day"
      ? ""
      : marked
        ? `Marked for execution: ${marked.label} (${block.count} votes). End the day to execute them.`
        : block
          ? `Tied at ${block.count} votes: nobody is marked for execution.`
          : "";
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

// ── Town square size ─────────────────────────────────────────

// The browser remembers the size (if it can store it; the default otherwise).
let squareSize = TOWN_SQUARE_SIZE;

try {
  squareSize = Number(localStorage.getItem("townSquareSize")) || squareSize;
} catch {}

function setSquareSize(size) {
  // Rounded so repeated steps of 0.1 don't drift (0.30000000000000004...).
  squareSize = Math.min(
    TOWN_SQUARE_SIZE_MAX,
    Math.max(TOWN_SQUARE_SIZE_MIN, Math.round(size * 100) / 100),
  );

  $("circle").style.setProperty("--scale", squareSize);
  $("size-value").textContent = `${Math.round(squareSize * 100)}%`;
  $("size-down").disabled = squareSize <= TOWN_SQUARE_SIZE_MIN;
  $("size-up").disabled = squareSize >= TOWN_SQUARE_SIZE_MAX;

  try {
    localStorage.setItem("townSquareSize", String(squareSize));
  } catch {}
}

function toggleSizeSettings(open = $("size-popup").hidden) {
  $("size-popup").hidden = !open;
  $("size-settings").setAttribute("aria-expanded", String(open));
}

// Pressing anywhere outside the popup closes it. (The menu button toggles it
// itself.)
document.addEventListener("click", (ev) => {
  if (
    !$("size-popup").hidden &&
    !ev.target.closest("#size-popup, #size-settings")
  ) {
    toggleSizeSettings(false);
  }
});

function resetGame() {
  s = null;
  e = null;
  selectedPlayerId = null;
  nightPicks = [];
  shownGameOver = false;

  $("public-panel").open = true;

  $("night-choice").hidden = true;
  $("day-controls").hidden = true;
  $("day-answer").textContent = "";

  $("game").hidden = true;
  $("setup").hidden = false;
  $("reveal").hidden = true;
  $("actions").hidden = true;

  $("answer").textContent = "";
  $("error").textContent = "";

  $("count-popup").hidden = true;
  $("count-info").setAttribute("aria-expanded", "false");

  toggleSizeSettings(false);
}

// ── Event wiring ─────────────────────────────────────────────

$("random-seed").onclick = randomSeed;
$("count-info").onclick = toggleCountInfo;

$("size-settings").onclick = () => toggleSizeSettings();
$("size-down").onclick = () => setSquareSize(squareSize - TOWN_SQUARE_SIZE_STEP);
$("size-up").onclick = () => setSquareSize(squareSize + TOWN_SQUARE_SIZE_STEP);
setSquareSize(squareSize);

$("seats").onchange = () => {
  if (!$("count-popup").hidden) {
    $("count-popup").hidden = true;
    $("count-info").setAttribute("aria-expanded", "false");
  }
};

// Pressing a popup (or the dimmed backdrop around it) closes it.
for (const id of ["script-dialog", "role-dialog"]) {
  $(id).onclick = () => $(id).close();
}

// Any character name outside the town square opens its role popup.
document.addEventListener("click", (ev) => {
  const link = ev.target.closest?.(".role-link");

  if (link) {
    showRole(link.dataset.role);
  }
});

$("reset").onclick = resetGame;
$("start").onclick = start;

$("ask").onclick = () => {
  try {
    $("answer").innerHTML = linkRoles(e.ask(selectedPlayerId));
    render();
  } catch (err) {
    $("answer").textContent = err.message;
  }
};

$("nominate").onclick = () => runVote(() => e.nominate(selectedPlayerId));

$("request-nomination").onclick = () =>
  runVote(() => e.requestNomination(selectedPlayerId));

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
    $("answer").innerHTML = linkRoles(
      e.artist(selectedPlayerId, $("artist-question").value),
    );
    render();
  } catch (err) {
    $("answer").textContent = err.message;
  }
};

$("night-select").onclick = () => {
  try {
    e.choose(nightPicks);
    nightPicks = [];
    render();
  } catch (err) {
    $("night-error").textContent = err.message;
  }
};

// Skipping an optional night ability (the Seamstress).
$("night-skip").onclick = () => {
  try {
    e.choose([]);
    nightPicks = [];
    render();
  } catch (err) {
    $("night-error").textContent = err.message;
  }
};

$("savant").onclick = () => {
  try {
    $("day-answer").innerHTML = linkRoles(e.savant());
    render();
  } catch (err) {
    $("day-answer").textContent = err.message;
  }
};

$("pass").onclick = () => {
  try {
    e.endDay();
    selectedPlayerId = null;
    $("day-answer").textContent = "";
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
