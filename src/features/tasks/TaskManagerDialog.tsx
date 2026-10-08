import { useMemo, useState } from 'react';
import { Search, Trash2, X } from 'lucide-react';
import type { CalendarSystem, Goal, MidTermGoal, ShortTermTask } from '../../domain/models';
import { calendarParts, formatDate, todayKey } from '../calendar/calendar';

type ManagedItem = Goal | ShortTermTask;
type KindFilter = 'all' | 'long-term' | 'mid-term' | 'job' | 'routine';
type StatusFilter = 'all' | 'open' | 'done' | 'active';
const categoryLabels: Record<string, string> = { career: 'کار و حرفه', education: 'آموزش و یادگیری', money: 'مالی', health: 'سلامت', relationships: 'روابط', growth: 'رشد فردی', lifestyle: 'سبک زندگی', creative: 'پروژه‌ی خلاقانه', other: 'سایر' };
const patternLabels: Record<string, string> = { daily: 'هر روز', weekdays: 'روزهای کاری هفته', weekends: 'پنجشنبه و جمعه', selected: 'روزهای انتخابی', 'even-dates': 'روزهای زوج ماه', 'odd-dates': 'روزهای فرد ماه' };
const weekdayNames = ['یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه', 'شنبه'];
const answerLabels: Record<string, string> = { yes: 'بله', no: 'خیر', unsure: 'مطمئن نیستم', definitely: 'قطعاً', probably: 'احتمالاً', 'probably-not': 'احتمالاً نه', fixed: 'قطعی و بیرونی', 'self-imposed': 'انتخاب خودم', flexible: 'انعطاف‌پذیر', 'not-needed': 'لازم نیست', partly: 'تاحدی', weekly: 'هر هفته', 'two-weeks': 'هر دو هفته', monthly: 'هر ماه', other: 'بازه‌ی دیگر' };
const shown = (value: unknown, calendar: CalendarSystem) => {
  if (value === undefined || value === null || value === '') return 'ثبت نشده';
  if (typeof value === 'boolean') return value ? 'بله' : 'خیر';
  if (typeof value === 'number') return new Intl.NumberFormat('fa-IR').format(value);
  if (Array.isArray(value)) return value.length ? value.map(item => typeof item === 'string' ? item : JSON.stringify(item)).join('، ') : 'ثبت نشده';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return formatDate(value, calendar);
  return answerLabels[String(value)] ?? String(value);
};
const isMid = (item: ManagedItem): item is MidTermGoal => item.kind === 'mid-term';
const isShort = (item: ManagedItem): item is ShortTermTask => item.kind === 'short-term';

