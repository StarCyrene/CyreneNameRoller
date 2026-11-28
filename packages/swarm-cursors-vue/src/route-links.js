// Vue Router starts a link navigation in the click's task. Attribute only the
// matching destination to the link, so later history and programmatic jumps
// don't start a rebuild.
export function trackLinkNavigation(router) {
  let intent;
  let lastPointerType;
  const onPointerDown = event => { lastPointerType = event.pointerType; };
  const onClick = event => {
    // Enter and assistive activation can dispatch a click without pointerdown.
    const pointer = event.pointerType || (event.detail > 0 ? lastPointerType : undefined);
    if ((pointer && pointer !== "mouse") || event.sourceCapabilities?.firesTouchEvents ||
        event.button !== 0 || event.defaultPrevented ||
        event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const link = event.composedPath().find(node => node.matches?.("a[href]"));
    if (!link || link.hasAttribute("download") || (link.target && link.target.toLowerCase() !== "_self")) return;
    const click = intent = { href: link.href };
    setTimeout(() => { if (intent === click) intent = undefined; }, 0);
  };
  window.addEventListener("pointerdown", onPointerDown, true);
  window.addEventListener("click", onClick, true);
  return {
    consume(route) {
      const click = intent;
      intent = undefined;
      if (!click) return false;
      const href = router.resolve?.(route)?.href ?? route?.href ?? route?.fullPath;
      return !!href && new URL(href, location.href).href === click.href;
    },
    dispose() {
      intent = undefined;
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("click", onClick, true);
    },
  };
}
