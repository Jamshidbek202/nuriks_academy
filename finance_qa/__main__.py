"""Command-line entry point for deterministic finance QA campaigns."""

import argparse
import json
from pathlib import Path

from .role_audit import audit_finance_routes
from .runner import REPO_ROOT, run_scenario_file, run_stress_campaign, scenario_files


def main() -> int:
    parser = argparse.ArgumentParser(description="Run Nurik's Academy finance QA")
    parser.add_argument("--scenario", action="append", type=Path, help="Scenario JSON file; may be repeated")
    parser.add_argument("--stress", type=int, default=0, help="Number of deterministic generated cases")
    parser.add_argument("--seed", type=int, default=202608, help="Stress campaign seed")
    parser.add_argument("--report", type=Path, help="Optional JSON report output path")
    args = parser.parse_args()

    selected = args.scenario or scenario_files()
    scenario_reports = [run_scenario_file(path) for path in selected]
    role_report = audit_finance_routes(REPO_ROOT / "backend" / "routes_finance.py")
    if role_report["problems"]:
        raise SystemExit("Finance role audit failed:\n- " + "\n- ".join(role_report["problems"]))
    report = {
        "status": "passed",
        "scenario_count": len(scenario_reports),
        "scenario_assertion_count": sum(row["assertion_count"] for row in scenario_reports),
        "scenarios": scenario_reports,
        "role_audit": role_report,
        "stress": run_stress_campaign(args.seed, args.stress) if args.stress else None,
    }
    serialized = json.dumps(report, indent=2, sort_keys=True)
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(serialized + "\n", encoding="utf-8")
    print(serialized)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
