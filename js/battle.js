let characters=[],battle={round:1,turn:0,ap:2,gameOver:false,pending:null,logs:[]};
const current=()=>characters[battle.turn],opponent=()=>characters[1-battle.turn],clamp=v=>Math.max(5,Math.min(95,v));
function initBattle(chars){characters=chars;battle={round:1,turn:chars[0].dex>=chars[1].dex?0:1,ap:2,gameOver:false,pending:null,logs:[]};characters.forEach(c=>{c.state.rp=2;c.state.normalAttacks=0});log("戦闘開始！","special");log(`${current().name}が先攻！`)}
function exportBattleState(){return JSON.parse(JSON.stringify({characters,battle}))}
function loadBattleState(s){characters=s.characters;battle=s.battle;render()}
function log(t,c=""){battle.logs.push({t,c});if(battle.logs.length>100)battle.logs.shift()}
function effectiveAttack(c,type="normal"){let mod=c.state.attackBonus+(c.state.spirit>=3?10:0);if(type==="heavy")mod-=15;if(type==="normal"&&c.state.normalAttacks>0)mod-=15;return clamp(c.skills.attack+mod)}
function effectiveDodge(c,observed=false){return clamp(c.skills.dodge+(c.state.guard?15:0)-(observed?15:0))}
function effectiveCounter(c){return clamp(c.skills.attack-20+(c.state.guard?15:0))}
function performIntent(a,fromRemote){
 if(battle.gameOver)return;
 let actor=battle.pending?battle.pending.defenderIndex:battle.turn;
 if(netMode==="online"&&myRole===0&&fromRemote&&actor!==1)return;
 if(netMode==="online"&&myRole===0&&!fromRemote&&actor!==0)return;
 if(battle.pending){if(["dodge","counter","take"].includes(a))reaction(a);return}
 if(["attack","heavy","guard","observe","heal"].includes(a))action(a);
 syncState();render()
}
function action(a){
 let c=current();if(a==="attack"&&battle.ap>=1)return attack("normal",1);
 if(a==="heavy"&&battle.ap>=2)return attack("heavy",2);
 if(a==="guard"&&battle.ap>=1){c.state.guard=true;battle.ap--;log(`🛡 ${c.name}は防御態勢。`,"buff");finish()}
 if(a==="observe"&&battle.ap>=1){c.state.attackBonus=20;battle.ap--;log(`👁 ${c.name}は観察。次の攻撃+20。`,"buff");finish()}
 if(a==="heal"&&battle.ap>=2){battle.ap-=2;let r=rollD100(),z=judgeRoll(r,c.skills.firstAid),h=z.type==="oneCritical"?5:z.type==="critical"?rollDice(3)+2:z.type==="success"?rollDice(3):0;log(`❤ 応急手当 ${r}/${c.skills.firstAid} → ${z.text}`);if(h){let old=c.hp;c.hp=Math.min(c.maxHp,c.hp+h);log(`HP ${c.hp-old}回復。`,"heal")}else if(z.type==="hundredFumble"){c.hp=Math.max(1,c.hp-2);battle.ap=0;c.state.rp=0;log("大失敗：HP-2 / AP・RP喪失。","damage")}finish()}
}
function attack(type,cost){
 let c=current(),skill=effectiveAttack(c,type),observed=c.state.attackBonus>0,spirit=c.state.spirit;c.state.attackBonus=0;c.state.spirit=0;if(type==="normal")c.state.normalAttacks++;battle.ap-=cost;
 let r=rollD100(),z=judgeRoll(r,skill);log(`${type==="normal"?"⚔ 通常攻撃":"💥 強攻撃"} ${r}/${skill} → ${z.text}`,z.rank>=4||z.rank<=1?"special":"");
 if(spirit)log(`🔥 闘志${spirit}消費：ダメージ+${spirit}`,"buff");
 if(z.type==="oneCritical"){battle.ap=Math.min(2,battle.ap+1);log("AP+1！","special")}
 if(z.type==="hundredFumble"){battle.ap=0;c.state.rp=0;log("AP・RPをすべて失った。","damage");return finish()}
 if(z.type==="fumble"){c.state.rp=Math.max(0,c.state.rp-1);return finish()}
 if(z.type==="failure")return finish();
 battle.pending={attackerIndex:battle.turn,defenderIndex:1-battle.turn,type,result:z,observed,spirit};log(`${opponent().name}のリアクション。`)
}
function reaction(type){
 let p=battle.pending,d=characters[p.defenderIndex];if(type==="dodge"&&d.state.rp<2)return;if(type==="counter"&&d.state.rp<1)return;
 if(type==="take"){if(p.type!=="heavy"){d.state.spirit=Math.min(3,d.state.spirit+1);log(`🔥 ${d.name} 闘志+1。`,"buff")}damage();return endReaction()}
 d.state.rp-=type==="dodge"?2:1;let skill=type==="dodge"?effectiveDodge(d,p.observed):effectiveCounter(d),r=rollD100(),z=judgeRoll(r,skill);log(`${type==="dodge"?"🛡 回避":"⚔ 反撃"} ${r}/${skill} → ${z.text}`);
 if(z.type==="oneCritical"){d.state.attackBonus+=20;log("次の攻撃+20。","buff")}
 if(z.type==="hundredFumble"){d.state.rp=0;damage(4);return endReaction()}if(z.type==="fumble"){damage(2);return endReaction()}
 if(z.rank>=p.result.rank){if(type==="dodge")log("攻撃を回避！");else if(z.rank>=3)counterDamage(z);else log("攻撃をしのいだ。")}else damage();endReaction()
}
function rawDamage(p){let z=p.result;if(p.type==="heavy"){if(z.type==="oneCritical")return 10+rollDice(6)+rollDice(4);if(z.type==="critical")return rollDice(6)+rollDice(6)+rollDice(4)+rollDice(4);return rollDice(6)+rollDice(4)}if(z.type==="oneCritical")return 6+rollDice(4);if(z.type==="critical")return rollDice(4)+rollDice(4)+2;return rollDice(4)+1}
function damage(extra=0){let p=battle.pending,d=characters[p.defenderIndex],n=rawDamage(p)+p.spirit+extra;if(d.state.guard){if(p.type==="heavy"){d.state.guard=false;log("💥 ガードブレイク！","special")}else{n=Math.max(0,n-2);d.state.guard=false;log("🛡 ダメージ-2。","buff")}}d.hp=Math.max(0,d.hp-n);log(`${d.name}に ${n}ダメージ！`,"damage");checkEnd()}
function counterDamage(z){let p=battle.pending,a=characters[p.attackerIndex],n=z.type==="oneCritical"?3+rollDice(3):z.type==="critical"?rollDice(3)+rollDice(3):rollDice(3);a.hp=Math.max(0,a.hp-n);log(`反撃！ ${a.name}に ${n}ダメージ。`,"damage");checkEnd()}
function endReaction(){battle.pending=null;if(!battle.gameOver&&battle.ap<=0)endTurn()}
function finish(){if(!battle.gameOver&&!battle.pending&&battle.ap<=0)endTurn()}
function endTurn(){battle.turn=1-battle.turn;if(battle.turn===0)battle.round++;battle.ap=2;current().state.rp=2;current().state.normalAttacks=0;log(`--- ROUND ${battle.round} / ${current().name} ---`,"special")}
function checkEnd(){let i=characters.findIndex(c=>c.hp<=0);if(i<0)return;battle.gameOver=true;log(`${characters[i].name} 戦闘不能！`,"special");log(`🏆 ${characters[1-i].name} WIN！`,"special")}