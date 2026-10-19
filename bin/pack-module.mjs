#!/usr/bin/env node

/**
 * CLI utility to package a Node-RED module offline with all dependencies
 * Run this on a machine with internet/npm access.
 */

import { prepareOfflinePackage } from '../lib/installer/packager.mjs';
import path from 'path';

const args = process.argv.slice(2);

if (args.length === 0 || args[0] === '-h' || args[0] === '--help') {
  console.log(`
Offline Package Bundler for Node-RED

Usage:
  node bin/pack-module.mjs <module_name> [version] [output_dir]

Example:
  node bin/pack-module.mjs node-red-contrib-modbus 5.30.0 ./packages-pool
`);
  process.exit(0);
}

const moduleName = args[0];
const version = args[1] || 'latest';
const outputDir = args[2] ? path.resolve(args[2]) : path.resolve(process.cwd(), 'packages-pool');

console.log(`\n📦 Packaging module: ${moduleName}@${version}`);
console.log(`📁 Target directory: ${outputDir}`);
console.log(`⏳ Resolving and downloading all dependencies via npm...`);

try {
  const result = await prepareOfflinePackage({
    module: moduleName,
    version,
    outputDir
  });

  console.log(`\n✅ Package prepared successfully!`);
  console.log(`----------------------------------------`);
  console.log(`Package ID:    ${result.package_id}`);
  console.log(`Package File:  ${result.package_file}`);
  console.log(`Version:       ${result.version}`);
  console.log(`SHA-256:       ${result.sha256}`);
  console.log(`Size (bytes):  ${result.size_bytes}`);
  console.log(`Native Deps:   ${result.has_native_deps ? 'YES' : 'NO'}`);
  console.log(`----------------------------------------`);
  console.log(`\nNext Steps:`);
  console.log(`1. Copy ${result.archive_name} to your server's packages-pool directory.`);
  console.log(`2. Instruct AI or MCP to install using:`);
  console.log(`   package_id: "${result.package_id}"`);
  console.log(`   sha256:     "${result.sha256}"\n`);
} catch (err) {
  console.error(`\n❌ Failed to prepare package:`, err.message);
  process.exit(1);
}
