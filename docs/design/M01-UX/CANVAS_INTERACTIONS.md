# Canvas-first interaction audit

The user's correction supersedes the earlier toolbar-and-dialog interaction model. The canvas is the primary modelling surface; routine tools must not open blocking forms. Exact values and tables remain alternate input paths.

Source audit: app.js, modeling.js, cad.js, topology.js, render/interactions.js and render/viewport.js. This is not a live usability observation; computer-use access remains blocked by the service policy check.

| Interaction | Current friction | Required primary path | Precision / review path |
| --- | --- | --- | --- |
| Member creation | Two clicks still require Add member/Enter | First endpoint, second endpoint commits atomically; repeat | Inline coordinate fields |
| Node creation | Add-node dialog | Click snapped working plane | Properties coordinates |
| Supports | Form before placement | Choose preset, click node, repeat | Right-click support -> Properties |
| Nodal loads | Form before placement | Click node for visible default load; drag to set direction | Inline magnitude/case, then properties |
| Uniform member loads | Data-entry workflow | Load tool on member | Load properties and global vector |
| Select | Some actions require IDs | Click, Shift toggle, box, model tree | Selection count and list |
| Move / copy | Selected-ID modal | Select geometry, pick base and destination | Inline delta / existing command preview in side panel |
| Delete | Blocking selection form | Delete tool/keyboard, inline dependent-object summary, confirm | Existing dependency details in side panel; undo |
| Split | Member ID and fractions dialog | Split tool, click member at split point | Exact station in side panel |
| Connect / merge | Modal preview | Use current selection, review in side panel | Explicit topology acceptance remains; never silently connect |
| Measure | Select node IDs in dialog | Click two nodes | Persistent measurement readout |
| Properties | Node/assignment editors require modal | Right-click item, edit in side panel | Table access in same panel |
| Sections / materials / cases | Blocking entity tables | Model explorer opens nonblocking side panel | Shared-definition warning and validation |
| Navigation | Competing right-drag/menu | Wheel zoom, middle/Space pan, Orbit/Alt drag, view controls | Fit, numeric working plane |
| Results | Detached table workflow | Canvas diagram/probe plus collapsible tables | Same result buffers, case and freshness |
| Cancellation | Inconsistent tool lifetime | Escape cancels current preview without mutation | Select ends tool; undo reverses committed action |
| Project creation / import / help | Outside routine modelling | Existing project-level flows may use dialogs | No new engineering scope |

All geometry and assignments still commit through the Rust command gateway. Invalid/stale picks or previews must not mutate the model. Repeated tools retain their settings, expose active mode and use one undo step per placement. Destructive dependency review stays explicit but does not block or obscure the canvas. Phone layouts may use overlays; desktop tools must leave the canvas interactive.

Entity identity: use short persisted labels (`n1`, `m1`, `s1`, `l1`) in visible interaction surfaces while keeping unique internal IDs for references. Copies and split results receive new labels; existing labels remain stable. Assignment badges must not cover geometry click targets or intercept active drawing/placement gestures. No project migration work is required during active development.
