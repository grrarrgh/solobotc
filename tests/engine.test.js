import test from"node:test";
import assert from"node:assert/strict";
import fs from"node:fs";

import{createState}
  from"../src/setup.js";

import{Engine}
  from"../src/engine.js";

import{SimpleStrategy}
  from"../src/strategy.js";

const script=
  JSON.parse(
    fs.readFileSync(
      new URL(
        "../scripts/trouble-brewing.json",
        import.meta.url
      )
    )
  );

const role=(
  p,
  id,
  alignment
)=>
  Object.assign(
    p,
    {
      role:id,
      startRole:id,
      shown:id,
      claim:id,
      alignment,
      alive:true,
      ghost:true,
      poisoned:false,
      protected:false,
      memories:[],
      talks:[],
      death:null
    }
  );

function base(
  seed="feature-test"
){
  const s=
    createState(
      script,
      5,
      seed
    );

  s.phase="day";
  s.night=1;
  s.day=1;
  s.winner=null;
  s.reason=null;
  s.publicLog=[];
  s.privateLog=[];
  s.audit=[];
  s.auditId=1;
  s.talked=[];
  s.talkDay=1;
  s.lastExecution=null;
  s.lastVote=null;

  role(
    s.players[0],
    "mayor",
    "good"
  );

  role(
    s.players[1],
    "chef",
    "good"
  );

  role(
    s.players[2],
    "butler",
    "good"
  );

  role(
    s.players[3],
    "baron",
    "evil"
  );

  role(
    s.players[4],
    "imp",
    "evil"
  );

  return s;
}
test(
  "starts game",
  ()=>{
    const s=
      createState(
        script,
        10,
        "42"
      );

    const e=
      new Engine(s);

    e.start();

    assert.equal(
      s.players.length,
      10
    );

    assert.equal(
      s.phase,
      "day"
    );

    assert.ok(
      s.publicLog.some(
        x=>/^Day 1:/.test(x)
      )
    );
  }
);

test(
  "reveal hidden before end",
  ()=>{
    const e=
      new Engine(
        createState(
          script,
          7,
          "test"
        )
      );

    e.start();

    assert.equal(
      e.reveal(),
      null
    );
  }
);

test(
  "failed votes stay in the day, are visible, and allow another nomination",
  ()=>{
    const s=base();

    const strat=
      new SimpleStrategy();

    let approve=false;

    strat.vote=()=>approve;
    strat.demon=()=>null;

    const e=
      new Engine(
        s,
        strat
      );

    const first=
      s.players[1];

    const second=
      s.players[2];

    const failed=
      e.nominate(
        first.id
      );

    assert.equal(
      failed.executed,
      false
    );

    assert.equal(
      s.phase,
      "day"
    );

    assert.equal(
      s.day,
      1
    );

    assert.equal(
      first.alive,
      true
    );

    assert.ok(
      s.publicLog.some(
        x=>
          x===
          `Day 1 — Vote on ${first.label} failed: ${failed.count}/${failed.threshold}; no execution.`
      )
    );

    approve=true;

    const passed=
      e.nominate(
        second.id
      );

    assert.equal(
      passed.executed,
      true
    );

    assert.equal(
      second.alive,
      false
    );

    assert.equal(
      s.day,
      2
    );

    assert.equal(
      s.phase,
      "day"
    );
  }
);
test(
  "the exact information delivered to a poisoned Human is logged every night without exposing the cause",
  ()=>{
    const s=
      base("night-info");

    const human=
      s.players[0];

    const poisoner=
      s.players[3];

    role(
      human,
      "empath",
      "good"
    );

    role(
      poisoner,
      "poisoner",
      "evil"
    );

    s.phase="night";
    s.day=0;
    s.night=1;
    s.r=()=>0;

    const strat=
      new SimpleStrategy();

    strat.demon=()=>null;

    const e=
      new Engine(
        s,
        strat
      );

    e.start();
    e.endDay();

    assert.equal(
      human.memories.length,
      2
    );

    for(
      const info of
      human.memories
    ){
      const exact=
        `Day ${info.night} — Night ${info.night}: You received: ${info.text}`;

      assert.ok(
        s.publicLog.includes(
          exact
        )
      );

      assert.ok(
        s.privateLog.includes(
          `Night ${info.night}: ${info.text}`
        )
      );

      assert.doesNotMatch(
        exact,
        /poisoned|drunk|unreliable/i
      );
    }
  }
);
function askedState(kind){
  const s=
    base(
      `ask-${kind}`
    );

  s.r=()=>0;

  if(kind==="poisoned"){
    s.players[1].poisoned=true;
  }

  if(kind==="drunk"){
    role(
      s.players[1],
      "drunk",
      "good"
    );
  }

  return s;
}

function suspicionTarget(
  s,
  response
){
  const label=
    response.match(
      /I heard (Player \d+) is suspicious/
    )[1];

  return s.players.find(
    p=>p.label===label
  );
}

test(
  "NPC suspicion statements obey truth, lie, status, and target constraints",
  ()=>{
    for(
      const kind of[
        "good",
        "evil",
        "poisoned",
        "drunk"
      ]
    ){
      const s=
        askedState(kind);

      const e=
        new Engine(s);

      const speaker=
        kind==="evil"
          ?s.players[3]
          :s.players[1];

      const response=
        e.ask(
          speaker.id
        );

      const target=
        suspicionTarget(
          s,
          response
        );

      assert.ok(target);

      assert.equal(
        target.human,
        false
      );

      assert.notEqual(
        target.id,
        speaker.id
      );

      assert.match(
        response,
        /I heard Player \d+ is suspicious/
      );

      if(kind==="good"){
        assert.equal(
          target.alignment,
          "evil"
        );
      }else{
        assert.equal(
          target.alignment,
          "good"
        );
      }
    }
  }
);
test(
  "post-game Key Moments include hidden Poisoner, Monk, and Demon night actions",
  ()=>{
    const s=
      base("key-moments");

    const poisoner=
      s.players[1];

    const monk=
      s.players[2];

    const imp=
      s.players[4];

    const target=
      s.players[3];

    role(
      poisoner,
      "poisoner",
      "evil"
    );

    role(
      monk,
      "monk",
      "good"
    );

    role(
      imp,
      "imp",
      "evil"
    );

    role(
      target,
      "chef",
      "good"
    );

    s.phase="night";
    s.night=2;
    s.day=1;

    const strat=
      new SimpleStrategy();

    strat.poison=
      ()=>target;

    strat.monk=
      ()=>target;

    strat.demon=
      ()=>null;

    const e=
      new Engine(
        s,
        strat
      );

    e.night();

    e.finish(
      "good",
      "Test complete."
    );

    const key=
      e.reveal()
        .keyMoments;

    const poison=
      key.find(
        x=>x.type==="poison"
      );

    const protection=
      key.find(
        x=>x.type==="monk"
      );

    const demon=
      key.find(
        x=>x.type==="demon"
      );

    assert.deepEqual(
      {
        actorId:
          poison.data.actorId,
        targetId:
          poison.data.targetId
      },
      {
        actorId:
          poisoner.id,
        targetId:
          target.id
      }
    );

    assert.deepEqual(
      {
        actorId:
          protection.data.actorId,
        targetId:
          protection.data.targetId,
        effective:
          protection.data.effective
      },
      {
        actorId:
          monk.id,
        targetId:
          target.id,
        effective:true
      }
    );

    assert.equal(
      demon.data.actorId,
      imp.id
    );

    assert.equal(
      demon.data.outcome,
      "no_target"
    );

    assert.ok(
      !key.some(
        x=>
          x.type===
          "information"
      )
    );
  }
);