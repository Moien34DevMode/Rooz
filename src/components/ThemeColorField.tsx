import { useEffect, useId, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { ChevronDown } from 'lucide-react';
import { hexToHsv, hsvToHex, moveSV, normalizeHex, pointToSV, type HSV } from '../features/themes/colorMath';

export interface ThemeColorPreset { label: string; value: string; token: string }
interface ThemeColorFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  presets: ThemeColorPreset[];
  disabled?: boolean;
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
}

export function ThemeColorField({ label, value, onChange, presets, disabled = false, expanded, onExpandedChange }: ThemeColorFieldProps) {
  const id = useId();
  const [localExpanded, setLocalExpanded] = useState(false);
  const open = expanded ?? localExpanded;
  function toggle() {
    if (disabled) return;
    if (onExpandedChange) onExpandedChange(!open);
    else setLocalExpanded(!open);
  }
  const [text, setText] = useState(value);
  const [hsv, setHsv] = useState<HSV>(() => hexToHsv(value) ?? { h: 0, s: 0, v: 0 });
  const current = useRef(hsv);
  const emitted = useRef(value);
  const drag = useRef<{ element: HTMLDivElement; pointerId: number } | null>(null);
  const valid = normalizeHex(text) !== null;

  function stopDrag() {
    const active = drag.current;
    drag.current = null;
    if (active?.element.hasPointerCapture(active.pointerId)) active.element.releasePointerCapture(active.pointerId);
  }
  useEffect(() => stopDrag, []);
  useEffect(() => { if (disabled || !open) stopDrag(); }, [disabled, open]);
  useEffect(() => {
    if (value === emitted.current) return;
    emitted.current = value;
    setText(value);
    const next = hexToHsv(value);
    if (next) {
      // Achromatic colors have no hue: keep the user's hue for their next drag.
      if (next.s === 0 || next.v === 0) next.h = current.current.h;
      current.current = next;
      setHsv(next);
    }
  }, [value]);

  function apply(next: HSV, hex = hsvToHex(next), preserveText = false) {
    current.current = next;
    setHsv(next);
    emitted.current = hex;
    if (!preserveText) setText(hex);
    onChange(hex);
  }
  function choose(hex: string, preserveText = false) {
    const normalized = normalizeHex(hex);
    const next = normalized && hexToHsv(normalized);
    if (!next || !normalized) return;
    if (next.s === 0 || next.v === 0) next.h = current.current.h;
    apply(next, normalized, preserveText);
  }
  function movePointer(event: PointerEvent<HTMLDivElement>) {
    if (!drag.current || drag.current.pointerId !== event.pointerId || disabled) return;
    apply({ ...current.current, ...pointToSV(event.clientX, event.clientY, event.currentTarget.getBoundingClientRect()) });
  }

  return <fieldset className="theme-field theme-color-field" disabled={disabled} aria-labelledby={`${id}-label`}>
    <div className="theme-color-summary">
      <button type="button" className="theme-color-toggle" aria-label={`${label} — انتخاب رنگ`} aria-expanded={open} aria-controls={`${id}-picker`} onClick={toggle}>
        <span className="theme-color-sample" aria-hidden="true" style={{ background: value }}/>
        <span id={`${id}-label`}>{label}</span>
        <ChevronDown size={14} aria-hidden="true"/>
      </button>
      <input id={`${id}-hex`} className="theme-color-hex" type="text" value={text} required pattern="\s*#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?\s*" spellCheck={false} autoComplete="off" dir="ltr" aria-label={`${label} — کد HEX`} aria-invalid={!valid} aria-describedby={`${id}-hex-help`} onChange={event => { setText(event.target.value); choose(event.target.value, true); }} onBlur={() => { const hex = normalizeHex(text); if (hex) setText(hex); }}/>
    </div>
    <p id={`${id}-hex-help`} className={`theme-control-help theme-color-validation${valid ? ' theme-color-validation-valid' : ' theme-control-invalid'}`} aria-live="polite">{valid ? 'کد سه یا شش رقمی با #؛ فقط رنگ معتبر پیش‌نمایش می‌شود.' : 'کد معتبر وارد کنید؛ مانند #517365. این متن هنوز اعمال نشده است.'}</p>
    <div id={`${id}-picker`} className="theme-color-details" hidden={!open}>
    <div className="theme-color-presets" role="group" aria-label={`${label} — رنگ‌های تم`}>
      {presets.map(preset => <button key={preset.token} type="button" className="theme-color-preset" aria-label={`${preset.label} (${preset.value})`} title={preset.label} aria-pressed={value === preset.value} style={{ background: `var(${preset.token})` }} onClick={() => choose(preset.value)}/>)}
    </div>
    <div className="theme-color-plane" role="slider" tabIndex={disabled ? -1 : 0} aria-disabled={disabled || undefined} aria-label={`${label} — اشباع و روشنایی`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(hsv.s)} aria-valuetext={`اشباع ${Math.round(hsv.s)}٪، روشنایی ${Math.round(hsv.v)}٪`} aria-describedby={`${id}-help`} dir="ltr" style={{ '--theme-picker-hue': hsvToHex({ h: hsv.h, s: 100, v: 100 }) } as CSSProperties}
      onPointerDown={event => {
        if (disabled || !event.isPrimary || event.button !== 0 || event.currentTarget.closest('fieldset:disabled')) return;
        event.preventDefault();
        stopDrag();
        event.currentTarget.focus();
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { element: event.currentTarget, pointerId: event.pointerId };
        movePointer(event);
      }}
      onPointerMove={movePointer} onPointerUp={stopDrag} onPointerCancel={stopDrag} onLostPointerCapture={stopDrag}
      onKeyDown={event => {
        if (disabled || event.currentTarget.closest('fieldset:disabled')) return;
        const next = moveSV(current.current, event.key, event.shiftKey ? 10 : 1);
        if (next) { event.preventDefault(); apply(next); }
      }}>
      <span className="theme-color-cursor" aria-hidden="true" style={{ left: `${hsv.s}%`, top: `${100 - hsv.v}%` }}/>
    </div>
    <p id={`${id}-help`} className="theme-control-help">چپ/راست: اشباع؛ بالا/پایین: روشنایی؛ Shift: گام ۱۰٪؛ Home/End: دو انتهای اشباع.</p>
    <label className="theme-color-hue-label" htmlFor={`${id}-hue`}>فام <span dir="ltr">{Math.round(hsv.h)}°</span></label>
    <input id={`${id}-hue`} className="theme-range theme-hue-range" type="range" min={0} max={360} step={1} value={Math.round(hsv.h)} aria-valuetext={`${Math.round(hsv.h)} درجه`} dir="ltr" onChange={event => apply({ ...current.current, h: Number(event.target.value) })}/>
    </div>
  </fieldset>;
}
