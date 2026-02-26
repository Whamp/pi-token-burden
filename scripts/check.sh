#!/usr/bin/env bash
set -uo pipefail

errors=0

run() {
  local name="$1"; shift
  echo "=== $name ==="
  if "$@"; then
    echo "  PASS"
  else
    echo "  FAIL"
    ((errors++))
  fi
  echo
}

run "Lint"         pnpm run lint
run "Typecheck"    pnpm run typecheck
run "Format"       pnpm run format:check
run "Dead code"    pnpm run deadcode
run "Duplicates"   pnpm run duplicates
run "Secrets"      pnpm run secrets
run "Test"         pnpm run test

echo "=== Summary ==="
if [ "$errors" -eq 0 ]; then
  echo "All checks passed."
else
  echo "$errors check(s) failed."
  exit 1
fi
