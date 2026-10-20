#!/usr/bin/env bash
# Quick helper to call remote MCP tools from workspace root

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

TOOL="${1:-get-flows}"
ARGS="${2:-{}}"

node "$PROJECT_ROOT/bin/call-remote-mcp.mjs" "$TOOL" "$ARGS"
