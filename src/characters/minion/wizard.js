import {
  name,
  alignment,
  WIZARD_WISH_CHANCE,
  WIZARD_GIFTS,
  WIZARD_SECOND_MIN_ALIVE,
} from "../../data.js";
import { isDemon, works, minionAbility, minionLabel } from "../../storyteller.js";
import { pick, sample } from "../../util.js";

// The wishes a Wizard can make (kept simple): what they say, and whether it
// names a player. The Storyteller grants a wish, or declines it (then the
// Wizard may wish again):
// - "death": the chosen player dies tonight. Never the Demon (declined: it
//   would win the game outright). Clue: at dawn, the town learns a wish
//   killed them.
// - "demon": learn who the Demon is. Only for a good Wizard (an Alchemist
//   with the ability): the evil team knows already. Price: the Demon learns
//   who wished, and goes after them. Clue: the town hears a wish was
//   granted today.
// - "grimoire": see the Grimoire, as a Widow does. Only for an evil one
//   (declined for a good one: it would win the game outright). Clue: the
//   town hears a wish was granted today.
// - "whispers": the town hears the 3 characters the Demon was told are not
//   in play (its bluffs). Only for a good Wizard: the evil team knows them
//   already. Price: the Demon learns 3 new ones. Clue: any evil player
//   claiming one of the old 3 is exposed (see strategy evidence()).
// - "second": after today's execution, nominations open again once, for a
//   second execution (see secondRound()). Only with WIZARD_SECOND_MIN_ALIVE
//   or more alive, and not on the Mastermind's extra day. Price: the Wizard
//   can't nominate or vote in the second round. Clue: the town is told why.
// - "gift": the Demon gains the ability of a Townsfolk not in play (one of
//   WIZARD_GIFTS: the Fool or the Virgin), as well as its own. Only for an
//   evil Wizard, and only on Day 1: a protection worth having from the
//   start. Price: the Wizard dies tonight. Clue: at dawn, the town learns a
//   wish cost the Wizard their life (not what it was).
export const WIZARD_WISHES = {
  death: { text: "I wish that a player I choose dies tonight.", target: true },
  demon: { text: "I wish to know who the Demon is.", target: false },
  grimoire: { text: "I wish to see the Grimoire.", target: false },
  whispers: { text: "I wish to hear the Demon's whispers.", target: false },
  second: { text: "I wish for a second execution today.", target: false },
  gift: { text: "I wish that the Demon has the ability of a Townsfolk not in play.", target: false },
};

// The gift wish's choices now: WIZARD_GIFTS not in play (dealt or shown).
export function wishGifts(s) {
  const inPlay = new Set(s.players.flatMap((x) => [x.role, x.shown]));

  return WIZARD_GIFTS.filter((id) => !inPlay.has(id));
}

