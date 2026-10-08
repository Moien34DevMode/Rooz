import { useEffect, useRef, type RefObject } from 'react';

const focusables = (root: HTMLElement) => Array.from(root.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])')).filter(item => !item.closest('[hidden], [aria-hidden="true"]') && item.getClientRects().length > 0);

/** Pausing preserves the settings opener while a nested confirmation owns focus. */
export function useDialogFocus(root: RefObject<HTMLElement>, onEscape: () => void, paused = false) {
  const latest = useRef({ onEscape, paused });
  latest.current = { onEscape, paused };
  useEffect(() => {
    const dialog = root.current;
    if (!dialog) return;
    const document = dialog.ownerDocument;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusFirst = () => (dialog.querySelector<HTMLElement>('[data-autofocus]') ?? focusables(dialog)[0] ?? dialog).focus();
    focusFirst();
    function keyDown(event: KeyboardEvent) {
      if (latest.current.paused) return;
      if (event.key === 'Escape') {
        event.preventDefault(); event.stopPropagation(); latest.current.onEscape();
      } else if (event.key === 'Tab') {
        const items = focusables(dialog!);
        const index = items.indexOf(document.activeElement as HTMLElement);
        if (!items.length) { event.preventDefault(); dialog!.focus(); }
        else if (event.shiftKey && index <= 0) { event.preventDefault(); items[items.length - 1].focus(); }
        else if (!event.shiftKey && (index === -1 || index === items.length - 1)) { event.preventDefault(); items[0].focus(); }
      }
    }
    function focusIn(event: FocusEvent) {
      if (!latest.current.paused && !dialog!.contains(event.target as Node)) focusFirst();
    }
    document.addEventListener('keydown', keyDown, true);
    document.addEventListener('focusin', focusIn);
    return () => {
      document.removeEventListener('keydown', keyDown, true);
      document.removeEventListener('focusin', focusIn);
      if (opener?.isConnected) opener.focus();
    };
  }, [root]);
}
