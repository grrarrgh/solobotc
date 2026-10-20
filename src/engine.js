import{name,team}from"./data.js";

import{
  nightInfo,
  ability,
  works,
  ravenInfo
}from"./storyteller.js";

import{SimpleStrategy}
  from"./strategy.js";

import{pick}
  from"./util.js";

const KEY_MOMENT_TYPES=
  new Set([
    "poison",
    "monk",
    "demon",
    "death",
    "succession",
    "game_over"
  ]);

export class Engine{
  constructor(
    s,
    strat=new SimpleStrategy()
  ){
    this.s=s;
    this.strat=strat;
  }

  player(id){
    return this.s.players.find(
      x=>x.id===id
    );
  }

  alive(){
    return this.s.players.filter(
      x=>x.alive
    );
  }

  human(){
    return this.player(
      this.s.humanId
    );
  }

  audit(
    type,
    text,
    data={},
    group=
      this.s.phase==="night"
        ?`Night ${this.s.night}`
        :`Day ${this.s.day}`
  ){
    this.s.audit.push({
      id:this.s.auditId++,
      group,
      type,
      text,
      data
    });
  }
   talkLimit(){
    return Math.floor(
      this.alive().length/2
    );
  }

  talkStatus(id=null){
    if(
      this.s.talkDay!==
      this.s.day
    ){
      this.s.talkDay=
        this.s.day;

      this.s.talked=[];
    }

    return{
      limit:this.talkLimit(),
      used:this.s.talked.length,
      remaining:Math.max(
        0,
        this.talkLimit()-
        this.s.talked.length
      ),
      already:
        id
          ?this.s.talked.includes(id)
          :false
    };
  }

  remember(p,info){
    p.memories.push(info);

    this.audit(
      "information",
      `${name(p.role)} received: ${info.text}`,
      {
        playerId:p.id,
        ...info
      }
    );

    if(p.human){
      this.s.privateLog.push(
        `Night ${info.night}: ${info.text}`
      );

      this.s.publicLog.push(
        `Day ${info.night} — Night ${info.night}: You received: ${info.text}`
      );
    }
  }

