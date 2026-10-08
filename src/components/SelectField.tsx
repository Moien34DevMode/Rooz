import { Children, isValidElement, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';

type SelectFieldProps = {
  value: string | number;
  onValueChange: (value: string) => void;
  children: ReactNode;
  disabled?: boolean;
  'aria-label'?: string;
  'aria-labelledby'?: string;
};

// Option children keep dynamic calendar and goal lists readable at their call sites.
export function SelectField({ value, onValueChange, children, disabled, ...aria }: SelectFieldProps) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const search = useRef({ text: '', time: 0 });
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [position, setPosition] = useState<CSSProperties>({});
  const [direction, setDirection] = useState<'rtl' | 'ltr'>('rtl');
  const options = Children.toArray(children).flatMap(child => {
    if (!isValidElement<{ value: string | number; children: ReactNode; disabled?: boolean }>(child) || child.type !== 'option') return [];
    return [{ value: String(child.props.value), label: child.props.children, disabled: child.props.disabled }];
  });
  const selected = options.findIndex(option => option.value === String(value));
  const enabled = options.flatMap((option, index) => option.disabled ? [] : [index]);
  const activeOption = options[active];

  function show(last = false) {
    if (disabled || !enabled.length) return;
    search.current = { text: '', time: 0 };
    const fallback = last ? enabled[enabled.length - 1] : enabled[0];
    setActive(enabled.includes(selected) ? selected : fallback);
    setOpen(true);
  }

  function choose(index: number) {
    if (!options[index] || options[index].disabled) return;
    onValueChange(options[index].value);
    setOpen(false);
    trigger.current?.focus();
  }

  useLayoutEffect(() => {
    if (!open || !trigger.current) return;
    function place() {
      const button = trigger.current;
      if (!button) return;
      const rect = button.getBoundingClientRect();
      const below = window.innerHeight - rect.bottom - 16;
      const above = rect.top - 16;
      const upwards = below < 180 && above > below;
      const maxHeight = Math.max(40, Math.min(280, upwards ? above : below));
      const width = Math.min(Math.max(rect.width, 160), window.innerWidth - 24);
      const dir = getComputedStyle(button).direction === 'rtl' ? 'rtl' : 'ltr';
      setDirection(dir);
      setPosition({ position: 'fixed', width, maxHeight, left: Math.max(12, Math.min(dir === 'rtl' ? rect.right - width : rect.left, window.innerWidth - width - 12)), ...(upwards ? { bottom: window.innerHeight - rect.top + 6 } : { top: rect.bottom + 6 }) });
    }
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function dismiss(event: Event) {
      const target = event.target as Node;
      if (!trigger.current?.contains(target) && !menu.current?.contains(target)) setOpen(false);
    }
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('focusin', dismiss);
    return () => { document.removeEventListener('pointerdown', dismiss); document.removeEventListener('focusin', dismiss); };
  }, [open]);

  useEffect(() => {
    if (open) menu.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [open, active]);

  function keyDown(event: KeyboardEvent<HTMLButtonElement>) {
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

  const portalRoot = trigger.current?.closest('[role="dialog"], .do-dialog') ?? trigger.current?.ownerDocument.body;
  return <span className="select-field">
    <button {...aria} ref={trigger} type="button" className="select-trigger" role="combobox" aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? id : undefined} aria-activedescendant={open && activeOption ? `${id}-${active}` : undefined} disabled={disabled} onClick={() => open ? setOpen(false) : show()} onKeyDown={keyDown}>
      <span className="select-value">{options[selected]?.label ?? 'انتخاب کنید'}</span><ChevronDown size={14} aria-hidden="true"/>
    </button>
    {open && portalRoot && createPortal(<div ref={menu} id={id} className="select-menu" role="listbox" aria-label={aria['aria-label']} aria-labelledby={aria['aria-labelledby']} dir={direction} style={position} onMouseDown={event => event.preventDefault()}>
      {options.map((option, index) => <div key={option.value} id={`${id}-${index}`} role="option" aria-selected={index === selected} aria-disabled={option.disabled || undefined} data-index={index} className={`select-option${active === index ? ' is-active' : ''}`} onPointerMove={() => !option.disabled && setActive(index)} onClick={event => { event.preventDefault(); event.stopPropagation(); choose(index); }}>
        <span>{option.label}</span>{index === selected && <Check size={14} aria-hidden="true"/>}
      </div>)}
    </div>, portalRoot)}
  </span>;
}
