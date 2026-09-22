# Compact project header and restored ribbon buttons

User correction: restored the original icon-over-label ribbon buttons, keeping the removed category row absent. Combined the modelling header into a compact project bar with the original Home/Help controls, project name, save state, analysis case, undo/redo, exports and Analyse. Landing branding returns on Home. Responsive action wrapping is retained. Workspace height uses the freed header space.

Existing Home/Help elements and handlers are moved between headers when workspace visibility changes, preserving draft protection and event bindings.

Verification: build PASS; 10 Playwright checks PASS across workspace-ux, layout-panels, workbench and accessibility. Uses the port-4175 configuration described in evidence/M01/layout-panels/README.md. Live CUA confirmed restored ribbon layout, a 51px combined desktop header, and Home returning to landing with original branding and Help. Former desktop headers totalled 118px. Full UX/platform milestone acceptance remains separate.

Source: bdd079ace8f5fd6e5b1ce397e5f517316caa7d2ad1e136b93ee9dfc4163c1a6f
Build: 0f1e1624ac34bb1c785f50487eb7c6722d78705e720dd2f8df7edd200c6957fe
