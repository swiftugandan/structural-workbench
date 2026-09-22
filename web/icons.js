// Lucide 1.47.0, ISC license. Vendored SVG subset from lucide-static.
// Original license: web/licenses/lucide.txt.
const shapes = {
  "mouse-pointer-2":
    '<path d="M4.037 4.688a.495.495 0 0 1 .651-.651l16 6.5a.5.5 0 0 1-.063.947l-6.124 1.58a2 2 0 0 0-1.438 1.435l-1.579 6.126a.5.5 0 0 1-.947.063z" />',
  "move-up-right": '<path d="M13 5H19V11" />\n  <path d="M19 5L5 19" />',
  "circle-dot":
    '<circle cx="12" cy="12" r="1" />\n  <circle cx="12" cy="12" r="10" />',
  waypoints:
    '<path d="m10.586 5.414-5.172 5.172" />\n  <path d="m18.586 13.414-5.172 5.172" />\n  <path d="M6 12h12" />\n  <circle cx="12" cy="20" r="2" />\n  <circle cx="12" cy="4" r="2" />\n  <circle cx="20" cy="12" r="2" />\n  <circle cx="4" cy="12" r="2" />',
  triangle:
    '<path d="M13.73 4a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />',
  "arrow-down-to-line":
    '<path d="M12 17V3" />\n  <path d="m6 11 6 6 6-6" />\n  <path d="M19 21H5" />',
  move: '<path d="M12 2v20" />\n  <path d="m15 19-3 3-3-3" />\n  <path d="m19 9 3 3-3 3" />\n  <path d="M2 12h20" />\n  <path d="m5 9-3 3 3 3" />\n  <path d="m9 5 3-3 3 3" />',
  copy: '<rect width="14" height="14" x="8" y="8" rx="2" ry="2" />\n  <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />',
  pencil:
    '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" />\n  <path d="m15 5 4 4" />',
  "git-fork":
    '<circle cx="12" cy="18" r="3" />\n  <circle cx="6" cy="6" r="3" />\n  <circle cx="18" cy="6" r="3" />\n  <path d="M18 9v2c0 .6-.4 1-1 1H7c-.6 0-1-.4-1-1V9" />\n  <path d="M12 12v3" />',
  "trash-2":
    '<path d="M10 11v6" />\n  <path d="M14 11v6" />\n  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />\n  <path d="M3 6h18" />\n  <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />',
  eye: '<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" />\n  <circle cx="12" cy="12" r="3" />',
  scan: '<path d="M3 7V5a2 2 0 0 1 2-2h2" />\n  <path d="M17 3h2a2 2 0 0 1 2 2v2" />\n  <path d="M21 17v2a2 2 0 0 1-2 2h-2" />\n  <path d="M7 21H5a2 2 0 0 1-2-2v-2" />',
  ruler:
    '<path d="M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.41 2.41 0 0 1 0-3.4l2.6-2.6a2.41 2.41 0 0 1 3.4 0Z" />\n  <path d="m14.5 12.5 2-2" />\n  <path d="m11.5 9.5 2-2" />\n  <path d="m8.5 6.5 2-2" />\n  <path d="m17.5 15.5 2-2" />',
  "undo-2":
    '<path d="M9 14 4 9l5-5" />\n  <path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11" />',
  "redo-2":
    '<path d="m15 14 5-5-5-5" />\n  <path d="M20 9H9.5A5.5 5.5 0 0 0 4 14.5A5.5 5.5 0 0 0 9.5 20H13" />',
  save: '<path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" />\n  <path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7" />\n  <path d="M7 3v4a1 1 0 0 0 1 1h7" />',
  play: '<path d="M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z" />',
  "sliders-horizontal":
    '<path d="M10 5H3" />\n  <path d="M12 19H3" />\n  <path d="M14 3v4" />\n  <path d="M16 17v4" />\n  <path d="M21 12h-9" />\n  <path d="M21 19h-5" />\n  <path d="M21 5h-7" />\n  <path d="M8 10v4" />\n  <path d="M8 12H3" />',
  layers:
    '<path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z" />\n  <path d="M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12" />\n  <path d="M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17" />',
  blocks:
    '<path d="M10 22V7a1 1 0 0 0-1-1H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5a1 1 0 0 0-1-1H2" />\n  <rect x="14" y="2" width="8" height="8" rx="1" />',
  folders:
    '<path d="M20 5a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h2.5a1.5 1.5 0 0 1 1.2.6l.6.8a1.5 1.5 0 0 0 1.2.6z" />\n  <path d="M3 8.268a2 2 0 0 0-1 1.738V19a2 2 0 0 0 2 2h11a2 2 0 0 0 1.732-1" />',
  combine:
    '<path d="M14 3a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1" />\n  <path d="M19 3a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1" />\n  <path d="m7 15 3 3" />\n  <path d="m7 21 3-3H5a2 2 0 0 1-2-2v-2" />\n  <rect x="14" y="14" width="7" height="7" rx="1" />\n  <rect x="3" y="3" width="7" height="7" rx="1" />',
  box: '<path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />\n  <path d="m3.3 7 8.7 5 8.7-5" />\n  <path d="M12 22V12" />',
  orbit:
    '<path d="M20.341 6.484A10 10 0 0 1 10.266 21.85" />\n  <path d="M3.659 17.516A10 10 0 0 1 13.74 2.152" />\n  <circle cx="12" cy="12" r="3" />\n  <circle cx="19" cy="5" r="2" />\n  <circle cx="5" cy="19" r="2" />',
  "axis-3d":
    '<path d="M13.5 10.5 15 9" />\n  <path d="M4 4v15a1 1 0 0 0 1 1h15" />\n  <path d="M4.293 19.707 6 18" />\n  <path d="m9 15 1.5-1.5" />',
  "table-2":
    '<path d="M3 9h18" />\n  <path d="M9 3v18" />\n  <rect x="3" y="3" width="18" height="18" rx="2" />',
};
export function icon(name) {
  return `<svg class="command-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${shapes[name] || shapes["sliders-horizontal"]}</svg>`;
}
