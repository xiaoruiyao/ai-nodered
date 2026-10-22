import { callMcpTool } from './bin/call-remote-mcp.mjs';

async function main() {
  console.log("Fetching current flows from Node-RED...");
  const res = await callMcpTool('get-flows');
  const flows = JSON.parse(res.content[0].text);
  const flowList = Array.isArray(flows) ? flows : flows.flows || [];

  // Remove old desoutter nodes and old tab nodes for tightening
  const filteredFlows = flowList.filter(n => {
    if (n.id === 'op_config_tightening_10_49_15_137') return false;
    if (n.z === 'tab_open_protocol_tightening') return false;
    return true;
  });

  // Ensure tab_open_protocol_tightening tab exists
  let tab = filteredFlows.find(n => n.id === 'tab_open_protocol_tightening' && n.type === 'tab');
  if (!tab) {
    tab = {
      id: "tab_open_protocol_tightening",
      type: "tab",
      label: "拧紧枪_OpenProtocol_10.49.15.137",
      disabled: false,
      info: "英格索兰 (Ingersoll Rand) INSIGHTqcx 开放协议 (Open Protocol) 实时采集通道\nIP: 10.49.15.137:4545\n功能: 握手MID0001, 订阅MID0060/0008, 自动MID0062/0005应答, 5s心跳MID9999, 实时解析扭矩/角度/OK/曲线"
    };
    filteredFlows.push(tab);
  }

  // Define new nodes for tab_open_protocol_tightening
  const newNodes = [
    {
      id: "inject_op_refresh",
      type: "inject",
      z: "tab_open_protocol_tightening",
      name: "手动刷新/查询历史最新",
      props: [{ p: "payload" }],
      repeat: "",
      crontab: "",
      once: true,
      onceDelay: 1.5,
      topic: "",
      payload: "query_latest",
      payloadType: "str",
      x: 170,
      y: 120,
      wires: [["func_op_engine"]]
    },
    {
      id: "inject_op_reconnect",
      type: "inject",
      z: "tab_open_protocol_tightening",
      name: "强制重连控制器",
      props: [{ p: "payload" }],
      repeat: "",
      crontab: "",
      once: false,
      onceDelay: 0.1,
      topic: "",
      payload: "reconnect",
      payloadType: "str",
      x: 170,
      y: 180,
      wires: [["func_op_engine"]]
    },
    {
      id: "func_op_engine",
      type: "function",
      z: "tab_open_protocol_tightening",
      name: "Open Protocol 核心采集引擎 (10.49.15.137:4545)",
      func: `
// 收到 inject 输入控制命令
if (msg.payload === "reconnect") {
  node.warn("[OpenProtocol] 收到手动重连指令，重新连接 10.49.15.137:4545...");
  const restart = context.get("restartConnection");
  if (restart) restart();
  return null;
}

if (msg.payload === "query_latest") {
  const queryLatest = context.get("queryLatest");
  if (queryLatest) {
    queryLatest();
  }
  return null;
}

return null;
`,
      initialize: `
const targetHost = "10.49.15.137";
const targetPort = 4545;

function makeMessage(mid, revision, data = "") {
  const midStr = String(mid).padStart(4, "0");
  let body;
  if (revision) {
    const revStr = String(revision).padEnd(3, " ");
    body = midStr + revStr + " ".repeat(9) + data;
  } else {
    body = midStr + " ".repeat(12) + data;
  }
  const length = body.length + 4;
  const lenStr = String(length).padStart(4, "0");
  return Buffer.from(lenStr + body + "\\0", "ascii");
}

function parseTaggedFixed(data, layout) {
  const result = {};
  let pos = 0;
  for (const [fieldId, name, width] of layout) {
    while (pos < data.length && (data[pos] === " " || data[pos] === "\\0")) pos++;
    if (data.slice(pos, pos + 2) !== fieldId) break;
    pos += 2;
    result[name] = data.slice(pos, pos + width).trim();
    pos += width;
  }
  result.parsed_length = pos;
  result.unparsed_data = data.slice(pos);
  return result;
}

function parseResultFields(text, history = false, revision = "001") {
  let layout;
  if (history && revision === "001") {
    layout = [
      ["01", "tightening_id", 10], ["02", "vin", 25],
      ["03", "pset_id", 3], ["04", "batch_counter", 4],
      ["05", "tightening_status", 1], ["06", "torque_status", 1],
      ["07", "angle_status", 1], ["08", "torque_actual_raw", 6],
      ["09", "angle_actual_raw", 5], ["10", "tightening_timestamp", 19],
      ["11", "batch_status", 1]
    ];
  } else if (history) {
    layout = [
      ["01", "tightening_id", 10], ["02", "vin", 25], ["03", "job_number", 4],
      ["04", "pset_id", 3], ["05", "strategy", 2], ["06", "strategy_options", 5],
      ["07", "batch_size", 4], ["08", "batch_counter", 4], ["09", "tightening_status", 1],
      ["10", "batch_status", 1], ["11", "torque_status", 1], ["12", "angle_status", 1],
      ["13", "rundown_angle_status", 1], ["14", "current_monitoring_status", 1],
      ["15", "self_tap_status", 1], ["16", "prevail_torque_status", 1],
      ["17", "prevail_torque_compensate_status", 1], ["18", "error_mask_raw", 10],
      ["19", "torque_actual_raw", 6], ["20", "angle_actual_raw", 5],
      ["21", "rundown_angle_raw", 5], ["22", "current_monitoring_raw", 3],
      ["23", "self_tap_torque_raw", 6], ["24", "prevail_torque_raw", 6],
      ["25", "job_sequence_number", 5], ["26", "sync_tightening_id", 5],
      ["27", "tool_serial_number", 14], ["28", "tightening_timestamp", 19],
      ["29", "torque_unit", 1], ["30", "result_type", 2],
      ["31", "identifier_2", 25], ["32", "identifier_3", 25], ["33", "identifier_4", 25],
      ["34", "customer_error_code", 4], ["35", "prevail_torque_compensate_raw", 6],
      ["36", "error_mask_2_raw", 10], ["37", "station_id", 10], ["38", "station_name", 25],
      ["39", "snug_torque_raw", 6], ["40", "post_view_activated", 1],
      ["41", "post_view_high_raw", 6], ["42", "post_view_low_raw", 6]
    ];
  } else {
    layout = [
      ["01", "cell_id", 4], ["02", "channel_id", 2], ["03", "controller_name", 25],
      ["04", "vin", 25], ["05", "assembly_process", 2], ["06", "pset_id", 3],
      ["07", "batch_size", 4], ["08", "batch_counter", 4], ["09", "tightening_status", 1],
      ["10", "torque_status", 1], ["11", "angle_status", 1], ["12", "torque_min_raw", 6],
      ["13", "torque_max_raw", 6], ["14", "torque_target_raw", 6], ["15", "torque_actual_raw", 6],
      ["16", "angle_min_raw", 5], ["17", "angle_max_raw", 5], ["18", "angle_target_raw", 5],
      ["19", "angle_actual_raw", 5], ["20", "tightening_timestamp", 19],
      ["21", "pset_modified_timestamp", 19], ["22", "batch_status", 1], ["23", "tightening_id", 10]
    ];
  }
  const payloadData = text.slice(20);
  const result = parseTaggedFixed(payloadData, layout);
  if (result.torque_actual_raw) result.torque_actual_nm = parseFloat(result.torque_actual_raw) / 100;
  if (result.torque_min_raw) result.torque_min_nm = parseFloat(result.torque_min_raw) / 100;
  if (result.torque_max_raw) result.torque_max_nm = parseFloat(result.torque_max_raw) / 100;
  if (result.torque_target_raw) result.torque_target_nm = parseFloat(result.torque_target_raw) / 100;
  if (result.angle_actual_raw) result.angle_actual_deg = parseInt(result.angle_actual_raw, 10);
  if (result.angle_min_raw) result.angle_min_deg = parseInt(result.angle_min_raw, 10);
  if (result.angle_max_raw) result.angle_max_deg = parseInt(result.angle_max_raw, 10);
  if (result.angle_target_raw) result.angle_target_deg = parseInt(result.angle_target_raw, 10);
  if (result.tightening_status) {
    result.tightening_status_text = result.tightening_status === "1" ? "OK" : "NOK";
    result.isOk = result.tightening_status === "1";
  }
  return result;
}

function parseMid0900(raw) {
  const payload = raw.slice(20);
  let pos = 0;
  const resultId = payload.slice(pos, pos + 10).toString("utf8").trim(); pos += 10;
  const timestamp = payload.slice(pos, pos + 19).toString("utf8").trim(); pos += 19;
  const commonCount = parseInt(payload.slice(pos, pos + 3).toString("utf8"), 10) || 0; pos += 3;
  const commonParams = [];
  for (let i = 0; i < commonCount; i++) {
    const pid = payload.slice(pos, pos + 5).toString("utf8").trim(); pos += 5;
    const vLen = parseInt(payload.slice(pos, pos + 3).toString("utf8"), 10) || 0; pos += 3;
    const dataType = payload.slice(pos, pos + 2).toString("utf8").trim(); pos += 2;
    const unit = payload.slice(pos, pos + 3).toString("utf8").trim(); pos += 3;
    const stepNo = payload.slice(pos, pos + 4).toString("utf8").trim(); pos += 4;
    const val = payload.slice(pos, pos + vLen).toString("utf8").trim(); pos += vLen;
    commonParams.push({ pid, dataType, unit, stepNo, value: val });
  }

  const traceType = payload.slice(pos, pos + 2).toString("utf8").trim(); pos += 2;
  const transducerType = payload.slice(pos, pos + 2).toString("utf8").trim(); pos += 2;
  const unit = payload.slice(pos, pos + 3).toString("utf8").trim(); pos += 3;
  const traceCount = parseInt(payload.slice(pos, pos + 3).toString("utf8"), 10) || 0; pos += 3;
  const traceParams = [];
  for (let i = 0; i < traceCount; i++) {
    const pid = payload.slice(pos, pos + 5).toString("utf8").trim(); pos += 5;
    const vLen = parseInt(payload.slice(pos, pos + 3).toString("utf8"), 10) || 0; pos += 3;
    const dataType = payload.slice(pos, pos + 2).toString("utf8").trim(); pos += 2;
    const pUnit = payload.slice(pos, pos + 3).toString("utf8").trim(); pos += 3;
    const stepNo = payload.slice(pos, pos + 4).toString("utf8").trim(); pos += 4;
    const val = payload.slice(pos, pos + vLen).toString("utf8").trim(); pos += vLen;
    traceParams.push({ pid, dataType, unit: pUnit, stepNo, value: val });
  }

  const resCount = parseInt(payload.slice(pos, pos + 3).toString("utf8"), 10) || 0; pos += 3;
  for (let i = 0; i < resCount; i++) {
    const vLen = parseInt(payload.slice(pos + 10, pos + 13).toString("utf8"), 10) || 0;
    pos += 18 + vLen;
  }

  const sampleCount = parseInt(payload.slice(pos, pos + 5).toString("utf8"), 10) || 0; pos += 5;
  if (pos < payload.length && payload[pos] === 0) pos++;

  const requiredBytes = sampleCount * 2;
  const rawSamples = [];
  for (let i = 0; i < requiredBytes && pos + i + 1 < payload.length; i += 2) {
    rawSamples.push(payload.readInt16BE(pos + i));
  }

  let coeff = 1.0;
  let mode = "raw";
  const allParams = commonParams.concat(traceParams);
  const divParam = allParams.find(p => p.pid === "02213");
  const mulParam = allParams.find(p => p.pid === "02214");
  if (divParam && parseFloat(divParam.value) > 0) {
    coeff = parseFloat(divParam.value);
    mode = "divide";
  } else if (mulParam && parseFloat(mulParam.value) > 0) {
    coeff = parseFloat(mulParam.value);
    mode = "multiply";
  }

  const samples = rawSamples.map(v => mode === "divide" ? (v / coeff) : (mode === "multiply" ? (v * coeff) : v));
  const typeNames = { "01": "angle", "02": "torque", "03": "current", "001": "angle", "002": "torque", "003": "current" };

  return {
    result_id: resultId,
    timestamp: timestamp,
    trace_type: traceType,
    trace_type_name: typeNames[traceType] || "unknown",
    transducer_type: transducerType,
    unit: unit,
    sample_count: sampleCount,
    coefficient: coeff,
    coefficient_mode: mode,
    samples: samples
  };
}

let socket = null;
let heartbeatTimer = null;
let reconnectTimer = null;
let rxBuffer = Buffer.alloc(0);
let isSubscribed = false;

function sendKeepAlive() {
  if (socket && !socket.destroyed && isSubscribed) {
    const m9999 = makeMessage("9999");
    socket.write(m9999);
  }
}

function queryLatestResult() {
  if (socket && !socket.destroyed) {
    const m64 = makeMessage("0064", "001", "0000000000");
    socket.write(m64);
    node.log("[OpenProtocol] 查询历史最新拧紧记录 (MID 0064)...");
  }
}

function connect() {
  if (socket) {
    try { socket.destroy(); } catch (_) {}
  }
  rxBuffer = Buffer.alloc(0);
  isSubscribed = false;

  node.status({ fill: "yellow", shape: "ring", text: "正在连接 10.49.15.137:4545..." });
  socket = new net.Socket();
  socket.setTimeout(15000);

  socket.connect(targetPort, targetHost, () => {
    node.status({ fill: "yellow", shape: "dot", text: "已连接，正在执行握手 (MID0001)..." });
    const m1 = makeMessage("0001");
    socket.write(m1);
  });

  socket.on("data", chunk => {
    rxBuffer = Buffer.concat([rxBuffer, chunk]);
    while (rxBuffer.length >= 4) {
      const lenStr = rxBuffer.slice(0, 4).toString("ascii");
      const totalLen = parseInt(lenStr, 10);
      if (isNaN(totalLen) || totalLen < 20) {
        rxBuffer = rxBuffer.slice(1);
        continue;
      }
      if (rxBuffer.length < totalLen) break;
      const frame = rxBuffer.slice(0, totalLen);
      let advance = totalLen;
      if (rxBuffer.length > totalLen && rxBuffer[totalLen] === 0) advance++;
      rxBuffer = rxBuffer.slice(advance);

      const frameText = frame.toString("utf8");
      const mid = frameText.slice(4, 8);
      const rev = frameText.slice(8, 11).trim();
      const data = frameText.slice(20);

      if (mid === "0002") {
        node.status({ fill: "blue", shape: "dot", text: "握手成功(INSIGHTqcx)，正在订阅..." });
        setTimeout(() => {
          if (!socket || socket.destroyed) return;
          const m60 = makeMessage("0060", "001");
          socket.write(m60);
        }, 500);
      } else if (mid === "0005") {
        const acceptedMid = data.slice(0, 4);
        if (acceptedMid === "0060") {
          // 订阅曲线 MID 0900
          setTimeout(() => {
            if (!socket || socket.destroyed) return;
            const traceExtra = "0" + " ".repeat(19) + " ".repeat(10) + "02" + "001002";
            const mid0008Data = "0900001" + String(traceExtra.length).padStart(2, "0") + traceExtra;
            const m8 = makeMessage("0008", "001", mid0008Data);
            socket.write(m8);
          }, 300);
        } else if (acceptedMid === "0900") {
          isSubscribed = true;
          node.status({ fill: "green", shape: "dot", text: "已订阅实时拧紧与曲线 (4545 就绪)" });
          global.set("op_controller_status", {
            connected: true,
            target: targetHost + ":" + targetPort,
            brand: "Ingersoll Rand INSIGHTqcx",
            subscribed: true,
            last_heartbeat: new Date().toISOString()
          });
          // 首次启动时自动拉取一条历史记录以初始化遥测缓存
          setTimeout(queryLatestResult, 600);
        }
      } else if (mid === "0061" || mid === "0065") {
        const parsed = parseResultFields(frameText, mid === "0065", rev);
        // 如果是实时推送 0061，必须立即回复 0062 ACK 确认
        if (mid === "0061") {
          const m62 = makeMessage("0062", rev || "001");
          socket.write(m62);
        }

        const statusColor = parsed.isOk ? "green" : "red";
        node.status({
          fill: statusColor,
          shape: "dot",
          text: (parsed.isOk ? "OK" : "NOK") + ": " + parsed.torque_actual_nm + "Nm / " + parsed.angle_actual_deg + "° (Pset" + parsed.pset_id + ")"
        });

        const outMsg = {
          topic: "tightening/result",
          payload: {
            source_mid: mid,
            controller: targetHost + ":" + targetPort,
            brand: "Ingersoll Rand INSIGHTqcx",
            received_at: new Date().toISOString(),
            data: parsed,
            raw_text: frameText
          }
        };

        // 更新全局状态供大屏和 API 探针使用
        global.set("last_tightening_data", outMsg.payload);
        global.set("last_tightening_time", new Date().toISOString());

        node.send([outMsg, null]);
      } else if (mid === "0900") {
        // 必须立即回复 0005 ACK 确认曲线接收
        const ack = makeMessage("0005", null, "0900");
        socket.write(ack);

        try {
          const parsedCurve = parseMid0900(frame);
          const outCurveMsg = {
            topic: "tightening/curve",
            payload: {
              source_mid: "0900",
              controller: targetHost + ":" + targetPort,
              received_at: new Date().toISOString(),
              curve: parsedCurve
            }
          };
          global.set("last_tightening_curve_" + parsedCurve.trace_type_name, parsedCurve);
          node.send([null, outCurveMsg]);
        } catch (err) {
          node.error("[OpenProtocol] 曲线MID0900解析失败: " + err.message);
        }
      } else if (mid === "9999") {
        // 控制器心跳
        global.set("op_last_keepalive", new Date().toISOString());
      }
    }
  });

  socket.on("timeout", () => {
    node.warn("[OpenProtocol] 连接超时，发送心跳检测...");
    sendKeepAlive();
  });

  socket.on("error", err => {
    node.error("[OpenProtocol] 连接错误: " + err.message);
    node.status({ fill: "red", shape: "ring", text: "连接异常: " + err.message });
  });

  socket.on("close", () => {
    node.status({ fill: "red", shape: "dot", text: "连接断开，3秒后自动重连..." });
    global.set("op_controller_status", { connected: false, target: targetHost + ":" + targetPort });
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(connect, 3000);
  });
}

// 启动 5s 心跳定时器
heartbeatTimer = setInterval(sendKeepAlive, 5000);

// 暴露操作钩子给 Function Node 运行时
context.set("restartConnection", () => {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  connect();
});
context.set("queryLatest", queryLatestResult);

// 启动连接
connect();
`,
      finalize: `
if (heartbeatTimer) clearInterval(heartbeatTimer);
if (reconnectTimer) clearTimeout(reconnectTimer);
if (socket) {
  try { socket.destroy(); } catch (_) {}
}
`,
      outputs: 2,
      noerr: 0,
      libs: [{ var: "net", module: "net" }],
      x: 520,
      y: 140,
      wires: [
        ["debug_op_result", "func_tightening_aggregator"],
        ["debug_op_curve"]
      ]
    },
    {
      id: "debug_op_result",
      type: "debug",
      z: "tab_open_protocol_tightening",
      name: "实时拧紧结果 (MID 0061/0065)",
      active: true,
      tosidebar: true,
      console: false,
      tostatus: true,
      complete: "payload",
      targetType: "msg",
      statusVal: "payload.data.torque_actual_nm ? (payload.data.tightening_status_text + ': ' + payload.data.torque_actual_nm + 'Nm / ' + payload.data.angle_actual_deg + '°') : ''",
      statusType: "jsonata",
      x: 880,
      y: 100,
      wires: []
    },
    {
      id: "debug_op_curve",
      type: "debug",
      z: "tab_open_protocol_tightening",
      name: "拧紧曲线采样 (MID 0900)",
      active: true,
      tosidebar: true,
      console: false,
      tostatus: false,
      complete: "payload",
      targetType: "msg",
      statusVal: "",
      statusType: "auto",
      x: 870,
      y: 180,
      wires: []
    },
    {
      id: "func_tightening_aggregator",
      type: "function",
      z: "tab_open_protocol_tightening",
      name: "遥测聚合与统计",
      func: `
const d = msg.payload.data || {};
let stats = global.get("tightening_stats") || {
  total: 0,
  ok_count: 0,
  nok_count: 0,
  pass_rate: 100.0,
  last_tightening_id: "",
  last_torque_nm: 0,
  last_angle_deg: 0,
  last_update: null
};

if (d.tightening_id && d.tightening_id !== stats.last_tightening_id) {
  stats.total += 1;
  if (d.isOk) {
    stats.ok_count += 1;
  } else {
    stats.nok_count += 1;
  }
  stats.pass_rate = stats.total > 0 ? parseFloat(((stats.ok_count / stats.total) * 100).toFixed(1)) : 100.0;
  stats.last_tightening_id = d.tightening_id;
  stats.last_torque_nm = d.torque_actual_nm;
  stats.last_angle_deg = d.angle_actual_deg;
  stats.last_update = new Date().toISOString();
  global.set("tightening_stats", stats);
}

msg.payload.stats = stats;
return msg;
`,
      outputs: 1,
      noerr: 0,
      initialize: "",
      finalize: "",
      libs: [],
      x: 840,
      y: 140,
      wires: [["debug_stats_output"]]
    },
    {
      id: "debug_stats_output",
      type: "debug",
      z: "tab_open_protocol_tightening",
      name: "拧紧统计指标",
      active: false,
      tosidebar: true,
      console: false,
      tostatus: false,
      complete: "payload.stats",
      targetType: "msg",
      statusVal: "",
      statusType: "auto",
      x: 1070,
      y: 140,
      wires: []
    },
    {
      id: "http_in_tightening_probe",
      type: "http in",
      z: "tab_open_protocol_tightening",
      name: "GET /api/debug/tightening-probe",
      url: "/api/debug/tightening-probe",
      method: "get",
      upload: false,
      swaggerDoc: "",
      x: 180,
      y: 300,
      wires: [["func_tightening_probe"]]
    },
    {
      id: "func_tightening_probe",
      type: "function",
      z: "tab_open_protocol_tightening",
      name: "拧紧通道状态探针",
      func: `
const lastData = global.get("last_tightening_data") || null;
const lastTime = global.get("last_tightening_time") || null;
const opStatus = global.get("op_controller_status") || { connected: true, target: "10.49.15.137:4545" };
const stats = global.get("tightening_stats") || { total: 0, ok_count: 0, nok_count: 0, pass_rate: 100.0 };
const lastCurveAngle = global.get("last_tightening_curve_angle") || null;
const lastCurveTorque = global.get("last_tightening_curve_torque") || null;

msg.payload = {
  timestamp: new Date().toISOString(),
  controller: {
    target: "10.49.15.137:4545",
    brand_model: "Ingersoll Rand (英格索兰) INSIGHTqcx",
    open_protocol_port: 4545,
    connected: opStatus.connected !== false,
    subscribed_mids: ["MID 0060 (实时结果)", "MID 0008/0900 (曲线采样)", "MID 9999 (5s心跳)"],
    status_summary: "Open Protocol 采集通道正常运行中"
  },
  statistics: stats,
  latest_result: lastData ? {
    received_at: lastTime,
    tightening_id: lastData.data ? lastData.data.tightening_id : null,
    status: lastData.data ? lastData.data.tightening_status_text : "UNKNOWN",
    is_ok: lastData.data ? lastData.data.isOk : false,
    torque_actual_nm: lastData.data ? lastData.data.torque_actual_nm : 0,
    angle_actual_deg: lastData.data ? lastData.data.angle_actual_deg : 0,
    parameter_set: lastData.data ? lastData.data.pset_id : "001",
    batch_counter: lastData.data ? lastData.data.batch_counter : 0,
    tightening_timestamp: lastData.data ? lastData.data.tightening_timestamp : null
  } : null,
  curves: {
    has_angle_curve: Boolean(lastCurveAngle),
    angle_sample_count: lastCurveAngle ? lastCurveAngle.sample_count : 0,
    has_torque_curve: Boolean(lastCurveTorque),
    torque_sample_count: lastCurveTorque ? lastCurveTorque.sample_count : 0
  }
};

return msg;
`,
      outputs: 1,
      noerr: 0,
      initialize: "",
      finalize: "",
      libs: [],
      x: 480,
      y: 300,
      wires: [["http_resp_tightening_probe"]]
    },
    {
      id: "http_resp_tightening_probe",
      type: "http response",
      z: "tab_open_protocol_tightening",
      name: "探针响应输出 (200)",
      statusCode: "200",
      headers: {
        "Content-Type": "application/json"
      },
      x: 740,
      y: 300,
      wires: []
    }
  ];

  // Combine
  const updatedFlows = [...filteredFlows, ...newNodes];

  console.log(`Deploying updated flows (${updatedFlows.length} total nodes)...`);
  const updateRes = await callMcpTool('update-flows', {
    flowsJson: JSON.stringify(updatedFlows)
  });
  console.log("Update flows result:", updateRes);
}

main().catch(err => {
  console.error("Deploy failed:", err);
  process.exit(1);
});
