#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_FILE="$DIR/node-red-mcp.pid"

if [ ! -f "$PID_FILE" ]; then
  echo "[node-red-mcp] No PID file found. Server may not be running."
  exit 0
fi

PID=$(cat "$PID_FILE")
if ps -p "$PID" > /dev/null 2>&1; then
  echo "[node-red-mcp] Stopping server (PID: $PID)..."
  kill "$PID" || true
  sleep 1
  if ps -p "$PID" > /dev/null 2>&1; then
    echo "[node-red-mcp] Forcing termination..."
    kill -9 "$PID" || true
  fi
  rm -f "$PID_FILE"
  echo "[node-red-mcp] Server stopped."
else
  echo "[node-red-mcp] Process $PID is not running. Cleaning up stale PID file."
  rm -f "$PID_FILE"
fi
