export const ROLES = {
 washerwoman:{name:'Washerwoman',team:'townsfolk',summary:'Starts with one Townsfolk role and two candidate seats.'},
 librarian:{name:'Librarian',team:'townsfolk',summary:'Starts with one Outsider role and two candidates, or learns there are none.'},
 investigator:{name:'Investigator',team:'townsfolk',summary:'Starts with one Minion role and two candidates.'},
 chef:{name:'Chef',team:'townsfolk',summary:'Starts with the number of adjacent evil pairs.'},
 empath:{name:'Empath',team:'townsfolk',summary:'Each night learns how many living neighbours register evil.'},
 fortuneteller:{name:'Fortune Teller',team:'townsfolk',summary:'Each night checks two seats for a Demon; one good red herring also reads yes.'},
 undertaker:{name:'Undertaker',team:'townsfolk',summary:'After the first night, learns the role of the player executed that day.'},
 monk:{name:'Monk',team:'townsfolk',summary:'After the first night, protects another player from the Demon for the night.'},
 ravenkeeper:{name:'Ravenkeeper',team:'townsfolk',summary:'If killed at night, learns one chosen player’s role.'},
 virgin:{name:'Virgin',team:'townsfolk',summary:'First nomination can immediately execute a Townsfolk nominator.'},
 slayer:{name:'Slayer',team:'townsfolk',summary:'Once per game by day, may shoot a player; a Demon target dies.'},
 soldier:{name:'Soldier',team:'townsfolk',summary:'Cannot be killed by the Demon.'},
 mayor:{name:'Mayor',team:'townsfolk',summary:'At three alive, no execution can win for good; a night death may redirect.'},
 butler:{name:'Butler',team:'outsider',summary:'Each night chooses a master and may vote only when that master votes.'},
 drunk:{name:'Drunk',team:'outsider',summary:'Believes they are an unused Townsfolk, but that ability does not work.'},
 recluse:{name:'Recluse',team:'outsider',summary:'May register as evil and as a Minion or Demon.'},
 saint:{name:'Saint',team:'outsider',summary:'If killed by execution, good loses.'},
 poisoner:{name:'Poisoner',team:'minion',summary:'Each night poisons one NPC through the following day.'},
 spy:{name:'Spy',team:'minion',summary:'Knows the complete game state and may register as good or a good role.'},
 scarletwoman:{name:'Scarlet Woman',team:'minion',summary:'With at least five alive, becomes the Imp when the Demon dies.'},
 baron:{name:'Baron',team:'minion',summary:'Setup has two extra Outsiders replacing two Townsfolk.'},
 imp:{name:'Imp',team:'demon',summary:'After the first night kills a player; self-killing passes Demonhood to a Minion.'}
};
export const SETUP = {
 5:[3,0,1,1],6:[3,1,1,1],7:[5,0,1,1],8:[5,1,1,1],9:[5,2,1,1],
 10:[7,0,2,1],11:[7,1,2,1],12:[7,2,2,1],13:[9,0,3,1],14:[9,1,3,1],15:[9,2,3,1]
};
export const GOOD_INFO = new Set(['washerwoman','librarian','investigator','chef','empath','fortuneteller','undertaker','ravenkeeper']);
export const valueRoles = new Set(['empath','fortuneteller','undertaker','monk','ravenkeeper']);
export function alignment(role){return ['minion','demon'].includes(ROLES[role].team)?'evil':'good'}
export function title(id){return ROLES[id]?.name ?? id}
