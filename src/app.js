import {
  name,
  COUNTS
} from "./data.js";
import {
  createState
} from "./setup.js";
import {
  Engine
} from "./engine.js";

const $ = id =>
  document.getElementById(id);

const esc = x =>
  String(x ?? "").replace(
    /[&<>"']/g,
    c => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    } [c])
  );

let scripts = [];
let s;
let e;
let selectedPlayerId = null;

async function load() {
  try {
    const files =
      await fetch(
        "scripts/index.json"
      ).then(r => r.json());

    scripts =
      await Promise.all(
        files.map(
          async f => ({
            file: f,
            raw: await fetch(
              `scripts/${f}`
            ).then(
              r => r.json()
            )
          })
        )
      );

    $("script").innerHTML =
      scripts.map(
        (x, i) =>
        `<option value="${i}">${
            esc(
              x.raw.find(
                y=>y?.id==="_meta"
              )?.name??x.file
            )
          }</option>`
      ).join("");
  } catch (err) {
    $("error").textContent =
      err.message;
  }
}

function start() {
  try {
    s = createState(
      scripts[
        +$("script").value
      ].raw,
      +$("seats").value,
      $("seed").value
    );

    e = new Engine(s);
    e.start();

    selectedPlayerId = null;

    $("setup").hidden = true;
    $("game").hidden = false;

    render();
  } catch (err) {
    $("error").textContent =
      err.message;
  }
}

function circle() {
  const voters =
    new Set(
      (
        s.lastVote?.records ?? []
      )
      .filter(x => x.counted)
      .map(x => x.playerId)
    );

  $("circle").innerHTML =
    s.players.map(
      (p, i) => {
        const token =
          p.human ||
          p.claimKnown ?
          name(p.claim) :
          "Unknown";

        return `
          <button
            title="${esc(p.label)}"
            class="seat ${
              p.human?"human":""
            } ${
              p.alive?"":"dead"
            } ${
              p.id===selectedPlayerId
                ?"selected"
                :""
            }"
            style="--a:${
              i/s.players.length*360
            }deg"
            data-id="${p.id}"
            ${
              p.human
                ?"disabled"
                :""
            }
          >
            ${
              voters.has(p.id)
                ?'<span class="vote-hand">✋</span>'
                :""
            }

            <span class="token ${
              p.claimKnown||
              p.human
                ?""
                :"unknown"
            }">
              ${esc(token)}
            </span>

            <small>
              ${esc(p.label)}
            </small>

            <br>

            <small>
              ${
                p.alive
                  ?"alive"
                  :"DEAD"
              }
            </small>
          </button>
        `;
      }
    ).join("");

  $("circle")
    .querySelectorAll(
      "[data-id]:not(:disabled)"
    )
    .forEach(
      b =>
      b.onclick = () => {
        selectedPlayerId =
          b.dataset.id;

        $("answer").textContent = "";
        render();
      }
    );
}

function renderPublic() {
  const groups = [];
  let current = null;

  for (const text of s.publicLog) {
    const m =
      text.match(
        /^Day\s+(\d+)/i
      );

    const day =
      m?.[1] ??
      current?.day ??
      String(s.day || 1);

    if (
      !current ||
      current.day !== day
    ) {
      current = {
        day,
        items: []
      };

      groups.push(current);
    }

    current.items.push(
      m ?
      text.replace(
        /^Day\s+\d+\s*[:—-]?\s*/i,
        ""
      ) :
      text
    );
  }

  $("public").innerHTML = [...groups]
    .reverse()
    .map(
      g =>
      `<li class="day-break">
            <span>
              Day ${esc(g.day)}
            </span>
          </li>
          ${
            [...g.items]
              .reverse()
              .map(
                x=>
                  `<li class="log-entry">
                    ${esc(x)}
                  </li>`
              )
              .join("")
          }`
    )
    .join("");
}

