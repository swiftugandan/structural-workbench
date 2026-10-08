import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  designKind,
  designKinds,
  reportSections,
} from "../web/design/registry.js";
import { CATALOGUE } from "../web/design/catalogue.js";
import { designPane } from "../web/design/panes.js";
import { SafeHtml } from "../web/core/html.js";

/** The kinds Rust offers as templates (preview_workspace::templates). */
async function rustKinds() {
  const src = await readFile(
    "crates/wasm-api/src/preview_workspace.rs",
    "utf8",
  );
  const line = src.split("\n").find((l) => l.includes("pub fn templates()"));
  const body = src.slice(src.indexOf(line), src.indexOf(line) + 600);
  return [...body.matchAll(/\("([a-zA-Z]+)","[^"]+"\)/g)].map((m) => m[1]);
}

test("every Rust template kind has exactly one descriptor, and no extras", async () => {
  const kinds = await rustKinds();
  assert.ok(kinds.length >= 6, `parsed ${kinds}`);
  assert.deepEqual(
    designKinds()
      .map((k) => k.kind)
      .sort(),
    [...kinds].sort(),
  );
  assert.equal(CATALOGUE.length, kinds.length);
  assert.throws(() => designKind("nope"), /Unknown design-object kind/);
});

test("descriptors are complete and their panes unique", () => {
  const orders = new Set();
  for (const k of designKinds()) {
    for (const key of [
      "name",
      "group",
      "family",
      "profile",
      "defaultSource",
      "readiness",
      "solid",
      "caption",
      "sketch",
      "inspector",
      "panes",
      "schedule",
      "report",
    ])
      assert.ok(k[key] !== undefined, `${k.kind}.${key}`);
    const ids = k.panes.map((p) => p.id);
    assert.equal(new Set(ids).size, ids.length, `${k.kind} pane ids`);
    assert.equal(ids[0], "summary", `${k.kind} opens on the summary`);
    assert.ok(!orders.has(k.report.order), `${k.kind} report order`);
    orders.add(k.report.order);
    const standard = !k.inspector.render;
    if (standard) {
      assert.ok(k.sources.length >= 2, `${k.kind} sources`);
      assert.ok(k.inspector.geometry.length && k.inspector.special.keys.length);
    }
    assert.ok(Object.isFrozen(k));
  }
});

test("shared panes render for every kind without a run", () => {
  const d = (kind) => ({
    id: "dp1",
    kind,
    inputs: new Proxy({}, { get: () => 0.3 }),
    inputSources: {},
    soilReference: "",
  });
  for (const k of designKinds())
    for (const pane of ["summary", "actions", "details", "schedule"]) {
      const out = designPane(pane, {
        run: undefined,
        state: "NOT CHECKED",
        d: d(k.kind),
        kind: k,
        project: { loadCases: [] },
        checkIndex: 0,
        sketch: k.sketch(d(k.kind), { face: "Top X" }),
      });
      assert.ok(
        out instanceof SafeHtml || typeof out === "string",
        `${k.kind}/${pane}`,
      );
    }
});

test("report sections follow report order and each kind's acceptance rule", () => {
  const result = { resultId: "r1" };
  const bound = (kind) => ({
    kind,
    modelHash: "h",
    sourceProvenance: { kind: "modelAnalysis", resultId: "r1" },
  });
  const runs = [bound("rcBeam"), { ...bound("rcBeam"), modelHash: "old" }];
  const html = reportSections(
    { id: "p", nodes: [], members: [], metadata: { entityLabels: {} } },
    runs,
    { modelHash: "h", result },
    (x) => String(x),
  );
  assert.equal(typeof html, "string");
  const slab = designKind("slab");
  assert.ok(
    slab.report.accepts(
      { kind: "slab", modelHash: "h", plateAnalysis: { status: "evaluated" } },
      { modelHash: "h", result },
    ),
  );
  assert.ok(
    !designKind("rcBeam").report.accepts(
      { ...bound("rcBeam"), modelHash: "old" },
      { modelHash: "h", result },
    ),
  );
});

test("joint clash advice names members by label, never by internal id", async () => {
  const { clashAdvice } = await import("../web/rc-joints.js");
  const label = (id) => ({ m2: "B-2", m3: "B-3", m1: "C-1" })[id];
  assert.equal(
    clashAdvice(
      {
        kind: "beamBeam",
        beamMember: "m3",
        otherMember: "m2",
        face: "top",
        distance: 0.01,
        shortfall: 0.01,
      },
      label,
    ),
    "B-3 and B-2 top bars cross 10.0 mm apart: move one layer by 10.0 mm.",
  );
  assert.equal(
    clashAdvice(
      {
        kind: "beamColumn",
        clause: "8.2(2)",
        beamMember: "m3",
        columnMember: "m1",
        face: "bottom",
        beamBar: 2,
        columnBar: 5,
        distance: 0.0317,
        required: 0.0475,
      },
      label,
    ),
    "B-3 bottom bar 2 passes 31.7 mm from column C-1 bar 5: 47.5 mm needed (8.2(2)).",
  );
});
