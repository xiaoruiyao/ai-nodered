# Node-RED Dashboard 2.0 & 3D WebGL Digital Twin Architecture

## Dashboard 2.0 Architecture & Lifecycle

Node-RED Dashboard 2.0 (`@flowfuse/node-red-dashboard`) is a modern rewrite using Vue 3 and Vuetify 3.

### 1. Route Mounting Gotcha (`Cannot GET /dashboard`)
- Unlike Dashboard 1.0 which registers `/ui` upon module startup, Dashboard 2.0 **dynamically mounts** the HTTP route when nodes are deployed in flows.
- If no `ui-base`, `ui-page`, and active widget are deployed, accessing `http://<host>:1880/dashboard` returns:
  ```
  Cannot GET /dashboard
  ```
- **Fix**: Ensure that the following 3 configuration nodes and at least one widget exist in the flow:
  1. `ui-base`: defines base path (`/dashboard`)
  2. `ui-theme`: defines color palette (e.g., `#0f172a`, `#38bdf8`)
  3. `ui-page`: defines page path (e.g., `/welding`)
  4. `ui-group`: defines 12-column grid group
  5. Widget: `ui-template`, `ui-chart`, `ui-gauge`, etc.

---

## 3D WebGL Digital Twin in `ui-template`

`ui-template` in Dashboard 2.0 compiles a Vue 3 Single File Component (SFC):

```html
<template>
  <div class="twin-root">
    <div class="twin-toolbar">...</div>
    <div class="twin-viewport" ref="viewportRef">
      <canvas ref="canvasRef"></canvas>
      <div class="hud-panel hud-left">...</div>
      <div class="hud-panel hud-right">...</div>
    </div>
  </div>
</template>

<script>
export default {
  data() {
    return {
      joints: { j1: '0.0', j2: '0.0', j3: '0.0', j5: '0.0' },
      tcp: { x: '0.0', y: '0.0', z: '0.0' },
      liveCurrent: '0.00',
      liveForce: '0.00',
      isSpatterAlarm: false,
      cameraAngleX: 0.45,
      cameraAngleY: -0.65,
      cameraZoom: 1.0,
      animId: null
    };
  },
  watch: {
    msg(newVal) {
      if (!newVal || !newVal.payload) return;
      const p = newVal.payload;
      if (typeof p === 'object') {
        if (p.current) this.liveCurrent = String(p.current);
        if (p.force) this.liveForce = String(p.force);
        if (typeof p.spatterAlarm !== 'undefined') this.isSpatterAlarm = Boolean(p.spatterAlarm);
      }
    }
  },
  mounted() {
    this.$nextTick(() => { this.init3D(); });
  },
  unmounted() {
    if (this.animId) cancelAnimationFrame(this.animId);
    if (this.ro) this.ro.disconnect();
  },
  methods: {
    init3D() {
      // Perspective projection math + Kinematics + Render Loop
    }
  }
};
</script>

<style scoped>
/* Full flexbox / grid layout with scoped styling */
</style>
```

### Key Mathematical Principles:
1. **Perspective Projection**:
   ```javascript
   function project3D(x, y, z) {
     const cosY = Math.cos(cameraAngleY), sinY = Math.sin(cameraAngleY);
     const x1 = x * cosY - z * sinY;
     const z1 = x * sinY + z * cosY;

     const cosX = Math.cos(cameraAngleX), sinX = Math.sin(cameraAngleX);
     const y2 = y * cosX - z1 * sinX;
     const z2 = y * sinX + z1 * cosX;

     const fov = 480 * cameraZoom;
     const dist = 500;
     const scale = fov / (z2 + dist);

     return {
       x: width / 2 + x1 * scale,
       y: height / 2 - y2 * scale + 35,
       scale: scale
     };
   }
   ```
2. **6-DOF Kinematic Link Calculation**:
   - Base $\to$ J1 rotation $\to$ Shoulder J2 $\to$ Elbow J3 $\to$ Wrist J4 $\to$ Tool Center Point (TCP).
   - In each frame, compute target spot vector: $J_1 = \text{atan2}(Z_{tgt}, X_{tgt})$.
3. **Plasma Arc & Dynamic Sparks Particle System**:
   - Sparks update position with velocities ($v_x, v_y, v_z$) and gravity ($v_y \mathrel{-}= 0.25$).
   - Sparks decay life by 0.04 per frame and are spliced when life $\le 0$.
