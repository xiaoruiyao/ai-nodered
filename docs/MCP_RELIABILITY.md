# MCP 停机排查和进程托管

## 排查当前停机

`node-red-mcp.pid` 残留说明 PID 文件存在但对应进程不在，并不能单独说明进程为何退出。`node-red-mcp.log` 的监听信息只表明曾经启动；日志没有时间戳时无法据此定位停机时间。`/health` 返回 OK 只证明当前 MCP HTTP 进程可以响应，不证明 Node-RED、所有 MCP 工具或外部链路均可用。

在生产服务器上以有权限的账号检查以下信息，并记录停机发生时间及其时区：

```bash
cd /opt/node-red-mcp
./status.sh
ps -eo pid,ppid,lstart,args | grep '[n]ode-red-mcp-server.mjs'
ss -lntp | grep ':3000'
tail -n 200 node-red-mcp.log
uptime -s
last -x | head -30
journalctl -k --since '2026-10-28 00:00:00' --no-pager | grep -Ei 'out of memory|oom-kill|killed process'
journalctl --since '2026-10-28 00:00:00' --no-pager | grep -Ei 'node-red-mcp|oom-kill|out of memory|killed process'
systemctl list-units --all --type=service | grep -i node-red-mcp
```

根据实际事件时间修改 `--since`。以上日志可能包含业务信息或凭据，分享前检查并脱敏。若没有 root 或 journal 读取权限，则无输出不能证明没有发生 OOM。当前环境的系统日志可能由于轮转而缺少历史记录。

`start.sh -d` 使用 `nohup` 后台运行，并没有自动重启或开机启动机制。进程因崩溃、信号、系统重启等原因退出后不会自动恢复。考虑由 systemd 直接管理主进程，确保只运行一套进程管理方式。仅重启 Node-RED 不等同于重启 MCP；不能把两者关联当成已证实的停机原因。

## systemd 参考配置

仓库提供 [`deploy/node-red-mcp.service`](../deploy/node-red-mcp.service) 样例，使用 systemd 直接运行前台 MCP 进程，异常退出后等待 5 秒重启，并写入 journal。该文件只是部署前的参考，**不会自动安装或修改生产服务器**。

安装前在生产服务器核对：

- `command -v node` 是否能在 systemd 的 PATH 中找到预期版本；不确定时将 `ExecStart` 中 `/usr/bin/env node` 改为经过核实的 Node 可执行文件绝对路径。
- 当前进程运行用户、工作目录、配置文件、文件读写权限和 Node-RED 管理权限；按部署环境配置 `User=` / `Group=`，确保用户可以访问 `.env` 和所需目录。样例未指定用户，systemd 默认以 root 运行，不应盲目复制到不同环境。
- `/opt/node-red-mcp/.env` 含有当前所需配置（包括 MCP API key），`dotenv` 会从工作目录加载。systemd 不会执行 `start.sh` 中额外的 shell `source`；如果现有环境依赖 shell 扩展或其他继承变量，需转换并验证后再切换。
- `node-red-mcp` 是否已经被 systemd、PM2 或其他守护进程管理。不得同时启动第二个实例占用同一端口。
- 验证打包和目标服务的代码版本及配置；先保存备份和回退方式。切换涉及停止当前手工进程并启动服务，会造成短暂中断，应按生产变更流程执行。

在完成以上核对和授权的变更窗口后，部署人员可安装样例、切换唯一实例，并以 `systemctl status node-red-mcp`、`journalctl -u node-red-mcp`、`curl -fsS http://127.0.0.1:3000/health` 和一次真实 MCP 工具调用验证。开机自启动及异常恢复需在维护窗口单独测试，不能仅以 unit 文件存在推断成功。systemd 管理时不要再用 PID 文件判断服务状态；旧 `node-red-mcp.pid` 不代表 systemd 当前主进程。