// Why the Storyteller declines Wizard p's wish (`kind`, naming t), or null to
// grant it.
function declined(s, p, kind, t) {
  const evil = p.alignment === "evil";
  const tooMuch = "That wish is too much: it isn't granted. You may wish again.";
  const known = "You know that already: it isn't granted. You may wish again.";
  const alive = s.players.filter((x) => x.alive).length;

  return {
    death: t && isDemon(t) ? tooMuch : null,
    demon: evil ? known : null,
    grimoire: evil ? null : tooMuch,
    whispers: evil
      ? known
      : !s.demonBluffs?.length || s.exposedBluffs
        ? "There's nothing to hear: it isn't granted. You may wish again."
        : null,
    second:
      alive < WIZARD_SECOND_MIN_ALIVE || s.mastermindDay === s.day || s.secondRound?.day === s.day
        ? "Not today: it isn't granted. You may wish again."
        : null,
    gift: !evil
      ? tooMuch
      : s.day > 1
        ? "It's too late for that wish: it isn't granted. You may wish again."
        : !wishGifts(s).length || !s.players.some((x) => x.alive && isDemon(x))
          ? "That can't be done: it isn't granted. You may wish again."
          : null,
  }[kind];
}

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
    const no = declined(s, p, kind, t);
    const wished = `${WIZARD_WISHES[kind].text.replace("a player I choose", t?.label ?? "a player")}`;

    if (no) {
      this.audit(
        "wizard",
        `${p.label} (${minionLabel(p)}) wished: "${wished}" Not granted (${no.split(":")[0]}).`,
        {
          playerId: p.id,
          kind,
          granted: false,
        },
      );
      this.tellWizard(p, no);
      return no;
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

    // (After the wish is on record: these log what they do.) The wishes
    // with no clue of their own, to see the Grimoire or learn the Demon,
    // still have the Storyteller tell the town a wish was granted, but not
    // what it was (or that it did nothing, for a drunk or poisoned Wizard).
    if (kind === "grimoire" || kind === "demon") {
      this.wishTell(`Day ${s.day} — The Storyteller: a wish was granted today.`);
    }

    if (effective && kind === "whispers") {
      said = this.exposeBluffs(p);
    } else if (effective && kind === "second") {
      s.secondRound = { day: s.day, wizardId: p.id, open: false };
      this.wishTell(
        `Day ${s.day} — The Storyteller: a wish was granted: there will be a second execution today.`,
      );
      this.audit(
        "wizard",
        `After today's execution, nominations open again. Price: ${p.label} can't nominate or vote in the second round.`,
        { playerId: p.id },
      );
      said =
        "Your wish is granted: there will be a second execution today. (You can't nominate or vote in it.)";
    } else if (effective && kind === "gift") {
      said = this.giveGift(p);
    }

    this.tellWizard(p, said);

    return said;
  },

  // The whispers wish: the town hears the Demon's bluffs, and the Demon
  // (and every teammate who knew them) learns as many new characters not in
  // play: never one dealt, shown or claimed, nor an old one.
  exposeBluffs(p) {
    const s = this.s;
    const old = s.demonBluffs;
    const used = new Set(s.players.flatMap((x) => [x.role, x.shown, x.claim]));
    const fresh = sample(
      s.script.ids.filter(
        (x) =>
          alignment(x) === "good" &&
          !["drunk", "lunatic", "poppygrower", "heretic"].includes(x) &&
          !used.has(x) &&
          !old.includes(x),
      ),
      old.length,
      s.r,
    );
    const claimers = s.players.filter(
      (x) => x.alive && x.alignment === "evil" && old.includes(x.claim),
    );

    s.exposedBluffs = old;
    s.demonBluffs = fresh;

    for (const x of s.players.filter((x) => x.alignment === "evil" && x.bluffs?.length)) {
      x.bluffs = fresh;
    }

    this.wishTell(
      `Day ${s.day} — The Storyteller: a wish was granted. The Demon was told these characters are not in play: ${old
        .map(name)
        .join(", ")}.`,
    );
    this.audit(
      "wizard",
      `The town hears the Demon's bluffs (${old.map(name).join(", ")}). Price: the Demon learns new ones: ${
        fresh.map(name).join(", ") || "none left"
      }. Clue: ${
        claimers.length
          ? `exposed: ${claimers
              .map((x) => `${x.label} (${name(x.role)}) claims the ${name(x.claim)}`)
              .join("; ")}`
          : "no evil player claims one of them"
      }.`,
      { playerId: p.id, exposed: old, bluffs: fresh, claimerIds: claimers.map((x) => x.id) },
    );

    return "Your wish is granted: the town hears the Demon's whispers. (The Demon learns new ones.)";
  },

  // The gift wish: the living Demon gains a WIZARD_GIFTS ability not in
  // play: the one it claims, if it's one, else one on the script, else any.
  // Its price: Wizard p dies tonight (see wizardNight()).
  giveGift(p) {
    const s = this.s;
    const d = s.players.find((x) => x.alive && isDemon(x));
    const gifts = wishGifts(s);
    const gift = gifts.includes(d.claim)
      ? d.claim
      : (pick(
          gifts.filter((x) => s.script.ids.includes(x)),
          s.r,
        ) ?? pick(gifts, s.r));

    d.wishGift = gift;
    s.wishPrice = { byId: p.id, night: s.night + 1 };

    this.audit(
      "wizard",
      `${d.label} (${name(d.role)}) gains the ${name(gift)} ability. Price: ${p.label} dies tonight. Clue: at dawn, the town learns a wish cost the Wizard their life.`,
      { playerId: d.id, role: gift, wizardId: p.id },
    );

    return "Your wish is granted. (You'll pay for it tonight.)";
  },

  // A second-execution wish, once today's execution is done (see engine
  // dayEnds()): nominations open again, everyone (but the Wizard) can
  // nominate and be nominated again, and nobody is marked. True if it
  // opened.
  secondRound(from) {
    const s = this.s;
    const r = s.secondRound;

    if (!r || r.day !== s.day || r.open || s.winner || s.mastermindDay === s.day) {
      return false;
    }

    r.open = true;
    s.nominated = [];
    s.dayNominators = [];
    s.npcNominations = 0;
    s.block = null;
    s.lastVote = null;
    s.nominationsOpen = true;

    this.announce(
      `Day ${s.day} — The Storyteller: by a wish, nominations open again for a second execution.`,
    );
    this.phaseCard("nominations", from);
    this.audit(
      "nominations",
      `Second round of nominations (a wish); ${this.player(r.wizardId).label} can't nominate or vote in it.`,
    );
    this.countNpcNominations();

    return true;
  },

  // What the Storyteller tells Wizard p, in private (in your log, if it's
  // you).
  tellWizard(p, text) {
    if (p.human) {
      this.s.privateLog.push(`Day ${this.s.day} — Storyteller: "${text}"`);
    }
  },

  // At night, a granted death wish: its player dies; and the gift wish's
  // price: its Wizard dies.
  wizardNight() {
    const s = this.s;
    const price = s.wishPrice;

    if (price?.night === s.night) {
      s.wishPrice = null;

      const wizard = this.player(price.byId);
      const paid = wizard.alive && this.kill(wizard, "wizard");

      this.audit(
        "wizard",
        `${wizard.label} ${paid ? "died" : "didn't die"} paying for their wish.`,
        { targetId: wizard.id, died: Boolean(paid) },
      );

      if (paid) {
        s.wishClue = {
          night: s.night,
          text: `The Storyteller: a wish was granted, and ${wizard.label} paid for it with their life.`,
        };
        this.check();
      }
    }

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
      this.wishTell(`Day ${s.day} — ${s.wishClue.text}`);
      s.wishClue = null;
    }
  },

  // The Storyteller tells the town something of a wish (`line`, for the
  // Public Log): everyone hears it, so it goes in log.txt as seen (the
  // "wish" entries: see log.js PUBLIC).
  wishTell(line) {
    this.announce(line);
    this.audit("wish", line.replace(/^Day \d+ — /, ""));
  },
};

// (For the wish menu: each wish's name.)
export const wishName = (kind) =>
  ({
    death: "A death",
    demon: "Who the Demon is",
    grimoire: "The Grimoire",
    whispers: "The Demon's whispers",
    second: "A second execution",
    gift: "A gift for the Demon",
  })[kind] ?? name(kind);
