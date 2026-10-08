# ADR 0033 — Workbench shell and front-end architecture

## Status

Accepted (2026-10-08). Presentation and code structure only: no engineering
behaviour, protocol semantics, tolerance or acceptance meaning changes. Rust
keeps every number (hard invariant); the browser formats.

## Context

A review of the UI at 1440 × 900 and of `web/` found:

**Layout**

1. Overflow. The ribbon, the inspector tabs, the results tabs and the project
   title are clipped at 1440 px.
2. The viewport gets about 380 of 900 px: three toolbar rows above it
   (view/display, results, storey/layer filter) and a fixed 200–240 px dock
   with two tab rows below it.
3. Navigation is three tab levels deep (dock tab → Design preview → pane), and
   the inspector has a separate fourth set.
4. The ribbon changes density between states: tall on load, compact once a
   design workspace is active (`.design-workspace` overrides).
5. Wording is inconsistent ("mock" in the explorer, "demonstration"
   elsewhere), and the demonstration notice repeats on one screen.
6. The joint clash messages carry internal draft ids.
7. A full-width banner warns that browser storage is not persistent.

**Code**

1. `app.js` (89 KB) is the composition root, owns 18 mutable globals, and
   builds HTML in single lines of up to 3,050 characters.
2. Each design kind exports the same informal interface (sketch, inspector,
   bind, read, panes, schedule, report), but about 80 `kind === …` branches
   across `design-previews.js`, `design-presentation.js`, `app.js` and
   `reports/report.js` select it. A new kind edits four files.
3. HTML is built by string concatenation with hand-placed `esc()` calls, so
   escaping is opt-in.
4. The shell is defined twice: `app.html` has one structure, and
   `workspace-ui.js` moves buttons into a ribbon and relocates the header with
   a `MutationObserver` at runtime.
5. `styles.css` (4,365 lines) grew by appending. It has 28 custom properties
   against 314 hex literals, 29 media queries at 9 breakpoints, and shell
   selectors (`.work-grid`, `.viewport-toolbar`, `.command-ribbon`) redefined
   in several places.

## Decision

### Front-end layers

```
web/core/      framework-free primitives — html (escaping templates), store
web/ui/        shell components — tab strip, toolbar overflow, splitter, popover
web/design/    design-kind registry and one descriptor per kind
web/app/       application modules composed by app.js
web/styles/    tokens, base, shell, components, one file per feature area
```

Dependencies point downward only: `app/` → `design/`, `ui/`, `core/`; `ui/` →
`core/`. `core/` and the registry are DOM-free where they can be, so `node
--test` covers them.

### `core/html.js` — escaping by default

`html\`…${x}…\`` escapes every interpolation. Arrays are joined, and `raw()`
marks a trusted fragment, such as another `html` result or an SVG icon. The
result is a `SafeHtml`. `render(host, safe)` assigns it to `innerHTML`. New
and migrated code uses it, which turns escaping into the default.

### `core/store.js` — one source of truth for session state

`createStore(initial)` returns `{get, set, update, subscribe}`. `subscribe(keys,
fn)` notifies once per `set` for the keys that changed (shallow identity).
The project, model hash, result, selection, busy/analysing/failed, readOnly,
formDirty and lastDesignRun move from `app.js` globals into it. The explicit
`refresh(snapshot)` orchestration stays, so render order is unchanged. Shell
elements that only reflect state, such as the title, save status, storage
indicator and revision, subscribe to it.

### `design/registry.js` — design kinds as plug-ins

A descriptor per kind:

```js
{
  kind, name, plural, family: "concrete" | "steel",
  profileLabel,                      // edition label shown in the tag
  defaultSource(d),                  // "model" | "synthetic" | "plate"
  sketch(d),                         // SafeHtml | null — inspector illustration
  panes(d, run),                     // extra result panes [[id, label]]
  pane(id, run, d, ctx),             // SafeHtml | undefined
  inspector?(args), bind?(host, project, d), read?(host),   // kind-specific inputs
  schedule?: { file, csv(run) },
  report?: { accepts(run), html(project, runs, e) },
}
```

