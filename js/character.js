function freshCharacter(base){let attacks=base.attacks?.length?base.attacks:[{name:"攻撃",skill:+base.attack||50,damage:"1d4+1",kind:"damage"}];let best=chooseBestAttack(attacks);return{name:base.name||"探索者",image:base.image||"",db:base.db||"0",maxHp:+base.maxHp||10,hp:+base.maxHp||10,str:+base.str||50,dex:+base.dex||50,attacks,skills:{attack:+best.skill||50,dodge:+base.dodge||40,firstAid:+base.firstAid||30},state:{attackBonus:0,guard:false,spirit:0,rp:2,normalAttacks:0,nextApPenalty:0}}}
function getNum(v){let n=Number(v);return Number.isFinite(n)?n:null}
function damageExpected(expr){expr=String(expr||"").toLowerCase().replace(/\s/g,"");let total=0,found=false;for(let m of expr.matchAll(/(\d*)d(\d+)/g)){found=true;total+=(+(m[1]||1))*(+m[2]+1)/2}for(let m of expr.matchAll(/(?:^|[^\dd])([+-]?\d+)(?!d)/g))total+=+m[1];return found?total:0}
function attackExpectedValue(a){return damageExpected(a.damage)*(Math.max(0,Math.min(100,+a.skill||0))/100)}
function chooseBestAttack(arr){let pool=arr.filter(a=>a.kind!=="grapple");if(!pool.length)pool=arr;return [...pool].sort((a,b)=>attackExpectedValue(b)-attackExpectedValue(a)||damageExpected(b.damage)-damageExpected(a.damage)||b.skill-a.skill)[0]||{name:"攻撃",skill:50,damage:"1d4+1",kind:"damage"}}
function rollDamageExpr(expr){let s=String(expr||"1d4+1").toLowerCase().replace(/\s/g,""),n=0;for(let m of s.matchAll(/(\d*)d(\d+)/g)){for(let i=0;i<+(m[1]||1);i++)n+=rollDice(+m[2])}let stripped=s.replace(/(\d*)d(\d+)/g,"");for(let m of stripped.matchAll(/[+-]?\d+/g))n+=+m[0];return Math.max(0,n)}
function parseCcf(data){
 const d=data?.data||data||{}, params=[...(d.params||[]),...(d.status||[])];
 const commands=String(d.commands||d.command||"");
 const lines=commands.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
 const param=(name,def=null)=>{
   let p=params.find(x=>String(x.label||"").trim().toUpperCase()===name.toUpperCase());
   return p ? (p.value??p.max??def) : def;
 };
 const numParam=(name,def)=>{let n=Number(param(name,def));return Number.isFinite(n)?n:def};
 const dbRaw=String(param("DB","0")).trim().toUpperCase().replace(/\s/g,"");
 const dbExpr=/^[+-]?\d*D\d+(?:[+-]\d+)?$/i.test(dbRaw)||/^[+-]?\d+$/.test(dbRaw)?dbRaw:"0";
 const expandDB=expr=>String(expr||"").replace(/\{DB\}|(?<![A-Z])DB(?![A-Z])/ig,dbExpr==="0"?"0":dbExpr);
 const cleanDamage=expr=>expandDB(expr).replace(/\+\-/g,"-").replace(/\+\+/, "+");
 const skillLines=[];
 const damageByName=new Map();
 for(const line of lines){
   let sm=line.match(/(?:CCB|CC|1D100)\s*(?:<=|＜=|≦|<)?\s*(\d+)\s*(.*)$/i);
   if(sm){
     let name=sm[2].replace(/[【】\[\]]/g,"").trim();
     skillLines.push({name,value:+sm[1],line});
     continue;
   }
   let dm=line.match(/^(.+?)\s+([+-]?\d*D\d+(?:\s*[+-]\s*(?:\{DB\}|DB|\d*D\d+|\d+))*)$/i);
   if(dm && /D\d/i.test(dm[2])){
     // CCFOLIA example: "1D6+{DB} キック" is formula first, so handle below too.
     damageByName.set(dm[1].trim(),cleanDamage(dm[2]));
     continue;
   }
   let fm=line.match(/^([+-]?\d*D\d+(?:\s*[+-]\s*(?:\{DB\}|DB|\d*D\d+|\d+))*)\s+(.+)$/i);
   if(fm) damageByName.set(fm[2].trim(),cleanDamage(fm[1]));
 }
 // second pass explicitly catches formula-first lines such as "1D6+{DB} キック"
 for(const line of lines){
   let fm=line.match(/^([+-]?\d*D\d+(?:\s*[+-]\s*(?:\{DB\}|DB|\d*D\d+|\d+))*)\s+(.+)$/i);
   if(fm) damageByName.set(fm[2].trim(),cleanDamage(fm[1]));
 }
 const findSkill=(names,def)=>{
   let x=skillLines.find(q=>names.some(n=>q.name.replace(/\s/g,"").includes(n.replace(/\s/g,""))));
   return x?x.value:def;
 };
 const isGrapple=n=>/(組み付き|組付き|組みつき|組付|グラップル)/.test(n.replace(/\s/g,""));
 const nonCombat=/幸運|STR×5|CON×5|POW×5|DEX×5|APP×5|SIZ×5|INT×5|アイデア|知識|言いくるめ|応急手当|回避|聞き耳|クトゥルフ神話|心理学|説得|追跡|図書館|法律|母国語|目星|夢の知識/;
 let attacks=[];
 for(const q of skillLines){
   let grapple=isGrapple(q.name);
   let dmg=damageByName.get(q.name)||"";
   if(grapple){
     // This game's special grapple rule needs damage. If the sheet has none, use 1D6+DB.
     attacks.push({name:"組み付き",skill:q.value,damage:dmg||cleanDamage("1D6+{DB}"),kind:"grapple"});
   } else if(dmg){
     attacks.push({name:q.name,skill:q.value,damage:dmg,kind:"damage"});
   } else if(!nonCombat.test(q.name) && /拳銃|キック|こぶし|頭突き|刀|剣|斧|槍|弓|ライフル|ショットガン|マシンガン|武道|マーシャルアーツ/.test(q.name)){
     // combat skill without a damage command is kept only when a known default is safe enough
     let defaults={"キック":"1D6+{DB}","こぶし":"1D3+{DB}","頭突き":"1D4+{DB}"};
     let key=Object.keys(defaults).find(k=>q.name.includes(k));
     if(key) attacks.push({name:q.name,skill:q.value,damage:cleanDamage(defaults[key]),kind:"damage"});
   }
 }
 // damage commands can exist without matching skill lines; match by contained name when possible.
 for(const [name,dmg] of damageByName){
   if(attacks.some(a=>a.name===name))continue;
   let q=skillLines.find(x=>x.name===name||x.name.includes(name)||name.includes(x.name));
   if(q)attacks.push({name:q.name,skill:q.value,damage:dmg,kind:isGrapple(q.name)?"grapple":"damage"});
 }
 let hp=Number(param("HP",10)),str=numParam("STR",50),dex=numParam("DEX",50);
 if(!attacks.some(a=>a.kind==="damage"))attacks.push({name:"攻撃",skill:50,damage:"1D4+1",kind:"damage"});
 let best=chooseBestAttack(attacks);
 return{name:d.name||"探索者",image:d.image||"",maxHp:hp,str,dex,db:dbExpr,attack:best.skill,
   dodge:findSkill(["回避"],Math.floor(dex*2)),firstAid:findSkill(["応急手当"],30),attacks}
}