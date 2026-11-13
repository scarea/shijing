// 把 scripts/source/*.txt 编译成 data/figures.js，并向中文维基百科校验词条、抓取肖像缩略图。
// 用法：
//   node scripts/build-figures.mjs            # 用缓存（scripts/.wiki-cache.json），只补抓新词条
//   node scripts/build-figures.mjs --refresh  # 忽略缓存，全部重抓
//   node scripts/build-figures.mjs --offline  # 不联网，只用缓存
// 源文件格式见 scripts/source/china-emperors.txt 顶部注释。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = path.join(root, "scripts/source");
const cachePath = path.join(root, "scripts/.wiki-cache.json");
const outPath = path.join(root, "data/figures.js");
const args = new Set(process.argv.slice(2));
const API = "https://zh.wikipedia.org/w/api.php";
const FILES = ["china-emperors.txt", "china-figures.txt", "world-rulers.txt", "world-leaders.txt", "world-figures.txt"];
const DIM_COUNT = 9;

// ---------- parse ----------
const figures = [];
const errors = [];
for (const file of FILES) {
  let cat = "";
  let region = "";
  fs.readFileSync(path.join(sourceDir, file), "utf8").split("\n").forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith(";")) return;
    const where = `${file}:${i + 1}`;
    if (line.startsWith("#")) {
      [cat, region] = line.slice(1).trim().split(/\s+/);
      return;
    }
    const parts = line.split("|");
    if (parts.length !== 6) return errors.push(`${where} 字段数应为 6，实际 ${parts.length}：${line}`);
    const [head, wiki, nat, years, tagline, vec] = parts.map((s) => s.trim());
    const [name, ...subs] = head.split(/\s+/);
    if (!/^\d+$/.test(vec) || vec.length !== DIM_COUNT) return errors.push(`${where} 向量必须是 ${DIM_COUNT} 位数字：${vec}（${name}）`);
    figures.push({
      name,
      sub: subs.join(" "),
      wiki: wiki || name,
      cat,
      region,
      nat,
      years,
      tagline,
      vec: [...vec].map(Number)
    });
  });
}
if (errors.length) { console.error(errors.join("\n")); process.exit(1); }

const dupes = new Map();
figures.forEach((f) => { const k = `${f.name}|${f.wiki}`; dupes.set(k, (dupes.get(k) || 0) + 1); });
const dupList = [...dupes].filter(([, n]) => n > 1);
if (dupList.length) { console.error("重复人物：", dupList.map(([k]) => k).join("、")); process.exit(1); }

// ---------- wikipedia ----------
const cache = !args.has("--refresh") && fs.existsSync(cachePath) ? JSON.parse(fs.readFileSync(cachePath, "utf8")) : {};

