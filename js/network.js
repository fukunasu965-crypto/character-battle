let peer=null,conn=null,netMode="local",myRole=0,remoteReady=false;
function setNet(text,online=false){$("net-status").textContent=text;$("net-status").parentElement.classList.toggle("online",online)}
function makeCode(){return "cb-"+Math.random().toString(36).slice(2,8)}
function createRoom(){
 if(typeof Peer==="undefined"){toast("通信ライブラリを読み込めませんでした");return}
 netMode="online";myRole=0;let code=makeCode();peer=new Peer(code);
 peer.on("open",id=>{$("room-display").textContent=id.replace("cb-","").toUpperCase();$("room-box").classList.remove("hidden");setNet("部屋を公開中",true)});
 peer.on("connection",c=>{if(conn){c.close();return}bindConnection(c);myRole=0;send({type:"character",character:myCharacter});$("waiting").textContent="相手が参加しました。キャラクター待機中…"});
 peer.on("error",e=>{setNet("通信エラー");toast("接続に失敗しました")});
}
function joinRoom(code){
 if(typeof Peer==="undefined"){toast("通信ライブラリを読み込めませんでした");return}
 if(!code)return toast("部屋コードを入力してください");
 netMode="online";myRole=1;peer=new Peer();
 peer.on("open",()=>{let id=code.toLowerCase().startsWith("cb-")?code.toLowerCase():"cb-"+code.toLowerCase();bindConnection(peer.connect(id,{reliable:true}))});
 peer.on("error",()=>{setNet("通信エラー");toast("部屋が見つかりません")});
}
function bindConnection(c){conn=c;c.on("open",()=>{setNet("オンライン対戦",true);send({type:"character",character:myCharacter})});c.on("data",receiveNet);c.on("close",()=>{setNet("相手が切断");lockAll()})}
function send(x){if(conn?.open)conn.send(x)}
function receiveNet(m){
 if(m.type==="character"){remoteCharacter=m.character;remoteReady=true;if(myCharacter){send({type:"character",character:myCharacter});if(myRole===0)tryOnlineStart()} }
 if(m.type==="start"){loadBattleState(m.state);showBattle()}
 if(m.type==="state"){loadBattleState(m.state)}
 if(m.type==="intent"&&myRole===0){performIntent(m.action,true)}
}
function tryOnlineStart(){if(myRole===0&&remoteReady&&myCharacter){initBattle([freshCharacter(myCharacter),freshCharacter(remoteCharacter)]);send({type:"start",state:exportBattleState()});showBattle()}}
function submitIntent(action){if(netMode==="local"||myRole===0)performIntent(action,false);else send({type:"intent",action})}
function syncState(){if(netMode==="online"&&myRole===0)send({type:"state",state:exportBattleState()})}