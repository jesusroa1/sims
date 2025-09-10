from __future__ import annotations

import argparse

from simulator import WarehouseSimulation


def main() -> None:
    parser = argparse.ArgumentParser(description="Run warehouse simulation and print ASCII board")
    parser.add_argument("--ticks", type=int, default=360, help="Simulation duration in minutes")
    parser.add_argument("--seed", type=int, default=42, help="Random seed")
    args = parser.parse_args()

    sim = WarehouseSimulation(seed=args.seed)
    sim.run(args.ticks)
    print(sim.render())


if __name__ == "__main__":
    main()
