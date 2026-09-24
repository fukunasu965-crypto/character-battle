
function getNum(v){let n=Number(v);return Number.isFinite(n)?n:null}
function clamp(n){return Math.max(0,Math.min(100,Math.round(n)))}
function damageExpected(expr){
 expr=String(expr||"0").toUpperCase().replace(/\s/g,"");
 let total=0, matched=false;
 for(const m of expr.matchAll(/([+-]?)(\d*)D(\d+)/g)){
   matched=true; let sign=m[1]==="-"?-1:1, count=+(m[2]||1), sides=+m[3];
   total+=sign*count*(sides+1)/2;
 }
 let rest=expr.replace(/([+-]?)(\d*)D(\d+)/g,"");
 for(const m of rest.matchAll(/[+-]?\d+/g)) total+=+m[0];
 return matched||total?total:0;
}
function attackExpectedValue(a){return damageExpected(a.damage)*(Math.max(0,Math.min(100,+a.skill||0))/100)}
function chooseBestAttack(arr){
 let pool=(arr||[]).filter(a=>a.kind==="damage" && damageExpected(a.damage)>0);
 if(!pool.length) pool=(arr||[]).filter(a=>a.kind!=="grapple");
 return [...pool].sort((a,b)=>attackExpectedValue(b)-attackExpectedValue(a)||damageExpected(b.damage)-damageExpected(a.damage)||b.skill-a.skill)[0]
   ||{name:"攻撃",skill:50,damage:"1D4+1",kind:"damage"};
}
function rollDamageExpr(expr){
 let s=String(expr||"0").toUpperCase().replace(/\s/g,""),total=0;
 for(const m of s.matchAll(/([+-]?)(\d*)D(\d+)/g)){
   let sign=m[1]==="-"?-1:1,count=+(m[2]||1),sides=+m[3];
   for(let i=0;i<count;i++) total+=sign*rollDice(sides);
 }
 let rest=s.replace(/([+-]?)(\d*)D(\d+)/g,"");
 for(const m of rest.matchAll(/[+-]?\d+/g)) total+=+m[0];
 return Math.max(0,total);
}
function freshCharacter(base){
 let attacks=base.attacks?.length?base.attacks:[{name:"攻撃",skill:+base.attack||50,damage:"1D4+1",kind:"damage"}];
 let best=chooseBestAttack(attacks);
 return{name:base.name||"探索者",image:base.image||"",db:base.db||"0",maxHp:+base.maxHp||10,hp:+base.maxHp||10,str:+base.str||10,dex:+base.dex||10,attacks,
 skills:{attack:+best.skill||50,dodge:+base.dodge||40,firstAid:+base.firstAid||30},
 state:{attackBonus:0,guard:false,spirit:0,rp:2,normalAttacks:0,nextApPenalty:0}};
}
function parseCcf(raw){
 const d=raw?.data||raw||{};
 const params=[...(d.params||[]),...(d.status||[])];
 const lines=String(d.commands||"").split(/\r?\n/).map(v=>v.trim()).filter(Boolean);
 const getParam=(label,def=null)=>{
   let x=params.find(p=>String(p.label||"").trim().toUpperCase()===label.toUpperCase());
   return x?(x.value??x.max??def):def;
 };
 const db=String(getParam("DB","0")).trim().toUpperCase().replace(/\s/g,"")||"0";
 const expandDB=e=>String(e||"").toUpperCase().replace(/\{DB\}/g,db).replace(/DB/g,db).replace(/\+\-/g,"-");
 const skills=new Map(), damages=new Map();
 // Pass 1: skills. Example "CCB<=80 拳銃"
 for(const line of lines){
   const m=line.match(/^(?:CCB|CC|1D100)\s*<=\s*(\d+)\s+(.+)$/i);
   if(m) skills.set(m[2].trim(),+m[1]);
 }
 // Pass 2: damage. Example "1D10 拳銃" / "1D6+{DB} キック"
 for(const line of lines){
   const m=line.match(/^((?:\d*D\d+|\d+)(?:\s*[+-]\s*(?:\{DB\}|DB|\d*D\d+|\d+))*)\s+(.+)$/i);
   if(m && !/^1D100$/i.test(m[1].trim())) damages.set(m[2].trim(),expandDB(m[1]));
 }
 const findSkill=(names,def)=>{
   for(const [name,val] of skills) if(names.some(n=>name.replace(/\s/g,"").includes(n))) return val;
   return def;
 };
 const attacks=[];
 // Damage commands define actual damaging attacks and are paired to same-name skills.
 for(const [name,damage] of damages){
   let skill=skills.get(name);
   if(skill==null){
     for(const [sn,sv] of skills){if(sn.includes(name)||name.includes(sn)){skill=sv;break}}
   }
   if(skill!=null) attacks.push({name,skill,damage,kind:/組み付き|組付き|組みつき/.test(name)?"grapple":"damage"});
 }
 // Grapple is special and may have no damage line in the sheet.
 for(const [name,skill] of skills){
   if(/組み付き|組付き|組みつき/.test(name) && !attacks.some(a=>a.kind==="grapple")){
     attacks.push({name:"組み付き",skill,damage:expandDB("1D6+{DB}"),kind:"grapple"});
   }
 }
 // Safe defaults for common unpaired melee skills.
 const defaults=[["キック","1D6+{DB}"],["こぶし","1D3+{DB}"],["頭突き","1D4+{DB}"]];
 for(const [key,formula] of defaults){
   let entry=[...skills].find(([n])=>n.includes(key));
   if(entry && !attacks.some(a=>a.name.includes(key))) attacks.push({name:entry[0],skill:entry[1],damage:expandDB(formula),kind:"damage"});
 }
 if(!attacks.some(a=>a.kind==="damage")) attacks.push({name:"攻撃",skill:50,damage:"1D4+1",kind:"damage"});
 const best=chooseBestAttack(attacks);
 return{
   name:d.name||"探索者",image:d.image||"",maxHp:+getParam("HP",10),maxMp:+getParam("MP",10),str:+getParam("STR",10),dex:+getParam("DEX",10),app:+getParam("APP",10),pow:+getParam("POW",10),int:+getParam("INT",10),db,
   attack:best.skill,dodge:findSkill(["回避"],Math.floor(+getParam("DEX",10)*2)),firstAid:findSkill(["応急手当"],30),attacks
 };
}