export function TaskManagerDialog({ open, goals, shortTasks, calendar, getProgress, onClose, onEdit, onDelete }: {
  open: boolean; goals: Goal[]; shortTasks: ShortTermTask[]; calendar: CalendarSystem;
  getProgress: (item: Goal) => number; onClose: () => void; onEdit: (item: ManagedItem) => void; onDelete: (item: ManagedItem) => Promise<void>;
}) {
  const [query, setQuery] = useState(''); const [kind, setKind] = useState<KindFilter>('all'); const [status, setStatus] = useState<StatusFilter>('all');
  const [category, setCategory] = useState('all'); const [deadline, setDeadline] = useState('all'); const [deadlineYear, setDeadlineYear] = useState('all'); const [priority, setPriority] = useState(1); const [importance, setImportance] = useState(1); const [pattern, setPattern] = useState('all'); const [timeMode, setTimeMode] = useState('all'); const [relatedGoal, setRelatedGoal] = useState('all');
  const [selectedId, setSelectedId] = useState('');
  const items = useMemo<ManagedItem[]>(() => [...goals, ...shortTasks].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), [goals, shortTasks]);
  const filtered = useMemo(() => items.filter(item => {
    const taskKind: KindFilter = item.kind === 'long-term' ? 'long-term' : item.kind === 'mid-term' ? 'mid-term' : item.mode;
    if (kind !== 'all' && taskKind !== kind) return false;
    const search = query.trim().toLocaleLowerCase();
    const text = item.kind === 'long-term' ? `${item.title} ${item.note}` : item.kind === 'mid-term' ? `${item.title} ${item.why} ${item.category} ${item.customCategory}` : item.title;
    if (search && !text.toLocaleLowerCase().includes(search)) return false;
    if (isMid(item) && category !== 'all' && item.category !== category) return false;
    if (isMid(item) && item.importance < importance) return false;
    if (isShort(item) && priority > 1 && item.priority < priority) return false;
    if (isShort(item) && item.mode === 'routine' && pattern !== 'all' && item.routine?.pattern !== pattern) return false;
    if (timeMode !== 'all') {
      const isTimed = isShort(item) ? item.mode === 'routine' ? Boolean(item.routine?.isTimed) : Boolean(item.triggerTime) : false;
      if ((timeMode === 'timed') !== isTimed) return false;
    }
    if (relatedGoal !== 'all') {
      const linked = isMid(item) ? item.relatedLongTermGoals.some(relation => relation.goalId === relatedGoal) : isShort(item) ? item.relatedMidTermGoals.some(relation => relation.goalId === relatedGoal) : false;
      if (!linked) return false;
    }
    if (deadlineYear !== 'all') {
      const itemDate = item.kind === 'long-term' ? item.deadlineDate : isMid(item) ? item.deadlineDate : isShort(item) ? item.mode === 'routine' ? item.routine?.endDate ?? item.routine?.startDate : item.triggerDate : undefined;
      if (!itemDate || String(calendarParts(itemDate, calendar).year) !== deadlineYear) return false;
    }
    if (deadline !== 'all') {
      const hasDeadline = item.kind === 'long-term' || (isMid(item) ? item.deadlineChoice === 'yes' && Boolean(item.deadlineDate) : isShort(item) ? item.mode === 'job' ? Boolean(item.triggerDate) : Boolean(item.routine?.endDate) : false);
      if ((deadline === 'has') !== hasDeadline) return false;
    }
    if (status !== 'all') {
      if (isShort(item)) {
        const done = item.mode === 'job' ? item.completed : item.completedDates.includes(todayKey());
        const active = item.mode === 'job' ? !item.completed : !item.routine?.endDate || item.routine.endDate >= todayKey();
        if (status === 'done' && !done || status === 'open' && done || status === 'active' && !active) return false;
      } else if (status === 'open' || status === 'active') { if (getProgress(item) >= 100) return false; }
      else if (status === 'done' && getProgress(item) < 100) return false;
    }
    return true;
  }), [items, kind, query, category, importance, priority, pattern, timeMode, relatedGoal, deadline, deadlineYear, status, getProgress, calendar]);
  const selected = filtered.find(item => item.id === selectedId) ?? filtered[0];
  if (!open) return null;
  const goalOptions = kind === 'all' ? goals : kind === 'long-term' || kind === 'mid-term' ? goals.filter(goal => goal.kind === 'long-term') : goals.filter(goal => goal.kind === 'mid-term');
  const years = [...new Set(items.flatMap(item => { const itemDate = item.kind === 'long-term' ? item.deadlineDate : isMid(item) ? item.deadlineDate : isShort(item) ? item.mode === 'routine' ? item.routine?.endDate ?? item.routine?.startDate : item.triggerDate : undefined; return itemDate ? [calendarParts(itemDate, calendar).year] : []; }))].sort((a, b) => b - a);

  function detailsFor(item: ManagedItem) {
    if (item.kind === 'long-term') return [
      ['سال هدف', shown(calendarParts(item.deadlineDate, calendar).year, calendar)], ['یادداشت', item.note || 'ثبت نشده'], ['درصد پیشرفت', `${getProgress(item)}٪`], ['ایجاد شده', shown(item.createdAt.slice(0, 10), calendar)], ['آخرین ویرایش', shown(item.updatedAt.slice(0, 10), calendar)]
    ];
    if (isMid(item)) {
      const fields: [string, unknown][] = [
        ['حوزه', item.category === 'other' ? item.customCategory || 'سایر' : categoryLabels[item.category] ?? item.category], ['چرا این هدف را می‌خواهی؟', item.why], ['اهمیت', `${item.importance} از ۱۰`], ['مهلت', item.deadlineChoice], ['تاریخ مهلت', item.deadlineDate], ['دلیل انتخاب تاریخ', item.dateReason], ['نوع مهلت', item.deadlineType], ['واقع‌بینی بازه', item.realism], ['تعریف موفقیت', item.doneCriteria], ['مراحل مسیر', item.milestones], ['مهم‌ترین مرحله', item.milestones[item.keyMilestone]], ['اولین اقدام', item.firstAction], ['تعهد هفتگی', `${item.weeklyHours} ساعت`], ['چیزی که کم می‌کنی', item.tradeoffs], ['سختی', `${item.difficulty} از ۱۰`], ['موانع', item.obstacles], ['مانع قابل‌کنترل', item.obstacles[item.controllableObstacle]], ['برنامه هنگام افت انگیزه', item.motivationPlan], ['اولویت ۶ تا ۱۲ ماه', item.priorityChoice], ['هدف‌های رقیب', item.competingGoals], ['تغییر در صورت تغییر اولویت', item.adaptPlan], ['معیارهای پیشرفت', item.progressMeasures], ['تناوب بازبینی', item.reviewFrequency === 'other' ? item.reviewFrequencyOther : item.reviewFrequency], ['پیشرفت یک‌ماهه', item.progressOneMonth], ['پیشرفت سه‌ماهه', item.progressThreeMonths], ['پیشرفت نیمه‌ی مسیر', item.progressHalfway], ['بررسی نهایی', [item.checkWant, item.checkEffort, item.checkSpecific, item.checkTimeframe, item.checkInfluence, item.checkFirstStep].join(' · ')], ['هدف نهایی من', item.finalWant], ['چون', item.finalBecause], ['تا', item.finalBy], ['معیار رسیدن', item.finalSuccess], ['اولین قدم نهایی', item.finalFirstStep], ['تاریخ بازبینی', item.finalReviewDate], ['هدف‌های بلندمدت مرتبط', item.relatedLongTermGoals.map(link => `${goals.find(goal => goal.id === link.goalId)?.title ?? 'هدف حذف‌شده'} (ضریب ${link.coefficient})`)]
      ];
      const finalCheckIndex = fields.findIndex(([label]) => label === 'بررسی نهایی');
      fields.splice(finalCheckIndex, 1,
        ['واقعاً این هدف را می‌خواهم؟', item.checkWant], ['ارزش تلاش را دارد؟', item.checkEffort],
        ['به‌اندازه‌ی کافی مشخص است؟', item.checkSpecific], ['بازه روشن است؟', item.checkTimeframe],
        ['می‌توانم بر نتیجه اثر بگذارم؟', item.checkInfluence], ['اولین قدم را می‌دانم؟', item.checkFirstStep]
      );
      return [['درصد پیشرفت', `${getProgress(item)}٪`], ...fields];
    }
    const relations = item.relatedMidTermGoals.map(link => `${goals.find(goal => goal.id === link.goalId)?.title ?? 'هدف حذف‌شده'} (ضریب ${link.coefficient})`).join('، ');
    return item.mode === 'job' ? [['نوع', 'کار مشخص'], ['وضعیت', item.completed ? 'انجام‌شده' : 'باز'], ['تاریخ', item.triggerDate], ['ساعت', item.triggerTime], ['اولویت', `${item.priority} از ۱۰`], ['اهداف میان‌مدت مرتبط', relations], ['ایجاد شده', item.createdAt.slice(0, 10)]] : [['نوع', 'روتین'], ['وضعیت امروز', item.completedDates.includes(todayKey()) ? 'انجام‌شده' : 'باز'], ['تکرار', item.routine ? patternLabels[item.routine.pattern] : 'ثبت نشده'], ['روزهای انتخابی', item.routine?.weekdays.map(day => weekdayNames[day]).join('، ')], ['شروع', item.routine?.startDate], ['پایان', item.routine?.endDate ?? 'بدون پایان'], ['بازه‌ی زمانی', item.routine?.isTimed ? `${item.routine.startTime} تا ${item.routine.endTime}` : 'ندارد'], ['اولویت', `${item.priority} از ۱۰`], ['اهداف میان‌مدت مرتبط', relations], ['روزهای انجام‌شده', item.completedDates.length]];
  }

  return <div className="modal-backdrop manager-backdrop" onMouseDown={event => event.target === event.currentTarget && onClose()}><section className="task-manager" role="dialog" aria-modal="true" aria-labelledby="manager-title">
    <header className="manager-header"><div><span className="eyebrow">مرور و مدیریت</span><h2 id="manager-title">همه‌ی هدف‌ها و کارها</h2></div><button className="icon-button" aria-label="بستن" onClick={onClose}><X size={18}/></button></header>
    <div className="manager-search"><Search size={17}/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="جست‌وجو در عنوان و توضیحات…" aria-label="جست‌وجو"/><span>{new Intl.NumberFormat('fa-IR').format(filtered.length)} مورد</span></div>
    <div className="manager-filters">
      <label>نوع<select value={kind} onChange={event => { setKind(event.target.value as KindFilter); setRelatedGoal('all'); }}><option value="all">همه‌ی نوع‌ها</option><option value="long-term">بلندمدت</option><option value="mid-term">میان‌مدت</option><option value="job">کار کوتاه‌مدت</option><option value="routine">روتین</option></select></label>
      <label>وضعیت<select value={status} onChange={event => setStatus(event.target.value as StatusFilter)}><option value="all">همه</option><option value="open">باز / در مسیر</option><option value="done">انجام‌شده</option><option value="active">فعال</option></select></label>
      {(kind === 'all' || kind === 'mid-term') && <label>حوزه<select value={category} onChange={event => setCategory(event.target.value)}><option value="all">همه‌ی حوزه‌ها</option>{Object.entries(categoryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>}
      {(kind === 'all' || kind === 'mid-term') && <label className="manager-priority">حداقل اهمیت: {new Intl.NumberFormat('fa-IR').format(importance)}<input type="range" min="1" max="10" value={importance} onChange={event => setImportance(Number(event.target.value))}/></label>}
      {(kind === 'all' || kind === 'long-term' || kind === 'mid-term' || kind === 'job') && <label>مهلت<select value={deadline} onChange={event => setDeadline(event.target.value)}><option value="all">همه</option><option value="has">با مهلت</option><option value="none">بدون مهلت</option></select></label>}
      {(kind === 'all' || kind === 'long-term' || kind === 'mid-term' || kind === 'job') && <label>سال<select value={deadlineYear} onChange={event => setDeadlineYear(event.target.value)}><option value="all">همه‌ی سال‌ها</option>{years.map(year => <option key={year} value={year}>{new Intl.NumberFormat(calendar === 'persian' ? 'fa-IR-u-ca-persian' : 'en').format(year)}</option>)}</select></label>}
      {(kind === 'all' || kind === 'job' || kind === 'routine') && <label className="manager-priority">حداقل اولویت: {new Intl.NumberFormat('fa-IR').format(priority)}<input type="range" min="1" max="10" value={priority} onChange={event => setPriority(Number(event.target.value))}/></label>}
      {(kind === 'all' || kind === 'routine') && <label>الگوی روتین<select value={pattern} onChange={event => setPattern(event.target.value)}><option value="all">همه</option>{Object.entries(patternLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>}
      {(kind === 'all' || kind === 'job' || kind === 'routine') && <label>بازه‌ی زمانی<select value={timeMode} onChange={event => setTimeMode(event.target.value)}><option value="all">همه</option><option value="timed">با ساعت</option><option value="no-time">بدون ساعت</option></select></label>}
      {kind !== 'long-term' && <label>هدف مرتبط<select value={relatedGoal} onChange={event => setRelatedGoal(event.target.value)}><option value="all">همه</option>{goalOptions.map(goal => <option key={goal.id} value={goal.id}>{goal.title}</option>)}</select></label>}
    </div>
    <div className="manager-body"><div className="manager-list">{filtered.length ? filtered.map(item => {
      const progress = item.kind !== 'short-term' ? getProgress(item) : (item.mode === 'job' ? item.completed : item.completedDates.includes(todayKey())) ? 100 : 0;
      const typeLabel = item.kind === 'long-term' ? 'بلندمدت' : item.kind === 'mid-term' ? 'میان‌مدت' : item.mode === 'job' ? 'کار کوتاه‌مدت' : 'روتین';
      const progressLabel = isShort(item) && item.mode === 'routine' ? `${new Intl.NumberFormat('fa-IR').format(item.completedDates.length)} روز` : `${new Intl.NumberFormat('fa-IR').format(progress)}٪`;
      return <button key={item.id} className={`manager-item ${selected?.id === item.id ? 'selected' : ''}`} onClick={() => setSelectedId(item.id)}><span className="manager-item-type">{typeLabel}</span><strong>{item.title}</strong><span className="manager-item-bottom"><small>{isMid(item) ? categoryLabels[item.category] ?? item.customCategory : isShort(item) && item.mode === 'job' ? item.triggerDate ? formatDate(item.triggerDate, calendar) : 'بدون مهلت' : item.kind === 'long-term' ? formatDate(item.deadlineDate, calendar, { year: 'numeric' }) : item.mode === 'routine' ? patternLabels[item.routine?.pattern ?? 'daily'] : ''}</small><b>{progressLabel}</b></span><i className="manager-progress"><b style={{ width: `${progress}%` }}/></i></button>;
    }) : <div className="manager-empty">موردی با این فیلترها پیدا نشد.</div>}</div>
      <div className="manager-detail">{selected ? <><div className="manager-detail-heading"><div><span className="manager-item-type">{selected.kind === 'long-term' ? 'هدف بلندمدت' : selected.kind === 'mid-term' ? 'هدف میان‌مدت' : selected.mode === 'job' ? 'کار کوتاه‌مدت' : 'روتین'}</span><h3>{selected.title}</h3></div><div className="manager-detail-actions"><button className="manager-edit" onClick={() => onEdit(selected)}>ویرایش</button><button className="manager-delete" aria-label={`حذف ${selected.title}`} onClick={() => { if (window.confirm(`«${selected.title}» حذف شود؟`)) void onDelete(selected); }}><Trash2 size={15}/></button></div></div><div className="manager-details-list">{detailsFor(selected).map(([label, value], index) => <div className="manager-detail-row" key={`${label}-${index}`}><strong>{label}</strong><span>{shown(value, calendar)}</span></div>)}</div></> : <div className="manager-empty">برای دیدن جزئیات، یک مورد را انتخاب کن.</div>}</div>
    </div>
  </section></div>;
}
