# Warehouse Simulation

This repository contains a lightweight discrete-event simulation of a small
warehouse.  The goal is to render the state of the system as a **pure ASCII
Kanban board** matching the concept outlined in `docs/output_visuals.md`.

## Running the Simulation

No external dependencies are required; the project uses only the Python
standard library.

Execute the simulation and print the board after a given number of minutes:

```bash
python run_simulation.py --ticks 360 --seed 42
```

The output shows:

* A KPI bar with simple metrics (on‑time %, orders per hour, average wait,
  queue length and clock).
* An employee bar where `[o]` denotes an idle worker and `[ ]` a busy one.
* Five columns representing order stages: **New Orders**, **Pick**, **Stage**,
  **Ship** and **Complete**.
* Fixed‑width ASCII boxes for individual orders, including overflow indicators
  when a column has more orders than displayed.

This simulation is a starting point for experimenting with warehouse flow and
visualising state in a terminal‑friendly format.

## Web App

A static browser-based view is provided in `docs/index.html`.  Serve the folder
locally (for example with Python's built-in web server) and open the page in
your browser:

```bash
python -m http.server
# then visit http://localhost:8000/docs/
```

The page runs the same simulation in JavaScript and renders the ASCII board in
an HTML `<pre>` block, closely matching the mock‑ups in
`docs/output_visuals.md`.
