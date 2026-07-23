#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_dir"

finance_qa_python="${FINANCE_QA_PYTHON:-}"
if [[ -z "$finance_qa_python" ]]; then
  if [[ -x "$repo_dir/.venv/bin/python" ]]; then
    finance_qa_python="$repo_dir/.venv/bin/python"
  else
    finance_qa_python="$(command -v python3)"
  fi
fi

exec "$finance_qa_python" -m finance_qa.full_stack_runner "$@"
