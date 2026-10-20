# Offline Packaging & Sandbox Hot-Deployment Guide

## Problem Analysis: Why `npm install --offline` Fails in Host Directories

When executing `npm install <package.tgz>` directly inside a production Node-RED user directory (e.g., `/home/nodered/.node-red`), npm executes **dependency tree reconciliation**.

### The Root Cause: Tree Reconciliation Conflict
1. The host user directory already has pre-installed modules (e.g., `node-opcua`).
2. Even if `node-opcua` is not related to the new package, npm reads `/home/nodered/.node-red/node_modules/node-opcua/package.json`, which specifies a range dependency such as `"semver": "^7.8.5"`.
3. When npm tries to satisfy the range `^7.8.5`, it searches npm's local cache.
4. If `semver` is not part of the cache bundled with the new package, npm attempts to query `registry.npmjs.org`.
5. In an offline environment or with `--offline`, npm immediately aborts with:
   ```
   npm error code ENOTCACHED
   npm error request to https://registry.npmjs.org/semver failed: cache mode is 'only-if-cached' but no cached response available.
   ```

---

## The Solution: Staging Sandbox Prefix Isolation

To make offline module installation 100% reliable regardless of what existing modules are installed on the server:

```
[Uploaded Bundle: pkg-xyz.tar.gz]
               │
               ▼
   Extract to /tmp/staging/
               │
               ├─► Isolated Prefix: /tmp/staging/isolated_install/
               │     ├── package.json ({ "name": "staging-install", "private": true })
               │     └── npm install <file.tgz> --cache ... --offline --legacy-peer-deps
               │
               ▼ (Success! Fresh, clean node_modules generated)
   fs.cpSync(/tmp/staging/isolated_install/node_modules, /home/nodered/.node-red/node_modules)
               │
               ▼
   Node-RED Hot-Reload or systemctl restart nodered
```

### Key Implementation in `lib/installer/install-executor.mjs`:
```javascript
// 1. Create clean isolated staging prefix
const stagingPrefix = path.join(tmpDir, 'isolated_install');
fs.mkdirSync(stagingPrefix, { recursive: true });
fs.writeFileSync(path.join(stagingPrefix, 'package.json'), JSON.stringify({
  name: 'staging-install',
  version: '1.0.0',
  private: true
}));

// 2. Run install isolated from host dependencies
const cmd = `npm install "${targetTgzPath}" --cache "${cacheDir}" --offline --prefer-offline --no-audit --no-fund --legacy-peer-deps --prefix "${stagingPrefix}"`;
execSync(cmd, { env: { ...process.env, npm_config_cache: cacheDir } });

// 3. Sync clean node_modules tree to userDir
const isolatedModules = path.join(stagingPrefix, 'node_modules');
if (fs.existsSync(isolatedModules)) {
  fs.cpSync(isolatedModules, path.join(userDir, 'node_modules'), {
    recursive: true,
    force: true
  });
}
```

---

## One-Command Deployment Script: `bin/deploy-module.mjs`

Usage:
```bash
node bin/deploy-module.mjs @flowfuse/node-red-dashboard
```

Workflow executed by `deploy-module.mjs`:
1. Packs the npm module with `--cache` locally into `packages-pool/`.
2. Connects to `http://10.60.93.10` with `MCP_API_KEY`.
3. Streams the tarball over HTTP `POST /api/upload-package?filename=...&sha256=...`.
4. Invokes MCP tool `install_node_module` with SHA-256 verification and hot-reloading.
5. Invokes MCP tool `check_node_module` to verify that all nodes are registered and active.
