import {
  ROLES,
  name,
  team,
  COUNTS,
  DEFAULT_SEATS,
  PLAYER_COLOURS,
  alignment,
  ARTIST_QUESTIONS,
  ABILITIES,
  VOTE_COUNT_DELAY_MS,
  VOTE_TICK_MS,
  HAND_WAIT_MS,
  BOOM_WAIT_MS,
  ROUND_ROBIN_ALIVE,
  CLAIM_ALERT_HOLD_MS,
  CLAIM_ALERT_FADE_MS,
  PERF_LOGGING,
  PERF_SLOW_MS,
  TOWN_SQUARE_SIZE,
  TOWN_SQUARE_SIZE_STEP,
  TOWN_SQUARE_SIZE_MIN,
  TOWN_SQUARE_SIZE_MAX,
  JINXES,
} from "./data.js";
import { createState } from "./setup.js";
import { ability } from "./storyteller.js";
import { Engine } from "./engine.js";
import {
  AMNESIAC_GUESSES,
  AMNESIAC_QUESTIONS,
  AMNESIAC_SHAPES,
  amnesiacShape,
} from "./characters/townsfolk/amnesiac.js";
import { claimTo } from "./strategy.js";
import { NIGHT_STEPS, nightOrder } from "./characters/nightorder.js";
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
// (Coloured by alignment: blue good, red evil.)
const roleLink = (id) =>
  `<button type="button" class="role-link role-${alignment(
    id,
  )}" data-role="${esc(id)}">${esc(name(id))}</button>`;

// ── Player colours ───────────────────────────────────────────

// Each seat's colour (PLAYER_COLOURS in data.js), by seat order.
const playerColour = (p) =>
  PLAYER_COLOURS[s.players.indexOf(p) % PLAYER_COLOURS.length];

// Escaped text with every player's name ("Player 3", "You") in their colour
// (just escaped before a game starts).
// (`(?!\d)` keeps "Player 1" from matching the start of "Player 10".)
function colourPlayers(text) {
  if (!s) {
    return esc(text);
  }

  const byLabel = new Map(s.players.map((p) => [p.label, p]));
  const pattern = new RegExp(
    `\\b(${[...byLabel.keys()]
      .sort((a, b) => b.length - a.length)
      .map(escapeRegExp)
      .join("|")})\\b(?!\\d)`,
    "g",
  );

  return esc(text).replace(
    pattern,
    (label) =>
      `<span class="player-name" style="color:${playerColour(
        byLabel.get(label),
      )}">${label}</span>`,
  );
}


// Escapes text, turning every character name in it into a role link and
// every player's name into their colour (see colourPlayers()).
// (split() with a capture group puts the matched names at odd indexes.)
const linkRoles = (text) =>
  String(text ?? "")
    .split(ROLE_PATTERN)
    .map((part, i) =>
      i % 2 ? roleLink(ROLE_BY_NAME.get(part)) : colourPlayers(part),
    )
    .join("");

const TEAM_NAMES = {
  townsfolk: "Townsfolk",
  outsider: "Outsider",
  minion: "Minion",
  demon: "Demon",
  fabled: "Fabled",
};

