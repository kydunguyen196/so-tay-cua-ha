/* ============================================================
   IC.note — tiện ích dùng chung: animation (§3), storage, misc
   ============================================================ */
var IC = (function () {
  /* ---------- song ngữ Anh/Việt ---------- */
  var lang = (function () {
    try { return localStorage.getItem("icnote_lang") || "vi"; } catch (e) { return "vi"; }
  })();
  function setLang(l) {
    lang = l === "en" ? "en" : "vi";
    try { localStorage.setItem("icnote_lang", lang); } catch (e) {}
    document.dispatchEvent(new CustomEvent("icnote:langchange", { detail: { lang: lang } }));
  }
  /* t(obj) — obj dạng {vi:"...", en:"..."}; chấp nhận chuỗi thường để tương thích ngược */
  function t(obj) {
    if (obj === null || obj === undefined) return "";
    if (typeof obj === "string") return obj;
    return obj[lang] || obj.vi || obj.en || "";
  }
  function initLangToggle() {
    var btns = document.querySelectorAll("[data-lang-toggle]");
    if (!btns.length) return;
    function paint() {
      btns.forEach(function (b) {
        b.querySelectorAll("[data-lang-opt]").forEach(function (opt) {
          opt.classList.toggle("active", opt.dataset.langOpt === lang);
        });
      });
    }
    btns.forEach(function (b) {
      b.querySelectorAll("[data-lang-opt]").forEach(function (opt) {
        opt.addEventListener("click", function () { setLang(opt.dataset.langOpt); });
      });
    });
    paint();
    document.addEventListener("icnote:langchange", paint);
  }

  /* Máy bật "giảm chuyển động" → không tắt hiệu ứng hẳn mà chuyển sang
     chế độ nhẹ: chỉ fade opacity, bỏ di chuyển/blur/scale/rung. */
  var gentle = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var hasAnime = typeof anime !== "undefined";
  var canAnimate = hasAnime;

  /* lọc props chuyển động khi ở chế độ nhẹ */
  var MOTION_KEYS = ["translateX", "translateY", "scale", "rotate", "filter"];
  function m(props) {
    if (!gentle) return props;
    var out = {};
    Object.keys(props).forEach(function (k) {
      if (MOTION_KEYS.indexOf(k) === -1) out[k] = props[k];
    });
    if (out.duration) out.duration = Math.min(out.duration, 400);
    return out;
  }

  /* ---------- storage (localStorage, namespace icnote_) ---------- */
  var store = {
    get: function (key, fallback) {
      try {
        var raw = localStorage.getItem("icnote_" + key);
        return raw === null ? fallback : JSON.parse(raw);
      } catch (e) { return fallback; }
    },
    set: function (key, value) {
      try { localStorage.setItem("icnote_" + key, JSON.stringify(value)); } catch (e) {}
    }
  };

  /* tiến độ chương: { [subjectId]: { [chapterId]: true } } */
  function getDone(subjectId) { return store.get("done_" + subjectId, {}); }
  function setDone(subjectId, chapterId, val) {
    var d = getDone(subjectId);
    if (val) d[chapterId] = true; else delete d[chapterId];
    store.set("done_" + subjectId, d);
    logActivity();
  }
  function subjectProgress(subject) {
    var d = getDone(subject.id);
    var done = subject.chapters.filter(function (c) { return d[c.id]; }).length;
    return { done: done, total: subject.chapters.length,
      pct: subject.chapters.length ? Math.round(done * 100 / subject.chapters.length) : 0 };
  }

  /* điểm quiz: { [subjectId]: { best: n, total: n, wrongByChapter: {c2: 3} } } */
  function getQuizStat(subjectId) { return store.get("quiz_" + subjectId, { best: 0, total: 0, wrongByChapter: {} }); }
  function saveQuizResult(subjectId, score, total, wrongByChapter) {
    var s = getQuizStat(subjectId);
    s.total = total;
    if (score > s.best) s.best = score;
    var acc = s.wrongByChapter || {};
    Object.keys(wrongByChapter).forEach(function (ch) {
      acc[ch] = (acc[ch] || 0) + wrongByChapter[ch];
    });
    s.wrongByChapter = acc;
    store.set("quiz_" + subjectId, s);
    logActivity();
  }

  /* streak: đánh dấu hoạt động theo ngày { "2026-07-23": n } */
  function logActivity() {
    var log = store.get("activity", {});
    var day = new Date().toISOString().slice(0, 10);
    log[day] = (log[day] || 0) + 1;
    store.set("activity", log);
  }
  function getActivity() { return store.get("activity", {}); }
  function currentStreak() {
    var log = getActivity();
    var streak = 0;
    var d = new Date();
    for (;;) {
      var key = d.toISOString().slice(0, 10);
      if (log[key]) { streak++; d.setDate(d.getDate() - 1); }
      else if (streak === 0 && key === new Date().toISOString().slice(0, 10)) { d.setDate(d.getDate() - 1); }
      else break;
    }
    return streak;
  }

  /* ---------- animation helpers (§3) ---------- */
  function splitWords(el) {
    if (!el || el.dataset.split) return;
    el.dataset.split = "1";
    var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    var nodes = []; var n;
    while ((n = walker.nextNode())) nodes.push(n);
    nodes.forEach(function (node) {
      var words = node.textContent.split(/(\s+)/).filter(function (w) { return w.length; });
      var frag = document.createDocumentFragment();
      words.forEach(function (w) {
        if (/^\s+$/.test(w)) { frag.appendChild(document.createTextNode(w)); return; }
        var span = document.createElement("span");
        span.className = "word";
        span.style.display = "inline-block";
        if (canAnimate) { span.style.opacity = "0"; }
        span.textContent = w;
        frag.appendChild(span);
        frag.appendChild(document.createTextNode(" "));
      });
      node.parentNode.replaceChild(frag, node);
    });
  }

  /* IntersectionObserver — pattern chuẩn theo §3.2 */
  function onEnter(el, fn) {
    if (!el) return;
    if (!canAnimate) { fn(el); return; }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) { fn(entry.target); io.unobserve(entry.target); }
      });
    }, { threshold: 0.2, rootMargin: "0px 0px -8% 0px" });
    io.observe(el);
  }

  function revealWords(el) {
    splitWords(el);
    if (!canAnimate) return;
    anime.animate(el.querySelectorAll(".word"), m({
      opacity: [0, 1], filter: ["blur(6px)", "blur(0px)"],
      delay: anime.stagger(40), duration: 550
    }));
  }
  function fadeUp(el, dist, dur) {
    if (!canAnimate) { el.style.opacity = "1"; return; }
    anime.animate(el, m({ opacity: [0, 1], translateY: [dist || 16, 0], duration: dur || 550, ease: "outQuad" }));
  }
  function staggerChildren(container, selector) {
    var items = container.querySelectorAll(selector);
    if (!canAnimate) {
      items.forEach(function (i) { i.style.opacity = "1"; });
      return;
    }
    anime.animate(items, m({ opacity: [0, 1], translateY: [22, 0], delay: anime.stagger(90), duration: 600, ease: "outQuad" }));
  }
  function countUp(el, target, suffix, delay) {
    if (!canAnimate) { el.textContent = target + (suffix || ""); return; }
    var proxy = { v: 0 };
    anime.animate(proxy, {
      v: target, duration: 1400, ease: "outCubic", delay: delay || 0,
      onUpdate: function () { el.textContent = Math.round(proxy.v) + (suffix || ""); }
    });
  }
  function fillBar(el, pct, delay) {
    if (!canAnimate) { el.style.width = pct + "%"; return; }
    anime.animate(el, { width: ["0%", pct + "%"], duration: 900, ease: "outCubic", delay: delay || 300 });
  }

  /* nút từ tính (§3.3) — tắt khi máy bật giảm chuyển động */
  function magnetize(scope) {
    if (!canAnimate || gentle) return;
    (scope || document).querySelectorAll(".magnetic").forEach(function (btn) {
      btn.addEventListener("pointermove", function (e) {
        var r = btn.getBoundingClientRect();
        var x = e.clientX - r.left - r.width / 2;
        var y = e.clientY - r.top - r.height / 2;
        anime.animate(btn, { translateX: x * 0.18, translateY: y * 0.35, duration: 300, ease: "outQuad" });
      });
      btn.addEventListener("pointerleave", function () {
        anime.animate(btn, { translateX: 0, translateY: 0, duration: 400, ease: "outElastic(1, .6)" });
      });
    });
  }

  /* thanh tiến trình cuộn (§3.3) */
  function scrollProgress() {
    var bar = document.getElementById("scrollbar");
    if (!bar) return;
    function update() {
      var h = document.documentElement;
      var max = h.scrollHeight - h.clientHeight;
      bar.style.width = (max > 0 ? (h.scrollTop / max) * 100 : 0) + "%";
    }
    document.addEventListener("scroll", update, { passive: true });
    update();
  }

  /* ---------- query string ---------- */
  function param(name) {
    return new URLSearchParams(location.search).get(name);
  }
  function findSubject(id) {
    return IC_DATA.subjects.find(function (s) { return s.id === id; }) || IC_DATA.subjects[0];
  }

  return {
    canAnimate: canAnimate,
    gentle: gentle,
    m: m,
    get lang() { return lang; },
    setLang: setLang, t: t, initLangToggle: initLangToggle,
    store: store,
    getDone: getDone, setDone: setDone, subjectProgress: subjectProgress,
    getQuizStat: getQuizStat, saveQuizResult: saveQuizResult,
    getActivity: getActivity, currentStreak: currentStreak,
    splitWords: splitWords, onEnter: onEnter, revealWords: revealWords,
    fadeUp: fadeUp, staggerChildren: staggerChildren, countUp: countUp, fillBar: fillBar,
    magnetize: magnetize, scrollProgress: scrollProgress,
    param: param, findSubject: findSubject
  };
})();
