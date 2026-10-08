/**
 * The workbench session state (ADR 0033): one observable store instead of
 * module-level variables. `state` reads and writes it like a plain object;
 * every write goes through the store, so subscribers see each change, and
 * an unknown key is an error rather than a silent new global.
 *
 *     const { store, state } = createAppState();
 *     state.busy = true;                       // store.set({ busy: true })
 *     store.subscribe(["busy"], render);
 */
import { createStore } from "../core/store.js";

export const INITIAL = Object.freeze({
  /** The open project snapshot (Rust-owned; replaced, never mutated). */
  project: null,
  modelHash: null,
  /** The analysis result shown in the dock, possibly stale. */
  result: null,
  /** The primary selected entity and what the selection refers to. */
  selected: "m1",
  selectionContext: null,
  /** The active results-dock tab. */
  tab: "displacements",
  busy: false,
  analysing: false,
  failed: false,
  /** Unapplied edits in a property form or design draft. */
  formDirty: false,
  /** Another tab holds the project lease. */
  readOnly: false,
  lastDesignRun: null,
  /** Browser storage durability: unknown | persistent | bestEffort | failed. */
  storage: "unknown",
});

export function createAppState(initial = INITIAL) {
  const store = createStore(initial);
  const state = new Proxy(
    {},
    {
      get: (_, key) => {
        const s = store.get();
        if (typeof key === "string" && !(key in s))
          throw new Error(`Unknown session state: ${key}`);
        return s[key];
      },
      set: (_, key, value) => {
        store.set({ [key]: value });
        return true;
      },
      has: (_, key) => key in store.get(),
      ownKeys: () => Reflect.ownKeys(store.get()),
      getOwnPropertyDescriptor: (_, key) => ({
        value: store.get()[key],
        enumerable: true,
        configurable: true,
      }),
    },
  );
  return { store, state };
}

/** The workspace is read-only while a job runs or another tab holds it. */
export const locked = (s) => s.busy || s.readOnly || s.analysing;
