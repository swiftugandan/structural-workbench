#!/usr/bin/env node
/**
 * Computed-style snapshots for stylesheet refactors (ADR 0033). Records the
 * resolved style and box of every rendered element in a fixed set of app
 * states, then compares two snapshots: colours by CIEDE2000 (a palette that
 * merges imperceptible near-duplicates passes), everything else exactly
 * (boxes to half a pixel).
 *
 *     PORT=4183 node tools/style-snapshot.mjs record before.json
 *     PORT=4183 node tools/style-snapshot.mjs record after.json
 *     node tools/style-snapshot.mjs diff before.json after.json [--de 2.5]
 *
 * Needs a served build (npm run preview) on PORT.
 */
import { readFile, writeFile } from "node:fs/promises";

const PROPS = [
  "display",
  "position",
  "boxSizing",
  "float",
  "zIndex",
  "visibility",
  "overflowX",
  "overflowY",
  "opacity",
  "marginTop",
  "marginRight",
  "marginBottom",
  "marginLeft",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "borderTopWidth",
  "borderRightWidth",
  "borderBottomWidth",
  "borderLeftWidth",
  "borderTopStyle",
  "borderRightStyle",
  "borderBottomStyle",
  "borderLeftStyle",
  "borderTopColor",
  "borderRightColor",
  "borderBottomColor",
  "borderLeftColor",
  "borderTopLeftRadius",
  "borderTopRightRadius",
  "borderBottomLeftRadius",
  "borderBottomRightRadius",
  "color",
  "backgroundColor",
  "backgroundImage",
  "boxShadow",
  "outlineStyle",
  "outlineWidth",
  "outlineColor",
  "fontFamily",
  "fontSize",
  "fontWeight",
  "fontStyle",
  "lineHeight",
  "letterSpacing",
  "textTransform",
  "textAlign",
  "whiteSpace",
  "textOverflow",
  "gap",
  "rowGap",
  "columnGap",
  "gridTemplateColumns",
  "gridTemplateRows",
  "gridColumn",
  "gridRow",
  "flexDirection",
  "flexWrap",
  "flexGrow",
  "flexShrink",
  "flexBasis",
  "justifyContent",
  "alignItems",
  "alignSelf",
  "order",
  "cursor",
  "fill",
  "stroke",
];
const COLOUR = /color$|^fill$|^stroke$|Color$|^boxShadow$/;

