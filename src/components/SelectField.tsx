import { Children, isValidElement, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';
import { placeSelectMenu, type SelectViewport } from './selectPosition';
import '../styles/select.css';

type SelectFieldProps = {
  value: string | number;
  onValueChange: (value: string) => void;
  children: ReactNode;
  disabled?: boolean;
  'aria-label'?: string;
  'aria-labelledby'?: string;
};

type PopoverMenu = HTMLDivElement & { showPopover?: () => void; hidePopover?: () => void };

function viewportFor(view: Window): SelectViewport {
  const viewport = view.visualViewport;
  return viewport
    ? { width: viewport.width, height: viewport.height, offsetLeft: viewport.offsetLeft, offsetTop: viewport.offsetTop }
    : { width: view.innerWidth, height: view.innerHeight };
}

function triggerIsVisible(button: HTMLElement, viewport: SelectViewport) {
  const rect = button.getBoundingClientRect();
  let left = viewport.offsetLeft ?? 0;
  let top = viewport.offsetTop ?? 0;
  let right = left + viewport.width;
  let bottom = top + viewport.height;
  if (!button.isConnected || !button.getClientRects().length || !rect.width || !rect.height) return false;
  for (let parent = button.parentElement; parent; parent = parent.parentElement) {
    const style = getComputedStyle(parent);
    if (style.visibility === 'hidden' || style.display === 'none') return false;
    const bounds = parent.getBoundingClientRect();
    // Scrollport client dimensions exclude borders and scrollbars; scale for entrance transforms.
    const scaleX = parent.offsetWidth ? bounds.width / parent.offsetWidth : 1;
    const scaleY = parent.offsetHeight ? bounds.height / parent.offsetHeight : 1;
    if (/(auto|scroll|hidden|clip)/.test(style.overflowX)) {
      left = Math.max(left, bounds.left + parent.clientLeft * scaleX);
      right = Math.min(right, bounds.left + (parent.clientLeft + parent.clientWidth) * scaleX);
    }
    if (/(auto|scroll|hidden|clip)/.test(style.overflowY)) {
      top = Math.max(top, bounds.top + parent.clientTop * scaleY);
      bottom = Math.min(bottom, bounds.top + (parent.clientTop + parent.clientHeight) * scaleY);
    }
  }
  return rect.right > left && rect.left < right && rect.bottom > top && rect.top < bottom;
}

// Option children keep dynamic calendar and goal lists readable at their call sites.
export function SelectField({ value, onValueChange, children, disabled, ...aria }: SelectFieldProps) {
  const id = useId();
  const triggerId = `${id}-trigger`;
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<PopoverMenu>(null);
  const search = useRef({ text: '', time: 0 });
  const [open, setOpen] = useState(false);
  const [nativePopover, setNativePopover] = useState(false);
  const [active, setActive] = useState(0);
  const options = Children.toArray(children).flatMap(child => {
    if (!isValidElement<{ value: string | number; children: ReactNode; disabled?: boolean }>(child) || child.type !== 'option') return [];
    return [{ value: String(child.props.value), label: child.props.children, disabled: child.props.disabled }];
  });
  const selected = options.findIndex(option => option.value === String(value));
  const enabled = options.flatMap((option, index) => option.disabled ? [] : [index]);
  const activeOption = options[active];

  function show(last = false) {
    const button = trigger.current;
    if (disabled || !button || button.matches(':disabled') || !enabled.length) return;
    const prototype = button.ownerDocument.defaultView?.HTMLElement.prototype as PopoverMenu | undefined;
    setNativePopover(typeof prototype?.showPopover === 'function' && typeof prototype?.hidePopover === 'function');
    button.focus({ preventScroll: true });
    search.current = { text: '', time: 0 };
    const fallback = last ? enabled[enabled.length - 1] : enabled[0];
    setActive(enabled.includes(selected) ? selected : fallback);
    setOpen(true);
  }

  function choose(index: number) {
    if (disabled || trigger.current?.matches(':disabled') || !options[index] || options[index].disabled) return;
    onValueChange(options[index].value);
    setOpen(false);
    trigger.current?.focus({ preventScroll: true });
  }

  useLayoutEffect(() => {
    const button = trigger.current;
    const list = menu.current;
    const view = button?.ownerDocument.defaultView;
    if (!open || !button || !list || !view) return;
    const document = button.ownerDocument;
    let disposed = false;
    let frame = 0;
    list.dataset.positioned = 'false';
    if (nativePopover) {
      // Runtime attributes avoid depending on React 18's pre-Popover JSX typings.
      list.setAttribute('popover', 'manual');
      try {
        list.showPopover!();
      } catch {
        // Never leave a fixed popup in a filtered dialog if top-layer promotion fails.
        list.removeAttribute('popover');
        setNativePopover(false);
        return;
      }
    }
    function place() {
      if (disposed) return;
      const viewport = viewportFor(view!);
      if (button!.matches(':disabled') || !triggerIsVisible(button!, viewport)) {
        list!.dataset.positioned = 'false';
        setOpen(false);
        return;
      }
      const rect = button!.getBoundingClientRect();
      const direction = getComputedStyle(button!).direction === 'rtl' ? 'rtl' : 'ltr';
      list!.dir = direction;
      const sizing = placeSelectMenu({ trigger: rect, viewport, menuHeight: 0, direction });
      list!.style.width = `${sizing.width}px`;
      // scrollHeight measures wrapped, variable-height options even when the list is constrained.
      const style = getComputedStyle(list!);
      const menuHeight = list!.scrollHeight + parseFloat(style.borderTopWidth || '0') + parseFloat(style.borderBottomWidth || '0');
      const position = placeSelectMenu({ trigger: rect, viewport, menuHeight, direction });
      // A border/padding-only sliver cannot offer choices and would exceed its height limit.
      if (position.maxHeight <= 12 || position.width <= 12) {
        list!.dataset.positioned = 'false';
        setOpen(false);
        return;
      }
      list!.style.left = `${position.left}px`;
      list!.style.top = `${position.top}px`;
      list!.style.maxHeight = `${position.maxHeight}px`;
      list!.dataset.side = position.side;
      list!.dataset.positioned = 'true';
      return true;
    }
    function ancestorsAnimating() {
      for (let element: HTMLElement | null = button!; element; element = element.parentElement) {
        if (element.getAnimations?.().some(animation => {
          const timing = animation.effect?.getComputedTiming();
          return (animation.playState === 'running' || animation.pending) && timing && Number.isFinite(timing.endTime);
        })) return true;
      }
      return false;
    }
    function tick() {
      frame = 0;
      if (disposed) return;
      // Only finite running ancestor animations need frame-by-frame geometry updates.
      if (place() && ancestorsAnimating()) frame = view!.requestAnimationFrame(tick);
    }
    function schedule() {
      if (!disposed && !frame) frame = view!.requestAnimationFrame(tick);
    }
    function animationChanged(event: Event) {
      if (event.target instanceof Element && event.target.contains(button!)) schedule();
    }
    function toggled(event: Event) {
      if ((event as Event & { newState?: string }).newState === 'closed' && !disposed) setOpen(false);
    }
    place();
    schedule();
    view.addEventListener('resize', schedule);
    document.addEventListener('scroll', schedule, true);
    view.visualViewport?.addEventListener('resize', schedule);
    view.visualViewport?.addEventListener('scroll', schedule);
    const animationEvents = ['animationstart', 'animationend', 'animationcancel', 'transitionrun', 'transitionend', 'transitioncancel'];
    animationEvents.forEach(name => document.addEventListener(name, animationChanged, true));
    list.addEventListener('toggle', toggled);
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(schedule) : null;
    observer?.observe(button);
    observer?.observe(list);
    // Fieldsets can become disabled without changing this component's props.
    const disabledObserver = new MutationObserver(schedule);
    for (let parent = button.parentElement; parent; parent = parent.parentElement) {
      if (parent.tagName === 'FIELDSET') disabledObserver.observe(parent, { attributes: true, attributeFilter: ['disabled'] });
    }
    return () => {
      disposed = true;
      if (frame) view.cancelAnimationFrame(frame);
      observer?.disconnect();
      disabledObserver.disconnect();
      view.removeEventListener('resize', schedule);
      document.removeEventListener('scroll', schedule, true);
      view.visualViewport?.removeEventListener('resize', schedule);
      view.visualViewport?.removeEventListener('scroll', schedule);
      animationEvents.forEach(name => document.removeEventListener(name, animationChanged, true));
      list.removeEventListener('toggle', toggled);
      if (nativePopover && list.matches(':popover-open')) list.hidePopover?.();
    };
  }, [open, nativePopover, children]);

  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  useEffect(() => {
    if (!open || !trigger.current) return;
    const document = trigger.current.ownerDocument;
    function dismiss(event: Event) {
      const target = event.target as Node;
      if (!trigger.current?.contains(target) && !menu.current?.contains(target)) setOpen(false);
    }
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('focusin', dismiss);
    return () => { document.removeEventListener('pointerdown', dismiss); document.removeEventListener('focusin', dismiss); };
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    const list = menu.current;
    const option = list?.querySelector<HTMLElement>(`[data-index="${active}"]`);
    if (!list || !option) return;
    const listRect = list.getBoundingClientRect();
    const optionRect = option.getBoundingClientRect();
    const top = listRect.top + list.clientTop;
    const bottom = top + list.clientHeight;
    // scrollIntoView also scrolls the dialog/document, so scroll only the list itself.
    if (optionRect.top < top) list.scrollTop += optionRect.top - top;
    else if (optionRect.bottom > bottom) list.scrollTop += Math.min(optionRect.bottom - bottom, optionRect.top - top);
  }, [open, active, nativePopover]);

  function keyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (disabled || event.currentTarget.matches(':disabled')) return;
    if (event.key === 'Tab') { setOpen(false); return; }
    if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); setOpen(false); return; }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      if (!open) {
        show(event.key === 'End' || event.key === 'ArrowUp');
        if (event.key === 'Home' && enabled.length) setActive(enabled[0]);
        if (event.key === 'End' && enabled.length) setActive(enabled[enabled.length - 1]);
        return;
      }
      const current = enabled.indexOf(active);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? enabled.length - 1 : (current + (event.key === 'ArrowDown' ? 1 : -1) + enabled.length) % enabled.length;
      if (enabled[next] !== undefined) setActive(enabled[next]);
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (open) choose(active); else show();
      return;
    }
    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      const now = Date.now();
      const text = (now - search.current.time < 700 ? search.current.text : '') + event.key.toLocaleLowerCase();
      search.current = { text, time: now };
      const query = [...text].every(letter => letter === text[0]) ? text[0] : text;
      const start = open ? active : selected;
      for (let offset = 1; offset <= options.length; offset++) {
        const index = (start + offset + options.length) % options.length;
        if (!options[index].disabled && String(options[index].label).trim().toLocaleLowerCase().startsWith(query)) {
          if (open) setActive(index); else onValueChange(options[index].value);
          break;
        }
      }
    }
  }

  const ownerDialog = trigger.current?.closest('[role="dialog"], .do-dialog');
  const portalRoot = nativePopover ? ownerDialog ?? trigger.current?.ownerDocument.body : trigger.current?.ownerDocument.body;
  return <span className="select-field">
    <button {...aria} ref={trigger} id={triggerId} type="button" className="select-trigger" role="combobox" aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? id : undefined} aria-owns={open && !nativePopover ? id : undefined} aria-activedescendant={open && activeOption ? `${id}-${active}` : undefined} disabled={disabled} onClick={() => open ? setOpen(false) : show()} onKeyDown={keyDown}>
      <span className="select-value">{options[selected]?.label ?? 'انتخاب کنید'}</span><ChevronDown size={14} aria-hidden="true"/>
    </button>
    {open && portalRoot && createPortal(<div ref={menu} id={id} className="select-menu" role="listbox" aria-label={aria['aria-label']} aria-labelledby={aria['aria-labelledby']} data-select-owner={triggerId} data-select-strategy={nativePopover ? 'popover' : 'body'} onMouseDown={event => event.preventDefault()}>
      {options.map((option, index) => <div key={option.value} id={`${id}-${index}`} role="option" aria-selected={index === selected} aria-disabled={option.disabled || undefined} data-index={index} className={`select-option${active === index ? ' is-active' : ''}`} onPointerMove={() => !option.disabled && setActive(index)} onClick={event => { event.preventDefault(); event.stopPropagation(); choose(index); }}>
        <span>{option.label}</span>{index === selected && <Check size={14} aria-hidden="true"/>}
      </div>)}
    </div>, portalRoot)}
  </span>;
}