  start(){
    this.night();
    return this.s;
  }
   night(){
    const s=this.s;

    if(s.winner){
      return;
    }

    s.phase="night";

    s.players.forEach(x=>{
      x.protected=false;
      x.poisoned=false;
    });

    const poisoner=
      s.players.find(
        x=>
          x.alive&&
          x.role==="poisoner"
      );

    if(poisoner){
      const t=
        this.strat.poison(s);

      if(t){
        t.poisoned=true;
        s.poisoned=t.id;

        this.audit(
          "poison",
          `${poisoner.label} (${name(poisoner.role)}) selected ${t.label}; poisoned.`,
          {
            actorId:poisoner.id,
            targetId:t.id,
            effective:true
          }
        );
      }
    }

    if(s.night>1){
      for(
        const m of
        s.players.filter(
          x=>
            x.alive&&
            ability(x)==="monk"
        )
      ){
        const t=
          this.strat.monk(s,m);

        if(t){
          const effective=
            works(m);

          if(effective){
            t.protected=true;
          }

          this.audit(
            "monk",
            `${m.label} (${name(m.role)}) chose ${t.label}; ${
              effective
                ?"protected"
                :"protection failed"
            }.`,
            {
              actorId:m.id,
              targetId:t.id,
              effective
            }
          );
        }
      }

      this.demon();
    }

    if(s.winner){
      return;
    }

    for(const p of s.players){
      const info=
        nightInfo(
          s,
          p,
          this.strat
        );

      if(info){
        this.remember(p,info);
      }
    }

    s.day=s.night;
    s.phase="day";
    s.talkDay=s.day;
    s.talked=[];

    s.publicLog.push(
      `Day ${s.day}: ${this.alive().length} alive; talk to ${this.talkLimit()} distinct players.`
    );

    this.audit(
      "day",
      `Day ${s.day} began.`
    );
  }
  demon(){
    const s=this.s;

    const d=
      s.players.find(
        x=>
          x.alive&&
          x.role==="imp"
      );

    if(!d){
      this.finish(
        "good",
        "No Demon remains."
      );
      return;
    }

    let t=
      this.strat.demon(s,d);

    if(
      !t||
      t.human||
      !t.alive
    ){
      this.audit(
        "demon",
        `${d.label} (${name(d.role)}) had no legal target.`,
        {
          actorId:d.id,
          targetId:null,
          outcome:"no_target"
        }
      );

      return;
    }

    const before=
      this.alive().length;

    const original=t;

    let outcome="killed";
    let detail="";

    if(
      t.role==="soldier"&&
      works(t)
    ){
      outcome="blocked";
      detail=
        "blocked by the Soldier ability";
    }else if(t.protected){
      outcome="blocked";
      detail=
        "blocked by Monk protection";
    }else if(
      t.role==="mayor"&&
      works(t)
    ){
      const alt=pick(
        s.players.filter(
          x=>
            x.alive&&
            !x.human&&
            x.id!==t.id&&
            x.id!==d.id
        ),
        s.r
      );

      if(alt){
        t=alt;
        outcome="redirected";
        detail=
          `redirected to ${t.label}`;
      }
    }

    const result=
      outcome==="killed"
        ?`${t.label} was killed`
        :detail;

    this.audit(
      "demon",
      `${d.label} (${name(d.role)}) chose ${original.label}; attack ${result}.`,
      {
        actorId:d.id,
        targetId:original.id,
        actualTargetId:t.id,
        outcome
      }
    );

    if(outcome!=="blocked"){
      this.kill(t,"demon");

      if(t===d){
        this.successor(
          d,
          before,
          true
        );
      }else{
        this.check();
      }
    }
  }
  kill(p,cause){
    if(!p?.alive){
      return false;
    }

    p.alive=false;
    p.death=cause;

    this.audit(
      "death",
      `${p.label} died: ${cause}.`,
      {
        playerId:p.id,
        cause
      }
    );

    this.s.publicLog.push(
      `${p.label} died.`
    );

    if(
      cause==="demon"&&
      ability(p)==="ravenkeeper"
    ){
      const t=
        this.strat.raven(
          this.s,
          p
        );

      if(t){
        this.remember(
          p,
          ravenInfo(
            this.s,
            p,
            t
          )
        );
      }
    }

    return true;
  }

  ask(id){
    const s=this.s;
    const p=this.player(id);
    const st=
      this.talkStatus(id);

    if(!p||p.human){
      throw Error(
        "Select an NPC."
      );
    }

    if(s.phase!=="day"){
      throw Error(
        "Talk during the day."
      );
    }

    if(st.already){
      throw Error(
        "Already asked today."
      );
    }

    if(!st.remaining){
      throw Error(
        "No conversation slots remain."
      );
    }

    s.talked.push(id);
    p.claimKnown=true;

    const response=
      this.strat.ask(s,p);

    p.talks.push({
      day:s.day,
      response
    });

    s.publicLog.push(
      `Day ${s.day} — ${p.label} claimed ${name(p.claim)}: ${response}`
    );

    this.audit(
      "conversation",
      `${p.label} claimed ${name(p.claim)}: ${response}`,
      {target:id}
    );

    return response;
  }
  votes(n){
    const s=this.s;
    const intents=
      new Map();

    const records=
      s.players.map(v=>{
        const eligible=
          v.alive||
          v.ghost;

        let attempted=
          eligible&&(
            v.human||
            this.strat.vote(
              s,
              v,
              n
            )
          );

        if(
          v.alignment==="evil"&&
          n.alignment==="evil"
        ){
          attempted=false;
        }

        intents.set(
          v.id,
          attempted
        );

        return{
          playerId:v.id,
          attempted,
          counted:false
        };
      });

    for(const r of records){
      const v=
        this.player(
          r.playerId
        );

      if(!r.attempted){
        continue;
      }

      if(
        v.alive&&
        ability(v)==="butler"&&
        works(v)&&
        !intents.get(v.master)
      ){
        continue;
      }

      r.counted=true;

      if(!v.alive){
        v.ghost=false;
      }
    }

    return records;
  }

