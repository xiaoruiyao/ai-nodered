# Industrial Protocols & Integration Guide

## 1. Modbus (`node-red-contrib-modbus`)

The `node-red-contrib-modbus` (v5.45.2) package is pre-installed on the host.

### Supported Protocols:
- **Modbus TCP**: Ethernet-based communication with PLCs, remote IO racks, power meters, welding controllers.
- **Modbus RTU / ASCII**: Serial RS-485 / RS-232 communication.
- **Modbus RTU-Buffered**: Buffer-managed serial communication to prevent collision.

### Key Node Types:
1. `modbus-client`: Global configuration for IP address, port (502 default), unit ID, timeouts, and reconnect intervals.
2. `modbus-read`: Periodic polling node (Interval mode: ms / sec / min).
3. `modbus-getter`: Trigger-based single read on upstream message arrival.
4. `modbus-flex-getter`: Dynamic read where `msg.payload` specifies:
   ```json
   {
     "value": 1,
     "fc": 3,
     "unitid": 1,
     "address": 40001,
     "quantity": 10
   }
   ```
5. `modbus-write`: Writes coils (FC5/FC15) or holding registers (FC6/FC16).
6. `modbus-flex-write`: Dynamic write controlled by payload values and addresses.
7. `modbus-server`: Embedded Modbus Slave simulator running inside Node-RED, allowing developers to test without physical hardware.

---

## 2. MQTT & Automotive Welding Telegrams

In this production environment, Bosch weld timer controllers publish live welding logs:

### Topics:
- `WeldLog`: General welding log topic.
- `WeldLogMB1`, `WeldLogMB3`, `WeldLogRB`: Station-specific weld stations (Main Body 1/3, Roof/Body).

### Payload Schema:
```json
{
  "Name": "WeldStation_MB1",
  "WeldTimer": "WT_01",
  "TimeStamp": "2026-10-19T12:00:00Z",
  "Message": {
    "WeldLog": {
      "dateTime": "2026-10-19 12:00:00",
      "progNo": 12,
      "timerName": "BOSCH_PSI",
      "measureState": 1,
      "monitorState": 0,
      "CurrentCurve": [12.4, 12.6, 12.5, 12.7, 12.3],
      "VoltageCurve": [18.1, 18.2, 18.0, 18.1],
      "ForceCurve": [4.2, 4.25, 4.21]
    }
  }
}
```

### Flow Linking Pattern:
- Extract `CurrentCurve[CurrentCurve.length - 1]` for instantaneous current.
- Extract `ForceCurve` for clamp pressure.
- Check `measureState === 1` for OK weld, or `spatterAlarm = true` if spatter detected.
- Forward directly to `ui_template_3d_robot` for real-time digital twin synchronization.

---

## 3. Open Protocol Tightening (`node-red-contrib-open-protocol-desoutter`)

Industrial tightening protocol for torque controllers (Atlas Copco, Desoutter, Bosch Rexroth, Ingersoll Rand).

### Network & Ports:
- **Default Port**: `4545` (TCP)
- **Node Types**:
  - `desoutter-config`: Controller configuration (IP, Port, KeepAlive 10000ms, timeout 3000ms).
  - `desoutter-node`: MID subscription & command dispatch.

### Core MIDs:
- **MID 0001 / 0002**: Communication Start & Acknowledge.
- **MID 0060 / 0061**: Last Tightening Result Subscription & Upload (Torque, Angle, OK/NOK status, Batch counter, Pset ID, VIN).
- **MID 0040 / 0042**: Tool Enable / Disable control.
- **MID 0070 / 0071**: Tightening Trace Curve Data (Torque-Angle / Torque-Time curves).

---

## 4. Siemens S7 PLC (`node-red-contrib-s7`)

- **Default Port**: `102` (ISO-on-TCP / RFC 1006)
- **Node Types**: `s7 endpoint`, `s7 in`, `s7 out`
- **S7-1200 / S7-1500 Configuration Rules**:
  - Rack: `0`, Slot: `1` (S7-300 uses Slot 2).
  - TIA Portal: MUST disable "Optimized Block Access" on target DB block.
  - TIA Portal: MUST enable "Permit access with PUT/GET communication from remote partner" in CPU Protection & Security.
- **Addressing Syntax**: `DB<Num>,WORD<Offset>`, `DB<Num>,REAL<Offset>`, `DB<Num>,DINT<Offset>`, `DB<Num>,X<Byte>.<Bit>`.
