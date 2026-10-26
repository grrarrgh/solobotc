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
  assert.match(app, /e\.requestNomination\(id, null\)/);
});

test("a vote waits for you to lower your hand before counting", () => {
  assert.match(app, /e\.nominate\(id, null\)/);
  assert.match(app, /\$\("start-nominations"\)\.onclick/);
  assert.match(app, /handChoice\(c\)/);
  assert.match(app, /e\.castVotes\(hand\)/);
  assert.match(app, /HAND_WAIT_MS/);
  assert.match(app, /BOOM_WAIT_MS/);
  assert.match(html, /id="round-robin"/);
  assert.match(app, /ROUND_ROBIN_ALIVE/);
  assert.match(html, /id="boom-left"/);
  assert.match(css, /\.hand-toggle/);
});

test("nominations open after your conversations, with a confirm if you start early", () => {
  assert.match(html, /id="confirm-dialog"/);
  assert.match(html, /id="confirm-yes"[^>]*>Start nominations</);
  assert.match(html, /id="confirm-no"[^>]*>Keep talking</);
  assert.match(html, /id="start-nominations"[^>]*>Start Nominations</);
  assert.doesNotMatch(app, /setTimeout\([^)]*openNominations/);
  assert.match(app, /e\.openNominations\(\)/);
  assert.match(app, /e\.npcNomination\(\)/);
  assert.match(html, /id="npc-nominations"[^>]*>NPC nominations 0</);
  assert.match(app, /`NPC nominations \$\{s\.npcWanting \?\? 0\}`/);
  assert.match(app, /Nominations are open/);
});

test("a conversation ends with Share My Info and Leave conversation", () => {
  assert.match(html, /id="share-info"[^>]*>Share My Info</);
  assert.match(html, /id="leave-conversation"[^>]*>Leave conversation</);
  assert.match(app, /e\.tell\(talkingTo, e\.human\(\)\.claim, true\)/);
  // Nominations get their own row, below End day.
  assert.match(
    html,
    /id="pass"[\s\S]*id="nomination-controls"[\s\S]*id="nominate"[\s\S]*id="request-nomination"[\s\S]*id="savant"/,
  );
});

test("the reveal lists who lied to you", () => {
  assert.match(html, /id="lies"/);
  assert.match(app, /Who lied to you/);
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
  // Nominate and Request nomination only once nominations have started.
  assert.match(html, /id="nomination-controls" class="nomination-controls" hidden/);
  // ...then always shown, below End day (outside the selected-player panel):
  // Nominate and Request nomination wait for a selection.
  const actions = html.match(/<section id="actions"[\s\S]*?<\/section>/)[0];

  assert.doesNotMatch(actions, /id="nomination-controls"/);
  assert.match(app, /const blocked = !t \|\|/);
  assert.match(css, /\.nomination-controls\[hidden\]/);
});

