# M01-UX implementation

The working application now reuses its existing commands through a grouped SVG-icon ribbon. All tools are visible initially; Model, Modify, View and Results tabs filter command groups. Arrow keys, Home and End navigate the ribbon tabs. The active tool and working plane remain visible beneath the canvas.

Right-click uses the Rust screen-picking query. An unselected entity becomes the selection; an entity already selected preserves the group. Blank-canvas actions do not delete the current selection. Shift+F10 and the Actions button expose the same menu. Arrow keys, Home/End and Escape navigate and dismiss it. Move, Copy, Topology and Delete still use existing validation/dependency previews. Right-drag orbit is replaced by the Orbit tool or Alt-drag so context actions do not compete with camera motion.

The inspector now shows explicit empty/multiple-selection states. Multiple selection exposes supported edit operations rather than misleading single-member properties. Member forms include Cancel changes and a shared-material/section notice. Unapplied property changes prevent selection changes and conflicting editing; cancel restores committed values. Node coordinates retain their existing editing dialog.

The results drawer can collapse. At widths below 900px, Canvas, Model tree, Properties and Results switch mutually exclusive panels without recreating their content. Tables scroll inside the results region. Model units and existing project export controls remain available.

## Verification boundary

Use evidence/M01/ux for the current candidate. The original M01/full evidence describes the earlier build. The verifier now recognizes M01-UX and requires UX-01 through UX-08 plus computer-use evidence; M01 also requires the UX acceptance record. Missing evidence fails closed.

Live computer-use verification is blocked by the browser service's unavailable admin policy check. Source inspection and automated regression checks do not replace the live design review. The prototype in workspace.html is illustrative and is not the production application's engineering result output.