// Opens a popup describing one character; pressing the popup closes it.
function showRole(id) {
  const ability = ABILITIES[id] ?? "";

  $("role-sheet").innerHTML = `<h2 class="role-${team(id) === "fabled" ? "fabled" : alignment(id)}">${esc(name(id))}</h2>
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

// Your mark on each player, by id: "good" or "evil" (unmarked players
// aren't listed). Cleared with Reset.
let marks = {};

const markFor = (id) => marks[id] ?? "";

// Players picked in the town square while the Storyteller has woken you.
let nightPicks = [];
// How many of the engine's dawn / dusk cards (s.phaseCards) have been shown.
let cardsShown = 0;
// Each NPC's latest ⚠ (claimAlert) seen, and when its clock started.
const alertSeen = new Map();
const alertStart = new Map();

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

    stopBoomCountdown();
    selectedPlayerId = null;
    talkingTo = null;
    marks = {};
    cardsShown = 0;
    alertSeen.clear();
    alertStart.clear();

    $("setup").hidden = true;
    $("game").hidden = false;

    render();
  } catch (err) {
    $("error").textContent = err.message;
  }
}

// ── Rendering ────────────────────────────────────────────────

// The ⚠ on an NPC who just claimed in public unprompted: it holds for
// CLAIM_ALERT_HOLD_MS, then fades over CLAIM_ALERT_FADE_MS. Its clock starts
// once no dawn / dusk card covers the town square. (The seats are redrawn
// often, so each redraw picks the fade up where it was.)
function claimAlert(p) {
  const title = 'title="Claimed in public"';

  if (!p.claimAlert) {
    return "";
  }

  if (alertSeen.get(p.id) !== p.claimAlert) {
    if ($("phase-dialog").open) {
      return `<span class="claim-alert waiting" ${title}>⚠</span>`;
    }

    alertSeen.set(p.id, p.claimAlert);
    alertStart.set(p.id, performance.now());
  }

  const elapsed = performance.now() - alertStart.get(p.id);

  if (elapsed >= CLAIM_ALERT_HOLD_MS + CLAIM_ALERT_FADE_MS) {
    return "";
  }

  return `<span class="claim-alert" ${title} style="animation-duration:${CLAIM_ALERT_FADE_MS}ms;animation-delay:${Math.round(
    CLAIM_ALERT_HOLD_MS - elapsed,
  )}ms">⚠</span>`;
}

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
      // (What they've told you, or said in public: see claimTo().)
      const claim = p.human ? p.claim : claimTo(p, e.human());
      const token = claim ? name(claim) : "Unknown";
      const mark = markFor(p.id);

      return `
        <button
          title="${esc(`${p.label}: ${token}${mark ? ` (you marked them ${mark})` : ""}`)}"
          class="seat ${p.human ? "human" : ""} ${p.alive ? "" : "dead"} ${
            mark ? `guess-${mark}` : ""
          } ${
            (s.pending ? nightPicks.includes(p.id) : p.id === selectedPlayerId)
              ? "selected"
              : ""
          }"
          style="--a:${i / s.players.length * 360}deg"
          data-id="${p.id}"
          ${p.human ? "disabled" : ""}
        >
          ${claimAlert(p)}
          ${voters.has(p.id) ? '<span class="vote-hand">✋</span>' : ""}
          ${
            p.id === skullId
              ? '<span class="skull" title="Marked for execution">💀</span>'
              : ""
          }

          <span class="token ${
            claim ? `role-${alignment(claim)}` : "unknown"
          } ${token.length > 10 ? "long" : ""}">
            ${esc(token)}
          </span>

          <small class="player-name" style="color:${playerColour(p)}">
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

  $("clocktower").onclick = () => showScript();

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
          // (Choosing someone else ends any conversation.)
          if (b.dataset.id !== talkingTo) {
            talkingTo = null;
          }

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

// Your hand during a vote: it starts lowered, and one button under the
// clock raises or lowers it: for HAND_WAIT_MS before the count starts
// (counting down the seconds, `ready`), then as the votes are counted,
// until the clock hand reaches you and counts it. `up()` says whether
// it's up now; `lock()` ends your choice and says whether it's up.
function handChoice(c) {
  const seat = c.querySelector(`[data-id="${s.humanId}"]`);
  let up = false;
  let left = Math.ceil(HAND_WAIT_MS / 1000);

  c.insertAdjacentHTML(
    "beforeend",
    '<button id="hand-toggle" type="button" class="hand-toggle"></button>',
  );

  const b = $("hand-toggle");
  const show = () => {
    b.textContent = `${up ? "Lower hand" : "✋ Raise hand"}${left > 0 ? ` (${left})` : ""}`;
    seat?.querySelector(".vote-hand.mine")?.remove();

    if (up) {
      seat?.insertAdjacentHTML("afterbegin", '<span class="vote-hand mine">✋</span>');
    }
  };

  b.onclick = () => {
    up = !up;
    show();
  };

  show();

  const ready = new Promise((done) => {
    const timer = setInterval(() => {
      left--;
      show();

      if (left <= 0) {
        clearInterval(timer);
        done();
      }
    }, 1000);
  });

  return {
    ready,
    up: () => up,
    lock() {
      b.remove();
      seat?.querySelector(".vote-hand.mine")?.remove();
      return up;
    },
  };
}

// Runs a nomination (`fn` calls the engine, leaving the vote waiting), then
// shows its vote: clock hands fade in over the clock tower, the small hand
// on the nominator and the large hand on the nominee; you get HAND_WAIT_MS
// to raise your hand (see handChoice()), and the NPCs decide (openVote());
// then the large hand ticks clockwise round the circle (starting after the
// nominee, ending on them), raising each voter's hand; you can still raise
// or lower yours until it reaches you, and then the votes are cast; then
// the skull marks the nominee if they're now marked for execution, and the
// clock tower returns.
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
  if (!result.pending || s.phase !== "day") {
    render();
    return;
  }

  voteAnim = { previousBlock, before, revealed: new Set() };
  render();

  // Anyone who came clean before the vote (a card) is heard first.
  await cardsClosed();

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

  // Let the hands fade in (0.4s), then pause before counting starts: long
  // enough for you to raise your hand, if you can vote.
  await sleep(400);

  const choice = e.canVote() ? handChoice(c) : null;

  await choice?.ready;

  // The NPCs' votes, decided now; yours, until the clock hand reaches you.
  let records = e.openVote(choice?.up() ?? false);
  let hand = false;

  await sleep(VOTE_COUNT_DELAY_MS);

  for (let k = 1; k <= n; k++) {
    const p = s.players[(start + k) % n];
    const seat = c.querySelector(`[data-id="${p.id}"]`);
    // (Yours is already showing, and can change until you're counted.)
    const yours = p.human && choice;
    let record = records.find((x) => x.playerId === p.id);

    // A voter's hand goes up before the clock hand reaches them...
    if (record?.attempted && !yours) {
      seat?.insertAdjacentHTML(
        "afterbegin",
        `<span class="vote-hand ${record.counted ? "" : "not-counted"}">✋</span>`,
      );

      await sleep(Math.round(VOTE_TICK_MS * 0.55));
    }

    angle += 360 / n;
    aim(minute, angle);

    await sleep(VOTE_TICK_MS);

    // (Your vote is settled now the clock hand has reached you: the button
    // goes, and your hand stays as it was.)
    if (yours) {
      hand = choice.lock();
      records = e.openVote(hand);
      record = records.find((x) => x.playerId === p.id);

      if (record.attempted) {
        seat?.insertAdjacentHTML(
          "afterbegin",
          `<span class="vote-hand ${record.counted ? "" : "not-counted"}">✋</span>`,
        );
      }
    }

    // ...and is counted as it passes over them.
    if (record?.counted) {
      voteAnim.revealed.add(p.id);
      votes++;
      tally.textContent = `${votes} / ${result.needed} needed`;
      seat?.querySelector(".vote-hand")?.classList.add("counted");
    }
  }

  // (Cast, with your hand as it was when the clock hand reached you.)
  result = e.castVotes(hand);
  tally.textContent = `${result.count} / ${result.needed} needed`;

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

// Toggles a player in or out of tonight's picks: living players, or dead
// ones for the Professor, and not one the choice excludes (the Exorcist's
// pick last night). Once the limit is reached, a new pick replaces the
// oldest one.
function pickAtNight(id) {
  const p = e.player(id);

  if (
    !p ||
    !s.pending.count ||
    p.alive === Boolean(s.pending.dead) ||
    s.pending.exclude?.includes(id)
  ) {
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

  // The Courtier chooses a character instead of players.
  const characters = $("night-character");

  characters.hidden = !p.characters;

  if (p.characters && characters.dataset.night !== `${p.night}`) {
    characters.dataset.night = `${p.night}`;
    characters.innerHTML = [
      '<option value="">Choose a character</option>',
      ...p.characters.map(
        (id) => `<option value="${id}">${esc(name(id))}</option>`,
      ),
    ].join("");
  }

  const excluded = (p.exclude ?? []).map((id) => e.player(id).label);

  $("night-picks").innerHTML = p.characters
    ? ""
    : nightPicks.length
      ? colourPlayers(`Selected: ${labels}`)
      : colourPlayers(
          `Click ${p.count} ${p.dead ? "dead " : ""}player${
            p.count > 1 ? "s" : ""
          } in the town square.${
            excluded.length ? ` (Not ${excluded.join(" or ")}.)` : ""
          }`,
        );

  $("night-select").disabled = p.characters
    ? !characters.value
    : nightPicks.length !== p.count;
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

// A crescent moon, in the clock tower's gold, for the Night order button.
const MOON_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true">
  <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" fill="#f0cf83" />
</svg>`;

