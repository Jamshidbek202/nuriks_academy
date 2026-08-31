"""One-command whole-app, deterministic finance, transactional, and browser QA."""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import selectors
import shutil
import subprocess
import sys
import time


REPO_ROOT = Path(__file__).resolve().parents[1]
COMPOSE_FILE = REPO_ROOT / "docker-compose.finance-qa.yml"
REPORT_ROOT = REPO_ROOT / "test_reports" / "finance-qa"


class StageFailure(RuntimeError):
    pass


def run_stage(report: dict, name: str, command: list[str], env: dict, cwd: Path) -> None:
    started = time.monotonic()
    print(f"\n[finance-qa] {name}", flush=True)
    completed = subprocess.run(command, cwd=cwd, env=env, check=False)
    stage = {
        "name": name,
        "command": command,
        "exit_code": completed.returncode,
        "duration_seconds": round(time.monotonic() - started, 3),
    }
    report["stages"].append(stage)
    if completed.returncode != 0:
        raise StageFailure(f"{name} failed with exit code {completed.returncode}")


def start_ephemeral_mongo(report: dict, env: dict):
    if not shutil.which("node"):
        raise StageFailure("Neither Docker nor Node.js is available for disposable MongoDB")
    launcher = REPO_ROOT / "finance_qa" / "start_ephemeral_mongo.mjs"
    dependency = REPO_ROOT / "frontend" / "node_modules" / "mongodb-memory-server"
    if not dependency.exists():
        raise StageFailure(
            "mongodb-memory-server is not installed; run npm install in frontend"
        )
    print("\n[finance-qa] start embedded disposable MongoDB replica set", flush=True)
    started = time.monotonic()
    process = subprocess.Popen(
        ["node", str(launcher)],
        cwd=REPO_ROOT,
        env=env,
        stdout=subprocess.PIPE,
        stderr=None,
        text=True,
    )
    assert process.stdout is not None
    mongo_url = None
    deadline = time.monotonic() + 240
    selector = selectors.DefaultSelector()
    selector.register(process.stdout, selectors.EVENT_READ)
    while time.monotonic() < deadline:
        events = selector.select(timeout=1)
        if process.poll() is not None and not events:
            break
        for key, _ in events:
            line = key.fileobj.readline()
            if line.startswith("FINANCE_QA_MONGO_URL="):
                mongo_url = line.strip().split("=", 1)[1]
                break
        if mongo_url:
            break
    selector.close()
    if not mongo_url:
        process.terminate()
        raise StageFailure("Embedded disposable MongoDB replica set did not become ready")
    report["stages"].append({
        "name": "start embedded disposable MongoDB replica set",
        "command": ["node", str(launcher)],
        "exit_code": 0,
        "duration_seconds": round(time.monotonic() - started, 3),
    })
    return process, mongo_url


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--skip-browser-install",
        action="store_true",
        help="Use when Playwright Chromium is already installed",
    )
    parser.add_argument(
        "--app-grep",
        help="Run only whole-app browser tests whose title matches this Playwright grep pattern",
    )
    parser.add_argument(
        "--skip-app-browser",
        action="store_true",
        help="Skip whole-app Playwright journeys while retaining the finance-wide browser reconciliation",
    )
    args = parser.parse_args()

    run_id = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    database_name = f"nurik_academy_finance_qa_{run_id.lower()}_{os.getpid()}"
    python = sys.executable
    env = os.environ.copy()
    env.update({
        "APP_ENV": "finance_qa",
        "DISABLE_SCHEDULER": "1",
        "RUN_FINANCE_MONGO_QA": "1",
        "RUN_FINANCE_E2E": "1",
        "RUN_APP_E2E": "1",
        "DB_NAME": database_name,
        "MONGO_TLS": "false",
        "SECRET_KEY": "finance-qa-only-secret-not-for-production",
        "TELEGRAM_DELIVERY_MODE": "mock",
        "TELEGRAM_BOT_USERNAME": "nuriksacademy_bot",
        "TELEGRAM_WEBHOOK_SECRET": "nuriks-finance-qa-webhook-secret",
        "PYTHONPATH": str(REPO_ROOT / "backend"),
        "FINANCE_QA_PYTHON": python,
        "EXPO_PUBLIC_BACKEND_URL": "http://127.0.0.1:8001",
    })
    report = {
        "run_id": run_id,
        "database": database_name,
        "mongo_url": "mongodb://127.0.0.1:27018/<redacted>",
        "started_at": datetime.now(timezone.utc).isoformat(),
        "status": "running",
        "stages": [],
    }
    REPORT_ROOT.mkdir(parents=True, exist_ok=True)
    report_path = REPORT_ROOT / f"{run_id}.json"
    compose_command = ["docker", "compose", "-f", str(COMPOSE_FILE)]
    mongo_process = None
    using_docker = bool(shutil.which("docker"))

    try:
        if using_docker:
            env["MONGO_URL"] = "mongodb://127.0.0.1:27018/?replicaSet=rs0&directConnection=true"
            report["database_backend"] = "docker-mongodb-replica-set"
            run_stage(
                report,
                "start disposable MongoDB replica set",
                [*compose_command, "up", "-d", "--wait"],
                env,
                REPO_ROOT,
            )
        else:
            report["database_backend"] = "embedded-mongodb-replica-set"
            mongo_process, mongo_url = start_ephemeral_mongo(report, env)
            env["MONGO_URL"] = mongo_url
        run_stage(
            report,
            "deterministic 5,000-case finance gate",
            [
                python,
                str(REPO_ROOT / ".agents/skills/study-centre-finance-qa/scripts/run_finance_qa.py"),
                "--stress",
                "5000",
                "--seed",
                "202608",
            ],
            env,
            REPO_ROOT,
        )
        run_stage(
            report,
            "backend unit, role, and transactional MongoDB integration suite",
            [python, "-m", "unittest", "discover", "-s", "tests", "-v"],
            env,
            REPO_ROOT,
        )
        run_stage(
            report,
            "phone invitation, role provisioning, and password recovery suite",
            [python, str(REPO_ROOT / "finance_qa/phone_auth_runner.py")],
            env,
            REPO_ROOT,
        )
        run_stage(
            report,
            "reset and seed isolated whole-app browser database",
            [python, "-m", "finance_qa.mongo_support", "--reset", "--browser"],
            env,
            REPO_ROOT,
        )
        if not args.skip_browser_install:
            run_stage(
                report,
                "install Playwright Chromium",
                ["npx", "playwright", "install", "chromium"],
                env,
                REPO_ROOT / "frontend",
            )
        if not args.skip_app_browser:
            app_browser_command = ["npm", "run", "test:app-e2e"]
            if args.app_grep:
                app_browser_command.extend(["--", "--grep", args.app_grep])
            run_stage(
                report,
                "all-role desktop and phone whole-app browser suite",
                app_browser_command,
                env,
                REPO_ROOT / "frontend",
            )
        run_stage(
            report,
            "reset finance browser database after whole-app mutations",
            [python, "-m", "finance_qa.mongo_support", "--reset", "--browser"],
            env,
            REPO_ROOT,
        )
        run_stage(
            report,
            "five-session finance-wide live browser reconciliation",
            ["npm", "run", "test:finance-e2e"],
            env,
            REPO_ROOT / "frontend",
        )
        run_stage(
            report,
            "frontend TypeScript",
            ["npx", "tsc", "--noEmit"],
            env,
            REPO_ROOT / "frontend",
        )
        run_stage(
            report,
            "frontend lint",
            ["npm", "run", "lint"],
            env,
            REPO_ROOT / "frontend",
        )
        run_stage(
            report,
            "frontend production build",
            ["npm", "run", "build"],
            env,
            REPO_ROOT / "frontend",
        )
        report["status"] = "passed"
    except Exception as error:
        report["status"] = "failed"
        report["error"] = str(error)
        raise
    finally:
        if using_docker:
            subprocess.run(
                [*compose_command, "down", "--volumes", "--remove-orphans"],
                cwd=REPO_ROOT,
                env=env,
                check=False,
            )
        elif mongo_process is not None:
            mongo_process.terminate()
            try:
                mongo_process.wait(timeout=30)
            except subprocess.TimeoutExpired:
                mongo_process.kill()
                mongo_process.wait(timeout=10)
        report["finished_at"] = datetime.now(timezone.utc).isoformat()
        report_path.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
        print(f"[finance-qa] report: {report_path}", flush=True)


if __name__ == "__main__":
    main()
