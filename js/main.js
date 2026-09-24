const $=id=>document.getElementById(id);let myCharacter=null,remoteCharacter=null;
function toast(t){$("toast").textContent=t;$("toast").classList.add("show");setTimeout(()=>$("toast").classList.remove("show"),1600)}
function val(id){return +$(id).value}
function readManual(){return{name:$("char-name").value.trim()||"探索者",maxHp:val("char-hp"),dex:val("char-dex"),attack:val("char-atk"),dodge:val("char-dodge"),firstAid:val("char-aid")}}
function applyForm(c){$("char-name").value=c.name;$("char-hp").value=c.maxHp;$("char-dex").value=c.dex;$("char-atk").value=c.attack;$("char-dodge").value=c.dodge;$("char-aid").value=c.firstAid}
function saveChar(){myCharacter=readManual();$("my-preview").textContent=`${myCharacter.name} ｜ HP ${myCharacter.maxHp} ｜ DEX ${myCharacter.dex} ｜ 攻撃 ${myCharacter.attack} ｜ 回避 ${myCharacter.dodge} ｜ 応急手当 ${myCharacter.firstAid}`;localStorage.setItem("cb-character",JSON.stringify(myCharacter));toast("キャラクターを確定しました");if(conn?.open)send({type:"character",character:myCharacter})}
function showBattle(){$("lobby").classList.add("hidden");$("battle-screen").classList.remove("hidden");render()}
function stat(label,base,eff){let diff=eff-base,cls=diff>0?"up":diff<0?"down":"";return `<div class="stat"><span>${label}</span><strong>${base}${diff?` → <em class="${cls}">${eff}</em>`:""}</strong>${diff?`<span class="${cls}">${diff>0?"+":""}${diff}</span>`:""}</div>`}
function render(){
 if(!characters.length)return;
 characters.forEach((c,i)=>{let n=i+1,observed=battle.pending?.defenderIndex===i&&battle.pending.observed;
 $("name"+n).textContent=c.name;$("hp"+n).textContent=`${c.hp} / ${c.maxHp}`;$("hpbar"+n).style.width=`${c.hp/c.maxHp*100}%`;
 $("stats"+n).innerHTML=stat("攻撃",c.skills.attack,effectiveAttack(c))+stat("回避",c.skills.dodge,effectiveDodge(c,observed))+stat("反撃",c.skills.attack,effectiveCounter(c));
 $("effects"+n).textContent=`RP ${"◆".repeat(c.state.rp)}${"◇".repeat(2-c.state.rp)} ｜ 闘志 ${"🔥".repeat(c.state.spirit)||"―"}${c.state.guard?" ｜ 🛡 防御":""}${c.state.attackBonus?" ｜ 👁 観察+20":""}`;
 $("fighter"+n).classList.toggle("active",i===battle.turn&&!battle.gameOver);$("fighter"+n).classList.toggle("mine",netMode==="online"&&i===myRole)});
 $("round").textContent=`ROUND ${battle.round}`;$("turn-label").textContent=battle.gameOver?"BATTLE END":`${current().name}のターン`;
 $("role-label").textContent=netMode==="local"?"同じPCで対戦":`あなたは PLAYER ${myRole+1}`;
 $("resource-line").textContent=`AP ${"●".repeat(battle.ap)}${"○".repeat(2-battle.ap)} ｜ ${current().name}`;
 let actor=battle.pending?battle.pending.defenderIndex:battle.turn,can=netMode==="local"||actor===myRole;
 $("control-note").textContent=can?"あなたが操作できます":"相手の操作を待っています";
 $("actions").classList.toggle("hidden",!!battle.pending);$("reactions").classList.toggle("hidden",!battle.pending);
 let c=current(),a=effectiveAttack(c,"normal"),h=effectiveAttack(c,"heavy");$("attack-chance").textContent=`判定 ${a}%`;$("heavy-chance").textContent=`判定 ${h}%`;$("heal-chance").textContent=`判定 ${c.skills.firstAid}%`;
 $("attack-detail").textContent=`基礎${c.skills.attack}${a!==c.skills.attack?` → 実効${a}`:""} / 1AP`;$("heavy-detail").textContent=`基礎${c.skills.attack} -15${c.state.attackBonus?` +${c.state.attackBonus}`:""} / 2AP`;
 if(battle.pending){let d=characters[battle.pending.defenderIndex],dv=effectiveDodge(d,battle.pending.observed),ct=effectiveCounter(d);$("dodge-chance").textContent=`判定 ${dv}%`;$("counter-chance").textContent=`判定 ${ct}%`;$("dodge-detail").textContent=`基礎${d.skills.dodge} → 実効${dv} / 2RP`;$("counter-detail").textContent=`基礎${d.skills.attack} → 実効${ct} / 1RP`;$("dodge").disabled=!can||d.state.rp<2;$("counter").disabled=!can||d.state.rp<1;$("take").disabled=!can}
 ["attack","heavy","guard","observe","heal"].forEach(id=>$(id).disabled=!can||battle.gameOver);$("attack").disabled||=battle.ap<1;$("heavy").disabled||=battle.ap<2;$("guard").disabled||=battle.ap<1;$("observe").disabled||=battle.ap<1;$("heal").disabled||=battle.ap<2;
 $("log").innerHTML=battle.logs.map(x=>`<div class="${x.c||""}">${escapeHtml(x.t)}</div>`).join("");$("log").scrollTop=$("log").scrollHeight
}
function escapeHtml(s){return String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]))}
function lockAll(){document.querySelectorAll(".commands button").forEach(b=>b.disabled=true)}
document.querySelectorAll(".tab").forEach(b=>b.onclick=()=>{document.querySelectorAll(".tab").forEach(x=>x.classList.remove("active"));b.classList.add("active");$("manual-panel").classList.toggle("hidden",b.dataset.tab!=="manual");$("ccfolia-panel").classList.toggle("hidden",b.dataset.tab!=="ccfolia")});
$("parse-json").onclick=()=>{try{let c=parseCcf(JSON.parse($("ccfolia-json").value));applyForm(c);$("import-result").textContent=`読み込み成功：${c.name}。数値を確認して「このキャラクターを使用」を押してください。`;document.querySelector('[data-tab="manual"]').click()}catch(e){toast("JSONを読み込めませんでした")}};
$("save-char").onclick=saveChar;$("local-start").onclick=()=>{if(!myCharacter)saveChar();netMode="local";myRole=0;let enemy=freshCharacter({name:"佐藤 クロエ",maxHp:13,dex:55,attack:65,dodge:70,firstAid:60});initBattle([freshCharacter(myCharacter),enemy]);showBattle()};
$("host-btn").onclick=()=>{if(!myCharacter)saveChar();createRoom()};$("join-btn").onclick=()=>{if(!myCharacter)saveChar();joinRoom($("room-code").value.trim())};
$("copy-room").onclick=async()=>{await navigator.clipboard.writeText($("room-display").textContent);toast("部屋コードをコピーしました")};
["attack","heavy","guard","observe","heal","dodge","counter","take"].forEach(id=>$(id).onclick=()=>submitIntent(id));
$("leave-btn").onclick=()=>location.reload();
try{let s=JSON.parse(localStorage.getItem("cb-character"));if(s){myCharacter=s;applyForm(s);$("my-preview").textContent=`${s.name} ｜ HP ${s.maxHp} ｜ DEX ${s.dex} ｜ 攻撃 ${s.attack} ｜ 回避 ${s.dodge} ｜ 応急手当 ${s.firstAid}`}}catch(e){}