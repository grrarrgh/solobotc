// Drives Solo Clocktower in headless Chrome, over the DevTools protocol
// (Node's built-in WebSocket: no npm packages). It starts the game's own
// static server and Chrome, runs the commands it reads on stdin (one per
// line; # starts a comment), then stops both.
//
//   node .claude/skills/run-solobotc/driver.mjs [out-dir] < commands.txt
//
// Commands:
//   start <seed> [seats] [script name]   new game (script by its menu name)
//   cards                close any open dawn / dusk / nominations card
//   night                make tonight's choice, if you're woken (skip if
//                        allowed, else the first living players offered)
//   nominations          Start Nominations (and confirm the dialog)
//   npc                  one NPC nomination, waiting for its vote
//   endday               End day (then closes the cards)
//   playout              night / nominations / npc / endday until game over
//   seat <n>             click seat n (1 is you)
//   click <css>          click the first element matching css
//   eval <js>            print the value of a JS expression in the page
//   state                print what's showing (phase, buttons, panels)
//   wait <ms>
//   shot <name> [css]    screenshot to <out-dir>/<name>.png: the page, or
//                        clipped around the first element matching css
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

// Screenshots go in "Solo Clocktower" on the Desktop (OneDrive's, if
// that's where Windows keeps it), one folder per conversation named by
// its start time, YYYYMMDDHHMM (24-hour). Pass that folder as the first
// argument to keep adding to it; with none, a new one is named now.
const desktop = [
  path.join(os.homedir(), "OneDrive", "Desktop"),
  path.join(os.homedir(), "Desktop"),
].find((x) => fs.existsSync(x)) ?? os.homedir();
const stamp = (d = new Date()) =>
  [d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes()]
    .map((x, i) => String(x).padStart(i ? 2 : 4, "0"))
    .join("");
const out = path.resolve(
  process.argv[2] ?? path.join(desktop, "Solo Clocktower", stamp()),
);
const PORT = Number(process.env.PORT) || 8123;
const CDP = Number(process.env.CDP_PORT) || 9333;
const chromePath =
  process.env.CHROME ??
  [
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ].find((x) => fs.existsSync(x));

fs.mkdirSync(out, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (test, ms = 20000) => {
  for (const end = Date.now() + ms; Date.now() < end; await sleep(250)) {
    try {
      if (await test()) {
        return true;
      }
    } catch {
      // not up yet
    }
  }

  throw Error("timed out");
};

// The game's server, and Chrome with a throwaway profile.
const server = spawn(process.execPath, ["serve.js"], {
  cwd: root,
  env: { ...process.env, PORT: String(PORT) },
  stdio: "ignore",
});
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "solobotc-chrome-"));
const chrome =
  chromePath &&
  spawn(
    chromePath,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-first-run",
      `--remote-debugging-port=${CDP}`,
      `--user-data-dir=${profile}`,
      "about:blank",
    ],
    { stdio: "ignore" },
  );
const stop = () => {
  server.kill();
  chrome?.kill();
};

process.on("exit", stop);

let ws;
let id = 0;
const waiting = new Map();
const cmd = (method, params = {}) =>
  new Promise((r) => {
    const i = ++id;

    waiting.set(i, r);
    ws.send(JSON.stringify({ id: i, method, params }));
  });
const js = async (expr) => {
  const r = await cmd("Runtime.evaluate", {
    expression: expr,
    awaitPromise: true,
    returnByValue: true,
  });

  if (r.result?.exceptionDetails) {
    throw Error(r.result.exceptionDetails.exception?.description ?? "page error");
  }

  return r.result?.result?.value;
};

const shown = (id) =>
  `(() => { const e = document.getElementById(${JSON.stringify(id)}); return !!e && e.offsetParent !== null; })()`;

// Cards are <dialog>s ("Click anywhere to continue"): closing them is what
// a click does.
const cards = async () => {
  for (let i = 0; i < 6; i++) {
    await js(`document.querySelectorAll("dialog[open]").forEach((d) => d.close()); 1`);
    await sleep(150);
  }
};

// Nothing is being counted or nominated: End day can be pressed again.
const settled = () =>
  until(() => js(`!document.getElementById("pass").disabled`), 30000);

