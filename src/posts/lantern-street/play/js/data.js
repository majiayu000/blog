'use strict';
// 数据表：街坊（可选角色）、熄灯帮喽啰、头目、关卡。改名字、配色、数值都在这里。

// 前两位一开始就能用，第 N 位（下标 N+1）在第 N 关救出
const HEROES = [
  { id: 'man', name: '小满', tag: '溜溜球少女', hp: 100, spd: 190, pow: 1.0, reach: 70, sp: 'spin', spName: '陀螺旋风', spDesc: '化身陀螺横冲直撞，可以边转边移动，卷飞身边的敌人',
    quote: '灯笼街的灯，一盏都不能少！',
    look: { build: 'kid', skin: '#f7d2ae', shirt: '#f0524f', pants: '#34406b', shoe: '#fafafa', hair: 'twin', hairC: '#2b1c1c', deco: 'stripe', decoC: '#ffd23f', weapon: { t: 'yoyo', c: '#ffd23f' } } },
  { id: 'pao', name: '阿炮', tag: '弹弓小子', hp: 95, spd: 200, pow: 1.0, reach: 62, sp: 'marbles', spName: '弹珠暴雨', spDesc: '朝天打出一把弹珠，自动砸向屏幕上的敌人',
    quote: '看我的，百发百中！',
    look: { build: 'kid', skin: '#eebf95', shirt: '#3fa66b', pants: '#5a4632', shoe: '#f5d547', hair: 'spiky', hairC: '#3a2a1a', hat: 'band', hatC: '#f5d547', weapon: { t: 'sling' } } },
  { id: 'wang', name: '王叔', tag: '包子铺掌柜', hp: 140, spd: 150, pow: 1.3, reach: 74, sp: 'steam', spName: '蒸笼开锅', spDesc: '一锅蒸汽炸开，掀翻周围一大圈敌人，自己还能回一口血',
    quote: '谢了孩子们！谁动我的蒸笼，我跟谁急。',
    look: { build: 'big', skin: '#eebf95', shirt: '#e9e4d8', pants: '#3b3f4a', hair: 'short', hairC: '#2a2020', hat: 'chef', acc: 'moustache', deco: 'apron', decoC: '#ffffff', weapon: { t: 'stick', len: 26, w: 7, c: '#d9b07a' } } },
  { id: 'chen', name: '陈奶奶', tag: '广场舞领队', hp: 85, spd: 165, pow: 0.9, reach: 64, sp: 'rings', spName: '广场舞音浪', spDesc: '三圈音浪向外扩散，把大范围的敌人震得原地发懵',
    quote: '音响呢？奶奶我要开始领舞了。',
    look: { build: 'small', skin: '#f2cdb0', shirt: '#9b59b6', pants: '#4a3a5c', hair: 'bun', hairC: '#d3d3da', acc: 'glasses', deco: 'dots', decoC: '#ffd6f0', weapon: { t: 'fan', c: '#ff8fb1' } } },
  { id: 'fei', name: '阿飞', tag: '闪送小哥', hp: 95, spd: 225, pow: 0.95, reach: 62, sp: 'blitz', spName: '闪电连送', spDesc: '瞬间在敌人之间连续穿梭，每人送上一击，期间无敌',
    quote: '这一单超时了……不过还来得及。',
    look: { build: 'slim', skin: '#eebf95', shirt: '#ffc93c', pants: '#2d3142', hair: 'short', hairC: '#2a2020', hat: 'helmet', hatC: '#ffc93c', deco: 'bag', decoC: '#2d3142', weapon: { t: 'box' } } },
  { id: 'you', name: '小柚', tag: '奶茶店店长', hp: 100, spd: 185, pow: 0.95, reach: 62, sp: 'heal', spName: '全糖补给', spDesc: '给全队回血，还能把倒下的队友拉起来，顺便洒出一圈珍珠',
    quote: '大家辛苦啦，全场我请！',
    look: { build: 'adult', skin: '#f7d2ae', shirt: '#4ecdc4', pants: '#f7f1e3', shoe: '#ff8fb1', hair: 'pony', hairC: '#6b3f2a', deco: 'apron', decoC: '#ffe8d6', weapon: { t: 'cup' } } },
  { id: 'li', name: '李师傅', tag: '修车铺老板', hp: 115, spd: 170, pow: 1.15, reach: 76, sp: 'turret', spName: '扳手炮台', spDesc: '放下一座自动炮台，9 秒内持续向最近的敌人开火',
    quote: '没有修不好的车，也没有收拾不了的捣蛋鬼。',
    look: { build: 'adult', skin: '#d9a57a', shirt: '#3d6fb4', pants: '#2f4f7f', hair: 'short', hairC: '#2a2020', hat: 'cap', hatC: '#d9534f', deco: 'belt', decoC: '#ffd23f', weapon: { t: 'stick', len: 24, w: 5, c: '#b8c0c8', tip: { r: 6, c: '#b8c0c8' } } } },
  { id: 'zhou', name: '周老师', tag: '旧书店主人', hp: 90, spd: 170, pow: 1.0, reach: 62, sp: 'freeze', spName: '安静！', spDesc: '一声令下，全屏敌人定在原地好几秒，定身时受伤更重',
    quote: '书店里不许喧哗，街上也一样。',
    look: { build: 'slim', skin: '#f7d2ae', shirt: '#8d6e4b', pants: '#3e3a36', hair: 'bob', hairC: '#1f1b1b', acc: 'glasses', deco: 'vest', decoC: '#5d4630', weapon: { t: 'book' } } },
  { id: 'sao', name: '阿扫', tag: '扫街机器人', hp: 125, spd: 160, pow: 1.1, reach: 72, sp: 'laser', spName: '大扫除光束', spDesc: '向前方射出一道贯穿全屏的光束，持续灼烧同一条线上的敌人',
    quote: '检测到 大量垃圾。开始 清扫。',
    look: { build: 'adult', boxy: true, head: 'robot', skin: '#cfd8dc', shirt: '#eceff1', pants: '#78909c', shoe: '#455a64', eye: '#4dd0e1', deco: 'gear', decoC: '#ffca28', weapon: { t: 'stick', len: 30, w: 4, c: '#8d6e63', tip: { r: 7, c: '#ffca28' } } } },
  { id: 'guan', name: '老馆长', tag: '武馆传人', hp: 110, spd: 195, pow: 1.3, reach: 68, sp: 'flurry', spName: '百步连环', spDesc: '一步冲到敌人面前打出七连击，最后一下把人送上天',
    quote: '灯亮了。孩子们，这一仗打得漂亮。',
    look: { build: 'adult', skin: '#eebf95', shirt: '#f5f5f0', pants: '#2b2b2b', hair: 'bald', acc: 'beard', deco: 'belt', decoC: '#c0392b' } },
];
const START_HEROES = 2;
const heroUnlocked = i => i < START_HEROES || Save.d.cleared >= i - START_HEROES + 1;