async function record(out) {
  const { chromium } = await import("@playwright/test");
  const base = `http://127.0.0.1:${process.env.PORT || 4173}`;
  const browser = await chromium.launch({
    args: ["--enable-unsafe-webgpu", "--use-angle=swiftshader"],
  });
  const states = {};
  const capture = (page) =>
    page.evaluate((props) => {
      const out = {};
      const path = (el) => {
        const parts = [];
        for (let e = el; e && e.nodeType === 1; e = e.parentElement) {
          if (e.id) {
            parts.unshift(`#${e.id}`);
            break;
          }
          const same = [...(e.parentElement?.children || [])].filter(
            (s) => s.tagName === e.tagName,
          );
          parts.unshift(
            `${e.tagName.toLowerCase()}${same.length > 1 ? `:${same.indexOf(e) + 1}` : ""}`,
          );
        }
        return parts.join(">");
      };
      // GPU-driven overlays follow frame timing, not the stylesheet.
      const dynamic =
        "#viewport-labels, #viewport-labels *, #gpu-status, #build-status, #design-geometry-labels, #design-geometry-labels *, .axis-widget *";
      for (const el of document.querySelectorAll("body *")) {
        if (el.matches(dynamic)) continue;
        // Rendered only: closed <details> content still reports layout boxes.
        if (!el.checkVisibility({ contentVisibilityAuto: true })) continue;
        const r = el.getBoundingClientRect();
        if (!r.width && !r.height) continue;
        const cs = getComputedStyle(el);
        const v = {
          box: [r.x, r.y, r.width, r.height].map((n) => Math.round(n * 2) / 2),
        };
        for (const p of props) v[p] = cs[p];
        out[path(el)] = v;
      }
      return out;
    }, PROPS);
  const page = async (w, h) => {
    const p = await browser.newPage({ viewport: { width: w, height: h } });
    // Animations and carets would make boxes time-dependent.
    await p.addStyleTag({ content: "" }).catch(() => {});
    return p;
  };
  // The kernel and the GPU viewport both report ready before a capture.
  const ready = async (p) => {
    await p
      .locator("#kernel-status")
      .filter({ hasText: "ready" })
      .waitFor({ timeout: 30000 });
    await p
      .locator("#gpu-status")
      .filter({ hasText: "WEBGPU" })
      .waitFor({ timeout: 60000 })
      .catch(() => {});
  };
  // Deterministic capture: no motion, every scroller at its origin, lazily
  // laid-out rows (content-visibility) rendered, and the DOM quiet.
  const settle = async (p) => {
    await p.addStyleTag({
      content:
        "*,*::before,*::after{transition:none!important;animation:none!important;caret-color:transparent!important}#model-nav *{content-visibility:visible!important}",
    });
    let last = -1;
    for (let i = 0; i < 20; i++) {
      await p.waitForTimeout(300);
      const n = await p.evaluate(() => {
        for (const el of document.querySelectorAll("*")) {
          if (el.scrollTop) el.scrollTop = 0;
          if (el.scrollLeft) el.scrollLeft = 0;
        }
        return document.querySelectorAll("body *").length;
      });
      if (n === last) break;
      last = n;
    }
  };
  for (const [w, h, tag] of [
    [1440, 900, "wide"],
    [390, 844, "phone"],
  ]) {
    let p = await page(w, h);
    await p.goto(base + "/");
    await settle(p);
    states[`landing-${tag}`] = await capture(p);
    await p.locator("#new-project").click();
    await ready(p);
    await settle(p);
    states[`workspace-${tag}`] = await capture(p);
    if (tag === "wide") {
      await p.locator("#analyse").click();
      await p
        .locator("#result-status")
        .filter({ hasText: "Current" })
        .waitFor();
      await settle(p);
      states["analysed-wide"] = await capture(p);
      await p.close();
      p = await page(w, h);
      const model = JSON.parse(
        await readFile("fixtures/models/J01.json", "utf8"),
      );
      const id = model.designPreviews.find((d) => d.targetId === "beamY").id;
      await p.goto(base + "/");
      await p.locator("#import-file").setInputFiles({
        name: "j.json",
        mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify(model)),
      });
      await ready(p);
      await p.locator("[data-inspector-tab=concrete]").click();
      await p.locator(`#model-nav [data-preview="${id}"]`).click();
      await p.locator("#preview-source").selectOption("model");
      await p.locator("#analyse").click();
      await p
        .locator("#result-status")
        .filter({ hasText: "Current" })
        .waitFor();
      // Fix the display choice the app may switch after an analysis.
      await p.locator("#display-result").selectOption("deformed");
      await p.locator("#deformation-scale-control").waitFor();
      await p.locator("#preview-run:not([disabled])").waitFor();
      await p.locator("#preview-run").click();
      await p.locator("[data-testid=preview-state]").waitFor();
      await settle(p);
      states["design-wide"] = await capture(p);
      await p.locator('[data-preview-pane="ec2"]').click();
      await settle(p);
      states["design-ec2-wide"] = await capture(p);
    }
    await p.close();
  }
  await browser.close();
  await writeFile(out, JSON.stringify(states));
  console.log(
    `recorded ${Object.entries(states)
      .map(([k, v]) => `${k}:${Object.keys(v).length}`)
      .join(" ")} → ${out}`,
  );
}

