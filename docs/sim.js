// Simple RNG with seed (Mulberry32) for reproducibility
function makeRng(seed) {
  let t = seed >>> 0;
  return function () {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

// Box-Muller transform for normal distribution
function randn(rng) {
  let u = 0, v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

function drawNonnegativeIntNormal(mean, std, rng) {
  if (std <= 0) return Math.max(0, Math.round(mean));
  const val = mean + std * randn(rng);
  return Math.max(0, Math.round(val));
}

class Simulator {
  constructor(cfg) {
    this.cfg = cfg;
    this.minute = 0;
    this.queue = []; // array of orders { id, created }
    this.picked = []; // array of orders { id, created, picked, dwell, onTime }
    this.nextId = 1;
    this.cumArrived = 0;
    this.cumPicked = 0;
    this.cumOnTime = 0;
    this.rng = makeRng(cfg.seed >>> 0);
    this.backlogPoints = []; // [{x: minute, y: backlog}]
  }

  step() {
    const slaMin = this.cfg.slaHours * 60;
    const arriveMeanTick = this.cfg.arriveMean / 60.0;
    const arriveStdTick = this.cfg.arriveStd / 60.0;
    const pickMeanTick = this.cfg.pickMean / 60.0;
    const pickStdTick = this.cfg.pickStd / 60.0;

    // Arrivals
    const arrivals = drawNonnegativeIntNormal(arriveMeanTick, arriveStdTick, this.rng);
    for (let i = 0; i < arrivals; i++) {
      this.queue.push({ id: this.nextId++, created: this.minute });
    }
    this.cumArrived += arrivals;

    // Capacity
    const capacity = drawNonnegativeIntNormal(pickMeanTick, pickStdTick, this.rng);

    // Serve FIFO up to capacity
    let pickedThisTick = 0;
    while (pickedThisTick < capacity && this.queue.length > 0) {
      const ord = this.queue.shift();
      const dwell = this.minute - ord.created;
      const onTime = dwell <= slaMin;
      this.picked.push({ id: ord.id, created: ord.created, picked: this.minute, dwell, onTime });
      this.cumPicked++;
      if (onTime) this.cumOnTime++;
      pickedThisTick++;
    }

    const backlog = this.queue.length;
    this.backlogPoints.push({ x: this.minute, y: backlog });

    const throughput = this.minute > 0 ? (this.cumPicked / this.minute) * 60.0 : 0;
    const onTimePct = this.cumPicked > 0 ? (this.cumOnTime / this.cumPicked) * 100.0 : NaN;

    const metrics = {
      minute: this.minute,
      arrivals,
      capacity,
      pickedThisTick,
      backlog,
      cumPicked: this.cumPicked,
      onTimePct,
      throughput,
    };

    this.minute += 1;
    return metrics;
  }
}

// --- UI wiring ---
const els = {
  startPauseBtn: document.getElementById('startPauseBtn'),
  stepBtn: document.getElementById('stepBtn'),
  resetBtn: document.getElementById('resetBtn'),
  speedMs: document.getElementById('speedMs'),
  hours: document.getElementById('hours'),
  slaHours: document.getElementById('slaHours'),
  seed: document.getElementById('seed'),
  arriveMean: document.getElementById('arriveMean'),
  arriveStd: document.getElementById('arriveStd'),
  pickMean: document.getElementById('pickMean'),
  pickStd: document.getElementById('pickStd'),
  tickMin: document.getElementById('tickMin'),
  backlog: document.getElementById('backlog'),
  cumPicked: document.getElementById('cumPicked'),
  onTimePct: document.getElementById('onTimePct'),
  throughput: document.getElementById('throughput'),
  queueTableBody: document.querySelector('#queueTable tbody'),
  pickedTableBody: document.querySelector('#pickedTable tbody'),
  backlogCanvas: document.getElementById('backlogChart'),
};

let sim = null;
let timer = null;

function readConfig() {
  return {
    hours: parseFloat(els.hours.value),
    slaHours: parseFloat(els.slaHours.value),
    seed: parseInt(els.seed.value || '42', 10),
    arriveMean: parseFloat(els.arriveMean.value),
    arriveStd: parseFloat(els.arriveStd.value),
    pickMean: parseFloat(els.pickMean.value),
    pickStd: parseFloat(els.pickStd.value),
  };
}

function resetSim() {
  sim = new Simulator(readConfig());
  updateUI({ minute: 0, arrivals: 0, capacity: 0, pickedThisTick: 0, backlog: 0, cumPicked: 0, onTimePct: NaN, throughput: 0 });
  renderTables();
  renderChart();
}

function startPause() {
  if (!timer) {
    els.startPauseBtn.textContent = 'Pause';
    const totalMinutes = Math.round(sim.cfg.hours * 60);
    timer = setInterval(() => {
      const metrics = sim.step();
      updateUI(metrics);
      renderTables();
      renderChart();
      if (sim.minute >= totalMinutes) {
        pauseTimer();
      }
    }, Math.max(1, parseInt(els.speedMs.value || '100', 10)));
  } else {
    pauseTimer();
  }
}

function pauseTimer() {
  clearInterval(timer);
  timer = null;
  els.startPauseBtn.textContent = 'Start';
}

function stepOnce() {
  const totalMinutes = Math.round(sim.cfg.hours * 60);
  if (sim.minute >= totalMinutes) return;
  const metrics = sim.step();
  updateUI(metrics);
  renderTables();
  renderChart();
}

function updateUI(m) {
  els.tickMin.textContent = m.minute;
  els.backlog.textContent = m.backlog;
  els.cumPicked.textContent = m.cumPicked;
  els.onTimePct.textContent = isNaN(m.onTimePct) ? '—' : m.onTimePct.toFixed(1) + '%';
  els.throughput.textContent = m.throughput.toFixed(1);
}

function renderTables() {
  // Queue: show up to 100 most recent waiting orders (by created desc)
  const now = sim.minute;
  const q = sim.queue.slice(-100).map(o => ({ id: o.id, created: o.created, dwell: now - o.created }))
                      .sort((a,b) => b.created - a.created);
  const qRows = q.map(o => `<tr><td>${o.id}</td><td>${o.created}</td><td>${o.dwell}</td></tr>`).join('');
  els.queueTableBody.innerHTML = qRows;

  // Picked: show up to 100 most recent picked orders (by picked desc)
  const p = sim.picked.slice(-100).slice().sort((a,b) => b.picked - a.picked);
  const pRows = p.map(o => `<tr><td>${o.id}</td><td>${o.created}</td><td>${o.picked}</td><td>${o.dwell}</td><td class="${o.onTime ? 'ontime' : 'late'}">${o.onTime ? 'On-time' : 'Late'}</td></tr>`).join('');
  els.pickedTableBody.innerHTML = pRows;
}

function renderChart() {
  const ctx = els.backlogCanvas.getContext('2d');
  const W = els.backlogCanvas.width;
  const H = els.backlogCanvas.height;
  ctx.clearRect(0, 0, W, H);

  // Axes
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(40, 10);
  ctx.lineTo(40, H - 20);
  ctx.lineTo(W - 10, H - 20);
  ctx.stroke();

  const pts = sim.backlogPoints;
  if (pts.length < 2) return;

  const minX = pts[0].x;
  const maxX = pts[pts.length - 1].x || 1;
  let maxY = 1;
  for (const p of pts) maxY = Math.max(maxY, p.y);

  const plotX = (x) => 40 + ((x - minX) / Math.max(1, (maxX - minX))) * (W - 50);
  const plotY = (y) => (H - 20) - (y / Math.max(1, maxY)) * (H - 30);

  // Line
  ctx.strokeStyle = '#22c55e';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(plotX(pts[0].x), plotY(pts[0].y));
  for (let i = 1; i < pts.length; i++) {
    ctx.lineTo(plotX(pts[i].x), plotY(pts[i].y));
  }
  ctx.stroke();

  // Labels
  ctx.fillStyle = '#9ca3af';
  ctx.font = '12px system-ui, sans-serif';
  ctx.fillText('Backlog', 46, 20);
}

// Hook up events
els.startPauseBtn.addEventListener('click', startPause);
els.stepBtn.addEventListener('click', stepOnce);
els.resetBtn.addEventListener('click', () => { pauseTimer(); resetSim(); });
els.speedMs.addEventListener('change', () => {
  if (timer) { pauseTimer(); startPause(); }
});

// Reset whenever params change (so runs are reproducible with given seed)
for (const id of ['hours','slaHours','seed','arriveMean','arriveStd','pickMean','pickStd']) {
  document.getElementById(id).addEventListener('change', () => { pauseTimer(); resetSim(); });
}

// Init
resetSim();

