#!/usr/bin/env node

/**
 * CLI utility to package Node-RED module(s) offline with all dependencies
 * Run this on a machine with internet/npm access.
 */

import { prepareOfflinePackage } from '../lib/installer/packager.mjs';
import path from 'path';
import fs from 'fs';

const args = process.argv.slice(2);

if (args.length === 0 || args[0] === '-h' || args[0] === '--help') {
  console.log(`
Offline Package Bundler for Node-RED

Usage:
  # Package a single module:
  node bin/pack-module.mjs <module_name> [version] [output_dir]

  # Package multiple modules from a list file (e.g. plugins.txt):
  node bin/pack-module.mjs --file <plugins_file> [output_dir]

Examples:
  node bin/pack-module.mjs node-red-contrib-modbus 5.30.0 ./packages-pool
  node bin/pack-module.mjs --file plugins.txt ./packages-pool
`);
  process.exit(0);
}

let modulesToPack = [];
let outputDir = path.resolve(process.cwd(), 'packages-pool');

if (args[0] === '--file' || args[0] === '-f') {
  const filePath = path.resolve(args[1]);
  if (!fs.existsSync(filePath)) {
    console.error(`Error: File not found: ${filePath}`);
    process.exit(1);
  }
  if (args[2]) {
    outputDir = path.resolve(args[2]);
  }
  const lines = fs.readFileSync(filePath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    // Parse name and optional version (e.g. node-red-node-mysql@1.0.3)
    let moduleName = trimmed;
    let version = 'latest';
    const atIndex = trimmed.lastIndexOf('@');
    if (atIndex > 0) {
      moduleName = trimmed.slice(0, atIndex);
      version = trimmed.slice(atIndex + 1);
    }
    modulesToPack.push({ module: moduleName, version });
  }
} else {
  const moduleName = args[0];
  const version = args[1] && !args[1].startsWith('/') && !args[1].startsWith('.') ? args[1] : 'latest';
  if (args[2]) {
    outputDir = path.resolve(args[2]);
  } else if (args[1] && (args[1].startsWith('/') || args[1].startsWith('.'))) {
    outputDir = path.resolve(args[1]);
  }
  modulesToPack.push({ module: moduleName, version });
}

console.log(`\n📦 Modules to package: ${modulesToPack.length}`);
console.log(`📁 Target directory:   ${outputDir}\n`);

const results = [];

for (let i = 0; i < modulesToPack.length; i++) {
  const item = modulesToPack[i];
  console.log(`[${i + 1}/${modulesToPack.length}] Packaging ${item.module}@${item.version}...`);
  try {
    const res = await prepareOfflinePackage({
      module: item.module,
      version: item.version,
      outputDir
    });
    console.log(`  ✓ Created ${res.archive_name} (SHA-256: ${res.sha256.slice(0, 16)}...)`);
    results.push(res);
  } catch (err) {
    console.error(`  ✗ Failed: ${err.message}`);
  }
}

console.log(`\n========================================`);
console.log(`Finished: ${results.length}/${modulesToPack.length} packages created successfully.`);
console.log(`Copy the generated .tar.gz files in "${outputDir}" to your server's packages-pool.`);
console.log(`========================================\n`);
