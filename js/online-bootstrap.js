"use strict";
(function(){
 const $=id=>document.getElementById(id);
 const status=t=>{if($("online-status"))$("online-status").textContent=t};
 const room=t=>{if($("room-box"))$("room-box").classList.remove("hidden");if($("room-display"))$("room-display").textContent=t};
 const err=(p,e)=>{const m=e?.type||e?.message||"不明";status(p+"："+m);console.error(e)};

 function bridge(){
   return window.__cbOnlineBridge &&
          typeof window.__cbOnlineBridge.hostConnected==="function" &&
          typeof window.__cbOnlineBridge.joinConnected==="function"
          ? window.__cbOnlineBridge:null;
 }
 function peerReady(){
   if(typeof window.Peer!=="function")throw new Error("PeerJSが読み込まれていません");
 }
 function clean4(v){return String(v||"").replace(/\D/g,"").slice(0,4)}

 window.__cbCreateRoom=function(){
   try{
     peerReady();
     const code=clean4($("host-code")?.value);
     if(code.length!==4)throw new Error("4桁の数字を入力してください");
     $("host-code").value=code;
     status("オンライン：部屋を作成中…");room(code);
     if(window.__cbPeer&&!window.__cbPeer.destroyed)window.__cbPeer.destroy();
     // Prefix prevents collisions with unrelated PeerJS users while keeping the visible code 4 digits.
     const peerId="character-battle-"+code;
     const p=window.__cbPeer=new window.Peer(peerId);
     p.on("open",()=>{room(code);status("オンライン：部屋作成完了。相手を待っています");});
     p.on("connection",c=>{
       status("オンライン：相手から接続要求を受信…");
       c.on("open",()=>{
         status("オンライン：対戦相手と接続しました");
         const br=bridge(); if(!br)throw new Error("ゲーム本体との接続に失敗しました"); br.hostConnected(c);
       });
       c.on("error",e=>err("データ接続エラー",e));
     });
     p.on("error",e=>{
       if(e?.type==="unavailable-id")err("その4桁コードは既に使用中です",e);
       else err("オンラインエラー",e);
     });
   }catch(e){err("部屋作成エラー",e)}
 };

 window.__cbJoinRoom=function(){
   try{
     peerReady();
     const code=clean4($("join-code")?.value);
     if(code.length!==4)throw new Error("4桁の数字を入力してください");
     $("join-code").value=code;
     status("オンライン：接続中…");
     if(window.__cbPeer&&!window.__cbPeer.destroyed)window.__cbPeer.destroy();
     const p=window.__cbPeer=new window.Peer();
     p.on("open",()=>{
       const c=p.connect("character-battle-"+code,{serialization:"json",reliable:true});
       c.on("open",()=>{
         status("オンライン：ルームに接続しました");
         const br=bridge(); if(!br)throw new Error("ゲーム本体との接続に失敗しました"); br.joinConnected(c);
       });
       c.on("error",e=>err("データ接続エラー",e));
     });
     p.on("error",e=>err("オンラインエラー",e));
   }catch(e){err("参加エラー",e)}
 };

 document.addEventListener("DOMContentLoaded",()=>{
   $("host-code")?.addEventListener("input",e=>e.target.value=clean4(e.target.value));
   $("join-code")?.addEventListener("input",e=>e.target.value=clean4(e.target.value));
   $("host-btn")?.addEventListener("click",window.__cbCreateRoom);
   $("join-btn")?.addEventListener("click",window.__cbJoinRoom);
   status(bridge()?"オンライン：操作できます":"オンライン：ゲーム本体の準備に失敗しました");
 });
})();