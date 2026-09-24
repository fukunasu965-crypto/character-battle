
"use strict";
const $=id=>document.getElementById(id);
let imageData={p1:"",p2:""}, importedAttacks={p1:null,p2:null};
let p1=null,p2=null,chars=[],battle=null;
let netMode="local",myPlayerIndex=0,peer=null,conn=null,isHost=false,applyingNet=false,remoteIntent=false,comMode=false,comThinking=false;

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
  battle={turn:chars[0].dex>=chars[1].dex?0:1,round:1,ap:2,pending:null,gameOver:false,log:[]};
  $("lobby").classList.add("hidden");$("battle-screen").classList.remove("hidden");$("battle-screen").classList.add("active");
  battle.log.push({text:`戦闘開始！ ${cur().name}のターン。`,cls:"special"});render();
 }catch(e){console.error(e);toast("対戦開始エラー："+e.message)}
}

function startCom(){
 try{
  netMode="local";isHost=false;myPlayerIndex=0;comMode=true;comThinking=false;
  clearResult();save("p1");save("p2");
  if(!p1||!p2)throw new Error("PLAYER 1 / PLAYER 2 を確定してください");
  chars=[fresh(p1),fresh(p2)];
  battle={turn:chars[0].dex>=chars[1].dex?0:1,round:1,ap:2,pending:null,gameOver:false,log:[]};
  $("lobby").classList.add("hidden");$("battle-screen").classList.remove("hidden");$("battle-screen").classList.add("active");
  battle.log.push({text:`COM対戦開始！ ${cur().name}のターン。`,cls:"special"});render();scheduleCom();
 }catch(e){console.error(e);toast("COM対戦開始エラー："+e.message)}
}
function comIsActor(){
 if(!comMode||!battle||battle.gameOver)return false;
 return (battle.pending?battle.pending.defender:battle.turn)===1;
}
function scheduleCom(){
 if(!comIsActor()||comThinking)return;
 comThinking=true;
 setTimeout(()=>{comThinking=false;if(comIsActor())comStep()},550);
}
function comStep(){
 if(!comIsActor())return;
 const c=chars[1];
 if(battle.pending){
  const p=battle.pending;
  // Prefer a viable defense; low RP falls back to taking the hit.
  if(c.state.rp>=2 && c.skills.dodge>=45)return action("dodge");
  if(c.state.rp>=1 && c.skills.attack>=55)return action("counter");
  return action("take");
 }
 // Simple, readable AI: heal when hurt, occasionally prepare, otherwise attack.
 const hpRate=c.hp/Math.max(1,c.maxHp);
 if(battle.ap>=2 && hpRate<=0.35 && c.skills.firstAid>=35)return action("heal");
 if(battle.ap>=1 && c.state.attackBonus===0 && Math.random()<0.16)return action("observe");
 if(battle.ap>=1 && !c.state.guard && Math.random()<0.12)return action("guard");
 const g=grapple(c);
 if(battle.ap>=1 && g && g.skill>=60 && Math.random()<0.14)return action("grapple");
 if(battle.ap>=2 && Math.random()<0.28)return action("heavy");
 return action("attack");
}
function animate(i,type){const w=$("portrait-wrap"+(i+1));if(!w)return;w.className=w.className.replace(/\banim-\S+/g,"").trim();void w.offsetWidth;w.classList.add("anim-"+type);setTimeout(()=>w.classList.remove("anim-"+type),800)}
function finishAction(){if(!battle.gameOver&&!battle.pending&&battle.ap<=0)endTurn();render()}
function endTurn(){battle.turn=1-battle.turn;if(battle.turn===0)battle.round++;const c=cur();battle.ap=Math.max(0,2-(c.state.nextApPenalty||0));c.state.nextApPenalty=0;c.state.rp=2;c.state.normalAttacks=0;battle.log.push({text:`--- ROUND ${battle.round} / ${c.name} ---`,cls:"special"})}
function clearResult(){
 const ov=$("result-overlay");ov.classList.add("hidden");ov.classList.remove("result-win","result-lose");
 $("fighter1")?.classList.remove("is-winner","is-loser");$("fighter2")?.classList.remove("is-winner","is-loser");
}
function showResult(winnerIndex,loserIndex,viewerIndex=null){
 stopBattleBgm();
 const ov=$("result-overlay");const didWin=viewerIndex===null||viewerIndex===winnerIndex;
 $("result-title").textContent=didWin?"VICTORY":"DEFEAT";
 $("result-winner").textContent=didWin?"🏆 "+chars[winnerIndex].name:chars[loserIndex].name+" は敗北した";
 $("result-loser").textContent=didWin?chars[loserIndex].name+" は戦闘不能":"勝者："+chars[winnerIndex].name;
 ov.classList.remove("result-win","result-lose");ov.classList.add(didWin?"result-win":"result-lose");
 $("fighter"+(winnerIndex+1))?.classList.add("is-winner");$("fighter"+(loserIndex+1))?.classList.add("is-loser");ov.classList.remove("hidden");
}
function showOnlineResult(winnerIndex,myPlayerIndex){
 stopBattleBgm();
 showResult(winnerIndex,1-winnerIndex,myPlayerIndex);
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




let diceFxToken=0,diceAudioCtx=null,bgmNodes=null,bgmEnabled=true;
function audioCtx(){
 if(!diceAudioCtx) diceAudioCtx=new (window.AudioContext||window.webkitAudioContext)();
 if(diceAudioCtx.state==="suspended")diceAudioCtx.resume();
 return diceAudioCtx;
}
function diceSound(){
 try{
  const ac=audioCtx(),now=ac.currentTime;
  // Layered hard-surface dice tumble: many short impacts, slowing toward the stop.
  let t=0;
  for(let i=0;i<18;i++){
   t += .022 + i*.0032;
   const dur=.018+Math.random()*.022;
   const o=ac.createOscillator(),g=ac.createGain(),f=ac.createBiquadFilter();
   o.type=i%3===0?"square":"triangle";
   o.frequency.setValueAtTime(120+Math.random()*520,now+t);
   f.type="bandpass";f.frequency.value=650+Math.random()*1700;f.Q.value=.7;
   const peak=.025+Math.random()*.055;
   g.gain.setValueAtTime(.0001,now+t);
   g.gain.exponentialRampToValueAtTime(peak,now+t+.002);
   g.gain.exponentialRampToValueAtTime(.0001,now+t+dur);
   o.connect(f).connect(g).connect(ac.destination);o.start(now+t);o.stop(now+t+dur+.01);
  }
  // final satisfying clack
  for(const [freq,delay,gain] of [[105,.61,.10],[235,.625,.065]]){
   const o=ac.createOscillator(),g=ac.createGain();
   o.type="triangle";o.frequency.value=freq;
   g.gain.setValueAtTime(.0001,now+delay);g.gain.exponentialRampToValueAtTime(gain,now+delay+.003);
   g.gain.exponentialRampToValueAtTime(.0001,now+delay+.09);
   o.connect(g).connect(ac.destination);o.start(now+delay);o.stop(now+delay+.1);
  }
 }catch(e){}
}
function resultSting(z){
 try{
  const ac=audioCtx(),now=ac.currentTime;
  const good=z.rank>=3,rare=z.rank>=4||z.rank<=1;
  const notes=good?(rare?[523,659,784]:[440,554]):(rare?[196,147,110]:[220,185]);
  notes.forEach((freq,i)=>{
   const o=ac.createOscillator(),g=ac.createGain();o.type=good?"sine":"sawtooth";o.frequency.value=freq;
   const t=now+i*.065;g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(.045,t+.01);g.gain.exponentialRampToValueAtTime(.0001,t+.18);
   o.connect(g).connect(ac.destination);o.start(t);o.stop(t+.2);
  });
 }catch(e){}
}
function showDiceFx(roll,target,z,label="1D100"){
 const ov=document.getElementById("dice-cinematic");if(!ov)return;
 const token=++diceFxToken,num=document.getElementById("dice-number"),res=document.getElementById("dice-result");
 const td=document.getElementById("dice-tens"),od=document.getElementById("dice-ones");
 document.getElementById("dice-label").textContent=label;
 document.getElementById("dice-target").textContent=target!=null?`TARGET ${target}`:"";
 res.textContent="";num.textContent="";ov.className="dice-cinematic rolling";ov.classList.remove("hidden");
 diceSound();
 let n=0;
 const spin=setInterval(()=>{
  if(token!==diceFxToken){clearInterval(spin);return}
  const a=Math.floor(Math.random()*10),b=Math.floor(Math.random()*10);
  td.querySelector("span").textContent=a*10;od.querySelector("span").textContent=b;
  if(++n>=15){
   clearInterval(spin);
   const tens=roll===100?0:Math.floor(roll/10)*10,ones=roll===100?0:roll%10;
   td.querySelector("span").textContent=tens;od.querySelector("span").textContent=ones;
   num.textContent=String(roll).padStart(2,"0");res.textContent=z.text.toUpperCase();
   ov.classList.remove("rolling");ov.classList.add("impact",(z.rank>=4)?"critical":(z.rank<=1)?"fumble":"normal");
   resultSting(z);
   setTimeout(()=>{if(token===diceFxToken)ov.classList.add("hidden")},z.rank>=4||z.rank<=1?1050:780);
  }
 },42);
}
function startBattleBgm(){
 if(!bgmEnabled||bgmNodes)return;
 try{
  const ac=audioCtx(),master=ac.createGain();master.gain.value=.045;master.connect(ac.destination);
  // Lightweight generated battle loop: pulse + bass, no copyrighted external asset.
  const bass=ac.createOscillator(),bassGain=ac.createGain();
  bass.type="sawtooth";bass.frequency.value=55;bassGain.gain.value=.18;bass.connect(bassGain).connect(master);bass.start();
  const pulse=ac.createOscillator(),pulseGain=ac.createGain();
  pulse.type="square";pulse.frequency.value=110;pulseGain.gain.value=.035;pulse.connect(pulseGain).connect(master);pulse.start();
  const timer=setInterval(()=>{
   if(!bgmNodes)return;
   const t=ac.currentTime; pulseGain.gain.cancelScheduledValues(t);
   pulseGain.gain.setValueAtTime(.015,t);pulseGain.gain.linearRampToValueAtTime(.12,t+.025);pulseGain.gain.exponentialRampToValueAtTime(.015,t+.16);
  },500);
  bgmNodes={bass,pulse,master,timer};
 }catch(e){}
}
function stopBattleBgm(){
 if(!bgmNodes)return;
 clearInterval(bgmNodes.timer);
 try{bgmNodes.bass.stop();bgmNodes.pulse.stop();bgmNodes.master.disconnect()}catch(e){}
 bgmNodes=null;
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
 if(z.type==="hundredFumble")return `☠ ${who}の100ファンブル！ APとRPが0になり、この行動は失敗。`;
 if(z.type==="fumble")return `💀 ${who}のファンブル！ RPを1失い、この行動は失敗。`;
 return "";
}
function rawDamage(p){let n=rollDamageExpr(p.weapon.damage);if(p.type==="heavy")n+=rollDice(4);if(p.result.type==="critical")n*=2;if(p.result.type==="oneCritical")n+=Math.ceil(damageExpected(p.weapon.damage));return n}

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
function deal(extra=0){
 const p=battle.pending,d=chars[p.defender];

 // 組みつきは命中しただけではダメージなし。
 // STR対抗に成功した場合のみダメージ＋次ターンAP-1。
 if(p.type==="grapple"){
  const a=chars[p.attacker],target=clamp(50+(a.str-d.str)*5),r=rollD100(),z=judgeRoll(r,target);showDiceFx(r,target,z,"STR CONTEST");
  battle.log.push({text:`STR対抗 ${r}/${target} → ${z.text}`,cls:"special"});
  if(z.rank<3){
   battle.log.push({text:`${d.name}は拘束を振りほどいた！ ダメージなし。`,cls:"special"});
   return;
  }
  let n=rawDamage(p)+(p.spirit||0)+extra;
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

 const n0=rawDamage(p)+(p.spirit||0)+extra;let n=n0;
 if(d.state.guard){if(p.type==="heavy"){d.state.guard=false;battle.log.push({text:"💥 ガードブレイク！",cls:"special"})}else{n=Math.max(0,n-2);d.state.guard=false}}
 const hpBefore=d.hp;d.hp=Math.max(0,d.hp-n);animate(p.defender,"hit");flavor("hit",p);battle.log.push({text:`${p.weapon.name} → ${n}ダメージ！`,cls:"damage"});checkStun(p.defender,hpBefore,n);checkEnd();
}
function attack(type){
 if(battle.pending||battle.gameOver)return;const c=cur(),cost=type==="heavy"?2:1;if(battle.ap<cost)return;
 const w=selected(c),skill=atkSkill(c,type),observed=c.state.attackBonus>0,spirit=c.state.spirit;c.state.attackBonus=0;c.state.spirit=0;if(type==="normal")c.state.normalAttacks++;battle.ap-=cost;animate(battle.turn,type==="heavy"?"heavy":"attack");
 flavor(type==="heavy"?"heavy":"attack",{attacker:battle.turn,defender:1-battle.turn,weapon:w});
 const r=rollD100(),z=judgeRoll(r,skill);showDiceFx(r,skill,z,w.name);battle.log.push({text:`${w.name} ${r}/${skill} → ${z.text}`});const fx=rollEffect(z,c.name,"攻撃");if(fx)battle.log.push({text:fx,cls:"special"});
 if(z.type==="oneCritical")battle.ap=Math.min(2,battle.ap+1);if(z.type==="hundredFumble"){battle.ap=0;c.state.rp=0;return finishAction()}if(z.type==="fumble"){c.state.rp=Math.max(0,c.state.rp-1);return finishAction()}if(z.type==="failure")return finishAction();
 battle.pending={attacker:battle.turn,defender:1-battle.turn,type,result:z,observed,spirit,weapon:w};render();
}
function grappleAttack(){
 if(battle.pending||battle.gameOver||battle.ap<1)return;const c=cur(),w=grapple(c);if(!w)return;
 const skill=clamp(w.skill+c.state.attackBonus);const observed=c.state.attackBonus>0;c.state.attackBonus=0;battle.ap--;animate(battle.turn,"grapple");
 flavor("grapple",{attacker:battle.turn,defender:1-battle.turn,weapon:w});
 const r=rollD100(),z=judgeRoll(r,skill);showDiceFx(r,skill,z,w.name);battle.log.push({text:`${w.name} ${r}/${skill} → ${z.text}`});const fx=rollEffect(z,c.name,"組みつき");if(fx)battle.log.push({text:fx,cls:"special"});
 if(z.type==="oneCritical")battle.ap=Math.min(2,battle.ap+1);if(z.type==="hundredFumble"){battle.ap=0;c.state.rp=0;return finishAction()}if(z.type==="fumble"){c.state.rp=Math.max(0,c.state.rp-1);return finishAction()}if(z.rank<3)return finishAction();
 battle.pending={attacker:battle.turn,defender:1-battle.turn,type:"grapple",result:z,observed,spirit:0,weapon:w};render();
}
function react(type){
 const p=battle.pending;if(!p||battle.gameOver)return;const d=chars[p.defender];
 if(type==="take"){if(p.type!=="heavy")d.state.spirit=Math.min(3,d.state.spirit+1);deal();battle.pending=null;return finishAction()}
 const cost=type==="dodge"?2:1;if(d.state.rp<cost)return;d.state.rp-=cost;
 const skill=type==="dodge"?dodgeSkill(d,p.observed):counterSkill(d),r=rollD100(),z=judgeRoll(r,skill);showDiceFx(r,skill,z,type==="dodge"?"DODGE":"COUNTER");battle.log.push({text:`${type==="dodge"?"回避":"反撃"} ${r}/${skill} → ${z.text}`});
 if(z.type==="hundredFumble"){battle.log.push({text:`☠ ${d.name}の100ファンブル！ 防御に失敗し、受けるダメージ+4。`,cls:"special"});deal(4)}
 else if(z.type==="fumble"){battle.log.push({text:`💀 ${d.name}のファンブル！ 防御に失敗し、受けるダメージ+2。`,cls:"special"});deal(2)}
 else if(z.rank>=p.result.rank){flavor(type,p);battle.log.push({text:type==="dodge"?`✓ ${d.name}は攻撃を回避した！`:`✓ ${d.name}は攻撃を防ぎ、反撃の機会を得た！`,cls:"special"});animate(p.defender,type);if(type==="counter"&&z.rank>=3){const a=chars[p.attacker],n=rollDice(3);a.hp=Math.max(0,a.hp-n);battle.log.push({text:`反撃 ${n}ダメージ！`,cls:"damage"});checkEnd()}}else deal();
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
 if(id==="heal"&&battle.ap>=2){battle.ap-=2;const r=rollD100(),z=judgeRoll(r,c.skills.firstAid);showDiceFx(r,c.skills.firstAid,z,"FIRST AID");let h=z.type==="oneCritical"?5:z.type==="critical"?rollDice(3)+2:z.type==="success"?rollDice(3):0;if(h)c.hp=Math.min(c.maxHp,c.hp+h);if(z.type==="hundredFumble")c.hp=Math.max(1,c.hp-2);battle.log.push({text:`応急手当 ${r}/${c.skills.firstAid} → ${z.text}${h?` / HP+${h}`:z.type==="hundredFumble"?" / HP-2":""}`});if(z.type==="oneCritical")battle.log.push({text:"🌟 完璧な応急処置！ HPを5回復。",cls:"special"});else if(z.type==="critical")battle.log.push({text:"✨ 的確な応急処置！ 回復量が1D3+2に強化。",cls:"special"});else if(z.type==="hundredFumble")battle.log.push({text:"☠ 応急手当で100ファンブル！ 処置を誤りHP-2（HP1未満にはならない）。",cls:"special"});else if(z.type==="fumble")battle.log.push({text:"💀 応急手当に失敗。回復は発生しない。",cls:"special"});finishAction()}
 if(netMode==="online"&&isHost&&!applyingNet)syncState();
}
function stat(label,v){return `<div class="stat"><span>${label}</span><b>${v}</b></div>`}
function render(){
 if(battle)startBattleBgm();
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
 $("log").innerHTML=battle.log.map(x=>`<div class="${x.cls||""}">${String(x.text).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]))}</div>`).join("");$("log").scrollTop=$("log").scrollHeight;;if(comMode)scheduleCom();
}
document.querySelectorAll(".p-tab").forEach(btn=>btn.addEventListener("click",()=>{const pl=btn.dataset.player;document.querySelectorAll(`.p-tab[data-player="${pl}"]`).forEach(x=>x.classList.toggle("active",x===btn));$(pl+"-manual").classList.toggle("hidden",btn.dataset.tab!=="manual");$(pl+"-json").classList.toggle("hidden",btn.dataset.tab!=="json")}));
$("parse-json").addEventListener("click",()=>importJson("p1"));$("p2-parse-json").addEventListener("click",()=>importJson("p2"));$("save-char").addEventListener("click",()=>save("p1"));$("save-p2").addEventListener("click",()=>save("p2"));$("local-start").addEventListener("click",start);$("com-start").addEventListener("click",startCom);
$("host-code").addEventListener("input",e=>e.target.value=String(e.target.value||"").replace(/\D/g,"").slice(0,4));
$("join-code").addEventListener("input",e=>e.target.value=String(e.target.value||"").replace(/\D/g,"").slice(0,4));
$("host-btn").addEventListener("click",hostOnline);
$("join-btn").addEventListener("click",joinOnline);
setOnlineStatus("オンライン：操作できます / BUILD 2.30");
["attack","heavy","grapple","guard","observe","heal","dodge","counter","take"].forEach(id=>$(id).addEventListener("click",()=>action(id)));
$("leave-btn").addEventListener("click",()=>location.reload());


$("copy-room").addEventListener("click",()=>toast("ルームコード："+$("room-display").textContent));
bindImage("char-image","char-image-preview","p1");bindImage("p2-image","p2-image-preview","p2");
try{const c=JSON.parse(localStorage.getItem("cb-character"));if(c){p1=c;apply("p1",c);preview("p1",c)}}catch(e){}



// v2.22: result overlay keeps VICTORY/DEFEAT presentation.
// Only "ロビーへ戻る" remains as an action.
let lobbyReturning=false;
function resultReturnToLobby(ev){
 stopBattleBgm();
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
 try{setOnlineStatus("オンライン：操作できます / BUILD 2.30")}catch(e){}
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
 if(bgmEnabled&&battle)startBattleBgm();else stopBattleBgm();
});
