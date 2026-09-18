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
    function railing(x0, x1, top, slab) { // balcony: rails + balusters + deck slab
      P("M" + x0 + " " + top + " H" + x1 +
        " M" + x0 + " " + top + " V" + slab + " M" + x1 + " " + top + " V" + slab);
      var bal = "";
      for (var x = x0 + 7; x < x1 - 3; x += 8) bal += "M" + x + " " + (top + 4) + " V" + slab + " ";
      P(bal, true);
      P("M" + (x0 - 6) + " " + slab + " H" + (x1 + 6) +
        " M" + (x0 - 6) + " " + (slab + 6) + " H" + (x1 + 6));
    }
    function conifer(cx, top, bot, hw) { // pine as three overlapping triangles
      var span = bot - top;
      var tiers = [
        [0, 0.42, 0.58],
        [0.24, 0.72, 0.8],
        [0.5, 1.0, 1.0]
      ];
      tiers.forEach(function (t) {
        var yT = top + span * t[0], yB = top + span * t[1], w = hw * t[2];
        P("M" + cx + " " + yT.toFixed(0) +
          " L" + (cx - w).toFixed(0) + " " + yB.toFixed(0) +
          " H" + (cx + w).toFixed(0) + " Z");
      });
      P("M" + cx + " " + bot + " V352", true); // trunk to ground
    }

    // sidewalk
    P("M16 352 H424");

    // gable roof with overhang + inner fascia line
    P("M140 92 L216 38 L292 92");
    P("M150 88 L216 46 L282 88", true);
    // building body
    P("M152 92 V308 M280 92 V308 M152 308 H280");
    // attic vent in the gable
    P("M204 62 h24 v14 h-24 Z M216 62 v14", true);

    // top balcony under the gable
    railing(158, 274, 104, 146);
    P("M196 98 h40 v40 M216 98 v40", true); // slider door behind
    // wall band + siding hints
    P("M152 162 H280 M152 172 H280", true);
    // middle balcony
    railing(158, 274, 188, 230);
    P("M196 182 h40 v40 M216 182 v40", true);
    // lower wall siding
    P("M152 246 H280 M152 256 H280", true);

    // ground floor: window + entry door
    P("M162 262 h30 v34 h-30 Z M177 262 v34", true);
    P("M232 308 V260 h36 v48 M250 284 h6", true);
    P("M228 254 h44", true); // door header trim

    // hillside under the building, held by concrete retaining walls
    P("M152 308 V330 M280 308 V334", true);
    P("M120 330 H176 M116 330 V352 M180 330 V336");
    P("M248 334 H316 M244 334 V352 M320 334 V344", true);
    P("M96 344 H120 M96 344 V352", true);

    // staircase up the hill + handrail
    P("M180 352 h12 v-8 h12 v-8 h12 v-8 h12 v-8 h12 v-8 v-4");
    P("M186 344 L244 308", true);

    // wooden fence, left
    (function () {
      var f = "M20 302 H88 M20 326 H88 ";
      for (var x = 24; x <= 86; x += 9) f += "M" + x + " 298 V352 ";
      P(f, true);
    })();
    // bare deciduous tree behind the fence
    P("M112 352 V286 M112 302 L96 274 M112 294 L128 268 M104 316 L90 300 M120 312 L134 296", true);

    // evergreens, right — the big pair
    conifer(342, 70, 330, 42);
    conifer(398, 150, 336, 30);

    // shrubs on the planters + rocks
    P("M126 330 Q134 318 142 330 Q150 320 158 330 Q166 322 172 330", true);
    P("M256 334 Q266 322 276 334 Q286 324 296 334", true);
    P("M140 352 l6 -10 10 0 6 10 Z", true);

    // birds
    P("M330 46 q6 -6 12 0 M348 36 q5 -5 10 0", true);

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