const HOOD = (c, s, extra) => Object.assign({ build: 'adult', head: 'hood', hoodC: c, shirt: c, pants: '#2a2236', shoe: '#17121f', skin: '#3a2f4a', eye: '#ffe066', scale: s || 1 }, extra);
const ENEMIES = {
  g: { name: '喽啰', hp: 38, spd: 95, ai: 'grunt', range: 50, atk: 'punch', look: HOOD('#6b4fa3') },
  r: { name: '飞毛腿', hp: 28, spd: 175, ai: 'runner', look: HOOD('#2f9c95', 0.92, { build: 'slim', eye: '#b6fff0' }) },
  t: { name: '投手', hp: 30, spd: 110, ai: 'thrower', look: HOOD('#d98236', 0.95, { deco: 'bag', decoC: '#8a4f1d' }) },
  s: { name: '锅盖兵', hp: 52, spd: 80, ai: 'grunt', range: 52, atk: 'bash', shield: true, look: HOOD('#3f6fb5', 1, { shield: '#b9c4cf' }) },
  b: { name: '大块头', hp: 115, spd: 62, ai: 'grunt', range: 66, atk: 'slam', armor: true, r: 24, look: HOOD('#a8433d', 1.2, { build: 'big', eye: '#ff8a65' }) },
  o: { name: '点火怪', hp: 16, spd: 150, ai: 'bomber', draw: 'bomb', h: 40, r: 15 },
  d: { name: '巡逻机', hp: 22, spd: 135, ai: 'drone', draw: 'drone', h: 30, r: 16, fly: true },
};

