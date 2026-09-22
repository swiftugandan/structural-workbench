# Guided model inputs

The model explorer stays a compact index, grouped into Structure, Member properties and Loading. It has one-line labels, aligned symbols, fixed-height counts, and a single selected-member highlight. Explanations belong in the editor, not repeated below every navigation item.

Use structural drawing conventions for engineering entities: a joint, a member between joints, an I-section, material hatching, a pinned support, applied forces, and annotated load-case/combination schematics. These are engineering illustrations, not a claim that every category has a universally standardised icon. Conventional fixed/pinned/roller support sketches change with the selected preset. Generic interface actions use the vendored Lucide 1.47.0 subset and its ISC license in web/licenses/lucide.txt.

Each editor introduces its purpose with a diagram and plain language. Reference fields select existing points, materials, sections and cases by label. Inputs display explicit units; the Rust kernel continues to parse and validate authoritative engineering values. Unchanged values preserve their original precision even where their display has been formatted. Sections use mm²/mm⁴/mm, material stiffness uses GPa, and forces use kN/kN per metre. There are no JSON textareas.

Loads have a positive magnitude and a named direction with a live arrow. Custom component forces and applied moments remain available in disclosures. Local load directions are explicitly distinguished from global vertical directions. Supported load types are node force/moment, uniform member loading and self-weight. No unsupported interior-point or member-release feature is enabled.

Support presets set the active degrees of freedom for the current analysis mode and preserve inactive restraints. The form shows the actual restrained directions. Nonzero prescribed displacements open their disclosure automatically. Combinations use checked load cases and factor inputs, and do not claim automatic code factors or code compliance.

Validation covers real-kernel save/export/undo, unchanged numerical properties, unit conversion, support presets, load variants, combination factors, keyboard operation, mobile layout, and accessibility. No numerical kernel or solver formulation has changed. Live computer-use review remains subject to the browser policy service being available.

## Visual template library

Section, load and material editors now offer illustrated template cards. Eight published catalogue sections cover IPE, hot-finished SHS, RHS and CHS, with two sizes in each family. Six loading patterns and three elastic material presets populate editable draft inputs. See [template sources and assumptions](TEMPLATE_SOURCES.md). Matching section/material diagrams are cleared when the inputs are edited; saving a changed section marks its catalogue source as modified. Templates do not commit until Save is pressed.
