let imageData={p1:"",p2:""};let importedAttacks={p1:null,p2:null};
function bindImage(inputId,previewId,key){
 let el=$(inputId);if(!el)return;
 el.addEventListener("change",()=>{let f=el.files?.[0];if(!f)return;let r=new FileReader();r.onload=()=>{imageData[key]=r.result;let pr=$(previewId);pr.innerHTML="";let im=new Image();im.src=r.result;pr.appendChild(im)};r.readAsDataURL(f)})
}
function animateFighter(index,type){
 let w=$("portrait-wrap"+index);if(!w)return;
 w.classList.remove("anim-attack","anim-heavy","anim-grapple","anim-hit","anim-dodge","anim-guard","anim-heal","anim-observe");
 void w.offsetWidth;w.classList.add("anim-"+type);setTimeout(()=>w.classList.remove("anim-"+type),900)
}
window.addEventListener("battlefx",e=>{let d=e.detail||{};animateFighter(d.index,d.type)});
const $=id=>document.getElementById(id);let myCharacter=null,remoteCharacter=null;
function toast(t){$("toast").textContent=t;$("toast").classList.add("show");setTimeout(()=>$("toast").classList.remove("show"),1600)}
function val(id){return +$(id).value}
function readManual(){let attacks=importedAttacks.p1||[{name:"攻撃",skill:val("char-atk"),damage:$("char-dmg").value||"1d4+1",kind:"damage"}];return{name:$("char-name").value.trim()||"探索者",maxHp:val("char-hp"),str:val("char-str"),dex:val("char-dex"),attack:val("char-atk"),dodge:val("char-dodge"),firstAid:val("char-aid"),image:imageData.p1,attacks}}
function applyForm(c){importedAttacks.p1=c.attacks||null;$("char-name").value=c.name;if(c.image){imageData.p1=c.image;$("char-image-preview").innerHTML=`<img src="${c.image}">`;}$("char-hp").value=c.maxHp;$("char-str").value=c.str||50;$("char-dex").value=c.dex;$("char-atk").value=c.attack;$("char-dodge").value=c.dodge;$("char-aid").value=c.firstAid;if(c.attacks?.[0])$("char-dmg").value=c.attacks[0].damage||"1d4+1"}
function applyP2Form(c){
 importedAttacks.p2=c.attacks||null;
 $("p2-name").value=c.name;$("p2-hp").value=c.maxHp;$("p2-str").value=c.str||50;$("p2-dex").value=c.dex;
 $("p2-atk").value=c.attack;$("p2-dodge").value=c.dodge;$("p2-aid").value=c.firstAid;
 let best=chooseBestAttack(c.attacks||[]);$("p2-dmg").value=best.damage||"1d4+1";
 if(c.image){imageData.p2=c.image;$("p2-image-preview").innerHTML=`<img src="${c.image}">`}
}
function saveChar(){myCharacter=readManual();$("my-preview").textContent=`${myCharacter.name} ｜ HP ${myCharacter.maxHp} ｜ DEX ${myCharacter.dex} ｜ 攻撃 ${myCharacter.attack} ｜ 回避 ${myCharacter.dodge} ｜ 応急手当 ${myCharacter.firstAid}`;localStorage.setItem("cb-character",JSON.stringify(myCharacter));toast("キャラクターを確定しました");if(conn?.open)send({type:"character",character:myCharacter})}
function showBattle(){$("lobby").classList.add("hidden");$("battle-screen").classList.remove("hidden");render()}
function stat(label,base,eff){let diff=eff-base,cls=diff>0?"up":diff<0?"down":"";return `<div class="stat"><span>${label}</span><strong>${base}${diff?` → <em class="${cls}">${eff}</em>`:""}</strong>${diff?`<span class="${cls}">${diff>0?"+":""}${diff}</span>`:""}</div>`}
function render(){
 if(!characters.length)return;
 characters.forEach((c,i)=>{let n=i+1,observed=battle.pending?.defenderIndex===i&&battle.pending.observed;
 $("name"+n).textContent=c.name;let pi=$("portrait"+n);if(c.image){pi.src=c.image;pi.style.display="block"}else{pi.removeAttribute("src");pi.style.display="none"}$("hp"+n).textContent=`${c.hp} / ${c.maxHp}`;$("hpbar"+n).style.width=`${c.hp/c.maxHp*100}%`;
 $("stats"+n).innerHTML=stat("STR",c.str,c.str)+stat("DB",c.db||"0",c.db||"0")+stat("攻撃",c.skills.attack,effectiveAttack(c))+stat("回避",c.skills.dodge,effectiveDodge(c,observed))+stat("反撃",c.skills.attack,effectiveCounter(c));
 $("effects"+n).textContent=`RP ${"◆".repeat(c.state.rp)}${"◇".repeat(2-c.state.rp)} ｜ 闘志 ${"🔥".repeat(c.state.spirit)||"―"}${c.state.guard?" ｜ 🛡 防御":""}${c.state.attackBonus?" ｜ 👁 観察+20":""}`;
 $("fighter"+n).classList.toggle("active",i===battle.turn&&!battle.gameOver);$("fighter"+n).classList.toggle("mine",netMode==="online"&&i===myRole)});
 $("round").textContent=`ROUND ${battle.round}`;$("turn-label").textContent=battle.gameOver?"BATTLE END":`${current().name}のターン`;
 $("role-label").textContent=netMode==="local"?"同じPCで対戦":`あなたは PLAYER ${myRole+1}`;
 $("resource-line").textContent=`AP ${"●".repeat(battle.ap)}${"○".repeat(2-battle.ap)} ｜ ${current().name}`;
 let actor=battle.pending?battle.pending.defenderIndex:battle.turn,can=netMode==="local"||actor===myRole;
 $("control-note").textContent=can?"あなたが操作できます":"相手の操作を待っています";
 $("actions").classList.toggle("hidden",!!battle.pending);$("reactions").classList.toggle("hidden",!battle.pending);
 let c=current(),w=selectedAttack(c),a=effectiveAttack(c,"normal"),h=effectiveAttack(c,"heavy");$("attack-chance").textContent=`判定 ${a}%`;$("heavy-chance").textContent=`判定 ${h}%`;$("heal-chance").textContent=`判定 ${c.skills.firstAid}%`;let gw=grappleOf(c);$("grapple-chance").textContent=gw?`判定 ${clamp(gw.skill+c.state.attackBonus)}%`:"技能なし";$("grapple-detail").textContent=gw?`${gw.damage} / 命中後 STR対抗 / 1AP`:"キャラシに組み付きなし";
 $("attack-detail").textContent=`${w.name} ${w.skill}% / ${w.damage} / 命中込み期待値 ${attackExpectedValue(w).toFixed(2)} / 1AP`;$("heavy-detail").textContent=`${w.name} / ${w.kind==="grapple"?"拘束":"ダメージ "+w.damage+" +1d4"} / 2AP`;
 if(battle.pending){let d=characters[battle.pending.defenderIndex],dv=effectiveDodge(d,battle.pending.observed),ct=effectiveCounter(d);$("dodge-chance").textContent=`判定 ${dv}%`;$("counter-chance").textContent=`判定 ${ct}%`;$("dodge-detail").textContent=`基礎${d.skills.dodge} → 実効${dv} / 2RP`;$("counter-detail").textContent=`基礎${d.skills.attack} → 実効${ct} / 1RP`;$("dodge").disabled=!can||d.state.rp<2;$("counter").disabled=!can||d.state.rp<1;$("take").disabled=!can}
 ["attack","heavy","grapple","guard","observe","heal"].forEach(id=>$(id).disabled=!can||battle.gameOver);$("attack").disabled||=battle.ap<1;$("grapple").disabled||=battle.ap<1||!grappleOf(c);$("heavy").disabled||=battle.ap<2;$("guard").disabled||=battle.ap<1;$("observe").disabled||=battle.ap<1;$("heal").disabled||=battle.ap<2;
 $("log").innerHTML=battle.logs.map(x=>`<div class="${x.c||""}">${escapeHtml(x.t)}</div>`).join("");$("log").scrollTop=$("log").scrollHeight
}
function escapeHtml(s){return String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]))}
function lockAll(){document.querySelectorAll(".commands button").forEach(b=>b.disabled=true)}
document.querySelectorAll(".tab").forEach(b=>b.onclick=()=>{document.querySelectorAll(".tab").forEach(x=>x.classList.remove("active"));b.classList.add("active");$("manual-panel").classList.toggle("hidden",b.dataset.tab!=="manual");$("ccfolia-panel").classList.toggle("hidden",b.dataset.tab!=="ccfolia")});
$("parse-json").onclick=()=>{try{let c=parseCcf(JSON.parse($("ccfolia-json").value));applyForm(c);$("import-result").textContent=`読み込み成功：${c.name} / DB ${c.db||"0"}${c.attacks?.some(a=>a.kind==="grapple")?" / 組み付き検出":" / 組み付きなし"}。`;document.querySelector('[data-tab="manual"]').click()}catch(e){toast("JSONを読み込めませんでした")}};
$("save-char").onclick=saveChar;$("local-start").onclick=()=>{if(!myCharacter)saveChar();netMode="local";myRole=0;let enemy=freshCharacter({name:$("p2-name").value||"PLAYER 2",maxHp:val("p2-hp"),str:val("p2-str"),dex:val("p2-dex"),attack:val("p2-atk"),dodge:val("p2-dodge"),firstAid:val("p2-aid"),image:imageData.p2,attacks:importedAttacks.p2||[{name:"攻撃",skill:val("p2-atk"),damage:$("p2-dmg").value||"1d4+1",kind:"damage"}]});initBattle([freshCharacter(myCharacter),enemy]);showBattle()};
$("host-btn").onclick=()=>{if(!myCharacter)saveChar();createRoom()};$("join-btn").onclick=()=>{if(!myCharacter)saveChar();joinRoom($("room-code").value.trim())};
$("copy-room").onclick=async()=>{await navigator.clipboard.writeText($("room-display").textContent);toast("部屋コードをコピーしました")};
["attack","heavy","grapple","guard","observe","heal","dodge","counter","take"].forEach(id=>$(id).onclick=()=>submitIntent(id));
$("leave-btn").onclick=()=>location.reload();
try{let s=JSON.parse(localStorage.getItem("cb-character"));if(s){myCharacter=s;applyForm(s);$("my-preview").textContent=`${s.name} ｜ HP ${s.maxHp} ｜ DEX ${s.dex} ｜ 攻撃 ${s.attack} ｜ 回避 ${s.dodge} ｜ 応急手当 ${s.firstAid}`}}catch(e){}
bindImage("char-image","char-image-preview","p1");bindImage("p2-image","p2-image-preview","p2");

const p2ParseButton=$("p2-parse-json");
if(p2ParseButton)p2ParseButton.onclick=()=>{
 try{
  const c=parseCcf(JSON.parse($("p2-ccfolia-json").value));
  applyP2Form(c);
  const best=chooseBestAttack(c.attacks||[]);
  const g=(c.attacks||[]).find(a=>a.kind==="grapple");
  $("p2-import-result").textContent=`読み込み成功：${c.name} / DB ${c.db||"0"} / 自動攻撃：${best.name} ${best.skill}% ${best.damage}（期待値 ${attackExpectedValue(best).toFixed(2)}）${g?` / 組み付き ${g.skill}% ${g.damage}`:""}`;
  toast("PLAYER 2のJSONを読み込みました");
 }catch(e){
  console.error(e);
  $("p2-import-result").textContent="JSONを読み込めませんでした。JSON全文を確認してください。";
  toast("PLAYER 2のJSON読み込みに失敗しました");
 }
};
