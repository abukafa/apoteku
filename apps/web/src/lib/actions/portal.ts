/**
 * Svelte action to teleport/portal an element to document.body
 * This guarantees the element is positioned relative to the viewport body
 * and escapes any parent margins, paddings, overflow:hidden, or stacking contexts.
 */
export function portal(node: HTMLElement, target: HTMLElement | string = "body") {
  let targetEl: HTMLElement | null = null;

  function update(newTarget: HTMLElement | string) {
    if (typeof newTarget === "string") {
      targetEl = document.querySelector(newTarget);
    } else {
      targetEl = newTarget;
    }

    if (targetEl && node.parentNode !== targetEl) {
      targetEl.appendChild(node);
    }
  }

  update(target);

  return {
    update,
    destroy() {
      if (node.parentNode) {
        node.parentNode.removeChild(node);
      }
    }
  };
}
