
"use strict";
const $=id=>document.getElementById(id);
let imageData={p1:"",p2:""}, importedAttacks={p1:null,p2:null};
let p1=null,p2=null,chars=[],battle=null;

function toast(t){const x=$("toast");x.textContent=t;x.classList.add("show");setTimeout(()=>x.classList.remove("show"),1800)}
function num(id){return Number($(id).value)||0}
function bindImage(input,preview,key){
 const node=$(input); if(!node)return;
 node.addEventListener("change",()=>{const f=node.files?.[0];if(!f)return;const r=new FileReader();r.onload=()=>{imageData[key]=String(r.result);$(preview).innerHTML=`<img src="${r.result}">`};r.readAsDataURL(f)})
}
function read(side){
 const pre=side==="p1"?"char":"p2";
 const attacks=importedAttacks[side]||[{name:"攻撃",skill:num(pre+"-atk"),damage:$(pre+"-dmg").value||"1D4+1",kind:"damage"}];
 return {name:$(pre+"-name").value.trim()||side.toUpperCase(),maxHp:num(pre+"-hp")||10,str:num(pre+"-str")||10,dex:num(pre+"-dex")||10,
 attack:num(pre+"-atk")||50,dodge:num(pre+"-dodge")||40,firstAid:num(pre+"-aid")||30,image:imageData[side],attacks};
}
function apply(side,c){
 const pre=side==="p1"?"char":"p2", best=chooseBestAttack(c.attacks||[]);
 importedAttacks[side]=c.attacks||[];
 $(pre+"-name").value=c.name;$(pre+"-hp").value=c.maxHp;$(pre+"-str").value=c.str;$(pre+"-dex").value=c.dex;
 $(pre+"-atk").value=best.skill;$(pre+"-dmg").value=best.damage;$(pre+"-dodge").value=c.dodge;$(pre+"-aid").value=c.firstAid;
}
function preview(side,c){
 const best=chooseBestAttack(c.attacks||[]);
 $((side==="p1"?"my":"p2")+"-preview").textContent=`${c.name} ｜ HP ${c.maxHp} ｜ STR ${c.str} ｜ DEX ${c.dex} ｜ ${best.name} ${best.skill}% / ${best.damage} ｜ 回避 ${c.dodge}%`;
}
function save(side){
 const c=read(side); if(side==="p1"){p1=c;localStorage.setItem("cb-character",JSON.stringify(c))}else p2=c;
 preview(side,c);toast(`${side==="p1"?"PLAYER 1":"PLAYER 2"}を確定しました`);
}
function importJson(side){
 try{
  const raw=JSON.parse($(side==="p1"?"ccfolia-json":"p2-ccfolia-json").value);
  const c=parseCcf(raw),best=chooseBestAttack(c.attacks);
  apply(side,c);
  const out=$(side==="p1"?"import-result":"p2-import-result");
  out.textContent=`読み込み成功：${c.name} / 採用 ${best.name} ${best.skill}% / ${best.damage} / 期待値 ${attackExpectedValue(best).toFixed(2)}`;
  document.querySelector(`.p-tab[data-player="${side}"][data-tab="manual"]`)?.click();
 }catch(e){console.error(e);$(side==="p1"?"import-result":"p2-import-result").textContent=`JSON読込エラー：${e.message}`}
}
function selected(c){return chooseBestAttack(c.attacks)}
function atkSkill(c,type="normal"){let v=selected(c).skill+(c.state.attackBonus||0);if(type==="heavy")v-=15;if(type==="normal"&&c.state.normalAttacks>0)v-=15;if(c.state.spirit>=3)v+=10;return clamp(v)}
function dodgeSkill(c,observed=false){return clamp(c.skills.dodge+(c.state.guard?15:0)-(observed?15:0))}
function counterSkill(c){return clamp(c.skills.attack-20+(c.state.guard?15:0))}
function log(text,cls=""){battle.log.push({text,cls});render()}
function cur(){return chars[battle.turn]}
function foe(){return chars[1-battle.turn]}
function grapple(c){return (c.attacks||[]).find(a=>a.kind==="grapple")||null}
function fresh(base){
 const c=freshCharacter(base);c.state.rp=2;c.state.attackBonus=0;c.state.guard=false;c.state.spirit=0;c.state.normalAttacks=0;c.state.nextApPenalty=0;return c
}
function start(){
 try{
  save("p1");save("p2");chars=[fresh(p1),fresh(p2)];
  battle={turn:chars[0].dex>=chars[1].dex?0:1,round:1,ap:2,pending:null,gameOver:false,log:[]};
  $("lobby").classList.add("hidden");$("battle-screen").classList.remove("hidden");$("battle-screen").classList.add("active");
  battle.log.push({text:`戦闘開始！ ${cur().name}のターン。`,cls:"special"});render();
 }catch(e){console.error(e);toast("対戦開始エラー："+e.message)}
}
function animate(i,type){const w=$("portrait-wrap"+(i+1));if(!w)return;w.className=w.className.replace(/\banim-\S+/g,"").trim();void w.offsetWidth;w.classList.add("anim-"+type);setTimeout(()=>w.classList.remove("anim-"+type),800)}
function finishAction(){if(!battle.gameOver&&!battle.pending&&battle.ap<=0)endTurn();render()}
function endTurn(){battle.turn=1-battle.turn;if(battle.turn===0)battle.round++;const c=cur();battle.ap=Math.max(0,2-(c.state.nextApPenalty||0));c.state.nextApPenalty=0;c.state.rp=2;c.state.normalAttacks=0;battle.log.push({text:`--- ROUND ${battle.round} / ${c.name} ---`,cls:"special"})}
function checkEnd(){const i=chars.findIndex(c=>c.hp<=0);if(i>=0){battle.gameOver=true;battle.log.push({text:`${chars[i].name} 戦闘不能！`,cls:"damage"},{text:`🏆 ${chars[1-i].name} WIN！`,cls:"special"})}}
function rawDamage(p){let n=rollDamageExpr(p.weapon.damage);if(p.type==="heavy")n+=rollDice(4);if(p.result.type==="critical")n*=2;if(p.result.type==="oneCritical")n+=Math.ceil(damageExpected(p.weapon.damage));return n}
function deal(extra=0){
 const p=battle.pending,d=chars[p.defender],n0=rawDamage(p)+(p.spirit||0)+extra;let n=n0;
 if(d.state.guard){if(p.type==="heavy"){d.state.guard=false;battle.log.push({text:"💥 ガードブレイク！",cls:"special"})}else{n=Math.max(0,n-2);d.state.guard=false}}
 d.hp=Math.max(0,d.hp-n);animate(p.defender,"hit");battle.log.push({text:`${p.weapon.name} → ${n}ダメージ！`,cls:"damage"});checkEnd();
 if(p.type==="grapple"&&!battle.gameOver){const a=chars[p.attacker],target=clamp(50+(a.str-d.str)*5),r=rollD100(),z=judgeRoll(r,target);battle.log.push({text:`STR対抗 ${r}/${target} → ${z.text}`,cls:"special"});if(z.rank>=3){d.state.nextApPenalty=1;battle.log.push({text:`拘束成功：${d.name}の次ターンAP -1`,cls:"special"})}}
}
function attack(type){
 if(battle.pending||battle.gameOver)return;const c=cur(),cost=type==="heavy"?2:1;if(battle.ap<cost)return;
 const w=selected(c),skill=atkSkill(c,type),observed=c.state.attackBonus>0,spirit=c.state.spirit;c.state.attackBonus=0;c.state.spirit=0;if(type==="normal")c.state.normalAttacks++;battle.ap-=cost;animate(battle.turn,type==="heavy"?"heavy":"attack");
 const r=rollD100(),z=judgeRoll(r,skill);battle.log.push({text:`${w.name} ${r}/${skill} → ${z.text}`});
 if(z.type==="oneCritical")battle.ap=Math.min(2,battle.ap+1);if(z.type==="hundredFumble"){battle.ap=0;c.state.rp=0;return finishAction()}if(z.type==="fumble"){c.state.rp=Math.max(0,c.state.rp-1);return finishAction()}if(z.type==="failure")return finishAction();
 battle.pending={attacker:battle.turn,defender:1-battle.turn,type,result:z,observed,spirit,weapon:w};render();
}
function grappleAttack(){
 if(battle.pending||battle.gameOver||battle.ap<1)return;const c=cur(),w=grapple(c);if(!w)return;
 const skill=clamp(w.skill+c.state.attackBonus);const observed=c.state.attackBonus>0;c.state.attackBonus=0;battle.ap--;animate(battle.turn,"grapple");
 const r=rollD100(),z=judgeRoll(r,skill);battle.log.push({text:`${w.name} ${r}/${skill} → ${z.text}`});
 if(z.type==="oneCritical")battle.ap=Math.min(2,battle.ap+1);if(z.rank<3)return finishAction();
 battle.pending={attacker:battle.turn,defender:1-battle.turn,type:"grapple",result:z,observed,spirit:0,weapon:w};render();
}
function react(type){
 const p=battle.pending;if(!p||battle.gameOver)return;const d=chars[p.defender];
 if(type==="take"){if(p.type!=="heavy")d.state.spirit=Math.min(3,d.state.spirit+1);deal();battle.pending=null;return finishAction()}
 const cost=type==="dodge"?2:1;if(d.state.rp<cost)return;d.state.rp-=cost;
 const skill=type==="dodge"?dodgeSkill(d,p.observed):counterSkill(d),r=rollD100(),z=judgeRoll(r,skill);battle.log.push({text:`${type==="dodge"?"回避":"反撃"} ${r}/${skill} → ${z.text}`});
 if(z.type==="hundredFumble")deal(4);else if(z.type==="fumble")deal(2);else if(z.rank>=p.result.rank){animate(p.defender,type);if(type==="counter"&&z.rank>=3){const a=chars[p.attacker],n=rollDice(3);a.hp=Math.max(0,a.hp-n);battle.log.push({text:`反撃 ${n}ダメージ！`,cls:"damage"});checkEnd()}}else deal();
 battle.pending=null;finishAction();
}
function action(id){
 if(!battle||battle.gameOver)return;
 if(id==="attack"||id==="heavy")return attack(id);
 if(id==="grapple")return grappleAttack();
 if(id==="dodge"||id==="counter"||id==="take")return react(id);
 if(battle.pending)return;const c=cur();
 if(id==="guard"&&battle.ap>=1){c.state.guard=true;battle.ap--;battle.log.push({text:`${c.name}は防御態勢。`});finishAction()}
 if(id==="observe"&&battle.ap>=1){c.state.attackBonus=20;battle.ap--;battle.log.push({text:`${c.name}は観察。次の攻撃+20。`});finishAction()}
 if(id==="heal"&&battle.ap>=2){battle.ap-=2;const r=rollD100(),z=judgeRoll(r,c.skills.firstAid);let h=z.type==="oneCritical"?5:z.type==="critical"?rollDice(3)+2:z.type==="success"?rollDice(3):0;if(h)c.hp=Math.min(c.maxHp,c.hp+h);battle.log.push({text:`応急手当 ${r}/${c.skills.firstAid} → ${z.text}${h?` / HP+${h}`:""}`});finishAction()}
}
function stat(label,v){return `<div class="stat"><span>${label}</span><b>${v}</b></div>`}
function render(){
 if(!battle)return;
 chars.forEach((c,i)=>{const n=i+1;$("name"+n).textContent=c.name;$("hp"+n).textContent=`${c.hp} / ${c.maxHp}`;$("hpbar"+n).style.width=`${100*c.hp/c.maxHp}%`;$("stats"+n).innerHTML=stat("STR",c.str)+stat("DB",c.db||"0")+stat("攻撃",c.skills.attack)+stat("回避",c.skills.dodge);$("states"+n).innerHTML=`<span>RP ${c.state.rp}</span>${c.state.spirit?`<span>闘志 ${c.state.spirit}</span>`:""}${c.state.guard?"<span>防御</span>":""}`;const img=$("portrait"+n);if(c.image){img.src=c.image;img.style.display="block"}else img.style.display="none"});
 $("round").textContent=`ROUND ${battle.round}`;$("turn-name").textContent=battle.pending?"リアクション":`${cur().name}のターン`;$("ap").textContent="●".repeat(battle.ap)+"○".repeat(Math.max(0,2-battle.ap));
 const c=cur(),w=selected(c),g=grapple(c);$("attack-chance").textContent=`判定 ${atkSkill(c)}%`;$("attack-detail").textContent=`${w.name} ${w.skill}% / ${w.damage}`;$("heavy-chance").textContent=`判定 ${atkSkill(c,"heavy")}%`;$("heavy-detail").textContent=`${w.name} / ${w.damage}+1D4`;$("grapple-chance").textContent=g?`判定 ${g.skill}%`:"技能なし";$("grapple-detail").textContent=g?`${g.damage} / STR対抗`:"組み付きなし";$("heal-chance").textContent=`判定 ${c.skills.firstAid}%`;
 $("actions").classList.toggle("hidden",!!battle.pending);$("reactions").classList.toggle("hidden",!battle.pending);
 ["attack","heavy","grapple","guard","observe","heal"].forEach(id=>$(id).disabled=!!battle.pending||battle.gameOver);
 if(!battle.pending){$("attack").disabled||=battle.ap<1;$("heavy").disabled||=battle.ap<2;$("grapple").disabled||=battle.ap<1||!g;$("guard").disabled||=battle.ap<1;$("observe").disabled||=battle.ap<1;$("heal").disabled||=battle.ap<2}
 if(battle.pending){const d=chars[battle.pending.defender];$("dodge-detail").textContent=`判定 ${dodgeSkill(d,battle.pending.observed)}% / 2RP`;$("counter-detail").textContent=`判定 ${counterSkill(d)}% / 1RP`;$("dodge").disabled=d.state.rp<2;$("counter").disabled=d.state.rp<1;$("take").disabled=false}
 $("log").innerHTML=battle.log.map(x=>`<div class="${x.cls||""}">${String(x.text).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]))}</div>`).join("");$("log").scrollTop=$("log").scrollHeight;
}
document.querySelectorAll(".p-tab").forEach(btn=>btn.addEventListener("click",()=>{const pl=btn.dataset.player;document.querySelectorAll(`.p-tab[data-player="${pl}"]`).forEach(x=>x.classList.toggle("active",x===btn));$(pl+"-manual").classList.toggle("hidden",btn.dataset.tab!=="manual");$(pl+"-json").classList.toggle("hidden",btn.dataset.tab!=="json")}));
$("parse-json").addEventListener("click",()=>importJson("p1"));$("p2-parse-json").addEventListener("click",()=>importJson("p2"));$("save-char").addEventListener("click",()=>save("p1"));$("save-p2").addEventListener("click",()=>save("p2"));$("local-start").addEventListener("click",start);
["attack","heavy","grapple","guard","observe","heal","dodge","counter","take"].forEach(id=>$(id).addEventListener("click",()=>action(id)));
$("leave-btn").addEventListener("click",()=>location.reload());
$("host-btn").addEventListener("click",()=>toast("オンライン対戦は安定版で再実装予定です"));
$("join-btn").addEventListener("click",()=>toast("オンライン対戦は安定版で再実装予定です"));
$("copy-room").addEventListener("click",()=>{});
bindImage("char-image","char-image-preview","p1");bindImage("p2-image","p2-image-preview","p2");
try{const c=JSON.parse(localStorage.getItem("cb-character"));if(c){p1=c;apply("p1",c);preview("p1",c)}}catch(e){}
