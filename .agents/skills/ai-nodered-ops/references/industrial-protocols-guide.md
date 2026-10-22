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

## 3. Open Protocol Tightening (Ingersoll Rand INSIGHTqcx & Atlas Copco)

Industrial tightening protocol for smart torque controllers (Ingersoll Rand, Atlas Copco, Desoutter, Bosch Rexroth).

### Network & Target Controllers:
- **Default Port**: `4545` (TCP)
- **Active Controller**: `10.49.15.137:4545` (Ingersoll Rand INSIGHTqcx)

### Core Protocol Framing & State Machine:
1. **Header Framing**:
   - Total length: 20 ASCII bytes header + payload + trailing `\0` (NUL delimiter).
   - Length field: 4 ASCII digits representing total bytes *excluding* the trailing `\0`.
   - Formula: `length = body.length + 4`, formatted as `f"{length:04d}"`.
2. **Handshake Sequence**:
   - `=> MID 0001` (rev: None): `00200001            \0`
   - `<= MID 0002`: Controller returns system name `INSIGHTqcx`, protocol version, software revision.
3. **Subscriptions**:
   - `=> MID 0060` (rev: 001): `00200060001         \0` (Last Tightening Result Subscription).
   - `<= MID 0005`: Controller accepts with payload `0060`.
   - `=> MID 0008` (Generic Data Subscription) for `MID 0900` trace curves (trace types 001 angle, 002 torque):
     Payload: `"0900001380" + 19 spaces + 10 spaces + "02001002"`.
   - `<= MID 0005`: Controller accepts with payload `0900`.
4. **Heartbeat Keepalive**:
   - Every 5000ms: `=> MID 9999` (`00209999            \0`). Keeps the session from disconnecting.
5. **Real-time Tightening Event (`MID 0061`)**:
   - Controller pushes `MID 0061` on torque completion.
   - **CRITICAL**: Receiver MUST immediately return `=> MID 0062` ACK (`00200062001         \0`).
   - Fields parsed: Tightening ID (`01`), VIN (`02`), Pset ID (`06`), Batch Counter (`08`), Tightening Status (`09`: 1=OK, 0=NOK), Torque Actual (`15`: raw/100 -> Nm), Angle Actual (`19`: raw -> deg), Timestamp (`20`).
6. **Trace Curve Event (`MID 0900`)**:
   - Controller pushes `MID 0900` containing binary curve samples (16-bit signed BE).
   - Receiver MUST immediately return `=> MID 0005` ACK with payload `0900`.
   - Scale factor determined by parameter PID `02213` (divide) or `02214` (multiply).
7. **Historical Result Query (`MID 0064`)**:
   - `=> MID 0064` (rev: 001, data: `0000000000`) queries the latest stored historical result.
   - Controller returns `<= MID 0065` containing the exact last completed tightening. Ideal for instant hydration on startup!
8. **Native Engine Pattern**:
   - For Ingersoll Rand INSIGHTqcx, standard Desoutter/Atlas nodes may fail during handshake or miss `MID 0062` acknowledgment timing. A dedicated, persistent Node.js `net.Socket` engine inside Node-RED provides 100% protocol adherence and zero-jitter event streaming.

---

## 4. Siemens S7 PLC (`node-red-contrib-s7`)

- **Default Port**: `102` (ISO-on-TCP / RFC 1006)
- **Node Types**: `s7 endpoint`, `s7 in`, `s7 out`
- **S7-1200 / S7-1500 Configuration Rules**:
  - Rack: `0`, Slot: `1` (S7-300 uses Slot 2).
  - TIA Portal: MUST disable "Optimized Block Access" on target DB block.
  - TIA Portal: MUST enable "Permit access with PUT/GET communication from remote partner" in CPU Protection & Security.
- **Addressing Syntax**: `DB<Num>,WORD<Offset>`, `DB<Num>,REAL<Offset>`, `DB<Num>,DINT<Offset>`, `DB<Num>,X<Byte>.<Bit>`.
