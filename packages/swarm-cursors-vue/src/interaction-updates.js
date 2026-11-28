// Recognise user-driven DOM changes without treating every clock tick, glyph
// or background widget as an instruction to capture the entire document.
export function watchInteractionChanges({ refresh, pending, finished, handoff, host }) {
  const doc = host.ownerDocument, win = doc.defaultView, abort = new AbortController();
  const options = { capture: true, passive: true, signal: abort.signal };
  const own = 'div-pointers,swarm-cover,swarm-companion,swarm-cursors,[data-swarm-ignore],[data-swarm-glyph]';
  const forbidden = el => el?.nodeType !== 1 || el.closest(own);
  const widget = 'button,a[href],input,textarea,select,summary,details,[role=button],[tabindex],[aria-controls],[aria-expanded],[contenteditable]:not([contenteditable=false])';
  let control = null, recentUntil = 0, frame = 0, timer = 0, previous = -Infinity;
  const now = () => win.performance.now();
  function schedule() {
    if (finished() || timer || frame) return;
    pending(true);
    const enqueue = () => {
      timer = 0;
      frame = win.requestAnimationFrame(() => {
        frame = 0;
        try { if (!finished()) refresh(); } finally { pending(false); }
        previous = now();
      });
    };
    const delay = 110 - (now() - previous);
    if (delay > 0) timer = win.setTimeout(enqueue, delay);
    else enqueue();
  }
  function user(e) {
    if (!e.isTrusted) return;
    const el = e.target?.nodeType === 1 ? e.target : null;
    if (forbidden(el)) return;
    if (e.type === 'keydown' && (e.isComposing || e.repeat || e.ctrlKey || e.metaKey || e.altKey)) return;
    if (finished()) { handoff(); return; }
    const candidate = el.closest(widget);
    if (e.type.startsWith('focus') && !recentUntil) return;
    if (e.type !== 'focusout') control = candidate;
    recentUntil = now() + 750;
    // Native form values and CSS :focus-within disclosures need not mutate
    // attributes. Check once after the native action, never on pointermove.
    if (candidate && ['click', 'focusin', 'focusout', 'input', 'change'].includes(e.type)) schedule();
  }
  for (const name of ['pointerdown', 'click', 'keydown', 'focusin', 'focusout', 'input', 'change']) doc.addEventListener(name, user, options);

  function related(el) {
    if (now() <= recentUntil) return true;
    if (!control?.isConnected) return false;
    if (control.contains(el) || control.closest('details')?.contains(el)) return true;
    return (control.getAttribute('aria-controls') || '').split(/\s+/)
      .some(id => id && (el.id === id || doc.getElementById(id)?.contains(el)));
  }
  function relevant(r) {
    if (!recentUntil) return false;
    const el = r.target.nodeType === 1 ? r.target : r.target.parentElement;
    if (forbidden(el)) return false;
    if (r.type !== 'childList') return related(el);
    // A portal can be added to (or removed from) body long after the action.
    // In that case the mutation target is not inside the controlled region,
    // but an added/removed node is the region itself or contains it.
    const nodes = [...r.addedNodes, ...r.removedNodes].filter(n => n.nodeType === 3 || (n.nodeType === 1 && !n.matches(own)));
    if (!nodes.length) return false;
    if (related(el)) return true;
    const ids = control?.getAttribute('aria-controls')?.split(/\s+/).filter(Boolean) || [];
    return nodes.some(n => n.nodeType === 1 && ids.some(id => n.id === id || n.querySelector('#' + CSS.escape(id))));
  }
  const observer = new MutationObserver(records => {
    if (!finished() && records.some(relevant)) schedule();
  });
  observer.observe(doc.body, {
    childList: true, subtree: true, characterData: true, attributes: true,
    attributeFilter: ['class', 'style', 'open', 'hidden', 'aria-expanded', 'aria-hidden', 'aria-selected', 'aria-pressed', 'checked', 'data-state', 'src'],
  });
  // Opening can change only a CSS height/transform: the first capture sees
  // its starting dimensions, the last must use the fully expanded bounds.
  for (const name of ['transitionend', 'animationend', 'toggle']) doc.addEventListener(name, e => {
    if (control && !forbidden(e.target) && related(e.target)) schedule();
  }, options);
  function complete() {
    observer.disconnect();
    win.clearTimeout(timer);
    win.cancelAnimationFrame(frame);
    pending(false);
    control = null;
    recentUntil = 0;
  }
  return { complete, relevant, dispose() { abort.abort(); complete(); } };
}
