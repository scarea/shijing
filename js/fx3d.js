// 3D 小工具：指针倾斜 + 高光，以及滚动入场。
(function () {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finePointer = window.matchMedia("(pointer: fine)").matches;

  function bindTilt(el, { max = 12, scale = 1.02 } = {}) {
    if (!el || el.dataset.tiltBound || reduceMotion) return;
    el.dataset.tiltBound = "1";
    let raf = null;
    let rx = 0;
    let ry = 0;
    let sx = 50;
    let sy = 50;
    function apply() {
      raf = null;
      el.style.setProperty("--rx", `${rx}deg`);
      el.style.setProperty("--ry", `${ry}deg`);
      el.style.setProperty("--gx", `${sx}%`);
      el.style.setProperty("--gy", `${sy}%`);
    }
    el.addEventListener("pointermove", (event) => {
      if (event.pointerType === "touch") return;
      const rect = el.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width;
      const y = (event.clientY - rect.top) / rect.height;
      ry = (x - .5) * max * 2;
      rx = (.5 - y) * max * 2;
      sx = x * 100;
      sy = y * 100;
      el.classList.add("tilting");
      el.style.setProperty("--ts", scale);
      if (!raf) raf = requestAnimationFrame(apply);
    });
    el.addEventListener("pointerleave", () => {
      rx = 0; ry = 0; sx = 50; sy = 50;
      el.classList.remove("tilting");
      el.style.setProperty("--ts", 1);
      if (!raf) raf = requestAnimationFrame(apply);
    });
  }

  function bindTiltAll(root = document, selector = ".tilt") {
    root.querySelectorAll(selector).forEach((el) => bindTilt(el, {
      max: Number(el.dataset.tiltMax || 10),
      scale: Number(el.dataset.tiltScale || 1.02)
    }));
  }

  // .r3d 元素滚动到视口时翻起入场。
  function bindReveal(root = document) {
    const items = root.querySelectorAll(".r3d:not(.r3d-in)");
    if (!("IntersectionObserver" in window) || reduceMotion) {
      items.forEach((el) => el.classList.add("r3d-in"));
      return;
    }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("r3d-in");
        io.unobserve(entry.target);
      });
    }, { threshold: .12, rootMargin: "0px 0px -6% 0px" });
    items.forEach((el, i) => {
      el.style.setProperty("--d", `${(i % 6) * 60}ms`);
      io.observe(el);
    });
  }

  window.HF_FX = { bindTilt, bindTiltAll, bindReveal, reduceMotion, finePointer };
})();
