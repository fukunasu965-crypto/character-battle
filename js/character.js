function freshCharacter(base){return{name:base.name||"探索者",maxHp:+base.maxHp||10,hp:+base.maxHp||10,dex:+base.dex||50,skills:{attack:+base.attack||50,dodge:+base.dodge||40,firstAid:+base.firstAid||30},state:{attackBonus:0,guard:false,spirit:0,rp:2,normalAttacks:0}}}
function getNum(v){let n=Number(v);return Number.isFinite(n)?n:null}
function parseCcf(data){
 const d=data?.data||data||{},params=[...(d.params||[]),...(d.status||[])],commands=String(d.commands||"");
 const find=(names,def)=>{for(const p of params){if(names.some(n=>String(p.label||"").toLowerCase().includes(n))) {let x=getNum(p.value??p.max);if(x!==null)return x}}return def};
 const skill=(names,def)=>{for(const line of commands.split(/\r?\n/)){if(names.some(n=>line.includes(n))){let m=line.match(/(?:CCB|CC|1D100)\s*<=\s*(\d+)/i);if(m)return +m[1]}}return def};
 let hp=find(["hp","耐久"],10), dex=find(["dex","敏捷"],50);
 return{name:d.name||"探索者",maxHp:hp,dex,attack:skill(["こぶし","格闘","近接戦闘","拳銃","攻撃"],50),dodge:skill(["回避"],Math.floor(dex/2)),firstAid:skill(["応急手当"],30)}
}