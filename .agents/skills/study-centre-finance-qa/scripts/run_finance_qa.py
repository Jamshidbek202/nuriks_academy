#!/usr/bin/env python3
"""Run the repository's deterministic finance QA command from any directory."""

import sys
from pathlib import Path


def find_repository(start: Path) -> Path:
    for candidate in (start, *start.parents):
        if (candidate / "finance_qa").is_dir() and (candidate / "backend" / "finance_domain.py").is_file():
            return candidate
    raise SystemExit("Could not locate the Nurik's Academy repository root")


def main() -> int:
    # Anchor discovery to the checked-in skill so invocation also works when
    # the caller's current directory is outside the repository.
    repository = find_repository(Path(__file__).resolve())
    sys.path.insert(0, str(repository))
    sys.path.insert(0, str(repository / "backend"))
    from finance_qa.__main__ import main as run

    return run()


if __name__ == "__main__":
    raise SystemExit(main())
