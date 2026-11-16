import { expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";

// 文章里的可玩 demo 只有打包产物进仓库，没有源码。这里直接对发布的产物做回归，
// 重新打包后同样的行为必须还在。
const postsDir = path.join(import.meta.dirname, "..", "src", "posts");
const readDemo = (file) => fs.readFileSync(path.join(postsDir, file), "utf8");

/** 取出包含 anchor 的 class 表达式源码：压缩后类名会变，方法名和字符串不会。 */
function classSourceAround(bundle, anchor) {
  const start = bundle.lastIndexOf("class{", bundle.indexOf(anchor));
  let depth = 0;
  for (let i = start + 5; i < bundle.length; i++) {
    const ch = bundle[i];
    if (ch === '"' || ch === "'" || ch === "`") {
      for (i++; bundle[i] !== ch; i++) if (bundle[i] === "\\") i++;
    } else if (ch === "{") {
      depth++;
    } else if (ch === "}" && --depth === 0) {
      return bundle.slice(start, i + 1);
    }
  }
  throw new Error(`没有找到包含 ${anchor} 的 class`);
}

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
