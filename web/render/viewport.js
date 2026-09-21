const shader = `struct Out{@builtin(position) position:vec4f,@location(0) color:vec4f,@location(1) @interpolate(flat) id:u32};struct Fragment{@location(0)color:vec4f,@location(1)id:u32};@vertex fn vs(@location(0) p:vec3f,@location(1)c:vec4f,@location(2)id:f32)->Out{var o:Out;o.position=vec4f(p,1);o.color=c;o.id=u32(id);return o;}@fragment fn fs(in:Out)->Fragment{var o:Fragment;o.color=in.color;o.id=in.id;return o;}`;
export class Viewport {
  constructor(canvas, onSelect) {
    this.canvas = canvas;
    this.onSelect = onSelect;
    this.mode = "elevation";
    this.zoom = 1;
    this.pan = [0, 0];
    this.yaw = 0.65;
    this.pitch = 0.35;
    this.scale = 10;
    this.resultView = "model";
    this.viewRevision = 0;
    this.selected = "m1";
    this.ready = false;
    this.resize = new ResizeObserver(() => this.draw());
    this.resize.observe(canvas);
    canvas.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        this.zoom = Math.max(
          0.05,
          Math.min(30, this.zoom * Math.exp(-e.deltaY * 0.001)),
        );
        this.draw();
      },
      { passive: false },
    );
    let drag;
    canvas.addEventListener("pointerdown", (e) => {
      if (this.drawing && e.button === 0 && !e.altKey) {
        const rect = canvas.getBoundingClientRect();
        this.onDrawPoint?.([
          this.origin[0] +
            (e.clientX - rect.left - this.width / 2 - this.pan[0]) /
              this.factor,
          0,
          this.origin[2] -
            (e.clientY - rect.top - this.height * 0.53 - this.pan[1]) /
              this.factor,
        ]);
        canvas.focus();
        return;
      }
      drag = {
        x: e.clientX,
        y: e.clientY,
        px: e.clientX,
        py: e.clientY,
        move: 0,
        orbit: e.altKey || e.button === 2,
      };
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener("pointermove", (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.px,
        dy = e.clientY - drag.py;
      drag.move += Math.abs(dx) + Math.abs(dy);
      if (this.mode === "3d" && drag.orbit) {
        this.yaw += dx * 0.008;
        this.pitch = Math.max(-1.4, Math.min(1.4, this.pitch + dy * 0.008));
      } else {
        this.pan[0] += dx;
        this.pan[1] += dy;
      }
      drag.px = e.clientX;
      drag.py = e.clientY;
      this.draw();
    });
    canvas.addEventListener("pointerup", (e) => {
      if (drag?.move < 5) {
        const rect = canvas.getBoundingClientRect();
        this.pick(e.clientX - rect.left, e.clientY - rect.top);
      }
      drag = null;
    });
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    canvas.addEventListener("keydown", (e) => {
      if (e.key === "Home") {
        e.preventDefault();
        this.fit();
      }
    });
    this.init();
  }
  async init(retry = false) {
    try {
      if (new URLSearchParams(location.search).has("noGPU"))
        throw Error("Adapter unavailable (controlled test)");
      if (!navigator.gpu) throw Error("WebGPU API unavailable");
      this.adapter = await navigator.gpu.requestAdapter();
      if (!this.adapter) throw Error("No compatible GPU adapter");
      this.device = await this.adapter.requestDevice();
      this.depth = null;
      this.idTexture = null;
      this.buffer = null;
      this.context = this.canvas.getContext("webgpu");
      this.format = navigator.gpu.getPreferredCanvasFormat();
      this.context.configure({
        device: this.device,
        format: this.format,
        alphaMode: "opaque",
      });
      const module = this.device.createShaderModule({ code: shader });
      this.pipeline = this.device.createRenderPipeline({
        layout: "auto",
        vertex: {
          module,
          entryPoint: "vs",
          buffers: [
            {
              arrayStride: 32,
              attributes: [
                { shaderLocation: 0, offset: 0, format: "float32x3" },
                { shaderLocation: 1, offset: 12, format: "float32x4" },
                { shaderLocation: 2, offset: 28, format: "float32" },
              ],
            },
          ],
        },
        fragment: {
          module,
          entryPoint: "fs",
          targets: [
            {
              format: this.format,
              blend: {
                color: {
                  srcFactor: "src-alpha",
                  dstFactor: "one-minus-src-alpha",
                },
                alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha" },
              },
            },
            { format: "r32uint" },
          ],
        },
        primitive: { topology: "triangle-list" },
        depthStencil: {
          format: "depth24plus",
          depthWriteEnabled: true,
          depthCompare: "less-equal",
        },
      });
      this.device.lost.then((info) => {
        this.ready = false;
        this.notice("GPU device lost. Your model and results are preserved.");
        if (!retry) this.init(true);
      });
      this.device.addEventListener("uncapturederror", (e) => {
        this.notice(e.error.message);
      });
      this.deviceGeneration = (this.deviceGeneration || 0) + 1;
      this.canvas.dataset.deviceGeneration = String(this.deviceGeneration);
      this.ready = true;
      document.querySelector("#gpu-notice").hidden = true;
      document.querySelector("#gpu-status").textContent =
        "WEBGPU · " +
        (this.adapter.info?.description ||
          this.adapter.info?.vendor ||
          "Active adapter");
      this.draw();
    } catch (e) {
      this.notice(
        "Viewport unavailable: " +
          e.message +
          ". Model forms, analysis, results and exports remain available.",
      );
      document.querySelector("#gpu-status").textContent =
        "TABLE MODE · GPU unavailable";
    }
  }
  notice(text) {
    const n = document.querySelector("#gpu-notice");
    n.textContent = text;
    n.hidden = false;
  }
  fit() {
    this.zoom = 1;
    this.pan = [0, 0];
    this.draw();
  }
  update(project, result, selected) {
    this.project = project;
    this.result = result;
    this.selected = selected;
    this.draw();
  }
  basis() {
    if (this.mode === "elevation")
      return [
        [1, 0, 0],
        [0, 0, 1],
        [0, -1, 0],
      ];
    const c = Math.cos(this.yaw),
      s = Math.sin(this.yaw),
      cp = Math.cos(this.pitch),
      sp = Math.sin(this.pitch);
    return [
      [c, s, 0],
      [-s * sp, c * sp, cp],
      [s * cp, -c * cp, sp],
    ];
  }
  projectPoint(v) {
    const d = v.map((x, i) => x - this.origin[i]),
      b = this.basis(),
      dot = (a) => a.reduce((s, x, i) => s + x * d[i], 0);
    return [
      this.width / 2 + this.pan[0] + dot(b[0]) * this.factor,
      this.height * 0.53 + this.pan[1] - dot(b[1]) * this.factor,
      0.5 + (dot(b[2]) / this.extent) * 0.1,
    ];
  }
  async pick(x, y) {
    if (!this.project) return;
    const b = this.basis(),
      dx = (x - this.width / 2 - this.pan[0]) / this.factor,
      dy = -(y - this.height * 0.53 - this.pan[1]) / this.factor;
    const origin = this.origin.map(
      (v, i) => v + dx * b[0][i] + dy * b[1][i] - this.extent * b[2][i],
    );
    const viewRevision = this.viewRevision;
    let gpuEntityId = null;
    if (this.ready && this.idTexture) {
      const read = this.device.createBuffer({
        size: 256,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
      });
      try {
        const encoder = this.device.createCommandEncoder();
        encoder.copyTextureToBuffer(
          {
            texture: this.idTexture,
            origin: {
              x: Math.max(
                0,
                Math.min(
                  this.canvas.width - 1,
                  Math.floor((x * this.canvas.width) / this.width),
                ),
              ),
              y: Math.max(
                0,
                Math.min(
                  this.canvas.height - 1,
                  Math.floor((y * this.canvas.height) / this.height),
                ),
              ),
            },
          },
          { buffer: read, bytesPerRow: 256 },
          { width: 1, height: 1 },
        );
        this.device.queue.submit([encoder.finish()]);
        await read.mapAsync(GPUMapMode.READ);
        const id = new Uint32Array(read.getMappedRange())[0];
        gpuEntityId = this.project.members[id - 1]?.id || null;
        read.unmap();
      } finally {
        read.destroy();
      }
    }
    if (viewRevision !== this.viewRevision) return;
    this.canvas.dataset.lastGpuPick = gpuEntityId || "";
    this.onSelect({
      origin,
      direction: b[2],
      tolerance: 10 / this.factor,
      viewRevision,
      gpuEntityId,
    });
  }
  draw() {
    if (!this.project || !this.ready || this.canvas.clientWidth === 0) return;
    const w = this.canvas.clientWidth,
      h = this.canvas.clientHeight;
    this.width = w;
    this.height = h;
    const dpr = Math.min(devicePixelRatio, 2);
    const bw = Math.min(
        this.device.limits.maxTextureDimension2D,
        Math.round(w * dpr),
      ),
      bh = Math.min(
        this.device.limits.maxTextureDimension2D,
        Math.round(h * dpr),
      );
    if (this.canvas.width !== bw || this.canvas.height !== bh) {
      this.canvas.width = bw;
      this.canvas.height = bh;
      this.depth?.destroy();
      this.idTexture?.destroy();
      this.idTexture = this.device.createTexture({
        size: [bw, bh],
        format: "r32uint",
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
      });
      this.depth = this.device.createTexture({
        size: [bw, bh],
        format: "depth24plus",
        usage: GPUTextureUsage.RENDER_ATTACHMENT,
      });
    }
    if (!this.idTexture)
      this.idTexture = this.device.createTexture({
        size: [bw, bh],
        format: "r32uint",
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
      });
    if (!this.depth)
      this.depth = this.device.createTexture({
        size: [bw, bh],
        format: "depth24plus",
        usage: GPUTextureUsage.RENDER_ATTACHMENT,
      });
    this.viewRevision++;
    const nodes = this.project.nodes;
    const min = [0, 1, 2].map((a) =>
        Math.min(...nodes.map((n) => n.position[a])),
      ),
      max = [0, 1, 2].map((a) => Math.max(...nodes.map((n) => n.position[a])));
    this.origin = min.map((v, i) => (v + max[i]) / 2);
    this.extent = Math.max(...max.map((v, i) => v - min[i]), 1);
    const basis = this.basis();
    const spans = basis.slice(0, 2).map((axis) => {
      const values = nodes.map((n) =>
        n.position.reduce((s, x, i) => s + (x - this.origin[i]) * axis[i], 0),
      );
      return Math.max(...values) - Math.min(...values);
    });
    this.factor =
      Math.min(
        (w * 0.68) / Math.max(spans[0], this.extent * 0.15),
        (h * 0.55) / Math.max(spans[1], this.extent * 0.15),
      ) * this.zoom;
    const points = new Map(
      nodes.map((n) => [n.id, this.projectPoint(n.position)]),
    );
    let entityIndex = 0;
    const vertices = [];
    const put = (p, c) =>
      vertices.push(
        (p[0] / w) * 2 - 1,
        1 - (p[1] / h) * 2,
        Math.max(0.01, Math.min(0.99, p[2] ?? 0.5)),
        ...c,
        entityIndex,
      );
    const triangle = (a, b, c, color) => {
      put(a, color);
      put(b, color);
      put(c, color);
    };
    const line = (a, b, width, color) => {
      const dx = b[0] - a[0],
        dy = b[1] - a[1],
        len = Math.hypot(dx, dy) || 1,
        ox = ((-dy / len) * width) / 2,
        oy = ((dx / len) * width) / 2;
      const p = [a[0] + ox, a[1] + oy, a[2]],
        q = [a[0] - ox, a[1] - oy, a[2]],
        r = [b[0] + ox, b[1] + oy, b[2]],
        s = [b[0] - ox, b[1] - oy, b[2]];
      triangle(p, q, r, color);
      triangle(q, s, r, color);
    };
    const dot = (p, size, color) => {
      triangle(
        [p[0] - size, p[1] - size, p[2] - 0.001],
        [p[0] + size, p[1] - size, p[2] - 0.001],
        [p[0] + size, p[1] + size, p[2] - 0.001],
        color,
      );
      triangle(
        [p[0] - size, p[1] - size, p[2] - 0.001],
        [p[0] + size, p[1] + size, p[2] - 0.001],
        [p[0] - size, p[1] + size, p[2] - 0.001],
        color,
      );
    };
    const grid = [0.84, 0.88, 0.92, 1],
      ink = [0.22, 0.31, 0.41, 1],
      blue = [0.16, 0.4, 0.8, 1],
      orange = [0.78, 0.35, 0.19, 1];
    for (let x = (w / 2 + this.pan[0]) % 28; x < w; x += 28)
      line([x, 0, 0.99], [x, h, 0.99], 0.5, grid);
    for (let y = (h / 2 + this.pan[1]) % 28; y < h; y += 28)
      line([0, y, 0.99], [w, y, 0.99], 0.5, grid);
    for (const [i, m] of this.project.members.entries()) {
      entityIndex = i + 1;
      const a = points.get(m.start),
        b = points.get(m.end);
      line(
        a,
        b,
        m.id === this.selected ? 6 : 4,
        m.id === this.selected ? blue : ink,
      );
    }
    entityIndex = 0;
    if (this.preview) {
      const [a, b] = this.preview.map((p) => this.projectPoint(p));
      line(a, b, 3, orange);
      dot(a, 5, orange);
      dot(b, 5, orange);
    }
    for (const s of this.project.supports) {
      const p = points.get(s.node);
      line([p[0], p[1] - 17, 0.45], [p[0], p[1] + 17, 0.45], 3, ink);
      for (let y = -16; y <= 16; y += 8)
        line([p[0] - 9, p[1] + y + 7, 0.45], [p[0], p[1] + y, 0.45], 1, ink);
    }
    const labels = document.querySelector("#viewport-labels");
    labels.replaceChildren();
    const label = (text, p, cls = "") => {
      const el = document.createElement("span");
      el.className = "node-label " + cls;
      el.textContent = text;
      el.style.left = p[0] + 9 + "px";
      el.style.top = p[1] + 10 + "px";
      labels.append(el);
    };
    for (const n of nodes) {
      const p = points.get(n.id);
      dot(p, 4.5, ink);
      dot(p, 2.3, [1, 1, 1, 1]);
      label(n.id, p);
    }
    for (const m of this.project.members) {
      const a = points.get(m.start),
        b = points.get(m.end);
      label(
        m.id,
        [(a[0] + b[0]) / 2 - 15, (a[1] + b[1]) / 2 - 35],
        "member-label",
      );
    }
    for (const l of this.project.loads) {
      if (l.type !== "nodal" || !points.has(l.node)) continue;
      const p = points.get(l.node);
      const mag = Math.hypot(...l.values.slice(0, 3));
      if (!mag) continue;
      const tip = this.projectPoint(
        nodes
          .find((n) => n.id === l.node)
          .position.map((v, i) => v - (l.values[i] / mag) * 0.5),
      );
      const dx = tip[0] - p[0],
        dy = tip[1] - p[1],
        len = Math.hypot(dx, dy) || 1;
      const start = [p[0] + (dx / len) * 65, p[1] + (dy / len) * 65, 0.3],
        end = [p[0] + (dx / len) * 10, p[1] + (dy / len) * 10, 0.3];
      line(start, end, 2, orange);
      const ux = dx / len,
        uy = dy / len;
      line(
        end,
        [end[0] + ux * 10 - uy * 5, end[1] + uy * 10 + ux * 5, 0.3],
        2,
        orange,
      );
      line(
        end,
        [end[0] + ux * 10 + uy * 5, end[1] + uy * 10 - ux * 5, 0.3],
        2,
        orange,
      );
      label(
        (mag / 1000).toLocaleString() + " kN",
        [start[0], start[1] - 30],
        "load-label",
      );
    }
    if (this.result && this.resultView !== "model") {
      for (const member of this.result.members) {
        const samples = member.samples;
        if (this.resultView === "deformed") {
          for (let i = 1; i < samples.length; i++) {
            const a = samples[i - 1],
              b = samples[i];
            const p = this.projectPoint(
                a.position.map((v, j) => v + a.displacement[j] * this.scale),
              ),
              q = this.projectPoint(
                b.position.map((v, j) => v + b.displacement[j] * this.scale),
              );
            p[2] = q[2] = 0.2;
            line(p, q, 2.5, blue);
          }
        } else {
          const maxMoment = Math.max(
            ...this.result.members.flatMap((m) =>
              m.samples.map((s) => Math.abs(s.actions[4])),
            ),
            1,
          );
          for (let i = 1; i < samples.length; i++) {
            const a = this.projectPoint(samples[i - 1].position),
              b = this.projectPoint(samples[i].position),
              p = [
                a[0],
                a[1] - (samples[i - 1].actions[4] / maxMoment) * 65,
                0.2,
              ],
              q = [b[0], b[1] - (samples[i].actions[4] / maxMoment) * 65, 0.2];
            line(p, q, 2, orange);
            if (i % 2 === 0) line(b, q, 0.6, [0.78, 0.35, 0.19, 0.4]);
          }
        }
      }
    }
    const data = new Float32Array(vertices);
    this.buffer?.destroy();
    this.buffer = this.device.createBuffer({
      size: data.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    this.device.queue.writeBuffer(this.buffer, 0, data);
    const encoder = this.device.createCommandEncoder(),
      pass = encoder.beginRenderPass({
        colorAttachments: [
          {
            view: this.context.getCurrentTexture().createView(),
            clearValue: { r: 0.974, g: 0.982, b: 0.99, a: 1 },
            loadOp: "clear",
            storeOp: "store",
          },
          {
            view: this.idTexture.createView(),
            clearValue: { r: 0, g: 0, b: 0, a: 0 },
            loadOp: "clear",
            storeOp: "store",
          },
        ],
        depthStencilAttachment: {
          view: this.depth.createView(),
          depthClearValue: 1,
          depthLoadOp: "clear",
          depthStoreOp: "store",
        },
      });
    pass.setPipeline(this.pipeline);
    pass.setVertexBuffer(0, this.buffer);
    pass.draw(vertices.length / 8);
    pass.end();
    this.device.queue.submit([encoder.finish()]);
  }
}