test("game over: the status says Game Over!, and the logs collapse", () => {
  assert.match(app, /"Game Over!"/);
  assert.match(html, /id="public-panel"[^>]*open/);
  assert.match(html, /id="reveal-panel"/);
  assert.match(app, /\$\("public-panel"\)\.open = false/);
  assert.match(html, /id="private-panel"[^>]*open/);
  assert.match(app, /\$\("private-panel"\)\.open = false/);
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

test("the menu has a link, with a bug icon, to report a bug on GitHub in a new tab", () => {
  assert.match(html, /id="size-popup"[\s\S]*?<a\s+id="report-bug"[^>]*href="https:\/\/github\.com\/grrarrgh\/solobotc\/issues\/new"[^>]*target="_blank"[^>]*rel="noopener"[^>]*>\s*<span aria-hidden="true">🐛<\/span> Report a bug<\/a/);
  assert.match(css, /\.menu-link \{/);
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
  assert.match(app, /!canPick\(s\.pending, p\)/);
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
  assert.match(css, /\.seat\.dead > \* \{\s*opacity: 0\.8;\s*filter: grayscale\(1\);/);
  assert.doesNotMatch(css, /(^|\n)\.dead \{[^}]*(opacity|filter)/);
});

test("a dead player's seat has the death shroud hanging over it", () => {
  assert.match(css, /\.seat\.dead::before \{[^}]*url\("images\/death-shroud\.png"\)/);
  assert.ok(fs.existsSync(new URL("../images/death-shroud.png", import.meta.url)));
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

test("the script popup has a Night order button that stays in its top corner", () => {
  assert.match(html, /<dialog id="script-dialog"[^>]*>\s*(<!--[\s\S]*?-->\s*)?<button type="button" id="night-order"/);
  assert.match(css, /\.night-order-toggle \{[^}]*position: sticky;[^}]*top: 0;/);
  // (Pressing it switches views; it doesn't close the popup.)
  assert.match(app, /\$\("night-order"\)\.onclick = \(ev\) => \{\s*\/\/[^\n]*\n\s*ev\.stopPropagation\(\);/);
});

test("every popup closes when you press anywhere", () => {
  // The dialogs (the script, a role, dawn / dusk cards).
  assert.match(app, /for \(const id of \["script-dialog", "role-dialog", "phase-dialog"\]\) \{\s*\$\(id\)\.onclick = \(\) => \$\(id\)\.close\(\);/);
  // The confirm popup: anywhere but its buttons is Keep talking.
  assert.match(app, /d\.onclick = \(ev\) => \{\s*if \(!ev\.target\.closest\("button"\)\) \{\s*d\.close\(\);\s*done\(false\);/);
  // The menu (but its − and +) and the role counts.
  assert.match(app, /!ev\.target\.closest\("#size-popup button, #size-settings"\)/);
  assert.match(app, /if \(!\$\("count-popup"\)\.hidden && !ev\.target\.closest\("#count-info"\)\) \{\s*closeCountInfo\(\);/);
});

test("roshambo against the Psychopath you nominated: rock, paper or scissors, in place of the day's controls", () => {
  assert.match(html, /id="roshambo-choice" class="night-choice" hidden/);

  for (const t of ["rock", "paper", "scissors"]) {
    assert.match(html, new RegExp(`data-throw="${t}"`));
  }

  assert.match(app, /\$\("roshambo-choice"\)\.hidden = !s\.roshambo/);
  assert.match(app, /e\.roshambo\(b\.dataset\.throw\)/);
  assert.match(app, /!!s\.roshambo \|\| s\.phase !== "day"/);
});

test("an Alchemist's Minion ability: a Psychopath kill, a wish, a Goblin self-nomination", () => {
  assert.match(html, /id="psychopath-kill" type="button" hidden/);
  assert.match(html, /id="wish-controls" hidden/);
  assert.match(html, /id="wish-kind"/);
  assert.match(html, /id="wish-make"/);
  assert.match(html, /id="goblin-self" type="button" hidden/);
  assert.match(app, /e\.psychopathKill\(selectedPlayerId\)/);
  assert.match(app, /e\.wish\(\$\("wish-kind"\)\.value, selectedPlayerId\)/);
  assert.match(app, /e\.goblinSelfNomination\(null\)/);
  assert.match(app, /minionAbility\(h\) === "psychopath"/);
  assert.match(app, /minionAbility\(h\) === "wizard"/);
  assert.match(app, /minionAbility\(h\) === "goblin"/);
});

test("a Goblin claim gets a popup card of its own, in red", () => {
  assert.match(app, /goblin: "👺 Goblin claim"/);
  assert.match(css, /\.phase-goblin \{\s*border-color: #ef6b72;/);
});

test("the setup page is a card of its own, with an i by the script that opens its sheet", () => {
  assert.match(html, /<section id="setup" class="setup-page">/);
  assert.match(html, /id="script-info"[\s\S]*?class="info-button"/);
  assert.match(app, /showScript\(false, parseScript\(scripts\[\+\$\("script"\)\.value\]\.raw\)\)/);
  assert.match(css, /\.setup-page \{/);
});

test("the setup page starts on Trouble Brewing, with the seed under a collapsed Advanced Options", () => {
  assert.match(app, /scripts\.findIndex\(\(x\) => x\.file === "trouble-brewing\.json"\)/);
  assert.match(html, /<details id="advanced-options" class="advanced-options">\s*<summary>Advanced Options<\/summary>[\s\S]*?id="seed"[\s\S]*?id="random-seed"[\s\S]*?<\/details>/);
  assert.doesNotMatch(html, /<details id="advanced-options"[^>]*\bopen\b/);
});

test("under the setup card: How to play (collapsed), About, hidden with it; a footer on every page", () => {
  assert.match(html, /<section id="setup" class="setup-page">[\s\S]*?<\/section>\s*(<!--[\s\S]*?-->\s*)?<div id="setup-info" class="setup-info">/);
  assert.match(html, /<details id="how-to-play" class="panel">\s*<summary><h2>How to play<\/h2><\/summary>/);
  assert.match(html, /<b>Ask<\/b>[\s\S]*?<b>Start Nominations<\/b>[\s\S]*?<b>Raise hand<\/b>/);
  assert.match(html, /<section class="about">[\s\S]*?fan-made[\s\S]*?not for commercial use/);
  assert.match(html, /<\/main>\s*<footer class="site-footer">\s*This project is not affiliated with The Pandemonium Institute\. All roles,\s+content are the property of Steven Medway and The Pandemonium Institute\./);
  assert.match(app, /\$\("setup"\)\.hidden = true;\s*\$\("setup-info"\)\.hidden = true;/);
  assert.match(app, /\$\("setup"\)\.hidden = false;\s*\$\("setup-info"\)\.hidden = false;/);
});

test("the script sheet lists each team's characters alphabetically, with any note on how the game simplifies them", () => {
  assert.match(app, /\.sort\(\(x, y\) => name\(x\)\.localeCompare\(name\(y\)\)\)/);
  assert.match(app, /NOTES\[id\] \? `<span class="ability-note">/);
  assert.match(css, /\.ability-note \{/);
});

test("the Final reveal's NPC talks are collapsed until opened, and Open all leaves them be", () => {
  assert.match(app, /<details class="npc-talks"><summary>Who talked to whom<\/summary>/);
  assert.match(app, /querySelectorAll\("details\.tl-section"\)/);
});

test("ready for GitHub Pages at www.solobotc.com: the domain, icons, manifest and link preview", () => {
  const exists = (path) => fs.existsSync(new URL(`../${path}`, import.meta.url));
  const manifest = JSON.parse(read("../site.webmanifest"));

  assert.equal(read("../CNAME").trim(), "www.solobotc.com");
  assert.ok(exists(".nojekyll"));
  assert.match(html, /<link rel="canonical" href="https:\/\/www\.solobotc\.com\/" \/>/);
  assert.match(html, /<meta property="og:image" content="https:\/\/www\.solobotc\.com\/images\/social\.png" \/>/);

  // Every icon, image and manifest the page names is there.
  for (const [, path] of html.matchAll(/(?:href|content)="(?:https:\/\/www\.solobotc\.com\/)?((?:images\/|favicon|site\.)[^"]+)"/g)) {
    assert.ok(exists(path), path);
  }

  for (const icon of manifest.icons) {
    assert.ok(exists(icon.src), icon.src);
  }

  assert.ok(manifest.icons.some((x) => x.purpose === "maskable"));
});
