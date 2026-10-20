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
