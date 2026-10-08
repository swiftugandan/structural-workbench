import test from "node:test";
import assert from "node:assert/strict";
import {
  html,
  raw,
  join,
  render,
  SafeHtml,
  escapeHtml,
} from "../web/core/html.js";
import { createStore } from "../web/core/store.js";

test("html escapes interpolations and composes nested templates", () => {
  const name = `<img src=x onerror="alert('x')">`;
  const out = html`<li title="${name}">${name}</li>`;
  assert.ok(out instanceof SafeHtml);
  assert.equal(
    String(out),
    `<li title="&lt;img src=x onerror=&quot;alert(&#39;x&#39;)&quot;&gt;">&lt;img src=x onerror=&quot;alert(&#39;x&#39;)&quot;&gt;</li>`,
  );
  const list = html`<ul>${["a&b", "c"].map((x) => html`<li>${x}</li>`)}</ul>`;
  assert.equal(String(list), "<ul><li>a&amp;b</li><li>c</li></ul>");
  assert.equal(String(html`${false}${null}${undefined}${0}`), "0");
  assert.equal(String(html`${raw("<svg></svg>")}`), "<svg></svg>");
  assert.equal(
    String(join([html`<b>1</b>`, "<2>"], ", ")),
    "<b>1</b>, &lt;2&gt;",
  );
  assert.equal(escapeHtml("&"), "&amp;");
});

test("render refuses plain strings", () => {
  const host = { innerHTML: "" };
  assert.throws(() => render(host, "<b>x</b>"), TypeError);
  render(host, html`<b>${"<x>"}</b>`);
  assert.equal(host.innerHTML, "<b>&lt;x&gt;</b>");
});

test("store notifies subscribers once per set, for changed keys only", () => {
  const store = createStore({ project: null, busy: false, result: null });
  const seen = [];
  store.subscribe(["busy"], (s, keys) =>
    seen.push(["busy", s.busy, [...keys]]),
  );
  store.subscribe(null, (s, keys) => seen.push(["all", [...keys].sort()]));
  store.set({ busy: false }); // unchanged: no notification
  store.set({ busy: true, result: 1 });
  store.set({ result: 2 });
  assert.deepEqual(seen, [
    ["busy", true, ["busy", "result"]],
    ["all", ["busy", "result"]],
    ["all", ["result"]],
  ]);
  assert.throws(() => store.set({ nope: 1 }), /Unknown state key/);
  assert.ok(Object.isFrozen(store.get()));
});

test("store folds a subscriber's own set into the current pass", () => {
  const store = createStore({ a: 0, b: 0 });
  const order = [];
  store.subscribe(["a"], (s) => {
    order.push(`a${s.a}`);
    if (s.b === 0) store.set({ b: s.a * 10 });
  });
  store.subscribe(["b"], (s) => order.push(`b${s.b}`));
  store.set({ a: 1 });
  assert.deepEqual(order, ["a1", "b10"]);
  const off = store.subscribe(["a"], () => order.push("late"));
  off();
  store.set({ a: 2 });
  assert.deepEqual(order, ["a1", "b10", "a2"]);
});
