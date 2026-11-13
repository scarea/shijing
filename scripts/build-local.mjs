// 把维基依赖全部本地化：人物简介 + 肖像图片。
// 这样一来国内访问不需要翻墙，也没有任何外部请求。
//
// 用法：
//   node scripts/build-local.mjs            # 增量：已下载的跳过
//   node scripts/build-local.mjs --refresh  # 全部重抓
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.join(root, "data");
const imgDir = path.join(root, "img");
const wikiCachePath = path.join(root, "scripts/.wiki-local.json");
const args = new Set(process.argv.slice(2));
const REFRESH = args.has("--refresh");
const CONC = 6;

// ---------- 读 figures ----------
const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(dataDir, "figures.js"), "utf8"), sandbox);
const figures = sandbox.window.HF_FIGURES;
if (!Array.isArray(figures) || !figures.length) {
  console.error("读不到 HF_FIGURES");
  process.exit(1);
}
console.log(`人物 ${figures.length} 位`);

// ---------- 简介缓存 ----------
let cache = {};
if (!REFRESH && fs.existsSync(wikiCachePath)) {
  try { cache = JSON.parse(fs.readFileSync(wikiCachePath, "utf8")); } catch { cache = {}; }
}
const saveCache = () => {
  fs.writeFileSync(wikiCachePath, JSON.stringify(cache));
};

// ---------- 并发池 ----------
async function pool(items, worker, conc = CONC) {
  const out = new Array(items.length);
  let i = 0;
  const runners = Array.from({ length: Math.min(conc, items.length) }, async () => {
    while (true) {
      const idx = i++;
      if (idx >= items.length) return;
      out[idx] = await worker(items[idx], idx);
    }
  });
  await Promise.all(runners);
  return out;
}

// ---------- 抓简介（批量，20 个标题/请求）----------
// 逐条抓会被维基限流（HTTP 429）。批量接口 + 规范 User-Agent 才稳。
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const UA = "ShijingLocalizer/1.0 (https://github.com/scarea/shijing; personal static site)";
const BATCH = 20;

async function fetchBatch(figs) {
  const titles = figs.map((f) => f.w).join("|");
  const params = new URLSearchParams({
    action: "query", format: "json", formatversion: "2",
    prop: "extracts", exintro: "1", explaintext: "1",
    exlimit: String(Math.min(figs.length, BATCH)), redirects: "1",
    titles,
  });
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(`https://zh.wikipedia.org/w/api.php?${params}`, {
        headers: { "user-agent": UA },
        signal: AbortSignal.timeout(30000),
      });
      if (res.status === 429) { await sleep(3000 * (attempt + 1)); continue; }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = await res.json();
      const pages = d?.query?.pages || [];
      // 用归一化后的标题回查是哪一位
      const norm = new Map();
      for (const n of d?.query?.normalized || []) norm.set(n.to, n.from);
      for (const p of pages) {
        const text = (p.extract || "").trim();
        if (!text) continue;
        const orig = norm.get(p.title) || p.title;
        const fig = figs.find((f) => f.w === orig || f.w === p.title);
        if (fig) cache[fig.id] = { w: fig.w, text: text.slice(0, 1200) };
      }
      return true;
    } catch (e) {
      if (attempt === 3) { console.warn(`  批次失败: ${e.message}`); return false; }
      await sleep(1500 * (attempt + 1));
    }
  }
  return false;
}

// ---------- 下载肖像 ----------
const IMG_HOST = "https://upload.wikimedia.org";
async function downloadImg(f) {
  if (!f.i) return null;
  const dest = path.join(imgDir, f.i.replace(/^\//, ""));
  if (!REFRESH && fs.existsSync(dest) && fs.statSync(dest).size > 0) return "cached";
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(IMG_HOST + f.i, {
        headers: { "user-agent": "shijing-localizer/1.0 (personal static site)" },
        signal: AbortSignal.timeout(30000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 500) throw new Error("太小");
      fs.writeFileSync(dest, buf);
      return "ok";
    } catch (e) {
      if (attempt === 2) { console.warn(`  图片失败 ${f.n}: ${e.message}`); return "fail"; }
      await sleep(1000 * (attempt + 1));
    }
  }
  return "fail";
}

// ---------- 跑 ----------
const t0 = Date.now();
console.log("① 抓人物简介（批量）…");
const todo = figures.filter((f) => !cache[f.id]?.text);
console.log(`   需要抓 ${todo.length} 位（已有 ${figures.length - todo.length} 位缓存）`);
let done = 0;
for (let i = 0; i < todo.length; i += BATCH) {
  await fetchBatch(todo.slice(i, i + BATCH));
  done = Math.min(i + BATCH, todo.length);
  if (done % 100 < BATCH) { console.log(`   ${done}/${todo.length}`); saveCache(); }
  await sleep(300);
}
saveCache();
const withText = Object.values(cache).filter((v) => v.text).length;
console.log(`   完成：${withText}/${figures.length} 位有简介`);

console.log("② 下载肖像…");
const imgStat = { ok: 0, cached: 0, fail: 0 };
done = 0;
await pool(figures, async (f) => {
  const r = await downloadImg(f);
  if (r) imgStat[r] = (imgStat[r] || 0) + 1;
  if (++done % 50 === 0) console.log(`   ${done}/${figures.length}`);
}, 4);
console.log(`   完成：新下载 ${imgStat.ok}，已存在 ${imgStat.cached}，失败 ${imgStat.fail}`);

// ---------- 生成 data/wiki.js ----------
const wiki = {};
for (const f of figures) {
  const c = cache[f.id];
  if (c?.text) wiki[f.id] = c.text;
}
const js = "// 由 scripts/build-local.mjs 生成，请勿手改。人物简介，来自中文维基百科（CC BY-SA 4.0）。\n" +
  `window.HF_WIKI = ${JSON.stringify(wiki)};\n`;
fs.writeFileSync(path.join(dataDir, "wiki.js"), js);
console.log(`③ 写入 data/wiki.js（${Object.keys(wiki).length} 条，${(js.length / 1024).toFixed(0)}KB）`);

console.log(`总耗时 ${((Date.now() - t0) / 1000).toFixed(0)}s`);
