from __future__ import annotations

import argparse
from pathlib import Path

import pandas as pd

from simulator import SimulationConfig, simulate


def main() -> None:
    parser = argparse.ArgumentParser(description="Run warehouse simulation and output DataFrames")
    parser.add_argument("--hours", type=float, default=24.0, help="Simulation horizon in hours")
    parser.add_argument("--sla-hours", type=float, default=4.0, help="SLA threshold in hours")
    parser.add_argument("--arrive-mean", type=float, default=300.0, help="Mean arrival rate (orders/hour)")
    parser.add_argument("--arrive-std", type=float, default=60.0, help="Std dev of arrival rate (orders/hour)")
    parser.add_argument("--pick-mean", type=float, default=300.0, help="Mean pick capacity (orders/hour)")
    parser.add_argument("--pick-std", type=float, default=60.0, help="Std dev of pick capacity (orders/hour)")
    parser.add_argument("--seed", type=int, default=42, help="Random seed (int)")
    parser.add_argument("--outdir", type=str, default="output", help="Output directory (relative to sims)")

    args = parser.parse_args()

    cfg = SimulationConfig(
        hours=args.hours,
        sla_hours=args.sla_hours,
        arrival_rate_mean_per_hour=args.arrive_mean,
        arrival_rate_std_per_hour=args.arrive_std,
        pick_rate_mean_per_hour=args.pick_mean,
        pick_rate_std_per_hour=args.pick_std,
        seed=args.seed,
    )

    tick_df, orders_df = simulate(cfg)

    # Ensure outdir exists
    outdir = Path(__file__).parent / args.outdir
    outdir.mkdir(parents=True, exist_ok=True)

    tick_path = outdir / "tick_metrics.csv"
    orders_path = outdir / "orders.csv"

    tick_df.to_csv(tick_path, index=False)
    orders_df.to_csv(orders_path, index=False)

    print("Wrote:")
    print(f" - {tick_path}")
    print(f" - {orders_path}")
    print("\nTick metrics (head):")
    print(tick_df.head())
    print("\nOrders (head):")
    print(orders_df.head())


if __name__ == "__main__":
    main()