const TEAMS = [
  ["townsfolk", "Townsfolk"],
  ["outsider", "Outsiders"],
  ["minion", "Minions"],
  ["demon", "Demons"],
  ["fabled", "Fabled"],
];

// Opens the script popup: the characters (see scriptSheet()), or, with
// `nights`, the night order (see nightSheet()). The button in its top corner
// switches between them.
function showScript(nights = false) {
  $("script-sheet").innerHTML = nights ? nightSheet() : scriptSheet();
  $("night-order").innerHTML = nights
    ? "📜 Characters"
    : `${MOON_SVG} Night order`;
  $("night-order").onclick = (ev) => {
    // (Pressing anywhere else on the popup closes it.)
    ev.stopPropagation();
    showScript(!nights);
  };

  if (!$("script-dialog").open) {
    $("script-dialog").showModal();
  }

  $("script-dialog").scrollTop = 0;
}

// The script's night order: who wakes on the first night, and on the others,
// in order, with what happens (see characters/nightorder.js).
function nightSheet() {
  const { first, other } = nightOrder(s.script.ids);
  const list = (steps) =>
    `<ol class="night-order-list">
      ${steps
        .map(({ id, text }) => {
          const step = id in NIGHT_STEPS;
          const who = step ? NIGHT_STEPS[id] : name(id);

          return `<li class="${step ? "night-step" : ""}"><b class="${
            step ? "" : `role-${alignment(id)}`
          }">${esc(who)}</b> <span>${esc(text)}</span></li>`;
        })
        .join("")}
    </ol>`;

  return `<h2>Night order</h2>
    <p class="script-author">${esc(s.script.meta.name)}</p>
    <h3>First night</h3>
    ${list(first)}
    <h3>Other nights</h3>
    ${list(other)}
    <p class="script-footnote">Minion and Demon info: 7 or more players. Characters not listed don't wake at night.</p>`;
}