function reveal() {
  const r = e.reveal();

  $("reveal").hidden = !r;

  if (!r) {
    return;
  }

  $("result").innerHTML =
    `<div class="result-banner">
      <strong>
        ${esc(
          r.winner.toUpperCase()
        )} WINS
      </strong>
      <span>
        ${esc(r.reason)}
      </span>
    </div>`;
  $("roles").innerHTML =
    r.players.map(
      p =>
      `<article class="reveal-card">
          <header>
            ${esc(p.label)}
          </header>

          <strong class="true-role">
            ${esc(
              name(p.startRole)
            )}
          </strong>

          <span class="alignment ${p.alignment}">
            ${esc(p.alignment)}
          </span>

          ${
            p.role!==p.startRole
              ?`<p>
                  Became ${
                    esc(name(p.role))
                  }
                </p>`
              :""
          }

          <p>
            ${
              p.alive
                ?"Survived"
                :`Died by ${
                    esc(
                      p.death??
                      "unknown cause"
                    )
                  }`
            }
          </p>

          ${
            p.claim!==p.startRole
              ?`<small>
                  Claimed ${
                    esc(
                      name(p.claim)
                    )
                  }
                </small>`
              :""
          }
        </article>`
    ).join("");

  const key =
    r.keyMoments;

  $("audit").innerHTML =
    key.length ?
    `<h3>Key moments</h3>
        ${
          [...key]
            .reverse()
            .map(
              x=>
                `<div class="key-event">
                  <b>
                    ${esc(x.group)}
                  </b>
                  <span>
                    ${esc(x.text)}
                  </span>
                </div>`
            )
            .join("")
        }` :
    "";
}

function render() {
  const h = e.human();

  const t =
    selectedPlayerId ?
    e.player(
      selectedPlayerId
    ) :
    null;

  const talk =
    e.talkStatus(
      t?.id
    );

  $("role").textContent =
    `You are ${name(h.shown)}`;

  $("status").textContent =
    s.winner ?
    `${s.winner.toUpperCase()}: ${s.reason}` :
    `${s.phase} ${
          s.day||s.night
        } — ${
          e.alive().length
        } alive`;

  $("selected-player").textContent =
    t ?
    `Selected: ${t.label}` :
    "";

  $("talk").textContent =
    t ?
    `Conversations: ${
          talk.used
        }/${
          talk.limit
        }; ${
          talk.remaining
        } remaining${
          talk.already
            ?"; already asked this player"
            :""
        }.` :
    "";

  circle();

  $("private").innerHTML = [...s.privateLog]
    .reverse()
    .map(
      x => `<li>${esc(x)}</li>`
    )
    .join("");

  renderPublic();

  $("actions").hidden = !!s.winner ||
    !t;

  $("ask").disabled = !t ||
    talk.already ||
    !talk.remaining;

  $("nominate").disabled = !t?.alive;

  $("slay").hidden = !(
    h.shown === "slayer" &&
    !s.slayerUsed
  );

  reveal();
}

function randomSeed() {
  let n = 0;

  while (!n) {
    if (
      globalThis.crypto
      ?.getRandomValues
    ) {
      const a =
        new Uint32Array(1);

      crypto.getRandomValues(a);
      n = a[0];
    } else {
      n =
        Math.floor(
          Math.random() *
          4294967295
        ) + 1;
    }
  }

  $("seed").value = String(n);
}

function toggleCountInfo() {
  const box = $("count-popup");
  const btn = $("count-info");

  const c =
    COUNTS[
      +$("seats").value
    ];

  if (!c) {
    return;
  }

  box.innerHTML =
    `<strong aria-label="Townsfolk Outsiders Minions Demons">
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

  btn.setAttribute(
    "aria-expanded",
    String(!box.hidden)
  );
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

  $("count-info").setAttribute(
    "aria-expanded",
    "false"
  );
}

$("random-seed").onclick =
  randomSeed;

$("count-info").onclick =
  toggleCountInfo;

$("seats").onchange = () => {
  if (!$("count-popup").hidden) {
    $("count-popup").hidden = true;

    $("count-info").setAttribute(
      "aria-expanded",
      "false"
    );
  }
};

$("reset").onclick = resetGame;
$("start").onclick = start;

$("ask").onclick = () => {
  try {
    $("answer").textContent =
      e.ask(selectedPlayerId);

    render();
  } catch (err) {
    $("answer").textContent =
      err.message;
  }
};

$("nominate").onclick = () => {
  try {
    e.nominate(
      selectedPlayerId
    );

    selectedPlayerId = null;
    render();
  } catch (err) {
    $("answer").textContent =
      err.message;
  }
};

$("slay").onclick = () => {
  try {
    e.slay(selectedPlayerId);
    render();
  } catch (err) {
    $("answer").textContent =
      err.message;
  }
};

$("pass").onclick = () => {
  try {
    e.endDay();
    selectedPlayerId = null;
    render();
  } catch (err) {
    $("answer").textContent =
      err.message;
  }
};

$("seats").innerHTML =
  Array.from({
      length: 11
    },
    (_, i) =>
    `<option>${i+5}</option>`
  ).join("");

$("seats").value = 10;

load();