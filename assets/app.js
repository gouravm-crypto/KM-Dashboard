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

  // ---------- CaratLane "C" mark, traced from the logo (20 diamonds) ----------
  const C_MARK = ["559.7,0 471.6,42.6 556.8,127.8 642,42.6", "556.8,176.1 491.5,241.5 562.5,272.7 622.2,241.5", "724.4,90.9 616.5,136.4 679,204.5 769.9,198.9", "821,116.5 821,235.8 940.3,238.6 911.9,147.7", "693.2,272.7 718.8,340.9 786.9,363.6 786.9,272.7", "786.9,636.4 718.8,659.1 693.2,730.1 784.1,730.1", "821,764.2 821,886.4 909.1,855.1 943.2,764.2", "676.1,798.3 616.5,866.5 724.4,911.9 769.9,804", "559.7,727.3 491.5,758.5 556.8,823.9 622.2,758.5", "554,875 471.6,960.2 559.7,1000 642,960.2", "343.8,801.1 389.2,911.9 497.2,866.5 437.5,798.3", "326.7,636.4 326.7,727.3 420.5,730.1 397.7,661.9", "170.5,764.2 201.7,852.3 292.6,886.4 292.6,764.2", "190.3,559.7 144.9,667.6 252.8,713.1 258.5,619.3", "298.3,434.7 233,500 298.3,565.3 329.5,502.8", "96.6,414.8 56.8,502.8 99.4,585.2 181.8,497.2", "255.7,286.9 147.7,332.4 190.3,440.3 261.4,377.8", "292.6,116.5 204.5,144.9 170.5,235.8 292.6,235.8", "329.5,272.7 329.5,363.6 394.9,340.9 420.5,272.7", "389.2,90.9 343.8,196 434.7,204.5 497.2,133.5"];
  function markSVG() {
    let out = "";
    C_MARK.forEach((pts, i) => {
      const a = Math.random() * Math.PI * 2, d = 260 + Math.random() * 380;
      out += '<polygon class="shard" style="--i:' + i + ";--dx:" + Math.round(Math.cos(a) * d) + "px;--dy:" + Math.round(Math.sin(a) * d) +
        "px;--rot:" + Math.round(Math.random() * 360 - 180) + 'deg" points="' + pts + '"/>';
    });
    return '<svg viewBox="0 0 1000 1000" aria-hidden="true">' + out + "</svg>";
  }

  // ---------- Score colour: 80+ green (deeper toward 100), below 80 red (deeper toward 0) ----------
  function mix(c1, c2, t) {
    const h = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
    const a = h(c1), b = h(c2);
    return "#" + a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, "0")).join("");
  }
  function scoreColor(score) {
    const v = Math.max(0, Math.min(100, Number(score) || 0));
    if (v >= 80) return mix("#6CCB8F", "#178A4C", (v - 80) / 20);
    return mix("#E8898B", "#9E0B1C", Math.min(1, (79 - v) / 69));
  }
  const scoreStatus = (v) => (v >= 80 ? "On track" : "Needs attention");

  // ---------- Score ring (fills clockwise from 12 o'clock) ----------
  const G = { c: 125, r: 104 };
  function gaugeSVG(color) {
    return '<svg viewBox="0 0 250 250" aria-hidden="true">' +
      '<circle class="gauge-track" cx="125" cy="125" r="104" fill="none" stroke-width="14"/>' +
      '<circle class="gauge-arc" cx="125" cy="125" r="104" fill="none" stroke="' + color + '" stroke-width="14" stroke-linecap="round" ' +
      'transform="rotate(-90 125 125)" stroke-dasharray="0 999"/>' +
      '<polygon class="gauge-gem" points="0,-11 8,0 0,11 -8,0" fill="' + color + '" stroke="var(--surface)" stroke-width="2.5" transform="translate(125 21)"/>' +
      "</svg>";
  }
  function animateGauge(el, score) {
    const arc = el.querySelector(".gauge-arc"), gem = el.querySelector(".gauge-gem");
    const C = 2 * Math.PI * G.r, target = Math.max(0, Math.min(100, Number(score) || 0)) / 100;
    const set = (t) => {
      arc.setAttribute("stroke-dasharray", (C * t).toFixed(2) + " " + C.toFixed(2));
      const ang = t * 2 * Math.PI;
      gem.setAttribute("transform", "translate(" + (G.c + G.r * Math.sin(ang)).toFixed(2) + " " + (G.c - G.r * Math.cos(ang)).toFixed(2) + ") rotate(" + (t * 360).toFixed(1) + ")");
    };
    if (reduceMotion) { set(target); return; }
    const start = performance.now() + 200, dur = 1400;
    const step = (now) => {
      const p = Math.max(0, Math.min(1, (now - start) / dur));
      set(target * (1 - Math.pow(1 - p, 3)));
      if (p < 1) requestAnimationFrame(step);
    };
    set(0);
    requestAnimationFrame(step);
  }

  // ---------- Light / dark ----------
  function themeBtn(extra) {
    return '<button type="button" class="theme-toggle' + (extra ? " " + extra : "") + '" data-theme-toggle aria-label="Switch light or dark mode">' +
      '<svg class="moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/></svg>' +
      '<svg class="sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"/></svg></button>';
  }
  function bindTheme() {
    app.querySelectorAll("[data-theme-toggle]").forEach((b) => b.addEventListener("click", () => {
      const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      try { localStorage.setItem("km-theme", next); } catch (e) { /* storage unavailable */ }
    }));
  }
  const logos = (cls) => '<img class="' + cls + ' logo-light" src="assets/logo.png" alt="CaratLane, a Tata product"><img class="' + cls + ' logo-dark" src="assets/logo-white.png" alt="" aria-hidden="true">';

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
    bindTheme();
    window.scrollTo(0, 0);
    if (after) after();
  }

  function viewHome() {
    document.title = "Kano Model store reports | CaratLane";
    const latest = MONTHS[0] ? "Latest cycle: " + monthLabel(MONTHS[0]) + ". " : "";
    render(
      '<section class="home">' + themeBtn("home-toggle") +
      '<div class="home-mark">' + markSVG() + "</div>" +
      '<div class="home-inner">' + logos("home-logo") +
      "<h1>Kano Model store reports</h1>" +
      '<p class="home-lede">Find your store to see this month’s score, every audit observation, and how it compares with last month.</p>' +
      searchHTML(false) +
      '<p class="home-meta">' + latest + STORES.length + ' stores.<span class="kbd-hint"> Press <kbd>/</kbd> to search.</span></p>' +
      "</div></section>",
      () => { const i = app.querySelector(".home input"); if (i && window.innerWidth > 640) setTimeout(() => i.focus({ preventScroll: true }), 1100); }
    );
  }

  function topbar(code, month, audit) {
    const opts = MONTHS.map((m) => '<option value="' + m + '"' + (m === month ? " selected" : "") + ">" + monthLabel(m) + "</option>").join("");
    return '<div class="topbar"><a href="#/" aria-label="All stores, back to search">' + logos("topbar-logo") + "</a>" +
      '<div class="topbar-tools">' + searchHTML(true) +
      (MONTHS.length ? '<label class="sr-only" for="monthSel">Report month</label><select id="monthSel" class="month-select" data-code="' + esc(code) + '" data-audit="' + (audit || "") + '">' + opts + "</select>" : "") +
      themeBtn() + "</div></div>";
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
      '<a class="btn solid" href="' + CONCERN_FORM + '" target="_blank" rel="noopener">Raise a concern ' + ICON.ext + "</a></div></section>";
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
      render('<header class="band"><div class="band-mark">' + markSVG() + '</div><div class="wrap">' + topbar(s.code, month) +
        '<div class="hero"><div class="identity">' + id + "</div></div></div></header>" +
        '<main class="body"><div class="wrap"><div class="empty"><h2>No report for ' + monthLabel(month) + "</h2>" +
        "<p>This store hasn’t received a Kano Model report for this cycle yet. Pick another month from the menu above.</p></div></div></main>" + footer(), bindMonth);
      return;
    }

    const pm = prev ? prevMonth : null;
    const score =
      '<div class="scorecard"><div class="gauge" role="img" aria-label="Kano Model score ' + esc(rep.km) + ' out of 100" style="--score-color:' + mix(scoreColor(rep.km), "#1A0610", .35) + '">' + gaugeSVG(scoreColor(rep.km)) +
      '<div class="gauge-center"><div class="gauge-num">0<small>/100</small></div><div class="gauge-label">Kano Model score</div><div class="status">' + scoreStatus(rep.km) + "</div></div></div>" +
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
      '<header class="band"><div class="band-mark">' + markSVG() + '</div><div class="wrap">' + topbar(s.code, month) +
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
        animateGauge(g, rep.km);
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
        '<div class="stat"><div class="stat-label">Kano Model score</div><div class="stat-num" style="color:' + scoreColor(rep.km) + '">' + esc(rep.km) + "</div></div></div>"
      : "";

    render(
      '<header class="band"><div class="band-mark">' + markSVG() + '</div><div class="wrap">' + topbar(s.code, month, key) +
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
