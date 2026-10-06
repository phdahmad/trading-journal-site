/* سجل الصفقات — الحسابات والعرض المشترك
 * البيانات تُقرأ من data/trades.js (أو data/demo.js عند إضافة ?demo للرابط)
 * وتُحمَّل كـ <script> حتى تعمل الصفحات بفتحها مباشرة من الجهاز دون خادم. */
(function () {
  "use strict";

  const LOCALE = "ar-u-nu-latn-ca-gregory"; // أرقام غربية دائماً
  const isDemo = /[?&]demo\b/.test(location.search);

  /* ---------- التنسيق ---------- */
  const nf2 = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const nf0 = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
  const nfQty = new Intl.NumberFormat("en-US", { maximumFractionDigits: 4 });
  const dfLong = new Intl.DateTimeFormat(LOCALE, { day: "numeric", month: "long", year: "numeric" });
  const dfShort = new Intl.DateTimeFormat(LOCALE, { day: "numeric", month: "short" });
  const dfMonth = new Intl.DateTimeFormat(LOCALE, { month: "long", year: "numeric" });
  const dfMonthShort = new Intl.DateTimeFormat(LOCALE, { month: "short" });

  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const num = (txt) => `<span class="num">${txt}</span>`;
  const tone = (v) => (v > 0.004 ? "gain" : v < -0.004 ? "loss" : "flat");
  const money = (v, opts = {}) => {
    const sign = opts.signed && v > 0.004 ? "+" : v < -0.004 ? "−" : "";
    const body = (opts.whole ? nf0 : nf2).format(Math.abs(v));
    return num(sign + body);
  };
  const signedMoney = (v, whole) => `<span class="${tone(v)}">${money(v, { signed: true, whole })}</span>`;
  const pct = (v, signed = true) => {
    if (v == null || !isFinite(v)) return "—";
    const sign = signed && v > 0.00004 ? "+" : v < -0.00004 ? "−" : "";
    return num(sign + nf2.format(Math.abs(v * 100)) + "%");
  };
  const signedPct = (v) => (v == null || !isFinite(v) ? "—" : `<span class="${tone(v)}">${pct(v)}</span>`);
  const parseDate = (s) => { const [y, m, d] = String(s).split("-").map(Number); return new Date(y, m - 1, d); };
  const fmtDate = (s) => (s ? dfLong.format(parseDate(s)) : "—");
  const fmtShort = (s) => (s ? dfShort.format(parseDate(s)) : "—");
  const fmtQty = (q) => num(nfQty.format(q));
  const days = (a, b) => Math.max(0, Math.round((parseDate(b) - parseDate(a)) / 86400000));
  const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  const dayWord = (n) => (n === 0 ? "نفس اليوم" : n === 1 ? "يوم واحد" : n === 2 ? "يومان" : n <= 10 ? `${n} أيام` : `${n} يوماً`);

  /* ---------- الحسابات ----------
   * تكلفة السهم الواحد = (الكمية × سعر الشراء + عمولة الشراء) ÷ الكمية
   * صافي بيع الدفعة   = الكمية المباعة × سعر البيع − عمولة البيع
   * ربح الدفعة         = صافي بيع الدفعة − الكمية المباعة × تكلفة السهم الواحد */
  function compute(t) {
    const b = t.buy;
    const mult = +t.multiplier || 1;
    const buyFees = +b.fees || 0;
    const cost = b.qty * b.price * mult + buyFees;
    const unitCost = cost / b.qty;
    const sells = (t.sells || []).slice().sort((x, y) => (x.date + (x.time || "")).localeCompare(y.date + (y.time || ""))).map((s) => {
      const fees = +s.fees || 0;
      const gross = s.qty * s.price * mult;
      const proceeds = gross - fees;
      const basis = s.qty * unitCost;
      return { ...s, fees, gross, proceeds, basis, pnl: proceeds - basis };
    });
    const soldQty = sells.reduce((a, s) => a + s.qty, 0);
    const remaining = Math.max(0, +(b.qty - soldQty).toFixed(6));
    const realized = sells.reduce((a, s) => a + s.pnl, 0);
    const soldBasis = sells.reduce((a, s) => a + s.basis, 0);
    const sellFees = sells.reduce((a, s) => a + s.fees, 0);
    const avgSell = soldQty ? sells.reduce((a, s) => a + s.qty * s.price, 0) / soldQty : null;
    const status = soldQty === 0 ? "open" : remaining > 0 ? "partial" : "closed";
    const lastSell = sells.length ? sells[sells.length - 1].date : null;
    const holdEnd = status === "closed" ? lastSell : todayISO();
    const opt = t.type === "option" && t.option ? t.option : null;
    const toExpiry = opt ? Math.round((parseDate(opt.expiry) - parseDate(todayISO())) / 86400000) : null;
    const display = t.name || (opt ? `${opt.underlying} ${opt.strike} ${opt.right === "P" ? "Put" : "Call"}` : t.symbol);
    let sub = t.symbol;
    if (opt) sub = status === "closed" ? `انتهاء ${fmtShort(opt.expiry)}`
      : toExpiry < 0 ? "تجاوز تاريخ الانتهاء — يحتاج تسجيل الإغلاق"
      : toExpiry === 0 ? "ينتهي اليوم" : `ينتهي ${fmtShort(opt.expiry)} (بعد ${dayWord(toExpiry)})`;
    return {
      ...t, mult, opt, toExpiry, display, sub, unitWord: opt ? "عقد" : "سهم", cost, unitCost, buyFees, sells, soldQty, remaining, realized, soldBasis, sellFees,
      totalFees: buyFees + sellFees, avgSell, status, lastSell,
      ret: soldBasis ? realized / soldBasis : null,
      openBasis: remaining * unitCost,
      holdDays: days(b.date, holdEnd),
      outcome: status !== "closed" ? null : realized > 0.004 ? "win" : realized < -0.004 ? "lose" : "even",
    };
  }

  function summarize(trades) {
    const closed = trades.filter((t) => t.status === "closed");
    const wins = closed.filter((t) => t.outcome === "win");
    const losses = closed.filter((t) => t.outcome === "lose");
    const events = [];
    trades.forEach((t) => t.sells.forEach((s) => events.push({ date: s.date, time: s.time || "", pnl: s.pnl, id: t.id, symbol: t.symbol })));
    events.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
    const realized = events.reduce((a, e) => a + e.pnl, 0);
    const grossWin = events.filter((e) => e.pnl > 0).reduce((a, e) => a + e.pnl, 0);
    const grossLoss = -events.filter((e) => e.pnl < 0).reduce((a, e) => a + e.pnl, 0);
    const now = todayISO().slice(0, 7);
    const months = {};
    events.forEach((e) => { const k = e.date.slice(0, 7); months[k] = (months[k] || 0) + e.pnl; });
    const sym = {};
    trades.forEach((t) => {
      if (!t.sells.length) return;
      const k = t.display;
      sym[k] = sym[k] || { symbol: t.symbol, name: t.display, pnl: 0, n: 0 };
      sym[k].pnl += t.realized; sym[k].n += 1;
    });
    const open = trades.filter((t) => t.status !== "closed");
    return {
      count: trades.length, closed, wins, losses, open, events, realized,
      thisMonth: months[now] || 0, months,
      winRate: closed.length ? wins.length / closed.length : null,
      avgWin: wins.length ? wins.reduce((a, t) => a + t.realized, 0) / wins.length : null,
      avgLoss: losses.length ? losses.reduce((a, t) => a + t.realized, 0) / losses.length : null,
      profitFactor: grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : null,
      fees: trades.reduce((a, t) => a + t.totalFees, 0),
      openBasis: open.reduce((a, t) => a + t.openBasis, 0),
      best: closed.length ? closed.reduce((a, t) => (t.realized > a.realized ? t : a)) : null,
      worst: closed.length ? closed.reduce((a, t) => (t.realized < a.realized ? t : a)) : null,
      avgHold: closed.length ? closed.reduce((a, t) => a + t.holdDays, 0) / closed.length : null,
      bySymbol: Object.values(sym).sort((a, b) => b.pnl - a.pnl),
    };
  }

  /* ---------- الرسوم (SVG يدوي، الزمن يتدفق من اليمين إلى اليسار) ---------- */
  const tip = (() => { let el; return () => el || (el = Object.assign(document.createElement("div"), { className: "chart-tip" }), document.body.appendChild(el), el); })();
  function bindTips(root) {
    root.querySelectorAll("[data-tip]").forEach((n) => {
      const show = (e) => { const t = tip(); t.innerHTML = n.getAttribute("data-tip"); t.style.display = "block"; const p = e.touches ? e.touches[0] : e; t.style.left = Math.min(innerWidth - t.offsetWidth - 8, Math.max(8, p.clientX - t.offsetWidth / 2)) + "px"; t.style.top = (p.clientY - t.offsetHeight - 12) + "px"; };
      n.addEventListener("mousemove", show); n.addEventListener("touchstart", show, { passive: true });
      n.addEventListener("mouseleave", () => (tip().style.display = "none"));
    });
  }
  const innerW = (el) => { if (!el.clientWidth) return 0; const cs = getComputedStyle(el); return el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight); };
  function niceTicks(min, max, n = 4) {
    if (min === max) { min -= 1; max += 1; }
    const span = max - min, step0 = span / n, mag = Math.pow(10, Math.floor(Math.log10(step0)));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= step0);
    const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step, out = [];
    for (let v = lo; v <= hi + step / 2; v += step) out.push(+v.toFixed(10));
    return out;
  }
  const short = (v) => { const a = Math.abs(v); const s = a >= 1e6 ? nf2.format(a / 1e6).replace(/\.?0+$/, "") + "M" : a >= 1e4 ? nf0.format(a / 1e3) + "K" : nf0.format(a); return (v < 0 ? "−" : "") + s; };

  function equityChart(el, events, opts = {}) {
    const W = Math.max(260, innerW(el) || opts.w || 640), H = opts.h || (W < 480 ? 200 : 240), pad = { t: 14, b: opts.compact ? 6 : 26, r: 10, l: opts.compact ? 10 : 48 };
    if (!events.length) { el.innerHTML = `<div class="mini-empty">يظهر المنحنى بعد أول عملية بيع.</div>`; return; }
    let cum = 0;
    const pts = [{ v: 0, date: null }].concat(events.map((e) => ({ v: (cum += e.pnl), date: e.date, e })));
    const vals = pts.map((p) => p.v), ticks = niceTicks(Math.min(0, ...vals), Math.max(0, ...vals));
    const lo = ticks[0], hi = ticks[ticks.length - 1];
    const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
    // الزمن من اليمين (الأقدم) إلى اليسار (الأحدث)
    const X = (i) => W - pad.r - (pts.length === 1 ? 0 : (i / (pts.length - 1)) * iw);
    const Y = (v) => pad.t + (1 - (v - lo) / (hi - lo)) * ih;
    const line = pts.map((p, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(p.v).toFixed(1)}`).join(" ");
    const y0 = Y(0);
    const clipId = "c" + Math.random().toString(36).slice(2, 8);
    let g = `<svg viewBox="0 0 ${W} ${H}" direction="ltr" role="img" aria-label="منحنى صافي الربح التراكمي">`;
    g += `<defs><clipPath id="${clipId}a"><rect x="0" y="0" width="${W}" height="${y0}"/></clipPath><clipPath id="${clipId}b"><rect x="0" y="${y0}" width="${W}" height="${H - y0}"/></clipPath></defs>`;
    if (!opts.compact) ticks.forEach((t) => {
      g += `<line class="${t === 0 ? "zero" : "grid"}" x1="${pad.l}" x2="${W - pad.r}" y1="${Y(t)}" y2="${Y(t)}"/>`;
      g += `<text x="${pad.l - 8}" y="${Y(t) + 4}" text-anchor="end" direction="ltr">${short(t)}</text>`;
    });
    else g += `<line class="zero" x1="${pad.l}" x2="${W - pad.r}" y1="${y0}" y2="${y0}"/>`;
    const area = `${line} L${X(pts.length - 1).toFixed(1)},${y0} L${X(0).toFixed(1)},${y0} Z`;
    g += `<path class="area-gain" d="${area}" clip-path="url(#${clipId}a)"/><path class="area-loss" d="${area}" clip-path="url(#${clipId}b)"/>`;
    g += `<path class="line" d="${line}"/>`;
    if (!opts.compact) {
      const first = pts[1].date, last = pts[pts.length - 1].date;
      g += `<text x="${W - pad.r}" y="${H - 6}" text-anchor="end">${fmtShort(first)}</text>`;
      if (pts.length > 2) g += `<text x="${pad.l}" y="${H - 6}" text-anchor="start">${fmtShort(last)}</text>`;
      pts.slice(1).forEach((p, j) => {
        const i = j + 1;
        g += `<circle class="dot" cx="${X(i)}" cy="${Y(p.v)}" r="${pts.length > 40 ? 2.5 : 3.5}" style="stroke:var(--${p.e.pnl >= 0 ? "gain" : "loss"})" data-tip="${esc(p.e.symbol)} · ${esc(fmtShort(p.date))}<br>الصفقة: ${esc(money(p.e.pnl, { signed: true }))}<br>التراكمي: ${esc(money(p.v, { signed: true }))}"/>`;
        g += `<rect x="${X(i) - 8}" y="${pad.t}" width="16" height="${ih}" fill="transparent" data-tip="${esc(p.e.symbol)} · ${esc(fmtShort(p.date))}<br>الصفقة: ${esc(money(p.e.pnl, { signed: true }))}<br>التراكمي: ${esc(money(p.v, { signed: true }))}"/>`;
      });
    }
    el.innerHTML = g + "</svg>";
    bindTips(el);
  }

  function monthlyChart(el, months) {
    const keys = Object.keys(months).sort().slice(-12);
    if (!keys.length) { el.innerHTML = `<div class="mini-empty">تظهر الأشهر بعد أول عملية بيع.</div>`; return; }
    const W = Math.max(260, innerW(el) || 640), H = W < 480 ? 190 : 220, pad = { t: 14, b: 28, r: 10, l: 48 };
    const vals = keys.map((k) => months[k]), ticks = niceTicks(Math.min(0, ...vals), Math.max(0, ...vals));
    const lo = ticks[0], hi = ticks[ticks.length - 1], iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
    const Y = (v) => pad.t + (1 - (v - lo) / (hi - lo)) * ih;
    const slot = iw / Math.max(keys.length, 4), bw = Math.min(44, slot * 0.6);
    let g = `<svg viewBox="0 0 ${W} ${H}" direction="ltr" role="img" aria-label="صافي الربح الشهري">`;
    ticks.forEach((t) => {
      g += `<line class="${t === 0 ? "zero" : "grid"}" x1="${pad.l}" x2="${W - pad.r}" y1="${Y(t)}" y2="${Y(t)}"/>`;
      g += `<text x="${pad.l - 8}" y="${Y(t) + 4}" text-anchor="end" direction="ltr">${short(t)}</text>`;
    });
    keys.forEach((k, i) => {
      const v = months[k], cx = W - pad.r - slot * (i + 0.5); // الأقدم يميناً
      const y = Math.min(Y(v), Y(0)), h = Math.max(1.5, Math.abs(Y(v) - Y(0)));
      const label = dfMonth.format(parseDate(k + "-01"));
      g += `<rect class="${v >= 0 ? "bar-gain" : "bar-loss"}" x="${cx - bw / 2}" y="${y}" width="${bw}" height="${h}" rx="3" data-tip="${esc(label)}<br>${esc(money(v, { signed: true }))} ${window.TJ.cur}"/>`;
      g += `<text x="${cx}" y="${H - 8}" text-anchor="middle">${dfMonthShort.format(parseDate(k + "-01"))}</text>`;
    });
    el.innerHTML = g + "</svg>";
    bindTips(el);
  }

  /* ---------- مكوّنات مشتركة ---------- */
  function statusPill(t) {
    if (t.status === "open") return `<span class="pill open">مفتوحة</span>`;
    if (t.status === "partial") return `<span class="pill partial">بيع جزئي</span>`;
    return { win: `<span class="pill win">رابحة</span>`, lose: `<span class="pill lose">خاسرة</span>`, even: `<span class="pill even">تعادل</span>` }[t.outcome];
  }
  const kindTag = (t) => t.opt ? `<span class="kind option">عقد خيار</span>` : `<span class="kind stock">سهم</span>`;
  const symCell = (t) => `<div class="sym"><span class="sym-name">${esc(t.display)} ${kindTag(t)}</span><small${t.opt && t.toExpiry != null && t.toExpiry <= 3 && t.status !== "closed" ? ' class="warn"' : ""}>${t.opt ? esc(t.sub) : num(esc(t.sub))}</small></div>`;
  const tradeHref = (id) => `trade.html?id=${encodeURIComponent(id)}${isDemo ? "&demo" : ""}`;
  const pageHref = (p) => p + (isDemo ? "?demo" : "");

  function chrome(active) {
    const head = document.querySelector("[data-masthead]");
    if (head) {
      head.innerHTML = `<div class="inner">
        <a class="brand" href="${pageHref("index.html")}">
          <svg width="38" height="38" viewBox="0 0 38 38" aria-hidden="true"><rect x="1" y="1" width="36" height="36" rx="10" fill="none" stroke="currentColor" stroke-opacity=".35"/><path d="M30 26 L23 19 L18 23 L8 12" fill="none" stroke="#D2B06A" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/><circle cx="8" cy="12" r="2.6" fill="#D2B06A"/></svg>
          <div><div class="brand-title">سجل الصفقات</div><div class="brand-sub">الطريق إلى الحرية المالية بإذن الله</div></div>
        </a>
        <nav class="nav" aria-label="التنقل">
          <a href="${pageHref("index.html")}" ${active === "home" ? 'aria-current="page"' : ""}>لوحة المتابعة</a>
          <a href="${pageHref("trades.html")}" ${active === "trades" ? 'aria-current="page"' : ""}>كل الصفقات</a>
          ${isDemo ? `<span class="demo-flag">بيانات تجريبية</span>` : ""}
        </nav></div>`;
    }
    const foot = document.querySelector("[data-foot]");
    if (foot) foot.innerHTML = `الأرقام محسوبة من ملف <span class="num">data/trades.js</span> وتشمل العمولات، وعقود الخيارات محسوبة بمضاعف العقد. هذا سجل شخصي للمتابعة وليس توصية مالية.`;
  }

  function emptyState(title, body) {
    return `<div class="card empty"><h2>${title}</h2><p>${body}</p>
      <ol class="steps"><li>أرسل لـ Claude صورة أمر الشراء من تطبيق التداول.</li><li>يتأكد معك من الأرقام ثم يسجّل الصفقة هنا.</li><li>عند البيع أرسل صورة أمر البيع ليحسب الربح أو الخسارة.</li></ol>
      <div><a class="btn" href="?demo">معاينة الصفحة ببيانات تجريبية</a></div></div>`;
  }

  /* ---------- القفل: النسخة المنشورة مشفّرة (ECDH P-256 + HKDF + AES-256-GCM، والمفتاح الخاص محمي بـ PBKDF2) ----------
   * محلياً تُقرأ data/trades.js مباشرة. على الويب يحتوي الملف نفسه على window.JOURNAL_ENC
   * فتُطلب كلمة المرور، ويُحفظ المفتاح الخاص المفكوك للجلسة (أو للجهاز عند اختيار «تذكّرني»). */
  const KEY_SLOT = "tj-key";
  const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const toB64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
  let aesKey = null, buildId = "";

  const te = (t) => new TextEncoder().encode(t);
  async function decryptBytes(key, bytes) {
    return crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes.slice(0, 12) }, key, bytes.slice(12));
  }
  // كلمة المرور → يفك المفتاح الخاص (ECDH P-256) المحفوظ مشفّراً في الصفحة
  async function unwrapPrivate(pw, enc) {
    const base = await crypto.subtle.importKey("raw", te(pw), "PBKDF2", false, ["deriveKey"]);
    const kek = await crypto.subtle.deriveKey({ name: "PBKDF2", salt: b64(enc.salt), iterations: enc.iter, hash: "SHA-256" },
      base, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
    return new Uint8Array(await decryptBytes(kek, b64(enc.wrapped)));
  }
  // المفتاح الخاص + المفتاح المؤقت لهذا البناء → مفتاح AES لفك البيانات والصور
  async function dataKey(pkcs8, enc) {
    const priv = await crypto.subtle.importKey("pkcs8", pkcs8, { name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"]);
    const epk = await crypto.subtle.importKey("spki", b64(enc.epk), { name: "ECDH", namedCurve: "P-256" }, false, []);
    const bits = await crypto.subtle.deriveBits({ name: "ECDH", public: epk }, priv, 256);
    const hk = await crypto.subtle.importKey("raw", bits, "HKDF", false, ["deriveKey"]);
    return crypto.subtle.deriveKey({ name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info: te("trading-journal-v2") },
      hk, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
  }
  async function openJournal(key, enc) {
    return JSON.parse(new TextDecoder().decode(await decryptBytes(key, b64(enc.data))));
  }
  const store = { get() { try { return sessionStorage.getItem(KEY_SLOT) || localStorage.getItem(KEY_SLOT); } catch (e) { return null; } },
    set(v, remember) { try { sessionStorage.setItem(KEY_SLOT, v); if (remember) localStorage.setItem(KEY_SLOT, v); } catch (e) {} },
    clear() { try { sessionStorage.removeItem(KEY_SLOT); localStorage.removeItem(KEY_SLOT); } catch (e) {} } };

  async function unlock(enc, done) {
    const saved = store.get();
    if (saved) {
      try {
        const key = await dataKey(b64(saved), enc);
        const J = await openJournal(key, enc); aesKey = key; return done(J);
      } catch (e) { store.clear(); }
    }
    const app = document.getElementById("app");
    app.innerHTML = `<form class="card lock" id="lock" autocomplete="on">
      <svg width="40" height="40" viewBox="0 0 40 40" aria-hidden="true"><rect x="9" y="18" width="22" height="16" rx="4" fill="none" stroke="currentColor" stroke-width="2"/><path d="M14 18v-4a6 6 0 0 1 12 0v4" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="20" cy="26" r="2" fill="currentColor"/></svg>
      <h1>السجل محمي</h1>
      <p class="muted">أدخل كلمة المرور لعرض الصفقات.</p>
      <input type="text" name="username" value="trading-journal" autocomplete="username" hidden>
      <input type="password" id="pw" name="password" autocomplete="current-password" placeholder="كلمة المرور" required>
      <label class="remember"><input type="checkbox" id="remember"> تذكّرني على هذا الجهاز</label>
      <button type="submit" id="go">فتح السجل</button>
      <p class="lock-err" id="err" role="alert"></p>
    </form>`;
    const form = document.getElementById("lock"), err = document.getElementById("err"), btn = document.getElementById("go");
    document.getElementById("pw").focus();
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      err.textContent = ""; btn.disabled = true; btn.textContent = "جارٍ الفتح…";
      try {
        const pkcs8 = await unwrapPrivate(document.getElementById("pw").value, enc);
        const key = await dataKey(pkcs8, enc);
        const J = await openJournal(key, enc);
        store.set(toB64(pkcs8), document.getElementById("remember").checked);
        aesKey = key; done(J);
      } catch (x) {
        err.textContent = window.crypto && crypto.subtle ? "كلمة المرور غير صحيحة." : "المتصفح لا يدعم فك التشفير على هذا الرابط.";
        btn.disabled = false; btn.textContent = "فتح السجل";
      }
    });
  }

  // صور الأوامر: في النسخة المشفّرة تُجلب receipts/*.enc وتُفك في المتصفح
  async function hydrateReceipts(root) {
    for (const img of root.querySelectorAll("img[data-receipt]")) {
      const path = img.getAttribute("data-receipt"), link = img.closest("a");
      try {
        let url = path;
        if (aesKey) {
          const res = await fetch(path + ".enc?b=" + encodeURIComponent(buildId), { cache: "no-store" }); if (!res.ok) throw 0;
          url = URL.createObjectURL(new Blob([await decryptBytes(aesKey, new Uint8Array(await res.arrayBuffer()))], { type: "image/jpeg" }));
        }
        img.src = url; if (link) link.href = url;
      } catch (e) { img.closest("figure").style.display = "none"; }
    }
  }

  function lockOut() { store.clear(); location.reload(); }

  /* ---------- التحميل ---------- */
  function load(cb) {
    const finish = () => {
      const J = window.JOURNAL || { meta: {}, trades: [] };
      window.TJ.cur = ({ USD: "دولار", SAR: "ر.س" })[(J.meta || {}).currency] || (J.meta || {}).currency || "";
      const trades = (J.trades || []).map(compute).sort((a, b) => (b.buy.date + (b.buy.time || "")).localeCompare(a.buy.date + (a.buy.time || "")));
      if (aesKey) { const n = document.querySelector(".nav"); if (n && !n.querySelector(".lock-out")) n.insertAdjacentHTML("beforeend", `<button class="lock-out" type="button">قفل</button>`), n.querySelector(".lock-out").addEventListener("click", lockOut); }
      cb({ meta: J.meta || {}, trades, sum: summarize(trades) });
    };
    const s = document.createElement("script");
    s.src = (isDemo ? "data/demo.js" : "data/trades.js") + "?t=" + Date.now();
    s.onload = () => {
      if (!isDemo && window.JOURNAL_ENC) buildId = window.JOURNAL_ENC.epk.slice(-16);
      if (!isDemo && window.JOURNAL_ENC && !window.JOURNAL) return unlock(window.JOURNAL_ENC, (J) => { window.JOURNAL = J; finish(); });
      finish();
    };
    s.onerror = () => cb({ meta: {}, trades: [], sum: summarize([]) });
    document.head.appendChild(s);
  }

  window.TJ = { load, chrome, compute, summarize, equityChart, monthlyChart, statusPill, symCell, tradeHref, pageHref, hydrateReceipts, kindTag,
    money, signedMoney, pct, signedPct, fmtDate, fmtShort, fmtQty, num, esc, tone, dayWord, emptyState, nf2, isDemo };
})();
