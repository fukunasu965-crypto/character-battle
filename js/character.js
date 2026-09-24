function freshCharacter(base){let attacks=base.attacks?.length?base.attacks:[{name:"攻撃",skill:+base.attack||50,damage:"1d4+1",kind:"damage"}];let best=chooseBestAttack(attacks);return{name:base.name||"探索者",image:base.image||"",maxHp:+base.maxHp||10,hp:+base.maxHp||10,str:+base.str||50,dex:+base.dex||50,attacks,skills:{attack:+best.skill||50,dodge:+base.dodge||40,firstAid:+base.firstAid||30},state:{attackBonus:0,guard:false,spirit:0,rp:2,normalAttacks:0,nextApPenalty:0}}}
function getNum(v){let n=Number(v);return Number.isFinite(n)?n:null}
function damageExpected(expr){expr=String(expr||"").toLowerCase().replace(/\s/g,"");let total=0,found=false;for(let m of expr.matchAll(/(\d*)d(\d+)/g)){found=true;total+=(+(m[1]||1))*(+m[2]+1)/2}for(let m of expr.matchAll(/(?:^|[^\dd])([+-]?\d+)(?!d)/g))total+=+m[1];return found?total:0}
function chooseBestAttack(arr){let pool=arr.filter(a=>a.kind!=="grapple");if(!pool.length)pool=arr;return [...pool].sort((a,b)=>damageExpected(b.damage)-damageExpected(a.damage)||b.skill-a.skill)[0]||{name:"攻撃",skill:50,damage:"1d4+1",kind:"damage"}}
function rollDamageExpr(expr){let s=String(expr||"1d4+1").toLowerCase().replace(/\s/g,""),n=0;for(let m of s.matchAll(/(\d*)d(\d+)/g)){for(let i=0;i<+(m[1]||1);i++)n+=rollDice(+m[2])}let stripped=s.replace(/(\d*)d(\d+)/g,"");for(let m of stripped.matchAll(/[+-]?\d+/g))n+=+m[0];return Math.max(0,n)}
function parseCcf(data){
 const d=data?.data||data||{},params=[...(d.params||[]),...(d.status||[])],commands=String(d.commands||"");
 const find=(names,def)=>{for(const p of params){if(names.some(n=>String(p.label||"").toLowerCase().includes(n))){let x=getNum(p.value??p.max);if(x!==null)return x}}return def};
 const skill=(names,def)=>{for(const line of commands.split(/\r?\n/)){if(names.some(n=>line.includes(n))){let m=line.match(/(?:CCB|CC|1D100)\s*<=\s*(\d+)/i);if(m)return +m[1]}}return def};
 let attacks=[];
 for(const line of commands.split(/\r?\n/)){
   let sm=line.match(/(?:CCB|CC|1D100)\s*<=\s*(\d+)/i);if(!sm)continue;
   let name=(line.match(/【([^】]+)】/)||line.match(/(?:CCB|CC|1D100)\s*<=\s*\d+\s*([^（(]*)/i)||[])[1]?.trim()||"攻撃";
   if(/回避|応急手当/.test(name))continue;
   let dm=line.match(/(\d*d\d+(?:\s*[+-]\s*\d*d?\d*)*)/ig),damage=dm?.find(x=>!/1d100/i.test(x))||"";
   let grapple=/組み付き|組付き|組みつき/.test(name);
   if(damage||grapple)attacks.push({name,skill:+sm[1],damage:damage||"0",kind:grapple?"grapple":"damage"});
 }
 let hp=find(["hp","耐久"],10),str=find(["str","筋力"],50),dex=find(["dex","敏捷"],50);
 if(!attacks.length)attacks=[{name:"攻撃",skill:skill(["こぶし","格闘","近接戦闘","拳銃","攻撃"],50),damage:"1d4+1",kind:"damage"}];
 let best=chooseBestAttack(attacks);
 return{name:d.name||"探索者",image:d.image||"",maxHp:hp,str,dex,attack:best.skill,dodge:skill(["回避"],Math.floor(dex/2)),firstAid:skill(["応急手当"],30),attacks}
}