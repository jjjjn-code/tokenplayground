"use client";

import { useEffect, useRef } from "react";

export interface MenuItem {
  label: string;
  onSelect: () => void;
  disabled?: boolean;
}

/**
 * Context menu (F4). Opens on right-click or from the row's menu button.
 * Arrow keys move between items, Escape closes it.
 */
export function ContextMenu({ x, y, items, onClose, label }: { x: number; y: number; items: MenuItem[]; onClose: () => void; label: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const first = ref.current?.querySelector<HTMLButtonElement>("button:not([disabled])");
    first?.focus();
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    // Ignore the scroll that can happen while the menu opens (for example
    // when the button is scrolled into view), then close on real scrolling.
    const opened = Date.now();
    const onScroll = () => {
      if (Date.now() - opened > 250) onClose();
    };
    document.addEventListener("mousedown", close);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", close);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [onClose]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const buttons = [...(ref.current?.querySelectorAll<HTMLButtonElement>("button:not([disabled])") ?? [])];
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      buttons[(i + 1) % buttons.length]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      buttons[(i - 1 + buttons.length) % buttons.length]?.focus();
    } else if (e.key === "Tab") {
      onClose();
    }
  };

  // Keep the menu inside the window.
  const left = typeof window === "undefined" ? x : Math.min(x, window.innerWidth - 220);
  const top = typeof window === "undefined" ? y : Math.min(y, window.innerHeight - items.length * 36 - 16);

  return (
    <div ref={ref} className="menu" role="menu" aria-label={label} style={{ left, top }} onKeyDown={onKeyDown}>
      {items.map((it) => (
        <button
          key={it.label}
          type="button"
          role="menuitem"
          disabled={it.disabled}
          onClick={() => {
            onClose();
            it.onSelect();
          }}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}
