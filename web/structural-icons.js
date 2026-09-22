// Structural drawing conventions, not app-category pictograms.
// Labels remain visible: there is no universal symbol for a load case or combination.
const shapes = {
  node: '<path d="M12 2v6m0 8v6M2 12h6m8 0h6"/><circle cx="12" cy="12" r="3.5" fill="currentColor"/>',
  member:
    '<path d="M5 19 19 5" stroke-width="3"/><circle cx="5" cy="19" r="2.5" fill="white"/><circle cx="19" cy="5" r="2.5" fill="white"/>',
  section:
    '<path d="M5 3h14v4h-5v10h5v4H5v-4h5V7H5Z" fill="currentColor" stroke-width="1"/>',
  material:
    '<path d="M3 3h18v18H3Z"/><path d="m3 9 6-6M3 16 16 3m5 21 16-16M12 21l9-9M19 21l2-2" stroke-width="1.2"/>',
  support:
    '<circle cx="12" cy="5" r="2" fill="white"/><path d="m12 7-7 10h14ZM3 20h18m-16 0-2 3m8-3-2 3m8-3-2 3"/>',
  load: '<path d="M12 2v15m-4-4 4 4 4-4M3 21h18"/><path d="M5 4v7m-2-2 2 2 2-2M19 4v7m-2-2 2 2 2-2" stroke-width="1.3"/>',
  loadCase:
    '<path d="M6 2h15v16M3 6h14v16H3Z" stroke-width="1.4"/><path d="M10 9v8m-3-3 3 3 3-3M6 19h8" stroke-width="1.5"/>',
  combination:
    '<path d="M5 2v11m-3-3 3 3 3-3M19 2v11m-3-3 3 3 3-3M10 6h4m-2-2v4M2 20h20"/><path d="M5 16v4m14-4v4" stroke-width="1.3"/>',
  frame:
    '<path d="M5 20V4h14v16" stroke-width="2.5"/><path d="M2 21h6m8 0h6M3 21l-1 2m4-2-1 2m13-2-1 2m4-2-1 2" stroke-width="1.3"/>',
};
export function structuralIcon(name) {
  return `<svg class="command-icon structural-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${shapes[name] || shapes.frame}</svg>`;
}
