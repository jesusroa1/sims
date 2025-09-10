from __future__ import annotations

import random
from dataclasses import dataclass
from typing import List, Optional


@dataclass
class Order:
    """Represents a single customer order moving through the warehouse."""

    id: str
    created_tick: int
    stage: str = "NEW"
    complete_tick: Optional[int] = None


@dataclass
class Employee:
    """Simple worker who can handle one order at a time."""

    id: int
    current_order: Optional[Order] = None
    time_remaining: int = 0

    @property
    def idle(self) -> bool:
        return self.current_order is None


class WarehouseSimulation:
    """Discrete-event simulation for a tiny warehouse workflow."""

    STAGE_DURATIONS = {"PICK": 5, "STAGE": 3, "SHIP": 4}

    def __init__(self, num_employees: int = 8, seed: Optional[int] = None, sla_minutes: int = 240) -> None:
        self.rng = random.Random(seed)
        self.employees: List[Employee] = [Employee(i) for i in range(num_employees)]
        self.new_orders: List[Order] = []
        self.completed_orders: List[Order] = []
        self.tick: int = 0
        self.next_order_num: int = 1000
        self.sla_minutes = sla_minutes

    # ------------------------------------------------------------------
    # Simulation mechanics
    # ------------------------------------------------------------------
    def _generate_order_id(self) -> str:
        oid = f"A{self.next_order_num}"
        self.next_order_num += 1
        return oid

    def step(self) -> None:
        """Advance the simulation by one minute."""
        # Random arrivals (roughly 0.7 orders per minute)
        if self.rng.random() < 0.7:
            order = Order(self._generate_order_id(), self.tick)
            self.new_orders.append(order)

        # Progress work on current orders
        for emp in self.employees:
            if emp.current_order:
                emp.time_remaining -= 1
                if emp.time_remaining <= 0:
                    order = emp.current_order
                    if order.stage == "PICK":
                        order.stage = "STAGE"
                        emp.time_remaining = self.STAGE_DURATIONS["STAGE"]
                    elif order.stage == "STAGE":
                        order.stage = "SHIP"
                        emp.time_remaining = self.STAGE_DURATIONS["SHIP"]
                    elif order.stage == "SHIP":
                        order.stage = "COMPLETE"
                        order.complete_tick = self.tick
                        self.completed_orders.append(order)
                        emp.current_order = None

        # Assign idle employees to new work
        for emp in self.employees:
            if emp.idle and self.new_orders:
                order = self.new_orders.pop(0)
                order.stage = "PICK"
                emp.current_order = order
                emp.time_remaining = self.STAGE_DURATIONS["PICK"]

        self.tick += 1

    def run(self, ticks: int) -> None:
        for _ in range(ticks):
            self.step()

    # ------------------------------------------------------------------
    # Helpers for rendering
    # ------------------------------------------------------------------
    def _clock(self) -> str:
        h = self.tick // 60
        m = self.tick % 60
        return f"{h:02d}:{m:02d}"

    def _stage_lists(self):
        pick, stage, ship = [], [], []
        for e in self.employees:
            o = e.current_order
            if o:
                if o.stage == "PICK":
                    pick.append(o)
                elif o.stage == "STAGE":
                    stage.append(o)
                elif o.stage == "SHIP":
                    ship.append(o)
        return pick, stage, ship

    def _metrics(self):
        done = len(self.completed_orders)
        if done:
            on_time = sum(1 for o in self.completed_orders if (o.complete_tick - o.created_tick) <= self.sla_minutes)
            on_time_pct = on_time / done * 100
            avg_wait = sum(o.complete_tick - o.created_tick for o in self.completed_orders) / done
            orders_per_hr = done / max(self.tick / 60, 1e-9)
        else:
            on_time_pct = 0.0
            avg_wait = 0.0
            orders_per_hr = 0.0
        lane_q = len(self.new_orders)
        return on_time_pct, orders_per_hr, avg_wait, lane_q, self._clock()

    # ------------------------------------------------------------------
    # Rendering
    # ------------------------------------------------------------------
    def render(self, max_display: int = 6) -> str:
        """Return an ASCII Kanban board for the current state."""
        pick, stage, ship = self._stage_lists()
        on_time, oph, avg_wait, lane_q, clock = self._metrics()

        width = 84
        inner = width - 2

        def border() -> str:
            return "+" + "-" * inner + "+"

        def fmt_line(text: str) -> str:
            return "|" + text.ljust(inner) + "|"

        lines: List[str] = []
        lines.append(border())
        kpi = f"KPI BAR: {on_time:5.1f}% | {oph:9.1f} | {avg_wait:8.1f} | {lane_q:6d} | {clock}"
        lines.append(fmt_line(kpi))
        lines.append(border())
        emp_bar = "EMPLOYEES:  " + " ".join("[o]" if e.idle else "[ ]" for e in self.employees)
        lines.append(fmt_line(emp_bar))
        lines.append(border())
        lines.append("")  # blank line

        headers = [
            " NEW ORDERS   ",
            "   PICK        ",
            "   STAGE       ",
            "   SHIP        ",
            "   COMPLETE    ",
        ]
        col_widths = [14, 15, 15, 15, 15]
        header_content = "|".join(headers) + "|"
        lines.append(fmt_line(header_content))
        separators = [
            "--------------",
            "---------------",
            "---------------",
            "---------------",
            "---------------",
        ]
        sep_content = "|".join(separators) + "|"
        lines.append(fmt_line(sep_content))

        columns = [self.new_orders, pick, stage, ship, self.completed_orders]
        stage_names = ["NEW", "PICK", "STAGE", "SHIP", "COMPLETE"]

        def box_top(width: int) -> str:
            return " +" + "-" * 10 + "+" + " " * (width - 13)

        def box_content(text: str, width: int) -> str:
            return " |" + text + "|" + " " * (width - 13)

        def order_text(order: Order, stage: str) -> str:
            if stage == "NEW":
                return order.id.center(10)
            elif stage == "COMPLETE":
                return " " + f"[*] {order.id}".ljust(9)
            else:
                return " " + f"[o] {order.id}".ljust(9)

        for idx in range(max_display):
            # top border
            cells = []
            for col, w in zip(columns, col_widths):
                cells.append(box_top(w) if len(col) > idx else " " * w)
            lines.append(fmt_line("|".join(cells) + "|"))

            # content
            cells = []
            for col, w, stage in zip(columns, col_widths, stage_names):
                if len(col) > idx:
                    text = order_text(col[idx], stage)
                    cells.append(box_content(text, w))
                else:
                    cells.append(" " * w)
            lines.append(fmt_line("|".join(cells) + "|"))

            # bottom border
            cells = []
            for col, w in zip(columns, col_widths):
                cells.append(box_top(w) if len(col) > idx else " " * w)
            lines.append(fmt_line("|".join(cells) + "|"))

        # blank row
        blank = "|".join(" " * w for w in col_widths) + "|"
        lines.append(fmt_line(blank))

        # Overflow indicators (two lines)
        extra_new = max(len(self.new_orders) - max_display, 0)
        extra_complete = max(len(self.completed_orders) - max_display, 0)

        line1_cells: List[str] = []
        line2_cells: List[str] = []
        for idx, w in enumerate(col_widths):
            if idx == 0 and extra_new > 0:
                line1_cells.append(f" ({extra_new} more".ljust(w))
                line2_cells.append(" orders...)".ljust(w))
            elif idx == 4 and extra_complete > 0:
                line1_cells.append(f" ({extra_complete} more".ljust(w))
                line2_cells.append(" complete...)".ljust(w))
            else:
                line1_cells.append(" " * w)
                line2_cells.append(" " * w)
        lines.append(fmt_line("|".join(line1_cells) + "|"))
        lines.append(fmt_line("|".join(line2_cells) + "|"))

        return "\n".join(lines)
