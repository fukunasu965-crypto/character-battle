const $=id=>document.getElementById(id);
let imageData={p1:"",p2:""}, importedAttacks={p1:null,p2:null};
let myCharacter=null,p2Character=null,remoteCharacter=null;

function toast(t){$("toast").textContent=t;$("toast").classList.add("show");setTimeout(()=>$("toast").classList.remove("show"),1600)}
function val(id){return +$(id).value}
function bindImage(inputId,previewId,key){
 const el=$(inputId); if(!el)return;
 el.addEventListener("change",()=>{const f=el.files?.[0];if(!f)return;const r=new FileReader();r.onload=()=>{imageData[key]=r.result;$(previewId).innerHTML=`<img src="${r.result}">`};r.readAsDataURL(f)})
}
function animateFighter(index,type){
 const w=$("portrait-wrap"+(index+1));if(!w)return;
 [...w.classList].filter(x=>x.startsWith("anim-")).forEach(x=>w.classList.remove(x));
 void w.offsetWidth;w.classList.add("anim-"+type);setTimeout(()=>w.classList.remove("anim-"+type),900)
}
window.addEventListener("battlefx",e=>animateFighter(e.detail?.index,e.detail?.type));

function readP1(){
 const attacks=importedAttacks.p1||[{name:"攻撃",skill:val("char-atk"),damage:$("char-dmg").value||"1D4+1",kind:"damage"}];
 return {name:$("char-name").value.trim()||"PLAYER 1",maxHp:val("char-hp"),str:val("char-str"),dex:val("char-dex"),attack:val("char-atk"),dodge:val("char-dodge"),firstAid:val("char-aid"),image:imageData.p1,attacks};
}
function readP2(){
 const attacks=importedAttacks.p2||[{name:"攻撃",skill:val("p2-atk"),damage:$("p2-dmg").value||"1D4+1",kind:"damage"}];
 return {name:$("p2-name").value.trim()||"PLAYER 2",maxHp:val("p2-hp"),str:val("p2-str"),dex:val("p2-dex"),attack:val("p2-atk"),dodge:val("p2-dodge"),firstAid:val("p2-aid"),image:imageData.p2,attacks};
}
function applyP1(c){
 importedAttacks.p1=c.attacks||[]; const best=chooseBestAttack(c.attacks);
 $("char-name").value=c.name;$("char-hp").value=c.maxHp;$("char-str").value=c.str;$("char-dex").value=c.dex;
 $("char-atk").value=best.skill;$("char-dmg").value=best.damage;$("char-dodge").value=c.dodge;$("char-aid").value=c.firstAid;
}
function applyP2(c){
 importedAttacks.p2=c.attacks||[]; const best=chooseBestAttack(c.attacks);
 $("p2-name").value=c.name;$("p2-hp").value=c.maxHp;$("p2-str").value=c.str;$("p2-dex").value=c.dex;
 $("p2-atk").value=best.skill;$("p2-dmg").value=best.damage;$("p2-dodge").value=c.dodge;$("p2-aid").value=c.firstAid;
}
function preview(c,id){
 const best=chooseBestAttack(c.attacks);
 $(id).textContent=`${c.name} ｜ HP ${c.maxHp} ｜ STR ${c.str} ｜ DEX ${c.dex} ｜ ${best.name} ${best.skill}% / ${best.damage} ｜ 回避 ${c.dodge}`;
}
function saveP1(){myCharacter=readP1();preview(myCharacter,"my-preview");localStorage.setItem("cb-character",JSON.stringify(myCharacter));toast("PLAYER 1を確定しました");if(typeof conn!=="undefined"&&conn?.open)send({type:"character",character:myCharacter})}
function saveP2(){p2Character=readP2();preview(p2Character,"p2-preview");toast("PLAYER 2を確定しました")}

document.querySelectorAll(".p-tab").forEach(btn=>btn.addEventListener("click",()=>{
 const pl=btn.dataset.player;
 document.querySelectorAll(`.p-tab[data-player="${pl}"]`).forEach(x=>x.classList.toggle("active",x===btn));
 $(pl+"-manual").classList.toggle("hidden",btn.dataset.tab!=="manual");
 $(pl+"-json").classList.toggle("hidden",btn.dataset.tab!=="json");
}));

$("parse-json").addEventListener("click",()=>{
 try{const c=parseCcf(JSON.parse($("ccfolia-json").value));applyP1(c);const best=chooseBestAttack(c.attacks);$("import-result").textContent=`読み込み成功：${c.name} / 採用 ${best.name} ${best.skill}% / ${best.damage} / 期待値 ${attackExpectedValue(best).toFixed(2)}`;document.querySelector('.p-tab[data-player="p1"][data-tab="manual"]').click()}
 catch(e){console.error(e);$("import-result").textContent="JSONを読み込めませんでした。"}
});
$("p2-parse-json").addEventListener("click",()=>{
 try{const c=parseCcf(JSON.parse($("p2-ccfolia-json").value));applyP2(c);const best=chooseBestAttack(c.attacks);$("p2-import-result").textContent=`読み込み成功：${c.name} / 採用 ${best.name} ${best.skill}% / ${best.damage} / 期待値 ${attackExpectedValue(best).toFixed(2)}`;document.querySelector('.p-tab[data-player="p2"][data-tab="manual"]').click()}
 catch(e){console.error(e);$("p2-import-result").textContent="JSONを読み込めませんでした。"}
});
$("save-char").addEventListener("click",saveP1);
$("save-p2").addEventListener("click",saveP2);

$("local-start").addEventListener("click",()=>{
 saveP1();saveP2();
 netMode="local";myRole=0;
 initBattle([freshCharacter(myCharacter),freshCharacter(p2Character)]);
 showBattle();
});
$("host-btn").addEventListener("click",()=>{saveP1();createRoom()});
$("join-btn").addEventListener("click",()=>{saveP1();joinRoom($("room-code").value.trim())});
$("copy-room").addEventListener("click",async()=>{await navigator.clipboard.writeText($("room-display").textContent);toast("部屋コードをコピーしました")});
["attack","heavy","grapple","guard","observe","heal","dodge","counter","take"].forEach(id=>$(id).addEventListener("click",()=>submitIntent(id)));
$("leave-btn").addEventListener("click",()=>location.reload());

bindImage("char-image","char-image-preview","p1");bindImage("p2-image","p2-image-preview","p2");
try{const c=JSON.parse(localStorage.getItem("cb-character"));if(c){myCharacter=c;applyP1(c);preview(c,"my-preview")}}catch(e){}

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
