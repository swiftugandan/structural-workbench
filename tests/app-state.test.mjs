import test from "node:test";
import assert from "node:assert/strict";
import { createAppState, INITIAL, locked } from "../web/app/state.js";

test("session state reads and writes through the store and notifies", () => {
  const { store, state } = createAppState();
  assert.equal(state.selected, INITIAL.selected);
  const seen = [];
  store.subscribe(["busy"], (s) => seen.push(s.busy));
  state.busy = true;
  state.busy = true; // unchanged: no second notification
  state.project = { id: "p" };
  assert.deepEqual(seen, [true]);
  assert.equal(store.get().project.id, "p");
  assert.ok(locked(state));
  state.busy = false;
  assert.ok(!locked(state));
  state.readOnly = true;
  assert.ok(locked(state));
});

test("unknown session keys fail loudly instead of becoming globals", () => {
  const { state } = createAppState();
  assert.throws(() => state.porject, /Unknown session state: porject/);
  assert.throws(() => {
    state.porject = 1;
  }, /Unknown state key: porject/);
  assert.ok("project" in state);
  assert.deepEqual(Object.keys(state).sort(), Object.keys(INITIAL).sort());
});
