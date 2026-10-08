import { X, HardDrive, CalendarDays } from 'lucide-react';
import type { CalendarSystem } from '../domain/models';
import { CalendarSwitch } from './CalendarSwitch';

export function SettingsDialog({ open, calendar, onCalendarChange, onClose }: { open: boolean; calendar: CalendarSystem; onCalendarChange: (calendar: CalendarSystem) => void; onClose: () => void }) {
  if (!open) return null;
  return <div className="modal-backdrop" onMouseDown={event => event.target === event.currentTarget && onClose()}><section className="settings-dialog" aria-labelledby="settings-title" role="dialog" aria-modal="true">
    <div className="dialog-top"><div><span className="eyebrow">شخصی‌سازی روز</span><h2 id="settings-title">تنظیمات</h2></div><button className="icon-button" aria-label="بستن" onClick={onClose}><X size={18}/></button></div>
    <div className="setting-row"><span className="setting-icon"><CalendarDays size={17}/></span><div className="setting-copy"><strong>تقویم نمایش</strong><small>تاریخ‌ها بر پایه‌ی میلادی ذخیره می‌شوند.</small></div><CalendarSwitch value={calendar} onChange={onCalendarChange}/></div>
    <div className="setting-row"><span className="setting-icon"><HardDrive size={17}/></span><div className="setting-copy"><strong>ذخیره‌سازی محلی</strong><small>اطلاعات فقط در همین مرورگر و دستگاه نگهداری می‌شود.</small></div><span className="storage-status"><i/>فعال</span></div>
    <p className="settings-footnote">با پاک‌کردن داده‌های سایت در مرورگر، اطلاعات روز هم پاک می‌شود.</p>
  </section></div>;
}
