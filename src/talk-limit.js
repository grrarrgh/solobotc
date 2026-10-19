export function getDailyTalkLimit(state){
  return Math.floor(state.players.filter(player=>player.alive).length/2);
}
export function ensureTalkState(state){
  if(!Array.isArray(state.talkedToToday))state.talkedToToday=[];
  if(!Number.isInteger(state.talkDay))state.talkDay=state.day??0;
  if(state.talkDay!==state.day)resetDailyTalks(state);
}
export function resetDailyTalks(state){
  state.talkDay=state.day??0;
  state.talkedToToday=[];
}
export function getTalkStatus(state,targetId=null){
  ensureTalkState(state);
  const limit=getDailyTalkLimit(state),used=state.talkedToToday.length;
  return {limit,used,remaining:Math.max(0,limit-used),alreadyTalkedToTarget:targetId?state.talkedToToday.includes(targetId):false};
}
export function recordTalk(state,targetId){
  const status=getTalkStatus(state,targetId);
  if(state.winner)throw new Error("The game is over.");
  if(state.phase!=="day")throw new Error("Conversations happen during the day.");
  if(status.alreadyTalkedToTarget)throw new Error("You have already spoken to that player today.");
  if(status.remaining<=0)throw new Error(`You have used today's ${status.limit} conversation slot(s).`);
  state.talkedToToday.push(targetId);
  return getTalkStatus(state);
}
