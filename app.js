/* Loan Tracker dashboard.
 * Reads LOAN + PAYMENTS from data.js, computes an actual/365 simple-interest
 * ledger (each payment covers accrued interest first, remainder goes to
 * principal), then renders KPIs, two SVG charts, and the history table. */

(function () {
  "use strict";

  var MS_DAY = 86400000;
  var GREEN = "#68A300";
  var BLUE = "#009ED4";
  var GRID = "#333333";
  var SURFACE = "#2A2A2A";
  var TEXT_MUTED = "#8A8A8A";
  var TEXT_2 = "#BDBDBD";

  function parseDate(s) {
    var p = s.split("-");
    return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]));
  }
  function fmtMoney(n, cents) {
    return n.toLocaleString("en-US", {
      style: "currency", currency: "USD",
      minimumFractionDigits: cents ? 2 : 0,
      maximumFractionDigits: cents ? 2 : 0
    });
  }
  function fmtDate(d) {
    return d.toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" });
  }
  function fmtDateShort(d) {
    return d.toLocaleDateString("en-US", { timeZone: "UTC", month: "short", year: "2-digit" });
  }

  /* ---------- Ledger ---------- */

  function buildLedger(loan, payments) {
    var rate = (loan.annualRatePct || 0) / 100;
    var start = parseDate(loan.startDate);
    var sorted = payments.slice().sort(function (a, b) {
      return parseDate(a.date) - parseDate(b.date);
    });

    var balance = loan.principal;   // principal outstanding
    var carry = 0;                  // accrued interest not yet covered
    var prev = start;
    var rows = [];
    var totInterest = 0, totPrincipal = 0, totPaid = 0;

    sorted.forEach(function (p, i) {
      var d = parseDate(p.date);
      var days = Math.max(0, Math.round((d - prev) / MS_DAY));
      var accrued = carry + balance * rate * (days / 365);
      var toInterest = Math.min(p.amount, accrued);
      var toPrincipal = p.amount - toInterest;
      carry = accrued - toInterest;
      balance = Math.max(0, balance - toPrincipal);
      prev = d;
      totInterest += toInterest;
      totPrincipal += toPrincipal;
      totPaid += p.amount;
      rows.push({
        n: i + 1, date: d, amount: p.amount, note: p.note || "",
        interest: toInterest, principal: toPrincipal, balance: balance
      });
    });

    // interest accrued since the last event, up to today
    var today = new Date();
    today = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
    var sinceDays = Math.max(0, Math.round((today - prev) / MS_DAY));
    var accruedNow = carry + balance * rate * (sinceDays / 365);

    return {
      rows: rows, balance: balance, accruedNow: accruedNow,
      totInterest: totInterest, totPrincipal: totPrincipal, totPaid: totPaid,
      start: start, today: today, rate: rate
    };
  }

  // months left if scheduledPayment keeps coming monthly
  function estimateMonthsLeft(balance, rate, pmt) {
    if (balance <= 0) return 0;
    if (!pmt || pmt <= 0) return null;
    var b = balance, m = 0;
    while (b > 0 && m < 600) {
      b = b * (1 + rate / 12) - pmt;
      m++;
      if (m > 1 && b >= balance) return null; // payment doesn't cover interest
    }
    return b > 0 ? null : m;
  }

  function nextDueDate(loan, ledger) {
    var base = ledger.rows.length ? ledger.rows[ledger.rows.length - 1].date : ledger.start;
    var d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 1));
    var day = Math.min(loan.paymentDayOfMonth || base.getUTCDate(),
      new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate());
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), day));
  }

  /* ---------- Tooltip ---------- */

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
  function compact(n) {
    if (n >= 1000) return "$" + (n / 1000).toLocaleString("en-US", { maximumFractionDigits: 1 }) + "K";
    return "$" + Math.round(n);
  }

  /* ---------- Balance line chart ---------- */

  function renderBalanceChart(ledger, loan) {
    var host = document.getElementById("balance-chart");
    host.innerHTML = "";
    var pts = [{ date: ledger.start, balance: loan.principal, label: "Loan start" }];
    ledger.rows.forEach(function (r) {
      pts.push({ date: r.date, balance: r.balance, label: "Payment " + r.n });
    });
    if (pts.length < 2) return;

    var W = 920, H = 320, padL = 64, padR = 76, padT = 20, padB = 36;
    var svg = el("svg", { viewBox: "0 0 " + W + " " + H, role: "img",
      "aria-label": "Line chart of principal outstanding over time" }, host);

    var x0 = pts[0].date.getTime(), x1 = pts[pts.length - 1].date.getTime();
    if (x1 === x0) x1 = x0 + MS_DAY;
    var maxY = Math.max.apply(null, pts.map(function (p) { return p.balance; }));
    var ticks = niceTicks(maxY, 4);
    var topY = ticks[ticks.length - 1] || maxY;

    function X(t) { return padL + (t - x0) / (x1 - x0) * (W - padL - padR); }
    function Y(v) { return padT + (1 - v / topY) * (H - padT - padB); }

    // gridlines + y ticks
    ticks.forEach(function (t) {
      el("line", { x1: padL, x2: W - padR, y1: Y(t), y2: Y(t), stroke: GRID, "stroke-width": 1 }, svg);
      el("text", { x: padL - 10, y: Y(t) + 4, "text-anchor": "end", fill: TEXT_MUTED,
        "font-size": 12, "font-family": "inherit" }, svg).textContent = compact(t);
    });

    // x labels: first, ~2 middles, last
    var idxs = [0, Math.floor((pts.length - 1) / 3), Math.floor(2 * (pts.length - 1) / 3), pts.length - 1]
      .filter(function (v, i, a) { return a.indexOf(v) === i; });
    idxs.forEach(function (i) {
      el("text", { x: X(pts[i].date.getTime()), y: H - 10, "text-anchor": "middle",
        fill: TEXT_MUTED, "font-size": 12, "font-family": "inherit" }, svg)
        .textContent = fmtDateShort(pts[i].date);
    });

    var line = pts.map(function (p, i) {
      return (i ? "L" : "M") + X(p.date.getTime()).toFixed(1) + " " + Y(p.balance).toFixed(1);
    }).join(" ");

    // area wash at ~10% opacity
    el("path", {
      d: line + " L" + X(x1).toFixed(1) + " " + Y(0) + " L" + X(x0).toFixed(1) + " " + Y(0) + " Z",
      fill: GREEN, opacity: 0.1
    }, svg);
    el("path", { d: line, fill: "none", stroke: GREEN, "stroke-width": 2,
      "stroke-linejoin": "round", "stroke-linecap": "round" }, svg);

    // end marker: 2px surface ring + direct label
    var last = pts[pts.length - 1];
    el("circle", { cx: X(last.date.getTime()), cy: Y(last.balance), r: 6, fill: SURFACE }, svg);
    el("circle", { cx: X(last.date.getTime()), cy: Y(last.balance), r: 4, fill: GREEN }, svg);
    el("text", { x: X(last.date.getTime()) + 10, y: Y(last.balance) + 4, fill: "#E8E8E8",
      "font-size": 13, "font-weight": 600, "font-family": "inherit" }, svg)
      .textContent = compact(last.balance);

    // crosshair + hover layer
    var cross = el("line", { y1: padT, y2: H - padB, stroke: TEXT_MUTED,
      "stroke-width": 1, opacity: 0 }, svg);
    var hoverDotRing = el("circle", { r: 6, fill: SURFACE, opacity: 0 }, svg);
    var hoverDot = el("circle", { r: 4, fill: GREEN, opacity: 0 }, svg);
    var hit = el("rect", { x: padL, y: padT, width: W - padL - padR, height: H - padT - padB,
      fill: "transparent" }, svg);

    hit.addEventListener("mousemove", function (ev) {
      var box = svg.getBoundingClientRect();
      var mx = (ev.clientX - box.left) * (W / box.width);
      var best = 0, bd = Infinity;
      pts.forEach(function (p, i) {
        var d = Math.abs(X(p.date.getTime()) - mx);
        if (d < bd) { bd = d; best = i; }
      });
      var p = pts[best];
      var px = X(p.date.getTime()), py = Y(p.balance);
      cross.setAttribute("x1", px); cross.setAttribute("x2", px); cross.setAttribute("opacity", 0.5);
      hoverDotRing.setAttribute("cx", px); hoverDotRing.setAttribute("cy", py); hoverDotRing.setAttribute("opacity", 1);
      hoverDot.setAttribute("cx", px); hoverDot.setAttribute("cy", py); hoverDot.setAttribute("opacity", 1);
      showTip(
        '<div class="tt-title">' + fmtDate(p.date) + "</div>" +
        '<div class="tt-row"><span class="swatch" style="background:' + GREEN + '"></span>Balance<b>' +
        fmtMoney(p.balance, true) + "</b></div>" +
        '<div class="tt-row">' + p.label + "</div>",
        ev.clientX, ev.clientY);
    });
    hit.addEventListener("mouseleave", function () {
      cross.setAttribute("opacity", 0);
      hoverDot.setAttribute("opacity", 0);
      hoverDotRing.setAttribute("opacity", 0);
      hideTip();
    });
  }

  /* ---------- Payments stacked bars ---------- */

  function renderPaymentsChart(ledger) {
    var host = document.getElementById("payments-chart");
    host.innerHTML = "";
    var rows = ledger.rows;
    if (!rows.length) {
      document.getElementById("payments-legend").hidden = true;
      return;
    }

    var W = 920, H = 300, padL = 64, padR = 16, padT = 20, padB = 36;
    var svg = el("svg", { viewBox: "0 0 " + W + " " + H, role: "img",
      "aria-label": "Stacked bar chart of payments split into principal and interest" }, host);

    var maxY = Math.max.apply(null, rows.map(function (r) { return r.amount; }));
    var ticks = niceTicks(maxY, 4);
    var topY = ticks[ticks.length - 1] || maxY;
    function Y(v) { return padT + (1 - v / topY) * (H - padT - padB); }

    ticks.forEach(function (t) {
      el("line", { x1: padL, x2: W - padR, y1: Y(t), y2: Y(t), stroke: GRID, "stroke-width": 1 }, svg);
      el("text", { x: padL - 10, y: Y(t) + 4, "text-anchor": "end", fill: TEXT_MUTED,
        "font-size": 12, "font-family": "inherit" }, svg).textContent = compact(t);
    });

    var plotW = W - padL - padR;
    var slot = plotW / rows.length;
    var barW = Math.min(24, Math.max(6, slot - 6));
    var GAP = 2; // surface gap between stacked segments

    rows.forEach(function (r, i) {
      var cx = padL + slot * i + slot / 2;
      var x = cx - barW / 2;
      var yTop = Y(r.amount);
      var g = el("g", {}, svg);

      // principal segment: baseline up, 4px rounded data-end only if it's the top
      var pTop = Y(r.principal);
      var iH = Y(r.principal) - yTop; // interest height in px (sits above principal)
      var rTopSeg = r.interest > 0 ? yTop : pTop;

      // top segment with rounded top corners via path
      function roundedTop(x0, y0, w, h) {
        var rr = Math.min(4, w / 2, h);
        return "M" + x0 + " " + (y0 + h) +
          " L" + x0 + " " + (y0 + rr) +
          " Q" + x0 + " " + y0 + " " + (x0 + rr) + " " + y0 +
          " L" + (x0 + w - rr) + " " + y0 +
          " Q" + (x0 + w) + " " + y0 + " " + (x0 + w) + " " + (y0 + rr) +
          " L" + (x0 + w) + " " + (y0 + h) + " Z";
      }

      if (r.interest > 0 && iH > GAP + 1) {
        el("path", { d: roundedTop(x, yTop, barW, iH - GAP), fill: BLUE }, g);
      }
      var pH = Y(0) - pTop;
      if (r.principal > 0 && pH > 0.5) {
        if (r.interest > 0 && iH > GAP + 1) {
          el("rect", { x: x, y: pTop, width: barW, height: pH, fill: GREEN }, g);
        } else {
          el("path", { d: roundedTop(x, pTop, barW, pH), fill: GREEN }, g);
        }
      }

      // hover hit target bigger than the mark
      var hit = el("rect", { x: padL + slot * i, y: padT, width: slot, height: H - padT - padB,
        fill: "transparent" }, g);
      hit.addEventListener("mousemove", function (ev) {
        showTip(
          '<div class="tt-title">' + fmtDate(r.date) + "</div>" +
          '<div class="tt-row"><span class="swatch" style="background:' + GREEN + '"></span>Principal<b>' +
          fmtMoney(r.principal, true) + "</b></div>" +
          '<div class="tt-row"><span class="swatch" style="background:' + BLUE + '"></span>Interest<b>' +
          fmtMoney(r.interest, true) + "</b></div>" +
          '<div class="tt-row">Total<b>' + fmtMoney(r.amount, true) + "</b></div>" +
          (r.note ? '<div class="tt-row">' + r.note + "</div>" : ""),
          ev.clientX, ev.clientY);
      });
      hit.addEventListener("mouseleave", hideTip);
    });

    // x labels: first / middle / last payment dates
    var li = [0, Math.floor((rows.length - 1) / 2), rows.length - 1]
      .filter(function (v, i, a) { return a.indexOf(v) === i; });
    li.forEach(function (i) {
      el("text", { x: padL + slot * i + slot / 2, y: H - 10, "text-anchor": "middle",
        fill: TEXT_MUTED, "font-size": 12, "font-family": "inherit" }, svg)
        .textContent = fmtDateShort(rows[i].date);
    });
  }

  /* ---------- KPIs, table, hero ---------- */

  var ICONS = {
    bank: '<svg class="icon" viewBox="0 0 24 24"><path d="M3 9.5 12 4l9 5.5M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    down: '<svg class="icon" viewBox="0 0 24 24"><path d="M21 7 13 15l-4-3-6 6" stroke-linecap="round" stroke-linejoin="round"/><path d="M15 19h6v-6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    percent: '<svg class="icon" viewBox="0 0 24 24"><path d="M19 5 5 19" stroke-linecap="round"/><circle cx="7" cy="7" r="2.5"/><circle cx="17" cy="17" r="2.5"/></svg>',
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

  function render() {
    var ledger = buildLedger(LOAN, PAYMENTS);
    var pctPaid = LOAN.principal > 0
      ? Math.min(100, (ledger.totPrincipal / LOAN.principal) * 100) : 0;

    // hero
    document.getElementById("hero-eyebrow").textContent =
      "Loan · " + LOAN.lender + " → " + LOAN.borrower;
    document.getElementById("hero-balance").textContent = fmtMoney(ledger.balance);
    var lastRow = ledger.rows[ledger.rows.length - 1];
    document.getElementById("hero-delta").innerHTML = lastRow
      ? '<span class="up">−' + fmtMoney(lastRow.principal, true) + "</span> principal on " + fmtDate(lastRow.date)
      : "No payments recorded yet";

    // meter
    document.getElementById("meter-pct").textContent = pctPaid.toFixed(1) + "%";
    requestAnimationFrame(function () {
      document.getElementById("meter-fill").style.width = pctPaid.toFixed(1) + "%";
    });

    // KPI row
    var kpi = document.getElementById("kpi-row");
    kpi.innerHTML = "";
    kpi.appendChild(statTile("bank", "Original loan", fmtMoney(LOAN.principal),
      "started " + fmtDate(ledger.start)));
    kpi.appendChild(statTile("down", "Total paid", fmtMoney(ledger.totPaid),
      ledger.rows.length + " payment" + (ledger.rows.length === 1 ? "" : "s")));
    kpi.appendChild(statTile("percent", "Interest paid", fmtMoney(ledger.totInterest),
      LOAN.annualRatePct + "% / year"));
    var due = nextDueDate(LOAN, ledger);
    kpi.appendChild(statTile("calendar", "Next payment due", fmtDate(due),
      fmtMoney(LOAN.scheduledPayment) + " expected"));
    var months = estimateMonthsLeft(ledger.balance + ledger.accruedNow, ledger.rate, LOAN.scheduledPayment);
    kpi.appendChild(statTile("coins", "Est. payoff",
      ledger.balance <= 0 ? "Paid off" : (months === null ? "—" : "~" + months + " mo"),
      ledger.balance <= 0 ? '<span class="up">complete</span>'
        : "at " + fmtMoney(LOAN.scheduledPayment) + "/mo"));

    // charts
    renderBalanceChart(ledger, LOAN);
    renderPaymentsChart(ledger);

    // table
    var tbody = document.querySelector("#pay-table tbody");
    tbody.innerHTML = "";
    var emptyEl = document.getElementById("empty-state");
    var tableEl = document.getElementById("pay-table");
    if (!ledger.rows.length) {
      emptyEl.hidden = false;
      tableEl.hidden = true;
    } else {
      emptyEl.hidden = true;
      tableEl.hidden = false;
      ledger.rows.slice().reverse().forEach(function (r) {
        var tr = document.createElement("tr");
        tr.innerHTML =
          "<td>" + r.n + "</td>" +
          "<td>" + fmtDate(r.date) + "</td>" +
          '<td class="num">' + fmtMoney(r.amount, true) + "</td>" +
          '<td class="num">' + fmtMoney(r.interest, true) + "</td>" +
          '<td class="num principal">' + fmtMoney(r.principal, true) + "</td>" +
          '<td class="num">' + fmtMoney(r.balance, true) + "</td>" +
          '<td class="note">' + (r.note || "") + "</td>";
        tbody.appendChild(tr);
      });
      document.getElementById("history-sub").textContent =
        ledger.rows.length + " payments · " + fmtMoney(ledger.totPrincipal) +
        " principal + " + fmtMoney(ledger.totInterest) + " interest";
    }

    // footer
    document.getElementById("footer-terms").textContent =
      fmtMoney(LOAN.principal) + " at " + LOAN.annualRatePct + "% · " +
      LOAN.lender + " → " + LOAN.borrower;
    document.getElementById("footer-asof").textContent =
      "As of " + fmtDate(ledger.today) +
      (ledger.accruedNow > 0.005 ? " · " + fmtMoney(ledger.accruedNow, true) + " interest accrued since last payment" : "");
  }

  /* ---------- Neural-network hero visual ---------- */

  function startNetwork() {
    var canvas = document.getElementById("net-canvas");
    var ctx = canvas.getContext("2d");
    var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var nodes = [], W = 0, H = 0, dpr = Math.min(2, window.devicePixelRatio || 1);

    function resize() {
      var r = canvas.getBoundingClientRect();
      W = r.width; H = r.height;
      canvas.width = W * dpr; canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      var count = Math.max(14, Math.min(28, Math.floor(W * H / 9000)));
      nodes = [];
      for (var i = 0; i < count; i++) {
        nodes.push({
          x: Math.random() * W, y: Math.random() * H,
          vx: (Math.random() - 0.5) * 0.25, vy: (Math.random() - 0.5) * 0.25,
          r: 1.5 + Math.random() * 1.5
        });
      }
    }

    function draw() {
      ctx.clearRect(0, 0, W, H);
      var linkDist = Math.min(W, H) * 0.42;
      for (var i = 0; i < nodes.length; i++) {
        var a = nodes[i];
        for (var j = i + 1; j < nodes.length; j++) {
          var b = nodes[j];
          var dx = a.x - b.x, dy = a.y - b.y;
          var d = Math.sqrt(dx * dx + dy * dy);
          if (d < linkDist) {
            ctx.strokeStyle = "rgba(118, 185, 0, " + (0.16 * (1 - d / linkDist)).toFixed(3) + ")";
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
          }
        }
      }
      nodes.forEach(function (n) {
        ctx.fillStyle = "rgba(118, 185, 0, 0.55)";
        ctx.beginPath(); ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2); ctx.fill();
      });
    }

    function step() {
      nodes.forEach(function (n) {
        n.x += n.vx; n.y += n.vy;
        if (n.x < 0 || n.x > W) n.vx *= -1;
        if (n.y < 0 || n.y > H) n.vy *= -1;
      });
      draw();
      requestAnimationFrame(step);
    }

    resize();
    window.addEventListener("resize", function () { resize(); draw(); });
    if (reduced) { draw(); } else { requestAnimationFrame(step); }
  }

  /* ---------- Entry reveals ---------- */

  function startReveals() {
    var els = document.querySelectorAll(".reveal");
    if (!("IntersectionObserver" in window)) {
      els.forEach(function (e) { e.classList.add("in"); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          // stagger siblings that arrive together (120ms cascade)
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
  startNetwork();
  startReveals();
})();
