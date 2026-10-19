/**
 * Server-side offline installation executor for Node-RED modules
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFile, exec } from 'child_process';
import { promisify } from 'util';
import axios from 'axios';
import { computeFileSha256 } from './packager.mjs';
import { isModuleAllowed } from './catalog.mjs';
import { getNodeRedToken } from '../utils.mjs';

const execFileAsync = promisify(execFile);
const execAsync = promisify(exec);

/**
 * Appends an entry to the installation audit log
 * @param {string} userDir
 * @param {Object} logEntry
 */
export function writeAuditLog(userDir, logEntry) {
  try {
    const auditFile = path.join(userDir, 'mcp-install-audit.log');
    const line = JSON.stringify({
      timestamp: new Date().toISOString(),
      ...logEntry
    }) + '\n';
    fs.appendFileSync(auditFile, line, 'utf8');
  } catch (err) {
    console.error('Failed to write audit log:', err.message);
  }
}

/**
 * Resolves Node-RED user directory
 * @param {string} [customUserDir]
 * @returns {string}
 */
export function resolveUserDir(customUserDir) {
  if (customUserDir && customUserDir.trim()) {
    return path.resolve(customUserDir.trim());
  }
  if (process.env.NODE_RED_USER_DIR && process.env.NODE_RED_USER_DIR.trim()) {
    return path.resolve(process.env.NODE_RED_USER_DIR.trim());
  }
  // Check typical deployment path from node-red_deploy
  if (fs.existsSync('/home/nodered/.node-red')) {
    return '/home/nodered/.node-red';
  }
  return path.join(os.homedir(), '.node-red');
}

/**
 * Executes offline installation of a package bundle into Node-RED
 * @param {Object} options
 * @param {string} options.module - Module name
 * @param {string} [options.version] - Module version
 * @param {string} [options.packageId] - Package ID in package pool
 * @param {string} [options.packageFile] - Absolute path to package archive
 * @param {string} options.sha256 - Expected SHA-256 hash for verification
 * @param {string} [options.userDir] - Node-RED userDir
 * @param {string} [options.packagesPoolDir] - Directory where packages are stored
 * @param {string} [options.nodeRedUrl] - Node-RED base URL
 * @param {string} [options.nodeRedToken] - Node-RED auth token
 * @param {string} [options.reloadCommand] - Optional command to reload/restart Node-RED
 * @param {Array<string>|string} [options.whitelist] - Optional whitelist
 * @returns {Promise<Object>} Installation result
 */
