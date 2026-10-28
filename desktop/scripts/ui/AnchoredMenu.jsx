import React, { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// Measured outside the sidebar so row titles are never used as the popup surface.
export function AnchoredMenu({ menu, onClose, children }) {
  const ref = useRef(null);
  const [position, setPosition] = useState(null);
  useLayoutEffect(() => {
    const node = ref.current;
    const bounds = node.getBoundingClientRect();
    const anchor = menu.anchor;
    const gap = 8;
    const width = window.innerWidth;
    const height = window.innerHeight;
    let left = anchor.right + gap;
    let top = anchor.top;
    if (menu.placement === 'below-end') {
      left = Math.max(gap, Math.min(anchor.right - bounds.width, width - bounds.width - gap));
      top = anchor.bottom + gap;
      if (top + bounds.height > height - gap) top = anchor.top - bounds.height - gap;
    }
    if (menu.placement !== 'below-end' && left + bounds.width > width - gap) {
      if (anchor.left - bounds.width - gap >= gap) left = anchor.left - bounds.width - gap;
      else {
        left = Math.max(gap, width - bounds.width - gap);
        top = anchor.bottom + gap;
        if (top + bounds.height > height - gap) top = anchor.top - bounds.height - gap;
      }
    }
    setPosition({
      left: Math.max(gap, left),
      top: Math.max(gap, Math.min(top, height - bounds.height - gap)),
    });
    const close = () => onClose();
    const scroll = (event) => {
      if (
        !node.contains(event.target) &&
        (event.target === document || event.target.contains?.(menu.trigger))
      )
        close();
    };
    const outside = (event) => {
      if (!node.contains(event.target) && !menu.trigger?.contains(event.target)) close();
    };
    window.addEventListener('resize', close);
    document.addEventListener('scroll', scroll, true);
    document.addEventListener('pointerdown', outside);
    return () => {
      window.removeEventListener('resize', close);
      document.removeEventListener('scroll', scroll, true);
      document.removeEventListener('pointerdown', outside);
    };
  }, [menu]);
  useLayoutEffect(() => {
    if (position)
      ref.current
        ?.querySelector('button:not(:disabled):not([hidden])')
        ?.focus({ preventScroll: true });
  }, [position]);
  return createPortal(
    <div
      ref={ref}
      role="menu"
      aria-label={menu.label || (menu.kind === 'create' ? 'Criar no projeto' : 'Ações da conversa')}
      className={
        'ui-action-menu workspace-action-menu ' +
        (menu.kind === 'create' ? 'project-create-menu' : 'context-menu')
      }
      style={{ ...position, visibility: position ? 'visible' : 'hidden' }}
      onKeyDown={(event) => {
        if (event.key === 'Escape' || event.key === 'Tab') {
          if (event.key === 'Escape') event.preventDefault();
          onClose();
          menu.trigger?.focus({ preventScroll: true });
        } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
          event.preventDefault();
          const items = [...ref.current.querySelectorAll('button:not(:disabled):not([hidden])')];
          const index = items.indexOf(document.activeElement);
          const next =
            event.key === 'Home'
              ? 0
              : event.key === 'End'
                ? items.length - 1
                : (index + (event.key === 'ArrowUp' ? -1 : 1) + items.length) % items.length;
          items[next]?.focus({ preventScroll: true });
        }
      }}
    >
      {children}
    </div>,
    document.body,
  );
}
