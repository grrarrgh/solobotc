import { name, WIZARD_WISH_CHANCE } from "../../data.js";
import { isDemon, works, minionAbility, minionLabel } from "../../storyteller.js";

// The wishes a Wizard can make (kept simple): what they say, and whether it
// names a player. The Storyteller grants a wish, or declines it (then the
// Wizard may wish again):
// - "death": the chosen player dies tonight. Never the Demon (declined: it
//   would win the game outright). Clue: at dawn, the town learns a wish
//   killed them.
// - "demon": learn who the Demon is. Only for a good Wizard (an Alchemist
//   with the ability): the evil team knows already. Price: the Demon learns
//   who wished, and goes after them.
// - "grimoire": see the Grimoire, as a Widow does. Only for an evil one
//   (declined for a good one: it would win the game outright).
export const WIZARD_WISHES = {
  death: { text: "I wish that a player I choose dies tonight.", target: true },
  demon: { text: "I wish to know who the Demon is.", target: false },
  grimoire: { text: "I wish to see the Grimoire.", target: false },
};

// The Wizard, mixed into Engine.prototype (see characters/index.js),
// so `this` is the Engine.
export const wizard = {
  // At dawn, an NPC Wizard (or Alchemist-Wizard) who hasn't yet may make
  // their wish, at WIZARD_WISH_CHANCE a day: an evil one from Day 1, a good
  // one from Day 2 (see strategy wish()).
  npcWishes() {
    const s = this.s;

    for (const p of s.players.filter(
      (x) => !x.human && x.alive && minionAbility(x) === "wizard" && !x.wished,
    )) {
      if (s.winner || s.day < (p.alignment === "good" ? 2 : 1) || s.r() >= WIZARD_WISH_CHANCE) {
        continue;
      }

      const w = this.strat.wish(s, p);

      if (w) {
        this.wishFor(p, w.kind, w.target ?? null);
      }
    }
  },

  // You, an Alchemist with the Wizard's ability, make your wish (`kind`: see
  // WIZARD_WISHES), naming living player `id` if it needs one. Returns what
  // the Storyteller says.
  wish(kind, id = null) {
    const s = this.s;
    const h = this.human();

    if (minionAbility(h) !== "wizard" || !h.alive || s.phase !== "day" || s.winner || h.wished) {
      throw Error("Wizard unavailable.");
    }

    if (!WIZARD_WISHES[kind]) {
      throw Error("Choose a wish.");
    }

    const t = id ? this.player(id) : null;

    if (WIZARD_WISHES[kind].target && (!t?.alive || t.human)) {
      throw Error("Select a living player for this wish.");
    }

    return this.wishFor(h, kind, t);
  },

  // Wizard p wishes (`kind`, naming t): granted or declined (see
  // WIZARD_WISHES). Returns what the Storyteller tells them.
  wishFor(p, kind, t = null) {
    const s = this.s;
    const evil = p.alignment === "evil";
    const declined =
      kind === "death"
        ? isDemon(t)
          ? "That wish is too much: it isn't granted. You may wish again."
          : null
        : kind === "demon" && evil
          ? "You know that already: it isn't granted. You may wish again."
          : kind === "grimoire" && !evil
            ? "That wish is too much: it isn't granted. You may wish again."
            : null;
    const wished = `${WIZARD_WISHES[kind].text.replace("a player I choose", t?.label ?? "a player")}`;

    if (declined) {
      this.audit("wizard", `${p.label} (${minionLabel(p)}) wished: "${wished}" Not granted.`, {
        playerId: p.id,
        kind,
        granted: false,
      });
      this.tellWizard(p, declined);
      return declined;
    }

    p.wished = s.day;

    const effective = works(p);
    let said = "Your wish is granted.";

    if (effective && kind === "death") {
      s.wishDeath = { byId: p.id, targetId: t.id, night: s.night + 1 };
      said = `Your wish is granted: ${t.label} dies tonight.`;
    } else if (effective && kind === "demon") {
      const d = s.players.find((x) => x.alive && isDemon(x));

      if (d) {
        // (What they learn goes in their information: see remember().)
        said = "Your wish is granted. (The Demon learns that you wished.)";
        d.wisherId = p.id;
        p.certainSuspect = d.id;
        this.remember(p, {
          night: s.night,
          day: s.day,
          role: "wizard",
          text: `Wizard: the Demon is ${d.label}.`,
          targets: [d.id],
          trigger: "normal",
          functioning: true,
        });
      }
    } else if (effective && kind === "grimoire") {
      s.wizardGrimoire = Object.fromEntries(s.players.map((x) => [x.id, x.role]));
      said = "Your wish is granted: you see the Grimoire.";
    }

    this.audit(
      "wizard",
      `${p.label} (${minionLabel(p)}) wished: "${wished}" Granted${
        effective ? "" : ", but they're drunk or poisoned: nothing happens"
      }.${effective && kind === "demon" ? " Price: the Demon learns who wished." : ""}${
        effective && kind === "death" ? ` Clue: at dawn, the town learns a wish killed ${t.label}.` : ""
      }`,
      { playerId: p.id, kind, targetId: t?.id ?? null, granted: true, effective },
    );
    this.tellWizard(p, said);

    return said;
  },

  // What the Storyteller tells Wizard p, in private (in your log, if it's
  // you).
  tellWizard(p, text) {
    if (p.human) {
      this.s.privateLog.push(`Day ${this.s.day} — Storyteller: "${text}"`);
    }
  },

  // At night, a granted death wish: its player dies.
  wizardNight() {
    const s = this.s;
    const w = s.wishDeath;

    if (!w || w.night !== s.night) {
      return;
    }

    s.wishDeath = null;

    const t = this.player(w.targetId);
    const before = this.alive().length;
    const died = t?.alive && this.kill(t, "wizard");

    this.audit("wizard", `${t.label} ${died ? "died" : "didn't die"} of ${this.player(w.byId).label}'s wish.`, {
      targetId: t.id,
      died: Boolean(died),
    });

    if (died) {
      s.wishClue = { night: s.night, text: `The Storyteller: a wish was granted, and ${t.label} died of it.` };

      if (isDemon(t)) {
        this.successor(t, before, false);
      } else {
        this.check();
      }
    }
  },

  // At dawn: the clue to last night's wish.
  wizardDawn() {
    const s = this.s;

    if (s.wishClue?.night === s.night) {
      this.announce(`Day ${s.day} — ${s.wishClue.text}`);
      s.wishClue = null;
    }
  },
};

// (For the wish menu: each wish's name.)
export const wishName = (kind) => ({ death: "A death", demon: "Who the Demon is", grimoire: "The Grimoire" })[kind] ?? name(kind);