export async function installOfflineModule(options) {
  const {
    module: moduleName,
    version,
    packageId,
    sha256: expectedSha256,
    packagesPoolDir = path.resolve(process.cwd(), 'packages-pool'),
    nodeRedUrl = 'http://localhost:1880',
    nodeRedToken = '',
    reloadCommand = process.env.NODE_RED_RELOAD_COMMAND,
    whitelist = null
  } = options;

  if (!moduleName) {
    throw new Error('Module name is required');
  }

  // 1. Whitelist validation
  if (!isModuleAllowed(moduleName, whitelist)) {
    throw new Error(`Installation rejected: module "${moduleName}" is not whitelisted`);
  }

  const userDir = resolveUserDir(options.userDir);
  if (!fs.existsSync(userDir)) {
    fs.mkdirSync(userDir, { recursive: true });
  }

  // 2. Locate the package file
  let archivePath = options.packageFile;
  if (!archivePath && packageId) {
    archivePath = path.join(packagesPoolDir, `${packageId}.tar.gz`);
  }

  if (!archivePath || !fs.existsSync(archivePath)) {
    throw new Error(`Package file not found: ${archivePath || packageId}`);
  }

  // 3. Verify SHA-256 Checksum
  const actualSha256 = await computeFileSha256(archivePath);
  if (expectedSha256 && actualSha256.toLowerCase() !== expectedSha256.toLowerCase()) {
    const errorMsg = `SHA-256 checksum mismatch! Expected: ${expectedSha256}, Got: ${actualSha256}`;
    writeAuditLog(userDir, {
      action: 'INSTALL_FAILED',
      module: moduleName,
      error: errorMsg,
      sha256: actualSha256,
      expectedSha256
    });
    throw new Error(errorMsg);
  }

  // 4. Staging directory for safe extraction
  const tmpStaging = path.join(os.tmpdir(), `mcp-nr-install-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`);
  fs.mkdirSync(tmpStaging, { recursive: true });

  const backupPackageJson = path.join(userDir, `package.json.bak.${Date.now()}`);
  const mainPackageJson = path.join(userDir, 'package.json');
  let hasBackup = false;

  try {
    // 5. Extract tar.gz into temporary staging
    await execFileAsync('tar', [
      '-xzf',
      archivePath,
      '-C', tmpStaging
    ]);

    // 6. Check manifest
    let manifest = {};
    const manifestPath = path.join(tmpStaging, 'manifest.json');
    if (fs.existsSync(manifestPath)) {
      manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    }

    if (manifest.module && manifest.module !== moduleName) {
      throw new Error(`Manifest module mismatch: expected "${moduleName}", but archive is for "${manifest.module}"`);
    }

    // 7. Ensure Node-RED userDir has package.json
    if (!fs.existsSync(mainPackageJson)) {
      fs.writeFileSync(mainPackageJson, JSON.stringify({
        name: 'node-red-project',
        description: 'A Node-RED Project',
        version: '0.0.1',
        dependencies: {}
      }, null, 2), 'utf8');
    } else {
      fs.copyFileSync(mainPackageJson, backupPackageJson);
      hasBackup = true;
    }

    // 8. Execute npm offline install using an isolated workspace
    // This prevents npm from attempting to reconcile existing unrelated packages in userDir
    const cacheDir = path.join(tmpStaging, 'cache');
    const targetVersion = manifest.resolved_version || version;
    const targetSpec = targetVersion ? `${moduleName}@${targetVersion}` : moduleName;

    const files = fs.readdirSync(tmpStaging);
    const tgzFile = files.find(f => f.endsWith('.tgz'));
    const installTarget = tgzFile ? path.join(tmpStaging, tgzFile) : targetSpec;

    const isolatedPrefix = path.join(tmpStaging, 'isolated_install');
    fs.mkdirSync(isolatedPrefix, { recursive: true });
    fs.writeFileSync(path.join(isolatedPrefix, 'package.json'), JSON.stringify({
      name: 'mcp-isolated-installer',
      version: '1.0.0',
      dependencies: {}
    }), 'utf8');

    const npmArgs = [
      'install',
      installTarget,
      '--prefix', isolatedPrefix,
      '--offline',
      '--no-audit',
      '--no-fund',
      '--omit=optional',
      '--ignore-scripts'
    ];

    if (fs.existsSync(cacheDir)) {
      npmArgs.push('--cache', cacheDir);
    }

    await execFileAsync('npm', npmArgs, { cwd: isolatedPrefix });

    // Copy installed modules from isolatedPrefix/node_modules into userDir/node_modules
    const isolatedNodeModules = path.join(isolatedPrefix, 'node_modules');
    const userNodeModules = path.join(userDir, 'node_modules');
    if (!fs.existsSync(userNodeModules)) {
      fs.mkdirSync(userNodeModules, { recursive: true });
    }

    if (fs.existsSync(isolatedNodeModules)) {
      fs.cpSync(isolatedNodeModules, userNodeModules, { recursive: true, force: true });
    }

    // Update userDir/package.json with standard semver dependency
    try {
      const currentPkg = JSON.parse(fs.readFileSync(mainPackageJson, 'utf8'));
      if (!currentPkg.dependencies) currentPkg.dependencies = {};
      currentPkg.dependencies[moduleName] = targetVersion ? `^${targetVersion}` : '*';
      fs.writeFileSync(mainPackageJson, JSON.stringify(currentPkg, null, 2), 'utf8');
    } catch (_) {}

    // Fix permissions if running on Linux as root (matches add_plugin_offline.sh)
    if (process.platform === 'linux' && process.getuid && process.getuid() === 0) {
      try {
        await execAsync(`chown -R nodered:nodered "${userDir}"`);
      } catch (_) {
        // Ignore if nodered user does not exist
      }
    }

    // 9. Hot-load into Node-RED or trigger restart
    let reloadMethod = 'none';
    let reloadSuccess = false;
    let reloadError = null;

    // Try Node-RED Admin API dynamic load: POST /nodes
    const token = await getNodeRedToken({
      nodeRedUrl,
      nodeRedToken,
      nodeRedUsername: options.nodeRedUsername,
      nodeRedPassword: options.nodeRedPassword
    });
    const headers = token ? { 'Authorization': 'Bearer ' + token } : {};
    try {
      const resp = await axios.post(
        `${nodeRedUrl}/nodes`,
        { module: moduleName },
        { headers, timeout: 10000 }
      );
      reloadMethod = 'admin_api_hot_reload';
      reloadSuccess = true;
    } catch (apiErr) {
      reloadError = apiErr.response?.data?.message || apiErr.message;
      // Fallback: If custom reload command or default systemctl on Linux is available
      const effectiveReloadCmd = reloadCommand || (process.platform === 'linux' ? 'systemctl restart nodered' : '');
      if (effectiveReloadCmd && effectiveReloadCmd.trim()) {
        try {
          await execAsync(effectiveReloadCmd);
          reloadMethod = `service_reload (${effectiveReloadCmd})`;
          reloadSuccess = true;
        } catch (cmdErr) {
          reloadError = `Admin API failed (${reloadError}) and reload command failed (${cmdErr.message})`;
        }
      }
    }

    // 10. Verification: Query GET /nodes/{module}
    let nodeInfo = null;
    try {
      const infoResp = await axios.get(`${nodeRedUrl}/nodes/${moduleName}`, { headers, timeout: 5000 });
      nodeInfo = infoResp.data;
    } catch (_) {
      // Ignore if verification query fails, nodeInfo remains null
    }

    const result = {
      success: true,
      module: moduleName,
      version: targetVersion,
      sha256: actualSha256,
      userDir,
      reloadMethod,
      reloadSuccess,
      reloadWarning: reloadSuccess ? null : reloadError,
      nodeInfo: nodeInfo || { status: 'installed', detail: 'Check Node-RED palette' },
      manifest
    };

    writeAuditLog(userDir, {
      action: 'INSTALL_SUCCESS',
      ...result
    });

    // Clean up backup if install succeeded
    if (hasBackup && fs.existsSync(backupPackageJson)) {
      fs.unlinkSync(backupPackageJson);
    }

    return result;
  } catch (err) {
    // Rollback package.json if backup exists
    if (hasBackup && fs.existsSync(backupPackageJson)) {
      try {
        fs.copyFileSync(backupPackageJson, mainPackageJson);
        fs.unlinkSync(backupPackageJson);
      } catch (_) {
        // Ignore rollback failure
      }
    }

    writeAuditLog(userDir, {
      action: 'INSTALL_FAILED',
      module: moduleName,
      error: err.message,
      sha256: actualSha256
    });

    throw err;
  } finally {
    // Clean up temporary workspace
    try {
      if (fs.existsSync(tmpStaging)) {
        fs.rmSync(tmpStaging, { recursive: true, force: true });
      }
    } catch (_) {
      // Ignore cleanup error
    }
  }
}
