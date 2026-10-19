/**
 * MCP tools for offline Node-RED module lifecycle management
 */

import { z } from 'zod';
import { callNodeRed } from '../utils.mjs';
import { CORE_NODE_TYPES, mapNodeTypeToModule, isModuleAllowed } from '../installer/catalog.mjs';
import { prepareOfflinePackage } from '../installer/packager.mjs';
import { installOfflineModule, resolveUserDir } from '../installer/install-executor.mjs';

/**
 * Registers offline installer tools in the MCP server
 * @param {Object} server - MCP server instance
 * @param {Object} config - Server configuration
 */
export default function registerInstallerTools(server, config) {

  // 1. find_missing_node_types
  server.tool(
    'find_missing_node_types',
    {
      flow: z.any().describe('Node-RED flow JSON array or export containing node definitions')
    },
    async ({ flow }) => {
      try {
        let flowNodes = [];
        if (Array.isArray(flow)) {
          flowNodes = flow;
        } else if (flow && Array.isArray(flow.flows)) {
          flowNodes = flow.flows;
        } else if (typeof flow === 'string') {
          try {
            const parsed = JSON.parse(flow);
            flowNodes = Array.isArray(parsed) ? parsed : (parsed.flows || []);
          } catch (_) {
            return {
              content: [{ type: 'text', text: 'Error: Invalid JSON format for flow input' }]
            };
          }
        }

        // Get currently installed nodes from Node-RED instance
        const installedList = await callNodeRed('get', '/nodes', null, config);
        const installedTypes = new Set();

        if (Array.isArray(installedList)) {
          for (const item of installedList) {
            if (Array.isArray(item.types)) {
              for (const t of item.types) {
                installedTypes.add(t);
              }
            } else if (item.types && typeof item.types === 'string') {
              installedTypes.add(item.types);
            }
          }
        }

        // Identify node types present in the flow
        const usedTypes = new Set();
        for (const node of flowNodes) {
          if (node && node.type && !CORE_NODE_TYPES.has(node.type)) {
            usedTypes.add(node.type);
          }
        }

        const missingTypes = [];
        for (const type of usedTypes) {
          if (!installedTypes.has(type)) {
            const mapping = mapNodeTypeToModule(type);
            missingTypes.push({
              node_type: type,
              suggested_module: mapping.module,
              description: mapping.description,
              is_known: mapping.isKnown
            });
          }
        }

        const result = {
          total_flow_nodes: flowNodes.length,
          total_custom_types: usedTypes.size,
          missing_count: missingTypes.length,
          missing_types: missingTypes
        };

        return {
          content: [{
            type: 'text',
            text: JSON.stringify(result, null, 2)
          }]
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Error finding missing nodes: ${err.message}` }]
        };
      }
    }
  );

  // 2. propose_node_module
  server.tool(
    'propose_node_module',
    {
      node_type: z.string().describe('Node type to lookup, e.g. modbus-read, opcua-client, s7 in')
    },
    async ({ node_type }) => {
      const mapping = mapNodeTypeToModule(node_type);
      const isAllowed = mapping.module ? isModuleAllowed(mapping.module, config.whitelist) : false;

      const proposal = {
        node_type,
        suggested_module: mapping.module,
        description: mapping.description,
        is_core: mapping.isCore || false,
        is_known: mapping.isKnown || false,
        whitelisted: isAllowed,
        recommended_action: mapping.isCore
          ? 'This is a built-in core node. Check if it is disabled in Node-RED settings.'
          : mapping.module
            ? `Ask human confirmation to install module "${mapping.module}"`
            : 'Unknown node type. Manual research or npm package name required.'
      };

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(proposal, null, 2)
        }]
      };
    }
  );

  // 3. prepare_offline_package
  server.tool(
    'prepare_offline_package',
    {
      module: z.string().describe('npm module name, e.g. node-red-contrib-modbus'),
      version: z.string().optional().describe('Target module version (default: latest)'),
      output_dir: z.string().optional().describe('Custom destination folder for the offline package')
    },
    async ({ module: moduleName, version = 'latest', output_dir }) => {
      try {
        const pkgPool = output_dir || config.packagesPoolDir;
        const res = await prepareOfflinePackage({
          module: moduleName,
          version,
          outputDir: pkgPool,
          whitelist: config.whitelist
        });

        return {
          content: [{
            type: 'text',
            text: JSON.stringify(res, null, 2)
          }]
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Error preparing offline package: ${err.message}` }]
        };
      }
    }
  );

  // 4. install_node_module
  server.tool(
    'install_node_module',
    {
      module: z.string().describe('Module name, e.g. node-red-contrib-modbus'),
      version: z.string().optional().describe('Module version'),
      package_id: z.string().optional().describe('Package ID in packages pool, e.g. pkg-node-red-contrib-modbus-5.30.0-1700000000'),
      package_file: z.string().optional().describe('Direct file path to the .tar.gz bundle on the server'),
      sha256: z.string().describe('Expected SHA-256 checksum for verification'),
      user_dir: z.string().optional().describe('Node-RED user directory (defaults to ~/.node-red or env NODE_RED_USER_DIR)')
    },
    async ({ module: moduleName, version, package_id, package_file, sha256, user_dir }) => {
      try {
        const res = await installOfflineModule({
          module: moduleName,
          version,
          packageId: package_id,
          packageFile: package_file,
          sha256,
          userDir: user_dir || config.nodeRedUserDir,
          packagesPoolDir: config.packagesPoolDir,
          nodeRedUrl: config.nodeRedUrl,
          nodeRedToken: config.nodeRedToken,
          reloadCommand: config.reloadCommand,
          whitelist: config.whitelist
        });

        return {
          content: [{
            type: 'text',
            text: JSON.stringify(res, null, 2)
          }]
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Installation error: ${err.message}` }]
        };
      }
    }
  );

  // 5. check_node_module
  server.tool(
    'check_node_module',
    {
      module: z.string().describe('Module name to check, e.g. node-red-contrib-modbus')
    },
    async ({ module: moduleName }) => {
      try {
        const info = await callNodeRed('get', `/nodes/${moduleName}`, null, config);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(info, null, 2)
          }]
        };
      } catch (err) {
        return {
          content: [{
            type: 'text',
            text: `Module "${moduleName}" is not loaded or error occurred: ${err.message}`
          }]
        };
      }
    }
  );
}
