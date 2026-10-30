// Each character's own mechanics, one module per character, so any
// characters can share a game whatever script they come from. They're
// filed by team (townsfolk/, outsider/, minion/, demon/, and fabled/ for
// the Storyteller's rules). Each module is mixed into Engine.prototype
// (see engine.js), which calls them in night order. (Characters that only
// need the Storyteller's information or NPC choices, in storyteller.js and
// strategy.js, have no module here.)
//
// A module may also export `info`: what that character learns, and what's
// said in its name (see characters/info.js).
import { alchemist } from "./townsfolk/alchemist.js";
import { amnesiac } from "./townsfolk/amnesiac.js";
import { artist } from "./townsfolk/artist.js";
import { bountyhunter } from "./townsfolk/bountyhunter.js";
import { cannibal } from "./townsfolk/cannibal.js";
import { chambermaid } from "./townsfolk/chambermaid.js";
import { courtier } from "./townsfolk/courtier.js";
import { engineer } from "./townsfolk/engineer.js";
import { exorcist } from "./townsfolk/exorcist.js";
import { farmer } from "./townsfolk/farmer.js";
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
import { poppygrower } from "./townsfolk/poppygrower.js";
import { atheist } from "./townsfolk/atheist.js";
import { professor } from "./townsfolk/professor.js";
import { ravenkeeper } from "./townsfolk/ravenkeeper.js";
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
import { golem } from "./outsider/golem.js";
import { heretic } from "./outsider/heretic.js";
import { klutz } from "./outsider/klutz.js";
import { lunatic } from "./outsider/lunatic.js";
import { moonchild } from "./outsider/moonchild.js";
import { ogre } from "./outsider/ogre.js";
import { puzzlemaster } from "./outsider/puzzlemaster.js";
import { politician } from "./outsider/politician.js";
import { sweetheart } from "./outsider/sweetheart.js";
import { tinker } from "./outsider/tinker.js";

import { assassin } from "./minion/assassin.js";
import { boomdandy } from "./minion/boomdandy.js";
import { cerenovus } from "./minion/cerenovus.js";
import { devilsadvocate } from "./minion/devilsadvocate.js";
import { eviltwin } from "./minion/eviltwin.js";
import { fearmonger } from "./minion/fearmonger.js";
import { goblin } from "./minion/goblin.js";
import { godfather } from "./minion/godfather.js";
import { marionette } from "./minion/marionette.js";
import { mezepheles } from "./minion/mezepheles.js";
import { mastermind } from "./minion/mastermind.js";
import { pithag } from "./minion/pithag.js";
import { poisoner } from "./minion/poisoner.js";
import { psychopath } from "./minion/psychopath.js";
import { widow } from "./minion/widow.js";
import { witch } from "./minion/witch.js";
import { wizard } from "./minion/wizard.js";

import { fanggu } from "./demon/fanggu.js";
import { legion } from "./demon/legion.js";
import { leviathan } from "./demon/leviathan.js";
import { lilmonsta } from "./demon/lilmonsta.js";
import { lleech } from "./demon/lleech.js";
import { nodashii } from "./demon/nodashii.js";
import { pukka } from "./demon/pukka.js";
import { shabaloth } from "./demon/shabaloth.js";
import { vigormortis } from "./demon/vigormortis.js";
import { vortox } from "./demon/vortox.js";
import { zombuul } from "./demon/zombuul.js";

import { spiritofivory } from "./fabled/spiritofivory.js";

export const characters = {
  alchemist,
  amnesiac,
  artist,
  bountyhunter,
  cannibal,
  chambermaid,
  courtier,
  engineer,
  exorcist,
  farmer,
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
  poppygrower,
  atheist,
  professor,
  ravenkeeper,
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
  golem,
  heretic,
  klutz,
  lunatic,
  moonchild,
  ogre,
  puzzlemaster,
  politician,
  sweetheart,
  tinker,
  assassin,
  boomdandy,
  cerenovus,
  devilsadvocate,
  eviltwin,
  fearmonger,
  goblin,
  godfather,
  marionette,
  mezepheles,
  mastermind,
  pithag,
  poisoner,
  psychopath,
  widow,
  witch,
  wizard,
  fanggu,
  legion,
  leviathan,
  lilmonsta,
  lleech,
  nodashii,
  pukka,
  shabaloth,
  vigormortis,
  vortox,
  zombuul,
  spiritofivory,
};
