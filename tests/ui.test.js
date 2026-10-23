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
  assert.match(app, /class="role-link role-\$\{alignment\(/);
  assert.match(app, /\$\(id\)\.close\(\)/);
  assert.match(css, /\.role-link/);
});

test("the Storyteller log has no list numbers", () => {
  assert.match(css, /#private\s*\{\s*list-style: none/);
});

test("night choices have a Select panel wired to the engine", () => {
  assert.match(html, /id="night-choice"/);
  assert.match(html, /id="night-select"[^>]*>Select</);
  assert.match(app, /e\.choose\(\s*nightPicks/);
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

test("the final reveal shows a Grimoire and a filterable timeline", () => {
  assert.match(app, /<h3>Grimoire<\/h3>/);
  assert.match(app, /<h3>Timeline<\/h3>/);
  assert.match(app, /id="key-only"/);
  assert.match(css, /\.key-only \.event:not\(\.key\)/);
});

test("nominations animate clock hands, mark with a skull, and End day executes", () => {
  assert.match(app, /class="hand hour"/);
  assert.match(app, /class="hand minute"/);
  assert.match(app, /class="skull"/);
  assert.match(app, /runVote\(/);
  assert.match(css, /\.circle\.voting \.clock-hands/);
  assert.match(css, /\.circle\.voting \.clocktower/);
  assert.match(html, /id="block-status"/);
  assert.doesNotMatch(html, /id="request-nomination" hidden/);
});

test("game over: the status says Game Over!, and the logs collapse", () => {
  assert.match(app, /"Game Over!"/);
  assert.match(html, /id="public-panel"[^>]*open/);
  assert.match(html, /id="reveal-panel"/);
  assert.match(app, /\$\("public-panel"\)\.open = false/);
  assert.match(app, /\$\("reveal-panel"\)\.open = false/);
});

test("raised hands and the skull overlay the token, see-through", () => {
  assert.match(css, /\.vote-hand,\s*\.skull \{[^}]*transform: translate\(-50%, -50%\)[^}]*opacity: 0\.65/);
});

test("a menu by the title opens the town square size popup with − / + buttons", () => {
  assert.match(html, /<div class="menu">\s*<button\s+id="size-settings"[^>]*>\s*☰[\s\S]*?<\/div>\s*<\/div>\s*<h1>Solo Clocktower<\/h1>/);
  assert.match(html, /id="size-popup"[\s\S]*?id="size-down"[\s\S]*?id="size-value"[\s\S]*?id="size-up"/);
  assert.match(app, /setSquareSize\(squareSize \+ TOWN_SQUARE_SIZE_STEP\)/);
  assert.match(css, /var\(--scale, 1\)/);
});

test("seats are round, and the votes needed show under the clock tower", () => {
  assert.match(css, /\.seat \{[^}]*aspect-ratio: 1/);
  assert.match(app, /class="votes-needed">\$\{needed\} votes needed/);
  assert.match(app, /\$\{votes\} \/ \$\{result\.needed\} needed/);
  assert.match(css, /\.circle\.voting \.votes-needed/);
});

test("players have their own colours; characters are blue (good) or red (evil)", () => {
  assert.match(app, /PLAYER_COLOURS\[/);
  assert.match(app, /class="player-name" style="color:/);
  assert.match(app, /i % 2 \? roleLink\(ROLE_BY_NAME\.get\(part\)\) : colourPlayers\(part\)/);
  assert.match(css, /\.role-good,\s*\.token\.role-good,[^{]*\{\s*color: #64b5f6/);
  assert.match(css, /\.role-evil,\s*\.token\.role-evil,[^{]*\{\s*color: #ef6b72/);
});

test("Reset sits at the bottom of the Final reveal and collapses with it", () => {
  assert.match(
    html,
    /<details id="reveal-panel"[\s\S]*?id="reset"[\s\S]*?<\/details>/,
  );
});

test("Bad Moon Rising controls: Courtier characters, Professor's dead picks, Gossip statements", () => {
  assert.match(html, /id="night-character"/);
  assert.match(html, /id="gossip-controls"[\s\S]*?id="gossip-question"[\s\S]*?id="gossip-say"/);
  assert.match(app, /e\.gossip\(selectedPlayerId/);
  assert.match(app, /s\.pending\?\.characters \? \$\("night-character"\)\.value/);
  assert.match(app, /p\.alive === Boolean\(s\.pending\.dead\)/);
});

test("dead players can be nominated from the town square", () => {
  assert.match(app, /const blocked = !t \|\| e\.nominatedToday/);
});

test("there's no Claims section; your Good / Evil mark rings the seat", () => {
  assert.doesNotMatch(html, /id="claims"/);
  assert.doesNotMatch(app, /renderClaims/);
  assert.doesNotMatch(css, /\.claims\b/);
  assert.match(app, /mark \? `guess-\$\{mark\}` : ""/);
  assert.match(css, /\.seat\.guess-good/);
  assert.match(css, /\.seat\.guess-evil/);
  assert.match(app, /e\.mark\(selectedPlayerId, guess\)/);
});

test("all you can note about a player is a Good / Evil mark", () => {
  assert.match(html, /id="mark"[\s\S]*?data-guess="good"[\s\S]*?data-guess="evil"/);
  assert.doesNotMatch(html, /id="note-role"|id="note-text"|Your notes/);
  assert.doesNotMatch(app, /note-role|note-text|noteFor/);
});

test("a dead player's seat fades, but your Good / Evil mark around it doesn't", () => {
  // The fading is on the seat's border, background and contents, so the
  // outline (your mark) keeps its colour.
  assert.match(css, /\.seat\.dead > \* \{\s*opacity: 0\.4;\s*filter: grayscale\(1\);/);
  assert.doesNotMatch(css, /(^|\n)\.dead \{[^}]*(opacity|filter)/);
});

test("dawn / dusk cards close on any press; a fading ⚠ marks unprompted claims", () => {
  assert.match(html, /<dialog id="phase-dialog"/);
  assert.match(app, /"role-dialog", "phase-dialog"\]\)/);
  assert.match(app, /\$\(id\)\.onclick = \(\) => \$\(id\)\.close\(\)/);
  assert.match(app, /s\?\.phaseCards/);
  assert.match(app, /CLAIM_ALERT_HOLD_MS/);
  assert.match(app, /CLAIM_ALERT_FADE_MS/);
  assert.match(css, /@keyframes claim-alert-fade/);
});
