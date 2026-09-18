/* Family Loan Tracker.
 * Reads TRACKER from data.js. Payments are one-per-month per loan, so the
 * page derives everything from the calendar at load time: payments made,
 * paid / remaining / percent, and the projected payoff timeline. */

(function () {
  "use strict";

  var GREEN = "#68A300";   // validated on #1A1A1A (see styles.css)
  var BLUE = "#009ED4";
  var GRID = "#333333";
  var SURFACE = "#2A2A2A";
  var TEXT_MUTED = "#8A8A8A";
  var LOAN_COLORS = [GREEN, BLUE];
  var LOAN_ACCENTS = ["#76B900", "#00BFFF"];

  /* ---------- month math ---------- */

  function ymIdx(ym) { // "2024-10" -> absolute month index
    var p = ym.split("-");
    return (+p[0]) * 12 + (+p[1]) - 1;
  }
  function dateIdx(iso) { return ymIdx(iso.slice(0, 7)); }
  function idxLabel(i, long) {
    var d = new Date(Date.UTC(Math.floor(i / 12), i % 12, 1));
    return d.toLocaleDateString("en-US", long
      ? { timeZone: "UTC", month: "long", year: "numeric" }
      : { timeZone: "UTC", month: "short", year: "numeric" });
  }
  var TODAY = new Date();
  var NOW_IDX = TODAY.getFullYear() * 12 + TODAY.getMonth();

  function fmtMoney(n, cents) {
    return n.toLocaleString("en-US", {
      style: "currency", currency: "USD",
      minimumFractionDigits: cents ? 2 : 0,
      maximumFractionDigits: cents ? 2 : 0
    });
  }
  function fmtDateISO(iso) {
    var p = iso.split("-");
    return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])).toLocaleDateString("en-US",
      { timeZone: "UTC", month: "long", day: "numeric", year: "numeric" });
  }
  function compact(n) {
    if (n >= 1000) return "$" + (n / 1000).toLocaleString("en-US", { maximumFractionDigits: 1 }) + "K";
    return "$" + Math.round(n);
  }

  /* ---------- loan status ---------- */

  function adjustmentsThrough(loan, idx) {
    return (loan.adjustments || []).reduce(function (s, a) {
      return dateIdx(a.date) <= idx ? s + a.amount : s;
    }, 0);
  }

  // balance at the END of month `idx`, treating that month's payment as made
  function balanceAt(loan, idx) {
    var first = ymIdx(loan.firstPaymentMonth);
    var count = idx >= first ? idx - first + 1 : 0;
    return Math.max(0, loan.principal - loan.monthlyPayment * count - adjustmentsThrough(loan, idx));
  }

  function loanStatus(loan) {
    var first = ymIdx(loan.firstPaymentMonth);
    var payDay = loan.paymentDayOfMonth || 1;
    var count = 0;
    if (NOW_IDX >= first) {
      count = NOW_IDX - first + (TODAY.getDate() >= payDay ? 1 : 0);
    }
    var maxCount = Math.ceil(loan.principal / loan.monthlyPayment);
    count = Math.max(0, Math.min(count, maxCount));

    var paid = Math.min(loan.principal,
      loan.monthlyPayment * count + adjustmentsThrough(loan, NOW_IDX));
    var remaining = loan.principal - paid;
    var pct = loan.principal > 0 ? paid / loan.principal * 100 : 0;

    var dueIdx = dateIdx(TRACKER.finalDueDate);
    var balanceAtDue = balanceAt(loan, dueIdx);

    var payoffIdx = null;
    for (var k = first; k <= dueIdx; k++) {
      if (balanceAt(loan, k) <= 0) { payoffIdx = k; break; }
    }

    return {
      loan: loan, payments: count, paid: paid, remaining: remaining, pct: pct,
      balanceAtDue: balanceAtDue, payoffIdx: payoffIdx, dueIdx: dueIdx
    };
  }

  /* ---------- tooltip ---------- */

  var tip = document.getElementById("tooltip");
  function showTip(html, x, y) {
    tip.innerHTML = html;
    tip.hidden = false;
    var r = tip.getBoundingClientRect();
    var left = Math.min(x + 14, window.innerWidth - r.width - 8);
    var top = y - r.height - 12;
    if (top < 8) top = y + 16;
    tip.style.left = left + "px";
    tip.style.top = top + "px";
  }
  function hideTip() { tip.hidden = true; }

  /* ---------- SVG helpers ---------- */

  var NS = "http://www.w3.org/2000/svg";
  function el(name, attrs, parent) {
    var e = document.createElementNS(NS, name);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function niceTicks(max, count) {
    if (max <= 0) return [0];
    var raw = max / count;
    var mag = Math.pow(10, Math.floor(Math.log10(raw)));
    var step = [1, 2, 2.5, 5, 10].map(function (m) { return m * mag; })
      .find(function (s) { return max / s <= count; }) || 10 * mag;
    var top = Math.ceil(max / step - 1e-9) * step;
    var out = [];
    for (var v = 0; v <= top + 1e-9; v += step) out.push(v);
    return out;
  }

  /* ---------- payoff timeline chart ---------- */

  function renderTimeline(statuses) {
    var host = document.getElementById("timeline-chart");
    host.innerHTML = "";

    var startIdx = Math.min.apply(null, statuses.map(function (s) { return ymIdx(s.loan.startMonth); }));
    var dueIdx = statuses[0].dueIdx;

    var W = 920, H = 340, padL = 66, padR = 20, padT = 24, padB = 40;
    var svg = el("svg", { viewBox: "0 0 " + W + " " + H, role: "img",
      "aria-label": "Line chart projecting both loan balances from start to the final due date" }, host);

    var maxY = Math.max.apply(null, statuses.map(function (s) { return s.loan.principal; }));
    var ticks = niceTicks(maxY, 4);
    var topY = ticks[ticks.length - 1];
    function X(i) { return padL + (i - startIdx) / (dueIdx - startIdx) * (W - padL - padR); }
    function Y(v) { return padT + (1 - v / topY) * (H - padT - padB); }

    ticks.forEach(function (t) {
      el("line", { x1: padL, x2: W - padR, y1: Y(t), y2: Y(t), stroke: GRID, "stroke-width": 1 }, svg);
      el("text", { x: padL - 10, y: Y(t) + 4, "text-anchor": "end", fill: TEXT_MUTED,
        "font-size": 12, "font-family": "inherit" }, svg).textContent = compact(t);
    });

    // x labels: every 4 years plus the final year
    for (var yr = Math.ceil(startIdx / 12); yr * 12 <= dueIdx; yr++) {
      var i = yr * 12;
      if ((yr - Math.ceil(startIdx / 12)) % 4 === 0 || i + 12 > dueIdx) {
        el("text", { x: X(Math.min(i, dueIdx)), y: H - 12, "text-anchor": "middle",
          fill: TEXT_MUTED, "font-size": 12, "font-family": "inherit" }, svg).textContent = yr;
      }
    }

    // today marker
    var tx = X(Math.min(NOW_IDX, dueIdx));
    el("line", { x1: tx, x2: tx, y1: padT, y2: H - padB, stroke: TEXT_MUTED,
      "stroke-width": 1, opacity: 0.55 }, svg);
    el("text", { x: tx + 6, y: padT + 10, fill: TEXT_MUTED, "font-size": 11,
      "font-family": "inherit" }, svg).textContent = "Today";

    // series: solid history, faded projection
    statuses.forEach(function (s, si) {
      var color = LOAN_COLORS[si % LOAN_COLORS.length];
      var loanStart = ymIdx(s.loan.startMonth);
      function pathBetween(a, b) {
        var d = "";
        for (var i = a; i <= b; i++) {
          var v = i < ymIdx(s.loan.firstPaymentMonth) ? s.loan.principal : balanceAt(s.loan, i);
          d += (d ? " L" : "M") + X(i).toFixed(1) + " " + Y(v).toFixed(1);
        }
        return d;
      }
      var split = Math.max(loanStart, Math.min(NOW_IDX, dueIdx));
      el("path", { d: pathBetween(loanStart, split), fill: "none", stroke: color,
        "stroke-width": 2, "stroke-linejoin": "round", "stroke-linecap": "round" }, svg);
      el("path", { d: pathBetween(split, dueIdx), fill: "none", stroke: color,
        "stroke-width": 2, opacity: 0.4, "stroke-linejoin": "round", "stroke-linecap": "round" }, svg);

      // marker + current-balance direct label at today
      var cy = Y(balanceAt(s.loan, split));
      el("circle", { cx: tx, cy: cy, r: 6, fill: SURFACE }, svg);
      el("circle", { cx: tx, cy: cy, r: 4, fill: color }, svg);
      el("text", { x: tx - 8, y: cy - 8, "text-anchor": "end", fill: "#E8E8E8",
        "font-size": 12, "font-weight": 600, "font-family": "inherit" }, svg)
        .textContent = compact(balanceAt(s.loan, split));

      // end of line: balance at the final due date
      if (s.balanceAtDue > 0) {
        var ey = Y(s.balanceAtDue);
        el("circle", { cx: X(dueIdx), cy: ey, r: 6, fill: SURFACE }, svg);
        el("circle", { cx: X(dueIdx), cy: ey, r: 4, fill: color }, svg);
        el("text", { x: X(dueIdx) - 8, y: ey - 10, "text-anchor": "end", fill: "#E8E8E8",
          "font-size": 12, "font-weight": 600, "font-family": "inherit" }, svg)
          .textContent = compact(s.balanceAtDue) + " due";
      }
    });

    // crosshair + hover
    var cross = el("line", { y1: padT, y2: H - padB, stroke: TEXT_MUTED,
      "stroke-width": 1, opacity: 0 }, svg);
    var hit = el("rect", { x: padL, y: padT, width: W - padL - padR, height: H - padT - padB,
      fill: "transparent" }, svg);
    hit.addEventListener("mousemove", function (ev) {
      var box = svg.getBoundingClientRect();
      var mx = (ev.clientX - box.left) * (W / box.width);
      var i = Math.round(startIdx + (mx - padL) / (W - padL - padR) * (dueIdx - startIdx));
      i = Math.max(startIdx, Math.min(dueIdx, i));
      cross.setAttribute("x1", X(i)); cross.setAttribute("x2", X(i));
      cross.setAttribute("opacity", 0.5);
      var rows = statuses.map(function (s, si) {
        var v = i < ymIdx(s.loan.firstPaymentMonth) ? s.loan.principal : balanceAt(s.loan, i);
        return '<div class="tt-row"><span class="swatch" style="background:' +
          LOAN_COLORS[si % LOAN_COLORS.length] + '"></span>' + s.loan.name +
          "<b>" + fmtMoney(v) + "</b></div>";
      }).join("");
      showTip('<div class="tt-title">' + idxLabel(i) +
        (i > NOW_IDX ? " · projected" : "") + "</div>" + rows, ev.clientX, ev.clientY);
    });
    hit.addEventListener("mouseleave", function () {
      cross.setAttribute("opacity", 0);
      hideTip();
    });
  }

  /* ---------- KPI tiles & loan cards ---------- */

  var ICONS = {
    bank: '<svg class="icon" viewBox="0 0 24 24"><path d="M3 9.5 12 4l9 5.5M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    down: '<svg class="icon" viewBox="0 0 24 24"><path d="M21 7 13 15l-4-3-6 6" stroke-linecap="round" stroke-linejoin="round"/><path d="M15 19h6v-6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    pie: '<svg class="icon" viewBox="0 0 24 24"><path d="M12 3a9 9 0 1 0 9 9h-9z" stroke-linejoin="round"/><path d="M15 2.5A9 9 0 0 1 21.5 9H15z" stroke-linejoin="round"/></svg>',
    calendar: '<svg class="icon" viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4" stroke-linecap="round"/></svg>',
    coins: '<svg class="icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v10M15 9.5c0-1.4-1.3-2.2-3-2.2s-3 .8-3 2.2 1.3 1.8 3 2.2 3 .9 3 2.3-1.3 2.2-3 2.2-3-.8-3-2.2" stroke-linecap="round"/></svg>'
  };

  function statTile(icon, label, value, sub) {
    var d = document.createElement("div");
    d.className = "stat reveal";
    d.innerHTML = '<div class="stat-label">' + ICONS[icon] + label + "</div>" +
      '<div class="stat-value">' + value + "</div>" +
      (sub ? '<div class="stat-sub">' + sub + "</div>" : "");
    return d;
  }

  function loanCard(s, i) {
    var accent = LOAN_ACCENTS[i % LOAN_ACCENTS.length];
    var chart = LOAN_COLORS[i % LOAN_COLORS.length];
    var d = document.createElement("article");
    d.className = "card loan-card reveal";
    d.style.setProperty("--accent", accent);
    d.style.setProperty("--accent-chart", chart);

    var dueLine = s.remaining <= 0
      ? "Paid in full"
      : s.balanceAtDue > 0
        ? "Est. " + fmtMoney(s.balanceAtDue) + " still due on " + fmtDateISO(TRACKER.finalDueDate)
        : "On track to reach $0 by " + idxLabel(s.payoffIdx) +
          " — ahead of the " + fmtDateISO(TRACKER.finalDueDate) + " due date";

    d.innerHTML =
      '<div class="loan-head">' +
        '<h2><span class="loan-dot"></span>' + s.loan.name + "</h2>" +
        '<p class="card-sub">' + fmtMoney(s.loan.principal) + " borrowed · " +
          fmtMoney(s.loan.monthlyPayment) + "/month since " +
          idxLabel(ymIdx(s.loan.firstPaymentMonth)) + "</p>" +
      "</div>" +
      '<div class="loan-figures">' +
        '<div><span class="fig-label">Paid so far</span>' +
          '<span class="fig-value accent">' + fmtMoney(s.paid) + "</span>" +
          '<span class="fig-sub">' + s.payments + " payments</span></div>" +
        '<div><span class="fig-label">Remaining</span>' +
          '<span class="fig-value">' + fmtMoney(s.remaining) + "</span>" +
          '<span class="fig-sub">of ' + fmtMoney(s.loan.principal) + "</span></div>" +
      "</div>" +
      '<div class="meter-head"><span>Paid off</span><span>' + s.pct.toFixed(1) + "%</span></div>" +
      '<div class="meter-track loan-track"><div class="meter-fill loan-fill" data-pct="' +
        s.pct.toFixed(1) + '"></div></div>' +
      '<p class="loan-due">' + dueLine + "</p>";
    return d;
  }

  /* ---------- building line drawing ---------- */

  function buildBuilding() {
    var wrap = document.getElementById("building-wrap");
    var svg = el("svg", { viewBox: "0 0 440 380", class: "building draw" }, null);
    var g = el("g", { fill: "none", stroke: "currentColor", "stroke-width": 1.6,
      "stroke-linecap": "round", "stroke-linejoin": "round" }, svg);
    var n = 0;
    function P(d, dim) {
      var p = el("path", { d: d, pathLength: 1 }, g);
      p.style.setProperty("--i", n++);
      if (dim) p.setAttribute("opacity", 0.55);
      return p;
    }

    // ground
    P("M16 352 H424");
    // facade outline
    P("M96 352 V78 H344 V352");
    // cornice + parapet
    P("M88 78 H352 M92 66 H348 M92 66 V78 M348 66 V78");
    P("M104 56 H336 M104 56 V66 M336 56 V66");
    // dentil band under the cornice
    var dent = "";
    for (var x = 104; x <= 336; x += 16) dent += "M" + x + " 68 V76 ";
    P(dent, true);
    // belt courses between floors
    P("M96 148 H344", true);
    P("M96 218 H344", true);
    P("M96 288 H344", true);

    // windows: three upper floors, four windows each
    var cols = [112, 172, 236, 296];
    [92, 162, 232].forEach(function (fy) {
      cols.forEach(function (wx) {
        P("M" + wx + " " + fy + " h32 v44 h-32 Z");
        P("M" + wx + " " + (fy + 22) + " h32 M" + (wx + 16) + " " + fy + " v22", true);
      });
      // sills
      P(cols.map(function (wx) { return "M" + (wx - 4) + " " + (fy + 46) + " h40"; }).join(" "), true);
    });

    // ground floor: two outer windows + arched entry
    [112, 296].forEach(function (wx) {
      P("M" + wx + " 302 h32 v40 h-32 Z");
      P("M" + wx + " 322 h32 M" + (wx + 16) + " 302 v20", true);
    });
    // entry: canopy, arch, double door, steps
    P("M182 294 H258 M188 294 V302 M252 294 V302", true);
    P("M186 352 V310 Q220 288 254 310 V352");
    P("M196 352 V316 H244 V352 M220 316 V352");
    P("M204 324 h10 M226 324 h10", true);
    P("M178 352 H262 M184 358 H256 M16 358 h0", true);

    // trees & shrubs
    P("M56 352 V320 M56 320 Q40 316 42 300 Q44 284 60 286 Q76 284 74 302 Q76 318 56 320");
    P("M392 352 V330 M392 330 Q380 328 382 316 Q384 306 394 308 Q404 306 402 318 Q404 328 392 330", true);
    // birds + moon
    P("M356 96 q6 -6 12 0 M372 86 q5 -5 10 0", true);
    P("M398 44 a13 13 0 1 0 0.1 0", true);

    wrap.appendChild(svg);
  }

  /* ---------- render ---------- */

  function render() {
    var statuses = TRACKER.loans.map(loanStatus);
    var totPrincipal = 0, totPaid = 0, totRemaining = 0;
    statuses.forEach(function (s) {
      totPrincipal += s.loan.principal; totPaid += s.paid; totRemaining += s.remaining;
    });
    var pct = totPrincipal > 0 ? totPaid / totPrincipal * 100 : 0;

    document.getElementById("hero-remaining").textContent = fmtMoney(totRemaining);
    document.getElementById("hero-delta").innerHTML =
      '<span class="up">' + fmtMoney(totPaid) + " paid</span> · " +
      pct.toFixed(1) + "% of " + fmtMoney(totPrincipal);

    document.getElementById("meter-pct").textContent = pct.toFixed(1) + "%";
    requestAnimationFrame(function () {
      document.getElementById("meter-fill").style.width = pct.toFixed(1) + "%";
    });

    var kpi = document.getElementById("kpi-row");
    kpi.innerHTML = "";
    kpi.appendChild(statTile("bank", "Total borrowed", fmtMoney(totPrincipal),
      "2 loans · since " + idxLabel(ymIdx(TRACKER.loans[0].startMonth))));
    kpi.appendChild(statTile("down", "Total paid", fmtMoney(totPaid),
      statuses.map(function (s) { return s.payments; }).join(" + ") + " payments"));
    kpi.appendChild(statTile("coins", "Remaining", fmtMoney(totRemaining),
      fmtMoney(statuses.reduce(function (a, s) { return a + s.loan.monthlyPayment; }, 0)) + "/month going out"));
    kpi.appendChild(statTile("pie", "Paid off", pct.toFixed(1) + "%",
      statuses.map(function (s) { return s.loan.name + " " + s.pct.toFixed(1) + "%"; }).join(" · ")));
    var yearsLeft = Math.max(0, Math.round((dateIdx(TRACKER.finalDueDate) - NOW_IDX) / 12));
    kpi.appendChild(statTile("calendar", "Final due date",
      fmtDateISO(TRACKER.finalDueDate), "about " + yearsLeft + " years out"));

    var grid = document.getElementById("loan-grid");
    grid.innerHTML = "";
    statuses.forEach(function (s, i) { grid.appendChild(loanCard(s, i)); });
    requestAnimationFrame(function () {
      grid.querySelectorAll(".loan-fill").forEach(function (f) {
        f.style.width = f.getAttribute("data-pct") + "%";
      });
    });

    renderTimeline(statuses);

    document.getElementById("footer-terms").textContent =
      fmtMoney(totPrincipal) + " across 2 loans · balances due " + fmtDateISO(TRACKER.finalDueDate);
    document.getElementById("footer-asof").textContent =
      "As of " + TODAY.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) +
      " · recalculated on every visit";
  }

  /* ---------- entry reveals ---------- */

  function startReveals() {
    var els = document.querySelectorAll(".reveal");
    if (!("IntersectionObserver" in window)) {
      els.forEach(function (e) { e.classList.add("in"); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          var idx = Array.prototype.indexOf.call(
            en.target.parentElement.children, en.target);
          en.target.style.animationDelay = Math.min(idx, 5) * 120 + "ms";
          en.target.classList.add("in");
          io.unobserve(en.target);
        }
      });
    }, { threshold: 0.15 });
    els.forEach(function (e) { io.observe(e); });
  }

  render();
  buildBuilding();
  startReveals();
})();
