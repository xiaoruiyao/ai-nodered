#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

ARCHIVE="$1"

# Auto-detect bundle in /opt or current directory if not specified
if [ -z "$ARCHIVE" ]; then
  if [ -f "/opt/node-red-mcp-bundle-v1.1.0.tar.gz" ]; then
    ARCHIVE="/opt/node-red-mcp-bundle-v1.1.0.tar.gz"
  else
    ARCHIVE=$(ls -t /opt/node-red-mcp-bundle-*.tar.gz 2>/dev/null | head -n 1 || true)
  fi
fi

if [ -z "$ARCHIVE" ] || [ ! -f "$ARCHIVE" ]; then
  echo "❌ Error: Update package archive not found!"
  echo "Usage: ./update.sh <path-to-bundle.tar.gz>"
  echo "Example: ./update.sh /opt/node-red-mcp-bundle-v1.1.0.tar.gz"
  exit 1
fi

echo "========================================================"
echo " Updating Node-RED MCP Server..."
echo " Package: $ARCHIVE"
echo " Target:  $DIR"
echo "========================================================"

# 1. Stop service gracefully
if [ -f "./stop.sh" ]; then
  echo "🛑 1. Stopping running service..."
  ./stop.sh || true
fi

# 2. Extract and overwrite program files (safely preserves .env and logs)
echo "📦 2. Overwriting program files..."
tar -xzf "$ARCHIVE" -C "$DIR"

# 3. Restart service in daemon mode
echo "🚀 3. Restarting service..."
./start.sh -d

# 4. Check status
echo "🔍 4. Verifying service status..."
sleep 1
./status.sh

echo "========================================================"
echo "✅ Update completed successfully!"
echo "========================================================"
