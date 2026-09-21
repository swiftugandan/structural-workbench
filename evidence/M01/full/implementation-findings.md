# Failures found and repaired during M01 implementation

- Immediate Enter after an endpoint click could commit before the asynchronous
  snap response. The drawing state now queues point placement and waits before
  committing, with cancellation epochs and a single-submit guard.
- Opening the drawing panel changed canvas layout after its initial projection,
  and changing status-line height shifted geometry under the pointer. Projection
  now follows the panel layout and status space is stable.
- GPU-readback completion was incorrectly used to gate ordinary selection;
  cosmetic redraws and rapid clicks could discard valid Shift selections. Rust
  picking now starts immediately and validates camera/model identity separately.
- The kernel produced near-coincident warnings but the UI did not render them.
  The axes-refresh path now presents the warning without changing connectivity.
- Keyboard-only navigation exposed an asynchronous entity-save completion that
  reopened a just-closed dialog. Save/delete completions now update only the
  still-open originating form; errors from closed forms use the main status.
- The keyboard test initially matched both a hidden project-name input and the
  dialog field. It now scopes the locator to the active portal form.

- Regression testing found optional load-unit fields being inserted as null into
  other load variants. Conversion now uses non-inserting lookups; a native test
  covers nodal, distributed and self-weight field preservation and conversion.
- One startup sample including assertion polling measured 2003 ms against the
  unchanged 2000 ms limit. The test now captures the browser's actual interactive
  DOM transition with a MutationObserver and navigation-relative performance time,
  instead of charging test-driver polling delay to the application.

Reproductions remain in the CAD, graphics and keyboard regression tests. These
observations are intermediate failures, not acceptance records. Final same-build
records determine acceptance. No fixture expectations or tolerances were relaxed.
