
"use strict";
const $=id=>document.getElementById(id);
let imageData={p1:"",p2:""}, importedAttacks={p1:null,p2:null};
let p1=null,p2=null,chars=[],battle=null;
let netMode="local",myPlayerIndex=0,peer=null,conn=null,isHost=false,applyingNet=false,remoteIntent=false;

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
 const attacks=(base.attacks||[]).map(a=>({...a}));
 const best=chooseBestAttack(attacks);
 return {
   ...base,
   attacks,
   hp:base.maxHp,
   maxHp:base.maxHp,
   db:base.db||"0",
   skills:{
     attack:Number(base.attack ?? best.skill ?? 50),
     dodge:Number(base.dodge ?? 40),
     firstAid:Number(base.firstAid ?? 30)
   },
   state:{
     rp:2,
     attackBonus:0,
     guard:false,
     spirit:0,
     normalAttacks:0,
     nextApPenalty:0
   }
 };
}

function publicChar(c){return JSON.parse(JSON.stringify(c))}
function makeRoomCode(){return "cb-"+Math.random().toString(36).slice(2,8)}
function setOnlineStatus(text){const x=$("online-status");if(x)x.textContent=text}
function sendNet(type,payload={}){if(conn&&conn.open)conn.send({type,...payload})}
function syncState(){
 if(!isHost||!conn?.open||!battle)return;
 sendNet("state",{chars,battle});
}
function applyState(data){
 applyingNet=true;
 chars=data.chars;battle=data.battle;
 if(!$("lobby").classList.contains("hidden")){
   $("lobby").classList.add("hidden");$("battle-screen").classList.remove("hidden");$("battle-screen").classList.add("active");
 }
 render();applyingNet=false;
}
function setupConnection(c,hostSide){
 conn=c;isHost=hostSide;netMode="online";myPlayerIndex=hostSide?0:1;

 const onData=msg=>{
  try{
   if(msg.type==="request-character"&&!hostSide){
    save("p1");
    sendNet("character",{character:publicChar(p1)});
    setOnlineStatus("オンライン：自分のキャラクターを送信しました");
   }
   else if(msg.type==="character"&&hostSide){
    // Host already has P1; the joiner's local P1 becomes host-side P2.
    p2=msg.character;
    preview("p2",p2);
    chars=[fresh(p1),fresh(p2)];
    battle={
      turn:chars[0].dex>=chars[1].dex?0:1,
      round:1,ap:2,pending:null,gameOver:false,
      log:[{text:"オンライン対戦開始！",cls:"special"}]
    };
    $("lobby").classList.add("hidden");
    $("battle-screen").classList.remove("hidden");
    $("battle-screen").classList.add("active");
    setOnlineStatus("オンライン：キャラクター同期完了");
    render();
    syncState();
   }
   else if(msg.type==="state"&&!hostSide){
    applyState(msg);
   }
   else if(msg.type==="intent"&&hostSide){
    if(battle?.gameOver)return;
    const actor=battle.pending?battle.pending.defender:battle.turn;
    if(actor!==1)return;
    remoteIntent=true;
    try{ action(msg.action); }
    finally{ remoteIntent=false; }
    syncState();
   }
   else if(msg.type==="result"){
    showOnlineResult(msg.winnerIndex,myPlayerIndex);
   }
   else if(msg.type==="rematch-request"&&hostSide){
    startOnlineRematch();
   }
   else if(msg.type==="rematch"&&!hostSide){
    clearResult();
    $("rematch-btn").disabled=false;
    $("rematch-btn").textContent="再戦する";
    if(msg.chars&&msg.battle)applyState(msg);
   }
  }catch(e){console.error(e);toast("通信処理エラー："+e.message)}
 };
 conn.on("data",onData);
 conn.on("close",()=>setOnlineStatus("接続が切れました"));
 conn.on("error",e=>{console.error(e);setOnlineStatus("通信エラー："+(e.type||e.message||"不明"))});

 let initialized=false;
 const beginHandshake=()=>{
  if(initialized)return;
  initialized=true;
  setOnlineStatus(hostSide?"オンライン：対戦相手と接続済み／キャラクター要求中":"オンライン：接続済み／キャラクター送信中");
  if(hostSide){
   save("p1");
   sendNet("request-character");
  }else{
   save("p1");
   sendNet("character",{character:publicChar(p1)});
  }
 };
 if(conn.open)beginHandshake();
 else conn.on("open",beginHandshake);
}

