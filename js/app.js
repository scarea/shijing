(function () {
  const $ = (selector, root = document) => root.querySelector(selector);
  const engine = window.HF_ENGINE;
  const bank = window.HF_QUESTIONS || [];
  const IMG_HOST = window.HF_IMG_HOST || "https://upload.wikimedia.org";
  const SAMPLE_SIZE = 12;
  const PAGE_SIZE = 48;
  const root = document.documentElement;

  const CATS = {
    E: { label: "中国帝王", color: "#c8372d" },
    R: { label: "外国君主", color: "#c08a1e" },
    P: { label: "政要首脑", color: "#2f78b0" },
    S: { label: "思想文学", color: "#2f8f6b" },
    K: { label: "科学艺术", color: "#7d5ab5" },
    G: { label: "将帅谋臣", color: "#cf6a26" }
  };
  const CAT_ORDER = ["E", "R", "P", "S", "K", "G"];

  // ---------- data ----------
  const bias = window.HF_BIAS || [];
  const figures = (window.HF_FIGURES || []).map((f) => ({
    ...f,
    vec: [...f.v].map(Number),
    bias: bias[f.id] || 0,
    img: f.i ? IMG_HOST + f.i : "",
    cat: CATS[f.c]
  }));
  engine.prepare(figures);
  const byId = new Map(figures.map((f) => [f.id, f]));
  const DIMS = engine.DIMS;
  const LABEL = engine.LABELS;

  // ---------- helpers ----------
  const randomFrom = (list) => list[Math.floor(Math.random() * list.length)];
  const escapeHtml = (text) => String(text).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const storage = {
    get(key) { try { return localStorage.getItem(key); } catch (e) { return null; } },
    set(key, value) { try { localStorage.setItem(key, value); } catch (e) {} }
  };
  const wikiUrl = (f) => `https://zh.wikipedia.org/zh-cn/${encodeURIComponent(f.w.replace(/ /g, "_"))}`;
  const glyphOf = (f) => [...f.n.split("·").pop()][0] || f.n[0];
  const nameLine = (f) => [f.s, f.p].filter(Boolean).join(" · ");
  const metaLine = (f) => `${f.p} · ${f.y}`;
  const pctOf = (score) => clamp(Math.round(52 + score * 46), 1, 99);
  const traitText = (f, n = 3) => engine.topDims(f.vec, n).map((k) => LABEL[k]).join(" · ");

  let toastTimer = null;
  function toast(message) {
    const el = $("#toast");
    el.textContent = message;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 2000);
  }

  async function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
    const area = document.createElement("textarea");
    area.value = text;
    area.style.cssText = "position:fixed;opacity:0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    if (!ok) throw new Error("copy failed");
  }

  function lockScroll() {
    document.body.classList.toggle("locked", !$("#quiz").hidden || !$("#modal").hidden || !$("#build").hidden);
  }

  function burst(container, glyphs, count = 36) {
    if (!container) return;
    const layer = document.createElement("div");
    layer.className = "burst";
    for (let i = 0; i < count; i += 1) {
      const piece = document.createElement("i");
      piece.textContent = randomFrom(glyphs);
      piece.style.left = `${40 + Math.random() * 20}%`;
      piece.style.top = `${40 + Math.random() * 20}%`;
      piece.style.setProperty("--dx", `${Math.round((Math.random() - .5) * 420)}px`);
      piece.style.setProperty("--dy", `${Math.round((Math.random() - .5) * 320)}px`);
      piece.style.setProperty("--rot", `${Math.round((Math.random() - .5) * 540)}deg`);
      piece.style.animationDelay = `${Math.random() * .15}s`;
      layer.appendChild(piece);
    }
    container.appendChild(layer);
    setTimeout(() => layer.remove(), 1300);
  }

  // ---------- card rendering ----------
  // 肖像：先画印章占位，图片加载成功后淡入覆盖；加载失败就保留印章。
  function artHtml(f) {
    const img = f.img ? `<img class="hc-img" src="${escapeHtml(f.img)}" alt="${escapeHtml(f.n)}肖像" loading="lazy" decoding="async" draggable="false" referrerpolicy="no-referrer" />` : "";
    return `<span class="hc-art" style="--c:${f.cat.color}"><span class="seal-glyph">${escapeHtml(glyphOf(f))}</span>${img}</span>`;
  }
  document.addEventListener("load", (event) => {
    if (event.target.classList && event.target.classList.contains("hc-img")) event.target.classList.add("loaded");
  }, true);
  document.addEventListener("error", (event) => {
    if (event.target.classList && event.target.classList.contains("hc-img")) event.target.remove();
  }, true);

  const collection = new Set((() => { try { return JSON.parse(storage.get("hf-collection") || "[]"); } catch (e) { return []; } })());
  function collect(id) {
    const fresh = !collection.has(id);
    collection.add(id);
    storage.set("hf-collection", JSON.stringify([...collection]));
    updateCollectCount();
    document.querySelectorAll(`.hcard[data-id="${id}"]`).forEach((el) => el.classList.add("got"));
    return fresh;
  }
  function updateCollectCount() {
    $("#collectCount").textContent = collection.size ? `已匹配收藏 ${collection.size}/${figures.length}` : "";
  }

  function cardHtml(f, { pct } = {}) {
    return `
      <button class="hcard tilt ${collection.has(f.id) ? "got" : ""}" type="button" data-id="${f.id}" data-tilt-max="9" style="--c:${f.cat.color}">
        ${artHtml(f)}
        <span class="hc-cat">${f.cat.label}</span>
        ${pct ? `<span class="hc-pct">${pct}%</span>` : ""}
        <span class="hc-got">已匹配</span>
        <span class="hc-body">
          <b>${escapeHtml(f.n)}</b>
          <small>${escapeHtml(nameLine(f))}</small>
          <em>${escapeHtml(f.y)}</em>
        </span>
      </button>`;
  }
  document.addEventListener("click", (event) => {
    const card = event.target.closest(".hcard[data-id]");
    if (card) openFigure(byId.get(Number(card.dataset.id)));
  });

  // ---------- theme / scroll ----------
  $("#themeToggle").addEventListener("click", () => {
    const light = root.dataset.theme !== "light";
    if (light) root.dataset.theme = "light"; else delete root.dataset.theme;
    storage.set("hf-theme", light ? "light" : "dark");
    toast(light ? "已切换到宣纸模式" : "已切换到墨色模式");
  });
  let scrollQueued = false;
  window.addEventListener("scroll", () => {
    if (scrollQueued) return;
    scrollQueued = true;
    requestAnimationFrame(() => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      $("#scrollBar").style.transform = `scaleX(${max > 0 ? window.scrollY / max : 0})`;
      scrollQueued = false;
    });
  }, { passive: true });

  // ---------- radar ----------
  function radarSvg(values, compareValues) {
    const r = 88;
    const n = DIMS.length;
    const point = (i, v) => {
      const a = -Math.PI / 2 + i * 2 * Math.PI / n;
      return [Math.cos(a) * r * v, Math.sin(a) * r * v];
    };
    const poly = (vals) => vals.map((v, i) => point(i, v).map((x) => x.toFixed(1)).join(",")).join(" ");
    let svg = "";
    [1, .66, .33].forEach((k) => { svg += `<polygon class="grid" points="${poly(DIMS.map(() => k))}" />`; });
    DIMS.forEach((_, i) => { const [x, y] = point(i, 1); svg += `<line class="axis" x1="0" y1="0" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" />`; });
    if (compareValues) svg += `<polygon class="shape-b" points="${poly(compareValues)}" />`;
    svg += `<polygon class="shape" points="${poly(values)}" />`;
    DIMS.forEach((key, i) => {
      const [x, y] = point(i, 1.2);
      svg += `<text x="${x.toFixed(1)}" y="${(y + 4).toFixed(1)}" text-anchor="middle">${LABEL[key]}</text>`;
    });
    return svg;
  }
  const figRadar = (f) => f.vec.map((v) => clamp(v / 9, .08, 1));
  // z 分数 → 0..9 的「你的得分」，再画成雷达。
  const userVals = (z) => DIMS.map((key) => clamp(4.5 + z[key] * 1.7, .5, 9));
  const userRadar = (z) => userVals(z).map((v) => clamp(v / 9, .08, 1));

  // ---------- wikipedia summary (lazy) ----------
  const wikiCache = new Map();
  async function fetchSummary(f) {
    if (wikiCache.has(f.id)) return wikiCache.get(f.id);
    const key = `hf-wiki-${f.id}`;
    const cached = storage.get(key);
    if (cached) { wikiCache.set(f.id, cached); return cached; }
    const params = new URLSearchParams({
      action: "query", format: "json", formatversion: "2", prop: "extracts", exintro: "1", explaintext: "1",
      exsentences: "3", redirects: "1", titles: f.w, variant: "zh-cn", origin: "*"
    });
    const res = await fetch(`https://zh.wikipedia.org/w/api.php?${params}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const page = data.query && data.query.pages && data.query.pages[0];
    let text = (page && page.extract) || "";
    text = text.replace(/\s+/g, " ").trim();
    if (text.length > 260) text = text.slice(0, 260).replace(/[，、；：,;:][^，、；：。！？]*$/, "") + "……";
    if (!text) throw new Error("empty");
    wikiCache.set(f.id, text);
    storage.set(key, text);
    return text;
  }
  function renderWiki(el, f) {
    el.innerHTML = `<div class="wiki-head"><span>📖 维基百科简介</span><a href="${wikiUrl(f)}" target="_blank" rel="noopener noreferrer">阅读全文 ↗</a></div><p class="wiki-text loading">正在翻阅维基百科…</p>`;
    const p = el.querySelector(".wiki-text");
    fetchSummary(f).then((text) => {
      p.classList.remove("loading");
      p.textContent = text;
      el.insertAdjacentHTML("beforeend", `<small class="wiki-credit">摘自<a href="${wikiUrl(f)}" target="_blank" rel="noopener noreferrer">中文维基百科「${escapeHtml(f.w)}」</a>，CC BY-SA 4.0</small>`);
    }).catch(() => {
      p.classList.remove("loading");
      p.textContent = "暂时没能取到简介（可能离线或被拦截），点右上角「阅读全文」直接去维基百科看。";
    });
  }

  // ---------- modal ----------
  const modal = $("#modal");
  function openModal(html, color) {
    $("#modalBody").innerHTML = html;
    $("#modalPanel").style.setProperty("--type", color || "#c8372d");
    modal.hidden = false;
    $("#modalPanel").scrollTop = 0;
    lockScroll();
  }
  function closeModal() { modal.hidden = true; lockScroll(); }
  $("#modalClose").addEventListener("click", closeModal);
  modal.addEventListener("click", (event) => { if (event.target === modal) closeModal(); });

  function traitChips(f, n = 3) {
    return engine.topDims(f.vec, n).map((k) => `<span title="${escapeHtml(engine.BLURBS[k])}">${LABEL[k]}<small>${f.vec[DIMS.indexOf(k)]}</small></span>`).join("");
  }

  function openFigure(f) {
    if (!f) return;
    const mine = currentResult;
    openModal(`
      <div class="detail-modal">
        <div class="dm-art tilt" data-tilt-max="10" style="--c:${f.cat.color}">${artHtml(f)}<span class="hc-cat">${f.cat.label}</span></div>
        <div class="dm-copy">
          <div class="badge-row">
            <span class="badge">${f.cat.label}</span>
            <span class="badge badge-ghost">${escapeHtml(f.p)}</span>
            <span class="badge badge-ghost">${escapeHtml(f.y)}</span>
            ${collection.has(f.id) ? '<span class="badge badge-ghost">✓ 已匹配收藏</span>' : ""}
          </div>
          <h2 class="dm-name">${escapeHtml(f.n)}</h2>
          ${f.s ? `<h3 class="dm-sub">${escapeHtml(f.s)}</h3>` : ""}
          <p class="result-tagline">${escapeHtml(f.t)}</p>
          <div class="quote-chips">${traitChips(f)}</div>
          <div class="dm-radar"><svg class="radar" viewBox="-130 -120 260 240" role="img" aria-label="${escapeHtml(f.n)}性格雷达">${radarSvg(figRadar(f), mine ? userRadar(mine.z) : null)}</svg>
            <small>${mine ? '<i class="dot ta"></i>' + escapeHtml(f.n) + ' <i class="dot me"></i>你' : "9 维性格（0–9）"}</small></div>
        </div>
      </div>
      <div class="wiki-box" id="modalWiki"></div>
      <div class="result-actions">
        <a class="cta" href="${wikiUrl(f)}" target="_blank" rel="noopener noreferrer">在维基百科阅读 ↗</a>
        <button class="ghost" type="button" id="modalCopy">复制人物链接</button>
      </div>
    `, f.cat.color);
    window.HF_FX.bindTiltAll($("#modalBody"));
    renderWiki($("#modalWiki"), f);
    $("#modalCopy").addEventListener("click", () => {
      const url = shareUrl(f);
      copyText(url ? `${f.n}：${f.t}\n${url}` : `${f.n}：${f.t}\n${wikiUrl(f)}`).then(() => toast("链接已复制"), () => toast("复制失败"));
    });
  }

  function shareUrl(f) {
    if (!/^https?:$/.test(location.protocol)) return "";
    return `${location.href.replace(/[?#].*$/, "")}?f=${f.id}`;
  }

  // ---------- hero fan ----------
  function renderFan() {
    const withImg = figures.filter((f) => f.img);
    const picks = [];
    const pool = [...withImg].sort(() => Math.random() - .5);
    CAT_ORDER.forEach((c) => { const f = pool.find((x) => x.c === c && !picks.includes(x)); if (f) picks.push(f); });
    const fan = $("#heroFan");
    const five = picks.sort(() => Math.random() - .5).slice(0, 5);
    fan.innerHTML = five.map((f, i) => `<div class="fan-item" style="--i:${i - 2}">${cardHtml(f)}</div>`).join("");
    window.HF_FX.bindTiltAll(fan);
  }
  $("#heroShuffle").addEventListener("click", renderFan);

  (function hero() {
    const emperors = figures.filter((f) => f.c === "E").length;
    document.querySelectorAll(".statTotal").forEach((el) => { el.textContent = figures.length; });
    $("#statEmperors").textContent = emperors;
    $("#statWorld").textContent = figures.filter((f) => f.r === "wd").length;
    const hour = new Date().getHours();
    const eyebrow = $("#heroEyebrow");
    if (hour >= 23 || hour < 5) eyebrow.textContent = "夜深了，正是读史、也读自己的时候";
    renderFan();
    const lastId = storage.get("hf-last");
    const last = lastId !== null && /^\d+$/.test(lastId) ? byId.get(Number(lastId)) : null;
    if (last) {
      const box = $("#lastResult");
      box.hidden = false;
      box.innerHTML = `上次测出：<b>${escapeHtml(last.n)}</b>（${escapeHtml(last.p)}）<button class="chip-btn" type="button">查看</button>`;
      box.querySelector("button").addEventListener("click", () => openFigure(last));
    }
    const hero = $(".hero");
    const title = $(".hero-title");
    if (window.HF_FX.finePointer && !window.HF_FX.reduceMotion) {
      hero.addEventListener("pointermove", (event) => {
        title.style.setProperty("--hy", `${(event.clientX / window.innerWidth - .5) * 10}deg`);
        title.style.setProperty("--hx", `${-(event.clientY / window.innerHeight - .5) * 8}deg`);
      });
    }
  })();

  // ---------- today ----------
  function dayIndex() {
    const d = new Date();
    const key = d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
    return Math.floor(engine.mulberry32(key)() * figures.length);
  }
  let todayFig = figures[dayIndex()];
  function renderToday(f) {
    todayFig = f;
    const dims = engine.topDims(f.vec, 2).map((k) => LABEL[k]).join("、");
    const low = [...engine.topDims(f.vec, DIMS.length)].slice(-1).map((k) => LABEL[k]).join("、");
    $("#todayCard").innerHTML = cardHtml(f);
    window.HF_FX.bindTiltAll($("#todayCard"));
    $("#todayCopy").innerHTML = `
      <div class="badge-row"><span class="badge">${f.cat.label}</span><span class="badge badge-ghost">${escapeHtml(metaLine(f))}</span></div>
      <h3>${escapeHtml(f.n)}${f.s ? `<small>${escapeHtml(f.s)}</small>` : ""}</h3>
      <p class="result-tagline">${escapeHtml(f.t)}</p>
      <p class="today-luck"><b>今日宜</b> ${dims}　<b>今日忌</b> ${low}</p>
      <div class="result-actions">
        <button class="cta" type="button" id="todayOpen">查看人物档案</button>
        <a class="ghost" href="${wikiUrl(f)}" target="_blank" rel="noopener noreferrer">维基百科 ↗</a>
        <button class="ghost" type="button" id="todayNext">↻ 换一位</button>
      </div>`;
    $("#todayOpen").addEventListener("click", () => openFigure(f));
    $("#todayNext").addEventListener("click", () => {
      let next = randomFrom(figures);
      while (next === todayFig) next = randomFrom(figures);
      renderToday(next);
    });
  }
  renderToday(todayFig);

  // ---------- gallery ----------
  const filter = { cat: "all", region: "all", q: "" };
  const sessionOrder = [...figures].sort(() => Math.random() - .5);
  let filtered = [];
  let shown = 0;

  function renderChips() {
    const regions = [["all", "全部"], ["cn", "中国"], ["wd", "世界"]];
    $("#regionChips").innerHTML = regions.map(([key, label]) => `<button type="button" class="chip ${filter.region === key ? "on" : ""}" data-region="${key}">${label}</button>`).join("");
    const counts = {};
    figures.forEach((f) => { if (filter.region === "all" || f.r === filter.region) counts[f.c] = (counts[f.c] || 0) + 1; });
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    $("#catChips").innerHTML = `<button type="button" class="chip ${filter.cat === "all" ? "on" : ""}" data-cat="all">全部 <small>${total}</small></button>` +
      CAT_ORDER.filter((c) => counts[c]).map((c) => `<button type="button" class="chip ${filter.cat === c ? "on" : ""}" data-cat="${c}" style="--c:${CATS[c].color}"><i></i>${CATS[c].label} <small>${counts[c]}</small></button>`).join("");
  }

  function applyFilter() {
    const q = filter.q.trim().toLowerCase();
    const plain = filter.cat === "all" && filter.region === "all" && !q;
    filtered = (plain ? sessionOrder : figures).filter((f) => {
      if (filter.cat !== "all" && f.c !== filter.cat) return false;
      if (filter.region !== "all" && f.r !== filter.region) return false;
      if (!q) return true;
      return `${f.n}${f.s || ""}${f.p}${f.t}${f.w}${f.cat.label}${f.y}`.toLowerCase().includes(q);
    });
    shown = 0;
    $("#grid").innerHTML = "";
    $("#emptyHint").hidden = filtered.length > 0;
    $("#gridCount").textContent = `共 ${filtered.length} 位`;
    renderChips();
    renderMore();
  }

  function renderMore() {
    const next = filtered.slice(shown, shown + PAGE_SIZE);
    shown += next.length;
    $("#grid").insertAdjacentHTML("beforeend", next.map((f) => cardHtml(f)).join(""));
    window.HF_FX.bindTiltAll($("#grid"));
    $("#loadMore").hidden = shown >= filtered.length;
    $("#loadMore").textContent = `加载更多（${shown}/${filtered.length}）`;
  }
  $("#loadMore").addEventListener("click", renderMore);
  if ("IntersectionObserver" in window) {
    new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting) && !$("#loadMore").hidden) renderMore();
    }, { rootMargin: "600px" }).observe($("#loadMore"));
  }
  $("#regionChips").addEventListener("click", (event) => {
    const b = event.target.closest("[data-region]");
    if (!b) return;
    filter.region = b.dataset.region;
    applyFilter();
  });
  $("#catChips").addEventListener("click", (event) => {
    const b = event.target.closest("[data-cat]");
    if (!b) return;
    filter.cat = b.dataset.cat;
    applyFilter();
  });
  let searchTimer = null;
  $("#search").addEventListener("input", (event) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { filter.q = event.target.value; applyFilter(); }, 120);
  });
  $("#randomPick").addEventListener("click", () => openFigure(randomFrom(filtered.length ? filtered : figures)));
  updateCollectCount();
  applyFilter();

  // ---------- shared link ----------
  const sharedFig = (() => {
    const id = new URLSearchParams(location.search).get("f");
    return id !== null && /^\d+$/.test(id) ? byId.get(Number(id)) || null : null;
  })();
  if (sharedFig) {
    const view = $("#sharedView");
    view.hidden = false;
    view.style.setProperty("--type", sharedFig.cat.color);
    $("main").prepend(view);
    $("#sharedArt").innerHTML = `<div class="hcard-static" style="--c:${sharedFig.cat.color}">${artHtml(sharedFig)}</div>`;
    $("#sharedName").textContent = sharedFig.n;
    $("#sharedMeta").textContent = `${sharedFig.cat.label} · ${nameLine(sharedFig)} · ${sharedFig.y}`;
    $("#sharedDesc").textContent = sharedFig.t;
    $("#sharedDetailBtn").addEventListener("click", () => openFigure(sharedFig));
    $(".hero").hidden = true;
  }

  // ---------- quiz ----------
  const quiz = { questions: [], order: [], answers: [], times: [], index: 0, shownAt: 0, locked: false };
  const TAGS = ["翻阅史册中", "史官正在记录", "对照列传", "推演你的行事风格", "比对千古人物"];

  function startQuiz() {
    const incomplete = quiz.questions.length && quiz.answers.some((a) => a === null) && quiz.answers.some((a) => a !== null);
    if (!incomplete) {
      quiz.questions = engine.sampleIndexes(bank.length, SAMPLE_SIZE, Math.random).map((i) => bank[i]);
      quiz.order = quiz.questions.map((q) => engine.sampleIndexes(q.choices.length, q.choices.length, Math.random));
      quiz.answers = quiz.questions.map(() => null);
      quiz.times = quiz.questions.map(() => null);
      quiz.index = 0;
    } else {
      toast("接着上次的进度继续");
    }
    closeModal();
    $("#quiz").hidden = false;
    lockScroll();
    renderQuestion();
  }
  document.addEventListener("click", (event) => {
    if (event.target.closest("[data-start]")) startQuiz();
  });

  function renderQuestion() {
    const q = quiz.questions[quiz.index];
    const total = quiz.questions.length;
    const answered = quiz.answers.filter((a) => a !== null).length;
    $("#qIndex").textContent = String(quiz.index + 1).padStart(2, "0");
    $("#qTotal").textContent = total;
    $("#qBar").style.width = `${answered / total * 100}%`;
    $("#qDots").innerHTML = quiz.questions.map((_, i) => `<i class="${quiz.answers[i] !== null ? "done" : ""} ${i === quiz.index ? "cur" : ""}" data-i="${i}" title="第 ${i + 1} 题"></i>`).join("");
    $("#qTag").textContent = `第 ${String(quiz.index + 1).padStart(2, "0")} 问 · ${TAGS[quiz.index % TAGS.length]}`;
    $("#qText").textContent = q.text;
    const keys = ["A", "B", "C", "D"];
    $("#qChoices").innerHTML = quiz.order[quiz.index].map((choiceIndex, pos) => {
      const c = q.choices[choiceIndex];
      return `<button class="choice ${quiz.answers[quiz.index] === choiceIndex ? "selected" : ""}" type="button" data-choice="${choiceIndex}"><kbd>${keys[pos]}</kbd><b>${escapeHtml(c.title)}</b></button>`;
    }).join("");
    $("#qQuip").classList.remove("show");
    $("#quizBack").disabled = quiz.index === 0;
    quiz.shownAt = performance.now();
    quiz.locked = false;
    const card = $("#qCard");
    card.classList.remove("out", "in");
    void card.offsetWidth;
    card.classList.add("in");
  }

  function gotoQuestion(index) {
    const card = $("#qCard");
    card.classList.remove("in");
    card.classList.add("out");
    setTimeout(() => { quiz.index = index; renderQuestion(); }, 240);
  }

  function choose(choiceIndex) {
    if (quiz.locked) return;
    quiz.locked = true;
    const q = quiz.questions[quiz.index];
    quiz.answers[quiz.index] = choiceIndex;
    quiz.times[quiz.index] = performance.now() - quiz.shownAt;
    const button = $(`#qChoices [data-choice="${choiceIndex}"]`);
    $("#qChoices").querySelectorAll(".choice").forEach((el) => el.classList.remove("selected"));
    if (button) button.classList.add("selected", "picked");
    const quip = $("#qQuip");
    quip.textContent = q.choices[choiceIndex].quip || "";
    quip.classList.add("show");
    const answered = quiz.answers.filter((a) => a !== null).length;
    $("#qBar").style.width = `${answered / quiz.questions.length * 100}%`;
    const dot = $(`#qDots i[data-i="${quiz.index}"]`);
    if (dot) dot.classList.add("done");
    setTimeout(() => {
      const next = quiz.answers.findIndex((a, i) => a === null && i > quiz.index);
      const firstEmpty = quiz.answers.indexOf(null);
      if (next !== -1) gotoQuestion(next);
      else if (firstEmpty !== -1) gotoQuestion(firstEmpty);
      else finishQuiz();
    }, 700);
  }

  $("#qChoices").addEventListener("click", (event) => {
    const button = event.target.closest(".choice");
    if (button) choose(Number(button.dataset.choice));
  });
  $("#quizBack").addEventListener("click", () => { if (quiz.index > 0) gotoQuestion(quiz.index - 1); });
  $("#qDots").addEventListener("click", (event) => {
    const dot = event.target.closest("i[data-i]");
    if (dot && !quiz.locked && Number(dot.dataset.i) !== quiz.index) gotoQuestion(Number(dot.dataset.i));
  });
  $("#qChoices").addEventListener("pointermove", (event) => {
    const choice = event.target.closest(".choice");
    if (!choice || event.pointerType !== "mouse") return;
    const rect = choice.getBoundingClientRect();
    choice.style.setProperty("--ry", `${((event.clientX - rect.left) / rect.width - .5) * 10}deg`);
    choice.style.setProperty("--rx", `${(.5 - (event.clientY - rect.top) / rect.height) * 10}deg`);
  });
  $("#qChoices").addEventListener("pointerout", (event) => {
    const choice = event.target.closest(".choice");
    if (choice && !choice.contains(event.relatedTarget)) { choice.style.removeProperty("--rx"); choice.style.removeProperty("--ry"); }
  });
  $("#quizClose").addEventListener("click", () => {
    $("#quiz").hidden = true;
    lockScroll();
    if (quiz.answers.some((a) => a !== null)) toast("进度已暂存，随时回来继续");
  });

  // ---------- finish + build animation ----------
  function finishQuiz() {
    $("#quiz").hidden = true;
    const { z } = engine.scoreVector(quiz.questions, quiz.answers);
    const ranked = engine.rank(figures, z);
    const best = ranked[0];
    const avg = quiz.times.reduce((a, b) => a + (b || 0), 0) / quiz.times.length;
    const positions = quiz.answers.map((answer, i) => quiz.order[i].indexOf(answer));
    let egg = "";
    if (avg < 1000) egg = `⚡ 你平均 ${(avg / 1000).toFixed(1)} 秒答一题，果断，也可能没看题。史官只好按你的直觉来判。`;
    else if (positions.every((p) => p === positions[0])) egg = `🎯 彩蛋：你 12 题全选了 ${"ABCD"[positions[0]]}。选项顺序是随机打乱的，所以你是真·随缘型选手。`;
    runBuild(best, () => showResult({ ranked, z, egg }));
  }

  function runBuild(best, done) {
    const build = $("#build");
    const log = $("#buildLog");
    build.hidden = false;
    lockScroll();
    const lines = [
      `<em>史官</em> 正在整理你的 ${quiz.questions.length} 条言行记录…`,
      `  ✓ 归一化为 ${DIMS.length} 维性格向量：${DIMS.map((k) => LABEL[k]).join(" / ")}`,
      `  ✓ 与 ${figures.length} 位历史人物逐一比对`,
      `  ✓ 最高契合度：<b>${escapeHtml(best.figure.n)}</b> ${pctOf(best.score)}%`,
      "<em>列传已成</em> · 正在刻印史册…"
    ];
    log.innerHTML = "";
    let i = 0;
    const timer = setInterval(() => {
      log.innerHTML += `${lines[i]}\n`;
      i += 1;
      if (i >= lines.length) {
        clearInterval(timer);
        setTimeout(() => { build.hidden = true; lockScroll(); done(); }, 480);
      }
    }, 300);
  }

  // ---------- result ----------
  let currentResult = null;

  function whyHtml(f, z) {
    const shared = engine.sharedTraits(z, f, 3);
    const mine = userVals(z);
    let gapUp = null;
    let gapDown = null;
    DIMS.forEach((key, d) => {
      const gap = f.vec[d] - mine[d];
      if (!gapUp || gap > gapUp.gap) gapUp = { key, gap };
      if (!gapDown || gap < gapDown.gap) gapDown = { key, gap };
    });
    const chips = shared.map((k) => `<span><b>${LABEL[k]}</b>${engine.BLURBS[k]}</span>`).join("");
    const diff = [];
    if (gapUp && gapUp.gap > 1.5) diff.push(`${escapeHtml(f.n)}比你更「${LABEL[gapUp.key]}」`);
    if (gapDown && gapDown.gap < -1.5) diff.push(`你比${escapeHtml(f.n)}更「${LABEL[gapDown.key]}」`);
    return `
      <div class="why-title">你们最像的地方</div>
      <div class="why-chips">${chips || "<span>性格整体轮廓相近</span>"}</div>
      ${diff.length ? `<p class="why-diff">不过，${diff.join("，")}。</p>` : ""}`;
  }

  function showResult({ ranked, z, egg }) {
    const f = ranked[0].figure;
    const pct = pctOf(ranked[0].score);
    currentResult = { figure: f, z, pct, ranked };
    const section = $("#result");
    section.hidden = false;
    section.style.setProperty("--type", f.cat.color);
    $("#resultEgg").hidden = !egg;
    $("#resultEgg").textContent = egg;

    $("#resultArt").innerHTML = artHtml(f);
    $("#resultCat").textContent = f.cat.label;
    $("#resultPct").innerHTML = `契合 <b>${pct}%</b>`;
    $("#tcardName").textContent = f.n;
    $("#tcardMeta").textContent = metaLine(f);
    $("#tcardBackName").textContent = f.n;
    $("#tcardBackMeta").textContent = `${f.cat.label} · ${traitText(f)}`;
    $("#tcardBackQuote").textContent = `“${f.t}”`;
    $("#tcardNo").textContent = String(f.id + 1).padStart(3, "0");
    $("#tcardRadar").innerHTML = radarSvg(figRadar(f));

    $("#resultBadgeCat").textContent = f.cat.label;
    $("#resultBadgeNat").textContent = f.p;
    $("#resultBadgeYears").textContent = f.y;
    $("#resultName").textContent = f.n;
    $("#resultSub").textContent = f.s || "";
    $("#resultSub").hidden = !f.s;
    $("#resultTagline").textContent = f.t;
    $("#resultWhy").innerHTML = whyHtml(f, z);
    $("#legendName").textContent = f.n;
    $("#radar").innerHTML = radarSvg(figRadar(f), userRadar(z));
    $("#wikiBtn").href = wikiUrl(f);
    renderWiki($("#resultWiki"), f);

    const similar = ranked.slice(1, 7);
    $("#similarGrid").innerHTML = similar.map((r) => cardHtml(r.figure, { pct: pctOf(r.score) })).join("");
    window.HF_FX.bindTiltAll($("#similarGrid"));

    storage.set("hf-last", String(f.id));
    renderCompare(f);
    const fresh = collect(f.id);
    if (fresh) setTimeout(() => toast(`图鉴 +1：${f.n} 已收藏`), 1600);

    section.scrollIntoView({ behavior: "auto", block: "start" });
    landCard();
    setTimeout(() => burst($("#tcardStage"), [...f.n.slice(0, 4), "史", "鉴", "☯", "✦", "卷"], 40), 1100);
  }

  // 3D 卡片：拖动旋转，点击翻面，指针高光。
  const tcard = $("#tcard");
  let spin = 0;
  let spinDrag = null;
  function setSpin(deg, animate) {
    spin = deg;
    tcard.style.transition = animate ? "transform .8s cubic-bezier(.3,1.3,.4,1)" : "none";
    tcard.style.setProperty("--spin", `${deg}deg`);
  }
  function landCard() {
    setSpin(0, false);
    tcard.classList.remove("landing");
    void tcard.offsetWidth;
    tcard.classList.add("landing");
    setTimeout(() => tcard.classList.remove("landing"), 1600);
  }
  tcard.addEventListener("pointerdown", (event) => {
    spinDrag = { x: event.clientX, start: spin, moved: false };
    tcard.setPointerCapture(event.pointerId);
    tcard.classList.add("dragging");
  });
  tcard.addEventListener("pointermove", (event) => {
    const rect = tcard.getBoundingClientRect();
    tcard.style.setProperty("--gx", `${(event.clientX - rect.left) / rect.width * 100}%`);
    tcard.style.setProperty("--gy", `${(event.clientY - rect.top) / rect.height * 100}%`);
    if (spinDrag) {
      const dx = event.clientX - spinDrag.x;
      if (Math.abs(dx) > 5) spinDrag.moved = true;
      setSpin(spinDrag.start + dx * .8, false);
    } else if (event.pointerType === "mouse") {
      tcard.style.transition = "transform .1s linear";
      tcard.style.setProperty("--ry", `${((event.clientX - rect.left) / rect.width - .5) * 16}deg`);
      tcard.style.setProperty("--rx", `${(.5 - (event.clientY - rect.top) / rect.height) * 12}deg`);
    }
  });
  function endSpin() {
    if (!spinDrag) return;
    const moved = spinDrag.moved;
    spinDrag = null;
    tcard.classList.remove("dragging");
    setSpin(moved ? Math.round(spin / 180) * 180 : Math.round(spin / 180) * 180 + 180, true);
  }
  tcard.addEventListener("pointerup", endSpin);
  tcard.addEventListener("pointercancel", endSpin);
  tcard.addEventListener("pointerleave", () => {
    tcard.style.setProperty("--rx", "0deg");
    tcard.style.setProperty("--ry", "0deg");
  });

  // ---------- compare with friend ----------
  function similarity(a, b) {
    const cos = a._profile.reduce((s, p, i) => s + p * b._profile[i], 0);
    return clamp(Math.round(50 + cos * 50), 1, 99);
  }
  function renderCompare(mine) {
    const box = $("#compare");
    if (!sharedFig) { box.hidden = true; return; }
    const score = mine === sharedFig ? 100 : similarity(mine, sharedFig);
    const common = DIMS.filter((_, d) => mine.vec[d] >= 6 && sharedFig.vec[d] >= 6).map((k) => LABEL[k]);
    const text = mine === sharedFig
      ? "你们测出了同一个人物，英雄所见略同。"
      : score >= 80 ? `你们的人物气质高度相近${common.length ? `，都带着「${common.slice(0, 3).join("、")}」的底色` : ""}，很适合并肩作战。`
        : score >= 55 ? `性格有交集${common.length ? `（都有「${common.slice(0, 2).join("、")}」）` : ""}，也有明显差异，互补多过重复。`
          : "风格几乎相反，可能是最好的对手，也可能是最好的搭档。";
    box.hidden = false;
    box.innerHTML = `
      <div class="compare-head"><h3>你和朋友的人物契合度</h3><div class="compare-score">${score}%</div></div>
      <div class="compare-body">
        <div class="compare-side">${cardHtml(mine)}<small>你 · ${escapeHtml(mine.n)}</small></div>
        <div class="compare-vs">VS</div>
        <div class="compare-side">${cardHtml(sharedFig)}<small>TA · ${escapeHtml(sharedFig.n)}</small></div>
      </div>
      <p class="compare-text">${escapeHtml(text)}</p>`;
    window.HF_FX.bindTiltAll(box);
  }

  // ---------- share + poster ----------
  $("#shareBtn").addEventListener("click", async () => {
    if (!currentResult) return;
    const { figure: f, pct } = currentResult;
    const url = shareUrl(f);
    const text = `我最像的历史人物是「${f.n}」（${f.p}，契合 ${pct}%）：${f.t}\n你最像谁？来测：`;
    if (!url) {
      await copyText(`${text}\n（本地预览没有公网链接，部署后再分享）`).catch(() => {});
      toast("本地预览无法生成公网链接，已复制文案");
      return;
    }
    if (navigator.share && matchMedia("(pointer: coarse)").matches) {
      try { await navigator.share({ title: "史镜 · 你最像哪个历史人物", text, url }); return; } catch (e) { if (e && e.name === "AbortError") return; }
    }
    copyText(`${text}\n${url}`).then(() => toast("挑战链接已复制，朋友打开能直接和你比"), () => toast("复制失败"));
  });

  $("#posterBtn").addEventListener("click", async () => {
    if (!currentResult) return;
    const { figure: f, z, pct } = currentResult;
    const button = $("#posterBtn");
    button.disabled = true;
    button.textContent = "海报渲染中…";
    try {
      const url = (shareUrl(f) || location.host || "史镜").replace(/^https?:\/\//, "");
      const dataUrl = await window.HF_POSTER.drawPoster({
        figure: f,
        pct,
        color: f.cat.color,
        catLabel: f.cat.label,
        meta: metaLine(f),
        traits: engine.sharedTraits(z, f, 3).map((k) => LABEL[k]),
        radarFig: figRadar(f),
        radarMe: userRadar(z),
        labels: DIMS.map((k) => LABEL[k]),
        url
      });
      openModal(`
        <div class="poster-modal">
          <img src="${dataUrl}" alt="${escapeHtml(f.n)} 分享海报" />
          <p>手机长按图片保存，电脑点下面下载。发给朋友看看谁更像皇帝。</p>
          <a class="cta" href="${dataUrl}" download="shijing-${f.id}.png">下载海报</a>
        </div>`, f.cat.color);
    } catch (error) {
      toast(location.protocol === "file:" ? "file:// 下浏览器禁止导出图片，请用 start.command 启动本地服务" : "海报生成失败，再试一次");
    } finally {
      button.disabled = false;
      button.textContent = "生成分享海报";
    }
  });

  // ---------- misc ----------
  window.HF_FX.bindReveal();
  window.HF_FX.bindTiltAll();

  let logoClicks = 0;
  $("#logo").addEventListener("click", (event) => {
    event.preventDefault();
    logoClicks += 1;
    if (logoClicks >= 5) {
      logoClicks = 0;
      openModal(`<div class="egg-term">
        史官曰：<br/>
        你在一个历史人物测试网站里找彩蛋，<br/>
        这本身就很像 <b>${escapeHtml(randomFrom(figures.filter((f) => f.c === "S")).n)}</b>。<br/><br/>
        太史公曰：彩蛋不必多，五下足矣。</div>`);
    } else toast(`彩蛋进度 ${logoClicks}/5`);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      if (!modal.hidden) return closeModal();
      if (!$("#quiz").hidden) return $("#quizClose").click();
    }
    if (!$("#quiz").hidden && modal.hidden) {
      const map = { 1: 0, 2: 1, 3: 2, 4: 3, a: 0, b: 1, c: 2, d: 3 };
      const pos = map[event.key.toLowerCase()];
      if (pos !== undefined && !event.metaKey && !event.ctrlKey) {
        const choiceIndex = quiz.order[quiz.index][pos];
        if (choiceIndex !== undefined) choose(choiceIndex);
      }
      if (event.key === "ArrowLeft") $("#quizBack").click();
    }
  });

  if (sharedFig) toast("朋友给你发来了一张历史人物卡");
})();