const commands = {
  async start(seed = "42", seats, ...scriptName) {
    const script = scriptName.join(" ");

    await js(`(() => {
      const $ = (id) => document.getElementById(id);
      $("seed").value = ${JSON.stringify(seed)};
      if (${JSON.stringify(seats ?? "")}) $("seats").value = ${JSON.stringify(seats ?? "")};
      if (${JSON.stringify(script)}) {
        const o = [...$("script").options].find((o) => o.text === ${JSON.stringify(script)});
        if (!o) throw Error("no script " + ${JSON.stringify(script)});
        $("script").value = o.value;
      }
      $("start").click();
    })()`);
    await sleep(500);

    const err = await js(`document.getElementById("error").textContent`);

    if (err) {
      throw Error(err);
    }

    await until(() => js(`!document.getElementById("game").hidden`));
    await cards();
  },

  cards,

  async night() {
    if (!(await js(shown("night-choice")))) {
      return;
    }

    await js(`(() => {
      const $ = (id) => document.getElementById(id);
      if (!$("night-skip").hidden) return $("night-skip").click();
      const seats = [...document.querySelectorAll(".seat:not([disabled])")].slice(1);
      seats.slice(0, 2).forEach((s) => s.click());
      $("night-select").click();
    })()`);
    await sleep(500);
    await cards();
  },

  async nominations() {
    await js(`document.getElementById("start-nominations").click(); 1`);
    await sleep(300);
    // "Start nominations? You won't be able to talk..." (when you could
    // still talk to someone).
    await js(
      `[...document.querySelectorAll("button")].find((b) => b.offsetParent && b.textContent.trim() === "Start nominations")?.click(); 1`,
    );
    await sleep(500);
    await cards();
  },

  async npc() {
    const pressed = await js(
      `(() => { const b = document.getElementById("npc-nominations"); if (b.disabled || !b.offsetParent) return false; b.click(); return true; })()`,
    );

    if (!pressed) {
      console.log("npc: no NPC wants to nominate");
      return;
    }

    await sleep(300);
    await cards();
    await settled();
    await cards();
  },

  async endday() {
    await js(`document.getElementById("pass").click(); 1`);
    await sleep(800);
    await cards();
  },

  async playout() {
    for (let turn = 0; turn < 60; turn++) {
      if (await js(`!document.getElementById("reveal").hidden`)) {
        return;
      }

      if (await js(shown("night-choice"))) {
        await commands.night();
        continue;
      }

      await commands.nominations();

      for (
        let k = 0;
        k < 8 && (await js(`!document.getElementById("npc-nominations").disabled`));
        k++
      ) {
        await commands.npc();
      }

      await commands.endday();
    }

    throw Error("playout: the game didn't end");
  },

  async seat(n) {
    await js(`document.querySelectorAll(".seat")[${Number(n) - 1}].click(); 1`);
    await sleep(300);
  },

  async click(...css) {
    const sel = css.join(" ");
    const ok = await js(
      `(() => { const e = document.querySelector(${JSON.stringify(sel)}); e?.click(); return !!e; })()`,
    );

    if (!ok) {
      throw Error(`nothing matches ${sel}`);
    }

    await sleep(300);
  },

  async eval(...expr) {
    console.log(JSON.stringify(await js(expr.join(" "))));
  },

  async state() {
    console.log(
      await js(`JSON.stringify({
        title: document.querySelector("#game h2")?.textContent.trim(),
        nightChoice: ${shown("night-choice")},
        gameOver: !document.getElementById("reveal").hidden,
        buttons: Object.fromEntries(["start-nominations", "pass", "nominate", "request-nomination", "npc-nominations"].map((id) => {
          const e = document.getElementById(id);
          return [id, !e.offsetParent ? "hidden" : e.disabled ? "disabled" : e.textContent.trim()];
        })),
        panels: Object.fromEntries([...document.querySelectorAll("details.panel")].map((d) => [d.id, d.open ? "open" : "closed"])),
        error: document.getElementById("error").textContent,
      })`),
    );
  },

  async wait(ms) {
    await sleep(Number(ms));
  },

  async shot(name, ...css) {
    const sel = css.join(" ");
    let clip;

    if (sel) {
      const r = await js(
        `(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e || !e.offsetParent) return null; const r = e.getBoundingClientRect(); return { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height }; })()`,
      );

      if (!r) {
        throw Error(`nothing shown matches ${sel}`);
      }

      const pad = 40;

      clip = {
        x: Math.max(0, r.x - pad),
        y: Math.max(0, r.y - pad),
        width: r.w + 2 * pad,
        height: r.h + 2 * pad,
        scale: 1,
      };
    }

    const { result } = await cmd("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: true,
      ...(clip && { clip }),
    });
    const file = path.join(out, `${name}.png`);

    fs.writeFileSync(file, Buffer.from(result.data, "base64"));
    console.log(`shot: ${file}`);
  },
};

try {
  if (!chromePath) {
    throw Error("No Chrome found: set CHROME to its path.");
  }

  await until(async () => (await fetch(`http://localhost:${PORT}/`)).ok);
  await until(async () => (await fetch(`http://localhost:${CDP}/json/version`)).ok);

  const page = (await (await fetch(`http://localhost:${CDP}/json`)).json()).find(
    (t) => t.type === "page",
  );

  ws = new WebSocket(page.webSocketDebuggerUrl);
  ws.addEventListener("message", (m) => {
    const d = JSON.parse(m.data);

    waiting.get(d.id)?.(d);
  });
  await new Promise((r) => ws.addEventListener("open", r));

  await cmd("Emulation.setDeviceMetricsOverride", {
    width: 1200,
    height: 1600,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await cmd("Page.navigate", { url: `http://localhost:${PORT}/` });
  // The script menu fills once scripts/index.json and every script load.
  await until(() => js(`document.getElementById("script").options.length > 0`));

  const lines = fs
    .readFileSync(0, "utf8")
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter((x) => x && !x.startsWith("#"));

  for (const line of lines) {
    const [name, ...args] = line.split(/\s+/);

    if (!commands[name]) {
      throw Error(`unknown command: ${name}`);
    }

    console.log(`> ${line}`);
    await commands[name](...args);
  }
} catch (err) {
  console.error(`driver: ${err.message}`);
  process.exitCode = 1;
} finally {
  ws?.close();
  stop();
}
