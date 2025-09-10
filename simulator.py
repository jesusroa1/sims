from __future__ import annotations

from dataclasses import dataclass
from typing import Optional, Tuple, List, Dict

import numpy as np
import pandas as pd


@dataclass
class SimulationConfig:
    # Simulation horizon
    hours: float = 24.0
    tick_minutes: int = 1  # discrete time step in minutes

    # SLA for on-time definition (hours)
    sla_hours: float = 4.0

    # Arrivals (orders/hour) ~ Normal(mean, std)
    arrival_rate_mean_per_hour: float = 300.0
    arrival_rate_std_per_hour: float = 60.0

    # Picking capacity (orders/hour) ~ Normal(mean, std)
    pick_rate_mean_per_hour: float = 300.0
    pick_rate_std_per_hour: float = 60.0

    # Random seed for reproducibility (optional)
    seed: Optional[int] = 42


def _draw_nonnegative_int_normal(mean: float, std: float, rng: np.random.Generator) -> int:
    # Draw a single normal, convert to int counts (round to nearest), clamp to >= 0
    val = rng.normal(loc=mean, scale=std)
    # Round to nearest integer; if std is 0, val is deterministic
    count = int(np.rint(val))
    return max(0, count)


def simulate(config: SimulationConfig) -> Tuple[pd.DataFrame, pd.DataFrame]:
    """Run the warehouse simulation.

    Returns:
        tick_df: Per-tick metrics DataFrame with arrivals, capacity, picked, backlog, etc.
        orders_df: Per-order records with creation/pick times, dwell, on_time flag.
    """
    if config.seed is not None:
        rng = np.random.default_rng(config.seed)
    else:
        rng = np.random.default_rng()

    total_minutes = int(config.hours * 60)
    sla_minutes = int(config.sla_hours * 60)

    # Convert per-hour rates to per-tick (per-minute) rates
    arrival_mean_per_tick = config.arrival_rate_mean_per_hour / 60.0
    arrival_std_per_tick = config.arrival_rate_std_per_hour / 60.0
    pick_mean_per_tick = config.pick_rate_mean_per_hour / 60.0
    pick_std_per_tick = config.pick_rate_std_per_hour / 60.0

    # State: FIFO queue of order creation times (in minutes)
    queue: List[int] = []

    # Per-order records we will populate when orders are picked
    order_created_times: List[int] = []
    order_picked_times: List[int] = []

    # Per-tick metrics
    rows: List[Dict] = []
    cumulative_arrived = 0
    cumulative_picked = 0
    cumulative_on_time = 0

    # Simulate minute-by-minute
    for minute in range(0, total_minutes, config.tick_minutes):
        # Arrivals this tick
        arrivals = _draw_nonnegative_int_normal(arrival_mean_per_tick, arrival_std_per_tick, rng)
        for _ in range(arrivals):
            queue.append(minute)
        cumulative_arrived += arrivals

        # Capacity this tick
        capacity = _draw_nonnegative_int_normal(pick_mean_per_tick, pick_std_per_tick, rng)

        # Serve FIFO queue up to capacity
        picked_this_tick = 0
        on_time_this_tick = 0
        dwell_times: List[int] = []
        while picked_this_tick < capacity and queue:
            created_min = queue.pop(0)
            dwell = minute - created_min
            dwell_times.append(dwell)
            order_created_times.append(created_min)
            order_picked_times.append(minute)
            picked_this_tick += 1
            cumulative_picked += 1
            if dwell <= sla_minutes:
                on_time_this_tick += 1
                cumulative_on_time += 1

        backlog = len(queue)
        effective_throughput_per_hour = (cumulative_picked / max((minute + 1), 1)) * 60.0

        # Running average dwell time among picked so far
        if len(order_created_times) > 0:
            avg_dwell_so_far = np.mean(np.array(order_picked_times) - np.array(order_created_times))
        else:
            avg_dwell_so_far = np.nan

        on_time_pct_cum = (cumulative_on_time / cumulative_picked * 100.0) if cumulative_picked > 0 else np.nan

        rows.append(
            {
                "tick_min": minute,
                "arrivals": arrivals,
                "capacity": capacity,
                "picked": picked_this_tick,
                "backlog": backlog,
                "cum_arrivals": cumulative_arrived,
                "cum_picked": cumulative_picked,
                "cum_on_time": cumulative_on_time,
                "on_time_pct_cum": on_time_pct_cum,
                "avg_dwell_min_cum": avg_dwell_so_far,
                "effective_throughput_per_hour": effective_throughput_per_hour,
            }
        )

    tick_df = pd.DataFrame(rows)

    # Build per-order DataFrame
    if order_created_times:
        od = pd.DataFrame(
            {
                "created_min": order_created_times,
                "picked_min": order_picked_times,
            }
        )
        od["dwell_min"] = od["picked_min"] - od["created_min"]
        od["on_time"] = od["dwell_min"] <= sla_minutes
        orders_df = od
    else:
        orders_df = pd.DataFrame(columns=["created_min", "picked_min", "dwell_min", "on_time"])  # empty

    return tick_df, orders_df


def default_run() -> Tuple[pd.DataFrame, pd.DataFrame]:
    """Convenience: run with default config and return DataFrames."""
    cfg = SimulationConfig()
    return simulate(cfg)


if __name__ == "__main__":
    tdf, odf = default_run()
    # Print quick summary
    print("Per-tick metrics (head):")
    print(tdf.head())
    print("\nPer-order records (head):")
    print(odf.head())
