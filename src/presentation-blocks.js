// Geometry follows the engine's priority. The shell annotates semantic block boundaries; it never
// maintains a second ordering table. Untagged siblings stay attached to the preceding block, and
// unknown blocks are retained after the known blocks rather than silently disappearing.
function renderCanonicalBlocks(container, presentation) {
  if (!container || !presentation || !Array.isArray(presentation.blocks)) return;
  const original = Array.from(container.childNodes), groups = [];
  let group = null;
  for (const node of original) {
    const block = node.nodeType === 1 ? node.getAttribute("data-block") : null;
    if (block || !group) { group = { block, nodes: [] }; groups.push(group); }
    group.nodes.push(node);
  }
  const priority = new Map(presentation.blocks.map((block, i) => [block, i]));
  const sorted = groups.map((g, index) => ({ ...g, index })).sort((a, b) =>
    (priority.get(a.block) ?? Infinity) - (priority.get(b.block) ?? Infinity) || a.index - b.index);
  const nodes = sorted.flatMap(g => g.nodes);
  if (nodes.every((node, i) => node === original[i])) return;
  const active = container.ownerDocument.activeElement;
  const focused = active && container.contains(active) ? active : null;
  const selection = focused && typeof focused.selectionStart === "number"
    ? [focused.selectionStart, focused.selectionEnd, focused.selectionDirection] : null;
  for (const node of nodes) container.appendChild(node);
  if (focused && container.ownerDocument.activeElement !== focused) {
    focused.focus({ preventScroll: true });
    if (selection && focused.setSelectionRange) focused.setSelectionRange(...selection);
  }
}
