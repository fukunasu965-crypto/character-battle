"use strict";
(function(){
 const byId=id=>document.getElementById(id);
 function status(t){ const e=byId("online-status"); if(e)e.textContent=t; }
 function room(t){ const box=byId("room-box"), out=byId("room-display"); if(box)box.classList.remove("hidden"); if(out)out.textContent=t; }
 function peerError(prefix,e){ const m=(e&& (e.type||e.message))||"不明"; status(prefix+"："+m); console.error(e); }

 window.__cbCreateRoom=function(){
   status("オンライン：クリックを検出しました");
   room("発行中…");
   try{
     if(typeof window.Peer!=="function") throw new Error("PeerJSが読み込まれていません");
     if(window.__cbPeer && !window.__cbPeer.destroyed) window.__cbPeer.destroy();
     const p=window.__cbPeer=new window.Peer();
     status("オンライン：サーバーへ接続中…");
     p.on("open",id=>{ room(id); status("オンライン：部屋作成完了"); });
     p.on("connection",c=>{
       status("オンライン：相手が接続しました");
       if(window.__cbOnlineBridge) window.__cbOnlineBridge.hostConnected(c);
       else peerError("ゲーム本体との接続失敗",new Error("bridge unavailable"));
     });
     p.on("error",e=>{ room("作成失敗"); peerError("オンラインエラー",e); });
   }catch(e){ room("作成失敗"); peerError("オンラインエラー",e); }
 };

 window.__cbJoinRoom=function(){
   status("オンライン：参加ボタンを検出しました");
   try{
     if(typeof window.Peer!=="function") throw new Error("PeerJSが読み込まれていません");
     const code=(byId("join-code")?.value||"").trim();
     if(!code) throw new Error("ルームコードを入力してください");
     if(window.__cbPeer && !window.__cbPeer.destroyed) window.__cbPeer.destroy();
     const p=window.__cbPeer=new window.Peer();
     status("オンライン：サーバーへ接続中…");
     p.on("open",()=>{
       const c=p.connect(code,{serialization:"json",reliable:true});
       c.on("open",()=>{
         status("オンライン：ルームに接続しました");
         if(window.__cbOnlineBridge) window.__cbOnlineBridge.joinConnected(c);
         else peerError("ゲーム本体との接続失敗",new Error("bridge unavailable"));
       });
       c.on("error",e=>peerError("接続エラー",e));
     });
     p.on("error",e=>peerError("オンラインエラー",e));
   }catch(e){ peerError("オンラインエラー",e); }
 };

 document.addEventListener("DOMContentLoaded",()=>{
   byId("host-btn")?.addEventListener("click",window.__cbCreateRoom);
   byId("join-btn")?.addEventListener("click",window.__cbJoinRoom);
   status("オンライン：操作できます");
 });
})();