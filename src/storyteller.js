import{ROLES,name,team}from"./data.js";
import{pick,sample}from"./util.js";

export const ability=p=>
  p.role==="drunk"
    ?p.shown
    :p.role;

export const works=p=>
  p.alive&&
  p.role!=="drunk"&&
  !p.poisoned;

const evil=p=>
  p.role==="recluse"
    ?true
    :p.role==="spy"
      ?false
      :p.alignment==="evil";

function neigh(s,p){
  const a=s.players;
  const n=a.length;
  const i=a.indexOf(p);
  const o=[];

  for(const d of[-1,1]){
    for(let k=1;k<n;k++){
      const q=
        a[(i+d*k+n)%n];

      if(q.alive){
        o.push(q);
        break;
      }
    }
  }

  return o;
}
function unreliableInfo(
  s,
  role,
  targets
){
  if([
    "washerwoman",
    "librarian",
    "investigator"
  ].includes(role)){
    const wanted=
      role==="washerwoman"
        ?"townsfolk"
        :role==="librarian"
          ?"outsider"
          :"minion";

    const pair=sample(
      s.players,
      2,
      s.r
    );

    const possible=
      s.script.ids.filter(
        id=>team(id)===wanted
      );

    const shown=pick(
      possible,
      s.r
    );

    return{
      targets:pair.map(
        x=>x.id
      ),
      text:
        shown&&pair.length===2
          ?`One of ${pair[0].label} and ${pair[1].label} is ${name(shown)}.`
          :"No matching character is in play."
    };
  }

  if(role==="chef"){
    return{
      targets:[],
      text:
        `Chef number: ${Math.floor(s.r()*3)}.`
    };
  }

  if(role==="empath"){
    return{
      targets,
      text:
        `Empath number: ${Math.floor(s.r()*3)}.`
    };
  }
    if(role==="fortuneteller"){
    const selected=
      targets
        .map(
          id=>
            s.players.find(
              x=>x.id===id
            )
        )
        .filter(Boolean);

    return{
      targets,
      text:
        `Fortune Teller: ${
          s.r()<.5
            ?"YES"
            :"NO"
        } for ${
          selected
            .map(x=>x.label)
            .join(" and ")
        }.`
    };
  }

  if(role==="undertaker"){
    const shown=pick(
      Object.keys(ROLES),
      s.r
    );

    return{
      targets:[],
      text:
        `Executed player was ${name(shown)}.`
    };
  }

  return{
    targets,
    text:"No information."
  };
}
export function nightInfo(
  s,
  p,
  strat
){
  if(!p.alive){
    return null;
  }

  const role=ability(p);

  const first=[
    "washerwoman",
    "librarian",
    "investigator",
    "chef"
  ].includes(role);

  const each=[
    "empath",
    "fortuneteller"
  ].includes(role);

  const other=
    role==="undertaker";

  if(
    !first&&!each&&!other||
    s.night===1&&other||
    s.night>1&&first
  ){
    return null;
  }

  let text="";
  let targets=[];

  if([
    "washerwoman",
    "librarian",
    "investigator"
  ].includes(role)){
    const wanted=
      role==="washerwoman"
        ?"townsfolk"
        :role==="librarian"
          ?"outsider"
          :"minion";

    const real=pick(
      s.players.filter(
        x=>team(x.role)===wanted
      ),
      s.r
    );

    if(!real){
      text=
        "No matching character is in play.";
    }else{
      const fake=pick(
        s.players.filter(
          x=>x.id!==real.id
        ),
        s.r
      );

      targets=[
        real.id,
        fake.id
      ];

      text=
        `One of ${real.label} and ${fake.label} is ${name(real.role)}.`;
    }
  }else if(role==="chef"){
    let n=0;

    s.players.forEach(
      (x,i)=>{
        if(
          evil(x)&&
          evil(
            s.players[
              (i+1)%
              s.players.length
            ]
          )
        ){
          n++;
        }
      }
    );

    text=`Chef number: ${n}.`;
  }else if(role==="empath"){
    targets=
      neigh(s,p)
        .map(x=>x.id);

    text=
      `Empath number: ${
        neigh(s,p)
          .filter(evil)
          .length
      }.`;
       }else if(
    role==="fortuneteller"
  ){
    const ts=
      strat.ft(s,p);

    targets=
      ts.map(x=>x.id);

    text=
      `Fortune Teller: ${
        ts.some(
          x=>
            x.role==="imp"||
            x.id===s.red||
            x.role==="recluse"
        )
          ?"YES"
          :"NO"
      } for ${
        ts
          .map(x=>x.label)
          .join(" and ")
      }.`;
  }else if(
    role==="undertaker"
  ){
    const x=
      s.players.find(
        x=>
          x.id===
          s.lastExecution
      );

    text=
      x
        ?`Executed player was ${name(x.role)}.`
        :"Nobody was executed.";
  }

  const functioning=
    works(p);

  if(!functioning){
    const unreliable=
      unreliableInfo(
        s,
        role,
        targets
      );

    text=unreliable.text;
    targets=unreliable.targets;
  }

  return{
    night:s.night,
    role,
    text,
    targets,
    trigger:"normal",
    functioning
  };
}

export function ravenInfo(
  s,
  p,
  t
){
  const seen=
    !p.poisoned
      ?t.role
      :pick(
          Object.keys(ROLES),
          s.r
        );

  return{
    night:s.night,
    role:"ravenkeeper",
    text:
      `${t.label} is ${name(seen)}.`,
    targets:[t.id],
    trigger:"death",
    functioning:!p.poisoned
  };
}