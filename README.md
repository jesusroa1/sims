# Warehouse Simulation Project

## Goal

We want to **demonstrate why using "pick all orders within X hours of
creation" is a flawed metric** when evaluating warehouse performance.\
Our simulator will show how **variability in order arrivals and pick
rates** creates backlogs and service-level misses, even when average
productivity looks sufficient. Critically, we want to show that using "units per hour" productivity when determining headcount needs without accounting for order variability can lead to backlogs and service-level misses.

## Approach

1.  **Keep it as simple as possible.**
    -   Start with only two stages: **Order Arrival → Picking**.
    -   Use a **FIFO queue** with whole orders only (no splitting).
    -   Model arrivals and picking capacity as **normally distributed
        rates** (mean and standard deviation).
2.  **Simulation mechanics.**
    -   Discrete time steps (e.g., 1-minute ticks).
    -   Each tick:
        -   Generate new orders (based on arrival distribution).
        -   Serve picking queue (capacity distribution).
        -   Record backlog, throughput, and on-time metrics.
    -   Track **on-time pick %**, **average dwell time**, **backlog
        trends**, and **effective throughput (orders/hour)**.
3.  **Technology.**
    -   Core logic in **Python**, emphasizing readability and
        extensibility.
    -   Use Python for simulation, data handling, and chart generation.
    -   For publishing results interactively, we include a **static site**
        (in `docs/`) that runs a live simulation in the browser and can be
        published with **GitHub Pages**.
4.  **Future extensions.**
    -   Add additional stages (e.g., Shipping, Packing).
    -   Model shift schedules or priority orders.
    -   Simulate stress-test scenarios (e.g., Black Friday spikes).

## Why This Matters

This project makes visible how **stochastic arrivals and processing**
drive performance. Instead of abstract "units per hour" rules, we'll
illustrate how queues, variability, and SLAs interact.\
The simulator becomes a teaching tool for warehouse managers, analysts,
and engineers to understand **capacity vs demand** in a dynamic system.

## How to Run

### Python (batch) simulation

- Install deps: `python -m pip install -r sims/requirements.txt`
- Run: `python sims/run_simulation.py --hours 8 --sla-hours 4 --arrive-mean 320 --arrive-std 80 --pick-mean 300 --pick-std 60`
- Outputs CSVs under `sims/output/` and prints pandas DataFrame heads.

### Live browser simulation (GitHub Pages)

- Open `sims/docs/index.html` directly in a browser to test locally.
- Controls:
  - Start/Pause, Step, Reset
  - Speed (ms/tick) and parameters (hours, SLA, arrival/pick mean/std, seed)
  - Two live tables: “Queue (Waiting Orders)” and “Picked Orders”
  - Backlog line chart updates per tick
- Publish via GitHub Pages:
  1. Push this repo to GitHub.
  2. In repo Settings → Pages, set Source to “Deploy from a branch”.
  3. Set Branch to `main` and Folder to `/docs`.
  4. Save. Your site will be available at `https://<user>.github.io/sims/`.
