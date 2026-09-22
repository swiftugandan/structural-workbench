import { orientationSvg, referenceGrid } from "./orientation.js";
import {
  actionComponents,
  diagramPeak,
  actionText,
  actionProjection,
  deformationProjection,
} from "./action-diagrams.js";
import { dimensionLayout, dimensionText } from "./dimensions.js";
import { supportSymbol } from "./support-symbols.js";
import { entityLabel } from "../entity-labels.js";
import { interactions } from "./interactions.js";
const shader = `struct Out{@builtin(position) position:vec4f,@location(0) color:vec4f,@location(1) @interpolate(flat) id:u32};struct Fragment{@location(0)color:vec4f,@location(1)id:u32};@vertex fn vs(@location(0) p:vec3f,@location(1)c:vec4f,@location(2)id:f32)->Out{var o:Out;o.position=vec4f(p,1);o.color=c;o.id=u32(id);return o;}@fragment fn fs(in:Out)->Fragment{var o:Fragment;o.color=in.color;o.id=in.id;return o;}`;
export class Viewport {
  constructor(canvas, onSelect) {
    this.canvas = canvas;
    this.onSelect = onSelect;
    this.mode = "elevation";
    this.showDimensions = true;
    this.zoom = 1;
    this.pan = [0, 0];
    this.yaw = Math.PI / 4;
    this.pitch = Math.atan(1 / Math.sqrt(2));
    this.scale = 10;
    this.diagramScale = 1;
    this.resultView = "model";
    this.viewRevision = 0;
    this.selected = "m1";
    this.ready = false;
    this.resize = new ResizeObserver(() => this.draw());
    this.resize.observe(canvas);
    this.plane = "XZ";
    this.planeOffset = 0;
    this.gridSpacing = 0.5;
    this.tool = "select";
    this.selection = new Set(["m1"]);
    interactions(this);
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
  camera() {
    return {
      origin: this.origin,
      basis: this.basis(),
      factor: this.factor,
      center: [this.width / 2 + this.pan[0], this.height * 0.53 + this.pan[1]],
    };
  }
  planeAxes() {
    return { XZ: [0, 2], XY: [0, 1], YZ: [1, 2] }[this.plane];
  }
  pointAt(x, y) {
    const axes = this.planeAxes(),
      p = [0, 0, 0];
    p[3 - axes[0] - axes[1]] = this.planeOffset;
    p[axes[0]] =
      this.origin[axes[0]] + (x - this.width / 2 - this.pan[0]) / this.factor;
    p[axes[1]] =
      this.origin[axes[1]] -
      (y - this.height * 0.53 - this.pan[1]) / this.factor;
    return p;
  }
  basis() {
    if (this.mode === "plan")
      return [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ];
    if (this.mode === "side")
      return [
        [0, 1, 0],
        [0, 0, 1],
        [1, 0, 0],
      ];
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
  async pick(x, y, toggle = false) {
    if (!this.project || !this.origin || !Number.isFinite(this.factor)) return;
    const b = this.basis(),
      dx = (x - this.width / 2 - this.pan[0]) / this.factor,
      dy = -(y - this.height * 0.53 - this.pan[1]) / this.factor;
    const origin = this.origin.map(
      (v, i) => v + dx * b[0][i] + dy * b[1][i] - this.extent * b[2][i],
    );
    const viewRevision = this.viewRevision;
    const camera = this.camera(),
      cameraKey = JSON.stringify(camera),
      project = this.project;
    this.onSelect({
      origin,
      direction: b[2],
      tolerance: 10 / this.factor,
      viewRevision,
      point: [x, y],
      camera,
      toggle,
    });
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
        gpuEntityId =
          this.project.members[id - 1]?.id ||
          this.project.nodes[id - this.project.members.length - 1]?.id ||
          null;
        read.unmap();
      } finally {
        read.destroy();
      }
    }
    if (project !== this.project || cameraKey !== JSON.stringify(this.camera()))
      return;
    this.canvas.dataset.lastGpuPick = gpuEntityId || "";
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
    document.querySelector(".axis-widget").innerHTML = orientationSvg(basis);
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
    if (this.mode !== "3d") {
      const axes =
        this.mode === "plan" ? [0, 1] : this.mode === "side" ? [1, 2] : [0, 2];
      const step = this.gridSpacing * this.factor;
      // Thin grid lines follow the actual 0.5 m snap grid; zoomed-out views
      // show a whole-number multiple to bound rendering cost, never a fake grid.
      const multiple = Math.max(1, Math.ceil(14 / step));
      const spacing = step * multiple;
      const x0 = w / 2 + this.pan[0] - this.origin[axes[0]] * this.factor;
      const y0 = h * 0.53 + this.pan[1] + this.origin[axes[1]] * this.factor;
      for (let x = ((x0 % spacing) + spacing) % spacing; x < w; x += spacing)
        line([x, 0, 0.99], [x, h, 0.99], 0.5, grid);
      for (let y = ((y0 % spacing) + spacing) % spacing; y < h; y += spacing)
        line([0, y, 0.99], [w, y, 0.99], 0.5, grid);
      this.canvas.dataset.gridSpacing = String(this.gridSpacing * multiple);
    }
    if (this.mode === "3d") {
      const lattice = referenceGrid(this.origin, this.extent, this.gridSpacing);
      const { cx, cy, radius, step } = lattice;
      const z = min[2];
      const onGrid = (p) => {
        const q = this.projectPoint(p);
        q[2] = 0.995;
        return q;
      };
      for (let i = -6; i <= 6; i++) {
        line(
          onGrid([cx + i * step, cy - radius, z]),
          onGrid([cx + i * step, cy + radius, z]),
          0.8,
          [0.77, 0.83, 0.85, 1],
        );
        line(
          onGrid([cx - radius, cy + i * step, z]),
          onGrid([cx + radius, cy + i * step, z]),
          0.8,
          [0.77, 0.83, 0.85, 1],
        );
      }
      // Colored reference directions are drawn behind the structural geometry.
      line(
        onGrid([cx - radius, cy, z]),
        onGrid([cx + radius, cy, z]),
        1.5,
        [0.7, 0.24, 0.21, 1],
      );
      line(
        onGrid([cx, cy - radius, z]),
        onGrid([cx, cy + radius, z]),
        1.8,
        [0.09, 0.45, 0.28, 1],
      );
      this.canvas.dataset.referencePlane = "XY";
      this.canvas.dataset.referenceGridZ = String(z);
      this.canvas.dataset.gridSpacing = String(step);
      document.querySelector("#reference-plane").textContent =
        `XY reference grid · Z = ${Number(z.toPrecision(8))} m`;
    } else {
      delete this.canvas.dataset.referencePlane;
      delete this.canvas.dataset.referenceGridZ;
    }
    document.querySelector("#reference-plane").hidden = this.mode !== "3d";
    for (const [i, m] of this.project.members.entries()) {
      entityIndex = i + 1;
      const a = points.get(m.start),
        b = points.get(m.end);
      line(a, b, 4, ink);
      if (this.hovered === m.id) line(a, b, 8, [0.9, 0.42, 0.08, 0.7]);
      if (this.selection.has(m.id)) {
        line(a, b, 12, [0.16, 0.4, 0.8, 0.22]);
        line(a, b, 4, blue);
      }
    }
    entityIndex = 0;
    if (this.preview) {
      const [a, b] = this.preview.map((p) => this.projectPoint(p));
      line(a, b, 3, orange);
      dot(a, 5, orange);
      dot(b, 5, orange);
    }
    const supportSymbols = this.project.supports
      .map((support) => ({
        support,
        symbol: supportSymbol(this.project, support, (p) =>
          this.projectPoint(p),
        ),
      }))
      .filter((x) => x.symbol);
    for (const { support, symbol } of supportSymbols) {
      const color = this.selection.has(support.id) ? blue : ink;
      for (const [a, b] of symbol.segments)
        line(symbol.transform(a), symbol.transform(b), 1.8, color);
      for (const [x, y, radius] of symbol.circles) {
        for (let i = 0; i < 24; i++) {
          const at = (step) =>
            symbol.transform([
              x + radius * Math.cos((step * Math.PI) / 12),
              y + radius * Math.sin((step * Math.PI) / 12),
            ]);
          line(at(i), at(i + 1), 1.6, color);
        }
      }
    }
    const labels = document.querySelector("#viewport-labels");
    labels.replaceChildren();
    let labelBudget = 200;
    const label = (text, p, cls = "", assignment = null) => {
      if (
        ![
          "axis-summary",
          "axis-label",
          "snap-label",
          "dimension-label",
        ].includes(cls) &&
        labelBudget-- <= 0
      )
        return;
      const el = document.createElement(assignment ? "button" : "span");
      if (assignment) {
        el.type = "button";
        el.dataset.assignment = assignment;
        el.setAttribute("aria-label", `Properties for ${assignment}: ${text}`);
      }
      el.className =
        "node-label " +
        cls +
        (assignment
          ? " assignment-label" +
            (this.selected === assignment ? " selected" : "")
          : "");
      el.textContent =
        text.length > 24 && (cls === "" || cls === "member-label")
          ? `${text.slice(0, 6)}…${text.slice(-5)}`
          : text;
      el.title = text;
      el.dataset.entityId = text;
      el.style.left = p[0] + 9 + "px";
      el.style.top = p[1] + 10 + "px";
      labels.append(el);
      return el;
    };
    for (const [i, n] of nodes.entries()) {
      const p = points.get(n.id);
      entityIndex = this.project.members.length + i + 1;
      if (this.hovered === n.id) dot(p, 8, orange);
      dot(
        p,
        this.selection.has(n.id) ? 6 : 4.5,
        this.selection.has(n.id) ? blue : ink,
      );
      dot(p, 2.3, [1, 1, 1, 1]);
      if (nodes.length <= 100 || this.selection.has(n.id))
        label(entityLabel(this.project, n.id), p);
    }
    entityIndex = 0;
    for (const m of this.project.members) {
      if (this.project.members.length > 100 && !this.selection.has(m.id))
        continue;
      const a = points.get(m.start),
        b = points.get(m.end);
      label(
        entityLabel(this.project, m.id),
        [(a[0] + b[0]) / 2 - 15, (a[1] + b[1]) / 2 - 35],
        "member-label",
      );
    }
    if (
      this.showDimensions &&
      this.axesProject === this.project &&
      this.localAxes
    ) {
      const lengths = new Map(
        this.localAxes.map((frame) => [frame.id, frame.length]),
      );
      const center = this.projectPoint(this.origin);
      const dimensionColor = [0.35, 0.43, 0.52, 1];
      let count = 0;
      for (const member of this.project.members) {
        if (this.project.members.length > 100 && !this.selection.has(member.id))
          continue;
        if (count++ >= 100) break;
        const layout = dimensionLayout(
          points.get(member.start),
          points.get(member.end),
          center,
          38,
          [w, h],
        );
        const text = dimensionText(lengths.get(member.id));
        if (!layout || !text) continue;
        for (const [a, b] of layout.segments) line(a, b, 1, dimensionColor);
        const el = label(text, layout.mid, "dimension-label");
        if (el) {
          el.dataset.dimensionMember = member.id;
          el.style.left = layout.mid[0] + "px";
          el.style.top = layout.mid[1] + "px";
          el.style.transform = `translate(-50%, -50%) rotate(${layout.angle}deg)`;
          el.title = `${entityLabel(this.project, member.id)} · True member length ${text}`;
          el.setAttribute("aria-label", el.title);
        }
      }
    }
    if (this.showAxes && this.localAxes) {
      const frame = this.localAxes.find((m) => m.id === this.selected);
      if (frame) {
        const colors = [
          [0.75, 0.12, 0.12, 1],
          [0.08, 0.45, 0.2, 1],
          [0.1, 0.3, 0.85, 1],
        ];
        const names = ["x", "y", "z"];
        const origin = this.projectPoint(frame.origin);
        origin[2] = 0.12;
        frame.axes.forEach((axis, i) => {
          const tip = this.projectPoint(
            frame.origin.map(
              (v, j) =>
                v + axis[j] * Math.min(frame.length * 0.3, 52 / this.factor),
            ),
          );
          tip[2] = 0.12;
          const dx = tip[0] - origin[0],
            dy = tip[1] - origin[1],
            length = Math.hypot(dx, dy);
          if (length < 2) {
            dot(origin, 5, colors[i]);
            label(
              names[i] + " (normal to view)",
              [origin[0], origin[1] + i * 16],
              "axis-label",
            );
          } else {
            line(origin, tip, 2, colors[i]);
            const ux = dx / length,
              uy = dy / length;
            for (const sign of [-1, 1])
              line(
                tip,
                [
                  tip[0] - ux * 8 + sign * uy * 4,
                  tip[1] - uy * 8 - sign * ux * 4,
                  0.12,
                ],
                2,
                colors[i],
              );
            label(names[i], [tip[0] - 5, tip[1] - 18], "axis-label");
          }
        });
        label(
          `${entityLabel(this.project, frame.id)} local axes · ` +
            frame.axes
              .map(
                (a, i) =>
                  `${names[i]} [${a.map((v) => Number(v.toPrecision(5))).join(", ")}]`,
              )
              .join(" · "),
          [4, 76],
          "axis-summary",
        );
      }
    }
    for (const { support, symbol } of supportSymbols) {
      const name = entityLabel(this.project, support.id);
      const badge = label(
        `${name} · ${symbol.kind === "custom" ? "Custom " + symbol.constraints : symbol.kind[0].toUpperCase() + symbol.kind.slice(1)}${symbol.endOn ? " (end-on)" : ""}`,
        symbol.labelPoint,
        "support-label",
        support.id,
      );
      if (badge) {
        badge.title = symbol.title;
        badge.dataset.supportKind = symbol.kind;
        badge.dataset.supportDirection = symbol.direction.join(",");
        badge.dataset.supportEndOn = String(symbol.endOn);
        badge.setAttribute(
          "aria-label",
          `Properties for ${name}: ${symbol.title}`,
        );
      }
    }
    const arrow = (origin, vector, color = orange) => {
      const mag = Math.hypot(...vector);
      if (!mag) return this.projectPoint(origin);
      const p = this.projectPoint(origin),
        tip = this.projectPoint(
          origin.map((v, i) => v - (vector[i] / mag) * 0.5),
        );
      const dx = tip[0] - p[0],
        dy = tip[1] - p[1],
        length = Math.hypot(dx, dy);
      if (length < 0.001) {
        dot(p, 5, color);
        return [p[0], p[1] - 25, 0.3];
      }
      const ux = dx / length,
        uy = dy / length,
        start = [p[0] + ux * 60, p[1] + uy * 60, 0.3],
        end = [p[0] + ux * 10, p[1] + uy * 10, 0.3];
      line(start, end, 2, color);
      for (const sign of [-1, 1])
        line(
          end,
          [
            end[0] + ux * 10 + sign * uy * 5,
            end[1] + uy * 10 - sign * ux * 5,
            0.3,
          ],
          2,
          color,
        );
      return start;
    };
    for (const load of this.project.loads) {
      if (load.type === "nodal") {
        const node = nodes.find((n) => n.id === load.node);
        if (!node) continue;
        const vector = load.values.slice(0, 3),
          magnitude = Math.hypot(...vector);
        const at = magnitude
          ? arrow(node.position, vector)
          : this.projectPoint(node.position);
        label(
          entityLabel(this.project, load.id) +
            " · " +
            (magnitude
              ? (magnitude / 1000).toLocaleString() + " kN"
              : "Applied moment"),
          [at[0], at[1] - 48],
          "load-label",
          load.id,
        );
      } else if (load.type === "uniform") {
        const member = this.project.members.find((m) => m.id === load.member);
        if (!member) continue;
        const a = nodes.find((n) => n.id === member.start)?.position,
          b = nodes.find((n) => n.id === member.end)?.position;
        if (!a || !b) continue;
        const axes = this.localAxes?.find((m) => m.id === member.id)?.axes;
        const vector =
          load.axes === "global"
            ? load.forcePerLength
            : axes
              ? [0, 1, 2].map((i) =>
                  axes.reduce(
                    (sum, axis, j) => sum + axis[i] * load.forcePerLength[j],
                    0,
                  ),
                )
              : null;
        let at = this.projectPoint(a.map((v, i) => (v + b[i]) / 2));
        if (vector)
          for (const station of [0.15, 0.325, 0.5, 0.675, 0.85]) {
            const q = arrow(
              a.map((v, i) => v + (b[i] - v) * station),
              vector,
            );
            if (station === 0.5) at = q;
          }
        label(
          entityLabel(this.project, load.id) +
            " · " +
            (Math.hypot(...load.forcePerLength) / 1000).toLocaleString() +
            " kN/m · " +
            load.axes,
          [at[0] - 35, at[1] - 48],
          "load-label",
          load.id,
        );
      }
    }
    if (this.loadDraft) {
      const a = [...this.loadDraft.start, 0.1],
        b = [...this.loadDraft.end, 0.1];
      line(a, b, 3, orange);
      const dx = b[0] - a[0],
        dy = b[1] - a[1],
        len = Math.hypot(dx, dy) || 1;
      for (const sign of [-1, 1])
        line(
          b,
          [
            b[0] - (dx / len) * 12 + ((sign * dy) / len) * 5,
            b[1] - (dy / len) * 12 - ((sign * dx) / len) * 5,
            0.1,
          ],
          2,
          orange,
        );
    }
    const component = actionComponents[this.resultView];
    document.querySelector("#deformation-scale-control").hidden =
      this.resultView !== "deformed";
    document.querySelector("#diagram-scale-control").hidden =
      !component || component.scalar;
    document.querySelector("#deformation-factor").textContent = String(
      this.scale,
    );
    const actionLegend = document.querySelector("#action-legend");
    actionLegend.hidden = !component;
    document.querySelector(".view-legend").hidden = Boolean(component);
    delete actionLegend.dataset.component;
    delete actionLegend.dataset.peak;
    const current =
      this.result &&
      this.result.analysisType !== "envelope" &&
      this.result.modelHash === this.currentModelHash;
    if (component) {
      const engineering = this.project.displayUnits === "engineeringMetric";
      if (!current)
        actionLegend.textContent = this.result
          ? `${component.title} · Stale results — analyse again`
          : `${component.title} · Analyse to display`;
      else {
        const peak = diagramPeak(this.result, component);
        actionLegend.textContent = `${component.title} · Local section actions · ${peak ? "Auto scale: peak " + actionText(peak, component, engineering, false) : "All values zero"} · ${component.scalar ? "" : `Diagram ×${this.diagramScale} · `}+ blue / − orange · ${component.scalar ? (component.name === "N" ? "On-member colour · + tension / − compression" : "On-member colour · torque about local x") : `Local ${component.plane} plane · + toward local ${component.offset} · Edge-on plots may overlap the member`}`;
        actionLegend.dataset.component = component.name;
        actionLegend.dataset.peak = String(peak);
        const frames = new Map(
          (this.axesProject === this.project ? this.localAxes || [] : []).map(
            (f) => [f.id, f.axes],
          ),
        );
        for (const member of this.result.members) {
          if (!member.samples?.length) continue;
          const plot = actionProjection(
            member.samples,
            (p) => this.projectPoint(p),
            component,
            peak,
            frames.get(member.id),
            this.extent * 0.18 * this.diagramScale,
            member.keyStations,
          );
          if (!plot) continue;
          const values = member.samples.map((s) => s.actions[component.index]);
          for (let i = 1; i < plot.curve.length; i++) {
            const sign = (values[i - 1] + values[i]) / 2;
            line(
              plot.curve[i - 1],
              plot.curve[i],
              component.scalar ? 5 : 2,
              sign >= 0 ? blue : orange,
            );
            if (i % 4 === 0 || i === plot.curve.length - 1)
              line(plot.base[i], plot.curve[i], 0.7, sign >= 0 ? blue : orange);
          }
          line(
            plot.base[0],
            plot.curve[0],
            0.7,
            values[0] >= 0 ? blue : orange,
          );
          if (
            this.result.members.length <= 20 ||
            this.selection.has(member.id)
          ) {
            for (let mi = 0; mi < plot.marks.length; mi++) {
              const index = plot.marks[mi];
              const value = plot.markValues?.[mi] ?? values[index];
              const text = `${entityLabel(this.project, member.id)} ${component.name} ${actionText(value, component, engineering)}`;
              const el = label(
                text,
                [plot.curve[index][0], plot.curve[index][1] - 28],
                "result-value-label",
              );
              if (el) {
                el.dataset.resultMember = member.id;
                el.dataset.resultComponent = component.name;
                el.dataset.resultValue = String(value);
                el.title = `${text} · station ${member.samples[index].station} L`;
              }
            }
          }
        }
      }
    } else if (current && this.resultView === "deformed") {
      for (const member of this.result.members) {
        if (!member.samples?.length) continue;
        const curve = deformationProjection(
          member.samples,
          (p) => this.projectPoint(p),
          this.scale,
        );
        for (let i = 1; i < curve.length; i++)
          line(curve[i - 1], curve[i], 2.5, blue);
      }
    }
    if (this.snapPreview) {
      const p = this.projectPoint(this.snapPreview.position);
      p[2] = 0.05;
      dot(p, 7, orange);
      dot(p, 4, [1, 1, 1, 1]);
      label(
        this.snapPreview.kind +
          (this.snapPreview.entityId ? " " + this.snapPreview.entityId : ""),
        [p[0] + 5, p[1] - 30],
        "snap-label",
      );
    }
    if (this.crossingData) {
      for (const crossing of this.crossingData.crossings) {
        const [x, y] = crossing.point;
        if (x < 0 || x > w || y < 0 || y > h) continue;
        const p = [x, y, 0.08];
        dot(p, 5, [1, 1, 1, 1]);
        line([x - 5, y, 0.07], [x, y - 5, 0.07], 1.5, orange);
        line([x, y - 5, 0.07], [x + 5, y, 0.07], 1.5, orange);
        line([x + 5, y, 0.07], [x, y + 5, 0.07], 1.5, orange);
        line([x, y + 5, 0.07], [x - 5, y, 0.07], 1.5, orange);
      }
      this.canvas.dataset.disconnectedCrossings = String(
        this.crossingData.crossings.length,
      );
    }
    this.onViewChanged?.();
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