  nominate(id){
    const s=this.s;
    const n=this.player(id);

    if(
      s.phase!=="day"||
      s.winner||
      !n?.alive||
      n.human
    ){
      throw Error(
        "Choose a living NPC."
      );
    }

    const records=
      this.votes(n);

    const count=
      records.filter(
        x=>x.counted
      ).length;

    const threshold=
      Math.ceil(
        this.alive().length/2
      );

    const executed=
      count>=threshold;

    const result={
      nomineeId:id,
      count,
      threshold,
      executed,
      records
    };

    s.lastVote=result;

    this.audit(
      "vote_result",
      `${n.label}: ${count}/${threshold}; ${
        executed
          ?"executed"
          :"vote failed"
      }.`,
      result
    );

    s.publicLog.push(
      `Day ${s.day} — Vote on ${n.label} ${
        executed
          ?"passed"
          :"failed"
      }: ${count}/${threshold}; ${
        executed
          ?"execution"
          :"no execution"
      }.`
    );
    if(executed){
const before=
this.alive().length;
 
s.lastExecution=id;
 
this.kill(
n,
"execution"
);
 
if(n.role==="saint"){
this.finish(
"evil",
"Saint executed."
);
}else if(
n.role==="imp"
){
this.successor(
n,
before,
false
);
}else{
this.check();
}
 
if(!s.winner){
s.night++;
this.night();
}
}
 
return result;
}
 
endDay(){
if(
this.s.phase!=="day"||
this.s.winner
){
throw Error(
"Cannot end day."
);
}
 
if(
this.alive().length===3&&
this.human().role==="mayor"&&
works(this.human())
){
this.finish(
"good",
"Mayor final-three victory."
);
}else{
this.s.night++;
this.night();
}
}
 
slay(id){
const p=this.human();
const t=this.player(id);
 
if(
this.s.slayerUsed||
ability(p)!=="slayer"||
!t?.alive
){
throw Error(
"Slayer unavailable."
);
}
 
this.s.slayerUsed=true;
 
if(
works(p)&&(
t.role==="imp"||
t.role==="recluse"
)
){
const before=
this.alive().length;
 
this.kill(
t,
"slayer"
);
 
if(t.role==="imp"){
this.successor(
t,
before,
false
);
}
 
return true;
}
 
return false;
}
successor(
    dead,
    before,
    self
  ){
    let next=
      before>=5
        ?this.s.players.find(
            x=>
              x.alive&&
              x.role==="scarletwoman"
          )
        :null;

    if(!next&&self){
      next=
        this.s.players.find(
          x=>
            x.alive&&
            team(x.role)==="minion"
        );
    }

    if(next){
      next.role="imp";
      next.alignment="evil";

      this.audit(
        "succession",
        `${next.label} became Imp.`,
        {
          playerId:next.id,
          previousDemonId:dead.id
        }
      );
    }else{
      this.finish(
        "good",
        "Demon died."
      );
    }
  }

  check(){
    if(
      !this.s.players.some(
        x=>
          x.alive&&
          x.role==="imp"
      )
    ){
      this.finish(
        "good",
        "No Demon remains."
      );
    }else if(
      this.alive().length<=2
    ){
      this.finish(
        "evil",
        "Two alive remain."
      );
    }
  }

  finish(winner,reason){
    this.s.winner=winner;
    this.s.reason=reason;
    this.s.phase="over";

    this.audit(
      "game_over",
      `${winner.toUpperCase()}: ${reason}`,
      {},
      "Game Over"
    );
  }

  reveal(){
    if(!this.s.winner){
      return null;
    }

    const events=
      this.s.audit.filter(
        e=>![
          "vote",
          "vote_result"
        ].includes(e.type)
      );

    return{
      winner:this.s.winner,
      reason:this.s.reason,
      players:this.s.players,
      events,
      keyMoments:
        events.filter(
          e=>
            KEY_MOMENT_TYPES.has(
              e.type
            )
        )
    };
  }
}