import fs from "node:fs";

const data = JSON.parse(
  fs.readFileSync(new URL("./aggregate.json", import.meta.url), "utf8"),
);

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, received ${actual}`);
  }
}

function assertClose(actual, expected, tolerance, label) {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`${label}: expected ${expected} ± ${tolerance}, received ${actual}`);
  }
}

const extraTokens = data.defaultAppContext.measuredO200k;
const rates = data.solCreditsPerMillion;

function extraCredits(n, tokens = extraTokens) {
  return (tokens / 1_000_000) * (rates.input + rates.cachedInput * (n - 1));
}

assertEqual(data.baseInstructions.identicalAcrossCliAndDesktop, true, "Base Instruction 两边相同");
assertEqual(data.baseInstructions.o200k, 3552, "Base Instruction o200k");
assertEqual(data.baseInstructions.bytes, 17766, "Base Instruction 字节");
assertClose(
  (data.baseInstructions.o200k / data.sessions.cli.firstInputTokens) * 100,
  data.baseInstructions.shareOfCliFirstTurnPercent,
  0.0001,
  "Base Instruction 占 CLI 首包",
);

const sectionSum = data.defaultAppContext.sections.reduce((sum, row) => sum + row.o200k, 0);
assertEqual(sectionSum, data.defaultAppContext.sectionSumO200k, "默认 app-context 小节合计");
assertEqual(data.defaultAppContext.measuredO200k, 949, "默认 app-context 实测");
assertEqual(sectionSum + 1, data.defaultAppContext.measuredO200k, "小节合计与实测差 1 token");

assertEqual(
  data.sessions.cli.firstInputTokens - data.sessions.cli.firstCachedInputTokens,
  data.sessions.cli.firstUncachedInputTokens,
  "CLI 首包 uncached",
);
assertEqual(
  data.sessions.desktopAutomation.firstInputTokens -
    data.sessions.desktopAutomation.firstCachedInputTokens,
  data.sessions.desktopAutomation.firstUncachedInputTokens,
  "Desktop 自动化首包 uncached",
);
assertEqual(
  data.sessions.desktopAutomation.firstDeveloperO200k - data.sessions.cli.firstDeveloperO200k,
  1627,
  "首段 developer 差额",
);

for (const n of data.extraCreditsByCalls.n) {
  const credits = extraCredits(n, data.extraCreditsByCalls.tokens);
  assertClose(credits, extraCredits(n), 1e-12, `N=${n} 额外 credit`);
}

assertClose(extraCredits(1), 0.0949, 1e-12, "首轮额外 credit");
assertClose(extraCredits(50), 0.55991, 1e-12, "50 次调用额外 credit");
assertClose(extraCredits(100), 1.03441, 1e-12, "100 次调用额外 credit");

assertClose(
  (extraTokens / data.longContext.conversationTokens) * 100,
  data.longContext.extraShareOf200kPercent,
  0.0001,
  "949 / 200K",
);

for (const [index, row] of data.cacheSeriesCli.entries()) {
  if (row.cached > row.input) {
    throw new Error(`cache series #${index}: cached > input`);
  }
}
assertEqual(data.cacheSeriesCli[0].cached < data.cacheSeriesCli[2].cached, true, "cache 命中上升");

console.log(
  JSON.stringify(
    {
      baseO200k: data.baseInstructions.o200k,
      defaultAppContextO200k: extraTokens,
      extraCreditsN1: extraCredits(1),
      extraCreditsN50: extraCredits(50),
      extraCreditsN100: extraCredits(100),
      shareOf200kPercent: data.longContext.extraShareOf200kPercent,
    },
    null,
    2,
  ),
);
