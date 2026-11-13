// 计分引擎：浏览器（window.HF_ENGINE）和 Node（scripts/calibrate.mjs）共用。
// 思路：把答题得分换算成「偏离随机作答的程度」（z 分数），再和每个历史人物的 9 维向量（减去全体均值后）做余弦相似度。
(function (root) {
  const DIMS = ["Y", "M", "W", "T", "R", "C", "G", "D", "N"]; // 野心 谋略 勇武 铁腕 仁德 才情 变革 洒脱 隐忍
  const LABELS = { Y: "野心", M: "谋略", W: "勇武", T: "铁腕", R: "仁德", C: "才情", G: "变革", D: "洒脱", N: "隐忍" };
  const BLURBS = {
    Y: "想做大事，不甘人下",
    M: "善于布局，擅长权衡",
    W: "敢打敢拼，冲在最前",
    T: "说一不二，手腕强硬",
    R: "体恤他人，宅心仁厚",
    C: "才华横溢，浪漫多思",
    G: "不破不立，勇于革新",
    D: "率性自在，不拘一格",
    N: "能屈能伸，沉得住气"
  };

  // 固定种子的随机数，保证模拟结果可复现。
  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const emptyVector = () => Object.fromEntries(DIMS.map((key) => [key, 0]));

  // 一道题随机作答时，每个维度的期望和方差。
  function questionStats(question) {
    const mean = emptyVector();
    const variance = emptyVector();
    DIMS.forEach((key) => {
      const values = question.choices.map((choice) => choice.score[key] || 0);
      const m = values.reduce((a, b) => a + b, 0) / values.length;
      mean[key] = m;
      variance[key] = values.reduce((a, b) => a + (b - m) ** 2, 0) / values.length;
    });
    return { mean, variance };
  }

  function scoreVector(questions, answers) {
    const raw = emptyVector();
    const mean = emptyVector();
    const variance = emptyVector();
    questions.forEach((question, index) => {
      const answer = answers[index];
      if (answer === null || answer === undefined) return;
      const stats = question._stats || (question._stats = questionStats(question));
      const score = question.choices[answer].score;
      DIMS.forEach((key) => {
        raw[key] += score[key] || 0;
        mean[key] += stats.mean[key];
        variance[key] += stats.variance[key];
      });
    });
    const z = emptyVector();
    DIMS.forEach((key) => { z[key] = variance[key] > 0 ? (raw[key] - mean[key]) / Math.sqrt(variance[key]) : 0; });
    return { raw, z };
  }

  // 给每个人物挂上 _profile：先减去自己的均值（只看「性格形状」，否则全面型帝王永远匹配不到），
  // 再减去全体人物在每个维度上的平均形状（避免某个维度人人都高而占便宜），最后单位化。
  // 答题的 z 分数天然是「和为零」的形状，所以这样匹配最公平。figures[i].vec 是 0-9 的数组。
  function prepare(figures) {
    const shapes = figures.map((f) => {
      const mean = f.vec.reduce((a, b) => a + b, 0) / f.vec.length;
      return f.vec.map((v) => v - mean);
    });
    const avg = DIMS.map((_, d) => shapes.reduce((s, v) => s + v[d], 0) / shapes.length);
    figures.forEach((f, i) => {
      const centered = shapes[i].map((v, d) => v - avg[d]);
      const norm = Math.sqrt(centered.reduce((a, b) => a + b * b, 0)) || 1;
      f._profile = centered.map((v) => v / norm);
    });
    return figures;
  }

  function rank(figures, z) {
    const vec = DIMS.map((key) => z[key]);
    const norm = Math.sqrt(vec.reduce((a, b) => a + b * b, 0)) || 1;
    return figures.map((figure) => {
      const cos = figure._profile.reduce((sum, p, i) => sum + p * vec[i], 0) / norm;
      return { figure, cos, score: cos + (figure.bias || 0) };
    }).sort((a, b) => b.score - a.score);
  }

  function sampleIndexes(length, count, rand) {
    const idx = Array.from({ length }, (_, i) => i);
    for (let i = idx.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rand() * (i + 1));
      [idx[i], idx[j]] = [idx[j], idx[i]];
    }
    return idx.slice(0, Math.min(count, length));
  }

  // 随机作答的蒙特卡洛模拟：返回每个人物被命中的次数。
  function simulate(bank, figures, { runs = 30000, sample = 12, seed = 20261113 } = {}) {
    const rand = mulberry32(seed);
    const counts = new Array(figures.length).fill(0);
    const index = new Map(figures.map((f, i) => [f, i]));
    for (let n = 0; n < runs; n += 1) {
      const qs = sampleIndexes(bank.length, sample, rand).map((i) => bank[i]);
      const answers = qs.map((q) => Math.floor(rand() * q.choices.length));
      const { z } = scoreVector(qs, answers);
      counts[index.get(rank(figures, z)[0].figure)] += 1;
    }
    return counts;
  }

  // 你和人物共有的突出特质：双方 z / 向量都偏高的维度，按乘积排序。
  function sharedTraits(z, figure, top = 3) {
    return DIMS
      .map((key, d) => ({ key, strength: Math.max(0, z[key]) * Math.max(0, figure.vec[d] - 4) }))
      .filter((item) => item.strength > 0)
      .sort((a, b) => b.strength - a.strength)
      .slice(0, top)
      .map((item) => item.key);
  }

  function topDims(vec, top = 3) {
    return DIMS.map((key, d) => ({ key, v: vec[d] })).sort((a, b) => b.v - a.v).slice(0, top).map((x) => x.key);
  }

  const api = { DIMS, LABELS, BLURBS, mulberry32, scoreVector, prepare, rank, simulate, sampleIndexes, sharedTraits, topDims };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.HF_ENGINE = api;
})(typeof window !== "undefined" ? window : globalThis);
