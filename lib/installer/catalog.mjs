/**
 * Knowledge base and mappings between Node-RED node types and npm packages
 */

export const KNOWN_NODE_MODULE_MAPPINGS = {
  // Industrial Protocols - Modbus
  'modbus-read': { module: 'node-red-contrib-modbus', description: 'Modbus TCP/Serial protocol support' },
  'modbus-write': { module: 'node-red-contrib-modbus', description: 'Modbus TCP/Serial protocol support' },
  'modbus-getter': { module: 'node-red-contrib-modbus', description: 'Modbus TCP/Serial protocol support' },
  'modbus-flex-getter': { module: 'node-red-contrib-modbus', description: 'Modbus TCP/Serial protocol support' },
  'modbus-server': { module: 'node-red-contrib-modbus', description: 'Modbus TCP/Serial protocol support' },
  'modbus-client': { module: 'node-red-contrib-modbus', description: 'Modbus TCP/Serial protocol support' },

  // Industrial Protocols - OPC UA
  'OpcUa-Client': { module: 'node-red-contrib-opcua', description: 'OPC UA client and server support' },
  'OpcUa-Server': { module: 'node-red-contrib-opcua', description: 'OPC UA client and server support' },
  'OpcUa-Browser': { module: 'node-red-contrib-opcua', description: 'OPC UA client and server support' },
  'opcua-client': { module: 'node-red-contrib-opcua', description: 'OPC UA client and server support' },
  'opcua-server': { module: 'node-red-contrib-opcua', description: 'OPC UA client and server support' },

  // Industrial Protocols - Siemens S7
  's7 in': { module: 'node-red-contrib-s7', description: 'Siemens S7 PLC communication (S7-300, S7-400, S7-1200, S7-1500)' },
  's7 out': { module: 'node-red-contrib-s7', description: 'Siemens S7 PLC communication' },
  's7 control': { module: 'node-red-contrib-s7', description: 'Siemens S7 PLC communication' },
  's7-endpoint': { module: 'node-red-contrib-s7', description: 'Siemens S7 PLC communication' },

  // Industrial Protocols - Mitsubishi MELSEC
  'melsec-read': { module: 'node-red-contrib-melsec', description: 'Mitsubishi MELSEC PLC protocol support' },
  'melsec-write': { module: 'node-red-contrib-melsec', description: 'Mitsubishi MELSEC PLC protocol support' },

  // Industrial Protocols - Omron FINS
  'omron-fins-read': { module: 'node-red-contrib-omron-fins', description: 'Omron FINS Ethernet protocol support' },
  'omron-fins-write': { module: 'node-red-contrib-omron-fins', description: 'Omron FINS Ethernet protocol support' },

  // Industrial Protocols - CAN Bus
  'can-bus-send': { module: 'node-red-contrib-canbus', description: 'SocketCAN / CAN bus communication' },
  'can-bus-receive': { module: 'node-red-contrib-canbus', description: 'SocketCAN / CAN bus communication' },

  // Serial Port
  'serial in': { module: 'node-red-node-serialport', description: 'Serial port communication (RS232/RS485)' },
  'serial out': { module: 'node-red-node-serialport', description: 'Serial port communication (RS232/RS485)' },
  'serial-port': { module: 'node-red-node-serialport', description: 'Serial port configuration' },

  // UI - Dashboard 1.0 & 2.0
  'ui_button': { module: 'node-red-dashboard', description: 'Classic Node-RED dashboard UI widgets' },
  'ui_text': { module: 'node-red-dashboard', description: 'Classic Node-RED dashboard UI widgets' },
  'ui_gauge': { module: 'node-red-dashboard', description: 'Classic Node-RED dashboard UI widgets' },
  'ui_chart': { module: 'node-red-dashboard', description: 'Classic Node-RED dashboard UI widgets' },
  'ui_template': { module: 'node-red-dashboard', description: 'Classic Node-RED dashboard UI widgets' },
  'ui-page': { module: '@flowfuse/node-red-dashboard', description: 'FlowFuse Node-RED Dashboard 2.0' },
  'ui-group': { module: '@flowfuse/node-red-dashboard', description: 'FlowFuse Node-RED Dashboard 2.0' },
  'ui-button': { module: '@flowfuse/node-red-dashboard', description: 'FlowFuse Node-RED Dashboard 2.0' },
  'ui-text': { module: '@flowfuse/node-red-dashboard', description: 'FlowFuse Node-RED Dashboard 2.0' },

  // Industrial Protocols - EtherNet/IP & CIP (Allen-Bradley / Rockwell)
  'eth-ip-in': { module: 'node-red-contrib-cip-ethernet-ip', description: 'EtherNet/IP communication for Allen-Bradley ControlLogix/CompactLogix' },
  'eth-ip-out': { module: 'node-red-contrib-cip-ethernet-ip', description: 'EtherNet/IP communication for Allen-Bradley ControlLogix/CompactLogix' },
  'eth-ip-endpoint': { module: 'node-red-contrib-cip-ethernet-ip', description: 'EtherNet/IP endpoint configuration' },

  // Industrial Tools - Open Protocol (Desoutter / Atlas Copco torque controllers)
  'open-protocol': { module: 'node-red-contrib-open-protocol-desoutter', description: 'Open Protocol communication with tightening/torque tools' },
  'open-protocol-desoutter': { module: 'node-red-contrib-open-protocol-desoutter', description: 'Open Protocol communication with tightening/torque tools' },

  // Databases & Time Series
  'clickhouse': { module: 'node-red-contrib-clickhouse', description: 'ClickHouse high-performance columnar database client' },
  'clickhouse-client': { module: 'node-red-contrib-clickhouse', description: 'ClickHouse database connection configuration' },
  'influxdb in': { module: 'node-red-contrib-influxdb', description: 'InfluxDB 1.x & 2.x read/query support' },
  'influxdb out': { module: 'node-red-contrib-influxdb', description: 'InfluxDB 1.x & 2.x write support' },
  'influxdb batch': { module: 'node-red-contrib-influxdb', description: 'InfluxDB batch write support' },
  'mysql': { module: 'node-red-node-mysql', description: 'MySQL database client' },
  'postgres': { module: 'node-red-contrib-postgresql', description: 'PostgreSQL database client' },
  'sqlite': { module: 'node-red-node-sqlite', description: 'SQLite file database client' },
  'redis': { module: 'node-red-contrib-redis', description: 'Redis key-value store client' },
  'mongodb': { module: 'node-red-node-mongodb', description: 'MongoDB client' },

  // Messaging & Streaming
  'kafkajs-producer': { module: 'node-red-contrib-kafkajs', description: 'Apache Kafka producer via KafkaJS' },
  'kafkajs-consumer': { module: 'node-red-contrib-kafkajs', description: 'Apache Kafka consumer via KafkaJS' },
  'kafka-consumer': { module: 'node-red-contrib-kafka-node', description: 'Apache Kafka consumer' },
  'kafka-producer': { module: 'node-red-contrib-kafka-node', description: 'Apache Kafka producer' },
  'amqp-in': { module: 'node-red-contrib-amqp', description: 'RabbitMQ / AMQP 0-9-1 consumer' },
  'amqp-out': { module: 'node-red-contrib-amqp', description: 'RabbitMQ / AMQP 0-9-1 producer' },

  // Utility Nodes
  'cronplus': { module: 'node-red-contrib-cron-plus', description: 'Flexible cron scheduler with dynamic schedule control' },
  'buffer-parser': { module: 'node-red-contrib-buffer-parser', description: 'High performance binary buffer data parser' },
  'tail': { module: 'node-red-contrib-tail-file', description: 'Watch and tail files line by line' },
  'e-mail': { module: 'node-red-node-email', description: 'Send and receive email messages' },
  'e-mail in': { module: 'node-red-node-email', description: 'Receive email messages via POP3/IMAP' }
};