// moves[i] 是第 i+1 阶段可用的招式；phases 是进入下一阶段的血量比例
const BOSSES = [
  { name: '铁桶队长', hp: 520, stag: 110, cool: [1.3, 2.0], phases: [0.5], moves: [['melee', 'charge'], ['melee', 'charge', 'slam']], minions: ['g'], shot: 'orb',
    line: '这条街的灯，归熄灯帮了！',
    look: { build: 'big', scale: 1.5, head: 'bucket', skin: '#9aa7b1', shirt: '#6d7a86', pants: '#3b4450', shoe: '#20262c', deco: 'belt', decoC: '#ffcf40', weapon: { t: 'stick', len: 30, w: 6, c: '#8a949c' } } },
  { name: '双响喇叭', hp: 600, stag: 115, cool: [1.3, 2.0], phases: [0.5], moves: [['fan', 'summon', 'melee'], ['fan', 'summon', 'beam', 'melee']], minions: ['g', 'r'], shot: 'note', fanN: 5,
    line: '音量开到最大——吵到你们睁不开眼！',
    look: { build: 'adult', scale: 1.5, head: 'speaker', skin: '#3a2d52', shirt: '#7b4bb3', pants: '#2a2236', shoe: '#17121f', deco: 'stripe', decoC: '#ffd23f' } },
  { name: '滑板飞贼', hp: 640, stag: 100, cool: [1.0, 1.6], phases: [0.5], bounces: 2, board: true, moves: [['charge', 'fan', 'melee'], ['charge', 'fan', 'blink']], minions: ['r'], shot: 'can', fanN: 3,
    line: '想抓我？先追上我的板子再说！',
    look: { build: 'slim', scale: 1.4, skin: '#eebf95', shirt: '#3fa66b', pants: '#30343f', shoe: '#f0524f', hair: 'short', hairC: '#2a2020', hat: 'beanie', hatC: '#e84a5f' } },
  { name: '铁板大厨', hp: 760, stag: 125, cool: [1.2, 1.9], phases: [0.5], moves: [['rain', 'spin', 'melee'], ['rain', 'spin', 'fan', 'melee']], minions: ['o'], shot: 'fire', fanN: 5,
    line: '今晚的菜单只有一道：爆炒街坊！',
    look: { build: 'big', scale: 1.55, skin: '#eebf95', shirt: '#f5f5f5', pants: '#30343f', hair: 'short', hairC: '#2a2020', hat: 'chef', acc: 'moustache', deco: 'apron', decoC: '#e84a5f', weapon: { t: 'stick', len: 22, w: 4, c: '#9aa7b1', flat: 14 } } },
  { name: '废品机甲', hp: 880, stag: 140, cool: [1.2, 1.9], phases: [0.5], moves: [['slam', 'rain', 'melee'], ['slam', 'rain', 'beam', 'melee']], minions: ['d'], shot: 'bolt',
    line: '回收 目标：所有 会发光的 东西。',
    look: { build: 'big', boxy: true, scale: 1.7, head: 'robot', skin: '#b08968', shirt: '#9c6644', pants: '#5c4033', shoe: '#3a2a20', eye: '#ff5340', deco: 'gear', decoC: '#ffcf40' } },
  { name: '雾影魔术师', hp: 820, stag: 110, cool: [1.0, 1.6], phases: [0.5], moves: [['blink', 'fan', 'summon'], ['blink', 'fan', 'summon', 'rain']], minions: ['r', 't'], shot: 'card', fanN: 7,
    line: '女士们先生们，接下来是——消失的灯光。',
    look: { build: 'slim', scale: 1.5, skin: '#e8e0f0', shirt: '#2c2140', pants: '#17121f', shoe: '#0f0b16', hair: 'short', hairC: '#17121f', hat: 'tophat', hatC: '#17121f', deco: 'cape', decoC: '#7b1f4b', weapon: { t: 'card' } } },
  { name: '冰棍霸王', hp: 980, stag: 140, cool: [1.1, 1.8], phases: [0.5], moves: [['beam', 'charge', 'slam'], ['beam', 'charge', 'slam', 'spin']], minions: ['b'], shot: 'ice',
    line: '把这条街，冻成一根老冰棍！',
    look: { build: 'big', scale: 1.6, head: 'pop', skin: '#7fd4ff', shirt: '#eaf6ff', pants: '#4f7ea8', shoe: '#2b4a66', deco: 'stripe', decoC: '#7fd4ff' } },
  { name: '熄灯大王', hp: 1350, stag: 160, cool: [0.9, 1.5], phases: [0.66, 0.33], moves: [['melee', 'fan', 'charge'], ['melee', 'fan', 'blink', 'rain', 'summon'], ['blink', 'rain', 'beam', 'slam', 'spin', 'fan']], minions: ['g', 's', 'r'], shot: 'dark', fanN: 7, final: true,
    line: '光？我只喜欢黑漆漆的夜晚。大灯笼是我的了！',
    look: { build: 'big', scale: 1.8, head: 'dark', skin: '#1a1326', shirt: '#2a1f3d', pants: '#17121f', shoe: '#0f0b16', deco: 'cape', decoC: '#3d1f5c', weapon: { t: 'stick', len: 34, w: 4, c: '#6d5a2e', tip: { r: 8, c: '#3d3550' } } } },
];

