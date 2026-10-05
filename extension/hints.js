(function (root) {
  'use strict';
  function owns(node) {
    const element = node?.nodeType === 1 ? node : node?.parentElement;
    return Boolean(element?.closest('[data-calstack-tooltip]'));
  }
  function create(document) {
    const window = document.defaultView;
    let hovered = null, focused = null, dismissed = null, tooltip = null, anchor = null;
    const target = node => node?.nodeType === 1 ? node.closest('[data-calstack-hint]') : null;
    function hide() { tooltip?.remove(); tooltip = null; anchor = null; }
    function position() {
      if (!tooltip || !anchor) return;
      const box = (anchor.querySelector('.calstack-badge') || anchor).getBoundingClientRect();
      const size = tooltip.getBoundingClientRect(), margin = 8, gap = 6;
      const left = Math.max(margin, Math.min(box.right - size.width, window.innerWidth - size.width - margin));
      const below = box.bottom + gap;
      const top = Math.max(margin, Math.min(below + size.height <= window.innerHeight - margin ? below : box.top - size.height - gap, window.innerHeight - size.height - margin));
      tooltip.style.left = left + 'px'; tooltip.style.top = top + 'px';
    }
    function sync() {
      if (!hovered?.isConnected || !hovered.hasAttribute('data-calstack-hint')) hovered = null;
      if (!focused?.isConnected || !focused.hasAttribute('data-calstack-hint')) focused = null;
      const next = hovered || focused;
      if (!next || next === dismissed) { hide(); return; }
      const text = next.getAttribute('data-calstack-hint');
      if (!tooltip) {
        tooltip = document.createElement('div');
        tooltip.setAttribute('data-calstack-tooltip', 'true');
        // 読み上げは予定のaria-labelで行い、同じ説明を二重に読ませない。
        tooltip.setAttribute('aria-hidden', 'true');
        document.body.append(tooltip);
      }
      if (tooltip.textContent !== text) tooltip.textContent = text;
      anchor = next; position();
    }
    document.addEventListener('pointerover', event => {
      const next = target(event.target);
      if (next !== hovered) { hovered = next; dismissed = null; sync(); }
    }, true);
    document.addEventListener('pointerout', event => {
      const next = target(event.relatedTarget);
      if (next !== hovered) { hovered = next; if (next) dismissed = null; sync(); }
    }, true);
    // Googleが同じ予定へフォーカスを戻しても、閉じた説明を再表示しない。
    function focus(node) {
      focused = target(node);
      if (focused && focused !== dismissed) dismissed = null;
      sync();
    }
    document.addEventListener('focusin', event => focus(event.target), true);
    document.addEventListener('focusout', event => focus(event.relatedTarget), true);
    function dismiss() { dismissed = hovered || focused; hide(); }
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') dismiss();
      else if (event.key === 'Tab') dismissed = null;
    }, true);
    document.addEventListener('pointerdown', dismiss, true);
    document.addEventListener('click', dismiss, true);
    document.addEventListener('scroll', position, true);
    window.addEventListener('resize', position);
    return {sync};
  }
  root.CalStackHints = {create, owns};
})(globalThis);
