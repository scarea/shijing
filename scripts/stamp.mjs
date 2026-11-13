// 发布前运行：给 index.html 里的 CSS / JS / data 链接加内容哈希（避免 GitHub Pages 等静态托管的缓存拿到旧文件），
// 并把当前的人物数写进静态 HTML，这样 JS 没跑起来之前页面也是对的。
// 用法：node scripts/stamp.mjs
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const indexPath = path.join(root, "index.html");
let html = fs.readFileSync(indexPath, "utf8");

const hash = (file) => crypto.createHash("sha1").update(fs.readFileSync(path.join(root, file))).digest("hex").slice(0, 8);

let stamped = 0;
html = html.replace(/(src|href)="((?:css|js|data)\/[^"?]+)(?:\?v=[^"]*)?"/g, (_, attr, file) => {
  stamped += 1;
  return `${attr}="${file}?v=${hash(file)}"`;
});

const sandbox = { window: {} };
vm.runInNewContext(["data/figures.js", "data/questions.js"].map((f) => fs.readFileSync(path.join(root, f), "utf8")).join("\n"), sandbox);
const figures = sandbox.window.HF_FIGURES;
const total = figures.length;
const emperors = figures.filter((f) => f.c === "E").length;
const world = figures.filter((f) => f.r === "wd").length;

html = html
  .replace(/(class="statTotal">)\d+/g, `$1${total}`)
  .replace(/(id="statEmperors">)\d+/g, `$1${emperors}`)
  .replace(/(id="statWorld">)\d+/g, `$1${world}`)
  .replace(/\d+ 位历史人物/g, `${total} 位历史人物`)
  .replace(/从 \d+ 位/g, `从 ${total} 位`)
  .replace(/在 \d+ 位帝王/g, `在 ${total} 位帝王`);

fs.writeFileSync(indexPath, html);
console.log(`stamped ${stamped} asset URLs · ${total} figures (${emperors} 中国帝王 / ${world} 外国人物) · ${sandbox.window.HF_QUESTIONS.length} questions`);