// Built-in core Node-RED types that do NOT require external npm modules
export const CORE_NODE_TYPES = new Set([
  'tab',
  'subflow',
  'comment',
  'inject',
  'debug',
  'complete',
  'catch',
  'status',
  'link in',
  'link out',
  'link call',
  'function',
  'switch',
  'change',
  'range',
  'template',
  'delay',
  'trigger',
  'exec',
  'rbe',
  'filter',
  'csv',
  'html',
  'json',
  'xml',
  'yaml',
  'split',
  'join',
  'sort',
  'batch',
  'file',
  'file in',
  'watch',
  'http in',
  'http response',
  'http request',
  'tls-config',
  'websocket in',
  'websocket out',
  'websocket-listener',
  'websocket-client',
  'tcp in',
  'tcp out',
  'tcp request',
  'udp in',
  'udp out',
  'mqtt in',
  'mqtt out',
  'mqtt-broker'
]);

/**
 * Maps a node type to known npm module
 * @param {string} nodeType
 * @returns {{module: string, description: string, isKnown: boolean}}
 */
export function mapNodeTypeToModule(nodeType) {
  if (CORE_NODE_TYPES.has(nodeType)) {
    return {
      module: 'node-red (core)',
      description: 'Built-in core Node-RED node type',
      isCore: true,
      isKnown: true
    };
  }

  const match = KNOWN_NODE_MODULE_MAPPINGS[nodeType];
  if (match) {
    return {
      module: match.module,
      description: match.description,
      isCore: false,
      isKnown: true
    };
  }

  return {
    module: null,
    description: 'Unknown node type, manual resolution needed',
    isCore: false,
    isKnown: false
  };
}

/**
 * Check if a module is permitted by the whitelist policy
 * @param {string} moduleName
 * @param {Array<string>|string|null} whitelist
 * @returns {boolean}
 */
export function isModuleAllowed(moduleName, whitelist = null) {
  if (!whitelist) return true; // No whitelist configured = allow all

  const list = Array.isArray(whitelist)
    ? whitelist
    : String(whitelist).split(',').map(s => s.trim()).filter(Boolean);

  if (list.length === 0 || list.includes('*')) return true;

  return list.some(item => {
    if (item.endsWith('*')) {
      const prefix = item.slice(0, -1);
      return moduleName.startsWith(prefix);
    }
    return item === moduleName;
  });
}
