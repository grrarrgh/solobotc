export const ROLES = {
  washerwoman:{name:"Washerwoman",team:"townsfolk",summary:"Starts knowing a Townsfolk among two seats."},
  librarian:{name:"Librarian",team:"townsfolk",summary:"Starts knowing an Outsider among two seats, or that none are in play."},
  investigator:{name:"Investigator",team:"townsfolk",summary:"Starts knowing a Minion among two seats."},
  chef:{name:"Chef",team:"townsfolk",summary:"Starts knowing the number of adjacent evil pairs."},
  empath:{name:"Empath",team:"townsfolk",summary:"Each night learns how many living neighbours register evil."},
  fortuneteller:{name:"Fortune Teller",team:"townsfolk",summary:"Each night checks two seats for Demon registration."},
  undertaker:{name:"Undertaker",team:"townsfolk",summary:"Learns the role of yesterday's execution victim."},
  monk:{name:"Monk",team:"townsfolk",summary:"Protects another player from the Demon each night after the first."},
  ravenkeeper:{name:"Ravenkeeper",team:"townsfolk",summary:"If killed by the Demon, learns one player's role."},
  virgin:{name:"Virgin",team:"townsfolk",summary:"Solo mode spares the human when this triggers."},
  slayer:{name:"Slayer",team:"townsfolk",summary:"Once per game chooses a possible Demon."},
  soldier:{name:"Soldier",team:"townsfolk",summary:"Safe from the Demon while functioning."},
  mayor:{name:"Mayor",team:"townsfolk",summary:"May redirect a kill; can win at final three without execution."},
  butler:{name:"Butler",team:"outsider",summary:"May vote only when their chosen master votes."},
  drunk:{name:"Drunk",team:"outsider",summary:"Believes they are an unused Townsfolk."},
  recluse:{name:"Recluse",team:"outsider",summary:"May register as evil, a Minion, or a Demon."},
  saint:{name:"Saint",team:"outsider",summary:"If executed, evil wins."},
  poisoner:{name:"Poisoner",team:"minion",summary:"Poisons one good NPC nightly."},
  spy:{name:"Spy",team:"minion",summary:"Sees the hidden layout and may register as good."},
  scarletwoman:{name:"Scarlet Woman",team:"minion",summary:"May succeed a dead Imp."},
  baron:{name:"Baron",team:"minion",summary:"Adds two Outsiders and removes two Townsfolk."},
  imp:{name:"Imp",team:"demon",summary:"Kills at night and may pass Demonhood by self-killing."}
};
export const SETUP_COUNTS={5:[3,0,1,1],6:[3,1,1,1],7:[5,0,1,1],8:[5,1,1,1],9:[5,2,1,1],10:[7,0,2,1],11:[7,1,2,1],12:[7,2,2,1],13:[9,0,3,1],14:[9,1,3,1],15:[9,2,3,1]};
export const GOOD_TEAMS=new Set(["townsfolk","outsider"]);
export const roleName=id=>ROLES[id]?.name??id??"Unknown";
export const alignmentOf=id=>GOOD_TEAMS.has(ROLES[id]?.team)?"good":"evil";
