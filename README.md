# AI Node-RED MCP Server (with Offline Package Management)

基于 [karavaev-evgeniy/node-red-mcp-server](https://github.com/karavaev-evgeniy/node-red-mcp-server) 进行深度架构扩展，专为**工业内网 / 隔离网络 (Air-gapped)** 场景设计的 Node-RED MCP (Model Context Protocol) 服务端。

实现了 **“AI 提出建议，本地制作完整离线包，服务器受限安装”** 的全生命周期管理，完全不依赖 Node-RED 服务器访问外网。

---

## 🌟 核心特性

- **完整保留原生能力**：支持 Flow 流管理、节点管理、属性搜索、运行时配置读取与 Inject 远程触发。
- **离线模块生命周期管理**：
  - `find_missing_node_types`：自动分析 Flow JSON，识别当前 Node-RED 实例未安装的节点。
  - `propose_node_module`：工控与物联网节点类型到 npm 模块自动映射（如 Modbus、OPC UA、S7、CAN、InfluxDB、Dashboard 等）。
  - `prepare_offline_package`：联网环境下一键打包插件及其全量递归依赖、生成校验清单与 SHA-256。
  - `install_node_module`：离线受限安全安装（强哈希校验、路径防穿透、白名单过滤、Node-RED Admin API 热重载、异常回滚与审计日志）。
  - `check_node_module`：实时验证模块加载与节点注册就绪状态。
- **全量自包含离线部署**：本地一键打包全部运行依赖 (`dist/node-red-mcp-bundle-*.tar.gz`)，拷贝到目标服务器直接解压运行，服务器无需联网 `npm install`。
- **双重 AI 联通模式**：
  - **SSE 传输模式 (推荐)**：内网 HTTP/SSE 远程监听（端口 `3000`），支持任意内网 AI 客户端连接。
  - **Stdio / SSH 隧道模式**：本地 AI 客户端通过 SSH 管道透明直连，零端口暴露。

---

## 🛠️ 整体架构流程

```text
【联网开发机 / 构建机】                      【离线 / 内网 Node-RED 服务器】
       │                                                 │
       ├─ 1. 本地执行一键打包 (npm run bundle)            │
       │    生成 node-red-mcp-bundle.tar.gz               │
       │                                                 │
       └─ 2. 拷贝至服务器 ───────────────────────────────► 解压并执行 ./start.sh -d
                                                         (启动 MCP 服务: stdio 或 sse)
                                                                 ▲
                                                                 │
                                                       3. 通过 AI 客户端联通
                                                          (SSE 远程或 SSH 管道)
                                                                 │
                                                                 ▼
【AI 交互与离线安装流程】
  1. AI 分析流程发现缺失节点 (如 modbus-read)
  2. AI 提议安装模块 node-red-contrib-modbus -> 提示人机确认
  3. 本地打包机运行 pack-module 制作全依赖包及 SHA-256 -> 传入服务器 packages-pool
  4. AI 触发 install_node_module -> 校验 SHA-256 -> 离线本地安装 -> Node-RED 热重载
  5. AI 调用 check_node_module 确认就绪
```

---

## 🚀 快速上手指南

### 步骤 1：本地打包离线镜像

在当前具备网络访问能力的机器上运行：

```bash
# 1. 安装开发环境依赖
npm install

# 2. 运行单元测试
npm test

# 3. 生成全量自包含部署包 (包含完整 node_modules 和控制脚本)
npm run bundle
```

执行完毕后，将在 `dist/` 目录下生成：
- `dist/node-red-mcp-bundle-v1.1.0.tar.gz` (约 3.8MB，已包含全量生产 `node_modules` 与剥离 macOS 扩展属性)

> 📖 **更详细的生产部署与反代配置手册**：请参阅 [docs/DEPLOYMENT_GUIDE.md](file:///Users/yaoxiaorui/work/ai-nodered/docs/DEPLOYMENT_GUIDE.md)。

---

### 步骤 2：拷贝到服务器并运行

将打包好的 tarball 传输至 Node-RED 所在服务器：

```bash
# 拷贝到服务器
scp dist/node-red-mcp-bundle-v1.1.0.tar.gz root@your-server:/opt/

# 在服务器上解压
ssh root@your-server
mkdir -p /opt/node-red-mcp && cd /opt/node-red-mcp
tar -xzf /opt/node-red-mcp-bundle-v1.1.0.tar.gz -C .

# 配置环境变量
cp .env.example .env
# 编辑 .env 文件，填写 NODE_RED_USERNAME、NODE_RED_PASSWORD、MCP_TRANSPORT=sse 等配置
vim .env

# 后台启动服务
./start.sh -d

# 查看运行状态与健康检查
./status.sh

# 🔄 后续版本原地升级（自动平滑重启并保留 .env 配置）：
./update.sh
```

---

### 步骤 3：Nginx 反向代理配置（穿透 aTrust / 防火墙）

若服务器与客户端之间存在 aTrust（零信任）或防火墙限制了 3000 端口，可通过服务器已放行的 **80 端口** 进行反代：

在 Nginx 或 Nginx Proxy Manager 中添加反向代理规则，指向 `http://127.0.0.1:3000/`：
```nginx
location / {
    proxy_pass http://127.0.0.1:3000/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header Connection '';

    # 关键：关闭反向代理缓冲，确保 SSE 长连接实时流式推送
    proxy_buffering off;
    proxy_cache off;
    chunked_transfer_encoding off;
}
```

---

### 步骤 4：AI 客户端联通配置

无论是 Antigravity、Claude Desktop 还是 Cursor，只需配置 MCP 的 SSE 地址。如果开启了 `MCP_API_KEY`，可在请求头或 URL 参数中携带该令牌：

**Antigravity / 本机全局配置 (`~/.gemini/config/mcp_config.json`)**：
```json
{
  "mcpServers": {
    "node-red": {
      "url": "http://10.60.93.10/sse",
      "headers": {
        "Authorization": "Bearer mcp_sec_c8aef67bfbf81d620abef3ef57c8febed024406f06af2249"
      }
    }
  }
}
```

**Claude Desktop (`claude_desktop_config.json`)**：
```json
{
  "mcpServers": {
    "node-red": {
      "url": "http://10.60.93.10/sse",
      "headers": {
        "Authorization": "Bearer mcp_sec_c8aef67bfbf81d620abef3ef57c8febed024406f06af2249"
      }
    }
  }
}
```

**Cursor (MCP SSE 配置)**：
- **URL**: `http://10.60.93.10/sse?token=mcp_sec_c8aef67bfbf81d620abef3ef57c8febed024406f06af2249`

---

## 📦 制作与分发插件离线包

当 AI 发现 Flow 中缺失特定工控插件（例如 `node-red-contrib-modbus`）时：

1. **在联网开发机上制作离线安装包**：
   ```bash
   node bin/pack-module.mjs node-red-contrib-modbus 5.30.0
   ```
   输出包含：
   - 生成的离线包路径：`packages-pool/pkg-node-red-contrib-modbus-5.30.0-....tar.gz`
   - 包的 SHA-256 校验和与 Package ID

2. **将离线包拷贝至目标服务器**：
   ```bash
   scp packages-pool/pkg-*.tar.gz user@your-server:/opt/node-red-mcp/packages-pool/
   ```

3. **AI 发起安全安装**：
   AI 客户端调用 `install_node_module`，传入对应 `package_id` 与 `sha256`。
   代理进程校验哈希、解压离线缓存、在 Node-RED 用户目录执行安全离线安装，并通过 Node-RED Admin API `POST /nodes` 完成无感热加载。

---

## 🛡️ 离线安装 MCP 工具列表

| 工具名称 | 参数 | 说明 |
| :--- | :--- | :--- |
| `find_missing_node_types` | `flow: object\|string` | 解析 Flow JSON 中引用的所有节点，识别当前 Node-RED 尚未安装的缺失类型 |
| `propose_node_module` | `node_type: string` | 依据缺失节点（如 `s7 in`），给出推荐的 npm 模块、安全评级与白名单状态 |
| `prepare_offline_package` | `module, version, output_dir` | 联网环境下将插件及其全部依赖打包为离线归档，输出 SHA-256 校验码 |
| `install_node_module` | `module, version, package_id, sha256, user_dir` | 核对 SHA-256 强校验，在 Node-RED 用户目录离线安装，触发 Admin API 热加载 |
| `check_node_module` | `module: string` | 检查目标模块是否已在 Node-RED 实例成功注册与激活 |

---

## 📜 许可证

本项目基于 [node-red-mcp-server](https://github.com/karavaev-evgeniy/node-red-mcp-server) 进行开发扩展，遵循 [MIT License](LICENSE)。
