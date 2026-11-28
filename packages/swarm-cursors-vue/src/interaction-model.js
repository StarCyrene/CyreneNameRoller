// During a drawing two visually identical menu labels can belong to different
// real elements. Match by the original DOM node, not by a text/position search
// across the document (which is appropriate only between separate routes).
export function reconcileInteraction(previous, next) {
  const sources = new Map();
  for (const old of previous.items) {
    if (!sources.has(old.source)) sources.set(old.source, []);
    sources.get(old.source).push(old);
  }
  const painted = new Set(), retained = new Set(), urgent = new Set();
  let changed = previous.docH !== next.docH || previous.docW !== next.docW || previous.items.length !== next.items.length;
  for (const it of next.items) {
    const siblings = sources.get(it.source);
    const i = siblings?.findIndex(old => old.kind === it.kind && old.sig === it.sig && old.layer === it.layer) ?? -1;
    if (i < 0) { changed = true; urgent.add(it); continue; }
    const old = siblings.splice(i, 1)[0];
    retained.add(old);
    it.node = old.node;
    if (old.vis) painted.add(it);
    const sameText = !it.full || (old.full && it.full.isEqualNode(old.full));
    if (it.full && sameText) {
      for (const key of ['live', 'units', 'seq', 'total', 'rshown', '_last']) it[key] = old[key];
    }
    if (it.kind === 'image' && it.node._src === old) it.sameMedia = true;
    if (!changed && (it.id !== old.id || it.key !== old.key || it.op !== old.op ||
        !sameBox(it, old) || !sameBox(it.tb, old.tb) || !sameClip(it.clip, old.clip) || !sameText)) changed = true;
  }
  if (!changed) return null;
  for (const old of previous.items) {
    old._caret?.remove();
    if (!retained.has(old)) old.node.remove();
  }
  // A duplicate can contain both an already visible part and a newly inserted
  // icon/label. Animate only the new part; never replay the retained siblings.
  for (const g of next.groups) for (const dst of g.dst) {
    dst.pendingItems = dst.items.filter(it => !painted.has(it));
    if (!dst.pendingItems.length) dst.task.state = 'done';
  }
  for (const it of painted) {
    if (it.task) it.task.state = 'done';
    if (it.editTask) it.editTask.state = 'done';
    it.twinOf = null;
  }
  for (const g of next.guides) if (g.deps.every(t => t.state === 'done')) g.task.state = 'done';
  // New controls and anything they depend on take precedence over the
  // remaining initial drawing. Availability still honours the scroll frontier.
  function prioritise(t) {
    if (t.interaction || t.state === 'done') return;
    t.interaction = true;
    for (const dep of t.deps) prioritise(dep);
  }
  for (const it of urgent) for (const t of it.final || []) prioritise(t);
  return painted;
}

function sameBox(a, b) {
  return !a || !b ? a === b : a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
}
function sameClip(a, b) {
  return !a || !b ? a === b : a.l === b.l && a.t === b.t && a.r === b.r && a.b === b.b;
}
