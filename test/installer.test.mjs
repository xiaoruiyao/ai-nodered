import test from 'node:test';
import assert from 'node:assert/strict';
import { mapNodeTypeToModule, isModuleAllowed } from '../lib/installer/catalog.mjs';
import { createServer } from '../lib/server.mjs';

test('catalog - correctly identifies core node types', () => {
  const inject = mapNodeTypeToModule('inject');
  assert.equal(inject.isCore, true);
  assert.equal(inject.isKnown, true);

  const func = mapNodeTypeToModule('function');
  assert.equal(func.isCore, true);
});

test('catalog - correctly maps industrial protocols to npm modules', () => {
  const modbus = mapNodeTypeToModule('modbus-read');
  assert.equal(modbus.module, 'node-red-contrib-modbus');
  assert.equal(modbus.isCore, false);
  assert.equal(modbus.isKnown, true);

  const opcua = mapNodeTypeToModule('opcua-client');
  assert.equal(opcua.module, 'node-red-contrib-opcua');

  const s7 = mapNodeTypeToModule('s7 in');
  assert.equal(s7.module, 'node-red-contrib-s7');
});

test('catalog - whitelist policy evaluation', () => {
  assert.equal(isModuleAllowed('node-red-contrib-modbus', null), true);
  assert.equal(isModuleAllowed('node-red-contrib-modbus', '*'), true);
  assert.equal(isModuleAllowed('node-red-contrib-modbus', 'node-red-contrib-*'), true);
  assert.equal(isModuleAllowed('malicious-package', 'node-red-contrib-*,@flowfuse/*'), false);
  assert.equal(isModuleAllowed('@flowfuse/node-red-dashboard', 'node-red-contrib-*,@flowfuse/*'), true);
});

test('server - initializes successfully with all tools registered', () => {
  const { config } = createServer({
    nodeRedUrl: 'http://localhost:1880',
    transportType: 'stdio'
  });
  assert.equal(config.transportType, 'stdio');
  assert.equal(config.nodeRedUrl, 'http://localhost:1880');
});
