#!/usr/bin/env bash

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_FILE="$DIR/node-red-mcp.pid"

if [ -f "$PID_FILE" ]; then
  PID=$(cat "$PID_FILE")
  if ps -p "$PID" > /dev/null 2>&1; then
    echo "● node-red-mcp is RUNNING (PID: $PID)"
    if [ -f .env ]; then
      set -a; source .env; set +a
    fi
    PORT="${MCP_PORT:-3000}"
    if curl -s "http://127.0.0.1:${PORT}/health" >/dev/null 2>&1; then
      echo "  Health Check: OK (http://127.0.0.1:${PORT}/health)"
    fi
    exit 0
  else
    echo "○ node-red-mcp is STOPPED (stale PID file found)"
    exit 1
  fi
else
  echo "○ node-red-mcp is STOPPED"
  exit 3
fi
