let inBattle=false;
const el=id=>document.getElementById(id);
let imageData={p1:"",p2:""}, importedAttacks={p1:null,p2:null};
let myCharacter=null,p2Character=null,remoteCharacter=null;

function toast(t){el("toast").textContent=t;el("toast").classList.add("show");setTimeout(()=>el("toast").classList.remove("show"),1600)}
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
 const attacks=importedAttacks.p1||[{name:"攻撃",skill:val("char-atk"),damage:el("char-dmg").value||"1D4+1",kind:"damage"}];
 return {name:el("char-name").value.trim()||"PLAYER 1",maxHp:val("char-hp"),str:val("char-str"),dex:val("char-dex"),attack:val("char-atk"),dodge:val("char-dodge"),firstAid:val("char-aid"),image:imageData.p1,attacks};
}
function readP2(){
 const attacks=importedAttacks.p2||[{name:"攻撃",skill:val("p2-atk"),damage:el("p2-dmg").value||"1D4+1",kind:"damage"}];
 return {name:el("p2-name").value.trim()||"PLAYER 2",maxHp:val("p2-hp"),str:val("p2-str"),dex:val("p2-dex"),attack:val("p2-atk"),dodge:val("p2-dodge"),firstAid:val("p2-aid"),image:imageData.p2,attacks};
}
function applyP1(c){
 importedAttacks.p1=c.attacks||[]; const best=chooseBestAttack(c.attacks);
 el("char-name").value=c.name;el("char-hp").value=c.maxHp;el("char-str").value=c.str;el("char-dex").value=c.dex;
 el("char-atk").value=best.skill;el("char-dmg").value=best.damage;el("char-dodge").value=c.dodge;el("char-aid").value=c.firstAid;
}
function applyP2(c){
 importedAttacks.p2=c.attacks||[]; const best=chooseBestAttack(c.attacks);
 el("p2-name").value=c.name;el("p2-hp").value=c.maxHp;el("p2-str").value=c.str;el("p2-dex").value=c.dex;
 el("p2-atk").value=best.skill;el("p2-dmg").value=best.damage;el("p2-dodge").value=c.dodge;el("p2-aid").value=c.firstAid;
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

el("parse-json").addEventListener("click",()=>{
 try{const c=parseCcf(JSON.parse(el("ccfolia-json").value));applyP1(c);const best=chooseBestAttack(c.attacks);el("import-result").textContent=`読み込み成功：${c.name} / 採用 ${best.name} ${best.skill}% / ${best.damage} / 期待値 ${attackExpectedValue(best).toFixed(2)}`;document.querySelector('.p-tab[data-player="p1"][data-tab="manual"]').click()}
 catch(e){console.error(e);el("import-result").textContent="JSONを読み込めませんでした。"}
});
el("p2-parse-json").addEventListener("click",()=>{
 try{const c=parseCcf(JSON.parse(el("p2-ccfolia-json").value));applyP2(c);const best=chooseBestAttack(c.attacks);el("p2-import-result").textContent=`読み込み成功：${c.name} / 採用 ${best.name} ${best.skill}% / ${best.damage} / 期待値 ${attackExpectedValue(best).toFixed(2)}`;document.querySelector('.p-tab[data-player="p2"][data-tab="manual"]').click()}
 catch(e){console.error(e);el("p2-import-result").textContent="JSONを読み込めませんでした。"}
});
el("save-char").addEventListener("click",saveP1);
el("save-p2").addEventListener("click",saveP2);

el("local-start").addEventListener("click",()=>{
 try{
   saveP1();saveP2();
   netMode="local";myRole=0;
   initBattle([freshCharacter(myCharacter),freshCharacter(p2Character)]);
   showBattle();
 }catch(err){
   console.error(err);
   toast("対戦開始エラー：" + (err?.message||err));
 }
});
el("host-btn").addEventListener("click",()=>{saveP1();createRoom()});
el("join-btn").addEventListener("click",()=>{saveP1();joinRoom(el("room-code").value.trim())});
el("copy-room").addEventListener("click",async()=>{await navigator.clipboard.writeText(el("room-display").textContent);toast("部屋コードをコピーしました")});
["attack","heavy","grapple","guard","observe","heal","dodge","counter","take"].forEach(id=>$(id).addEventListener("click",()=>submitIntent(id)));
el("leave-btn").addEventListener("click",()=>{inBattle=false;location.reload()});

bindImage("char-image","char-image-preview","p1");bindImage("p2-image","p2-image-preview","p2");
try{const c=JSON.parse(localStorage.getItem("cb-character"));if(c){myCharacter=c;applyP1(c);preview(c,"my-preview")}}catch(e){}

function canOperate(){
 if(netMode==="local")return true;
 if(!battle)return false;
 const actor=battle.pending?battle.pending.defenderIndex:battle.turn;
 return myRole===actor;
}
function showBattle(){
 inBattle=true;
 el("lobby").classList.remove("active");
 el("lobby").classList.add("hidden");
 el("battle-screen").classList.remove("hidden");
 el("battle-screen").classList.add("active");
 render();
}
function stat(label,base,eff){
 const changed=String(base)!==String(eff);
 return `<div class="stat"><span>${label}</span><b>${changed?`${base} → ${eff}`:base}</b></div>`;
}
function render(){
 if(!characters||characters.length<2||!battle)return;
 for(let i=0;i<2;i++){
   const c=characters[i],n=i+1;
   el("name"+n).textContent=c.name;
   const pi=el("portrait"+n);
   if(c.image){pi.src=c.image;pi.style.display="block"}else{pi.removeAttribute("src");pi.style.display="none"}
   el("hp"+n).textContent=`${c.hp} / ${c.maxHp}`;
   el("hpbar"+n).style.width=`${Math.max(0,c.hp/c.maxHp*100)}%`;
   const atk=effectiveAttack(c,"normal"),dod=effectiveDodge(c,battle.pending?.observed&&battle.pending?.defenderIndex===i),ctr=effectiveCounter(c);
   el("stats"+n).innerHTML=stat("STR",c.str,c.str)+stat("DB",c.db||"0",c.db||"0")+stat("攻撃",c.skills.attack,atk)+stat("回避",c.skills.dodge,dod)+stat("反撃",c.skills.attack,ctr);
   el("states"+n).innerHTML=[
     c.state.guard?"<span>防御</span>":"",
     c.state.attackBonus?"<span>観察 +20</span>":"",
     c.state.spirit?`<span>闘志 ${c.state.spirit}</span>`:"",
     `<span>RP ${c.state.rp}</span>`
   ].join("");
 }
 el("round").textContent=`ROUND ${battle.round}`;
 el("turn-name").textContent=battle.pending?"リアクション":`${current().name}のターン`;
 el("ap").textContent="●".repeat(battle.ap)+"○".repeat(Math.max(0,2-battle.ap));

 const c=current(),w=selectedAttack(c),a=effectiveAttack(c,"normal"),hv=effectiveAttack(c,"heavy"),gw=grappleOf(c);
 el("attack-chance").textContent=`判定 ${a}%`;
 el("attack-detail").textContent=`${w.name} ${w.skill}% / ${w.damage} / 命中込み期待値 ${attackExpectedValue(w).toFixed(2)} / 1AP`;
 el("heavy-chance").textContent=`判定 ${hv}%`;
 el("heavy-detail").textContent=`${w.name} / ${w.damage} +1D4 / 2AP`;
 el("grapple-chance").textContent=gw?`判定 ${clamp(gw.skill+c.state.attackBonus)}%`:"技能なし";
 el("grapple-detail").textContent=gw?`${gw.damage} / 命中後 STR対抗 / 1AP`:"キャラシに組み付きなし";
 el("heal-chance").textContent=`判定 ${c.skills.firstAid}%`;

 const actionIds=["attack","heavy","grapple","guard","observe","heal"];
 const reactionIds=["dodge","counter","take"];
 const reaction=!!battle.pending;
 el("actions").classList.toggle("hidden",reaction);
 el("reactions").classList.toggle("hidden",!reaction);

 actionIds.forEach(id=>el(id).disabled=battle.gameOver||reaction||!canOperate());
 if(!reaction){
   el("attack").disabled ||= battle.ap<1;
   el("heavy").disabled ||= battle.ap<2;
   el("grapple").disabled ||= battle.ap<1||!gw;
   el("guard").disabled ||= battle.ap<1;
   el("observe").disabled ||= battle.ap<1;
   el("heal").disabled ||= battle.ap<2;
 }
 reactionIds.forEach(id=>el(id).disabled=battle.gameOver||!reaction||!canOperate());
 if(reaction){
   const d=characters[battle.pending.defenderIndex];
   el("dodge-detail").textContent=`判定 ${effectiveDodge(d,battle.pending.observed)}% / 2RP`;
   el("counter-detail").textContent=`判定 ${effectiveCounter(d)}% / 1RP`;
   el("dodge").disabled ||= d.state.rp<2;
   el("counter").disabled ||= d.state.rp<1;
 }
 el("log").innerHTML=(battle.log||[]).map(x=>`<div class="${x.cls||""}">${escapeHtml(x.text)}</div>`).join("");
 el("log").scrollTop=el("log").scrollHeight;
}
function escapeHtml(s){return String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]))}
function lockAll(){document.querySelectorAll(".commands button").forEach(b=>b.disabled=true)}

window.addEventListener("DOMContentLoaded",()=>{
 const status=document.getElementById("my-preview");
 if(status && !status.dataset.ready){status.dataset.ready="1";}
});
