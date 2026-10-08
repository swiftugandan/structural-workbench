/**
 * Session state store (ADR 0033). One object holds the state that several
 * panels read; `set` replaces keys, and subscribers registered for any of the
 * changed keys run once per `set`, after every key is applied, in
 * registration order. A key changes when its value is not `Object.is` the
 * previous one, so mutate-then-set does not notify: replace values instead.
 *
 *     const store = createStore({ project: null, busy: false });
 *     store.subscribe(["busy"], (s) => (button.disabled = s.busy));
 *     store.set({ busy: true });
 */
export function createStore(initial) {
  let state = Object.freeze({ ...initial });
  const subscribers = [];
  let notifying = false;
  const pending = new Set();

  function notify(changed) {
    for (const key of changed) pending.add(key);
    if (notifying) return; // a subscriber's own set is folded into this pass
    notifying = true;
    try {
      while (pending.size) {
        const keys = new Set(pending);
        pending.clear();
        for (const s of [...subscribers])
          if (s.active && (s.keys === null || s.keys.some((k) => keys.has(k))))
            s.fn(state, keys);
      }
    } finally {
      notifying = false;
    }
  }

  return {
    get: () => state,
    set(patch) {
      const changed = [];
      for (const [key, value] of Object.entries(patch)) {
        if (!(key in state)) throw new Error(`Unknown state key: ${key}`);
        if (!Object.is(state[key], value)) changed.push(key);
      }
      if (!changed.length) return state;
      state = Object.freeze({ ...state, ...patch });
      notify(changed);
      return state;
    },
    update(fn) {
      return this.set(fn(state));
    },
    /** `keys` null subscribes to every change. Returns an unsubscribe. */
    subscribe(keys, fn) {
      const entry = { keys: keys && [...keys], fn, active: true };
      subscribers.push(entry);
      return () => {
        entry.active = false;
        subscribers.splice(subscribers.indexOf(entry), 1);
      };
    },
  };
}