function lab([r, g, b]) {
  const lin = (c) =>
    (c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  const [R, G, B] = [r, g, b].map(lin);
  const f = (t) =>
    t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116;
  const x = f((0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047),
    y = f(0.2126 * R + 0.7152 * G + 0.0722 * B),
    z = f((0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}
/** CIEDE2000, the metric the palette was clustered with (ADR 0033). */
function deltaE(c1, c2) {
  const [L1, a1, b1] = lab(c1),
    [L2, a2, b2] = lab(c2);
  const rad = Math.PI / 180;
  const C1 = Math.hypot(a1, b1),
    C2 = Math.hypot(a2, b2),
    Cb = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cb ** 7 / (Cb ** 7 + 25 ** 7)));
  const a1p = a1 * (1 + G),
    a2p = a2 * (1 + G);
  const C1p = Math.hypot(a1p, b1),
    C2p = Math.hypot(a2p, b2);
  const h = (b, a) => (((Math.atan2(b, a) / rad) % 360) + 360) % 360;
  const h1p = h(b1, a1p),
    h2p = h(b2, a2p);
  let dhp = 0;
  if (C1p * C2p) {
    dhp = h2p - h1p;
    if (dhp > 180) dhp -= 360;
    else if (dhp < -180) dhp += 360;
  }
  const dLp = L2 - L1,
    dCp = C2p - C1p,
    dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp / 2) * rad);
  const Lbp = (L1 + L2) / 2,
    Cbp = (C1p + C2p) / 2;
  let hbp = h1p + h2p;
  if (C1p * C2p)
    hbp =
      Math.abs(h1p - h2p) <= 180
        ? (h1p + h2p) / 2
        : h1p + h2p < 360
          ? (h1p + h2p + 360) / 2
          : (h1p + h2p - 360) / 2;
  const T =
    1 -
    0.17 * Math.cos((hbp - 30) * rad) +
    0.24 * Math.cos(2 * hbp * rad) +
    0.32 * Math.cos((3 * hbp + 6) * rad) -
    0.2 * Math.cos((4 * hbp - 63) * rad);
  const SL = 1 + (0.015 * (Lbp - 50) ** 2) / Math.sqrt(20 + (Lbp - 50) ** 2),
    SC = 1 + 0.045 * Cbp,
    SH = 1 + 0.015 * Cbp * T;
  const RT =
    -2 *
    Math.sqrt(Cbp ** 7 / (Cbp ** 7 + 25 ** 7)) *
    Math.sin(60 * Math.exp(-(((hbp - 275) / 25) ** 2)) * rad);
  return Math.sqrt(
    (dLp / SL) ** 2 +
      (dCp / SC) ** 2 +
      (dHp / SH) ** 2 +
      RT * (dCp / SC) * (dHp / SH),
  );
}
/** rgb()/rgba() and color(srgb …) (how color-mix() serialises). */
const rgba = (s) => {
  let m = s.match(/rgba?\(([^)]+)\)/);
  if (m) {
    const n = m[1]
      .split(/[ ,/]+/)
      .filter(Boolean)
      .map(Number);
    return { rgb: n.slice(0, 3), a: n.length > 3 ? n[3] : 1 };
  }
  m = s.match(/color\(srgb ([^)]+)\)/);
  if (m) {
    const n = m[1].split(/[ /]+/).filter(Boolean).map(Number);
    return {
      rgb: n.slice(0, 3).map((v) => v * 255),
      a: n.length > 3 ? n[3] : 1,
    };
  }
  return null;
};
/** A colour property may hold several colours (box-shadow lists). */
function colours(s) {
  return [...String(s).matchAll(/rgba?\([^)]+\)|color\(srgb [^)]+\)/g)].map(
    (m) => rgba(m[0]),
  );
}
function sameColour(x, y, tolerance) {
  if (x === y) return true;
  const a = colours(x),
    b = colours(y);
  if (!a.length || a.length !== b.length) return false;
  // The non-colour remainder (offsets, blur) must match exactly.
  const rest = (s) =>
    String(s).replace(/rgba?\([^)]+\)|color\(srgb [^)]+\)/g, "C");
  if (rest(x) !== rest(y)) return false;
  return a.every(
    (c, i) =>
      Math.abs(c.a - b[i].a) < 0.02 && deltaE(c.rgb, b[i].rgb) <= tolerance,
  );
}

async function diff(a, b, tolerance) {
  const A = JSON.parse(await readFile(a, "utf8")),
    B = JSON.parse(await readFile(b, "utf8"));
  let differences = 0,
    colourShifts = 0;
  for (const state of Object.keys(A)) {
    const x = A[state],
      y = B[state] || {};
    const missing = Object.keys(x).filter((k) => !(k in y));
    const added = Object.keys(y).filter((k) => !(k in x));
    const lines = [];
    if (missing.length)
      lines.push(
        `  - ${missing.length} elements gone, e.g. ${missing.slice(0, 3).join(", ")}`,
      );
    if (added.length)
      lines.push(
        `  + ${added.length} elements new, e.g. ${added.slice(0, 3).join(", ")}`,
      );
    for (const key of Object.keys(x)) {
      if (!(key in y)) continue;
      for (const prop of ["box", ...PROPS]) {
        const u = JSON.stringify(x[key][prop]),
          v = JSON.stringify(y[key][prop]);
        if (u === v) continue;
        if (
          COLOUR.test(prop) &&
          sameColour(x[key][prop], y[key][prop], tolerance)
        ) {
          colourShifts++;
          continue;
        }
        lines.push(`  ${key} ${prop}: ${u} → ${v}`);
      }
    }
    differences += lines.length;
    if (lines.length) {
      console.log(`${state}: ${lines.length} differences`);
      console.log(lines.slice(0, 40).join("\n"));
    }
  }
  console.log(
    `${differences} differences; ${colourShifts} colour shifts within ΔE ${tolerance}`,
  );
  if (differences) process.exitCode = 1;
}

const [cmd, ...args] = process.argv.slice(2);
if (cmd === "record") await record(args[0]);
else if (cmd === "diff") {
  const i = args.indexOf("--de");
  await diff(args[0], args[1], i >= 0 ? Number(args[i + 1]) : 2.5);
} else {
  console.error(
    "usage: style-snapshot.mjs record <out.json> | diff <a.json> <b.json> [--de 2.5]",
  );
  process.exitCode = 2;
}
