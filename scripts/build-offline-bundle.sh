#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DIR"

echo "========================================================"
echo " Building Offline Distribution Bundle for Node-RED MCP  "
echo "========================================================"

DIST_DIR="$DIR/dist"
mkdir -p "$DIST_DIR"
mkdir -p "$DIR/packages-pool"

VERSION=$(node -p "require('./package.json').version")
BUNDLE_NAME="node-red-mcp-bundle-v${VERSION}"
TARGET_ARCHIVE="$DIST_DIR/${BUNDLE_NAME}.tar.gz"

echo "📦 1. Ensuring production dependencies are installed..."
npm install --omit=dev --no-audit --no-fund

export COPYFILE_DISABLE=1

TAR_CMD=(tar)
if tar --help 2>&1 | grep -q -- '--no-xattrs'; then
  TAR_CMD+=(--no-xattrs)
fi

echo "📁 2. Packaging files into archive (filtering macOS xattrs)..."
# Exclude git, tests, temp caches, and unnecessary files
"${TAR_CMD[@]}" -czf "$TARGET_ARCHIVE" \
  --exclude='.git' \
  --exclude='.github' \
  --exclude='*.log' \
  --exclude='node-red-mcp.pid' \
  bin/ \
  lib/ \
  node_modules/ \
  packages-pool/ \
  start.sh \
  stop.sh \
  status.sh \
  update.sh \
  .env.example \
  package.json \
  README.md \
  LICENSE

echo "🔒 3. Computing SHA-256 Checksum..."
if command -v sha256sum >/dev/null 2>&1; then
  SHA256=$(sha256sum "$TARGET_ARCHIVE" | awk '{print $1}')
elif command -v shasum >/dev/null 2>&1; then
  SHA256=$(shasum -a 256 "$TARGET_ARCHIVE" | awk '{print $1}')
else
  SHA256="N/A"
fi

SIZE=$(ls -lh "$TARGET_ARCHIVE" | awk '{print $5}')

echo "========================================================"
echo "✅ Offline Bundle Created Successfully!"
echo "--------------------------------------------------------"
echo "Archive File:  $TARGET_ARCHIVE"
echo "Archive Size:  $SIZE"
echo "SHA-256 Hash:  $SHA256"
echo "========================================================"
echo ""
echo "🚀 Deployment Instructions:"
echo "1. Transfer the bundle to your target Node-RED server:"
echo "   scp $TARGET_ARCHIVE user@your-server:/opt/"
echo ""
echo "2. On the server, extract and enter directory:"
echo "   mkdir -p /opt/node-red-mcp && tar -xzf ${BUNDLE_NAME}.tar.gz -C /opt/node-red-mcp"
echo "   cd /opt/node-red-mcp"
echo ""
echo "3. Configure environment and start:"
echo "   cp .env.example .env"
echo "   # Edit .env with your Node-RED settings"
echo "   ./start.sh -d"
echo ""
echo "4. Connect AI to the server via SSE (http://<server-ip>:3000/sse) or SSH Stdio!"
echo "========================================================"
