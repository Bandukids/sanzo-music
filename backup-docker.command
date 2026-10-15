#!/bin/zsh
set -eu
cd "$(dirname "$0")"
export PATH="/opt/homebrew/opt/node@24/bin:/opt/homebrew/bin:$PATH"
if command -v node >/dev/null 2>&1; then
  NODE_BIN="$(command -v node)"
else
  NODE_BIN="/Users/chutzpah/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"
fi
exec "$NODE_BIN" scripts/backup-docker.mjs
