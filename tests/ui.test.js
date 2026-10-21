import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { ROLES, ABILITIES } from "../src/data.js";

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");

const html = read("../index.html");
const app = read("../src/app.js");
const css = read("../styles.css");

test("feature controls are present", () => {
  assert.match(html, /id="random-seed"/);
  assert.match(html, /id="count-info"/);
  assert.match(html, /id="reset"/);
  assert.match(html, /id="artist-question"/);
  assert.match(html, /id="artist-ask"/);
  assert.match(html, /id="script-dialog"/);
  assert.match(html, /id="download-log"[^>]*download="log.txt"/);
});

test("role counts and log reversal are wired", () => {
  assert.match(app, /COUNTS/);
  assert.match(app, /reverse\(\)/);
  assert.match(app, /randomSeed/);
  assert.match(app, /resetGame/);
});

test("count colours are distinct", () => {
  assert.match(css, /\.good-count/);
  assert.match(css, /\.evil-count/);
});

test("post-game reveal renders engine-provided Key Moments", () => {
  assert.match(app, /r\.keyMoments/);
  assert.match(app, /Key moments/);
  assert.match(app, /debugLog\(\)/);
});

test("the clock tower opens a script sheet with every character's ability", () => {
  assert.match(app, /class="clocktower"/);
  assert.match(app, /showScript/);
  assert.match(app, /showModal\(\)/);
  assert.match(css, /\.clocktower/);

  for (const id of Object.keys(ROLES)) {
    assert.ok(ABILITIES[id], `missing ability text for ${id}`);
  }
});

test("character names become role popups that close when pressed", () => {
  assert.match(html, /id="role-dialog"/);
  assert.doesNotMatch(html, /id="script-close"/);
  assert.match(app, /linkRoles/);
  assert.match(app, /class="role-link"/);
  assert.match(app, /\$\(id\)\.close\(\)/);
  assert.match(css, /\.role-link/);
});

test("the Storyteller log has no list numbers", () => {
  assert.match(css, /#private\s*\{\s*list-style: none/);
});

test("night choices have a Select panel wired to the engine", () => {
  assert.match(html, /id="night-choice"/);
  assert.match(html, /id="night-select"[^>]*>Select</);
  assert.match(app, /e\.choose\(nightPicks\)/);
});

test("a Request nomination button is wired to the engine", () => {
  assert.match(html, /id="request-nomination"[^>]*>Request nomination</);
  assert.match(app, /e\.requestNomination\(selectedPlayerId\)/);
});

test("End day is always reachable, not hidden in the selected-player panel", () => {
  const actions = html.match(/<section id="actions"[\s\S]*?<\/section>/)[0];

  assert.match(html, /id="day-controls"[\s\S]*?id="pass"/);
  assert.doesNotMatch(actions, /id="pass"/);
  assert.match(app, /\$\("day-controls"\)\.hidden/);
});

test("Sects & Violets controls: Seamstress skip and Savant visit", () => {
  assert.match(html, /id="night-skip"[^>]*>Not tonight</);
  assert.match(html, /id="savant"[^>]*>Visit the Storyteller</);
  assert.match(app, /e\.choose\(\[\]\)/);
  assert.match(app, /e\.savant\(\)/);
});
