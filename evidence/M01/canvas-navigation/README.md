# Canvas-owned navigation

Moved Pan, Orbit, Local axes, Dimensions and Fit from the modelling ribbon into a labelled group beside Plan/Elevation/3D in the canvas toolbar. Original action handlers, shortcuts and View commands are retained. The group wraps on narrow canvases and follows the existing Canvas toolbar visibility preference.

Removed the GPU reset button from the toolbar. Recovery remains available through View > Recreate viewport, using the same handler. The recovery regression now invokes that menu command.

Live CUA verified canvas ownership, highlighted Dimensions state, and absence of the GPU button. An initial regression run passed 14/15; the older CAD helper pressed Enter after the second endpoint had already auto-committed, duplicating geometry depending on timing. Updated the helper to await the two-click commit instead, preserving exact topology assertions. No drawing or solver implementation changed.

Final build PASS; 15/15 browser checks PASS: CAD drawing/navigation, dimensions, menus/shortcuts, layout visibility, responsive workspace, accessibility and recovery. Recovery runs through View > Recreate viewport. Build dd6545fbec3c68ba978f217fa37ed1497493d81065dc256211b2e872a19f61a0; source 7233edd07d2fd92e2f31aa6bf47d5c0fd6704a572e3b904c8797493054d20570. Runner used the same port-4175 override documented in evidence/M01/layout-panels/README.md. Full milestone/platform acceptance remains separate.