// The script's characters and abilities by team, its Fabled, and the jinxes
// between its characters (see JINXES).
function scriptSheet() {
  const { meta } = s.script;
  const ids = [...s.script.ids, ...(s.script.fabled ?? [])];
  const jinxes = JINXES.filter((j) => j.ids.every((id) => ids.includes(id)));

  const sections = TEAMS.map(([t, title]) => {
    const roles = ids.filter((id) => team(id) === t);

    return roles.length
      ? `<h3 class="team-${t}">${title}</h3>
        <dl class="ability-list">
          ${roles
            .map(
              (id) =>
                `<dt class="role-${t === "fabled" ? "fabled" : alignment(id)}">${esc(name(id))}</dt><dd>${esc(ABILITIES[id] ?? "")}</dd>`,
            )
            .join("")}
        </dl>`
      : "";
  }).join("");

  return `<h2>${esc(meta.name)}</h2>
    ${meta.author ? `<p class="script-author">by ${esc(meta.author)}</p>` : ""}
    ${sections}
    ${
      jinxes.length
        ? `<h3>Jinxes</h3>
        <dl class="ability-list">
          ${jinxes
            .map(
              (j) =>
                `<dt>${j.ids.map((id) => esc(name(id))).join(" & ")}</dt><dd>${esc(j.text)}</dd>`,
            )
            .join("")}
        </dl>`
        : ""
    }
    <p class="script-footnote">* Not the first night.</p>`;
}

// Groups log lines by their "Day N" prefix, newest first.
// A public log line without its "Day 3 — " prefix.
const dayless = (text) => text.replace(/^Day\s+\d+\s*[:—-]?\s*/i, "");

// Each card's heading (before ": Day N"). A nomination card shows who came
// clean before the vote.
const PHASE_TITLES = {
  dawn: "☀️ Dawn",
  dusk: "🌙 Dusk",
  nomination: "🗣️ Before the vote",
  nominations: "⚖️ Nominations",
  roundrobin: "🔄 Round Robin",
};

// Resolves once no card is showing (after the last one is closed, and the
// town square has been redrawn).
function cardsClosed() {
  return new Promise((done) => {
    const wait = () => {
      const d = $("phase-dialog");

      if (!d.open) {
        done();
        return;
      }

      d.addEventListener("close", () => setTimeout(wait), { once: true });
    };

    wait();
  });
}

// The next dawn / dusk card the engine made (s.phaseCards), if none is
// showing: the public log lines from that change of phase, as the Public Log
// shows them. Pressing anywhere closes it (and shows the next, if any).
function showPhaseCard() {
  const d = $("phase-dialog");
  const card = s?.phaseCards?.[cardsShown];

  if (d.open || !card) {
    return;
  }

  cardsShown++;
  d.className = `script-dialog phase-dialog phase-${card.kind}`;
  $("phase-sheet").innerHTML = `
    <h2>${PHASE_TITLES[card.kind]}: Day ${card.day}</h2>
    <ul class="phase-lines">
      ${card.lines
        .map((x) => `<li class="log-entry">${colourPlayers(dayless(x))}</li>`)
        .join("")}
    </ul>
    <p class="phase-hint">Click anywhere to continue.</p>`;
  d.showModal();
}

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

    current.items.push(m ? dayless(text) : text);
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

// ── Your marks ───────────────────────────────────────────────

// The Good / Evil / ? buttons show your mark on the selected player.
function renderMark(t) {
  $("mark").hidden = !t;

  if (!t) {
    return;
  }

  document.querySelectorAll("#mark [data-guess]").forEach((b) => {
    b.setAttribute("aria-pressed", String(b.dataset.guess === markFor(t.id)));
  });
}

// Marks the selected player Good or Evil ("" clears it) and redraws. Good
// NPCs weigh your marks (see strategy evidence()).
function setMark(guess) {
  if (!selectedPlayerId) {
    return;
  }

  if (guess) {
    marks[selectedPlayerId] = guess;
  } else {
    delete marks[selectedPlayerId];
  }

  e.mark(selectedPlayerId, guess);
  render();
}

// ── Final reveal ─────────────────────────────────────────────