async function fetchBatch(titles) {
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    formatversion: "2",
    titles: titles.join("|"),
    redirects: "1",
    converttitles: "1",
    prop: "pageimages|pageprops",
    piprop: "thumbnail",
    pithumbsize: "480",
    ppprop: "disambiguation",
    variant: "zh-cn"
  });
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      const res = await fetch(`${API}?${params}`, { headers: { "User-Agent": "history-figure-quiz/1.0 (static site build script)" } });
      if (res.status === 429) {
        const wait = Number(res.headers.get("retry-after")) || 10 * (attempt + 1);
        process.stdout.write(`\n  被限流，等待 ${wait}s…\n`);
        await new Promise((r) => setTimeout(r, wait * 1000));
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (error) {
      if (attempt === 5) throw error;
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
}

async function resolveWiki(titles) {
  const todo = [...new Set(titles)].filter((t) => !(t in cache));
  if (args.has("--offline") || !todo.length) return;
  console.log(`向维基百科查询 ${todo.length} 个词条…`);
  for (let i = 0; i < todo.length; i += 40) {
    const batch = todo.slice(i, i + 40);
    const data = await fetchBatch(batch);
    const q = data.query || {};
    // 标题可能被规范化 / 繁简转换 / 重定向，逐级还原回我们提交的标题。
    const chain = new Map(batch.map((t) => [t, t]));
    ["normalized", "converted", "redirects"].forEach((key) => {
      (q[key] || []).forEach(({ from, to }) => {
        for (const [orig, cur] of chain) if (cur === from) chain.set(orig, to);
      });
    });
    const pages = new Map((q.pages || []).map((p) => [p.title, p]));
    batch.forEach((orig) => {
      const page = pages.get(chain.get(orig));
      if (!page || page.missing) cache[orig] = { missing: true };
      else cache[orig] = {
        title: page.title,
        pageid: page.pageid,
        disambig: Boolean(page.pageprops && "disambiguation" in page.pageprops),
        thumb: page.thumbnail ? page.thumbnail.source : null
      };
    });
    process.stdout.write(`  ${Math.min(i + 40, todo.length)}/${todo.length}\r`);
    fs.writeFileSync(cachePath, JSON.stringify(cache, null, 1));
    await new Promise((r) => setTimeout(r, 1500)); // 对维基百科 API 客气一点
  }
  process.stdout.write("\n");
}

await resolveWiki(figures.map((f) => f.wiki));

// ---------- report ----------
const missing = [];
const disambig = [];
const noImage = [];
figures.forEach((f) => {
  const info = cache[f.wiki];
  if (!info) return;
  if (info.missing) missing.push(f);
  else if (info.disambig) disambig.push(f);
  else if (!info.thumb) noImage.push(f);
});
const label = (f) => `${f.name}（词条：${f.wiki}）`;
if (missing.length) console.warn(`\n✗ 词条不存在 ${missing.length}：\n  ${missing.map(label).join("\n  ")}`);
if (disambig.length) console.warn(`\n✗ 落在消歧义页 ${disambig.length}：\n  ${disambig.map(label).join("\n  ")}`);
if (noImage.length) console.warn(`\n· 无肖像（将用印章占位）${noImage.length}：${noImage.map((f) => f.name).join("、")}`);
if (missing.length || disambig.length) {
  console.error("\n请在 scripts/source/*.txt 里修正第 2 个字段（维基词条），再重跑。");
  if (!args.has("--force")) process.exit(1);
}

// ---------- write ----------
const IMG_HOST = "https://upload.wikimedia.org";
const out = figures.map((f, id) => {
  const info = cache[f.wiki] || {};
  let img = "";
  if (info.thumb) {
    const url = new URL(info.thumb);
    img = url.pathname; // /wikipedia/commons/thumb/1/14/xxx.jpg/480px-xxx.jpg
  }
  const item = {
    id,
    n: f.name,
    ...(f.sub ? { s: f.sub } : {}),
    w: info.title || f.wiki,
    c: f.cat,
    r: f.region,
    p: f.nat,
    y: f.years,
    t: f.tagline,
    v: f.vec.join("")
  };
  if (img) item.i = img;
  return item;
});

const byCat = {};
out.forEach((f) => { byCat[f.c] = (byCat[f.c] || 0) + 1; });
const header = `// 由 scripts/build-figures.mjs 生成，请勿手改；改 scripts/source/*.txt 后重新运行。
// 字段：id 序号 · n 名字 · s 副标题 · w 中文维基词条 · c 分类(E帝王 R外国君主 P总统首脑 S思想文学 K科学艺术 G将帅谋臣) · r 地区(cn/wd) · p 朝代或国家 · y 生卒 · t 一句话 · v 9维向量(野谋武铁仁才革逸忍) · i 维基缩略图路径
`;
fs.writeFileSync(outPath, `${header}window.HF_IMG_HOST = ${JSON.stringify(IMG_HOST)};\nwindow.HF_FIGURES = ${JSON.stringify(out)};\n`);
console.log(`\n写入 ${path.relative(root, outPath)}：共 ${out.length} 人，${JSON.stringify(byCat)}，有肖像 ${out.filter((f) => f.i).length}`);
