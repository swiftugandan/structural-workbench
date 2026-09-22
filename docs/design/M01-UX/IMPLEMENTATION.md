# M01-UX implementation

The working application now reuses its existing commands through a grouped SVG-icon ribbon. All tools are visible initially; Model, Modify, View and Results tabs filter command groups. Arrow keys, Home and End navigate the ribbon tabs. The active tool and working plane remain visible beneath the canvas.

Right-click uses the Rust screen-picking query. An unselected entity becomes the selection; an entity already selected preserves the group. Blank-canvas actions do not delete the current selection. Shift+F10 and the Actions button expose the same menu. Arrow keys, Home/End and Escape navigate and dismiss it. Move, Copy, Topology and Delete still use existing validation/dependency previews. Right-drag orbit is replaced by the Orbit tool or Alt-drag so context actions do not compete with camera motion.

The inspector now shows explicit empty/multiple-selection states. Multiple selection exposes supported edit operations rather than misleading single-member properties. Member forms include Cancel changes and a shared-material/section notice. Unapplied property changes prevent selection changes and conflicting editing; cancel restores committed values. Node coordinates and support/load fields are editable directly in Properties.

The results drawer can collapse. At widths below 900px, Canvas, Model tree, Properties and Results switch mutually exclusive panels without recreating their content. Tables scroll inside the results region. Model units and existing project export controls remain available.

## Verification boundary

Use evidence/M01/canvas-first for the current candidate; evidence/M01/ux preserves the preceding workspace candidate. The original M01/full evidence describes the earlier build. The verifier now recognizes M01-UX and requires UX-01 through UX-08 plus computer-use evidence; M01 also requires the UX acceptance record. Missing evidence fails closed.

Live computer-use verification is blocked by the browser service's unavailable admin policy check. Source inspection and automated regression checks do not replace the live design review. The prototype in workspace.html is illustrative and is not the production application's engineering result output.

## Canvas-first revision

The user's correction broadens this milestone beyond workspace chrome. See CANVAS_INTERACTIONS.md for the interaction inventory and rationale.

- Member placement commits on the second canvas endpoint; numeric entry remains available.
- Node placement snaps to the active working plane. Support placement uses visible fixed, pinned or global-Z roller presets and refuses to silently replace an existing support.
- Load placement chooses nodal force or global uniform member load from the clicked entity. A click uses global downward force; dragging draws the force direction in the view basis. Magnitude and real load case are inline settings. Existing loads/supports have clickable/right-clickable canvas labels and in-panel editable properties.
- Move and Copy use a base and destination on the working plane. Split uses a picked member station. Both retain Rust validation and atomic undo. Copy remains disconnected geometry and does not duplicate supports/loads.
- Measure uses two canvas nodes. Delete presents affected entity counts inline and requires confirmation; it retains an undo step.
- Topology previews and detailed entity tables/forms now occupy a nonblocking right-hand command panel on desktop. They no longer make the canvas inert. Connect/Merge seed fields from a suitable current selection. Small screens use a bottom panel.
- Tool events are queued so a second point is not dropped while the first pick resolves. Escape clears uncommitted tool state. Space/middle-button navigation remains available. Tool status includes the active canvas operation.
- Results collapse during direct modelling and reopen for analysis. The existing results, export, recovery and keyboard/table alternatives remain part of regression coverage.

Current revision evidence is recorded separately in evidence/M01/canvas-first. Earlier evidence/M01/ux describes the preceding toolbar-oriented candidate and must not be used as acceptance of this revision. Live computer-use review remains required.

### Stable readable labels

Engineering entity IDs remain internal references. Rust assigns and persists short sequential labels in `metadata.entityLabels`: n (nodes), m (members), s (supports), l (loads), mat, sec, lc and c. Labels are shared by canvas, selection, inspector, model tables, reference fields, results, CSV and calculation tables. Copy/split get fresh labels; deletion does not renumber survivors or reuse deleted labels. Undo/redo and save/reopen preserve the map. Presentation metadata remains outside the engineering hash. No migration or compatibility layer was introduced. Machine-readable project exports retain internal IDs and their label mapping.

### Constraint-aware support symbols

Support rendering now uses conventional hatched fixed faces, triangular pins and triangle/two-wheel rollers. Classification uses the active degrees of freedom (X, Z and Ry for planar XZ, all six for spatial models), so a partial rotational restraint is not incorrectly labelled Fixed. Partial combinations have an explicitly labelled custom restraint marker. Roller normals follow the constrained global axis; pin/fixed orientation follows the direction away from connected members. Symbols remain constant screen size and are reprojected with the camera. An axis viewed end-on gets an explicit concentric marker rather than a misleading in-plane roller. Prescribed movements are included in the support tooltip; they do not change the support's restraint classification. No model or solver mutation is involved.

