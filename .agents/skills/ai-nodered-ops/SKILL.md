---
name: ai-nodered-ops
description: >-
  Expert operational runbook and procedure guide for managing offline industrial Node-RED MCP servers,
  hot-deploying offline plugins across air-gapped zero-trust network tunnels, orchestrating industrial protocols
  (Modbus TCP/RTU, OPC UA, MQTT, Siemens S7), and developing 3D WebGL / Dashboard 2.0 digital twin cockpits.
  Use when developing, debugging, packaging, or operating industrial Node-RED flows and MCP server components.
---

# AI Node-RED Industrial Operations & Digital Twin Skill

This skill provides comprehensive operational procedures, architectural patterns, and troubleshooting playbooks for developing, deploying, and operating offline enterprise Node-RED instances connected via Model Context Protocol (MCP).

## Core Architecture Overview

```
┌─────────────────────────────────┐           ┌──────────────────────────────────────────────┐
│ Local Development Host (macOS)  │           │ Remote Industrial Host (Ubuntu 10.60.93.10)  │
│                                 │  HTTP:80  │                                              │
│  • Antigravity / Claude / Cursor│──────────►│  • Nginx Reverse Proxy (:80)                 │
│  • bin/deploy-module.mjs        │ (Tunnel)  │     │                                        │
│  • bin/call-remote-mcp.mjs      │           │     ├──► /sse, /messages, /api/upload-package│
│                                 │           │     │    └──► MCP Server (Node.js :3000)     │
│  • SOCKS5 Proxy (:10808)        │           │     │                                        │
│     └──► GitHub SSH Push        │           │     └──► /dashboard/, /flows, /auth/token    │
│                                 │           │          └──► Node-RED Runtime (:1880)       │
└─────────────────────────────────┘           └──────────────────────────────────────────────┘
```

---

## 1. Quick Operations Reference

| Operation | Command / Procedure | References |
| :--- | :--- | :--- |
| **Call Remote MCP Tool** | `node bin/call-remote-mcp.mjs <tool-name> [args-json]` | [CLI Helper](file:///Users/yaoxiaorui/work/ai-nodered/bin/call-remote-mcp.mjs) |
| **Inspect Flow Topology** | `node bin/call-remote-mcp.mjs get-flows` | [Flows Reference](./references/dashboard2-and-3d-twins.md) |
| **Deploy Offline Plugin** | `node bin/deploy-module.mjs <npm-module-name>` | [Packaging Guide](./references/offline-packaging-and-hotfix.md) |
| **Check Installed Module** | `node bin/call-remote-mcp.mjs check_node_module '{"module":"<pkg>"}'` | [Protocol Guide](./references/industrial-protocols-guide.md) |
| **Check MCP Server Health** | `curl -s http://10.60.93.10/health` | [Nginx Setup](file:///Users/yaoxiaorui/work/ai-nodered/docs/DEPLOYMENT_GUIDE.md) |
| **Push Git via SOCKS5** | `git push -u origin main` (uses `core.sshCommand`) | Git config |

---

## 2. Standard Procedures

### Procedure A: Packaging and Installing Offline Industrial Plugins
When the user asks to install an industrial protocol node (e.g. `node-red-contrib-modbus`, `node-red-contrib-opcua`, `@flowfuse/node-red-dashboard`):

1. **Verify if already installed**:
   ```bash
   node bin/call-remote-mcp.mjs check_node_module '{"module":"<package-name>"}'
   ```
2. **If missing, package locally and stream to remote**:
   ```bash
   node bin/deploy-module.mjs <package-name>
   ```
3. **Sandbox Isolation Rule (Critical)**:
   - Always install the `.tgz` inside an isolated temporary directory (`tmpStaging/isolated_install`) using `--cache` and `--offline`.
   - Copy the extracted `node_modules` into `/home/nodered/.node-red/node_modules/` via `fs.cpSync`.
   - Never run `npm install <file.tgz>` directly inside `/home/nodered/.node-red` because pre-existing dependencies (like `node-opcua`'s `semver: ^7.8.5`) trigger registry lookups causing `ENOTCACHED` failures.
   - See detailed analysis in [offline-packaging-and-hotfix.md](./references/offline-packaging-and-hotfix.md).

### Procedure B: Modifying and Pushing Node-RED Flows
When adding dashboards, digital twins, or data processing logic:

1. **Retrieve current flow safely**:
   ```bash
   node bin/call-remote-mcp.mjs get-flows
   ```
2. **Preserve existing operational tabs**:
   - Never overwrite or drop existing tabs like `fa0c376a4bdd132c` (`焊装_焊接群控MQTT`) or database nodes (`postgresql`).
   - Only add or update nodes in the target tab or config nodes (`ui-base`, `ui-theme`, `ui-page`, `ui-group`).
3. **Deploy via MCP**:
   ```bash
   node bin/call-remote-mcp.mjs update-flows '{"flowsJson": "<escaped-json>"}'
   ```
4. **Validate Route Mounting**:
   - Dashboard 2.0 does NOT mount `/dashboard` until at least one `ui-base`, `ui-page`, and widget node are deployed.
   - Verify HTTP status: `curl -s -I http://10.60.93.10:1880/dashboard/welding` (must return HTTP 200).

### Procedure C: Building 3D Digital Twin Cockpits
When implementing 3D visualization or real-time simulation:

1. **Zero External CDN Rule**:
   - Due to strict CSP and air-gapped production firewalls, all 3D canvas and WebGL engines must be 100% self-contained.
   - Never import external CDN scripts (`cdnjs`, `unpkg`, `cdn.jsdelivr.net`).
2. **Vue 3 SFC in `ui-template`**:
   - Encapsulate 3D Canvas rendering inside `mounted()` using `requestAnimationFrame`.
   - Implement `ResizeObserver` to adapt to dashboard grid changes.
   - Bind incoming telemetry reactively using `watch: { msg(newVal) { ... } }`.
   - Provide camera orbit controls (mouse drag rotation, wheel zoom) and reset view handlers.
   - See template implementation in [dashboard2-and-3d-twins.md](./references/dashboard2-and-3d-twins.md).

---

## 3. Industrial Protocols Quick Guide

- **Modbus (TCP / RTU / ASCII)**:
  - Provided by `node-red-contrib-modbus` (installed on server, v5.45.2).
  - Use `modbus-client` for connection pool.
  - Use `modbus-read` for fixed polling, `modbus-flex-getter` for dynamic addressing.
  - Use `modbus-server` for built-in simulation when hardware is unavailable.
- **MQTT & Bosch Weld Timer**:
  - Topics: `WeldLog`, `WeldLogMB1`, `WeldLogMB3`, `WeldLogRB`.
  - Payloads contain `CurrentCurve`, `VoltageCurve`, `ForceCurve`, and `measureState`.
- See full protocol mappings in [industrial-protocols-guide.md](./references/industrial-protocols-guide.md).