`design-previews.js`, `design-presentation.js`, `reports/report.js`, the
explorer and `app.js` consult the registry instead of branching. A node test
asserts that every kind the Rust templates offer has a descriptor and that
every descriptor names its panes uniquely. A new kind is one file plus one
registry line.

### Shell (UX)

- **One declarative structure.** `app.html` holds the final shell: header,
  ribbon groups and canvas toolbar in place. Icons hydrate from `data-icon`.
  `workspace-ui.js` stops relocating nodes and keeps behaviour only.
- **One ribbon density** everywhere: an icon and its label inline, in a 36 px
  row. The `.design-workspace` overrides go.
- **Overflow without loss.** Under width pressure the ribbon first drops labels
  of low-priority commands. Each button keeps its accessible name and tooltip,
  and stays visible and clickable. Tab strips (dock, inspector, design panes)
  scroll horizontally with edge fades and step buttons, and keep the active tab
  in view. A "More" list jumps to any tab without moving it. Nothing is
  clipped or unreachable at 1280 px or wider. Below 900 px the existing
  single-panel mode applies.
- **One canvas toolbar row**: view, navigation, display, result family and
  component and scale, then *Visibility* (storey, layer, isolate, hide, fit,
  show all) and *Display & annotations* as popovers. Copy bay moves to the
  ribbon's Create group and Assumptions to Inspect.
- **Resizable regions**: splitters between explorer, canvas and inspector,
  and between canvas and dock. They work by pointer, and by keyboard as
  `role="separator"` with arrow keys, Home/End and double-click to reset.
  Sizes persist per viewer (`workbench-layout-v2`, which migrates v1). The
  default dock height is `clamp(200px, 30vh, 420px)`.
- **At most two navigation levels in the dock**: dock tabs, plus, for the
  active design object only, its panes, labelled with the object's name.
- **Status bar** gains a storage indicator in place of the banner. It opens a
  popover that explains the risk and offers "Download backup".
- **Wording**: "Design objects" with the profile status, never "mock". The
  demonstration notice appears once per surface: the badge on the scene, the
  basis note in the inspector, and the design basis in the record.
- **Joint clashes**: Rust returns structured fields, including member ids for
  each draft. The browser composes the sentence with entity labels.

### Styles

- `styles/tokens.css`: a palette (exact values from the current sheet, so
  pixels do not move), a semantic layer (`--surface-*`, `--text-*`,
  `--border-*`, `--accent-*`, `--status-*`), spacing, radius, type scale,
  elevation, z-index and shell dimensions. The other files reference only
  tokens.
- Cascade layers `@layer base, features, shell;`: the shell is authoritative
  for its regions, whatever a feature selector's specificity. Feature files
  keep the original rule order, so their behaviour is preserved.
- Breakpoints: compact ≤ 900 px (single panel), medium ≤ 1280 px,
  wide ≥ 1600 px, and phone ≤ 600 px for the landing page only.
- Shell selectors are defined once, in `styles/shell.css`.

## Plan

1. ADR, `core/html.js`, `core/store.js`, and their node tests.
2. Design-kind registry. Migrate the previews, presentation, report, explorer
   and `app.js` run collection. Structured joint messages; wording.
3. Styles: tokens, files and layers, breakpoints, shell rules defined once.
4. Shell: declarative markup, one ribbon density, label collapse, tab strips,
   a single canvas toolbar with popovers, splitters, status-bar storage
   indicator.
5. Decompose `app.js` into `web/app/` modules over the store: session, the
   explorer, inspector and results panels, analysis, the entity editor. It
   remains the composition root.
6. A new `shell-layout` browser spec: no clipping at 1280, 1440 and 1920 px,
   splitter persistence, tab reachability, and the storage indicator. Then the
   full suite and screenshots at five widths.

Each step lands with the full browser suite green. Specs change only where
an interaction changed, such as a control moving into a popover, through
shared helpers, never by weakening an assertion.

## Consequences

- A new design kind is one descriptor and one registry line. Reports,
  explorer grouping and schedules follow from the descriptor.
- Escaping is the default for migrated code. Unmigrated string templates stay
  correct but are legacy.
- The source hash changes, so earlier milestone evidence binds to earlier
  builds, as it always has. Gates rerun on the build under test.
