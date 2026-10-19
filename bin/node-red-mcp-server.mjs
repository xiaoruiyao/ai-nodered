#!/usr/bin/env node

/**
 * Command-line interface for Node-RED MCP server
 */

import { createServer } from '../lib/server.mjs';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

// Define __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Get version from package.json
const packageJsonPath = path.join(__dirname, '..', 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  nodeRedUrl: process.env.NODE_RED_URL,
  nodeRedToken: process.env.NODE_RED_TOKEN,
  nodeRedUserDir: process.env.NODE_RED_USER_DIR,
  packagesPoolDir: process.env.PACKAGES_POOL_DIR,
  reloadCommand: process.env.NODE_RED_RELOAD_COMMAND,
  whitelist: process.env.MODULE_WHITELIST,
  transportType: process.env.MCP_TRANSPORT,
  port: process.env.MCP_PORT,
  host: process.env.MCP_HOST,
  verbose: false
};

function printHelp() {
  console.log(`
node-red-mcp-server v${packageJson.version}
Model Context Protocol server for Node-RED with offline package installer support.

Usage:
  node-red-mcp-server [options]

Options:
  -u, --url <url>              Node-RED base URL (default: http://localhost:1880)
  -t, --token <token>          Node-RED API access token
  -m, --transport <type>       Transport type: stdio or sse (default: stdio)
  -p, --port <port>            Port for SSE server (default: 3000)
      --host <host>            Host to bind for SSE server (default: 0.0.0.0)
      --userdir <dir>          Node-RED user directory (default: ~/.node-red)
      --pool <dir>             Offline packages pool directory (default: ./packages-pool)
      --whitelist <list>       Comma-separated whitelisted npm modules or prefixes
      --reload-cmd <cmd>       Shell command to reload Node-RED (e.g. "pm2 restart nodered")
  -v, --verbose                Enable verbose logging
  -V, --version                Print version
  -h, --help                   Show this help message
`);
}

// Process arguments
for (let i = 0; i < args.length; i++) {
  const arg = args[i];

  if (arg === '--url' || arg === '-u') {
    options.nodeRedUrl = args[++i];
  } else if (arg === '--token' || arg === '-t') {
    options.nodeRedToken = args[++i];
  } else if (arg === '--transport' || arg === '-m') {
    options.transportType = args[++i];
  } else if (arg === '--port' || arg === '-p') {
    options.port = Number(args[++i]);
  } else if (arg === '--host') {
    options.host = args[++i];
  } else if (arg === '--userdir') {
    options.nodeRedUserDir = args[++i];
  } else if (arg === '--pool') {
    options.packagesPoolDir = args[++i];
  } else if (arg === '--whitelist') {
    options.whitelist = args[++i];
  } else if (arg === '--reload-cmd') {
    options.reloadCommand = args[++i];
  } else if (arg === '--verbose' || arg === '-v') {
    options.verbose = true;
  } else if (arg === '--help' || arg === '-h') {
    printHelp();
    process.exit(0);
  } else if (arg === '--version' || arg === '-V') {
    console.log(packageJson.version);
    process.exit(0);
  }
}

// Create and start server
async function run() {
  try {
    const server = createServer(options);
    await server.start();
  } catch (error) {
    console.error('Fatal server error:', error.message);
    process.exit(1);
  }
}

// Start
run();