// Timeline labels for event types (others are just capitalised).
const EVENT_TAGS = {
  information: "Info",
  conversation: "Talk",
  talks: "NPC talks",
  cover: "Cover story",
  come_clean: "Came clean",
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

const DRUNK_FROM = {
  sweetheart: "Sweetheart",
  philosopher: "Philosopher",
  puzzlemaster: "Puzzlemaster",
};

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
  const label = (id) => colourPlayers(byId(r, id)?.label ?? id);
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
          <td>${colourPlayers(p.label)}</td>
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
    .map((p) => colourPlayers(p.label));

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
            `${colourPlayers(label(x.playerId))}${
              x.counted ? "" : " (not counted)"
            }`,
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

// What each kind of lie told to you looks like in the final reveal.
const LIE_TEXT = {
  bluff: (by, x) =>
    `${by} told you they're the ${roleLink(x.said)}: they were the ${roleLink(x.truth)}.`,
  hide: (by, x) =>
    `${by} told you they're the ${roleLink(x.said)}: they were hiding the ${roleLink(x.truth)}.`,
  bait: (by, x) =>
    `${by} told you they're the ${roleLink(x.said)} to bait the Demon: they were the ${roleLink(x.truth)}.`,
  decoy: (by, x) =>
    `${by} told you they're the ${roleLink(x.said)} to draw a Minion's guess: they were the ${roleLink(x.truth)}.`,
  fake: (by, x) =>
    `${by} faked coming clean as the ${roleLink(x.said)}: they were the ${roleLink(x.truth)}.`,
};

// "Who lied to you": every lie an NPC told you (or faked in public), by day,
// with the truth.
function liesSection(r) {
  const label = (id) => colourPlayers(byId(s, id)?.label ?? id);
  const items = r.lies.map(
    (x) =>
      `<li><span class="lie-day">Day ${x.day}</span> ${LIE_TEXT[x.kind](
        label(x.byId),
        x,
        x.aboutId ? label(x.aboutId) : "",
      )}</li>`,
  );

  return `<h3>Who lied to you</h3>${
    items.length
      ? `<ul class="lies">${items.join("")}</ul>`
      : "<p>Nobody lied to you.</p>"
  }`;
}

// Whether this game's end has been shown (the panels collapse just once).
let shownGameOver = false;

function reveal() {
  const r = e.reveal();

  $("reveal").hidden = !r;

  if (!r) {
    return;
  }

  // When the game ends, collapse the Storyteller and Public log sections,
  // and show the Final reveal collapsed too.
  if (!shownGameOver) {
    shownGameOver = true;
    $("private-panel").open = false;
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
  $("lies").innerHTML = liesSection(r);
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
    new Blob(
      [PERF_LOGGING ? `${e.debugLog()}\n\n${perfReport()}\n` : e.debugLog()],
      { type: "text/plain" },
    ),
  );
}

// ── Performance timing (PERF_LOGGING in data.js) ────────────

const perf = { actions: [], renders: [], longTasks: [] };
const PERF_KEEP = 2000;
// The latest click or change, which a long task is put down to.
let perfAction = "page load";

// What was pressed: its id, or the seat's player, or its tag.
function perfName(el) {
  const x = el?.closest?.("button, select, input, a, dialog, summary, [id]");
  const seat = x?.closest?.(".seat");

  if (seat) {
    return `seat ${e?.player(seat.dataset.id)?.label ?? "?"}`;
  }

  return x?.id || x?.className || x?.tagName?.toLowerCase() || "page";
}

// Where the game was at: "Day 3", "Night 2" or "setup".
function perfWhen() {
  if (!s) {
    return "setup";
  }

  if (s.winner) {
    return "game over";
  }

  return s.phase === "night" ? `Night ${s.night}` : `Day ${s.day}`;
}

function perfNote(list, entry) {
  list.push(entry);
  list.splice(0, list.length - PERF_KEEP);

  if (entry.ms >= PERF_SLOW_MS) {
    console.warn(`[perf] ${entry.action} (${entry.when}): ${entry.ms} ms`);
  }
}

if (PERF_LOGGING) {
  // From the event (before its handler runs) to the next frame drawn: the
  // engine, the redraw, layout and paint.
  for (const type of ["click", "change", "keydown"]) {
    document.addEventListener(
      type,
      (ev) => {
        const action = `${type} ${perfName(ev.target)}`;
        const when = perfWhen();
        const t0 = performance.now();

        perfAction = action;
        requestAnimationFrame(() =>
          setTimeout(() =>
            perfNote(perf.actions, {
              action,
              when,
              ms: Math.round(performance.now() - t0),
            }),
          ),
        );
      },
      true,
    );
  }

  // Tasks of 50 ms or more, whatever caused them (the browser's own report).
  try {
    new PerformanceObserver((list) => {
      for (const x of list.getEntries()) {
        perfNote(perf.longTasks, {
          action: `long task after ${perfAction}`,
          when: perfWhen(),
          ms: Math.round(x.duration),
        });
      }
    }).observe({ type: "longtask", buffered: true });
  } catch {}

  globalThis.soloPerf = () => {
    console.log(perfReport());
    return perf;
  };
}

// Count, average and slowest of each action; the slowest few; long tasks.
function perfReport() {
  const by = new Map();

  for (const x of [...perf.actions, ...perf.renders]) {
    const v = by.get(x.action) ?? { n: 0, total: 0, max: 0 };

    v.n++;
    v.total += x.ms;
    v.max = Math.max(v.max, x.ms);
    by.set(x.action, v);
  }

  const rows = [...by]
    .sort((a, b) => b[1].max - a[1].max)
    .map(
      ([k, v]) =>
        `  ${k.padEnd(32)} ${String(v.n).padStart(5)}x  avg ${(v.total / v.n)
          .toFixed(1)
          .padStart(6)} ms  max ${String(v.max).padStart(5)} ms`,
    );
  const slowest = [...perf.actions, ...perf.renders, ...perf.longTasks]
    .sort((a, b) => b.ms - a.ms)
    .slice(0, 15)
    .map((x) => `  ${String(x.ms).padStart(5)} ms  ${x.action} (${x.when})`);

  return [
    "=== Performance ===========================================",
    `  (Clicks: until the next frame is drawn. Renders: JavaScript only. Slow: ${PERF_SLOW_MS} ms or more.)`,
    ...rows,
    "",
    "  Slowest:",
    ...slowest,
    "",
    `  Long tasks: ${perf.longTasks.length}`,
  ].join("\n");
}

// The Amnesiac's choices: questions (with any answers so far), then
// guesses grouped by shape. The group like your latest information is open;
// the others fold away under "Other kinds of information". Guesses already
// made show what the Storyteller said.
function renderAmnesiac(h) {
  const asked = h.amnesiacAsked ?? {};
  const said = h.amnesiacSaid ?? {};
  const latest = h.memories
    .filter((m) => m.role === "amnesiac")
    .map((m) => amnesiacShape(m.text))
    .filter(Boolean)
    .at(-1);
  const group = (shape) => {
    const choices = Object.entries(AMNESIAC_GUESSES)
      .filter(([, g]) => g.shape === shape)
      .map(([k, g]) =>
        k in said
          ? `<button type="button" disabled>${esc(g.text)} <b>${said[k]}</b></button>`
          : `<button type="button" data-guess="${k}">${esc(g.text)}</button>`,
      )
      .join("");
    const tag = shape === latest ? " · like your information" : "";

    return `<fieldset class="${shape === latest ? "like" : ""}"><legend>${esc(AMNESIAC_SHAPES[shape])}${tag}</legend>${choices}</fieldset>`;
  };
  const others = Object.keys(AMNESIAC_SHAPES)
    .filter((k) => k !== latest)
    .map(group)
    .join("");

  $("amnesiac-questions").innerHTML = Object.entries(AMNESIAC_QUESTIONS)
    .map(([k, q]) =>
      k in asked
        ? `<button type="button" disabled>${esc(q)} <b>${asked[k] ? "YES" : "NO"}</b></button>`
        : `<button type="button" data-question="${k}">${esc(q)}</button>`,
    )
    .join("");

  $("amnesiac-guesses").innerHTML = latest
    ? `${group(latest)}<details><summary>Other kinds of information</summary>${others}</details>`
    : others;
}

// Redraws the page (timed: see PERF_LOGGING).
function render() {
  const t0 = performance.now();

  draw();

  if (PERF_LOGGING) {
    perfNote(perf.renders, {
      action: "render",
      when: perfWhen(),
      ms: Math.round(performance.now() - t0),
    });
  }
}

function draw() {
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

  $("selected-player").innerHTML = t ? colourPlayers(`Selected: ${t.label}`) : "";

  $("talk").textContent = !t
    ? ""
    : s.nominationsOpen
      ? "Nominations are open: no more conversations today."
      : `Conversations: ${talk.used}/${talk.limit}; ${talk.remaining} remaining${
          talk.already ? "; already asked this player" : ""
        }.`;

  // (Before the seats: a ⚠ waits while a card covers them.)
  showPhaseCard();
  circle();

  $("private").innerHTML = [...s.privateLog]
    .reverse()
    .map((x) => `<li class="log-entry">${linkRoles(x)}</li>`)
    .join("");

  renderPublic();
  renderMark(t);
  renderNightChoice();

  $("actions").hidden = !!s.winner || !t || !!s.pending || !!s.boom;
  $("day-controls").hidden =
    !!s.winner || !!s.pending || !!s.boom || s.phase !== "day";
  // The Boomdandy's countdown: you select who you point at until it runs
  // out (see boomCountdown()).
  $("boom-choice").hidden = !s.boom || !!s.winner;

  if (s.boom && !s.winner) {
    boomCountdown();
  }

  $("boom-left").textContent = boomLeft;
  $("boom-pick").innerHTML = colourPlayers(
    boomTarget(t)
      ? `Pointing at: ${t.label}`
      : "Select a living player to point at.",
  );
  $("fisherman").hidden = !(
    ability(h) === "fisherman" &&
    h.alive &&
    !h.fishermanUsed
  );
  $("savant").hidden = !(
    ability(h) === "savant" &&
    h.alive &&
    h.savantDay !== s.day
  );
  $("amnesiac-controls").hidden = !e.amnesiacOpen();

  if (e.amnesiacOpen()) {
    renderAmnesiac(h);
  }

  // (Gone once you've asked them today, or nominations have started.)
  $("ask").hidden = !t || talk.already || s.nominationsOpen;
  $("ask").disabled = !t || !talk.remaining || s.nominationsOpen;
  // The end of the conversation you're in: Share My Info (once a day, before
  // nominations open) and Leave conversation.
  const talking = Boolean(t) && t.id === talkingTo && s.phase === "day";

  $("conversation-controls").hidden = !talking;
  $("share-info").hidden =
    !talking || s.nominationsOpen || (s.toldToday ?? []).includes(t.id);
  // Each player can nominate and be nominated once a day. You can always ask
  // an NPC to nominate instead (the only way once you're dead). Nothing can
  // be pressed while a vote is being counted, or NPCs are nominating.
  // Dead players can be nominated too.
  const blocked = !t || e.nominatedToday(t.id) || !!voteAnim || nominating;

  // Nominations wait for you to start them (Start Nominations); then you
  // can nominate, and end the day.
  const open = s.phase === "day" && s.nominationsOpen;

  $("start-nominations").hidden = open || s.phase !== "day";
  $("start-nominations").disabled = !!voteAnim || nominating;
  $("nomination-controls").hidden = !open || !!s.winner || !!s.pending;
  $("npc-nominations").textContent = `NPC nominations ${s.npcWanting ?? 0}`;
  $("npc-nominations").disabled =
    !s.npcWanting || !!voteAnim || nominating || !!s.winner;
  $("pass").hidden = !open;
  $("nominate").hidden = !h.alive;
  $("nominate").disabled = blocked || s.dayNominators.includes(h.id);
  $("request-nomination").hidden = false;
  $("request-nomination").disabled = blocked;
  $("pass").disabled = !!voteAnim || nominating;
  // Round Robin: under the nomination buttons once ROUND_ROBIN_ALIVE or
  // fewer are alive; once used, it stays, disabled, for the rest of the game.
  $("round-robin-controls").hidden =
    !open ||
    !!s.winner ||
    !!s.pending ||
    (!s.roundRobinDay && e.alive().length > ROUND_ROBIN_ALIVE);
  $("round-robin").disabled =
    !e.roundRobinReady() || !!voteAnim || nominating;
  // While a vote is being counted, this shows how things stood before it.
  const block = voteAnim ? voteAnim.before.block : s.block;
  const marked = block?.nomineeId ? e.player(block.nomineeId) : null;

  $("block-status").innerHTML = colourPlayers(
    s.phase !== "day"
      ? ""
      : marked
        ? `Marked for execution: ${marked.label} (${block.count} votes). End the day to execute them.`
        : block
          ? `Tied at ${block.count} votes: nobody is marked for execution.`
          : "",
  );
  $("puzzle").hidden = !(
    ability(h) === "puzzlemaster" &&
    !h.puzzleUsed &&
    h.alive
  );
  $("slay").hidden = !(
    ability(h) === "slayer" &&
    !s.slayerUsed &&
    h.alive
  );
  $("artist-controls").hidden = !(
    ability(h) === "artist" &&
    !h.artistUsed &&
    h.alive
  );
  $("gossip-controls").hidden = !(
    ability(h) === "gossip" &&
    h.alive &&
    h.gossipDay !== s.day
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
  stopBoomCountdown();
  s = null;
  e = null;
  selectedPlayerId = null;
  marks = {};
  nightPicks = [];
  shownGameOver = false;
  cardsShown = 0;
  alertSeen.clear();
  alertStart.clear();

  if ($("phase-dialog").open) {
    $("phase-dialog").close();
  }

  $("private-panel").open = true;
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
for (const id of ["script-dialog", "role-dialog", "phase-dialog"]) {
  $(id).onclick = () => $(id).close();
}

// (Then the next dawn / dusk card, and any ⚠ that was waiting for it.)
$("phase-dialog").onclose = () => s && render();

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
    talkingTo = selectedPlayerId;
    render();
  } catch (err) {
    $("answer").textContent = err.message;
  }
};

// Share My Info: you tell them your character and what you've learned.
$("share-info").onclick = () => {
  try {
    const said = e.tell(talkingTo, e.human().claim, true);

    $("answer").insertAdjacentHTML(
      "beforeend",
      `\n\n${linkRoles(`You told them:\n${said}`)}`,
    );
    render();
  } catch (err) {
    $("answer").textContent = err.message;
  }
};

$("leave-conversation").onclick = () => {
  talkingTo = null;
  selectedPlayerId = null;
  $("answer").textContent = "";
  render();
};

// ── Nominations ──────────────────────────────────────────────

// The NPC you're in a conversation with (asked, and not yet left), if any.
let talkingTo = null;

// True while NPCs are making their nominations (see npcNominations()).
let nominating = false;

// Asks before nominations open while you still have conversations left:
// resolves to true to go ahead, false to keep talking.
function confirmOpen() {
  const d = $("confirm-dialog");

  $("confirm-text").textContent =
    "Start nominations? You won't be able to talk to any more players today.";

  return new Promise((done) => {
    $("confirm-yes").onclick = () => {
      d.close();
      done(true);
    };
    $("confirm-no").onclick = () => {
      d.close();
      done(false);
    };
    d.oncancel = () => done(false);
    d.showModal();
  });
}

// Opens nominations ("Nominations are open" card), asking first if you
// could still talk to someone.
async function openNominations() {
  if (!s.nominationsOpen) {
    if (e.talkStatus().remaining && !(await confirmOpen())) {
      return;
    }

    e.openNominations();
    render();
  }
}

// "NPC nominations X": one NPC nomination and its vote (see engine
// npcNomination()), after any card is closed; then X shows how many still
// want to nominate.
async function npcNominate() {
  if (nominating || voteAnim || !s.nominationsOpen) {
    return;
  }

  nominating = true;
  render();

  try {
    await cardsClosed();

    const next = e.npcNomination();

    if (next) {
      await runVote(() => next);
    }
  } finally {
    nominating = false;
    render();
  }
}

// Your nomination (or request), once nominations have started.
async function yourNomination(fn) {
  if (s.nominationsOpen) {
    await runVote(() => fn(selectedPlayerId));
  }
}

// Start Nominations: the nomination phase begins (asking first if you could
// still talk to someone).
$("start-nominations").onclick = () => openNominations();

$("npc-nominations").onclick = () => npcNominate();

$("round-robin").onclick = () => {
  try {
    e.roundRobin();
    render();
  } catch (err) {
    $("day-answer").textContent = err.message;
  }
};

// Your Good / Evil mark on the selected player.
document.querySelectorAll("#mark [data-guess]").forEach((b) => {
  b.onclick = () => setMark(b.dataset.guess);
});

// (null: the vote waits for your hand; see runVote().)
$("nominate").onclick = () => yourNomination((id) => e.nominate(id, null));

$("request-nomination").onclick = () =>
  yourNomination((id) => e.requestNomination(id, null));

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

$("gossip-say").onclick = () => {
  try {
    $("answer").innerHTML = linkRoles(
      e.gossip(selectedPlayerId, $("gossip-question").value),
    );
    render();
  } catch (err) {
    $("answer").textContent = err.message;
  }
};

$("night-character").onchange = () => render();

$("night-select").onclick = () => {
  try {
    e.choose(
      nightPicks,
      s.pending?.characters ? $("night-character").value : null,
    );
    nightPicks = [];
    render();
  } catch (err) {
    $("night-error").textContent = err.message;
  }
};

// Skipping an optional night ability (the Seamstress, Courtier or
// Professor).
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

$("amnesiac-controls").onclick = (ev) => {
  const b = ev.target.closest("button");

  if (!b || b.disabled) {
    return;
  }

  try {
    $("day-answer").innerHTML = linkRoles(
      b.dataset.question
        ? e.amnesiacQuestion(b.dataset.question)
        : e.amnesiac(b.dataset.guess),
    );
    render();
  } catch (err) {
    $("day-answer").textContent = err.message;
  }
};

$("fisherman").onclick = () => {
  try {
    $("day-answer").innerHTML = linkRoles(e.fisherman());
    render();
  } catch (err) {
    $("day-answer").textContent = err.message;
  }
};

$("puzzle").onclick = () => {
  try {
    $("answer").innerHTML = linkRoles(e.puzzlemaster(selectedPlayerId));
    render();
  } catch (err) {
    $("answer").textContent = err.message;
  }
};

// The Boomdandy's countdown: whether you can point at player t (living, and
// not you).
const boomTarget = (t) => Boolean(t?.alive && !t.human);

// Starts the countdown from BOOM_WAIT_MS (unless it's running), ticking each
// second, paused while a dawn / dusk card is up. When it runs out, you point
// at the player you've selected (or nobody) and the countdown is settled.
let boomTimer = null;
let boomLeft = 0;

function boomCountdown() {
  if (boomTimer) {
    return;
  }

  boomLeft = Math.ceil(BOOM_WAIT_MS / 1000);
  boomTimer = setInterval(() => {
    if ($("phase-dialog").open) {
      return;
    }

    boomLeft--;

    if (boomLeft > 0) {
      $("boom-left").textContent = boomLeft;
      return;
    }

    stopBoomCountdown();

    try {
      const t = selectedPlayerId ? e.player(selectedPlayerId) : null;

      e.boomPoint(boomTarget(t) ? t.id : null);
      selectedPlayerId = null;
      $("boom-error").textContent = "";
      render();
    } catch (err) {
      $("boom-error").textContent = err.message;
    }
  }, 1000);
}

function stopBoomCountdown() {
  clearInterval(boomTimer);
  boomTimer = null;
}

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

$("seats").innerHTML = Object.keys(COUNTS)
  .map((n) => `<option>${n}</option>`)
  .join("");

$("seats").value = DEFAULT_SEATS;

$("artist-question").innerHTML = Object.entries(ARTIST_QUESTIONS)
  .map(([k, v]) => `<option value="${k}">Is this player ${esc(v)}?</option>`)
  .join("");

$("gossip-question").innerHTML = Object.entries(ARTIST_QUESTIONS)
  .map(([k, v]) => `<option value="${k}">"This player is ${esc(v)}."</option>`)
  .join("");

load();
