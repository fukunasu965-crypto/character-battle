BGM差し替え方法

このフォルダに好きなBGMを「battle.mp3」という名前で置いてください。

配置場所:
audio/battle.mp3

音量変更:
js/app.js を開いて
battleBgm.volume=0.25;
を変更します。

例:
0.10 = 10%
0.25 = 25%
0.50 = 50%
1.00 = 100%

battle.mp3 は戦闘中ループ再生されます。
