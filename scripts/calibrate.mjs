// 校准：随机作答时，让 600+ 个人物被命中的概率尽量均匀，避免少数「万金油」人物霸屏。
// 用法：
//   node scripts/calibrate.mjs           # 只打印当前分布
//   node scripts/calibrate.mjs --write   # 迭代校准并写入 data/bias.js
// 改了题库（data/questions.js）或人物向量（scripts/source/*.txt → build-figures）后都要重新跑一次。
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const engine = require(path.join(root, "js/engine.js"));
const write = process.argv.includes("--write");

const sandbox = { window: {} };
const biasPath = path.join(root, "data/bias.js");
const files = ["data/figures.js", "data/questions.js"];
vm.runInNewContext(files.map((f) => fs.readFileSync(path.join(root, f), "utf8")).join("\n"), sandbox);
const bank = sandbox.window.HF_QUESTIONS;
const figures = sandbox.window.HF_FIGURES.map((f) => ({ ...f, vec: [...f.v].map(Number), bias: 0 }));
engine.prepare(figures);

if (!write && fs.existsSync(biasPath)) {
  const b = {}; vm.runInNewContext(fs.readFileSync(biasPath, "utf8"), { window: b });
  figures.forEach((f, i) => { f.bias = (b.HF_BIAS || [])[i] || 0; });
}

function report(counts, runs, title) {
  const shares = counts.map((c) => c / runs * 100);
  const sorted = shares.map((s, i) => ({ s, f: figures[i] })).sort((a, b) => b.s - a.s);
  const even = 100 / figures.length;
  const zero = counts.filter((c) => c === 0).length;
  const top10 = sorted.slice(0, 10).reduce((a, b) => a + b.s, 0);
  console.log(`\n== ${title}（${runs} 次随机作答，均匀线 ${even.toFixed(2)}%）`);
  console.log(`被命中过的人物：${figures.length - zero}/${figures.length}；前 10 名合计 ${top10.toFixed(1)}%；最高 ${sorted[0].s.toFixed(2)}%`);
  console.log("最容易命中：" + sorted.slice(0, 8).map((x) => `${x.f.n} ${x.s.toFixed(2)}%`).join("、"));
  const never = figures.filter((_, i) => counts[i] === 0);
  if (never.length) console.log(`从未命中 ${never.length} 个：${never.slice(0, 40).map((f) => f.n).join("、")}${never.length > 40 ? "…" : ""}`);
}

let counts = engine.simulate(bank, figures, { runs: 30000 });
report(counts, 30000, write ? "校准前" : "当前");

if (write) {
  const target = 1 / figures.length;
  const LIMIT = { min: -0.12, max: 0.25 };
  for (let round = 0; round < 40; round += 1) {
    const runs = 15000;
    const c = engine.simulate(bank, figures, { runs, seed: 1000 + round });
    figures.forEach((f, i) => {
      const share = (c[i] + 0.5) / (runs + 0.5 * figures.length);
      // 命中过多就压低，过少就抬高；用对数比值，步子随轮数衰减。
      const step = Math.log(share / target) * 0.012 * (1 - round / 60);
      f.bias = Math.max(LIMIT.min, Math.min(LIMIT.max, f.bias - step));
    });
  }
  counts = engine.simulate(bank, figures, { runs: 30000 });
  report(counts, 30000, "校准后");
  const bias = figures.map((f) => Math.round(f.bias * 1000) / 1000);
  fs.writeFileSync(biasPath, `// 由 scripts/calibrate.mjs 生成：按人物 id 排列的评分偏置，让随机作答下各人物命中率更均匀。\nwindow.HF_BIAS = ${JSON.stringify(bias)};\n`);
  console.log(`\n已写入 data/bias.js（${bias.length} 项）`);
}
