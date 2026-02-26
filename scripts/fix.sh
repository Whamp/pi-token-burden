#!/usr/bin/env bash
set -euo pipefail

echo "=== Lint fix ==="
pnpm run lint:fix

echo "=== Format ==="
pnpm run format

echo "Done. Run 'pnpm run check' to verify."
