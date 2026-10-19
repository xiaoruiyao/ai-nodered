/**
 * Offline package preparation engine for Node-RED modules
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { isModuleAllowed } from './catalog.mjs';

const execFileAsync = promisify(execFile);

/**
 * Computes SHA-256 hash of a file
 * @param {string} filePath
 * @returns {Promise<string>}
 */
export async function computeFileSha256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('error', reject);
    stream.on('data', chunk => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

/**
 * Prepares a self-contained offline package bundle for a Node-RED module
 * @param {Object} options
 * @param {string} options.module - npm module name (e.g. node-red-contrib-modbus)
 * @param {string} [options.version='latest'] - Target version or semver range
 * @param {string} [options.outputDir] - Target directory to store the generated package
 * @param {Array<string>|string} [options.whitelist] - Optional whitelist
 * @returns {Promise<Object>} Package metadata including package_id and sha256
 */
export async function prepareOfflinePackage(options) {
  const {
    module: moduleName,
    version = 'latest',
    outputDir = path.resolve(process.cwd(), 'packages-pool'),
    whitelist = null
  } = options;

  if (!moduleName) {
    throw new Error('Module name is required');
  }

  // Security check: Whitelist
  if (!isModuleAllowed(moduleName, whitelist)) {
    throw new Error(`Module "${moduleName}" is not permitted by the installation whitelist`);
  }

  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const tmpPrefix = path.join(os.tmpdir(), `mcp-nr-pack-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`);
  const stagingDir = path.join(tmpPrefix, 'bundle');
  const cacheDir = path.join(stagingDir, 'cache');
  const installPrefix = path.join(tmpPrefix, 'install');

  fs.mkdirSync(cacheDir, { recursive: true });
  fs.mkdirSync(installPrefix, { recursive: true });

  try {
    const targetSpec = `${moduleName}@${version}`;

    // 1. Install into temporary prefix with dedicated cache to populate offline cache
    await execFileAsync('npm', [
      'install',
      targetSpec,
      '--prefix', installPrefix,
      '--cache', cacheDir,
      '--prefer-offline=false',
      '--no-audit',
      '--no-fund',
      '--ignore-scripts'
    ]);

    // 2. Inspect the installed package.json
    let installedPkgJson = {};
    const pkgJsonPath = path.join(installPrefix, 'node_modules', moduleName, 'package.json');
    if (fs.existsSync(pkgJsonPath)) {
      installedPkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
    }

    const resolvedVersion = installedPkgJson.version || version;
    const hasNativeDeps = Boolean(
      installedPkgJson.gypfile ||
      fs.existsSync(path.join(installPrefix, 'node_modules', moduleName, 'binding.gyp')) ||
      (installedPkgJson.dependencies && ('prebuild-install' in installedPkgJson.dependencies || 'node-gyp' in installedPkgJson.dependencies))
    );

    // 3. Download tarball of the target package itself
    await execFileAsync('npm', [
      'pack',
      targetSpec
    ], { cwd: stagingDir });

    const safeName = moduleName.replace(/[/@]/g, '-').replace(/^-+/, '');
    const packageId = `pkg-${safeName}-${resolvedVersion}-${Date.now()}`;
    const archiveName = `${packageId}.tar.gz`;
    const finalArchiveFile = path.join(outputDir, archiveName);

    // 4. Create Manifest
    const manifest = {
      package_id: packageId,
      module: moduleName,
      resolved_version: resolvedVersion,
      created_at: new Date().toISOString(),
      has_native_deps: hasNativeDeps,
      node_red_nodes: installedPkgJson['node-red']?.nodes || {},
      target_platform: {
        os: process.platform,
        arch: process.arch,
        node: process.version
      }
    };

    fs.writeFileSync(
      path.join(stagingDir, 'manifest.json'),
      JSON.stringify(manifest, null, 2),
      'utf8'
    );

    // 5. Pack stagingDir into final tar.gz archive (strip macOS xattrs)
    const tarArgs = ['-czf', finalArchiveFile];
    if (process.platform === 'darwin') {
      tarArgs.unshift('--no-xattrs');
    }
    tarArgs.push('-C', stagingDir, '.');

    await execFileAsync('tar', tarArgs, {
      env: { ...process.env, COPYFILE_DISABLE: '1' }
    });

    // 6. Compute SHA-256
    const sha256 = await computeFileSha256(finalArchiveFile);
    const stats = fs.statSync(finalArchiveFile);

    return {
      success: true,
      package_id: packageId,
      package_file: finalArchiveFile,
      archive_name: archiveName,
      module: moduleName,
      version: resolvedVersion,
      sha256,
      size_bytes: stats.size,
      has_native_deps: hasNativeDeps,
      manifest
    };
  } finally {
    // Clean up temporary workspace
    try {
      if (fs.existsSync(tmpPrefix)) {
        fs.rmSync(tmpPrefix, { recursive: true, force: true });
      }
    } catch (_) {
      // Ignore cleanup error
    }
  }
}
