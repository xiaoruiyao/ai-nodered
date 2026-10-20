#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import os from 'os';
import axios from 'axios';
import { EventSource } from 'eventsource';
import 'dotenv/config';

// Resolve configuration: CLI args / env / global config
let remoteUrl = process.env.MCP_SERVER_URL || process.env.MCP_URL || 'http://10.60.93.10';
let apiKey = process.env.MCP_API_KEY || '';

try {
  const globalConfigPath = path.join(os.homedir(), '.gemini', 'config', 'mcp_config.json');
  if (fs.existsSync(globalConfigPath)) {
    const globalCfg = JSON.parse(fs.readFileSync(globalConfigPath, 'utf8'));
    const nrCfg = globalCfg.mcpServers?.['node-red'];
    if (nrCfg) {
      if (nrCfg.url) {
        remoteUrl = nrCfg.url.replace(/\/sse(\?.*)?$/, '');
      }
      if (!apiKey && nrCfg.headers?.Authorization) {
        const parts = nrCfg.headers.Authorization.split(' ');
        apiKey = parts.length === 2 ? parts[1] : nrCfg.headers.Authorization;
      }
    }
  }
} catch (_) {}

export async function callMcpTool(toolName, args = {}) {
  return new Promise((resolve, reject) => {
    const sseUrl = `${remoteUrl}/sse${apiKey ? `?token=${encodeURIComponent(apiKey)}` : ''}`;
    const es = new EventSource(sseUrl);
    let postUrl = '';
    const timer = setTimeout(() => {
      es.close();
      reject(new Error(`MCP tool call timeout (15s): ${toolName}`));
    }, 15000);

    es.onerror = (err) => {
      clearTimeout(timer);
      es.close();
      reject(err);
    };

    es.addEventListener('endpoint', async (ev) => {
      postUrl = `${remoteUrl}${ev.data}`;
      try {
        await axios.post(postUrl, {
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'antigravity-client', version: '1.0' }
          }
        }, {
          headers: apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {}
        });
      } catch (e) {
        clearTimeout(timer);
        es.close();
        reject(e);
      }
    });

    es.addEventListener('message', async (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.id === 1) {
          await axios.post(postUrl, {
            jsonrpc: '2.0',
            method: 'notifications/initialized'
          }, {
            headers: apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {}
          });

          await axios.post(postUrl, {
            jsonrpc: '2.0',
            id: 2,
            method: 'tools/call',
            params: { name: toolName, arguments: args }
          }, {
            headers: apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {}
          });
        } else if (msg.id === 2) {
          clearTimeout(timer);
          es.close();
          if (msg.error) {
            reject(new Error(msg.error.message || JSON.stringify(msg.error)));
          } else {
            resolve(msg.result);
          }
        }
      } catch (e) {
        clearTimeout(timer);
        es.close();
        reject(e);
      }
    });
  });
}

// CLI execution
if (process.argv[1] && process.argv[1].endsWith('call-remote-mcp.mjs')) {
  const tool = process.argv[2] || 'get-flows';
  const args = process.argv[3] ? JSON.parse(process.argv[3]) : {};
  callMcpTool(tool, args)
    .then((res) => {
      console.log(JSON.stringify(res, null, 2));
      process.exit(0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
