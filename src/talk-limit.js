export const getDailyTalkLimit=s=>Math.floor(s.players.filter(p=>p.alive).length/2);
