import { expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";

// 文章里的可玩 demo 只有打包产物进仓库，没有源码。这里直接对发布的产物做回归，
// 重新打包后同样的行为必须还在。
const postsDir = path.join(import.meta.dirname, "..", "src", "posts");
const readDemo = (file) => fs.readFileSync(path.join(postsDir, file), "utf8");

/** 从 open 处的括号起，取到与它配对的括号为止（跳过字符串）。 */
function balancedSource(bundle, open) {
  let depth = 0;
  for (let i = open; i < bundle.length; i++) {
    const ch = bundle[i];
    if (ch === '"' || ch === "'" || ch === "`") {
      for (i++; bundle[i] !== ch; i++) if (bundle[i] === "\\") i++;
    } else if ("({[".includes(ch)) {
      depth++;
    } else if (")}]".includes(ch) && --depth === 0) {
      return bundle.slice(open, i + 1);
    }
  }
  throw new Error(`位置 ${open} 的括号没有配对`);
}

/** 取出包含 anchor 的 class 表达式源码：压缩后类名会变，方法名和字符串不会。 */
function classSourceAround(bundle, anchor) {
  const start = bundle.lastIndexOf("class{", bundle.indexOf(anchor));
  if (start === -1) throw new Error(`没有找到包含 ${anchor} 的 class`);
  return `class${balancedSource(bundle, start + 5)}`;
}

/** anchor 是一次调用的开头（含左括号，全包唯一），返回它的整个参数列表源码。 */
function callSourceAt(bundle, anchor) {
  const at = bundle.indexOf(anchor);
  if (at === -1 || bundle.indexOf(anchor, at + 1) !== -1) throw new Error(`${anchor} 应该恰好出现一次`);
  return balancedSource(bundle, at + anchor.lastIndexOf("("));
}

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** 可手动拨动的时钟、定时器和 deviceorientation 监听，代替浏览器全局对象。 */
function fakeMotionBrowser() {
  const listeners = new Map();
  const timers = new Map();
  let now = 1000;
  let nextTimer = 1;
  const globals = {
    window: {
      isSecureContext: true,
      DeviceOrientationEvent: {},
      addEventListener: (type, listener) => listeners.set(type, listener),
      removeEventListener: (type) => listeners.delete(type),
    },
    document: { hidden: false, addEventListener() {} },
    screen: {},
    performance: { now: () => now },
    DeviceOrientationEvent: {},
    setTimeout: (callback, ms) => timers.set(nextTimer, { callback, at: now + ms }) && nextTimer++,
    clearTimeout: (id) => timers.delete(id),
  };
  return {
    globals,
    tilt: (beta, gamma) => listeners.get("deviceorientation")?.({ beta, gamma }),
    advance(ms) {
      now += ms;
      for (const [id, timer] of timers) {
        if (timer.at > now) continue;
        timers.delete(id);
        timer.callback();
      }
    },
  };
}

test("tilt-labyrinth 体感：手机拿稳、浏览器不再派发 deviceorientation 时不自动关闭", async () => {
  const source = classSourceAround(
    readDemo("tilt-labyrinth/play/dist/game.js"),
    'addEventListener("deviceorientation"',
  );
  const start = async () => {
    const browser = fakeMotionBrowser();
    const names = Object.keys(browser.globals);
    const Motion = new Function(...names, `return (${source})`)(...names.map((name) => browser.globals[name]));
    const statuses = [];
    const motion = new Motion((_active, status) => statuses.push(status));
    await motion.enable();
    return { ...browser, motion, statuses };
  };

  const held = await start();
  held.tilt(40, 0); // 第一个样本：当前握姿记为水平
  held.tilt(40, 15);
  expect(held.statuses.at(-1)).toBe("motionReady");
  // Chromium 只在角度变化达到 0.1° 时才派发事件，手机拿稳或放在桌上时会长时间没有新样本。
  held.advance(5000);
  const output = held.motion.read(1 / 240);
  expect(held.statuses.at(-1)).toBe("motionReady");
  expect(held.motion.active).toBe(true);
  expect(output.x).toBeGreaterThan(0);

  // 开启后始终等不到第一个样本，仍然要提示并退回拖动。
  const silent = await start();
  silent.advance(4000);
  expect(silent.statuses.at(-1)).toBe("motionNoData");
  expect(silent.motion.active).toBe(false);
});

test("greyport：?play 直达对局跳过菜单，第一次点击或按键就要启动音频", () => {
  const bundle = readDemo("greyport/play/dist/game.js");
  // 音频只能在用户手势里启动。菜单的“开始部署”会调用音频对象的 start()，
  // 文章给出的 ?play 链接不经过菜单，只能由对局中的输入事件补上。
  for (const type of ["mousedown", "keydown"]) {
    expect(callSourceAt(bundle, `addEventListener("${type}",`)).toMatch(/[\w$]\.start\(\)/);
  }
});

test("greyport：触屏设备进了对局要能点出暂停菜单，菜单里说明需要键鼠", () => {
  const page = readDemo("greyport/play/index.html");
  const bundle = readDemo("greyport/play/dist/game.js");

  // 游戏进暂停只有两条路：没锁指针时按 Esc，或者指针锁定被解除。手机没有键盘，多数也锁不了指针，
  // 点了“开始部署”（或打开 ?play 链接）之后就停在对局里，屏幕上没有任何能点的东西。
  expect(callSourceAt(bundle, 'addEventListener("keydown",')).toMatch(
    /\.code==="Escape"&&!document\.pointerLockElement&&[\w$]+\("paused"\)/,
  );
  expect(callSourceAt(bundle, 'addEventListener("pointerlockchange",')).toMatch(/[\w$]+\("paused"\)/);

  // 外壳里的暂停按钮替玩家触发这两条路。#hud 整层是 pointer-events:none，按钮不能放在里面。
  expect([...page.matchAll(/<button[^>]*\bid="([^"]+)"/g)].map((match) => match[1])).toContain("touch-pause");
  expect(page.indexOf('id="touch-pause"')).toBeGreaterThan(page.indexOf('<div id="board"'));
  const tapPause = (pointerLocked) => {
    const calls = [];
    let click;
    const document = {
      pointerLockElement: pointerLocked ? {} : null,
      exitPointerLock: () => calls.push("exitPointerLock"),
      dispatchEvent: (event) => calls.push(`${event.type}:${event.code}`),
      getElementById: (id) => ({ addEventListener: (type, listener) => id === "touch-pause" && type === "click" && (click = listener) }),
    };
    const KeyboardEvent = function (type, init) {
      Object.assign(this, init, { type });
    };
    new Function("document", "KeyboardEvent", page.match(/<script>([\s\S]*?)<\/script>/)[1])(document, KeyboardEvent);
    click();
    return calls;
  };
  expect(tapPause(false)).toEqual(["keydown:Escape"]);
  expect(tapPause(true)).toEqual(["exitPointerLock"]);

  // 按钮和菜单提示默认隐藏，只在触屏为主的设备上显示；提示里的链接要落在文章的录像一节。
  expect(page.includes(".touch-note, #touch-pause { display: none; }")).toBe(true);
  const touchOnly = balancedSource(page, page.indexOf("{", page.indexOf("@media (pointer: coarse)")));
  expect(touchOnly).toContain('body[data-state="play"] #touch-pause { display: block; }');
  expect(touchOnly).toContain(".touch-note { display: block; }");
  const note = page.match(/<p class="touch-note">(.*?)<\/p>/)[1];
  expect(note).toContain("键盘和鼠标");
  expect(note).toContain('href="../#trailer"');
  expect(readDemo("greyport/index.html")).toContain('id="trailer"');
});

test("saltline-override：点 DEPLOY 之前对局不推进", () => {
  const page = readDemo("saltline-override/play/index.html");
  // DEPLOY 把“已开始”标志置为 true。在那之前每帧更新必须按 dt=0 运行，
  // 否则简报卡片还盖着，敌人就开始扣血，开场电台也提前播完。
  const deploy = callSourceAt(page, 'getElementById("btn-play").addEventListener(');
  const started = deploy.match(/([\w$]+)=!0/)[1];
  const update = page.match(/__stepCaptureFrame=\([^)]*\)=>\(([\w$]+)\(/)[1];
  const at = page.indexOf(`function ${update}(`);
  expect(page.slice(at, at + 80)).toMatch(
    new RegExp(`^function ${escapeRegExp(update)}\\(([\\w$]+)\\)\\{${escapeRegExp(started)}\\|\\|\\(\\1=0\\)`),
  );
});
