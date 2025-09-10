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
  constructor(numEmployees = 8, seed = 42, slaMinutes = 240) {
    this.rng = makeRng(seed);
    this.employees = Array.from({ length: numEmployees }, (_, i) => new Employee(i));
    this.newOrders = [];
    this.completedOrders = [];
    this.tick = 0;
    this.nextOrderNum = 1000;
    this.slaMinutes = slaMinutes;
  }

  _generateOrderId() {
    return "A" + this.nextOrderNum++;
  }

  step() {
    if (this.rng() < 0.7) {
      this.newOrders.push(new Order(this._generateOrderId(), this.tick));
    }

    for (const emp of this.employees) {
      if (emp.currentOrder) {
        emp.timeRemaining -= 1;
        if (emp.timeRemaining <= 0) {
          const order = emp.currentOrder;
          if (order.stage === "PICK") {
            order.stage = "STAGE";
            emp.timeRemaining = 3;
          } else if (order.stage === "STAGE") {
            order.stage = "SHIP";
            emp.timeRemaining = 4;
          } else if (order.stage === "SHIP") {
            order.stage = "COMPLETE";
            order.completeTick = this.tick;
            this.completedOrders.push(order);
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
        emp.timeRemaining = 5;
      }
    }

    this.tick += 1;
  }

  run(ticks) {
    for (let i = 0; i < ticks; i++) this.step();
  }

  _clock() {
    const h = Math.floor(this.tick / 60);
    const m = this.tick % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
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
    let onTimePct = 0, avgWait = 0, oph = 0;
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
    }
    const laneQ = this.newOrders.length;
    return [onTimePct, oph, avgWait, laneQ, this._clock()];
  }

  render(maxDisplay = 6) {
    const [pick, stage, ship] = this._stageLists();
    const [onTime, oph, avgWait, laneQ, clock] = this._metrics();
    const width = 84;
    const inner = width - 2;
    const border = () => "+" + "-".repeat(inner) + "+";
    const fmt = (t) => "|" + t.padEnd(inner) + "|";
    const lines = [];
    lines.push(border());
    const kpi = `KPI BAR: ${onTime.toFixed(1).padStart(5)}% | ${oph.toFixed(1).padStart(9)} | ${avgWait.toFixed(1).padStart(8)} | ${String(laneQ).padStart(6)} | ${clock}`;
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

    const boxTop = (w) => " +----------+" + " ".repeat(w - 13);
    const boxContent = (text, w) => " |" + text + "|" + " ".repeat(w - 13);
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
        cells.push(columns[c].length > idx ? boxTop(colWidths[c]) : " ".repeat(colWidths[c]));
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

const sim = new WarehouseSimulation();
sim.run(360);
document.getElementById("board").textContent = sim.render();
