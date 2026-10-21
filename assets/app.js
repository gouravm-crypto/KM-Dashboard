/* CaratLane Kano Model dashboard */
(function () {
  "use strict";

  // ---------- Settings you may want to change ----------
  const CONCERN_FORM = "https://forms.gle/MSzcAjEk1ut4M6Pc9";
  const AUDITS = ["ppt", "vc", "cctv"].map((key) => ({
    key,
    get name() { return t("audit_" + key); },
    get tab() { return t("tab_" + key); },
  }));

  // ---------- Data ----------
  const CFG = window.KM_CONFIG || {};
  const STORES = window.KM_STORES || [];
  // keep only the latest N audit cycles (monthsToShow in config.js)
  const lastMonths = (list) => { const n = Number(CFG.monthsToShow) || 0; const sorted = list.slice().sort().reverse(); return n > 0 ? sorted.slice(0, n) : sorted; };
  let MONTHS = lastMonths(window.KM_MONTHS || []);
  const BY_CODE = new Map(STORES.map((s) => [s.code, s]));
  window.KM_REPORTS = window.KM_REPORTS || {};
  const loading = {};
  let liveOK = false, livePromise = null;

  // ---------- Live Google Sheet ----------
  function parseCSV(text) {
    const rows = []; let row = [], f = "", q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; }
        else f += c;
      } else if (c === '"') q = true;
      else if (c === ",") { row.push(f); f = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(f); rows.push(row); row = []; f = "";
      } else f += c;
    }
    if (f !== "" || row.length) { row.push(f); rows.push(row); }
    return rows;
  }
  const MON3 = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  const pad2 = (n) => String(n).padStart(2, "0");
  // Reads the dates the sheet shows (15/10/2026, 2026-10-15, 15-Oct-2026, Oct 15, 2026) as [year, month, day]
  function readDate(v) {
    const s = String(v || "").trim(); let m;
    if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) return [+m[1], +m[2], +m[3]];
    if ((m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/))) {
      let a = +m[1], b = +m[2];
      const dmy = a > 12 ? true : b > 12 ? false : CFG.dateOrder !== "MDY";
      return dmy ? [+m[3], b, a] : [+m[3], a, b];
    }
    if ((m = s.match(/^(\d{1,2})[\s/-]([A-Za-z]{3,})[\s/,-]+(\d{4})/)) && MON3.includes(m[2].slice(0, 3).toLowerCase())) return [+m[3], MON3.indexOf(m[2].slice(0, 3).toLowerCase()) + 1, +m[1]];
    if ((m = s.match(/^([A-Za-z]{3,})\s+(\d{1,2}),?\s+(\d{4})/)) && MON3.includes(m[1].slice(0, 3).toLowerCase())) return [+m[3], MON3.indexOf(m[1].slice(0, 3).toLowerCase()) + 1, +m[2]];
    return null;
  }
  function cycleMonth(v) {
    const m = String(v || "").match(/([A-Za-z]{3,})\w*\s+(\d{4})/);
    if (m && MON3.includes(m[1].slice(0, 3).toLowerCase()) && +m[2] > 2000) return m[2] + "-" + pad2(MON3.indexOf(m[1].slice(0, 3).toLowerCase()) + 1);
    return null;
  }
  function dateMonth(v) { const d = readDate(v); return d && d[0] > 2000 && d[1] >= 1 && d[1] <= 12 ? d[0] + "-" + pad2(d[1]) : null; }
  function isoDate(v) { const d = readDate(v); return d && d[0] > 2000 ? d[0] + "-" + pad2(d[1]) + "-" + pad2(d[2]) : String(v || "").trim(); }
  const normH = (h) => String(h).toLowerCase().replace(/[^a-z0-9]/g, "");
  function finder(header) {
    const h = header.map(normH);
    return (...keys) => { for (const k of keys) { const i = h.findIndex((x) => x.startsWith(k)); if (i >= 0) return i; } return -1; };
  }
  function buildFromSheet(rows) {
    const col = finder(rows[0] || []);
    const C = {
      type: col("audittype"), code: col("storecode"), email: col("emailid", "email"), date: col("dateofaudit"),
      cdate: col("dateofcctv"), cstart: col("cctvstarttime"), cend: col("cctvendtime"), dur: col("totalduartion", "totalduration"),
      viewed: col("mostviewed"), other: col("otherobservations"), p: col("paramter", "parameter"), i: col("input"),
      w: col("whomade"), e: col("errorexplanation"), f: col("howtocorrect"), t: col("errortype", "timestamp"),
      r: col("errorcatergory", "errorcategory"), d: col("pontsdeducted", "pointsdeducted"), at: col("attribute"), cycle: col("auditcycle"),
    };
    const reports = {}, emails = new Map();
    if (C.type < 0 || C.code < 0 || C.p < 0 || C.d < 0) return { reports, emails };
    for (let n = 1; n < rows.length; n++) {
      const row = rows[n], g = (k) => (C[k] >= 0 && row[C[k]] != null ? String(row[C[k]]).trim() : "");
      const ty = g("type").toLowerCase();
      const a = ty.startsWith("ppt") ? "ppt" : ty.startsWith("vc") || ty.startsWith("video") ? "vc" : ty.startsWith("cctv") ? "cctv" : null;
      const code = g("code").toUpperCase();
      if (!a || !code) continue;
      const month = cycleMonth(g("cycle")) || dateMonth(g("date"));
      if (!month) continue;
      const p = /^#(N\/A|REF!|VALUE!|ERROR!|DIV\/0!|NAME\?)/i.test(g("p")) ? "" : g("p");
      const raw = g("d").replace(/,/g, ""), pts = raw === "" || isNaN(+raw) ? null : +raw;
      if (!p && pts === null) continue;
      if (!emails.has(code)) emails.set(code, g("email").toLowerCase());
      const byStore = reports[month] = reports[month] || {};
      const rep = byStore[code] = byStore[code] || { km: null, ccl: null, deducted: 0, sent: "", vc: { link: "" }, cctv: {}, rows: [] };
      rep.rows.push({ a, p, i: g("i"), w: g("w"), e: g("e"), f: g("f"), t: g("t"), r: g("r"), d: pts || 0, at: g("at") });
      if (a === "vc" && !rep.vc.link) rep.vc.link = [g("cend"), g("other")].find((x) => /^https?:/i.test(x)) || "";
      if (a === "cctv" && !rep.cctv.date) rep.cctv = { date: isoDate(g("cdate")), start: g("cstart"), end: g("cend"), duration: g("dur"), viewed: g("viewed") };
    }
    Object.values(reports).forEach((byStore) => Object.values(byStore).forEach(scoreReport));
    return { reports, emails };
  }
  function applyScores(reports, rows) {
    const col = finder(rows[0] || []);
    const ci = col("storecode"), mi = col("auditcycle", "month", "cycle"), cc = col("ccl"), ki = col("kmscore", "kanomodelscore");
    if (ci < 0 || mi < 0) return;
    for (let n = 1; n < rows.length; n++) {
      const r = rows[n], code = String(r[ci] || "").trim().toUpperCase(), month = cycleMonth(r[mi]) || dateMonth(r[mi]);
      const rep = month && reports[month] && reports[month][code];
      if (!rep) continue;
      if (ki >= 0 && String(r[ki]).trim() !== "" && !isNaN(+r[ki])) { rep.km = +r[ki]; rep.ccl = cclFor(rep.km); }
      if (cc >= 0 && String(r[cc]).trim() !== "" && !isNaN(+r[cc])) rep.ccl = +r[cc];
    }
  }
  async function fetchText(url) {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    return res.text();
  }
  function loadLive() {
    if (!CFG.sheetCsvUrl) return Promise.resolve(false);
    if (livePromise) return livePromise;
    livePromise = (async () => {
      try {
        const [main, scores] = await Promise.all([
          fetchText(CFG.sheetCsvUrl),
          CFG.scoresCsvUrl ? fetchText(CFG.scoresCsvUrl).catch(() => null) : null,
        ]);
        const built = buildFromSheet(parseCSV(main));
        const months = Object.keys(built.reports).sort().reverse();
        if (!months.length) throw new Error("No audit rows found in the sheet");
        if (scores) applyScores(built.reports, parseCSV(scores));
        window.KM_REPORTS = built.reports;
        MONTHS = lastMonths(months);
        built.emails.forEach((email, code) => {
          if (BY_CODE.has(code)) return;
          const s = { code, erp: "", name: code, region: "", city: "", tier: "", state: "", format: "", type: "", email };
          STORES.push(s); BY_CODE.set(code, s);
        });
        liveOK = true;
      } catch (e) {
        console.warn("Live sheet could not be read, showing saved data instead.", e);
      }
      return liveOK;
    })();
    return livePromise;
  }

  function loadMonth(m) {
    if (!m) return Promise.resolve();
    if (window.KM_REPORTS[m]) return Promise.resolve();
    if (liveOK) { window.KM_REPORTS[m] = {}; return Promise.resolve(); }
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
  const report = (m, code) => {
    const rep = (m && window.KM_REPORTS[m] ? window.KM_REPORTS[m][code] : null) || null;
    if (rep && !rep.scored) scoreReport(rep);
    return rep;
  };

  // ---------- Helpers ----------
  const app = document.getElementById("app");
  const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  // ---------- Language ----------
  const I18N = window.KM_I18N || { languages: [{ code: "en", name: "English", locale: "en-IN", font: "" }], strings: { en: {} } };
  const LANGS = I18N.languages;
  let lang = "en";
  try { lang = localStorage.getItem("km-lang") || "en"; } catch (e) { /* storage unavailable */ }
  if (!LANGS.some((l) => l.code === lang)) lang = "en";
  function langInfo() { return LANGS.find((l) => l.code === lang) || LANGS[0]; }
  // t("key", {n: 3, month: "October"}) returns the wording in the chosen language (English if missing)
  function t(key, vars) {
    vars = vars || {};
    const S = I18N.strings[lang] || {}, E = I18N.strings.en || {};
    const k1 = vars.n === 1 ? key + "_one" : null;
    let out;
    if (k1 && S[k1] != null) out = S[k1];
    else if (S[key] != null) out = S[key];
    else if (k1 && E[k1] != null) out = E[k1];
    else out = E[key] != null ? E[key] : key;
    return out.replace(/\{(\w+)\}/g, (m, v) => (vars[v] != null ? vars[v] : m));
  }
  function applyLang() {
    const L = langInfo();
    document.documentElement.lang = L.code;
    document.documentElement.style.setProperty("--script", L.font ? '"' + L.font + '"' : '"Jost"');
    if (L.font && !document.getElementById("font-" + L.code)) {
      const link = document.createElement("link");
      link.id = "font-" + L.code;
      link.rel = "stylesheet";
      link.href = "https://fonts.googleapis.com/css2?family=" + L.font.replace(/ /g, "+") + ":wght@400;500;600&display=swap";
      document.head.appendChild(link);
    }
  }
  function langSelect() {
    return '<label class="lang-pick"><span class="sr-only">' + t("lang_label") + "</span>" +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.6 2.7 2.6 15.3 0 18M12 3c-2.6 2.7-2.6 15.3 0 18"/></svg>' +
      '<select data-lang-select>' + LANGS.map((l) => '<option value="' + l.code + '"' + (l.code === lang ? " selected" : "") + ">" + l.name + "</option>").join("") + "</select></label>";
  }
  function bindLang() {
    app.querySelectorAll("[data-lang-select]").forEach((sel) => sel.addEventListener("change", () => {
      lang = sel.value;
      try { localStorage.setItem("km-lang", lang); } catch (e) { /* storage unavailable */ }
      applyLang();
      route();
    }));
  }
  // Common English values in the audit data shown in the chosen language
  function val(v) {
    if (/^store$/i.test(v)) return t("who_store");
    if (/^yes$/i.test(v)) return t("yes");
    if (/^no$/i.test(v)) return t("no");
    return v;
  }
  function monthLabel(m, short) {
    if (!m) return "";
    const [y, mm] = m.split("-").map(Number);
    try {
      return new Intl.DateTimeFormat(langInfo().locale, short ? { month: lang === "en" ? "short" : "long" } : { month: "long", year: "numeric" }).format(new Date(y, mm - 1, 1));
    } catch (e) {
      const n = MONTH_NAMES[mm - 1] || m;
      return short ? n.slice(0, 3) : n + " " + y;
    }
  }
  function prettyDate(d) {
    if (!d) return "";
    let m = d.match(/^(\d{1,2})[-:/.](\d{1,2})[-:/.](\d{4})$/), dt = null;
    if (m) dt = new Date(+m[3], +m[2] - 1, +m[1]);
    else if ((m = d.match(/^(\d{4})-(\d{2})-(\d{2})/))) dt = new Date(+m[1], +m[2] - 1, +m[3]);
    if (!dt) return d;
    try { return new Intl.DateTimeFormat(langInfo().locale, { day: "numeric", month: lang === "en" ? "short" : "long", year: "numeric" }).format(dt); }
    catch (e) { return dt.getDate() + " " + MONTH_NAMES[dt.getMonth()].slice(0, 3) + " " + dt.getFullYear(); }
  }
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const isError = (r) => (Number(r.d) || 0) > 0 || !!(r.e || r.w);
  const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const sumPts = (rows) => rows.reduce((a, r) => a + (Number(r.d) || 0), 0);
  // NCF = breach or violation (100 points)
  const isNCF = (r) => /ncf/i.test(r.r || "") || (Number(r.d) || 0) >= 100;
  // SCORING (same as the monthly KM email)
  // KM score = 100 minus all points lost that month across PPT, VC and CCTV (never below 0).
  // Any NCF that month (in any audit) makes the KM score 0, and so CCL 0.
  // CCL points come from the KM score (see cclFor). An audit with no rows that month is NA.
  const AUDIT_KEYS = ["ppt", "vc", "cctv"];
  // CCL points from the KM score (CaratLane KM points table)
  function cclFor(km) {
    if (km == null) return null;
    const v = Math.floor(Number(km));
    return v >= 100 ? 15 : v >= 95 ? 14 : v >= 90 ? 13 : v >= 85 ? 12 : v >= 80 ? 11 : v >= 70 ? 10 : v >= 60 ? 5 : 0;
  }
  function scoreReport(rep) {
    rep.ncf = rep.rows.some(isNCF);
    rep.ncfAudits = AUDIT_KEYS.filter((k) => rep.rows.some((r) => r.a === k && isNCF(r)));
    const lost = Math.round(sumPts(rep.rows) * 100) / 100;
    rep.deducted = Math.min(100, lost);
    rep.km = rep.rows.length ? (rep.ncf ? 0 : Math.max(0, Math.floor(100 - lost + 1e-9))) : null;
    rep.ccl = cclFor(rep.km);
    rep.scored = true;
    return rep;
  }
  // points lost in one audit (shown up to 100), or null when that audit was not done
  function ptsOf(rep, key) {
    if (!rep) return null;
    const rows = rep.rows.filter((r) => r.a === key);
    return rows.length ? Math.min(100, Math.round(sumPts(rows) * 100) / 100) : null;
  }
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
    const mon = monthLabel(prevMonth, true);
    if (d === 0) return '<span class="delta same">' + t("same_as", { month: mon }) + "</span>";
    const good = lowerIsBetter ? d < 0 : d > 0;
    return '<span class="delta ' + (good ? "good" : "bad") + '">' + (d > 0 ? ICON.up : ICON.down) +
      t(d > 0 ? "more_than" : "less_than", { n: Math.abs(d), month: mon }) + "</span>";
  }

  // ---------- CaratLane "C" mark, traced from the logo (20 diamonds) ----------
  const C_MARK = ["559.7,0 471.6,42.6 556.8,127.8 642,42.6", "556.8,176.1 491.5,241.5 562.5,272.7 622.2,241.5", "724.4,90.9 616.5,136.4 679,204.5 769.9,198.9", "821,116.5 821,235.8 940.3,238.6 911.9,147.7", "693.2,272.7 718.8,340.9 786.9,363.6 786.9,272.7", "786.9,636.4 718.8,659.1 693.2,730.1 784.1,730.1", "821,764.2 821,886.4 909.1,855.1 943.2,764.2", "676.1,798.3 616.5,866.5 724.4,911.9 769.9,804", "559.7,727.3 491.5,758.5 556.8,823.9 622.2,758.5", "554,875 471.6,960.2 559.7,1000 642,960.2", "343.8,801.1 389.2,911.9 497.2,866.5 437.5,798.3", "326.7,636.4 326.7,727.3 420.5,730.1 397.7,661.9", "170.5,764.2 201.7,852.3 292.6,886.4 292.6,764.2", "190.3,559.7 144.9,667.6 252.8,713.1 258.5,619.3", "298.3,434.7 233,500 298.3,565.3 329.5,502.8", "96.6,414.8 56.8,502.8 99.4,585.2 181.8,497.2", "255.7,286.9 147.7,332.4 190.3,440.3 261.4,377.8", "292.6,116.5 204.5,144.9 170.5,235.8 292.6,235.8", "329.5,272.7 329.5,363.6 394.9,340.9 420.5,272.7", "389.2,90.9 343.8,196 434.7,204.5 497.2,133.5"];
  function markSVG(sparkles = 10) {
    let out = "";
    C_MARK.forEach((pts, i) => {
      const a = Math.random() * Math.PI * 2, d = 260 + Math.random() * 380;
      out += '<polygon class="shard" style="--i:' + i + ";--dx:" + Math.round(Math.cos(a) * d) + "px;--dy:" + Math.round(Math.sin(a) * d) +
        "px;--rot:" + Math.round(Math.random() * 360 - 180) + 'deg" points="' + pts + '"/>';
    });
    // purple sparkles that twinkle on random diamonds once the C has formed
    const picks = C_MARK.map((_, i) => i).sort(() => Math.random() - 0.5).slice(0, sparkles);
    picks.forEach((i, n) => {
      const xy = C_MARK[i].split(" ").map((p) => p.split(",").map(Number));
      const cx = xy.reduce((a, p) => a + p[0], 0) / xy.length, cy = xy.reduce((a, p) => a + p[1], 0) / xy.length;
      const size = 16 + Math.random() * 18;
      out += '<g transform="translate(' + cx.toFixed(1) + " " + cy.toFixed(1) + ") scale(" + size.toFixed(1) + ')"><path class="sparkle" d="M0,-1 C.12,-.12 .12,-.12 1,0 C.12,.12 .12,.12 0,1 C-.12,.12 -.12,.12 -1,0 C-.12,-.12 -.12,-.12 0,-1Z" style="--delay:' +
        (1.8 + n * 0.35 + Math.random()).toFixed(2) + "s;--dur:" + (2.6 + Math.random() * 1.8).toFixed(2) + 's"/></g>';
    });
    return '<svg viewBox="0 0 1000 1000" aria-hidden="true"><defs><linearGradient id="shardGrad" x1="0" y1="0" x2="1" y2="1">' +
      '<stop offset="0" stop-color="var(--mark-a)"/><stop offset="1" stop-color="var(--mark-b)"/></linearGradient></defs>' + out + "</svg>";
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
  const scoreStatus = (v) => (v >= 80 ? t("status_good") : t("status_bad"));

  // ---------- Score ring (fills clockwise from 12 o'clock) ----------
  const G = { c: 125, r: 104 };
  function gaugeSVG(color) {
    return '<svg viewBox="0 0 250 250" aria-hidden="true">' +
      '<circle class="gauge-track" cx="125" cy="125" r="104" fill="none" stroke-width="14"/>' +
      '<circle class="gauge-arc" cx="125" cy="125" r="104" fill="none" stroke="' + color + '" stroke-width="14" stroke-linecap="round" ' +
      'transform="rotate(-90 125 125)" stroke-dasharray="0 999"/>' +
      '<g class="gauge-gem" transform="translate(125 21)"><polygon points="0,-11 8,0 0,11 -8,0" fill="' + color + '" stroke="var(--surface)" stroke-width="2.5"/>' +
      '<g transform="translate(10 -12) scale(9)"><path class="sparkle gauge-spark" d="M0,-1 C.12,-.12 .12,-.12 1,0 C.12,.12 .12,.12 0,1 C-.12,.12 -.12,.12 -1,0 C-.12,-.12 -.12,-.12 0,-1Z"/></g></g>' +
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
    if (reduceMotion) { set(target); el.classList.add("done"); return; }
    const start = performance.now() + 200, dur = 1400;
    const step = (now) => {
      const p = Math.max(0, Math.min(1, (now - start) / dur));
      set(target * (1 - Math.pow(1 - p, 3)));
      if (p < 1) requestAnimationFrame(step); else { el.classList.add("done"); el.dispatchEvent(new Event("gaugedone")); }
    };
    set(0);
    requestAnimationFrame(step);
  }

  // Chip under last month's KM score: where the score stands now
  function kmChange(cur, prev) {
    if (cur == null || prev == null) return "";
    const d = cur - prev;
    if (d === 0) return '<span class="delta same">' + t("no_change") + "</span>";
    return '<span class="delta ' + (d > 0 ? "good" : "bad") + '">' + (d > 0 ? ICON.up : ICON.down) +
      t(d > 0 ? "km_up" : "km_down", { n: Math.abs(d), cur }) + "</span>";
  }

  // ---------- Confetti for 95 and above ----------
  const CELEBRATE_AT = 95;
  function confetti(fromEl) {
    if (reduceMotion) return;
    const r = fromEl.getBoundingClientRect();
    const ox = r.left + r.width / 2, oy = r.top + r.height / 2;
    const cv = document.createElement("canvas");
    cv.setAttribute("aria-hidden", "true");
    cv.style.cssText = "position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:60";
    document.body.appendChild(cv);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = innerWidth * dpr; cv.height = innerHeight * dpr;
    const ctx = cv.getContext("2d");
    ctx.scale(dpr, dpr);
    const colors = ["#8E3393", "#A24BA2", "#C27FCB", "#E3C3EC", "#D8B35E", "#F1D894"];
    const parts = Array.from({ length: 80 }, () => {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.3, v = 6 + Math.random() * 7;
      return {
        x: ox, y: oy, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
        size: 4 + Math.random() * 5, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.3,
        shape: Math.random() < 0.55 ? "gem" : Math.random() < 0.5 ? "dot" : "strip",
        color: colors[(Math.random() * colors.length) | 0],
      };
    });
    const start = performance.now(), life = 2600;
    const draw = (now) => {
      const t = now - start;
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      ctx.globalAlpha = Math.max(0, 1 - Math.max(0, t - life * 0.55) / (life * 0.45));
      parts.forEach((p) => {
        p.vy += 0.22; p.vx *= 0.985; p.vy *= 0.985;
        p.x += p.vx; p.y += p.vy; p.rot += p.vr;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillStyle = p.color;
        if (p.shape === "gem") {
          ctx.beginPath(); ctx.moveTo(0, -p.size); ctx.lineTo(p.size * 0.7, 0); ctx.lineTo(0, p.size); ctx.lineTo(-p.size * 0.7, 0); ctx.fill();
        } else if (p.shape === "dot") {
          ctx.beginPath(); ctx.arc(0, 0, p.size * 0.4, 0, Math.PI * 2); ctx.fill();
        } else {
          ctx.fillRect(-p.size * 0.6, -p.size * 0.2, p.size * 1.2, p.size * 0.4 * Math.abs(Math.cos(p.rot * 2)) + 1);
        }
        ctx.restore();
      });
      if (t < life) requestAnimationFrame(draw); else cv.remove();
    };
    requestAnimationFrame(draw);
  }

  // ---------- Light / dark ----------
  function themeBtn(extra) {
    return '<button type="button" class="theme-toggle' + (extra ? " " + extra : "") + '" data-theme-toggle aria-label="' + t("theme_label") + '">' +
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

  function animateCounts(root) {
    root.querySelectorAll("[data-count]").forEach((el, n) => {
      const to = Number(el.dataset.count);
      if (el.dataset.count === "" || !isFinite(to)) return;
      if (reduceMotion) { el.textContent = to; return; }
      el.textContent = "0";
      const start = performance.now() + 300 + n * 70, dur = 1100;
      const step = (now) => {
        const p = Math.max(0, Math.min(1, (now - start) / dur));
        el.textContent = Math.round(to * (1 - Math.pow(1 - p, 3)));
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
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
      '<label class="sr-only" for="' + id + '">' + t("search_label") + "</label>" +
      '<div class="search-field">' + ICON.search +
      '<input id="' + id + '" type="search" role="combobox" aria-expanded="false" aria-controls="' + id + '-list" aria-autocomplete="list" placeholder="' +
      (compact ? t("search_ph_short") : t("search_ph")) + '" spellcheck="false">' +
      '<button class="search-go" type="submit">' + t("search_btn") + "</button></div>" +
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
        list.innerHTML = '<li class="result-empty">' + t("no_match", { q: esc(q.trim()) }) + "</li>";
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
    bindLang();
    animateCounts(app);
    window.scrollTo(0, 0);
    if (after) after();
  }

  function viewHome() {
    document.title = t("title_site");
    render(
      '<section class="home"><div class="home-tools">' + langSelect() + themeBtn() + "</div>" +
      '<div class="home-mark">' + markSVG() + "</div>" +
      '<div class="home-inner">' + logos("home-logo") +
      "<h1>" + t("home_h1") + "</h1>" +
      '<p class="home-lede">' + t("home_lede") + "</p>" +
      searchHTML(false) +
      '<p class="home-meta">' + t("home_meta", { month: monthLabel(MONTHS[0]), n: STORES.length }) +
      '<span class="kbd-hint"> ' + t("kbd_hint", { key: "<kbd>/</kbd>" }) + "</span></p>" +
      "</div></section>",
      () => {
        const i = app.querySelector(".home input");
        if (i && window.innerWidth > 640) setTimeout(() => i.focus({ preventScroll: true }), 1100);
        loadLive().then((ok) => {
          const meta = app.querySelector(".home-meta");
          if (ok && meta) meta.firstChild.nodeValue = t("home_meta", { month: monthLabel(MONTHS[0]), n: STORES.length });
        });
      }
    );
  }

  function topbar(code, month, audit) {
    const opts = MONTHS.map((m) => '<option value="' + m + '"' + (m === month ? " selected" : "") + ">" + monthLabel(m) + "</option>").join("");
    return '<div class="topbar"><a href="#/" aria-label="' + t("all_stores") + '">' + logos("topbar-logo") + "</a>" +
      '<div class="topbar-tools">' + searchHTML(true) +
      (MONTHS.length ? '<label class="sr-only" for="monthSel">' + t("month_label") + '</label><select id="monthSel" class="month-select" data-code="' + esc(code) + '" data-audit="' + (audit || "") + '">' + opts + "</select>" : "") +
      langSelect() + themeBtn() + "</div></div>";
  }
  function bindMonth() {
    const sel = document.getElementById("monthSel");
    if (sel) sel.addEventListener("change", () => {
      location.hash = "#/s/" + sel.dataset.code + "/" + sel.value + (sel.dataset.audit ? "/" + sel.dataset.audit : "");
    });
  }
  function facts(s) {
    const f = [[t("region"), s.region], [t("city"), s.city], [t("state"), s.state], [t("format"), s.format], [t("type"), s.type], [t("tier"), s.tier]];
    return '<dl class="facts">' + f.map(([k, v], n) => '<div style="--n:' + n + '"><dt>' + k + "</dt><dd>" + esc(v || "–") + "</dd></div>").join("") + "</dl>";
  }
  function concern() {
    return '<section class="section"><div class="concern"><p><strong>' + t("concern_q") + "</strong>" + t("concern_p") + "</p>" +
      '<a class="btn solid" href="' + CONCERN_FORM + '" target="_blank" rel="noopener">' + t("concern_btn") + " " + ICON.ext + "</a></div></section>";
  }
  const footer = () => '<footer class="foot"><div class="wrap">' + t("footer") + "</div></footer>";

  function viewLoading() {
    render('<header class="band"><div class="wrap">' + topbar("", MONTHS[0]) + '</div></header><main class="body"><div class="wrap"><p class="loading">' +
      '<span class="spinner" aria-hidden="true"></span>' + t("loading") + "</p></div></main>");
  }

  function viewNotFound(code) {
    render('<header class="band"><div class="wrap">' + topbar("", MONTHS[0]) + '</div></header><main class="body"><div class="wrap"><div class="empty">' +
      "<h2>" + t("nf_title", { code: esc(code) }) + "</h2><p>" + t("nf_p") + "</p>" +
      '<a class="btn ghost" href="#/">' + t("back_search") + "</a></div></div></main>", bindMonth);
  }

  async function viewStore(code, month, audit) {
    if (CFG.sheetCsvUrl && !livePromise) viewLoading();
    await loadLive();
    const s = BY_CODE.get(code);
    if (!s) return viewNotFound(code);
    if (!MONTHS.includes(month)) month = MONTHS[0];
    await loadMonth(month);
    const rep = report(month, code);
    // compare with the most recent earlier month this store was audited in
    let prevMonth = null, prev = null;
    for (let i = MONTHS.indexOf(month) + 1; i < MONTHS.length && i <= MONTHS.indexOf(month) + 3; i++) {
      await loadMonth(MONTHS[i]);
      if (report(MONTHS[i], code)) { prevMonth = MONTHS[i]; prev = report(MONTHS[i], code); break; }
    }
    // not audited this month: find the latest earlier audit to carry its score forward
    let carry = null;
    if (!rep) {
      const all = (liveOK ? Object.keys(window.KM_REPORTS) : (window.KM_MONTHS || [])).slice().sort().reverse();
      for (const m of all.filter((x) => x < month)) {
        await loadMonth(m);
        const r = report(m, code);
        if (r) { carry = { month: m, rep: r }; break; }
      }
      return viewOverview(s, month, null, null, null, carry);
    }
    if (audit && AUDITS.some((a) => a.key === audit)) return viewAudit(s, month, prevMonth, rep, prev, audit);
    return viewOverview(s, month, prevMonth, rep, prev);
  }

  function viewOverview(s, month, prevMonth, rep, prev, carry) {
    document.title = s.name + " | " + t("title_site");
    const id =
      '<p class="crumb"><a href="#/">' + t("all_stores") + "</a> &nbsp;/&nbsp; " + t("report_for", { month: monthLabel(month) }) + "</p>" +
      '<h1 class="store-name">' + esc(s.name) + "</h1>" +
      '<p class="ids"><span class="code">' + esc(s.code) + "</span><span>" + esc(s.erp) + '</span><a href="mailto:' + esc(s.email) + '">' + esc(s.email) + "</a></p>" + facts(s);

    if (!rep && carry) {
      const from = carry.month, c = carry.rep;
      const link = MONTHS.includes(from) ? '<a class="btn ghost" href="#/s/' + s.code + "/" + from + '">' + t("see_month", { month: monthLabel(from) }) + " " + ICON.arrow + "</a>" : "";
      render('<header class="band"><div class="band-mark">' + markSVG(4) + '</div><div class="wrap">' + topbar(s.code, month) +
        '<div class="hero"><div class="identity">' + id + "</div>" +
        '<div class="scorecard"><div class="gauge" role="img" aria-label="' + t("km_score") + " " + esc(c.km) + '/100">' + gaugeSVG(scoreColor(c.km)) +
        '<div class="gauge-center"><div class="gauge-num">0<small>/100</small></div><div class="gauge-label">' + t("km_score") + '</div><div class="status carried">' + t("carried_title") + "</div></div></div>" +
        '<div class="side-stats"><div class="stat"><div class="stat-label">' + t("ccl_score") + '</div><div class="stat-num" data-count="' + esc(c.ccl) + '">' + esc(c.ccl) + "</div></div></div></div>" +
        "</div></div></header>" +
        '<main class="body"><div class="wrap"><div class="empty"><h2>' + t("carried_title") + "</h2><p>" + t("carried_note", { month: monthLabel(month), from: monthLabel(from) }) + "</p>" + link + "</div></div></main>" + footer(),
        () => { bindMonth(); const g = app.querySelector(".gauge"); animateGauge(g, c.km); countUp(app.querySelector(".gauge-num"), c.km); });
      return;
    }
    if (!rep) {
      render('<header class="band"><div class="band-mark">' + markSVG(4) + '</div><div class="wrap">' + topbar(s.code, month) +
        '<div class="hero"><div class="identity">' + id + "</div></div></div></header>" +
        '<main class="body"><div class="wrap"><div class="empty"><h2>' + t("noreport_title", { month: monthLabel(month) }) + "</h2>" +
        "<p>" + t("noreport_p") + "</p></div></div></main>" + footer(), bindMonth);
      return;
    }

    const pm = prev ? prevMonth : null;
    const score =
      '<div class="scorecard"><div class="gauge" role="img" aria-label="' + t("km_score") + " " + esc(rep.km) + '/100" style="--score-color:' + mix(scoreColor(rep.km), "#1A0610", .35) + '">' + gaugeSVG(scoreColor(rep.km)) +
      '<div class="gauge-center"><div class="gauge-num">0<small>/100</small></div><div class="gauge-label">' + t("km_score") + '</div><div class="status">' + scoreStatus(rep.km) + "</div></div></div>" +
      '<div class="side-stats">' +
      (pm ? '<div class="stat"><div class="stat-label">' + t("km_in", { month: monthLabel(pm) }) + '</div><div class="stat-num" style="color:' + scoreColor(prev.km) + '" data-count="' + esc(prev.km ?? "") + '">' + esc(prev.km ?? "–") + "</div>" + kmChange(rep.km, prev.km) + "</div>" : "") +
      (rep.ccl != null ? '<div class="stat" style="--n:1"><div class="stat-label">' + t("ccl_score") + '</div><div class="stat-num" data-count="' + esc(rep.ccl) + '">' + esc(rep.ccl) + "</div>" + (pm ? delta(rep.ccl, prev.ccl, pm, false) : "") + "</div>" : "") +
      '<div class="stat" style="--n:2"><div class="stat-label">' + t("points_lost") + '</div><div class="stat-num" data-count="' + esc(rep.deducted) + '">' + esc(rep.deducted) + "</div>" + (pm ? '<div class="stat-prev">' + monthLabel(pm, true) + ": " + esc(prev.deducted) + "</div>" : "") + "</div>" +
      "</div></div>";

    const ncfNote = rep.ncf
      ? '<p class="ncf-note">' + t("ncf_note", { audit: rep.ncfAudits.map((k) => (AUDITS.find((a) => a.key === k) || { name: k }).name).join(", ") }) + "</p>"
      : "";
    const panels = AUDITS.map((a, n) => {
      const rows = auditRows(rep, a.key), errs = rows.filter(isError), sc = ptsOf(rep, a.key);
      const psc = prev ? ptsOf(prev, a.key) : null;
      const big = sc == null
        ? '<div class="audit-points na">NA</div><div class="audit-points-label">' + t("not_done") + "</div>"
        : '<div class="audit-points"><span data-count="' + sc + '">' + sc + "</span></div>" +
          '<div class="audit-points-label">' + t("pts_lost_label", { n: sc }) + "</div>";
      return '<a class="audit-panel reveal' + (sc == null ? " is-na" : "") + '" style="--d:' + (700 + n * 120) + 'ms" href="#/s/' + s.code + "/" + month + "/" + a.key + '"><h3>' + a.name + "</h3>" + big +
        '<div class="audit-foot"><span>' + (sc == null ? "" : t("mistakes_n", { n: errs.length })) + (prev ? (sc == null ? "" : "<br>") + t("last_month_pts", { n: psc == null ? "NA" : psc }) : "") + "</span>" +
        '<span class="audit-open">' + t("see_details") + " " + ICON.arrow + "</span></div></a>";
    }).join("");

    render(
      '<header class="band"><div class="band-mark">' + markSVG(4) + '</div><div class="wrap">' + topbar(s.code, month) +
      '<div class="hero"><div class="identity">' + id + "</div>" + score + "</div>" + ncfNote + "</div></header>" +
      '<main class="body"><div class="wrap">' +
      '<section class="section"><div class="section-head"><h2>' + t("audits") + '</h2><p class="section-note">' +
      (rep.sent ? t("report_sent", { date: prettyDate(rep.sent) }) + " " : "") + t("audits_note") + "</p></div>" +
      '<div class="audits">' + panels + "</div></section>" +
      comparison(rep, prev, month, pm) + concern() +
      "</div></main>" + footer(),
      () => {
        bindMonth();
        const g = app.querySelector(".gauge"), n = app.querySelector(".gauge-num");
        if (Number(rep.km) >= CELEBRATE_AT) g.addEventListener("gaugedone", () => confetti(g), { once: true });
        animateGauge(g, rep.km);
        countUp(n, rep.km);
        requestAnimationFrame(() => setTimeout(() => app.querySelectorAll(".bar[data-w]").forEach((b) => { b.style.width = b.dataset.w + "%"; }), 120));
      }
    );
  }

  function barRows(items, max) {
    return '<div class="bars">' + items.map((it) => {
      const w = (v) => (max && v != null ? Math.max(0, (v / max) * 100) : 0).toFixed(1);
      const line = (cls, v) => '<div class="bar-line"><span class="bar ' + cls + (v ? "" : " zero") + '" data-w="' + w(v) + '"></span>' + (v == null ? "NA" : v) + "</div>";
      return '<div class="bar-row"><div class="bar-name">' + esc(it.name) + '</div><div class="bar-track">' + line("prev", it.prev) + line("cur", it.cur) + "</div></div>";
    }).join("") + "</div>";
  }

  function comparison(rep, prev, month, pm) {
    if (!prev) {
      return '<section class="section"><div class="section-head"><h2>' + t("compare_first") + "</h2></div>" +
        '<p class="empty-note">' + t("no_prev") + "</p></section>";
    }
    const legend = '<div class="legend"><span class="prev"><i></i>' + monthLabel(pm) + '</span><span class="cur"><i></i>' + monthLabel(month) + "</span></div>";
    const byAudit = AUDITS.map((a) => ({ name: a.name, prev: ptsOf(prev, a.key), cur: ptsOf(rep, a.key) }));
    const attrs = new Map();
    const add = (rows, k) => rows.forEach((r) => {
      const name = r.at || "Other";
      if (!attrs.has(name)) attrs.set(name, { name, prev: 0, cur: 0 });
      attrs.get(name)[k] += Number(r.d) || 0;
    });
    add(prev.rows, "prev"); add(rep.rows, "cur");
    const byAttr = [...attrs.values()].filter((x) => x.prev || x.cur).sort((a, b) => (b.cur + b.prev) - (a.cur + a.prev));
    const max = Math.max(1, ...byAudit.map((x) => Math.max(x.prev || 0, x.cur || 0)), ...byAttr.map((x) => Math.max(x.prev, x.cur)));

    const prevErr = new Map();
    prev.rows.filter(isError).forEach((r) => { const k = norm(r.p); if (!prevErr.has(k)) prevErr.set(k, r); });
    const seen = new Set();
    const repeats = rep.rows.filter(isError).filter((r) => {
      const k = norm(r.p);
      if (!prevErr.has(k) || seen.has(k)) return false;
      seen.add(k); return true;
    });
    const repeatHTML = repeats.length
      ? '<ul class="repeats">' + repeats.map((r) => {
        const p = prevErr.get(norm(r.p));
        return '<li class="repeat"><div class="repeat-p">' + esc(r.p) + '</div><div class="repeat-meta">' +
          t("repeat_meta", { audit: (AUDITS.find((a) => a.key === r.a) || { name: r.a }).name, text: esc(p.e || p.i || "") }) + "</div></li>";
      }).join("") + "</ul>"
      : '<p class="empty-note">' + t("repeat_none", { month: monthLabel(pm) }) + "</p>";

    return '<section class="section"><div class="section-head"><h2>' + t("compare_title", { month: monthLabel(pm) }) + "</h2></div>" +
      '<div class="compare">' +
      '<div class="card reveal" style="--d:900ms"><h3>' + t("by_audit") + '</h3><p class="hint">' + t("by_audit_hint") + "</p>" + legend + barRows(byAudit, max) + "</div>" +
      '<div class="card reveal" style="--d:1000ms"><h3>' + t("by_area") + '</h3><p class="hint">' + t("by_area_hint") + "</p>" + legend + (byAttr.length ? barRows(byAttr, max) : '<p class="empty-note">' + t("none_lost") + "</p>") + "</div>" +
      '<div class="card reveal" style="grid-column:1/-1;--d:1100ms"><h3>' + t("repeat_title") + '</h3><p class="hint">' +
      (repeats.length ? t("repeat_hint", { n: repeats.length, month: monthLabel(pm) }) : t("repeat_hint_none")) + "</p>" + repeatHTML + "</div>" +
      "</div></section>";
  }

  function obsCard(r, i, repeatSet) {
    const pts = Number(r.d) || 0;
    const repeat = repeatSet && repeatSet.has(norm(r.p));
    const meta = [[t("m_input"), val(r.i)], [t("m_who"), val(r.w)], [t("m_time"), r.t], [t("m_rating"), r.r]].filter(([, v]) => v);
    return '<article class="obs" style="--i:' + i + '">' +
      '<div class="obs-tags">' + (r.at ? '<span class="tag">' + esc(r.at) + "</span>" : "") + (isNCF(r) ? '<span class="tag repeat-tag">NCF</span>' : "") + (repeat ? '<span class="tag repeat-tag">' + t("tag_repeat") + "</span>" : "") + "</div>" +
      '<div class="pts"><div class="pts-num' + (pts ? "" : " zero") + '">' + (pts ? "−" + pts : "0") + '</div><div class="pts-label">' + t("pts_label", { n: pts }) + "</div></div>" +
      "<h3>" + esc(r.p) + "</h3>" +
      '<div class="obs-body">' +
      (r.e ? '<div class="obs-found"><h4>' + t("what_wrong") + "</h4><p>" + esc(r.e) + "</p></div>" : "") +
      (r.f ? '<div class="obs-fix"><h4>' + t("how_fix") + "</h4><p>" + esc(r.f) + "</p></div>" : "") +
      "</div>" +
      (meta.length ? '<dl class="obs-meta">' + meta.map(([k, v]) => "<div><dt>" + k + "</dt><dd>" + esc(v) + "</dd></div>").join("") + "</dl>" : "") +
      "</article>";
  }

  function tableHTML(rows) {
    const H = [t("th_audit"), t("th_param"), t("m_input"), t("m_who"), t("what_wrong"), t("how_fix"), t("m_time"), t("m_rating"), t("th_points"), t("th_area")];
    const name = (k) => (AUDITS.find((a) => a.key === k) || { name: k }).name;
    return '<div class="table-wrap"><table class="km"><thead><tr>' + H.map((h) => '<th scope="col">' + h + "</th>").join("") + "</tr></thead><tbody>" +
      rows.map((r) => "<tr><td>" + esc(name(r.a)) + "</td><td>" + esc(r.p) + "</td><td>" + esc(val(r.i)) + "</td><td>" + esc(val(r.w)) + "</td><td>" + esc(r.e) +
        "</td><td>" + esc(r.f) + "</td><td>" + esc(r.t) + "</td><td>" + esc(r.r) + '</td><td class="num">' + esc(r.d) + "</td><td>" + esc(r.at) + "</td></tr>").join("") +
      "</tbody></table></div>";
  }

  let auditMode = "cards";
  function viewAudit(s, month, prevMonth, rep, prev, key) {
    const a = AUDITS.find((x) => x.key === key);
    document.title = a.name + " | " + s.name + " | " + t("title_site");
    const rows = auditRows(rep, key), checks = rows.filter((r) => !isError(r));
    // costliest mistakes first, so an NCF is always at the top
    const errs = rows.filter(isError).map((r, i) => [r, i]).sort((x, y) => (Number(y[0].d) || 0) - (Number(x[0].d) || 0) || x[1] - y[1]).map((x) => x[0]);
    const prevRows = auditRows(prev, key), prevErrs = prevRows.filter(isError);
    const pm = prev ? prevMonth : null;
    const sc = ptsOf(rep, key), psc = prev ? ptsOf(prev, key) : null;
    const repeatSet = new Set((prev ? prev.rows.filter(isError) : []).map((r) => norm(r.p)));
    const byStore = errs.filter((r) => /store/i.test(r.w)).length;
    const byOther = errs.length - byStore;

    const tabs = '<nav class="tabs" aria-label="' + t("audits") + '">' + AUDITS.map((x) => {
      const n = auditRows(rep, x.key).filter(isError).length;
      return '<a class="tab" href="#/s/' + s.code + "/" + month + "/" + x.key + '"' + (x.key === key ? ' aria-current="page"' : "") + ">" + x.tab +
        '<span class="tab-count">' + n + "</span></a>";
    }).join("") + "</nav>";

    let ctx = "";
    if (rep && key === "vc" && rep.vc && rep.vc.link) {
      ctx = '<div class="context"><a class="btn ghost" href="' + esc(rep.vc.link) + '" target="_blank" rel="noopener">' + t("watch_vc") + " " + ICON.ext + "</a></div>";
    } else if (rep && key === "cctv" && rep.cctv && (rep.cctv.date || rep.cctv.start)) {
      const c = rep.cctv;
      const items = [[t("cctv_date"), prettyDate(c.date)], [t("start_time"), c.start], [t("end_time"), c.end], [t("total_time"), c.duration], [t("most_viewed"), c.viewed || t("not_recorded")]];
      ctx = '<div class="context card"><dl>' + items.map(([k, v]) => "<div><dt>" + k + "</dt><dd>" + esc(v || "–") + "</dd></div>").join("") + "</dl></div>";
    }

    let body;
    if (!rep) {
      body = '<div class="empty"><h2>' + t("noreport_title", { month: monthLabel(month) }) + "</h2><p>" + t("noreport_p_short") + "</p></div>";
    } else if (!rows.length) {
      body = ctx + '<div class="empty"><h2>' + t("not_done") + " (NA)</h2><p>" + t("nothing_recorded_p", { month: monthLabel(month) }) + "</p></div>";
    } else {
      body = ctx +
        '<div class="toolbar"><h2>' + (errs.length ? t("found_n", { n: errs.length }) : t("none_found")) + '</h2><div class="seg" role="group" aria-label="' + t("layout") + '">' +
        '<button type="button" data-mode="cards" aria-pressed="' + (auditMode === "cards") + '">' + t("cards") + "</button>" +
        '<button type="button" data-mode="table" aria-pressed="' + (auditMode === "table") + '">' + t("table") + "</button></div></div>" +
        (lang !== "en" && t("en_note") ? '<p class="en-note">' + t("en_note") + "</p>" : "") +
        '<div data-cards' + (auditMode === "cards" ? "" : " hidden") + ">" +
        (errs.length ? '<div class="obs-list">' + errs.map((r, i) => obsCard(r, i, repeatSet)).join("") + "</div>" : '<p class="empty-note">' + t("no_errors_audit") + "</p>") +
        (checks.length ? '<div class="section-head" style="margin-top:2.4rem"><h2 style="font:400 1.4rem/1.2 var(--display);margin:0">' + t("other_checks") + '</h2><p class="section-note">' + t("other_checks_note") + "</p></div>" +
          '<ul class="checks">' + checks.map((r, n) => {
            const no = /^no$/i.test(r.i);
            return '<li class="check" style="--n:' + n + '"><span class="check-mark' + (no ? " no" : "") + '">' + (no ? ICON.cross : ICON.tick) + "</span><span>" + esc(r.p) +
              '<div class="check-input">' + esc(val(r.i || r.r)) + "</div></span></li>";
          }).join("") + "</ul>" : "") +
        "</div>" +
        '<div data-table' + (auditMode === "table" ? "" : " hidden") + ">" + tableHTML(rows) + "</div>";
    }
    if (prev && prevErrs.length) {
      body += '<details class="prev-month"><summary>' + ICON.chev + t("prev_mistakes", { month: monthLabel(pm), n: prevErrs.length }) + "</summary>" +
        '<div class="obs-list">' + prevErrs.map((r, i) => obsCard(r, i, null)).join("") + "</div></details>";
    }

    const stats = rep
      ? '<div class="audit-stats">' +
        '<div class="stat"><div class="stat-label">' + t("points_lost") + "</div>" +
        (sc == null ? '<div class="stat-num">NA</div>' : '<div class="stat-num" data-count="' + sc + '">' + sc + "</div>" + (pm && psc != null ? delta(sc, psc, pm, true) : "")) + "</div>" +
        '<div class="stat"><div class="stat-label">' + t("mistakes_by_store") + '</div><div class="stat-num" data-count="' + byStore + '">' + byStore + "</div></div>" +
        (byOther ? '<div class="stat"><div class="stat-label">' + t("mistakes_by_others") + '</div><div class="stat-num">' + byOther + "</div></div>" : "") +
        '<div class="stat"><div class="stat-label">' + t("km_score") + '</div><div class="stat-num" style="color:' + scoreColor(rep.km) + '">' + esc(rep.km) + "</div></div></div>"
      : "";

    render(
      '<header class="band"><div class="band-mark">' + markSVG(4) + '</div><div class="wrap">' + topbar(s.code, month, key) +
      '<div class="audit-hero"><p class="crumb"><a href="#/">' + t("all_stores") + '</a> &nbsp;/&nbsp; <a href="#/s/' + s.code + "/" + month + '">' + esc(s.name) + " (" + esc(s.code) + ")</a> &nbsp;/&nbsp; " + monthLabel(month) + "</p>" +
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
  applyLang();
  window.addEventListener("hashchange", route);
  document.addEventListener("keydown", (e) => {
    if (e.key === "/" && !/input|textarea|select/i.test(document.activeElement.tagName)) {
      const i = app.querySelector("[data-search] input");
      if (i) { e.preventDefault(); i.focus(); }
    }
  });
  route();
})();
