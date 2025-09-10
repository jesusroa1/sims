// Simple RNG (Mulberry32)
function makeRng(seed) {
  let t = seed >>> 0;
  return function () {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

class Order {
  constructor(id, createdTick) {
    this.id = id;
    this.createdTick = createdTick;
    this.stage = "NEW";
    this.completeTick = null;
  }
}

class Employee {
  constructor(id) {
    this.id = id;
    this.currentOrder = null;
    this.timeRemaining = 0;
  }
  get idle() {
    return this.currentOrder === null;
  }
}

class WarehouseSimulation {
  constructor({ numEmployees = 8, ordersPerDay = 500, minutesPerOrder = 12, seed = 42, slaMinutes = 240 } = {}) {
    this.rng = makeRng(seed);
    this.employees = Array.from({ length: numEmployees }, (_, i) => new Employee(i));
    this.newOrders = [];
    this.completedOrders = [];
    this.tick = 0;
    this.nextOrderNum = 1000;
    this.slaMinutes = slaMinutes;
    this.ordersPerDay = Math.max(0, ordersPerDay);
    // Derive stage durations from avg minutes/order (PICK 50%, STAGE 30%, SHIP 20%)
    const mpo = Math.max(1, minutesPerOrder);
    this.durations = {
      PICK: Math.max(1, Math.round(mpo * 0.5)),
      STAGE: Math.max(1, Math.round(mpo * 0.3)),
      SHIP: Math.max(1, Math.round(mpo * 0.2)),
    };
    // Per-day counters
    this.createdByDay = [];
    this.completedByDay = [];
    this.onTimeByDay = [];
  }

  _generateOrderId() {
    return "A" + this.nextOrderNum++;
  }

  step() {
    // Expected arrivals per minute from ordersPerDay
    const lambda = this.ordersPerDay / (24 * 60);
    let arrivals = Math.floor(lambda);
    const residual = lambda - arrivals;
    if (this.rng() < residual) arrivals += 1;
    // Track daily created
    if (arrivals > 0) {
      const dayIdx = Math.floor(this.tick / (24 * 60));
      this.createdByDay[dayIdx] = (this.createdByDay[dayIdx] || 0) + arrivals;
    }
    for (let i = 0; i < arrivals; i++) {
      this.newOrders.push(new Order(this._generateOrderId(), this.tick));
    }

    for (const emp of this.employees) {
      if (emp.currentOrder) {
        emp.timeRemaining -= 1;
        if (emp.timeRemaining <= 0) {
          const order = emp.currentOrder;
          if (order.stage === "PICK") {
            order.stage = "STAGE";
            emp.timeRemaining = this.durations.STAGE;
          } else if (order.stage === "STAGE") {
            order.stage = "SHIP";
            emp.timeRemaining = this.durations.SHIP;
          } else if (order.stage === "SHIP") {
            order.stage = "COMPLETE";
            order.completeTick = this.tick;
            this.completedOrders.push(order);
            const dayIdx = Math.floor(this.tick / (24 * 60));
            this.completedByDay[dayIdx] = (this.completedByDay[dayIdx] || 0) + 1;
            // Track on-time completions for the day
            const dwell = order.completeTick - order.createdTick;
            if (dwell <= this.slaMinutes) {
              this.onTimeByDay[dayIdx] = (this.onTimeByDay[dayIdx] || 0) + 1;
            }
            emp.currentOrder = null;
          }
        }
      }
    }

    for (const emp of this.employees) {
      if (emp.idle && this.newOrders.length) {
        const ord = this.newOrders.shift();
        ord.stage = "PICK";
        emp.currentOrder = ord;
        emp.timeRemaining = this.durations.PICK;
      }
    }

    this.tick += 1;
  }

  run(ticks) {
    for (let i = 0; i < ticks; i++) this.step();
  }

  _clockLabel() {
    const minutes = this.tick % (24 * 60);
    const day = Math.floor(this.tick / (24 * 60)) + 1;
    const h24 = Math.floor(minutes / 60);
    const hour = ((h24 + 11) % 12) + 1; // 1..12
    const ampm = h24 < 12 ? "AM" : "PM";
    return `Day ${day} ${hour}${ampm}`;
  }

  _stageLists() {
    const pick = [], stage = [], ship = [];
    for (const e of this.employees) {
      const o = e.currentOrder;
      if (o) {
        if (o.stage === "PICK") pick.push(o);
        else if (o.stage === "STAGE") stage.push(o);
        else if (o.stage === "SHIP") ship.push(o);
      }
    }
    return [pick, stage, ship];
  }

  _metrics() {
    const done = this.completedOrders.length;
    let onTimePct = 0, avgWait = 0, oph = 0, onTimeCount = 0;
    if (done) {
      let onTime = 0, totalWait = 0;
      for (const o of this.completedOrders) {
        const dwell = o.completeTick - o.createdTick;
        if (dwell <= this.slaMinutes) onTime++;
        totalWait += dwell;
      }
      onTimePct = (onTime / done) * 100;
      avgWait = totalWait / done;
      oph = done / Math.max(this.tick / 60, 1e-9);
      onTimeCount = onTime;
    }
    const laneQ = this.newOrders.length;
    return [onTimePct, oph, avgWait, laneQ, this._clockLabel(), onTimeCount, done];
  }

  render(maxDisplay = 6) {
    const [pick, stage, ship] = this._stageLists();
    const [onTime, oph, avgWait, laneQ, clock, onTimeCount, done] = this._metrics();
    const width = 84;
    const inner = width - 2;
    const border = () => "+" + "-".repeat(inner) + "+";
    const fmt = (t) => "|" + t.padEnd(inner) + "|";
    const lines = [];
    lines.push(border());
    const kpi = `KPI: On-time ${onTimeCount}/${done} (${onTime.toFixed(1)}%) | OPH ${oph.toFixed(1)} | Avg dwell ${avgWait.toFixed(1)}m | Lane ${laneQ} | ${clock}`;
    lines.push(fmt(kpi));
    lines.push(border());
    const empBar = "EMPLOYEES:  " + this.employees.map(e => e.idle ? "[o]" : "[ ]").join(" ");
    lines.push(fmt(empBar));
    lines.push(border());
    lines.push("");

    const headers = [
      " NEW ORDERS   ",
      "   PICK        ",
      "   STAGE       ",
      "   SHIP        ",
      "   COMPLETE    ",
    ];
    const colWidths = [14, 15, 15, 15, 15];
    lines.push(fmt(headers.join("|") + "|"));
    const seps = [
      "--------------",
      "---------------",
      "---------------",
      "---------------",
      "---------------",
    ];
    lines.push(fmt(seps.join("|") + "|"));

    const columns = [this.newOrders, pick, stage, ship, this.completedOrders];
    const stageNames = ["NEW", "PICK", "STAGE", "SHIP", "COMPLETE"];

    // Cleaner Unicode boxes with fixed inner width 10
    const boxTop = (w) => "┌" + "─".repeat(10) + "┐" + " ".repeat(w - 12);
    const boxContent = (text, w) => "│" + text + "│" + " ".repeat(w - 12);
    const boxBottom = (w) => "└" + "─".repeat(10) + "┘" + " ".repeat(w - 12);
    const center = (text, width) => {
      const left = Math.floor((width - text.length) / 2);
      const right = width - text.length - left;
      return " ".repeat(left) + text + " ".repeat(right);
    };
    const orderText = (o, stage) => {
      if (stage === "NEW") return center(o.id, 10);
      if (stage === "COMPLETE") return ("[*] " + o.id).padEnd(10);
      return ("[o] " + o.id).padEnd(10);
    };

    for (let idx = 0; idx < maxDisplay; idx++) {
      let cells = [];
      for (let c = 0; c < columns.length; c++) {
        cells.push(columns[c].length > idx ? boxTop(colWidths[c]) : " ".repeat(colWidths[c]));
      }
      lines.push(fmt(cells.join("|") + "|"));

      cells = [];
      for (let c = 0; c < columns.length; c++) {
        if (columns[c].length > idx) {
          const txt = orderText(columns[c][idx], stageNames[c]);
          cells.push(boxContent(txt, colWidths[c]));
        } else {
          cells.push(" ".repeat(colWidths[c]));
        }
      }
      lines.push(fmt(cells.join("|") + "|"));

      cells = [];
      for (let c = 0; c < columns.length; c++) {
        cells.push(columns[c].length > idx ? boxBottom(colWidths[c]) : " ".repeat(colWidths[c]));
      }
      lines.push(fmt(cells.join("|") + "|"));
  }

    const blank = colWidths.map(w => " ".repeat(w)).join("|") + "|";
    lines.push(fmt(blank));

    const extraNew = Math.max(this.newOrders.length - maxDisplay, 0);
    const extraComplete = Math.max(this.completedOrders.length - maxDisplay, 0);
    let line1 = [], line2 = [];
    for (let i = 0; i < colWidths.length; i++) {
      if (i === 0 && extraNew > 0) {
        line1.push(` (${extraNew} more`.padEnd(colWidths[i]));
        line2.push(" orders...)".padEnd(colWidths[i]));
      } else if (i === 4 && extraComplete > 0) {
        line1.push(` (${extraComplete} more`.padEnd(colWidths[i]));
        line2.push(" complete...)".padEnd(colWidths[i]));
      } else {
        line1.push(" ".repeat(colWidths[i]));
        line2.push(" ".repeat(colWidths[i]));
      }
    }
    lines.push(fmt(line1.join("|") + "|"));
    lines.push(fmt(line2.join("|") + "|"));

    return lines.join("\n");
  }
}

// Hook up UI controls and simple real-time loop
function $(id) { return document.getElementById(id); }

let timerId = null;
let sim = null;
let targetTicks = 0;

function readParams() {
  return {
    ordersPerDay: parseInt($("ordersPerDay").value, 10) || 0,
    days: Math.max(1, parseInt($("days").value, 10) || 1),
    employees: Math.max(1, parseInt($("employees").value, 10) || 1),
    minutesPerOrder: Math.max(1, parseInt($("minutesPerOrder").value, 10) || 12),
    minutesPerSecond: Math.max(1, parseInt($("minutesPerSecond").value, 10) || 60),
  };
}

function render() {
  $("board").textContent = sim ? sim.render() : new WarehouseSimulation().render();
  drawChart();
}

function startSimulation() {
  // Reset any previous run
  if (timerId) {
    clearInterval(timerId);
    timerId = null;
  }

  const p = readParams();
  sim = new WarehouseSimulation({ numEmployees: p.employees, ordersPerDay: p.ordersPerDay, minutesPerOrder: p.minutesPerOrder });
  targetTicks = p.days * 24 * 60; // minutes
  const stepPerSecond = p.minutesPerSecond; // minutes of sim time each real second

  // Render immediately
  render();

  timerId = setInterval(() => {
    if (!sim) return;
    const remaining = Math.max(0, targetTicks - sim.tick);
    if (remaining === 0) {
      clearInterval(timerId);
      timerId = null;
      return;
    }
    const step = Math.min(stepPerSecond, remaining);
    sim.run(step);
    render();
  }, 1000);
}

function resetSimulation() {
  if (timerId) {
    clearInterval(timerId);
    timerId = null;
  }
  sim = null;
  render();
}

const startBtn = document.getElementById("startBtn");
if (startBtn) startBtn.addEventListener("click", startSimulation);
const resetBtn = document.getElementById("resetBtn");
if (resetBtn) resetBtn.addEventListener("click", resetSimulation);

// Initial render with defaults (without running)
render();

// Simple line chart: Created, Completed, OnTime% per day
function drawChart() {
  const canvas = $("chart");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  // Handle HiDPI scaling
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth || canvas.width;
  const cssH = canvas.clientHeight || canvas.height;
  if (canvas.width !== Math.floor(cssW * dpr) || canvas.height !== Math.floor(cssH * dpr)) {
    canvas.width = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);

  const pad = { top: 12, right: 40, bottom: 24, left: 40 };
  const w = cssW - pad.left - pad.right;
  const h = cssH - pad.top - pad.bottom;

  // Data
  const created = (sim && sim.createdByDay) ? sim.createdByDay.slice() : [];
  const completed = (sim && sim.completedByDay) ? sim.completedByDay.slice() : [];
  const ontime = (sim && sim.onTimeByDay) ? sim.onTimeByDay.slice() : [];
  const totalDays = Math.max(created.length, completed.length, ontime.length, Math.max(1, Math.floor((targetTicks || 0) / (24 * 60))));
  while (created.length < totalDays) created.push(0);
  while (completed.length < totalDays) completed.push(0);
  while (ontime.length < totalDays) ontime.push(0);

  const maxVal = Math.max(1, ...created, ...completed);
  // Precompute OnTime% where possible
  const ontimePct = completed.map((c, i) => (c > 0 ? (ontime[i] / c) * 100 : NaN));

  // Axes
  ctx.strokeStyle = "#334155";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pad.left, pad.top);
  ctx.lineTo(pad.left, pad.top + h);
  ctx.lineTo(pad.left + w, pad.top + h);
  ctx.lineTo(pad.left + w, pad.top);
  ctx.stroke();

  // Left Y ticks for counts (4)
  ctx.fillStyle = "#9ca3af";
  ctx.font = "12px ui-monospace, SFMono-Regular, Menlo, monospace";
  for (let i = 0; i <= 4; i++) {
    const yVal = (maxVal * i) / 4;
    const y = pad.top + h - (h * i) / 4;
    ctx.fillText(Math.round(yVal).toString(), 6, y + 4);
    ctx.strokeStyle = "#1f2937";
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(pad.left + w, y);
    ctx.stroke();
  }
  // Right Y ticks for percent (0..100)
  for (let i = 0; i <= 4; i++) {
    const pct = (100 * i) / 4;
    const y = pad.top + h - (h * i) / 4;
    ctx.fillStyle = "#9ca3af";
    const txt = Math.round(pct).toString() + "%";
    const tw = ctx.measureText(txt).width;
    ctx.fillText(txt, pad.left + w - tw - 2, y + 4);
  }

  // Scales
  const cellW = w / Math.max(1, totalDays);
  const xForDay = (d) => pad.left + d * cellW + cellW / 2;
  const yCount = (v) => pad.top + h - (v / maxVal) * h;
  const yPct = (v) => pad.top + h - (Math.max(0, Math.min(100, v)) / 100) * h;

  function drawSeries(data, yFn, color) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    let started = false;
    for (let d = 0; d < totalDays; d++) {
      const val = data[d];
      if (Number.isNaN(val)) continue;
      const x = xForDay(d);
      const y = yFn(val);
      if (!started) { ctx.moveTo(x, y); started = true; }
      else { ctx.lineTo(x, y); }
    }
    ctx.stroke();
  }

  drawSeries(created, yCount, "#60a5fa");   // blue
  drawSeries(completed, yCount, "#34d399"); // green
  drawSeries(ontimePct, yPct, "#fbbf24");   // amber

  // Day labels if wide enough
  if (cellW > 22) {
    ctx.fillStyle = "#9ca3af";
    for (let d = 0; d < totalDays; d++) {
      const baseX = pad.left + d * cellW;
      ctx.fillText(String(d + 1), baseX + cellW / 2 - 3, pad.top + h + 14);
    }
  }

  // Legend
  function legendItem(label, color, x) {
    ctx.fillStyle = color;
    ctx.fillRect(x, pad.top + 4, 10, 2);
    ctx.fillStyle = "#9ca3af";
    ctx.fillText(label, x + 14, pad.top + 10);
  }
  legendItem("Created", "#60a5fa", pad.left);
  legendItem("Completed", "#34d399", pad.left + 90);
  legendItem("OnTime%", "#fbbf24", pad.left + 200);
}
