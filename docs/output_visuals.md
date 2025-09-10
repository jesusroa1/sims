# Warehouse Order Picking Simulation — 2D Web App Mockup (No-3D, Lightweight)

A **pure ASCII Kanban board** snapshot with **vertical column separators** between every stage line. Each order status column is one order wide. Employees are `[o]` when idle in the top bar, or `[ ]` if working.

---

## Proof-of-Concept Snapshot — Day 6

```
+----------------------------------------------------------------------------------+
| KPI BAR: On-time % | Orders/hr | Avg Wait | Lane Q | Clock                       |
+----------------------------------------------------------------------------------+
| EMPLOYEES:  [ ] [ ] [ ] [ ] [ ] [ ] [o] [o]                                     |
+----------------------------------------------------------------------------------+

| NEW ORDERS   |   PICK        |   STAGE       |   SHIP        |   COMPLETE    |
|--------------|---------------|---------------|---------------|---------------|
| +----------+ | +----------+  | +----------+  | +----------+  | +----------+  |
| |  A1357   | | | [o] A2468|  | | [o] A9753|  | | [o] A8642|  | | [*] A4001|  |
| +----------+ | +----------+  | +----------+  | +----------+  | +----------+  |
| +----------+ |               | +----------+  | +----------+  | +----------+  |
| |  A5555   | |               | | [o] A5556|  | | [o] A1111|  | | [*] A4002|  |
| +----------+ |               | +----------+  | +----------+  | +----------+  |
| +----------+ |               | +----------+  |               | +----------+  |
| |  A2222   | |               | | [o] A5557|  |               | | [*] A4003|  |
| +----------+ |               | +----------+  |               | +----------+  |
| +----------+ |               |               |               | +----------+  |
| |  A3333   | |               |               |               | | [*] A4004|  |
| +----------+ |               |               |               | +----------+  |
| +----------+ |               |               |               | +----------+  |
| |  A4444   | |               |               |               | | [*] A4005|  |
| +----------+ |               |               |               | +----------+  |
|              |               |               |               |               |
| (12 more    |               |               |               | (8 more       |
|  orders...) |               |               |               |  complete...) |
```

---

## Visual Grammar / Legend

* **Orders**: Fixed-width ASCII boxes with Order# inside.
* **Employees**: 8 slots shown at top:

  * `[o]` = idle employee, available
  * `[ ]` = employee currently working on an order
* **Columns**: `New Orders | Pick | Stage | Ship | Complete`, separated by **vertical pipes** on every line.
* **Completed Orders**: Marked with `[*]` before Order#.
* **Overflow indicators**: `(12 more orders...)`, `(8 more complete...)`.

---