// waves：每段两到三波；g 喽啰 r 飞毛腿 t 投手 s 锅盖兵 b 大块头 o 点火怪 d 巡逻机
const STAGES = [
  { name: '灯笼街口', theme: 'street', music: 'stageA', waves: [['gg', 'ggg'], ['ggr', 'grrg'], ['ggt', 'grrt']] },
  { name: '夜市', theme: 'market', music: 'stageB', waves: [['ggr', 'gtt'], ['ggs', 'grrt'], ['gss', 'ggtto']] },
  { name: '滨河公园', theme: 'park', music: 'stageA', waves: [['rrg', 'rrt'], ['gso', 'rrss'], ['ggd', 'rtdo']] },
  { name: '美食巷', theme: 'alley', music: 'stageB', waves: [['ggb', 'ttog'], ['sso', 'grrd'], ['bgg', 'ttdd', 'oorr']] },
  { name: '废品站', theme: 'scrap', music: 'stageA', waves: [['gsb', 'ood'], ['rrtt', 'bsg'], ['ddd', 'bbo', 'grst']] },
  { name: '老戏院', theme: 'hall', music: 'stageB', waves: [['rrrr', 'tts'], ['bso', 'ddtg'], ['ssb', 'rroo', 'gbtd']] },
  { name: '冷库码头', theme: 'dock', music: 'stageA', waves: [['gbb', 'dddt'], ['ssoo', 'rrbt'], ['ggss', 'bbd', 'ttoor']] },
  { name: '钟楼顶', theme: 'roof', music: 'stageB', waves: [['grst', 'bod'], ['ssbb', 'ddtto'], ['rrrro', 'bbs', 'gtdbo']] },
];

