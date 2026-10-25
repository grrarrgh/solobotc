// Each character's `info`, from their own module: the information they
// learn each night (`truth`, and for a drunk or poisoned one `lie` or
// `random`; see storyteller.js infoMode()), and what's said in their name by
// someone without their ability (see bluff.js): `choice`, a made-up night
// choice; `bluff`, an evil player's own bluff, when it isn't just `lie`;
// `once`, an evil player's once-per-game night choice.
//
// (Kept apart from characters/index.js, and built on first use: the
// character modules and storyteller.js import each other, so nothing here
// may be read while they load.)
import { info as amnesiac } from "./townsfolk/amnesiac.js";
import { info as balloonist } from "./townsfolk/balloonist.js";
import { info as chambermaid } from "./townsfolk/chambermaid.js";
import { info as chef } from "./townsfolk/chef.js";
import { info as clockmaker } from "./townsfolk/clockmaker.js";
import { info as courtier } from "./townsfolk/courtier.js";
import { info as dreamer } from "./townsfolk/dreamer.js";
import { info as empath } from "./townsfolk/empath.js";
import { info as exorcist } from "./townsfolk/exorcist.js";
import { info as flowergirl } from "./townsfolk/flowergirl.js";
import { info as fortuneteller } from "./townsfolk/fortuneteller.js";
import { info as gambler } from "./townsfolk/gambler.js";
import { info as grandmother } from "./townsfolk/grandmother.js";
import { info as highpriestess } from "./townsfolk/highpriestess.js";
import { info as innkeeper } from "./townsfolk/innkeeper.js";
import { info as investigator } from "./townsfolk/investigator.js";
import { info as librarian } from "./townsfolk/librarian.js";
import { info as mathematician } from "./townsfolk/mathematician.js";
import { info as monk } from "./townsfolk/monk.js";
import { info as noble } from "./townsfolk/noble.js";
import { info as oracle } from "./townsfolk/oracle.js";
import { info as pixie } from "./townsfolk/pixie.js";
import { info as sailor } from "./townsfolk/sailor.js";
import { info as seamstress } from "./townsfolk/seamstress.js";
import { info as snakecharmer } from "./townsfolk/snakecharmer.js";
import { info as towncrier } from "./townsfolk/towncrier.js";
import { info as undertaker } from "./townsfolk/undertaker.js";
import { info as villageidiot } from "./townsfolk/villageidiot.js";
import { info as washerwoman } from "./townsfolk/washerwoman.js";

import { info as butler } from "./outsider/butler.js";

let INFO;

// `role`'s info, or null if it has none.
export const infoOf = (role) =>
  (INFO ??= {
    amnesiac,
    balloonist,
    butler,
    chambermaid,
    chef,
    clockmaker,
    courtier,
    dreamer,
    empath,
    exorcist,
    flowergirl,
    fortuneteller,
    gambler,
    grandmother,
    highpriestess,
    innkeeper,
    investigator,
    librarian,
    mathematician,
    monk,
    noble,
    oracle,
    pixie,
    sailor,
    seamstress,
    snakecharmer,
    towncrier,
    undertaker,
    villageidiot,
    washerwoman,
  })[role] ?? null;
