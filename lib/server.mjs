/**
 * MCP server for Node-RED
 * Allows language models to interact with Node-RED through the MCP protocol
 */

import http from 'http';
import path from 'path';
import os from 'os';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import 'dotenv/config';
import axios from 'axios';

// Import tool registrars
import registerFlowTools from './tools/flows.mjs';
import registerNodeTools from './tools/nodes.mjs';
import registerSettingsTools from './tools/settings.mjs';
import registerUtilityTools from './tools/utility.mjs';
import registerInstallerTools from './tools/installer.mjs';

import { getNodeRedToken } from './utils.mjs';

/**
 * Default server settings
 */
const defaultConfig = {
  serverName: 'node-red-mcp-server',
  serverVersion: '1.1.0',
  nodeRedUrl: 'http://localhost:1880',
  nodeRedUsername: '',
  nodeRedPassword: '',
  nodeRedToken: '',
  nodeRedUserDir: path.join(os.homedir(), '.node-red'),
  packagesPoolDir: path.resolve(process.cwd(), 'packages-pool'),
  reloadCommand: '',
  whitelist: '',
  transportType: 'stdio',
  port: 3000,
  host: '0.0.0.0',
  verbose: false
};

/**
 * Creates and initializes an McpServer instance with all tools registered
 * @param {Object} config
 * @returns {McpServer}
 */
export function buildMcpServer(config) {
  const server = new McpServer({
    name: config.serverName,
    version: config.serverVersion
  });

  registerFlowTools(server, config);
  registerNodeTools(server, config);
  registerSettingsTools(server, config);
  registerUtilityTools(server, config);
  registerInstallerTools(server, config);

  return server;
}

/**
 * Creates and configures an MCP server for Node-RED
 * @param {Object} userConfig - User configuration
 * @returns {Object} Object with start method and other utilities
 */
export function createServer(userConfig = {}) {
  // Merge configuration
  const config = {
    ...defaultConfig,
    ...userConfig,
    nodeRedUrl: userConfig.nodeRedUrl || process.env.NODE_RED_URL || defaultConfig.nodeRedUrl,
    nodeRedUsername: userConfig.nodeRedUsername || process.env.NODE_RED_USERNAME || defaultConfig.nodeRedUsername,
    nodeRedPassword: userConfig.nodeRedPassword || process.env.NODE_RED_PASSWORD || defaultConfig.nodeRedPassword,
    nodeRedToken: userConfig.nodeRedToken || process.env.NODE_RED_TOKEN || defaultConfig.nodeRedToken,
    nodeRedUserDir: userConfig.nodeRedUserDir || process.env.NODE_RED_USER_DIR || defaultConfig.nodeRedUserDir,
    packagesPoolDir: userConfig.packagesPoolDir || process.env.PACKAGES_POOL_DIR || defaultConfig.packagesPoolDir,
    reloadCommand: userConfig.reloadCommand || process.env.NODE_RED_RELOAD_COMMAND || defaultConfig.reloadCommand,
    whitelist: userConfig.whitelist || process.env.MODULE_WHITELIST || defaultConfig.whitelist,
    transportType: userConfig.transportType || process.env.MCP_TRANSPORT || defaultConfig.transportType,
    port: Number(userConfig.port || process.env.MCP_PORT || defaultConfig.port),
    host: userConfig.host || process.env.MCP_HOST || defaultConfig.host
  };

  /**
   * Tests the connection to Node-RED
   * @returns {Promise<boolean>} True if connection is successful
   */
  async function testNodeRedConnection() {
    try {
      const token = await getNodeRedToken(config);
      const headers = token ? { 'Authorization': 'Bearer ' + token } : {};
      await axios.get(config.nodeRedUrl, { headers, timeout: 5000 });
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Starts the MCP server
   * @returns {Promise<void>}
   */
  async function start() {
    // Test Node-RED connection
    try {
      await testNodeRedConnection();
    } catch (_) {
      // Ignore initial connection failure
    }

    if (config.transportType === 'stdio') {
      const server = buildMcpServer(config);
      const transport = new StdioServerTransport();
      await server.connect(transport);
      if (config.verbose) {
        console.error(`[node-red-mcp] Stdio MCP server connected`);
      }
      return { server, transport };
    }

    if (config.transportType === 'sse') {
      const activeSessions = new Map();

      const httpServer = http.createServer(async (req, res) => {
        // CORS Headers
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

        if (req.method === 'OPTIONS') {
          res.writeHead(204);
          res.end();
          return;
        }

        const reqUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

        // Health check endpoint
        if (req.method === 'GET' && (reqUrl.pathname === '/health' || reqUrl.pathname === '/')) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            status: 'ok',
            server: config.serverName,
            version: config.serverVersion,
            transport: 'sse',
            active_sessions: activeSessions.size
          }));
          return;
        }

        // SSE connection endpoint
        if (req.method === 'GET' && reqUrl.pathname === '/sse') {
          res.setHeader('X-Accel-Buffering', 'no');
          res.setHeader('Cache-Control', 'no-cache');
          const transport = new SSEServerTransport('/messages', res);
          const serverInstance = buildMcpServer(config);

          activeSessions.set(transport.sessionId, { transport, server: serverInstance });

          transport.onclose = () => {
            activeSessions.delete(transport.sessionId);
            if (config.verbose) {
              console.log(`[node-red-mcp] Session ${transport.sessionId} closed`);
            }
          };

          await serverInstance.connect(transport);
          if (config.verbose) {
            console.log(`[node-red-mcp] New SSE session established: ${transport.sessionId}`);
          }
          return;
        }

        // Post message endpoint
        if (req.method === 'POST' && reqUrl.pathname === '/messages') {
          const sessionId = reqUrl.searchParams.get('sessionId');
          const session = activeSessions.get(sessionId);

          if (!session) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end(`Session "${sessionId}" not found`);
            return;
          }

          await session.transport.handlePostMessage(req, res);
          return;
        }

        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
      });

      return new Promise((resolve, reject) => {
        httpServer.listen(config.port, config.host, (err) => {
          if (err) return reject(err);
          console.log(`[node-red-mcp] SSE MCP server listening at http://${config.host}:${config.port}/sse`);
          resolve({ httpServer, activeSessions });
        });
      });
    }

    throw new Error(`Unsupported transport type: ${config.transportType}`);
  }

  return {
    config,
    start,
    testNodeRedConnection
  };
}

// If this file is run directly
if (import.meta.url.startsWith('file:') && import.meta.url === `file://${process.argv[1]}`) {
  try {
    const server = createServer();
    server.start();
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

export { defaultConfig };