Conventions reference: [Types of Supports and Their Characteristics, Alderliesten](https://eng.libretexts.org/Bookshelves/Mechanical_Engineering/Introduction_to_Aerospace_Structures_and_Materials_%28Alderliesten%29/02%3A_Analysis_of_Statically_Determinate_Structures/03%3A_Equilibrium_Structures_Support_Reactions_Determinacy_and_Stability_of_Beams_and_Frames/3.02%3A_Types_of_Supports_and_Their_Characteristics). Glyphs are original geometric line drawings.

### Canvas dimensions

Member dimensions are on by default, with offset extension lines, inward arrowheads and aligned metre labels. The View ribbon's Dimensions toggle changes display only. Length values come from the revision-matched Rust axes query, not projected screen distances; edits and undo refresh them. Labels do not intercept pointer input. Up to 100-member models show all readable projected dimensions; larger models show selected members (capped at 100), and end-on/tiny projected spans below 28 px omit the annotation to avoid unreadable overlapping arrows. Dimension offsets flip inward near viewport edges. No engineering state or schema changes.

### Canvas shear diagrams

The View selector exposes Shear Vy and Shear Vz alongside Moment My and deformation. Plots read signed local section actions (indices 1 and 2) directly from Rust result samples. All members use one component-wide absolute peak scale; a legend reports the component, units, peak and sign colours. Diagram offsets are schematic, perpendicular to the projected start-to-end direction, with positive values on the left. Both end values and sampled extrema are annotated for small models; larger models annotate selected members. End-on members cannot form a projected diagram and are omitted. Zero-component results explicitly report all values zero.

Engineering metric uses kN (kN·m for moments); SI uses N (N·m). Component choice is retained on reanalysis. Stale action/deformation plots are suppressed after model changes; action views prompt reanalysis instead of combining old forces with new geometry. The shared moment renderer now uses the same signed, member-normal plotting rules. No solver or schema changes.

### 3D orientation and Y visibility

Replaced the fixed X/Z corner graphic with a camera-derived global X/Y/Z compass (X red, Y green, Z blue), including explicit end-on axis markers. The initial 3D camera uses an isometric angle with balanced X/Y projection. A bounded XY reference lattice at the model's lowest Z provides depth cues; its elevation is labelled, and X/Y reference directions are coloured. It is a visual reference, not a new modelling constraint. Existing 2D snap grids remain unchanged. The compass and grid do not intercept pointer events or mutate geometry.

### Physical member planes for action diagrams

Supersedes the screen-perpendicular schematic offset: My and Vz are offset along the Rust-provided local z axis, Vy along local y, before camera projection. Positive action is plotted toward the positive local axis; the legend states the plane and sign convention. One model-space amplitude (18% of model extent at peak) is shared across members and stays fixed while orbiting. Foreshortening, depth and edge-on collapse follow the camera naturally. Missing or stale local frames suppress plots until the current geometry query arrives. No engineering values or solver conventions change.

### All exposed effects retain physical directions

Vy/Vz and My retain their member-plane projection. Deformation uses the full global displacement vector supplied by Rust, multiplied by the user scale before camera projection; its former constant-depth override is removed. Combined displacements remain spatial instead of being forced into a single plane. Rendering tests cover pure Z displacement, coupled XYZ displacement, camera rotation and zero scale as well as local action planes.

### 3D warehouse example

Worked examples includes W01: a 12 m span × 18 m long pitched-roof warehouse with three 6 m bays, 6 m eaves and 8 m ridge. Twenty nodes, 25 rigid-jointed frame members and eight fixed bases form four transverse portals connected at both eaves and ridge. Opens in 3D. Synthetic section properties and combined illustrative roof/lateral nodal loads are deliberately not a code-designed building; self-weight is not included. Applied totals are Fz = −180 kN, Fy = +45 kN. Independent OpenSees and native/WASM comparison results are in evidence/M01/warehouse.

### Grouped result selection and complete member actions

The canvas picker now separates family from component: Model & deformation; Member forces (N, Vy, Vz); Member moments (My, Mz, T). Only two or three components appear at once, each family remembers its last selection, and action choices survive reanalysis. Native selects preserve keyboard and accessible-label support. Mz plots along local y in the local xy plane. Axial N and torsion T use signed on-member colour and numerical labels, not an invented transverse effect plane; colour indicates sign, not magnitude. Existing units, stale-result suppression and annotation limits apply. No solver values changed.

### Selection Forces & moments inspector

The right panel has Properties and Forces & moments tabs. Switching tabs preserves property drafts. Member selection shows an isolated, unfolded local-section diagram for N/Fx, Vy, Vz, T/Mx, My or Mz, true length, signed start/end/extreme values, a discrete recovered-station slider and expandable station/end-action tables. End-action tables explicitly distinguish node-on-member convention from cut-section actions. Diagram ordinates are schematic and independent of the canvas camera.

Node selection shows separate schematic force arrows/moment arcs and exact global-axis tables for applied nodal loads (with result case/combination factors), support reactions, and connected-member-on-node actions. Connected actions use the negative transpose transformation of Rust local end forces with current Rust geometry frames. Missing frames are explicit. All results are withheld when missing or stale, units follow the workspace, and display values below 1e-9 SI are rounded to zero without changing stored results.

### Member-only forces inspector

User direction supersedes the node inspector above: remove all node force/moment diagrams, reaction tables and connected-member contributions from this tab. Forces & moments now displays member results only. Selecting a node shows a short prompt to select a member; ordinary node properties remain in Properties. Removed the unused node-contribution implementation and its unit test. Browser regression asserts no SVG/table remains after selecting a node, then returns to member properties and checks stale results.

### Member deformation detail

The tab is now Member results. Its grouped component picker includes global Ux, Uy, Uz and total displacement magnitude, alongside the six actions. Recovered displacement is plotted against true distance along the member with station/end/extreme readouts and a displacement table. Engineering units use mm, SI uses m. These are explicitly auto-scaled displacement graphs rather than a projected 3D shape. Existing selection/stale guards apply. Cantilever regression verifies −45 mm Uz, 45 mm total and 0.045 m after changing units.

### Canvas exaggeration controls

Visible toolbar inputs are contextual: Displacement × (0–10000, default 10, 1 = actual displacement) and Diagram × (0–100, default 1, multiplies automatic member-plane amplitude). Their independent session values persist across result-component switches. Legends state the current factor; calculated values and model hash are unaffected. A zero factor collapses the graphical offset. N/T on-member sign colouring has no spatial diagram amplitude, so its scale control is hidden. This relocates the formerly small deformation legend input into the toolbar.