function startOnlineRematch(){
 if(!isHost||!conn?.open)return;
 // Preserve the original combatants, but rebuild their battle state from full HP/RP/AP.
 const base1=chars[0]||p1, base2=chars[1]||p2;
 chars=[fresh(base1),fresh(base2)];
 battle={
  turn:chars[0].dex>=chars[1].dex?0:1,
  round:1,ap:2,pending:null,gameOver:false,
  log:[{text:"再戦開始！",cls:"special"}]
 };
 clearResult();
 $("battle-screen").classList.remove("hidden");
 $("battle-screen").classList.add("active");
 render();
 sendNet("rematch",{chars,battle});
 syncState();
}
function hostOnline(){
 try{
  const code=String($("host-code").value||"").replace(/\D/g,"").slice(0,4);
  if(code.length!==4)throw new Error("4桁の数字を入力してください");
  $("host-code").value=code;
  save("p1");
  if(typeof Peer!=="function")throw new Error("PeerJSが読み込まれていません");
  if(peer&&!peer.destroyed)peer.destroy();
  netMode="online";isHost=true;myPlayerIndex=0;
  $("room-box").classList.remove("hidden");$("room-display").textContent=code;
  setOnlineStatus("オンライン：部屋を作成中…");
  peer=new Peer("character-battle-"+code);
  peer.on("open",()=>setOnlineStatus("オンライン：部屋作成完了。相手を待っています"));
  peer.on("connection",c=>{
    setOnlineStatus("オンライン：相手から接続要求を受信…");
    setupConnection(c,true);
  });
  peer.on("error",e=>{
    console.error(e);
    setOnlineStatus(e?.type==="unavailable-id"?"その4桁コードは既に使用中です":"オンラインエラー："+(e?.type||e?.message||"不明"));
  });
 }catch(e){console.error(e);setOnlineStatus("部屋作成エラー："+e.message)}
}
function joinOnline(){
 try{
  const code=String($("join-code").value||"").replace(/\D/g,"").slice(0,4);
  if(code.length!==4)throw new Error("4桁の数字を入力してください");
  $("join-code").value=code;
  save("p1");
  if(typeof Peer!=="function")throw new Error("PeerJSが読み込まれていません");
  if(peer&&!peer.destroyed)peer.destroy();
  netMode="online";isHost=false;myPlayerIndex=1;
  setOnlineStatus("オンライン：接続中…");
  peer=new Peer();
  peer.on("open",()=>{
    const c=peer.connect("character-battle-"+code,{serialization:"json",reliable:true});
    setupConnection(c,false);
  });
  peer.on("error",e=>{console.error(e);setOnlineStatus("オンラインエラー："+(e?.type||e?.message||"不明"))});
 }catch(e){console.error(e);setOnlineStatus("参加エラー："+e.message)}
}
function canActHere(){
 if(netMode==="local")return true;
 if(!battle)return false;
 const actor=battle.pending?battle.pending.defender:battle.turn;
 return actor===myPlayerIndex;
}
function start(){
 try{
  netMode="local";isHost=false;myPlayerIndex=0;
  clearResult();
  save("p1");save("p2");
  if(!p1||!p2)throw new Error("PLAYER 1 / PLAYER 2 を確定してください");
  chars=[fresh(p1),fresh(p2)];
  battle={turn:chars[0].dex>=chars[1].dex?0:1,round:1,ap:2,pending:null,gameOver:false,log:[]};
  $("lobby").classList.add("hidden");$("battle-screen").classList.remove("hidden");$("battle-screen").classList.add("active");
  battle.log.push({text:`戦闘開始！ ${cur().name}のターン。`,cls:"special"});render();
 }catch(e){console.error(e);toast("対戦開始エラー："+e.message)}
}
function animate(i,type){const w=$("portrait-wrap"+(i+1));if(!w)return;w.className=w.className.replace(/\banim-\S+/g,"").trim();void w.offsetWidth;w.classList.add("anim-"+type);setTimeout(()=>w.classList.remove("anim-"+type),800)}
function finishAction(){if(!battle.gameOver&&!battle.pending&&battle.ap<=0)endTurn();render()}
function endTurn(){battle.turn=1-battle.turn;if(battle.turn===0)battle.round++;const c=cur();battle.ap=Math.max(0,2-(c.state.nextApPenalty||0));c.state.nextApPenalty=0;c.state.rp=2;c.state.normalAttacks=0;battle.log.push({text:`--- ROUND ${battle.round} / ${c.name} ---`,cls:"special"})}
function clearResult(){
 const ov=$("result-overlay");ov.classList.add("hidden");ov.classList.remove("result-win","result-lose");
 $("fighter1")?.classList.remove("is-winner","is-loser");$("fighter2")?.classList.remove("is-winner","is-loser");
}
function showResult(winnerIndex,loserIndex,viewerIndex=null){
 $("rematch-btn").style.display="";
 const ov=$("result-overlay");const didWin=viewerIndex===null||viewerIndex===winnerIndex;
 $("result-title").textContent=didWin?"VICTORY":"DEFEAT";
 $("result-winner").textContent=didWin?"🏆 "+chars[winnerIndex].name:chars[loserIndex].name+" は敗北した";
 $("result-loser").textContent=didWin?chars[loserIndex].name+" は戦闘不能":"勝者："+chars[winnerIndex].name;
 ov.classList.remove("result-win","result-lose");ov.classList.add(didWin?"result-win":"result-lose");
 $("fighter"+(winnerIndex+1))?.classList.add("is-winner");$("fighter"+(loserIndex+1))?.classList.add("is-loser");ov.classList.remove("hidden");
}
function showOnlineResult(winnerIndex,myPlayerIndex){
 showResult(winnerIndex,1-winnerIndex,myPlayerIndex);
 $("rematch-btn").style.display="";
 $("rematch-btn").textContent="再戦する";
}
function rematch(){
 clearResult();
 chars=[fresh(p1),fresh(p2)];
 battle={turn:chars[0].dex>=chars[1].dex?0:1,round:1,ap:2,pending:null,gameOver:false,log:[]};
 battle.log.push({text:"再戦開始！ "+cur().name+"のターン。",cls:"special"});
 render();
}
function checkEnd(){
 const loserIndex=chars.findIndex(c=>c.hp<=0);
 if(loserIndex>=0&&!battle.gameOver){
  const winnerIndex=1-loserIndex;
  battle.gameOver=true;
  battle.log.push({text:chars[loserIndex].name+" 戦闘不能！",cls:"damage"});
  battle.log.push({text:"🏆 "+chars[winnerIndex].name+" WIN！",cls:"special"});
  if(netMode==="online"){
   if(isHost)sendNet("result",{winnerIndex,loserIndex});
   setTimeout(()=>showOnlineResult(winnerIndex,myPlayerIndex),220);
  }else{
   setTimeout(()=>showResult(winnerIndex,loserIndex),220);
  }
  window.dispatchEvent(new CustomEvent("character-battle-result",{detail:{winnerIndex,loserIndex}}));
 }
}
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
 if(netMode==="online"&&!remoteIntent&&!canActHere())return;
 if(netMode==="online"&&!isHost){sendNet("intent",{action:id});return;}
 if(id==="attack"||id==="heavy")return attack(id);
 if(id==="grapple")return grappleAttack();
 if(id==="dodge"||id==="counter"||id==="take")return react(id);
 if(battle.pending)return;const c=cur();
 if(id==="guard"&&battle.ap>=1){c.state.guard=true;battle.ap--;battle.log.push({text:`${c.name}は防御態勢。`});finishAction()}
 if(id==="observe"&&battle.ap>=1){c.state.attackBonus=20;battle.ap--;battle.log.push({text:`${c.name}は観察。次の攻撃+20。`});finishAction()}
 if(id==="heal"&&battle.ap>=2){battle.ap-=2;const r=rollD100(),z=judgeRoll(r,c.skills.firstAid);let h=z.type==="oneCritical"?5:z.type==="critical"?rollDice(3)+2:z.type==="success"?rollDice(3):0;if(h)c.hp=Math.min(c.maxHp,c.hp+h);battle.log.push({text:`応急手当 ${r}/${c.skills.firstAid} → ${z.text}${h?` / HP+${h}`:""}`});finishAction()}
 if(netMode==="online"&&isHost&&!applyingNet)syncState();
}
function stat(label,v){return `<div class="stat"><span>${label}</span><b>${v}</b></div>`}
function render(){
 if(!battle)return;
 if(netMode==="online"&&isHost&&!applyingNet&&conn?.open){
   clearTimeout(render._syncTimer);
   render._syncTimer=setTimeout(syncState,0);
 }
 chars.forEach((c,i)=>{const n=i+1;$("name"+n).textContent=c.name;$("hp"+n).textContent=`${c.hp} / ${c.maxHp}`;$("hpbar"+n).style.width=`${100*c.hp/c.maxHp}%`;$("stats"+n).innerHTML=stat("STR",c.str)+stat("DB",c.db||"0")+stat("攻撃",c.skills.attack)+stat("回避",c.skills.dodge);$("states"+n).innerHTML=`<span>RP ${c.state.rp}</span>${c.state.spirit?`<span>闘志 ${c.state.spirit}</span>`:""}${c.state.guard?"<span>防御</span>":""}`;const img=$("portrait"+n);if(c.image){img.src=c.image;img.style.display="block"}else img.style.display="none"});
 $("round").textContent=`ROUND ${battle.round}`;$("turn-name").textContent=battle.pending?"リアクション":`${cur().name}のターン`;$("ap").textContent="●".repeat(battle.ap)+"○".repeat(Math.max(0,2-battle.ap));
 const c=cur(),w=selected(c),g=grapple(c);$("attack-chance").textContent=`判定 ${atkSkill(c)}%`;$("attack-detail").textContent=`${w.name} ${w.skill}% / ${w.damage}`;$("heavy-chance").textContent=`判定 ${atkSkill(c,"heavy")}%`;$("heavy-detail").textContent=`${w.name} / ${w.damage}+1D4`;$("grapple-chance").textContent=g?`判定 ${g.skill}%`:"技能なし";$("grapple-detail").textContent=g?`${g.damage} / STR対抗`:"組み付きなし";$("heal-chance").textContent=`判定 ${c.skills.firstAid}%`;
 $("actions").classList.toggle("hidden",!!battle.pending);$("reactions").classList.toggle("hidden",!battle.pending);
 ["attack","heavy","grapple","guard","observe","heal"].forEach(id=>$(id).disabled=!!battle.pending||battle.gameOver||!canActHere());
 if(!battle.pending){$("attack").disabled||=battle.ap<1;$("heavy").disabled||=battle.ap<2;$("grapple").disabled||=battle.ap<1||!g;$("guard").disabled||=battle.ap<1;$("observe").disabled||=battle.ap<1;$("heal").disabled||=battle.ap<2}
 if(battle.pending){const d=chars[battle.pending.defender];$("dodge-detail").textContent=`判定 ${dodgeSkill(d,battle.pending.observed)}% / 2RP`;$("counter-detail").textContent=`判定 ${counterSkill(d)}% / 1RP`;$("dodge").disabled=d.state.rp<2||!canActHere();$("counter").disabled=d.state.rp<1||!canActHere();$("take").disabled=!canActHere()}
 $("log").innerHTML=battle.log.map(x=>`<div class="${x.cls||""}">${String(x.text).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]))}</div>`).join("");$("log").scrollTop=$("log").scrollHeight;
}
document.querySelectorAll(".p-tab").forEach(btn=>btn.addEventListener("click",()=>{const pl=btn.dataset.player;document.querySelectorAll(`.p-tab[data-player="${pl}"]`).forEach(x=>x.classList.toggle("active",x===btn));$(pl+"-manual").classList.toggle("hidden",btn.dataset.tab!=="manual");$(pl+"-json").classList.toggle("hidden",btn.dataset.tab!=="json")}));
$("parse-json").addEventListener("click",()=>importJson("p1"));$("p2-parse-json").addEventListener("click",()=>importJson("p2"));$("save-char").addEventListener("click",()=>save("p1"));$("save-p2").addEventListener("click",()=>save("p2"));$("local-start").addEventListener("click",start);
$("host-code").addEventListener("input",e=>e.target.value=String(e.target.value||"").replace(/\D/g,"").slice(0,4));
$("join-code").addEventListener("input",e=>e.target.value=String(e.target.value||"").replace(/\D/g,"").slice(0,4));
$("host-btn").addEventListener("click",hostOnline);
$("join-btn").addEventListener("click",joinOnline);
setOnlineStatus("オンライン：操作できます / BUILD 2.17");
["attack","heavy","grapple","guard","observe","heal","dodge","counter","take"].forEach(id=>$(id).addEventListener("click",()=>action(id)));
$("leave-btn").addEventListener("click",()=>location.reload());
$("rematch-btn").addEventListener("click",()=>{
 if(netMode==="online"){
  if(isHost){
   startOnlineRematch();
  }else{
   sendNet("rematch-request");
   $("rematch-btn").disabled=true;
   $("rematch-btn").textContent="再戦をリクエスト中…";
   toast("再戦をリクエストしました");
  }
 }else{
  rematch();
 }
});
$("result-lobby-btn").addEventListener("click",()=>{
 clearResult();
 if(conn){try{conn.close()}catch(e){}}
 if(peer){try{peer.destroy()}catch(e){}}
 conn=null;peer=null;netMode="local";isHost=false;myPlayerIndex=0;
 battle=null;chars=[];
 $("battle-screen").classList.add("hidden");$("battle-screen").classList.remove("active");
 $("lobby").classList.remove("hidden");$("room-box").classList.add("hidden");$("room-display").textContent="";
 setOnlineStatus("オンライン：操作できます / BUILD 2.17");
 window.scrollTo({top:0,behavior:"smooth"});
});


$("copy-room").addEventListener("click",()=>toast("ルームコード："+$("room-display").textContent));
bindImage("char-image","char-image-preview","p1");bindImage("p2-image","p2-image-preview","p2");
try{const c=JSON.parse(localStorage.getItem("cb-character"));if(c){p1=c;apply("p1",c);preview("p1",c)}}catch(e){}

