import type { CalendarSystem } from '../domain/models';

export function CalendarSwitch({ value, onChange }: { value: CalendarSystem; onChange: (value: CalendarSystem) => void }) {
  const persian = value === 'persian';
  return <button type="button" role="switch" aria-checked={persian} aria-label="تقویم شمسی یا میلادی" className={`calendar-switch ${persian ? 'is-persian' : 'is-gregorian'}`} onClick={() => onChange(persian ? 'gregorian' : 'persian')}>
    <span className={persian ? 'selected' : ''}>شمسی</span><i className="switch-track"><b/></i><span className={!persian ? 'selected' : ''}>میلادی</span>
  </button>;
}
