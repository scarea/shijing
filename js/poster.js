// 在 canvas 上绘制 1080x1920 分享海报，返回 PNG data URL。
// 肖像来自维基百科（upload.wikimedia.org 带 CORS 头，所以可以导出）；加载失败则用印章占位。
(function () {
  const W = 1080;
  const H = 1920;
  const SERIF = '"Songti SC", "STSong", "Noto Serif SC", "Source Han Serif SC", "SimSun", serif';
  const SANS = '"PingFang SC", "HarmonyOS Sans SC", "Microsoft YaHei", system-ui, sans-serif';

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function wrap(ctx, text, maxWidth, maxLines) {
    const lines = [];
    let line = "";
    for (const ch of text) {
      if (ctx.measureText(line + ch).width > maxWidth && line) {
        lines.push(line);
        line = ch;
        if (lines.length === maxLines) break;
      } else {
        line += ch;
      }
    }
    if (lines.length < maxLines && line) lines.push(line);
    return lines;
  }

  function polygon(ctx, cx, cy, r, values) {
    const n = values.length;
    ctx.beginPath();
    values.forEach((v, i) => {
      const a = -Math.PI / 2 + i * 2 * Math.PI / n;
      const x = cx + Math.cos(a) * r * v;
      const y = cy + Math.sin(a) * r * v;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    });
    ctx.closePath();
  }

  function drawRadar(ctx, cx, cy, r, labels, fig, me, color) {
    ctx.save();
    ctx.strokeStyle = "rgba(60,40,20,.2)";
    ctx.lineWidth = 2;
    [1, .66, .33].forEach((k) => { polygon(ctx, cx, cy, r, labels.map(() => k)); ctx.stroke(); });
    polygon(ctx, cx, cy, r, me);
    ctx.fillStyle = "rgba(40,40,40,.12)";
    ctx.strokeStyle = "rgba(40,40,40,.55)";
    ctx.setLineDash([10, 8]);
    ctx.lineWidth = 4;
    ctx.fill();
    ctx.stroke();
    ctx.setLineDash([]);
    polygon(ctx, cx, cy, r, fig);
    ctx.fillStyle = color + "55";
    ctx.strokeStyle = color;
    ctx.lineWidth = 5;
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#4a3a28";
    ctx.font = `700 28px ${SANS}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    labels.forEach((label, i) => {
      const a = -Math.PI / 2 + i * 2 * Math.PI / labels.length;
      ctx.fillText(label, cx + Math.cos(a) * (r + 40), cy + Math.sin(a) * (r + 34));
    });
    ctx.restore();
  }

  async function drawPoster({ figure, pct, color, catLabel, meta, traits, radarFig, radarMe, labels, url }) {
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");

    // 宣纸底
    ctx.fillStyle = "#f4ead4";
    ctx.fillRect(0, 0, W, H);
    let g = ctx.createRadialGradient(W * .2, 160, 0, W * .2, 160, 900);
    g.addColorStop(0, color + "30");
    g.addColorStop(1, "transparent");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    g = ctx.createRadialGradient(W, H, 0, W, H, 1100);
    g.addColorStop(0, "rgba(120,80,30,.18)");
    g.addColorStop(1, "transparent");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "rgba(90,60,30,.35)";
    ctx.lineWidth = 3;
    ctx.strokeRect(36, 36, W - 72, H - 72);
    ctx.lineWidth = 1;
    ctx.strokeRect(48, 48, W - 96, H - 96);

    // 页眉
    ctx.fillStyle = "#c8372d";
    roundRect(ctx, 84, 84, 84, 84, 12);
    ctx.fill();
    ctx.fillStyle = "#f6ead2";
    ctx.font = `900 56px ${SERIF}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("史", 126, 128);
    ctx.textAlign = "left";
    ctx.fillStyle = "#2a1f14";
    ctx.font = `900 46px ${SERIF}`;
    ctx.fillText("史镜 · 你最像哪个历史人物", 192, 114);
    ctx.fillStyle = "rgba(42,31,20,.55)";
    ctx.font = `600 26px ${SANS}`;
    ctx.fillText("以史为镜，可以知兴替", 192, 154);

    // 肖像
    const ax = 84;
    const ay = 210;
    const aw = W - 168;
    const ah = 760;
    ctx.save();
    ctx.shadowColor = "rgba(60,30,10,.35)";
    ctx.shadowBlur = 50;
    ctx.shadowOffsetY = 20;
    roundRect(ctx, ax, ay, aw, ah, 24);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();
    ctx.save();
    roundRect(ctx, ax, ay, aw, ah, 24);
    ctx.clip();
    let drawn = false;
    if (figure.img) {
      try {
        const img = await loadImage(figure.img);
        const scale = Math.max(aw / img.width, ah / img.height);
        const dw = img.width * scale;
        const dh = img.height * scale;
        ctx.drawImage(img, ax + (aw - dw) / 2, ay, dw, dh); // 顶部对齐，保住脸
        drawn = true;
      } catch (e) { /* 用印章占位 */ }
    }
    if (!drawn) {
      g = ctx.createLinearGradient(0, ay, 0, ay + ah);
      g.addColorStop(0, color);
      g.addColorStop(1, "#2a1f14");
      ctx.fillStyle = g;
      ctx.fillRect(ax, ay, aw, ah);
      ctx.fillStyle = "rgba(246,234,210,.9)";
      ctx.font = `900 440px ${SERIF}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText([...figure.n.split("·").pop()][0], ax + aw / 2, ay + ah / 2);
    }
    g = ctx.createLinearGradient(0, ay + ah * .55, 0, ay + ah);
    g.addColorStop(0, "transparent");
    g.addColorStop(1, "rgba(20,12,6,.88)");
    ctx.fillStyle = g;
    ctx.fillRect(ax, ay, aw, ah);
    ctx.restore();
    ctx.strokeStyle = "#d9b970";
    ctx.lineWidth = 6;
    roundRect(ctx, ax, ay, aw, ah, 24);
    ctx.stroke();

    // 肖像上的名字
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#f6ead2";
    let size = 120;
    ctx.font = `900 ${size}px ${SERIF}`;
    while (ctx.measureText(figure.n).width > aw - 80 && size > 56) { size -= 6; ctx.font = `900 ${size}px ${SERIF}`; }
    ctx.fillText(figure.n, ax + 40, ay + ah - 100);
    ctx.fillStyle = "rgba(246,234,210,.85)";
    ctx.font = `600 32px ${SANS}`;
    ctx.fillText([figure.s, meta].filter(Boolean).join("  ·  "), ax + 40, ay + ah - 48);

    // 契合度印章
    ctx.save();
    ctx.translate(ax + aw - 150, ay + 44);
    ctx.rotate(.08);
    ctx.fillStyle = "#c8372d";
    roundRect(ctx, 0, 0, 120, 120, 12);
    ctx.fill();
    ctx.fillStyle = "#f6ead2";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `600 22px ${SANS}`;
    ctx.fillText("契合", 60, 30);
    ctx.font = `900 54px ${SERIF}`;
    ctx.fillText(`${pct}%`, 60, 78);
    ctx.restore();
    ctx.fillStyle = "rgba(20,12,6,.65)";
    roundRect(ctx, ax + 28, ay + 28, 150, 52, 26);
    ctx.fill();
    ctx.fillStyle = "#f6ead2";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `700 26px ${SANS}`;
    ctx.fillText(catLabel, ax + 28 + 75, ay + 55);

    // 一句话 + 共同特质
    let y = ay + ah + 74;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#2a1f14";
    ctx.font = `800 44px ${SERIF}`;
    wrap(ctx, `“${figure.t}”`, 520, 3).forEach((line, i) => ctx.fillText(line, 84, y + i * 62));
    y += 3 * 62 + 24;
    ctx.fillStyle = "rgba(42,31,20,.6)";
    ctx.font = `700 26px ${SANS}`;
    ctx.fillText("你们共同的底色", 84, y);
    let cx = 84;
    traits.forEach((label) => {
      ctx.font = `800 30px ${SANS}`;
      const w = ctx.measureText(label).width + 44;
      ctx.fillStyle = color;
      roundRect(ctx, cx, y + 20, w, 56, 28);
      ctx.fill();
      ctx.fillStyle = "#f6ead2";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, cx + w / 2, y + 49);
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      cx += w + 14;
    });

    // 雷达
    drawRadar(ctx, W - 270, ay + ah + 220, 128, labels, radarFig, radarMe, color);
    ctx.textAlign = "right";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "rgba(42,31,20,.6)";
    ctx.font = `600 22px ${SANS}`;
    ctx.fillText("实线：" + figure.n + "　虚线：你", W - 90, ay + ah + 410);

    // 页脚
    ctx.fillStyle = "#c8372d";
    roundRect(ctx, 84, H - 190, W - 168, 100, 50);
    ctx.fill();
    ctx.fillStyle = "#f6ead2";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.font = `900 36px ${SERIF}`;
    ctx.fillText("你最像哪位古人？来测 →", 130, H - 140);
    ctx.font = `700 24px ${SANS}`;
    ctx.textAlign = "right";
    ctx.fillText(url.slice(0, 36), W - 128, H - 140);

    return canvas.toDataURL("image/png");
  }

  window.HF_POSTER = { drawPoster };
})();
