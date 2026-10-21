/* CaratLane Kano Model dashboard */
(function () {
  "use strict";

  // ---------- Settings you may want to change ----------
  const CONCERN_FORM = "https://forms.gle/MSzcAjEk1ut4M6Pc9";
  const AUDITS = [
    { key: "ppt", name: "PPT audit", tab: "PPT" },
    { key: "vc", name: "Video call audit", tab: "Video call" },
    { key: "cctv", name: "CCTV audit", tab: "CCTV" },
  ];

  // ---------- Data ----------
  const STORES = window.KM_STORES || [];
  const MONTHS = window.KM_MONTHS || [];
  const BY_CODE = new Map(STORES.map((s) => [s.code, s]));
  window.KM_REPORTS = window.KM_REPORTS || {};
  const loading = {};

  function loadMonth(m) {
    if (!m) return Promise.resolve();
    if (window.KM_REPORTS[m]) return Promise.resolve();
    if (loading[m]) return loading[m];
    loading[m] = new Promise((resolve) => {
      const s = document.createElement("script");
      s.src = "data/reports/" + m + ".js";
      s.onload = resolve;
      s.onerror = () => { window.KM_REPORTS[m] = window.KM_REPORTS[m] || {}; resolve(); };
      document.head.appendChild(s);
    });
    return loading[m];
  }
  const report = (m, code) => (m && window.KM_REPORTS[m] ? window.KM_REPORTS[m][code] : null) || null;

  // ---------- Helpers ----------
  const app = document.getElementById("app");
  const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  function monthLabel(m, short) {
    if (!m) return "";
    const [y, mm] = m.split("-").map(Number);
    const n = MONTH_NAMES[mm - 1] || m;
    return short ? n.slice(0, 3) : n + " " + y;
  }
  function prettyDate(d) {
    if (!d) return "";
    let m = d.match(/^(\d{1,2})[-:/.](\d{1,2})[-:/.](\d{4})$/);
    if (m) return +m[1] + " " + MONTH_NAMES[+m[2] - 1].slice(0, 3) + " " + m[3];
    m = d.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return +m[3] + " " + MONTH_NAMES[+m[2] - 1].slice(0, 3) + " " + m[1];
    return d;
  }
  const plural = (n, one, many) => n + " " + (n === 1 ? one : many || one + "s");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const isError = (r) => (Number(r.d) || 0) > 0 || !!(r.e || r.w);
  const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const sumPts = (rows) => rows.reduce((a, r) => a + (Number(r.d) || 0), 0);
  const auditRows = (rep, key) => (rep ? rep.rows.filter((r) => r.a === key) : []);

  const ICON = {
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
    arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
    up: '<svg viewBox="0 0 10 10" fill="currentColor"><path d="M5 1 9.5 8.5h-9z"/></svg>',
    down: '<svg viewBox="0 0 10 10" fill="currentColor"><path d="M5 9 .5 1.5h9z"/></svg>',
    chev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg>',
    tick: '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m2.5 6.5 2.2 2.2L9.5 3.5"/></svg>',
    cross: '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="m3 3 6 6M9 3l-6 6"/></svg>',
    ext: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>',
  };

  // Delta chip. lowerIsBetter flips which direction counts as good.
  function delta(cur, prev, prevMonth, lowerIsBetter) {
    if (cur == null || prev == null) return "";
    const d = Math.round((cur - prev) * 100) / 100;
    const vs = " from " + monthLabel(prevMonth, true);
    if (d === 0) return '<span class="delta same">Same as ' + monthLabel(prevMonth, true) + "</span>";
    const good = lowerIsBetter ? d < 0 : d > 0;
    return '<span class="delta ' + (good ? "good" : "bad") + '">' + (d > 0 ? ICON.up : ICON.down) +
      (d > 0 ? "Up " : "Down ") + Math.abs(d) + vs + "</span>";
  }

  // ---------- Faceted ring (echoes the CaratLane mark) ----------
  function polar(cx, cy, r, deg) {
    const a = (deg - 90) * Math.PI / 180;
    return (cx + r * Math.cos(a)).toFixed(2) + "," + (cy + r * Math.sin(a)).toFixed(2);
  }
  function facet(cx, cy, r1, r2, mid, w1, w2, skew) {
    return [polar(cx, cy, r1, mid - w1 / 2), polar(cx, cy, r2, mid - w2 / 2 + skew),
      polar(cx, cy, r2, mid + w2 / 2 + skew), polar(cx, cy, r1, mid + w1 / 2)].join(" ");
  }
  function decorRing(gradId, from, to) {
    let out = "", i = 0;
    const rings = [
      { n: 36, r1: 360, r2: 470, w1: 5, w2: 7.5, skew: 2, o: .3, off: 0 },
      { n: 36, r1: 250, r2: 340, w1: 3.6, w2: 6, skew: -2, o: .22, off: 5 },
      { n: 18, r1: 160, r2: 225, w1: 5, w2: 10, skew: 3, o: .16, off: 0 },
    ];
    rings.forEach((g) => {
      for (let k = 0; k < g.n; k++) {
        const mid = g.off + k * 360 / g.n;
        out += '<polygon class="f" style="--i:' + (i++) + ";--o:" + g.o + '" points="' + facet(500, 500, g.r1, g.r2, mid, g.w1, g.w2, g.skew) + '"/>';
      }
    });
    return '<svg viewBox="0 0 1000 1000" aria-hidden="true"><defs><linearGradient id="' + gradId +
      '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="' + from + '"/><stop offset="1" stop-color="' + to +
      '"/></linearGradient></defs>' + out + "</svg>";
  }
  function gaugeSVG() {
    const N = 20;
    let out = "";
    for (let k = 0; k < N; k++) {
      const mid = 9 + k * 360 / N;
      out += '<polygon class="f" data-k="' + k + '" points="' + facet(120, 120, 88, 116, mid, 13.5, 16, 0) + '"/>';
    }
    return '<svg viewBox="0 0 240 240" aria-hidden="true"><defs><linearGradient id="gaugeFacet" x1="0" y1="0" x2="1" y2="1">' +
      '<stop offset="0" stop-color="#E7C8F0"/><stop offset=".55" stop-color="#B05BB4"/><stop offset="1" stop-color="#7A2C8F"/></linearGradient></defs>' +
      out + '<circle cx="120" cy="120" r="80" fill="none" stroke="rgba(255,255,255,.08)"/></svg>';
  }
  function fillGauge(el, score) {
    const facets = [...el.querySelectorAll(".f")];
    const v = Math.max(0, Math.min(100, Number(score) || 0)) / 5;
    const full = Math.floor(v), part = v - full > 0.001;
    facets.forEach((f, k) => {
      const t = reduceMotion ? 0 : 250 + k * 55;
      setTimeout(() => {
        if (k < full) f.classList.add("on");
        else if (k === full && part) f.classList.add("part");
      }, t);
    });
  }
  function countUp(el, to) {
    if (to == null) { el.firstChild.nodeValue = "–"; return; }
    if (reduceMotion) { el.firstChild.nodeValue = to; return; }
    const start = performance.now(), dur = 1300;
    const step = (now) => {
      const p = Math.min(1, (now - start) / dur);
      const e = 1 - Math.pow(1 - p, 3);
      el.firstChild.nodeValue = Math.round(to * e);
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  // ---------- Search ----------
  function matchStores(q) {
    const Q = q.trim().toLowerCase();
    if (!Q) return [];
    const tokens = Q.split(/[\s,\-]+/).filter(Boolean);
    const out = [];
    for (const s of STORES) {
      const code = s.code.toLowerCase(), email = s.email, name = s.name.toLowerCase(), erp = s.erp.toLowerCase();
      let score = 0;
      if (code === Q || email === Q || email.split("@")[0] === Q) score = 100;
      else if (code.startsWith(Q)) score = 85;
      else if (email.startsWith(Q)) score = 75;
      else if (name.startsWith(Q)) score = 65;
      else if (name.includes(Q) || erp.includes(Q)) score = 55;
      else {
        const hay = [code, email, name, erp, s.city.toLowerCase(), s.state.toLowerCase()].join(" ");
        if (tokens.every((t) => hay.includes(t))) score = 40;
      }
      if (score) out.push({ s, score });
    }
    return out.sort((a, b) => b.score - a.score || a.s.name.localeCompare(b.s.name)).slice(0, 8).map((x) => x.s);
  }
  function mark(text, q) {
    const t = String(text), Q = q.trim();
    const i = Q ? t.toLowerCase().indexOf(Q.toLowerCase()) : -1;
    if (i < 0) return esc(t);
    return esc(t.slice(0, i)) + "<mark>" + esc(t.slice(i, i + Q.length)) + "</mark>" + esc(t.slice(i + Q.length));
  }

  let searchSeq = 0;
  function searchHTML(compact) {
    const id = "s" + (++searchSeq);
    return '<form class="search' + (compact ? " compact" : "") + '" role="search" data-search autocomplete="off">' +
      '<label class="sr-only" for="' + id + '">Search by store name, code or email</label>' +
      '<div class="search-field">' + ICON.search +
      '<input id="' + id + '" type="search" role="combobox" aria-expanded="false" aria-controls="' + id + '-list" aria-autocomplete="list" placeholder="' +
      (compact ? "Search stores" : "Store name, code or email") + '" spellcheck="false">' +
      '<button class="search-go" type="submit">Search</button></div>' +
      '<ul class="results" id="' + id + '-list" role="listbox" hidden></ul></form>';
  }
  function bindSearch(form) {
    const input = form.querySelector("input"), list = form.querySelector(".results");
    let items = [], active = -1;
    const close = () => { list.hidden = true; input.setAttribute("aria-expanded", "false"); active = -1; };
    const paint = () => {
      const q = input.value;
      if (!q.trim()) { close(); return; }
      items = matchStores(q);
      if (!items.length) {
        list.innerHTML = '<li class="result-empty">No store matches "' + esc(q.trim()) + '". Try the store code, like CFMYSNXM.</li>';
      } else {
        list.innerHTML = items.map((s, i) =>
          '<li class="result" role="option" id="' + list.id + "-" + i + '" data-i="' + i + '" aria-selected="' + (i === active) + '">' +
          '<span class="result-name">' + mark(s.name, q) + "</span>" +
          '<span class="result-code">' + mark(s.code, q) + "</span>" +
          '<span class="result-sub">' + mark(s.email, q) + " &nbsp;&nbsp;" + esc(s.city) + "</span></li>").join("");
      }
      list.hidden = false;
      input.setAttribute("aria-expanded", "true");
      input.setAttribute("aria-activedescendant", active >= 0 ? list.id + "-" + active : "");
    };
    const go = (s) => { if (s) { close(); input.blur(); location.hash = "#/s/" + s.code; } };
    input.addEventListener("input", () => { active = -1; paint(); });
    input.addEventListener("focus", () => { if (input.value.trim()) paint(); });
    input.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        if (!items.length) return;
        e.preventDefault();
        active = (active + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
        paint();
        const el = list.querySelector('[data-i="' + active + '"]');
        if (el) el.scrollIntoView({ block: "nearest" });
      } else if (e.key === "Escape") { close(); }
    });
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      if (!input.value.trim()) { input.focus(); return; }
      items = matchStores(input.value);
      go(items[active >= 0 ? active : 0] || null);
      if (!items.length) paint();
    });
    list.addEventListener("mousedown", (e) => {
      const li = e.target.closest(".result");
      if (li) { e.preventDefault(); go(items[+li.dataset.i]); }
    });
    input.addEventListener("blur", () => setTimeout(close, 120));
  }

  // ---------- Views ----------
  function render(html, after) {
    app.innerHTML = '<div class="view">' + html + "</div>";
    app.querySelectorAll("[data-search]").forEach(bindSearch);
    window.scrollTo(0, 0);
    if (after) after();
  }

  function viewHome() {
    document.title = "Kano Model store reports | CaratLane";
    const latest = MONTHS[0] ? "Latest cycle: " + monthLabel(MONTHS[0]) + ". " : "";
    render(
      '<section class="home">' +
      '<div class="home-ring">' + decorRing("homeFacet", "#C77BCB", "#5E2479") + "</div>" +
      '<div class="home-inner">' +
      '<img class="home-logo" src="assets/logo-white.png" alt="CaratLane, a Tata product">' +
      "<h1>Kano Model store reports</h1>" +
      '<p class="home-lede">Find your store to see this month’s score, every audit observation, and how it compares with last month.</p>' +
      searchHTML(false) +
      '<p class="home-meta">' + latest + STORES.length + " stores. Press <kbd>/</kbd> to search.</p>" +
      "</div></section>",
      () => { const i = app.querySelector(".home input"); if (i && window.innerWidth > 640) setTimeout(() => i.focus({ preventScroll: true }), 1100); }
    );
  }

  function topbar(code, month, audit) {
    const opts = MONTHS.map((m) => '<option value="' + m + '"' + (m === month ? " selected" : "") + ">" + monthLabel(m) + "</option>").join("");
    return '<div class="topbar"><a href="#/" aria-label="All stores, back to search"><img class="topbar-logo" src="assets/logo-white.png" alt="CaratLane, a Tata product"></a>' +
      '<div class="topbar-tools">' + searchHTML(true) +
      (MONTHS.length ? '<label class="sr-only" for="monthSel">Report month</label><select id="monthSel" class="month-select" data-code="' + esc(code) + '" data-audit="' + (audit || "") + '">' + opts + "</select>" : "") +
      "</div></div>";
  }
  function bindMonth() {
    const sel = document.getElementById("monthSel");
    if (sel) sel.addEventListener("change", () => {
      location.hash = "#/s/" + sel.dataset.code + "/" + sel.value + (sel.dataset.audit ? "/" + sel.dataset.audit : "");
    });
  }
  function facts(s) {
    const f = [["Region", s.region], ["City", s.city], ["State", s.state], ["Format", s.format], ["Type", s.type], ["Tier", s.tier]];
    return '<dl class="facts">' + f.map(([k, v]) => "<div><dt>" + k + "</dt><dd>" + esc(v || "–") + "</dd></div>").join("") + "</dl>";
  }
  function concern() {
    return '<section class="section"><div class="concern"><p><strong>Something in this report doesn’t look right?</strong>' +
      "Tell the quality team which observation you’d like reviewed and why.</p>" +
      '<a class="btn light" href="' + CONCERN_FORM + '" target="_blank" rel="noopener">Raise a concern ' + ICON.ext + "</a></div></section>";
  }
  const footer = () => '<footer class="foot"><div class="wrap">Kano Model reports by the CaratLane quality team. Scores start at 100 and each observation can deduct points.</div></footer>';

  function viewNotFound(code) {
    render('<header class="band"><div class="wrap">' + topbar("", MONTHS[0]) + '</div></header><main class="body"><div class="wrap"><div class="empty">' +
      "<h2>No store with code " + esc(code) + "</h2><p>Check the code or search by store name or email instead.</p>" +
      '<a class="btn ghost" href="#/">Back to search</a></div></div></main>', bindMonth);
  }

  async function viewStore(code, month, audit) {
    const s = BY_CODE.get(code);
    if (!s) return viewNotFound(code);
    if (!MONTHS.includes(month)) month = MONTHS[0];
    const prevMonth = MONTHS[MONTHS.indexOf(month) + 1];
    await Promise.all([loadMonth(month), loadMonth(prevMonth)]);
    const rep = report(month, code), prev = report(prevMonth, code);
    if (audit && AUDITS.some((a) => a.key === audit)) return viewAudit(s, month, prevMonth, rep, prev, audit);
    return viewOverview(s, month, prevMonth, rep, prev);
  }

  function viewOverview(s, month, prevMonth, rep, prev) {
    document.title = s.name + " | Kano Model " + monthLabel(month);
    const id =
      '<p class="crumb"><a href="#/">All stores</a> &nbsp;/&nbsp; Report for ' + monthLabel(month) + "</p>" +
      '<h1 class="store-name">' + esc(s.name) + "</h1>" +
      '<p class="ids"><span class="code">' + esc(s.code) + "</span><span>" + esc(s.erp) + '</span><a href="mailto:' + esc(s.email) + '">' + esc(s.email) + "</a></p>" + facts(s);

    if (!rep) {
      render('<header class="band"><div class="band-ring">' + decorRing("bandFacet", "#B865BD", "#4A1F66") + '</div><div class="wrap">' + topbar(s.code, month) +
        '<div class="hero"><div class="identity">' + id + "</div></div></div></header>" +
        '<main class="body"><div class="wrap"><div class="empty"><h2>No report for ' + monthLabel(month) + "</h2>" +
        "<p>This store hasn’t received a Kano Model report for this cycle yet. Pick another month from the menu above.</p></div></div></main>" + footer(), bindMonth);
      return;
    }

    const pm = prev ? prevMonth : null;
    const score =
      '<div class="scorecard"><div class="gauge" role="img" aria-label="Kano Model score ' + esc(rep.km) + ' out of 100">' + gaugeSVG() +
      '<div class="gauge-center"><div class="gauge-num" data-count="' + esc(rep.km) + '">0<small>/100</small></div><div class="gauge-label">Kano Model score</div></div></div>' +
      '<div class="side-stats">' +
      (pm ? '<div class="stat"><div class="stat-label">Change in score</div><div class="score-delta">' + delta(rep.km, prev.km, pm, false) + "</div></div>" : "") +
      '<div class="stat"><div class="stat-label">CCL score</div><div class="stat-num">' + esc(rep.ccl ?? "–") + "</div>" + (pm ? delta(rep.ccl, prev.ccl, pm, false) : "") + "</div>" +
      '<div class="stat"><div class="stat-label">Points deducted</div><div class="stat-num">' + esc(rep.deducted ?? sumPts(rep.rows)) + "</div>" + (pm ? delta(rep.deducted, prev.deducted, pm, true) : "") + "</div>" +
      "</div></div>";

    const panels = AUDITS.map((a) => {
      const rows = auditRows(rep, a.key), errs = rows.filter(isError), pts = sumPts(rows);
      const prevPts = prev ? sumPts(auditRows(prev, a.key)) : null;
      return '<a class="audit-panel" href="#/s/' + s.code + "/" + month + "/" + a.key + '"><h3>' + a.name + "</h3>" +
        '<div class="audit-points">' + pts + '</div><div class="audit-points-label">' + (pts === 1 ? "point" : "points") + " deducted</div>" +
        '<div class="audit-foot"><span>' + plural(errs.length, "observation") + (prev ? ", " + monthLabel(pm, true) + ": " + plural(prevPts, "point") : "") + "</span>" +
        '<span class="audit-open">View details ' + ICON.arrow + "</span></div></a>";
    }).join("");

    render(
      '<header class="band"><div class="band-ring">' + decorRing("bandFacet", "#B865BD", "#4A1F66") + '</div><div class="wrap">' + topbar(s.code, month) +
      '<div class="hero"><div class="identity">' + id + "</div>" + score + "</div></div></header>" +
      '<main class="body"><div class="wrap">' +
      '<section class="section"><div class="section-head"><h2>Audits</h2><p class="section-note">' +
      (rep.sent ? "Report sent " + prettyDate(rep.sent) + ". " : "") + "Open an audit to see each observation and how to fix it.</p></div>" +
      '<div class="audits">' + panels + "</div></section>" +
      comparison(rep, prev, month, pm) + concern() +
      "</div></main>" + footer(),
      () => {
        bindMonth();
        const g = app.querySelector(".gauge"), n = app.querySelector(".gauge-num");
        fillGauge(g, rep.km);
        countUp(n, rep.km);
        requestAnimationFrame(() => setTimeout(() => app.querySelectorAll(".bar[data-w]").forEach((b) => { b.style.width = b.dataset.w + "%"; }), 120));
      }
    );
  }

  function barRows(items, max) {
    return '<div class="bars">' + items.map((it) => {
      const w = (v) => (max ? Math.max(0, (v / max) * 100) : 0).toFixed(1);
      return '<div class="bar-row"><div class="bar-name">' + esc(it.name) + '</div><div class="bar-track">' +
        '<div class="bar-line"><span class="bar prev' + (it.prev ? "" : " zero") + '" data-w="' + w(it.prev) + '"></span>' + it.prev + "</div>" +
        '<div class="bar-line"><span class="bar cur' + (it.cur ? "" : " zero") + '" data-w="' + w(it.cur) + '"></span>' + it.cur + "</div></div></div>";
    }).join("") + "</div>";
  }

  function comparison(rep, prev, month, pm) {
    if (!prev) {
      return '<section class="section"><div class="section-head"><h2>Compared with last month</h2></div>' +
        '<p class="empty-note">There’s no earlier report for this store yet, so there’s nothing to compare against.</p></section>';
    }
    const legend = '<div class="legend"><span class="prev"><i></i>' + monthLabel(pm) + '</span><span class="cur"><i></i>' + monthLabel(month) + "</span></div>";
    const byAudit = AUDITS.map((a) => ({ name: a.name, prev: sumPts(auditRows(prev, a.key)), cur: sumPts(auditRows(rep, a.key)) }));
    const attrs = new Map();
    const add = (rows, k) => rows.forEach((r) => {
      const name = r.at || "Other";
      if (!attrs.has(name)) attrs.set(name, { name, prev: 0, cur: 0 });
      attrs.get(name)[k] += Number(r.d) || 0;
    });
    add(prev.rows, "prev"); add(rep.rows, "cur");
    const byAttr = [...attrs.values()].filter((x) => x.prev || x.cur).sort((a, b) => (b.cur + b.prev) - (a.cur + a.prev));
    const max = Math.max(1, ...byAudit.map((x) => Math.max(x.prev, x.cur)), ...byAttr.map((x) => Math.max(x.prev, x.cur)));

    const prevErr = new Map();
    prev.rows.filter(isError).forEach((r) => { const k = norm(r.p); if (!prevErr.has(k)) prevErr.set(k, r); });
    const seen = new Set();
    const repeats = rep.rows.filter(isError).filter((r) => {
      const k = norm(r.p);
      if (!prevErr.has(k) || seen.has(k)) return false;
      seen.add(k); return true;
    });
    const auditName = (k) => (AUDITS.find((a) => a.key === k) || { tab: k }).tab;
    const repeatHTML = repeats.length
      ? '<ul class="repeats">' + repeats.map((r) => {
        const p = prevErr.get(norm(r.p));
        return '<li class="repeat"><div class="repeat-p">' + esc(r.p) + '</div><div class="repeat-meta">' +
          auditName(r.a) + " audit this month. In " + monthLabel(pm, true) + ": " + esc(p.e || p.i || "flagged") + "</div></li>";
      }).join("") + "</ul>"
      : '<p class="empty-note">Nothing flagged in ' + monthLabel(pm) + " came up again. Well done.</p>";

    return '<section class="section"><div class="section-head"><h2>Compared with ' + monthLabel(pm) + "</h2>" +
      '<p class="section-note">Points deducted in each cycle.</p></div>' +
      '<div class="compare">' +
      '<div class="card"><h3>By audit</h3><p class="hint">Where the points were lost.</p>' + legend + barRows(byAudit, max) + "</div>" +
      '<div class="card"><h3>By attribute</h3><p class="hint">What the points were lost on.</p>' + legend + (byAttr.length ? barRows(byAttr, max) : '<p class="empty-note">No points deducted in either month.</p>') + "</div>" +
      '<div class="card" style="grid-column:1/-1"><h3>Repeated from last month</h3><p class="hint">' +
      (repeats.length ? plural(repeats.length, "observation") + " flagged in " + monthLabel(pm) + " showed up again." : "Issues that came back are listed here.") + "</p>" + repeatHTML + "</div>" +
      "</div></section>";
  }

  function obsCard(r, i, repeatSet) {
    const pts = Number(r.d) || 0;
    const repeat = repeatSet && repeatSet.has(norm(r.p));
    const meta = [["Input", r.i], ["Who made the error", r.w], ["Timestamp / error category", r.t], ["Final rating", r.r]].filter(([, v]) => v);
    return '<article class="obs" style="--i:' + i + '">' +
      '<div class="obs-tags">' + (r.at ? '<span class="tag">' + esc(r.at) + "</span>" : "") + (repeat ? '<span class="tag repeat-tag">Also flagged last month</span>' : "") + "</div>" +
      '<div class="pts"><div class="pts-num' + (pts ? "" : " zero") + '">' + (pts ? "−" + pts : "0") + '</div><div class="pts-label">' + (pts === 1 ? "point" : "points") + "</div></div>" +
      "<h3>" + esc(r.p) + "</h3>" +
      '<div class="obs-body">' +
      (r.e ? '<div class="obs-found"><h4>What was found</h4><p>' + esc(r.e) + "</p></div>" : "") +
      (r.f ? '<div class="obs-fix"><h4>How to correct it</h4><p>' + esc(r.f) + "</p></div>" : "") +
      "</div>" +
      (meta.length ? '<dl class="obs-meta">' + meta.map(([k, v]) => "<div><dt>" + k + "</dt><dd>" + esc(v) + "</dd></div>").join("") + "</dl>" : "") +
      "</article>";
  }

  function tableHTML(rows) {
    const H = ["Audit type", "Parameter", "Input", "Who made the error", "Error explanation", "How to correct the error", "Timestamp / error category", "Final rating", "Points deducted", "Attribute"];
    const name = (k) => (AUDITS.find((a) => a.key === k) || { name: k }).name;
    return '<div class="table-wrap"><table class="km"><thead><tr>' + H.map((h) => '<th scope="col">' + h + "</th>").join("") + "</tr></thead><tbody>" +
      rows.map((r) => "<tr><td>" + esc(name(r.a)) + "</td><td>" + esc(r.p) + "</td><td>" + esc(r.i) + "</td><td>" + esc(r.w) + "</td><td>" + esc(r.e) +
        "</td><td>" + esc(r.f) + "</td><td>" + esc(r.t) + "</td><td>" + esc(r.r) + '</td><td class="num">' + esc(r.d) + "</td><td>" + esc(r.at) + "</td></tr>").join("") +
      "</tbody></table></div>";
  }

  let auditMode = "cards";
  function viewAudit(s, month, prevMonth, rep, prev, key) {
    const a = AUDITS.find((x) => x.key === key);
    document.title = a.name + " | " + s.name + " | Kano Model";
    const rows = auditRows(rep, key), errs = rows.filter(isError), checks = rows.filter((r) => !isError(r));
    const prevRows = auditRows(prev, key), prevErrs = prevRows.filter(isError);
    const pm = prev ? prevMonth : null;
    const pts = sumPts(rows);
    const repeatSet = new Set((prev ? prev.rows.filter(isError) : []).map((r) => norm(r.p)));
    const byStore = errs.filter((r) => /store/i.test(r.w)).length;
    const byOther = errs.length - byStore;

    const tabs = '<nav class="tabs" aria-label="Audit types">' + AUDITS.map((x) => {
      const n = auditRows(rep, x.key).filter(isError).length;
      return '<a class="tab" href="#/s/' + s.code + "/" + month + "/" + x.key + '"' + (x.key === key ? ' aria-current="page"' : "") + ">" + x.tab +
        '<span class="tab-count">' + n + "</span></a>";
    }).join("") + "</nav>";

    let ctx = "";
    if (rep && key === "vc" && rep.vc && rep.vc.link) {
      ctx = '<div class="context"><a class="btn ghost" href="' + esc(rep.vc.link) + '" target="_blank" rel="noopener">Open video call recordings ' + ICON.ext + "</a></div>";
    } else if (rep && key === "cctv" && rep.cctv && (rep.cctv.date || rep.cctv.start)) {
      const c = rep.cctv;
      const items = [["Footage date", prettyDate(c.date)], ["Start", c.start], ["End", c.end], ["Total duration", c.duration], ["Most viewed category", c.viewed || "Not recorded"]];
      ctx = '<div class="context card"><dl>' + items.map(([k, v]) => "<div><dt>" + k + "</dt><dd>" + esc(v || "–") + "</dd></div>").join("") + "</dl></div>";
    }

    let body;
    if (!rep) {
      body = '<div class="empty"><h2>No report for ' + monthLabel(month) + "</h2><p>Pick another month from the menu above.</p></div>";
    } else if (!rows.length) {
      body = ctx + '<div class="empty"><h2>Nothing recorded</h2><p>This audit has no observations for ' + monthLabel(month) + ".</p></div>";
    } else {
      body = ctx +
        '<div class="toolbar"><h2>' + (errs.length ? plural(errs.length, "observation") : "No observations") + '</h2><div class="seg" role="group" aria-label="Layout">' +
        '<button type="button" data-mode="cards" aria-pressed="' + (auditMode === "cards") + '">Cards</button>' +
        '<button type="button" data-mode="table" aria-pressed="' + (auditMode === "table") + '">Table</button></div></div>' +
        '<div data-cards' + (auditMode === "cards" ? "" : " hidden") + ">" +
        (errs.length ? '<div class="obs-list">' + errs.map((r, i) => obsCard(r, i, repeatSet)).join("") + "</div>" : '<p class="empty-note">No errors found in this audit.</p>') +
        (checks.length ? '<div class="section-head" style="margin-top:2.4rem"><h2 style="font:500 1.4rem/1.2 var(--display);margin:0">Other checks</h2><p class="section-note">Recorded with no points deducted.</p></div>' +
          '<ul class="checks">' + checks.map((r) => {
            const no = /^no$/i.test(r.i);
            return '<li class="check"><span class="check-mark' + (no ? " no" : "") + '">' + (no ? ICON.cross : ICON.tick) + "</span><span>" + esc(r.p) +
              '<div class="check-input">' + esc(r.i || r.r) + "</div></span></li>";
          }).join("") + "</ul>" : "") +
        "</div>" +
        '<div data-table' + (auditMode === "table" ? "" : " hidden") + ">" + tableHTML(rows) + "</div>";
    }
    if (prev && prevErrs.length) {
      body += '<details class="prev-month"><summary>' + ICON.chev + monthLabel(pm) + " observations (" + prevErrs.length + ")</summary>" +
        '<div class="obs-list">' + prevErrs.map((r, i) => obsCard(r, i, null)).join("") + "</div></details>";
    }

    const prevPts = prev ? sumPts(prevRows) : null;
    const stats = rep
      ? '<div class="audit-stats">' +
        '<div class="stat"><div class="stat-label">Points deducted</div><div class="stat-num">' + pts + "</div>" + (pm ? delta(pts, prevPts, pm, true) : "") + "</div>" +
        '<div class="stat"><div class="stat-label">Errors by store</div><div class="stat-num">' + byStore + "</div></div>" +
        (byOther ? '<div class="stat"><div class="stat-label">Errors by other teams</div><div class="stat-num">' + byOther + "</div></div>" : "") +
        '<div class="stat"><div class="stat-label">Kano Model score</div><div class="stat-num">' + esc(rep.km) + "</div></div></div>"
      : "";

    render(
      '<header class="band"><div class="band-ring">' + decorRing("bandFacet", "#B865BD", "#4A1F66") + '</div><div class="wrap">' + topbar(s.code, month, key) +
      '<div class="audit-hero"><p class="crumb"><a href="#/">All stores</a> &nbsp;/&nbsp; <a href="#/s/' + s.code + "/" + month + '">' + esc(s.name) + " (" + esc(s.code) + ")</a> &nbsp;/&nbsp; " + monthLabel(month) + "</p>" +
      '<h1 class="audit-title">' + a.name + "</h1>" + stats + tabs + "</div></div></header>" +
      '<main class="body"><div class="wrap">' + body + '<div style="margin-top:3rem">' + concern() + "</div></div></main>" + footer(),
      () => {
        bindMonth();
        app.querySelectorAll(".seg button").forEach((b) => b.addEventListener("click", () => {
          auditMode = b.dataset.mode;
          app.querySelectorAll(".seg button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
          app.querySelector("[data-cards]").hidden = auditMode !== "cards";
          app.querySelector("[data-table]").hidden = auditMode !== "table";
        }));
      }
    );
  }

  // ---------- Router ----------
  function route() {
    const parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
    if (parts[0] === "s" && parts[1]) {
      viewStore(parts[1].toUpperCase(), parts[2], parts[3]);
    } else {
      viewHome();
    }
  }
  window.addEventListener("hashchange", route);
  document.addEventListener("keydown", (e) => {
    if (e.key === "/" && !/input|textarea|select/i.test(document.activeElement.tagName)) {
      const i = app.querySelector("[data-search] input");
      if (i) { e.preventDefault(); i.focus(); }
    }
  });
  route();
})();
