/**
 * Utility tools for the Node-RED MCP server
 */

import axios from 'axios';

let cachedToken = null;
let tokenExpiry = 0;

/**
 * Retrieves a valid Bearer token for Node-RED
 * Supports static token OR auto-login via username/password (OAuth2 /auth/token)
 * @param {Object} config
 * @returns {Promise<string>}
 */
export async function getNodeRedToken(config) {
  if (config.nodeRedToken && config.nodeRedToken.trim()) {
    return config.nodeRedToken.trim();
  }

  const username = config.nodeRedUsername || process.env.NODE_RED_USERNAME;
  const password = config.nodeRedPassword || process.env.NODE_RED_PASSWORD;

  if (!username || !password) {
    return '';
  }

  const now = Date.now();
  if (cachedToken && now < tokenExpiry) {
    return cachedToken;
  }

  try {
    const url = `${config.nodeRedUrl}/auth/token`;
    const res = await axios.post(url, {
      client_id: 'node-red-admin',
      grant_type: 'password',
      scope: '*',
      username,
      password
    }, { timeout: 8000 });

    if (res.data && res.data.access_token) {
      cachedToken = res.data.access_token;
      const expiresInMs = (res.data.expires_in || 3600) * 1000;
      tokenExpiry = now + Math.max(expiresInMs - 60000, 30000);
      return cachedToken;
    }
  } catch (err) {
    const detail = err.response?.data?.message || (typeof err.response?.data === 'string' ? err.response.data : err.message);
    throw new Error(`Node-RED authentication failed for username "${username}": ${detail}`);
  }

  return '';
}

/**
 * Call the Node-RED API
 * @param {string} method - HTTP method (get, post, put, delete)
 * @param {string} path - API path
 * @param {Object|null} data - Data to send (optional)
 * @param {Object} config - Connection configuration
 * @returns {Promise<any>} Result of the API call
 */
export async function callNodeRed(method, path, data = null, config) {
  let token = await getNodeRedToken(config);
  const url = config.nodeRedUrl + path;
  let headers = token ? { 'Authorization': 'Bearer ' + token } : {};

  try {
    const response = await axios({ method, url, headers, data });
    return response.data;
  } catch (error) {
    // If 401 Unauthorized and username/password is present, attempt re-login once
    const hasCreds = (config.nodeRedUsername || process.env.NODE_RED_USERNAME) &&
                     (config.nodeRedPassword || process.env.NODE_RED_PASSWORD);

    if (error.response?.status === 401 && hasCreds) {
      cachedToken = null;
      tokenExpiry = 0;
      token = await getNodeRedToken(config);
      headers = token ? { 'Authorization': 'Bearer ' + token } : {};
      const retryResponse = await axios({ method, url, headers, data });
      return retryResponse.data;
    }

    const message = error.response?.data?.message || (typeof error.response?.data === 'string' ? error.response.data : error.message);
    throw new Error(`Node-RED API error: ${message}`);
  }
}

/**
 * Format output of Node-RED flows
 * @param {Array} flows - Array of Node-RED flows
 * @returns {Object} Formatted data with statistics
 */
export function formatFlowsOutput(flows) {
  // Grouping by type
  const result = {
    tabs: flows.filter(n => n.type === 'tab'),
    nodes: flows.filter(n => n.type !== 'tab' && n.type !== 'subflow'),
    subflows: flows.filter(n => n.type === 'subflow')
  };

  // Statistics
  const stats = {
    tabCount: result.tabs.length,
    nodeCount: result.nodes.length,
    subflowCount: result.subflows.length,
    nodeTypes: {}
  };

  result.nodes.forEach(node => {
    if (!stats.nodeTypes[node.type]) stats.nodeTypes[node.type] = 0;
    stats.nodeTypes[node.type]++;
  });

  return {
    summary: `Node-RED project: ${stats.tabCount} tabs, ${stats.nodeCount} nodes, ${stats.subflowCount} subflows`,
    statistics: stats,
    data: result
  };
}
