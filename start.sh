#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

# Load .env if it exists (Node.js also loads it automatically via dotenv)
if [ -f .env ]; then
  echo "[node-red-mcp] Loading configuration from .env..."
  set +e
  set -a
  source .env 2>/dev/null || true
  set +a
  set -e
fi

PID_FILE="$DIR/node-red-mcp.pid"
LOG_FILE="$DIR/node-red-mcp.log"

if [ -f "$PID_FILE" ]; then
  PID=$(cat "$PID_FILE")
  if ps -p "$PID" > /dev/null 2>&1; then
    echo "[node-red-mcp] Server is already running with PID $PID."
    exit 0
  else
    rm -f "$PID_FILE"
  fi
fi

# Determine execution mode (daemon vs foreground)
DAEMON_MODE=false
for arg in "$@"; do
  if [ "$arg" == "-d" ] || [ "$arg" == "--daemon" ]; then
    DAEMON_MODE=true
  fi
done

if [ "$DAEMON_MODE" = true ]; then
  echo "[node-red-mcp] Starting in daemon mode (logging to $LOG_FILE)..."
  nohup node bin/node-red-mcp-server.mjs "$@" >> "$LOG_FILE" 2>&1 &
  echo $! > "$PID_FILE"
  echo "[node-red-mcp] Server started with PID $(cat "$PID_FILE")."
else
  echo "[node-red-mcp] Starting in foreground mode..."
  exec node bin/node-red-mcp-server.mjs "$@"
fi