const THEMES = {
  street: { kind: 'street', sky: ['#f08a5d', '#ffd9a0'], orb: ['#fff3c4', 0.72, 0.5, 46], far: '#b65f6f', farWin: '#ffd58a', walls: ['#c96f53', '#b85c4a', '#d08a5a', '#a6524b'], roof: '#4a2f3a', ground: ['#94706a', '#6a4d56'], gline: '#523a44', signs: '茶面包饺糖鲜酒书', lantern: '#ff5a3c', amb: 'ember', tint: 'rgba(255,150,80,.07)' },
  market: { kind: 'market', sky: ['#171a45', '#5b3a7a'], orb: ['#fdf6d8', 0.2, 0.22, 26], stars: 1, far: '#2a2553', farWin: '#ffcf70', walls: ['#3b2f5e', '#33284f'], roof: '#1d1730', ground: ['#5d4d6e', '#3a2f4e'], gline: '#2b2238', awn: ['#e84a5f', '#ffb347', '#4ecdc4', '#f6f1e4'], lantern: '#ffcf40', amb: 'firefly', tint: 'rgba(120,90,220,.08)' },
  park: { kind: 'park', sky: ['#33488a', '#f2a7a0'], orb: ['#ffe9c9', 0.3, 0.62, 36], far: '#4c5c95', farWin: '#ffe2a0', tree: ['#2f6f5a', '#3d8a66', '#285c4c'], ground: ['#7d8f78', '#4f6658'], gline: '#3d5247', lantern: '#ffd76a', amb: 'leaf', tint: 'rgba(120,160,255,.06)' },
  alley: { kind: 'street', sky: ['#24163a', '#7a3350'], orb: ['#ffe9c9', 0.82, 0.2, 22], stars: 1, far: '#3b2148', farWin: '#ff9f6b', walls: ['#8c3f47', '#7a3340', '#a14d3f', '#6a2d42'], roof: '#2a1626', ground: ['#74525c', '#48303f'], gline: '#372230', signs: '串锅面粥酒卤烤鲜', lantern: '#ff4d3d', amb: 'steam', tint: 'rgba(255,90,60,.08)' },
  scrap: { kind: 'yard', sky: ['#4a5560', '#d1a878'], orb: ['#ffe3b0', 0.6, 0.55, 40], far: '#5c6068', farWin: '#c9b38a', junk: ['#8a6f55', '#6d7a86', '#a8553d', '#59646e', '#b08968'], fence: '#4d4a4a', ground: ['#857565', '#5a4d47'], gline: '#463b37', amb: 'ember', tint: 'rgba(200,160,90,.07)' },
  hall: { kind: 'hall', sky: ['#2a0f1c', '#4a1c2c'], far: '#2a0f1c', wall: '#5a2233', curtain: ['#a3243b', '#7d1a2e'], ground: ['#7a5236', '#4e3323'], gline: '#3a2518', plank: 1, lantern: '#ffd76a', amb: 'dust', tint: 'rgba(255,200,120,.06)' },
  dock: { kind: 'yard', sky: ['#0d2545', '#4f8fb0'], orb: ['#eaf6ff', 0.25, 0.25, 30], stars: 1, far: '#1c3a5c', farWin: '#bfe6ff', junk: ['#2f6f9c', '#c9504a', '#e0a23a', '#3f8f7a', '#7a8794'], fence: '#24384f', cont: 1, ground: ['#6f8496', '#3f5266'], gline: '#31425a', amb: 'snow', tint: 'rgba(120,200,255,.09)' },
  roof: { kind: 'roof', sky: ['#070920', '#2a1f55'], orb: ['#fff7d6', 0.78, 0.3, 58], stars: 1, far: '#141433', farWin: '#ffd58a', ground: ['#4b4763', '#2a2740'], gline: '#1f1c33', lantern: '#ff5a3c', amb: 'firefly', tint: 'rgba(90,70,200,.1)' },
};
