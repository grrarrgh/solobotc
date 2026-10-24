// Each character's own mechanics, one module per character, so any
// characters can share a game whatever script they come from. They're
// filed by team (townsfolk/, outsider/, minion/, demon/). Each module is
// mixed into Engine.prototype (see engine.js), which calls them in night
// order. (Characters that only need the Storyteller's information or NPC
// choices, in storyteller.js and strategy.js, have no module here.)

import { amnesiac } from "./townsfolk/amnesiac.js";
import { artist } from "./townsfolk/artist.js";
import { cannibal } from "./townsfolk/cannibal.js";
import { chambermaid } from "./townsfolk/chambermaid.js";
import { courtier } from "./townsfolk/courtier.js";
import { exorcist } from "./townsfolk/exorcist.js";
import { fisherman } from "./townsfolk/fisherman.js";
import { fool } from "./townsfolk/fool.js";
import { gambler } from "./townsfolk/gambler.js";
import { gossip } from "./townsfolk/gossip.js";
import { grandmother } from "./townsfolk/grandmother.js";
import { huntsman } from "./townsfolk/huntsman.js";
import { innkeeper } from "./townsfolk/innkeeper.js";
import { juggler } from "./townsfolk/juggler.js";
import { minstrel } from "./townsfolk/minstrel.js";
import { monk } from "./townsfolk/monk.js";
import { pacifist } from "./townsfolk/pacifist.js";
import { philosopher } from "./townsfolk/philosopher.js";
import { pixie } from "./townsfolk/pixie.js";
import { professor } from "./townsfolk/professor.js";
import { puzzlemaster } from "./townsfolk/puzzlemaster.js";
import { sage } from "./townsfolk/sage.js";
import { sailor } from "./townsfolk/sailor.js";
import { savant } from "./townsfolk/savant.js";
import { seamstress } from "./townsfolk/seamstress.js";
import { slayer } from "./townsfolk/slayer.js";
import { snakecharmer } from "./townsfolk/snakecharmer.js";
import { virgin } from "./townsfolk/virgin.js";

import { barber } from "./outsider/barber.js";
import { butler } from "./outsider/butler.js";
import { damsel } from "./outsider/damsel.js";
import { klutz } from "./outsider/klutz.js";
import { lunatic } from "./outsider/lunatic.js";
import { moonchild } from "./outsider/moonchild.js";
import { ogre } from "./outsider/ogre.js";
import { sweetheart } from "./outsider/sweetheart.js";
import { tinker } from "./outsider/tinker.js";

import { assassin } from "./minion/assassin.js";
import { boomdandy } from "./minion/boomdandy.js";
import { cerenovus } from "./minion/cerenovus.js";
import { devilsadvocate } from "./minion/devilsadvocate.js";
import { eviltwin } from "./minion/eviltwin.js";
import { godfather } from "./minion/godfather.js";
import { marionette } from "./minion/marionette.js";
import { mastermind } from "./minion/mastermind.js";
import { pithag } from "./minion/pithag.js";
import { poisoner } from "./minion/poisoner.js";
import { widow } from "./minion/widow.js";
import { witch } from "./minion/witch.js";

import { fanggu } from "./demon/fanggu.js";
import { nodashii } from "./demon/nodashii.js";
import { pukka } from "./demon/pukka.js";
import { shabaloth } from "./demon/shabaloth.js";
import { vigormortis } from "./demon/vigormortis.js";
import { vortox } from "./demon/vortox.js";
import { zombuul } from "./demon/zombuul.js";

export const characters = {
  amnesiac,
  artist,
  cannibal,
  chambermaid,
  courtier,
  exorcist,
  fisherman,
  fool,
  gambler,
  gossip,
  grandmother,
  huntsman,
  innkeeper,
  juggler,
  minstrel,
  monk,
  pacifist,
  philosopher,
  pixie,
  professor,
  puzzlemaster,
  sage,
  sailor,
  savant,
  seamstress,
  slayer,
  snakecharmer,
  virgin,
  barber,
  butler,
  damsel,
  klutz,
  lunatic,
  moonchild,
  ogre,
  sweetheart,
  tinker,
  assassin,
  boomdandy,
  cerenovus,
  devilsadvocate,
  eviltwin,
  godfather,
  marionette,
  mastermind,
  pithag,
  poisoner,
  widow,
  witch,
  fanggu,
  nodashii,
  pukka,
  shabaloth,
  vigormortis,
  vortox,
  zombuul,
};
