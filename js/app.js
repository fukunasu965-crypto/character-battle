
"use strict";
const $=id=>document.getElementById(id);
let imageData={p1:"",p2:""}, importedAttacks={p1:null,p2:null}, importedStats={p1:null,p2:null};
let p1=null,p2=null,chars=[],battle=null;
let netMode="local",myPlayerIndex=0,peer=null,conn=null,isHost=false,applyingNet=false,remoteIntent=false,comMode=false,comThinking=false;

function toast(t){const x=$("toast");if(!x){console.log(t);return}x.textContent=t;x.classList.add("show");setTimeout(()=>x.classList.remove("show"),1800)}
function num(id){return Number($(id).value)||0}
function bindImage(input,preview,key){
 const node=$(input); if(!node)return;
 node.addEventListener("change",()=>{const f=node.files?.[0];if(!f)return;const r=new FileReader();r.onload=()=>{imageData[key]=String(r.result);$(preview).innerHTML=`<img src="${r.result}">`};r.readAsDataURL(f)})
}
function read(side){
 const pre=side==="p1"?"char":"p2";
 const attacks=importedAttacks[side]||[{name:"攻撃",skill:num(pre+"-atk"),damage:$(pre+"-dmg").value||"1D4+1",kind:"damage"}];
 const st=importedStats[side]||{};
 return {name:$(pre+"-name").value.trim()||side.toUpperCase(),maxHp:num(pre+"-hp")||10,maxMp:Number(st.maxMp??10),mp:Number(st.maxMp??10),str:num(pre+"-str")||10,dex:num(pre+"-dex")||10,app:Number(st.app??10),pow:Number(st.pow??10),int:Number(st.int??10),db:st.db||"0",
 attack:num(pre+"-atk")||50,dodge:num(pre+"-dodge")||40,firstAid:num(pre+"-aid")||30,image:imageData[side]||st.image||"",attacks};
}
function apply(side,c){
 const pre=side==="p1"?"char":"p2", best=chooseBestAttack(c.attacks||[]);
 importedAttacks[side]=c.attacks||[];
 importedStats[side]={maxMp:Number(c.maxMp??10),app:Number(c.app??10),pow:Number(c.pow??10),int:Number(c.int??10),db:c.db||"0",image:c.image||""};
 if(c.image&&!imageData[side])imageData[side]=c.image;
 $(pre+"-name").value=c.name;$(pre+"-hp").value=c.maxHp;$(pre+"-str").value=c.str;$(pre+"-dex").value=c.dex;
 $(pre+"-atk").value=best.skill;$(pre+"-dmg").value=best.damage;$(pre+"-dodge").value=c.dodge;$(pre+"-aid").value=c.firstAid;
}
function preview(side,c){
 const best=chooseBestAttack(c.attacks||[]);
 $((side==="p1"?"my":"p2")+"-preview").textContent=`${c.name} ｜ HP ${c.maxHp} / MP ${c.maxMp??10} ｜ STR ${c.str} ｜ DEX ${c.dex} ｜ APP ${c.app??10} ｜ POW ${c.pow??10} ｜ INT ${c.int??10} ｜ ${best.name} ${best.skill}% / ${best.damage} ｜ 回避 ${c.dodge}%`;
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
function activePenalty(c){return 0}
function atkSkill(c,type="normal"){let v=selected(c).skill+(c.state.attackBonus||0);if(type==="heavy")v-=5;if(c.state.spirit>=3)v+=10;return clamp(v)}
function counterSkill(c){return clamp(c.skills.attack-10)}
function specialSkill(c,key){return clamp((Number(c[key])||10)*5)}
function dodgeSkill(c,observed=false){
 const penalty=typeof observed==="number"?observed:(observed?15:0);
 return clamp(c.skills.dodge-penalty);
}
function log(text,cls=""){battle.log.push({text,cls});render()}
function cur(){return chars[battle.turn]}
function applyRollAp(c,z,label="判定"){
 let delta=0;
 if(z.type==="oneCritical")delta=2;
 else if(z.type==="critical")delta=1;
 else if(z.type==="hundredFumble")delta=-2;
 else if(z.type==="fumble")delta=-1;
 if(delta){
  c.state.ap+=delta;
  battle.log.push({text:`${delta>0?"⚡":"💸"} ${label}の${z.text}：AP ${delta>0?"+":""}${delta} → ${c.state.ap}`,cls:"special"});
 }
}
function rollJudgeAp(c,skill,label){
 const r=rollD100(),z=judgeRoll(r,skill);
 applyRollAp(c,z,label);
 return {r,z};
}
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
   maxMp:Number(base.maxMp??base.mp??10),
   mp:Number(base.maxMp??base.mp??10),
   app:Number(base.app??10),pow:Number(base.pow??10),int:Number(base.int??10),
   db:base.db||"0",
   skills:{
     attack:Number(base.attack ?? best.skill ?? 50),
     dodge:Number(base.dodge ?? 40),
     firstAid:Number(base.firstAid ?? 30)
   },
   state:{
     ap:2,
     attackBonus:0,analyzedDodgePenalty:0,
     taunted:false,tauntPenalty:10,
     intimidated:false,
     guard:false,
     spirit:0,
     normalAttacks:0,
     nextApPenalty:0,firstTurnDone:false
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
      round:1,pending:null,gameOver:false,
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
 if(netMode==="local"){
  if(comMode&&battle){
   const actor=battle.pending?battle.pending.defender:battle.turn;
   return actor===0;
  }
  return true;
 }
 if(!battle)return false;
 const actor=battle.pending?battle.pending.defender:battle.turn;
 return actor===myPlayerIndex;
}
function start(){
 try{
  comMode=false;comThinking=false;
  netMode="local";isHost=false;myPlayerIndex=0;
  clearResult();
  save("p1");save("p2");
  if(!p1||!p2)throw new Error("PLAYER 1 / PLAYER 2 を確定してください");
  chars=[fresh(p1),fresh(p2)];
  battle={turn:chars[0].dex>=chars[1].dex?0:1,round:1,pending:null,gameOver:false,log:[]};
  $("lobby").classList.add("hidden");$("battle-screen").classList.remove("hidden");$("battle-screen").classList.add("active");
  battle.log.push({text:`戦闘開始！ ${cur().name}のターン。`,cls:"special"});startBattleBgm();recoverTurnStart();render();
 }catch(e){console.error(e);toast("対戦開始エラー："+e.message)}
}

function startCom(){
 try{
  netMode="local";isHost=false;myPlayerIndex=0;comMode=true;comThinking=false;
  clearResult();save("p1");save("p2");
  if(!p1||!p2)throw new Error("PLAYER 1 / PLAYER 2 を確定してください");
  chars=[fresh(p1),fresh(p2)];
  battle={turn:chars[0].dex>=chars[1].dex?0:1,round:1,pending:null,gameOver:false,log:[]};
  $("lobby").classList.add("hidden");$("battle-screen").classList.remove("hidden");$("battle-screen").classList.add("active");
  battle.log.push({text:`COM対戦開始！ ${cur().name}のターン。`,cls:"special"});startBattleBgm();recoverTurnStart();render();scheduleCom();
 }catch(e){console.error(e);toast("COM対戦開始エラー："+e.message)}
}
function comIsActor(){
 if(!comMode||!battle||battle.gameOver)return false;
 return (battle.pending?battle.pending.defender:battle.turn)===1;
}
function scheduleCom(){
 if(!battle||!comMode||battle.gameOver)return;
 const needsReaction=!!battle.pending&&battle.pending.defender===1;
 const needsAction=!battle.pending&&battle.turn===1;
 if(needsReaction||needsAction)comStep();
}
function comStep(){
 if(!battle||!comMode||battle.gameOver)return;
 clearTimeout(comStep._timer);
 comStep._timer=setTimeout(()=>{
  if(!battle||!comMode||battle.gameOver)return;
  const c=chars[1],t=chars[0];

  /* COM defender: pending reaction must be resolved even though battle.turn is P1. */
  if(battle.pending && battle.pending.defender===1){
   if(c.state.ap>=1&&(c.hp<=Math.ceil(c.maxHp*.55)||c.skills.dodge>=55))return react("dodge");
   if(c.state.ap>=2&&c.skills.attack>=65&&c.hp>Math.ceil(c.maxHp*.35))return react("counter");
   return react("take");
  }

  /* COM only chooses an active action on its own turn. */
  if(battle.pending||battle.turn!==1)return;
  const ap=c.state.ap,hpRate=c.hp/c.maxHp,targetHp=t.hp/t.maxHp;
  const canIntimidate=c.mp>=2&&!t.state.intimidated,canTaunt=!t.state.taunted;

  if(c.state.taunted){
   if(ap>=2&&(targetHp<=.45||Math.random()<.60))return action("heavy");
   if(ap>=1)return action("attack");
   c.state.taunted=false;log("COMは攻撃できず、挑発状態が解除された。");return action("analyze");
  }
  if(ap>=2&&hpRate<=.50&&c.hp<c.maxHp&&Math.random()<.82)return action("heal");
  if(canIntimidate&&(t.state.ap>=1||t.skills.attack>=55)&&Math.random()<.42)return action("intimidate");
  if(canTaunt&&ap<=1&&Math.random()<.30)return action("taunt");
  if(!c.state.attackBonus&&(t.skills.dodge>=45||c.skills.attack<65)&&Math.random()<.38)return action("analyze");
  if(ap>=1&&grapple(c)&&grapple(c).skill>=50&&c.str>=t.str&&!t.state.nextApPenalty&&Math.random()<.38)return action("grapple");
  if(canIntimidate&&Math.random()<.28)return action("intimidate");
  if(canTaunt&&Math.random()<.24)return action("taunt");
  if(ap>=2&&(c.state.attackBonus||targetHp<=.5||ap>=3)&&Math.random()<.82)return action("heavy");
  if(ap>=1)return action("attack");
  if(canIntimidate)return action("intimidate");
  if(canTaunt)return action("taunt");
  return action("analyze");
 },450);
}
function animate(i,type){const w=$("portrait-wrap"+(i+1));if(!w)return;w.className=w.className.replace(/\banim-\S+/g,"").trim();void w.offsetWidth;w.classList.add("anim-"+type);setTimeout(()=>w.classList.remove("anim-"+type),800)}
function finishAction(){if(!battle.gameOver&&!battle.pending)endTurn();render()}
function recoverTurnStart(){
 const c=cur();
 let apGain=0;
 if(c.state.firstTurnDone){
   apGain=1;
   if(c.state.nextApPenalty){
     apGain=0;
     c.state.nextApPenalty=0;
     battle.log.push({text:`💫 ${c.name}はAP回復を阻害された。`,cls:"special"});
   }
 }
 c.state.ap=(c.state.ap||0)+apGain;
 c.state.normalAttacks=0;
 if(apGain>0)battle.log.push({text:`--- ${c.name}のターン開始 / AP +${apGain} ---`,cls:"special"});
}
function endTurn(){
 cur().state.firstTurnDone=true;
 battle.turn=1-battle.turn;
 if(battle.turn===0)battle.round++;
 recoverTurnStart();
}
function clearResult(){
 const ov=$("result-overlay");ov.classList.add("hidden");ov.classList.remove("result-win","result-lose");
 $("fighter1")?.classList.remove("is-winner","is-loser");$("fighter2")?.classList.remove("is-winner","is-loser");
}
function showResult(winnerIndex,loserIndex,viewerIndex=null){
 
 const ov=$("result-overlay");const didWin=viewerIndex===null||viewerIndex===winnerIndex;
 $("result-title").textContent=didWin?"VICTORY":"DEFEAT";
 $("result-winner").textContent=didWin?"🏆 "+chars[winnerIndex].name:chars[loserIndex].name+" は敗北した";
 $("result-loser").textContent=didWin?chars[loserIndex].name+" は戦闘不能":"勝者："+chars[winnerIndex].name;
 ov.classList.remove("result-win","result-lose");ov.classList.add(didWin?"result-win":"result-lose");
 $("fighter"+(winnerIndex+1))?.classList.add("is-winner");$("fighter"+(loserIndex+1))?.classList.add("is-loser");ov.classList.remove("hidden");
}
function showOnlineResult(winnerIndex,myPlayerIndex){
 
 showResult(winnerIndex,1-winnerIndex,myPlayerIndex);
}
function rematch(){
 clearResult();
 chars=[fresh(p1),fresh(p2)];
 battle={turn:chars[0].dex>=chars[1].dex?0:1,round:1,pending:null,gameOver:false,log:[]};
 battle.log.push({text:"再戦開始！ "+cur().name+"のターン。",cls:"special"});
 render();
}

function showBattleImpact(title,sub="",duration=900){
 let el=document.getElementById("battle-impact");
 if(!el){
  el=document.createElement("div");el.id="battle-impact";el.className="battle-impact hidden";
  el.innerHTML='<div class="battle-impact-title"></div><div class="battle-impact-sub"></div>';
  document.body.appendChild(el);
 }
 el.querySelector(".battle-impact-title").textContent=title;
 el.querySelector(".battle-impact-sub").textContent=sub;
 el.classList.remove("hidden");void el.offsetWidth;el.classList.add("show");
 setTimeout(()=>{el.classList.remove("show");setTimeout(()=>el.classList.add("hidden"),180)},duration);
}
function checkEnd(){
 const loserIndex=chars.findIndex(c=>c.hp<=0);
 if(loserIndex>=0&&!battle.gameOver){
  const winnerIndex=1-loserIndex;
  battle.gameOver=true;
  battle.log.push({text:chars[loserIndex].name+" 戦闘不能！",cls:"damage"});
  showBattleImpact("K.O.",chars[loserIndex].name+" 戦闘不能",1750);
  battle.log.push({text:"🏆 "+chars[winnerIndex].name+" WIN！",cls:"special"});
  if(netMode==="online"){
   if(isHost)sendNet("result",{winnerIndex,loserIndex});
   setTimeout(()=>showOnlineResult(winnerIndex,myPlayerIndex),1850);
  }else{
   setTimeout(()=>showResult(winnerIndex,loserIndex),1850);
  }
  window.dispatchEvent(new CustomEvent("character-battle-result",{detail:{winnerIndex,loserIndex}}));
 }
}




let bgmEnabled=false;
const battleBgm=new Audio("audio/battle.mp3");
battleBgm.loop=true;
battleBgm.volume=0.05;
battleBgm.preload="auto";
battleBgm.addEventListener("error",()=>console.error("BGM load error: audio/battle.mp3 が見つからないか再生できません。"));

// v2.38: ダイスが転がる演出は使わず、出目と成否だけを短く表示する
let rollResultFxToken=0;
function showDiceFx(roll,target,z,label="1D100",onDone=null){
 const box=$("roll-result-fx");
 if(!box){if(typeof onDone==="function")onDone();return}
 const token=++rollResultFxToken;
 $("roll-result-label").textContent=label;
 $("roll-result-number").textContent=String(roll);
 $("roll-result-target").textContent=target!=null?String(target):"—";
 $("roll-result-status").textContent=z.text;
 box.className="roll-result-fx";
 if(z.rank>=4)box.classList.add("critical");
 else if(z.rank<=1)box.classList.add("fumble");
 else if(z.rank>=3)box.classList.add("success");
 else box.classList.add("failure");
 void box.offsetWidth;
 box.classList.add("show");
 setTimeout(()=>{
  if(token!==rollResultFxToken)return;
  box.classList.remove("show");
  setTimeout(()=>{
   if(token!==rollResultFxToken)return;
   box.classList.add("hidden");
   if(typeof onDone==="function")onDone();
  },160);
 },780);
}

function startBattleBgm(){
 if(!bgmEnabled)return;
 battleBgm.volume=0.05;
 const playNow=()=>battleBgm.play().catch(err=>console.warn("BGM play failed:",err));
 if(battleBgm.readyState>=2)playNow();
 else battleBgm.addEventListener("canplay",playNow,{once:true});
}
function resetBattleBgm(){
 battleBgm.pause();
 battleBgm.currentTime=0;
}
const battleFlavor={
 attack:[
  "{A}が間合いを詰め、{W}を鋭く繰り出す！",
  "{A}は一瞬の隙を突き、{W}で攻め込む！",
  "{A}の{W}が{D}を捉えようと迫る！",
  "{A}が踏み込み、迷いなく{W}を放つ！"
 ],
 heavy:[
  "{A}が全身の力を乗せ、{W}を叩き込もうとする！",
  "{A}は大きく踏み込み、渾身の{W}を放つ！",
  "{A}の重い一撃が、{D}へ唸りを上げて迫る！"
 ],
 grapple:[
  "{A}が一気に距離を詰め、{D}を捕らえにかかる！",
  "{A}が腕を伸ばし、{D}の動きを封じようとする！",
  "{A}は体勢を低くし、組みつきを仕掛ける！"
 ],
 hit:[
  "{W}がまともに入った！ {D}の体が大きく揺れる。",
  "一撃が{D}を捉える。衝撃が走った！",
  "{D}は攻撃を受け、思わず体勢を崩す！"
 ],
 dodge:[
  "{D}は紙一重で攻撃線から身をかわした！",
  "{D}が素早く身を翻し、一撃を空振りさせる！",
  "寸前！ {D}は攻撃を見切って回避した。"
 ],
 counter:[
  "{D}は攻撃の隙を逃さず、即座に切り返す！",
  "{D}が攻撃をいなし、そのまま反撃へ転じる！",
  "攻守逆転！ {D}の反撃が{A}へ襲いかかる！"
 ]
};
function flavor(kind,p){
 const a=battleFlavor[kind]||[]; if(!a.length)return;
 const t=a[Math.floor(Math.random()*a.length)];
 const A=p?.attacker!=null?chars[p.attacker]?.name:(cur()?.name||"");
 const D=p?.defender!=null?chars[p.defender]?.name:"";
 const W=p?.weapon?.name||"攻撃";
 battle.log.push({text:"◆ "+t.replaceAll("{A}",A).replaceAll("{D}",D).replaceAll("{W}",W),cls:"flavor"});
}
function rollEffect(z,who,context="攻撃"){
 if(z.type==="oneCritical")return `🌟 ${who}の1クリ！ ${context}が極めて鮮やかに決まり、APを1回復。`;
 if(z.type==="critical")return `✨ ${who}のクリティカル！ ${context}のダメージが2倍になる。`;
 if(z.type==="hundredFumble")return `☠ ${who}の100ファンブル！ この行動は失敗。`;
 if(z.type==="fumble")return `💀 ${who}のファンブル！ この行動は失敗。`;
 return "";
}
function rawDamage(p){const crit=p.result.type==="critical"||p.result.type==="oneCritical";let n=crit?maxDamageExpr(p.weapon.damage):rollDamageExpr(p.weapon.damage);if(p.type==="heavy")n+=crit?4:rollDice(4);return n}

const stunFlavor=[
 "{D}は強烈な衝撃によろめく。意識が一瞬遠のいた！",
 "{D}の視界が揺らぐ。大きな一撃が意識を刈り取りにかかる！",
 "{D}は膝をつきかける。ここで踏みとどまれるか！",
 "{D}に重い衝撃が走る。身体が言うことを聞かない！"
];
function checkStun(defenderIndex,hpBefore,damage){
 const d=chars[defenderIndex];
 if(!d||d.hp<=0||damage<=0)return;
 // "現HP" means HP immediately before this damage was applied.
 if(damage < hpBefore/2)return;
 const con=clamp((d.con||0)*5),r=rollD100(),z=judgeRoll(r,con);showDiceFx(r,con,z,"CON CHECK");
 const text=stunFlavor[Math.floor(Math.random()*stunFlavor.length)].replaceAll("{D}",d.name);
 battle.log.push({text:"◆ "+text,cls:"flavor"});
 battle.log.push({text:`気絶ロール CON×5 ${r}/${con} → ${z.text}`,cls:"special"});
 if(z.rank<3){
  d.state.nextApPenalty=Math.max(d.state.nextApPenalty||0,1);
  battle.log.push({text:`💫 ${d.name}は衝撃に耐えきれない！ 次のターンAP -1。`,cls:"special"});
  animate(defenderIndex,"hit");
 }else{
  battle.log.push({text:`✓ ${d.name}は意識を保った！ AP減少なし。`,cls:"special"});
 }
}
function reduceIntimidatedDamage(d,n){
 if(!d.state.intimidated||n<=0)return n;
 const rate=Number(d.state.intimidated);
 const reduced=Math.ceil(n*(rate===0.25?0.25:0.5));
 battle.log.push({text:`🛡 威圧の効果！ ${n} → ${reduced}ダメージ`,cls:"special"});
 d.state.intimidated=false;
 return reduced;
}
function deal(extra=0){
 const p=battle.pending,d=chars[p.defender];

 // 組みつきは命中しただけではダメージなし。
 // STR対抗に成功した場合のみダメージ＋次ターンAP-1。
 if(p.type==="grapple"){
  const a=chars[p.attacker],isCrit=p.result.type==="critical"||p.result.type==="oneCritical";
  if(isCrit){
   battle.log.push({text:`✨ 組みつきクリティカル！ STR対抗を免除して拘束成功！`,cls:"special"});
  }else{
   const target=clamp(50+(a.str-d.str)*5),r=rollD100(),z=judgeRoll(r,target);showDiceFx(r,target,z,"STR CONTEST");
   battle.log.push({text:`STR対抗 ${r}/${target} → ${z.text}`,cls:"special"});
   if(z.rank<3){
    battle.log.push({text:`${d.name}は拘束を振りほどいた！ ダメージなし。`,cls:"special"});
    return;
   }
  }
  let n=rawDamage(p)+(p.spirit||0)+(p.tauntDamage||0)+extra;n=reduceIntimidatedDamage(d,n);
  if(d.state.guard){n=Math.max(0,n-2);d.state.guard=false}
  const hpBefore=d.hp;
  d.hp=Math.max(0,d.hp-n);
  d.state.nextApPenalty=1;
  animate(p.defender,"hit");flavor("hit",p);
  battle.log.push({text:`拘束成功！ ${p.weapon.name} → ${n}ダメージ / ${d.name}の次ターンAP -1`,cls:"damage"});
  checkStun(p.defender,hpBefore,n);
  checkEnd();
  return;
 }

 const n0=rawDamage(p)+(p.spirit||0)+(p.tauntDamage||0)+extra;let n=reduceIntimidatedDamage(d,n0);
 if(d.state.guard){if(p.type==="heavy"){d.state.guard=false;battle.log.push({text:"💥 ガードブレイク！",cls:"special"})}else{n=Math.max(0,n-2);d.state.guard=false}}
 const hpBefore=d.hp;d.hp=Math.max(0,d.hp-n);animate(p.defender,"hit");flavor("hit",p);battle.log.push({text:`${p.weapon.name} → ${n}ダメージ！`,cls:"damage"});checkStun(p.defender,hpBefore,n);checkEnd();
}
function attack(type){
 if(battle.pending||battle.gameOver)return;const c=cur(),cost=type==="heavy"?2:1;if(c.state.ap<cost)return;
 const taunted=!!c.state.taunted,tauntPenalty=taunted?(c.state.tauntPenalty||10):0;if(taunted){c.state.taunted=false;c.state.tauntPenalty=10}
 const w=selected(c),skill=clamp(atkSkill(c,type)-activePenalty(c)-tauntPenalty),observed=c.state.attackBonus>0?(c.state.analyzedDodgePenalty||15):false,spirit=c.state.spirit;c.state.attackBonus=0;c.state.analyzedDodgePenalty=0;c.state.spirit=0;if(type==="normal")c.state.normalAttacks++;c.state.ap-=cost;
 flavor(type==="heavy"?"heavy":"attack",{attacker:battle.turn,defender:1-battle.turn,weapon:w});
 const r=rollD100(),z=judgeRoll(r,skill);showDiceFx(r,skill,z,w.name,()=>animate(battle.turn,type==="heavy"?"heavy":"attack"));battle.log.push({text:`${w.name} ${r}/${skill} → ${z.text}`});const fx=rollEffect(z,c.name,"攻撃");if(fx)battle.log.push({text:fx,cls:"special"});applyRollAp(c,z,"攻撃");
 if(z.type==="hundredFumble"||z.type==="fumble")return finishAction();if(z.type==="failure")return finishAction();
 battle.pending={attacker:battle.turn,defender:1-battle.turn,type,result:z,observed,spirit,weapon:w,tauntDamage:taunted?2:0};render();
}
function grappleAttack(){
 if(battle.pending||battle.gameOver||c.state.ap<1)return;const c=cur(),w=grapple(c);if(!w)return;
 const taunted=!!c.state.taunted,tauntPenalty=taunted?(c.state.tauntPenalty||10):0;if(taunted){c.state.taunted=false;c.state.tauntPenalty=10}
 const skill=clamp(w.skill+c.state.attackBonus-activePenalty(c)-tauntPenalty);const observed=c.state.attackBonus>0?(c.state.analyzedDodgePenalty||15):false;c.state.attackBonus=0;c.state.analyzedDodgePenalty=0;c.state.ap--;
 flavor("grapple",{attacker:battle.turn,defender:1-battle.turn,weapon:w});
 const r=rollD100(),z=judgeRoll(r,skill);showDiceFx(r,skill,z,w.name,()=>animate(battle.turn,"grapple"));battle.log.push({text:`${w.name} ${r}/${skill} → ${z.text}`});const fx=rollEffect(z,c.name,"組みつき");if(fx)battle.log.push({text:fx,cls:"special"});applyRollAp(c,z,"組みつき");
 if(z.type==="hundredFumble"||z.type==="fumble")return finishAction();if(z.rank<3)return finishAction();
 battle.pending={attacker:battle.turn,defender:1-battle.turn,type:"grapple",result:z,observed,spirit:0,weapon:w,tauntDamage:taunted?2:0};render();
}
function react(type){
 const p=battle.pending;if(!p||battle.gameOver)return;const d=chars[p.defender];
 if(type==="take"){if(p.type!=="heavy")d.state.spirit=Math.min(3,d.state.spirit+1);deal();battle.pending=null;return finishAction()}
 const cost=type==="dodge"?1:2;if(d.state.ap<cost)return;d.state.ap-=cost;
 const skill=type==="dodge"?dodgeSkill(d,p.observed):counterSkill(d),r=rollD100(),z=judgeRoll(r,skill);
 showDiceFx(r,skill,z,type==="dodge"?"DODGE":"COUNTER");
 battle.log.push({text:`${type==="dodge"?"回避":"反撃"} ${r}/${skill} → ${z.text}`});
 // APのクリファン処理は出目だけで即時適用。攻撃とのランク差には左右されない。
 applyRollAp(d,z,type==="dodge"?"回避":"反撃");

 if(z.type==="hundredFumble"){
   battle.log.push({text:`☠ ${d.name}の100ファンブル！ 防御に失敗し、受けるダメージ+4。`,cls:"special"});deal(4)
 }else if(z.type==="fumble"){
   battle.log.push({text:`💀 ${d.name}のファンブル！ 防御に失敗し、受けるダメージ+2。`,cls:"special"});deal(2)
 }else if(z.rank>=p.result.rank){
   const rankGap=z.rank-p.result.rank;
   const critEffect=(z.type==="critical"||z.type==="oneCritical")&&rankGap>=1;
   flavor(type,p);
   battle.log.push({text:type==="dodge"?`✓ ${d.name}は攻撃を回避した！`:`✓ ${d.name}は攻撃を防ぎ、反撃の機会を得た！`,cls:"special"});
   animate(p.defender,type);

   // 回避のクリティカル固有効果：クリティカルかつ攻撃より成功ランクが1以上高い時だけ反撃。
   if(type==="dodge"&&critEffect){
     const a=chars[p.attacker],w=selected(d),n=rollDamage(w.damage,d.db);
     a.hp=Math.max(0,a.hp-n);
     battle.log.push({text:`⚡ 回避クリティカル＋ランク差${rankGap}！ 反撃 ${w.name} → ${n}ダメージ！`,cls:"damage"});
     checkEnd();
   }else if(type==="counter"&&z.rank>=3){
     const a=chars[p.attacker];
     // 反撃のクリティカル固有効果：クリティカルかつ攻撃より成功ランクが1以上高い時だけ最大ダメージ。
     // 条件を満たさないクリティカルは通常の1D3反撃だが、APボーナスは既に適用済み。
     const n=critEffect?3:rollDice(3);
     a.hp=Math.max(0,a.hp-n);
     battle.log.push({text:`反撃 ${n}ダメージ！${critEffect?`（クリティカル＋ランク差${rankGap}：最大ダメージ）`:""}`,cls:"damage"});
     checkEnd();
   }
 }else deal();
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
 if(id==="taunt"){
  const skill=clamp(specialSkill(c,"app")-activePenalty(c)),r=rollD100(),z=judgeRoll(r,skill);showDiceFx(r,skill,z,"TAUNT / APP×5");
  battle.log.push({text:`挑発 APP×5 ${r}/${skill} → ${z.text}`,cls:"special"});applyRollAp(c,z,"挑発");
  if(z.rank>=3){
   const crit=z.type==="critical"||z.type==="oneCritical";
   foe().state.taunted=true;foe().state.tauntPenalty=crit?20:10;
   battle.log.push({text:`🔥 ${foe().name}は挑発された！ 次の行動は攻撃系のみ / 与ダメ+2 / 命中-${crit?20:10}${crit?"（クリティカル強化）":""}。`,cls:"special"})
  }
  return finishAction();
 }
 if(id==="analyze"){
  const skill=clamp(specialSkill(c,"int")-activePenalty(c)),r=rollD100(),z=judgeRoll(r,skill);showDiceFx(r,skill,z,"ANALYZE / INT×5");
  battle.log.push({text:`分析 INT×5 ${r}/${skill} → ${z.text}`,cls:"special"});applyRollAp(c,z,"分析");
  if(z.rank>=3){
   const crit=z.type==="critical"||z.type==="oneCritical";
   c.state.attackBonus=crit?30:20;c.state.analyzedDodgePenalty=crit?25:15;c.state.analyzed=true;
   battle.log.push({text:`👁 分析成功！ 次の攻撃+${crit?30:20} / 相手回避-${crit?25:15}${crit?"（クリティカル強化）":""}。`,cls:"special"})
  }
  return finishAction();
 }
 if(id==="intimidate"){
  if(c.mp<2)return;
  c.mp-=2;const skill=clamp(specialSkill(c,"pow")-activePenalty(c)),r=rollD100(),z=judgeRoll(r,skill);showDiceFx(r,skill,z,"INTIMIDATE / POW×5");
  battle.log.push({text:`威圧 POW×5 ${r}/${skill} → ${z.text} / MP-2`,cls:"special"});applyRollAp(c,z,"威圧");
  if(z.rank>=3){
   const crit=z.type==="critical"||z.type==="oneCritical";
   c.state.intimidated=crit?0.25:0.5;
   battle.log.push({text:`🛡 威圧成功！ ${c.name}が次に受けるダメージを${crit?"1/4":"半減"}${crit?"（クリティカル強化）":""}。`,cls:"special"})
  }
  return finishAction();
 }
 if(id==="guard"&&c.state.ap>=1){c.state.guard=true;c.state.ap--;battle.log.push({text:`${c.name}は防御態勢。`});finishAction()}
  if(id==="heal"&&c.state.ap>=2){cur().state.ap-=2;const healSkill=clamp(c.skills.firstAid-activePenalty(c)),r=rollD100(),z=judgeRoll(r,healSkill);showDiceFx(r,healSkill,z,"FIRST AID");let h=z.type==="oneCritical"?5:z.type==="critical"?rollDice(3)+2:z.type==="success"?rollDice(3):0;if(h)c.hp=Math.min(c.maxHp,c.hp+h);if(z.type==="hundredFumble")c.hp=Math.max(1,c.hp-2);battle.log.push({text:`応急手当 ${r}/${healSkill} → ${z.text}${h?` / HP+${h}`:z.type==="hundredFumble"?" / HP-2":""}`});applyRollAp(c,z,"応急手当");if(z.type==="oneCritical")battle.log.push({text:"🌟 完璧な応急処置！ HPを5回復。",cls:"special"});else if(z.type==="critical")battle.log.push({text:"✨ 的確な応急処置！ 回復量が1D3+2に強化。",cls:"special"});else if(z.type==="hundredFumble")battle.log.push({text:"☠ 応急手当で100ファンブル！ 処置を誤りHP-2（HP1未満にはならない）。",cls:"special"});else if(z.type==="fumble")battle.log.push({text:"💀 応急手当に失敗。回復は発生しない。",cls:"special"});finishAction()}
 if(netMode==="online"&&isHost&&!applyingNet)syncState();
}
function stat(label,v){return `<div class="stat"><span>${label}</span><b>${v}</b></div>`}
function render(){
 
 if(!battle)return;
 if(netMode==="online"&&isHost&&!applyingNet&&conn?.open){
   clearTimeout(render._syncTimer);
   render._syncTimer=setTimeout(syncState,0);
 }
 chars.forEach((c,i)=>{const n=i+1;$("name"+n).textContent=c.name;$("hp"+n).textContent=`${c.hp} / ${c.maxHp}`;$("hpbar"+n).style.width=`${100*c.hp/c.maxHp}%`;$("stats"+n).innerHTML=stat("STR",c.str)+stat("DEX",c.dex)+stat("APP",c.app)+stat("POW",c.pow)+stat("INT",c.int)+stat("DB",c.db||"0")+stat("攻撃",c.skills.attack)+stat("回避",c.skills.dodge);$("states"+n).innerHTML=`<span class="resource-chip mp-chip">MP ${c.mp}/${c.maxMp}</span>${c.state.attackBonus?`<span class="effect-chip buff">分析済み：次攻撃 命中+${c.state.attackBonus} / 相手回避-${c.state.analyzedDodgePenalty||15}</span>`:""}${c.state.taunted?`<span class="effect-chip debuff">挑発：次行動は攻撃のみ / 命中-${c.state.tauntPenalty||10} / ダメージ+2</span>`:""}${c.state.intimidated?`<span class="effect-chip buff">威圧：次の被ダメージ ${c.state.intimidated===0.25?"1/4":"半減"}</span>`:""}${c.state.nextApPenalty?'<span class="effect-chip debuff">体勢崩れ：次のAP回復なし</span>':""}${c.state.spirit?`<span class="effect-chip buff">闘志 ${c.state.spirit}：次攻撃 ダメージ+${c.state.spirit}${c.state.spirit>=3?" / 命中+10":""}</span>`:""}`;const img=$("portrait"+n);if(c.image){img.src=c.image;img.style.display="block"}else img.style.display="none"});
 $("round").textContent=`ROUND ${battle.round}`;$("turn-name").textContent=battle.pending?"リアクション":`${cur().name}のターン`;$("ap").textContent=`AP ${cur().state.ap}`;
 const actor=chars[battle.turn];
 const pen=0;
 const setDetail=(id,text)=>{const el=$(id);if(el)el.textContent=text};
 const modText=(mods)=>mods.length?`（${mods.join(" / ")}）`:"";
 const activeMods=pen?["威圧 -10"]:[];
 setDetail("analyze-detail",`判定 ${clamp(specialSkill(actor,"int")-pen)}% ${modText(activeMods)}`.trim());
 setDetail("taunt-detail",`判定 ${clamp(specialSkill(actor,"app")-pen)}% ${modText(activeMods)}`.trim());
 setDetail("intimidate-detail",`判定 ${clamp(specialSkill(actor,"pow")-pen)}% ${modText(activeMods)}`.trim());
 const c=cur(),w=selected(c),g=grapple(c);
 const atkMods=[];
 if(c.state.attackBonus)atkMods.push("分析 +20");
 if(c.state.spirit>=3)atkMods.push("闘志 +10");
 if(c.state.taunted)atkMods.push("挑発 -10");
 
 const normalChance=clamp(atkSkill(c)+(c.state.attackBonus?20:0)+(c.state.spirit>=3?10:0)-(c.state.taunted?(c.state.tauntPenalty||10):0));
 const heavyMods=[...atkMods,"強攻撃 -5"];
 const heavyChance=clamp(atkSkill(c)+(c.state.attackBonus?20:0)+(c.state.spirit>=3?10:0)-(c.state.taunted?(c.state.tauntPenalty||10):0)-5);
 $("attack-chance").textContent=`判定 ${normalChance}% ${modText(atkMods)}`.trim();
 $("attack-detail").textContent=`${w.name} ${w.skill}% / ${w.damage}`;
 $("heavy-chance").textContent=`判定 ${heavyChance}% ${modText(heavyMods)}`.trim();$("heavy-detail").textContent=`${w.name} / ${w.damage}+1D4`;$("grapple-chance").textContent=g?`判定 ${clamp(g.skill-pen)}% ${modText(pen?["威圧 -10"]:[])}`.trim():"技能なし";$("grapple-detail").textContent=g?`${g.damage} / STR対抗`:"組み付きなし";$("heal-chance").textContent=`判定 ${clamp(c.skills.firstAid-pen)}% ${modText(pen?["威圧 -10"]:[])}`.trim();
 $("analyze-chance").textContent=`INT×5 ${specialSkill(c,"int")}%`;
 $("taunt-chance").textContent=`APP×5 ${specialSkill(c,"app")}%`;
 $("intimidate-chance").textContent=`POW×5 ${specialSkill(c,"pow")}%`;
 $("actions").classList.toggle("hidden",!!battle.pending);$("reactions").classList.toggle("hidden",!battle.pending);
 ["attack","heavy","grapple","analyze","taunt","intimidate","heal"].forEach(id=>$(id).disabled=!!battle.pending||battle.gameOver||!canActHere());
 if(!battle.pending){
 $("attack").disabled||=c.state.ap<1;$("heavy").disabled||=cur().state.ap<2;$("grapple").disabled||=c.state.ap<1||!g;$("heal").disabled||=cur().state.ap<2;
 $("intimidate").disabled||=c.mp<2;
 if(c.state.taunted){["analyze","taunt","intimidate","heal"].forEach(id=>$(id).disabled=true)}
 scheduleCom();
}

 if(battle.pending){const d=chars[battle.pending.defender];$("dodge-detail").textContent=`判定 ${dodgeSkill(d,battle.pending.observed)}% / COST 1 AP`;$("counter-detail").textContent=`判定 ${counterSkill(d)}% / COST 2 AP`;$("dodge").disabled=d.state.ap<1||!canActHere();$("counter").disabled=d.state.ap<2||!canActHere();$("take").disabled=!canActHere()}
 $("log").innerHTML=battle.log.map(x=>`<div class="${x.cls||""}">${String(x.text).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]))}</div>`).join("");$("log").scrollTop=$("log").scrollHeight;;if(comMode)scheduleCom();
}
document.querySelectorAll(".p-tab").forEach(btn=>btn.addEventListener("click",()=>{const pl=btn.dataset.player;document.querySelectorAll(`.p-tab[data-player="${pl}"]`).forEach(x=>x.classList.toggle("active",x===btn));$(pl+"-manual").classList.toggle("hidden",btn.dataset.tab!=="manual");$(pl+"-json").classList.toggle("hidden",btn.dataset.tab!=="json")}));
$("parse-json").addEventListener("click",()=>importJson("p1"));$("p2-parse-json").addEventListener("click",()=>importJson("p2"));$("save-char").addEventListener("click",()=>save("p1"));$("save-p2").addEventListener("click",()=>save("p2"));$("local-start").addEventListener("click",start);$("com-start").addEventListener("click",startCom);
$("host-code").addEventListener("input",e=>e.target.value=String(e.target.value||"").replace(/\D/g,"").slice(0,4));
$("join-code").addEventListener("input",e=>e.target.value=String(e.target.value||"").replace(/\D/g,"").slice(0,4));
$("host-btn").addEventListener("click",hostOnline);
$("join-btn").addEventListener("click",joinOnline);
setOnlineStatus("オンライン：操作できます / BUILD 2.64");
["attack","heavy","grapple","analyze","taunt","intimidate","heal","dodge","counter","take"].forEach(id=>$(id).addEventListener("click",()=>action(id)));
$("leave-btn").addEventListener("click",()=>location.reload());


$("copy-room").addEventListener("click",()=>toast("ルームコード："+$("room-display").textContent));
bindImage("char-image","char-image-preview","p1");bindImage("p2-image","p2-image-preview","p2");
try{const c=JSON.parse(localStorage.getItem("cb-character"));if(c){p1=c;apply("p1",c);preview("p1",c)}}catch(e){}



// v2.22: result overlay keeps VICTORY/DEFEAT presentation.
// Only "ロビーへ戻る" remains as an action.
let lobbyReturning=false;
function resultReturnToLobby(ev){
 resetBattleBgm();
 const btn=ev.target?.closest?.("#result-lobby-btn");
 if(!btn||lobbyReturning)return;
 lobbyReturning=true;
 ev.preventDefault();ev.stopPropagation();
 const overlay=document.getElementById("result-overlay");
 if(overlay){overlay.classList.add("hidden");overlay.style.display="none";}
 const battleScreen=document.getElementById("battle-screen");
 if(battleScreen){battleScreen.classList.add("hidden");battleScreen.classList.remove("active");}
 const lobby=document.getElementById("lobby");
 if(lobby){lobby.classList.remove("hidden");lobby.style.display="";}
 const roomBox=document.getElementById("room-box"); if(roomBox)roomBox.classList.add("hidden");
 const roomDisplay=document.getElementById("room-display"); if(roomDisplay)roomDisplay.textContent="";
 battle=null;chars=[];
 const oldConn=conn,oldPeer=peer;
 conn=null;peer=null;netMode="local";isHost=false;myPlayerIndex=0;comMode=false;comThinking=false;
 try{oldConn?.close()}catch(e){console.warn(e)}
 try{if(oldPeer&&!oldPeer.destroyed)oldPeer.destroy()}catch(e){console.warn(e)}
 try{setOnlineStatus("オンライン：操作できます / BUILD 2.64")}catch(e){}
 window.scrollTo(0,0);
 setTimeout(()=>{lobbyReturning=false},300);
}
document.addEventListener("pointerup",resultReturnToLobby,true);
document.addEventListener("click",resultReturnToLobby,true);

// v2.23 rule help
(()=>{
 const ov=document.getElementById("help-overlay");
 const open=document.getElementById("help-open-btn");
 const close=document.getElementById("help-close-btn");
 if(!ov||!open||!close)return;
 open.addEventListener("click",()=>ov.classList.remove("hidden"));
 close.addEventListener("click",()=>ov.classList.add("hidden"));
 ov.addEventListener("click",e=>{if(e.target===ov)ov.classList.add("hidden")});
 document.addEventListener("keydown",e=>{if(e.key==="Escape")ov.classList.add("hidden")});
})();

document.addEventListener("click",e=>{
 const b=e.target?.closest?.("#bgm-toggle"); if(!b)return;
 bgmEnabled=!bgmEnabled;b.textContent=bgmEnabled?"♫ BGM":"♫ BGM OFF";
 if(bgmEnabled)startBattleBgm();else battleBgm.pause();
});