# Node-RED MCP 服务生产级部署与网络配置指南

本文档详细记录基于 **“本地构建 ➔ 离线拷贝 ➔ 服务器自运行 ➔ 零信任/反代穿透 ➔ AI 联通”** 的企业级落地全流程，特别针对工控隔离网（Air-gapped）、深信服 aTrust 零信任网络以及 Nginx / OpenResty 反向代理场景进行了深度调优。

---

## 目录
1. [系统整体架构与网络拓扑](#1-系统整体架构与网络拓扑)
2. [本地打包构建（联网开发机）](#2-本地打包构建联网开发机)
3. [服务器端解压与配置（离线目标机）](#3-服务器端解压与配置离线目标机)
4. [服务启停与运维管理](#4-服务启停与运维管理)
5. [Nginx / Nginx Proxy Manager 反向代理配置](#5-nginx--nginx-proxy-manager-反向代理配置)
6. [深信服 aTrust 零信任网络穿透策略](#6-深信服-atrust-零信任网络穿透策略)
7. [AI 客户端连接配置指南](#7-ai-客户端连接配置指南)
8. [离线插件生命周期管理（制作、分发、安装）](#8-离线插件生命周期管理制作分发安装)
9. [高频问题与排查手册（FAQ）](#9-高频问题与排查手册faq)

---

## 1. 系统整体架构与网络拓扑

```text
┌────────────────────────┐                   ┌───────────────────────────────────────────────┐
│     AI 客户端 (本机)    │                   │          Ubuntu 目标服务器 (10.60.93.10)        │
│                        │                   │                                               │
│  Antigravity / Claude  │                   │   ┌───────────────────────────────────────┐   │
│  Cursor / Web Client   │                   │   │   Nginx / Nginx Proxy Manager (:80)   │   │
└───────────┬────────────┘                   │   └───────────────────┬───────────────────┘   │
            │                                │                       │ proxy_pass: 3000      │
            │ HTTP / SSE 长连接               │                       ▼                       │
            ▼                                │   ┌───────────────────────────────────────┐   │
┌────────────────────────┐                   │   │   Node-RED MCP Server (:3000)         │   │
│ 零信任客户端 (aTrust)    ├──────────────────►│   │   (自包含运行在 /opt/node-red-mcp)     │   │
│ 放行端口: 80, 1880 等   │ (加密 VPN 隧道)   │   └───────────────────┬───────────────────┘   │
└────────────────────────┘                   │                       │ Admin API / 本地文件  │
                                             │                       ▼                       │
                                             │   ┌───────────────────────────────────────┐   │
                                             │   │   Node-RED 业务实例 (:1880)           │   │
                                             │   │   运行目录: /home/nodered/.node-red   │   │
                                             │   └───────────────────────────────────────┘   │
                                             └───────────────────────────────────────────────┘
```

- **Node-RED 实例**：企业原有的工控流程引擎（如监听在 `1880` 端口，带账号密码认证）。
- **Node-RED MCP Server**：以独立旁路运行，自带全部 `node_modules`，通过本地 `127.0.0.1:1880` 与 Node-RED 交互。
- **Nginx 反代**：将 aTrust 放行的 `80` 端口请求实时分发给本地 `3000` 端口。

---

## 2. 本地打包构建（联网开发机）

开发机需具备 Node.js（>= 18）与外网 npm 访问权限。

### 2.1 依赖安装与自动化测试
```bash
# 进入项目目录
cd /Users/yaoxiaorui/work/ai-nodered

# 安装依赖
npm install

# 运行自动化测试（校验节点映射、白名单逻辑与服务初始状态）
npm test
```

### 2.2 构建全量自包含分发包
运行打包脚本：
```bash
npm run bundle
```
- **输出产物**：`dist/node-red-mcp-bundle-v1.1.0.tar.gz`（约 3.8MB）。
- **打包特性**：
  - 内置完整的生产依赖 `node_modules`（包含 `@modelcontextprotocol/sdk`、`axios`、`zod`、`dotenv` 等）。
  - 自动剥离 macOS 扩展属性（`COPYFILE_DISABLE=1`、`--no-xattrs`），解压时不产生任何 Linux 告警。
  - 目标服务器解压即可运行，**严禁且无需在目标服务器执行 `npm install`**。

---

## 3. 服务器端解压与配置（离线目标机）

### 3.1 传输与解压
```bash
# 1. 传输安装包到服务器（示例通过 scp）
scp dist/node-red-mcp-bundle-v1.1.0.tar.gz root@10.60.93.10:/opt/

# 2. 登录服务器
ssh root@10.60.93.10

# 3. 创建目录并解压
mkdir -p /opt/node-red-mcp && cd /opt/node-red-mcp
tar -xzf /opt/node-red-mcp-bundle-v1.1.0.tar.gz -C .
```

### 3.2 配置文件 `.env` 说明
从模板创建配置文件：
```bash
cp .env.example .env
vim .env
```

完整配置项详见下表：

```bash
# ==========================================
# 1. Node-RED 本地连接配置
# ==========================================
# 宿主机上 Node-RED 监听地址
NODE_RED_URL=http://localhost:1880

# 认证配置（若 Node-RED 启用了 adminAuth 密码认证）
# 方式 A：账号密码（MCP 服务会自动调用 OAuth /auth/token 换取 Token 并自动维持心跳刷新）
NODE_RED_USERNAME=admin
NODE_RED_PASSWORD=your_actual_password

# 方式 B：预设静态 Bearer Token（可选，与账号密码二选一）
NODE_RED_TOKEN=

# ==========================================
# 2. 目录路径与权限
# ==========================================
# Node-RED 插件安装目标用户目录（含 package.json 和 node_modules）
NODE_RED_USER_DIR=/home/nodered/.node-red

# 离线插件 tar.gz 存储池目录
PACKAGES_POOL_DIR=./packages-pool

# ==========================================
# 3. 安全策略
# ==========================================
# 允许安装的 npm 模块白名单（支持逗号分隔与通配符 *）
MODULE_WHITELIST=node-red-contrib-*,@flowfuse/*,node-red-node-*

# ==========================================
# 4. 服务重载指令（备用）
# ==========================================
# 若 Node-RED Admin API 热重载失败，触发该系统指令平滑重启
NODE_RED_RELOAD_COMMAND=systemctl restart nodered

# ==========================================
# 5. MCP 传输模式配置
# ==========================================
# 远程连接必须设为 sse（stdio 仅适用于本地命令行管道）
MCP_TRANSPORT=sse
MCP_PORT=3000
MCP_HOST=0.0.0.0
```

---

## 4. 服务启停与运维管理

项目内置了便捷的生产环境运维脚本：

### 4.1 后台启动（Daemon 模式）
```bash
./start.sh -d
```
启动后会生成 PID 文件 `node-red-mcp.pid`，运行日志重定向至 `node-red-mcp.log`。

### 4.2 检查运行状态与健康检查
```bash
./status.sh
```
正常输出示例：
```text
● node-red-mcp is RUNNING (PID: 99605)
  Health Check: OK (http://127.0.0.1:3000/health)
```

### 4.3 查看实时日志
```bash
tail -f node-red-mcp.log
```
正常日志示例：
```text
[node-red-mcp] Loading configuration from .env...
[node-red-mcp] SSE MCP server listening at http://0.0.0.0:3000/sse
```

### 4.4 停止服务
```bash
./stop.sh
```

---

## 5. Nginx / Nginx Proxy Manager 反向代理配置

由于 MCP 采用 **Server-Sent Events (SSE)** 协议与 AI 维持全双工事件通信，反向代理**必须关闭数据缓冲（Buffering）**，否则 Nginx 会把流式响应截留在服务器内存，导致超时。

### 5.1 场景 A：使用 Nginx Proxy Manager（推荐，图形化）

进入 Nginx Proxy Manager 管理后台（如 `http://10.60.93.10:8088`）：

1. 点击 **`Add Proxy Host`**（或编辑现有主机）：
   - **Domain Names**：输入 `10.60.93.10`（按回车确认）
   - **Scheme**：`http`
   - **Forward Hostname / IP**：`10.60.93.10`
   - **Forward Port**：`3000`
   - **Websockets Support**：**开启（打开开关）**
   - **Block Common Exploits**：开启
2. **配置防缓冲（最关键）**：
   - 点击弹窗顶部 `SSL` 右侧的 **小齿轮图标 ⚙️ (Advanced)**。
   - 在 Custom Nginx Configuration 文本框中粘贴：
     ```nginx
     proxy_buffering off;
     proxy_cache off;
     proxy_set_header Connection '';
     chunked_transfer_encoding off;
     ```
3. 点击 **`Save`**。

---

### 5.2 场景 B：使用原生 Nginx / OpenResty

在 `/etc/nginx/conf.d/node-red-mcp.conf` 或现有站点的 `server` 块中加入：

```nginx
server {
    listen 80;
    server_name 10.60.93.10;

    location / {
        proxy_pass http://127.0.0.1:3000/;
        proxy_http_version 1.1;

        # 保持连接与头部透传
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header Connection '';

        # 禁用缓冲，确保 SSE 毫秒级推送
        proxy_buffering off;
        proxy_cache off;
        chunked_transfer_encoding off;

        # 超时设置（避免长时间空闲断流）
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }
}
```

执行重载使配置生效：
```bash
nginx -t && nginx -s reload
```

---

## 6. 深信服 aTrust 零信任网络穿透策略

### 6.1 aTrust 限制原理
深信服 aTrust 是应用级 SDP 网关，仅放行在控制台登记过的特定“应用/端口”。若未放行 3000 端口，本机发往 3000 端口的数据包会在 Mac 驱动层被直接丢弃。

### 6.2 穿透解决策略
- **最佳方式**：复用 aTrust 已经放行的 **`80` 端口**（通过第 5 节的 Nginx 反向代理完成），无需发起网络变更审批。
- **验证命令**：
  在本地 Mac 运行：
  ```bash
  curl -s http://10.60.93.10/health
  ```
  若返回 `{"status":"ok", ...}` 则证明 aTrust 隧道与反代均已完全通畅。

---

## 7. AI 客户端连接配置指南

通过 80 端口代理后，全局 MCP 统一连接地址为：
```text
http://10.60.93.10/sse
```

### 7.1 本地 Antigravity / Gemini CLI 配置
编辑本机全局配置文件 `~/.gemini/config/mcp_config.json`：
```json
{
  "mcpServers": {
    "node-red": {
      "url": "http://10.60.93.10/sse"
    }
  }
}
```

### 7.2 Claude Desktop 配置
编辑 `~/Library/Application Support/Claude/claude_desktop_config.json`（Mac）：
```json
{
  "mcpServers": {
    "node-red": {
      "url": "http://10.60.93.10/sse"
    }
  }
}
```

### 7.3 Cursor 配置
1. 打开 Cursor 设置：`Settings` ➔ `Features` ➔ `MCP`。
2. 点击 **`Add New MCP Server`**：
   - **Name**: `node-red`
   - **Type**: `SSE`
   - **URL**: `http://10.60.93.10/sse`

---

## 8. 离线插件生命周期管理（制作、分发、安装）

针对无外网环境的 Node-RED，MCP 提供完整的离线插件生命周期工具集：

```text
       AI 审查 Flow 缺失
               │
               ▼
   find_missing_node_types
               │
               ▼
      propose_node_module ──────► 人机确认模块与版本
                                         │
                                         ▼
                               联网打包机制作离线包
                             (bin/pack-module.mjs)
                                         │
                                         ▼
                            传至 packages-pool/ 目录
                                         │
                                         ▼
                              install_node_module
                          (校验 SHA-256 + Admin API 热加载)
                                         │
                                         ▼
                              check_node_module
                             (验证节点生效与健康状态)
```

### 8.1 联网机制作离线插件包
开发机上运行内置打包工具：

- **打包单个模块**：
  ```bash
  node bin/pack-module.mjs node-red-contrib-modbus 5.30.0 ./packages-pool
  ```
- **基于清单批量打包**：
  ```bash
  node bin/pack-module.mjs --file plugins.txt.example ./packages-pool
  ```

生成产物为包含完整递归依赖与 `manifest.json` 的 `.tar.gz` 文件，并自动打印 SHA-256 校验和。

### 8.2 上传插件至服务器
```bash
scp packages-pool/pkg-node-red-contrib-*.tar.gz root@10.60.93.10:/opt/node-red-mcp/packages-pool/
```

### 8.3 AI 调度执行安装
AI 客户端直接调用 MCP 工具执行安装：
```json
{
  "name": "install_node_module",
  "arguments": {
    "module": "node-red-contrib-modbus",
    "version": "5.30.0",
    "package_id": "pkg-node-red-contrib-modbus-5.30.0-1700000000",
    "sha256": "4a72d3...（实际计算出的哈希）"
  }
}
```
**安全与生效机制**：
1. 校验哈希，不符立即中断阻断篡改；
2. 提取至 Node-RED 用户目录安装（`--offline --no-audit --ignore-scripts`）；
3. 修正权限为 `nodered:nodered`；
4. 尝试 Node-RED Admin API `POST /nodes` 无感热加载；
5. 若热加载不适用则自动平滑调用 `systemctl restart nodered`；
6. 自动记录审计日志于 `mcp-install-audit.log`。

---

## 9. 高频问题与排查手册（FAQ）

### Q1: 解压时报错 `Cannot find module .../server/mcp.js`？
- **原因**：打包时误排除了 `node_modules` 内部的 `dist` 目录。
- **解决**：使用本项目最新的 `scripts/build-offline-bundle.sh`（包体积约 3.8MB），已确保包含全量构建产物。

### Q2: 启动提示 `.env: line 3: i#: command not found`？
- **原因**：使用 `vim` 编辑 `.env` 时，光标在注释 `#` 处按下了 `i` 键，误输入成了 `i#`。
- **解决**：编辑 `.env` 将开头的 `i#` 改回 `#` 即可。

### Q3: 为什么 1880 能通，而 3000 连接超时？
- **原因**：公司深信服 aTrust 策略按端口白名单拦截，未授权 3000 端口。
- **解决**：不要走 3000 端口，按照第 5 节配置 Nginx 反代，直接复用已放行的 80 端口。

### Q4: 连接 SSE 时 AI 响应迟钝或超时？
- **原因**：Nginx 开启了反向代理缓冲（Proxy Buffering）。
- **解决**：在 Nginx 配置或 NPM 的齿轮 ⚙️ (Advanced) 中加入 `proxy_buffering off;`，彻底关闭缓冲。
