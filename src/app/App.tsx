import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, CalendarDays, ChevronLeft, ChevronRight, Clock3, ListTodo, Settings2, Sparkles, StickyNote } from 'lucide-react';
import type { CalendarSystem, Goal, GoalInput, ScheduleEntry, ScheduleItem, ShortTermTask, ShortTermTaskInput, Task, TaskEntry } from '../domain/models';
import { planner } from '../services/container';
import { calendarMonthKey, calendarParts, formatDate, getMonthDays, shiftDate, shiftMonth, shiftYear, todayKey } from '../features/calendar/calendar';
import { ClockPlanner } from '../features/daily-view/ClockPlanner';
import { DoTaskDialog } from '../features/tasks/DoTaskDialog';
import { TaskManagerDialog } from '../features/tasks/TaskManagerDialog';
import { CalendarViews } from '../features/calendar/CalendarViews';
import { goalProgress, scheduleEntriesForDate, taskEntriesForDate } from '../features/tasks/taskCalculations';
import { CalendarSwitch } from '../components/CalendarSwitch';
import { SettingsDialog } from '../components/SettingsDialog';

type View = 'daily' | 'weekly' | 'monthly' | 'yearly';
function BattleHelmetIcon() { return <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M5 17.2a11 11 0 0 1 22 0v2.1h-3.4v5.1H11.2l-2.1-3.2H5v-4Z"/><path d="M10.2 18.1H27M13.2 8.5l2.2 5.2m5.5-5.2-2.1 5.2M9 21.3h3.1"/></svg>; }
const sampleTasks = [
  { title: 'بررسی ایمیل‌ها', startTime: '08:30', endTime: '09:00', color: '#8193aa' },
  { title: 'تماس با علی', startTime: '10:15', endTime: '10:30', color: '#c38b61' },
  { title: 'مطالعه', startTime: '14:30', endTime: '15:30', color: '#a17b61' },
  { title: 'مرور برنامه‌ی فردا', kind: 'todo' as const, color: '#6b8f82' },
  { title: 'خرید حوله', kind: 'todo' as const, color: '#9b83a6' },
  { title: 'تماس با تعمیرکار', kind: 'todo' as const, color: '#c38b61' }
];
const sampleSchedule = [
  { title: 'شروع آرام روز', startTime: '07:00', endTime: '08:00', color: '#7fa491' },
  { title: 'کلاس زبان', startTime: '13:30', endTime: '15:00', color: '#bd8b68' },
  { title: 'ورزش', startTime: '18:00', endTime: '19:15', color: '#8c81a6' }
];
const viewLabels: Record<View, string> = { daily: 'روزانه', weekly: 'هفتگی', monthly: 'ماهانه', yearly: 'سالانه' };

export function App() {
  const [date, setDate] = useState(todayKey); const [view, setView] = useState<View>('daily');
  const [calendar, setCalendar] = useState<CalendarSystem>('persian'); const [tasks, setTasks] = useState<Task[]>([]); const [schedule, setSchedule] = useState<ScheduleItem[]>([]); const [goals, setGoals] = useState<Goal[]>([]); const [shortTasks, setShortTasks] = useState<ShortTermTask[]>([]);
  const [note, setNote] = useState(''); const [noteForDate, setNoteForDate] = useState(''); const [noteSaved, setNoteSaved] = useState(true); const [, setClockTick] = useState(0);
  const [doDialog, setDoDialog] = useState(false); const [managerOpen, setManagerOpen] = useState(false); const [editingItem, setEditingItem] = useState<Goal | ShortTermTask>(); const [settingsOpen, setSettingsOpen] = useState(false);
  const [loading, setLoading] = useState(true); const [ready, setReady] = useState(false); const [toast, setToast] = useState('');

  const datesToLoad = useMemo(() => {
    if (view === 'weekly') { const offset = (new Date(`${date}T12:00:00`).getDay() + 1) % 7; return Array.from({ length: 7 }, (_, i) => shiftDate(date, i - offset)); }
    if (view === 'monthly') return getMonthDays(date, calendar).dates;
    if (view === 'yearly') { const p = calendarParts(date, calendar); return Array.from({ length: 12 }, (_, i) => getMonthDays(calendarMonthKey(p.year, i + 1, calendar), calendar).dates).flat(); }
    return [date];
  }, [date, view, calendar]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const pref = await planner.getPreferences(); setCalendar(pref.calendar);
      const [loadedTasks, loadedSchedule, loadedGoals, loadedShortTasks] = await Promise.all([
        datesToLoad.length > 1 ? planner.getTasksBetween(datesToLoad[0], datesToLoad[datesToLoad.length - 1]) : planner.getTasks(datesToLoad[0]),
        datesToLoad.length > 1 ? planner.getScheduleBetween(datesToLoad[0], datesToLoad[datesToLoad.length - 1]) : planner.getSchedule(datesToLoad[0]),
        planner.getGoals(), planner.getShortTermTasks()
      ]);
      setTasks(loadedTasks); setSchedule(loadedSchedule); setGoals(loadedGoals); setShortTasks(loadedShortTasks);
      const dayNote = await planner.getNote(date); setNote(dayNote?.content ?? ''); setNoteForDate(date); setNoteSaved(true);
    } catch (error) { console.error(error); setToast('دریافت اطلاعات با مشکل روبه‌رو شد.'); }
    finally { setLoading(false); }
  }, [date, datesToLoad, view]);

  useEffect(() => { let alive = true; (async () => { try { const preferences = await planner.getPreferences(); if (!preferences.sampleDataInitialized) { const [allTasks, allBlocks] = await Promise.all([planner.getAllTasks(), planner.getAllSchedule()]); if (!allTasks.length && !allBlocks.length) { for (const item of sampleTasks) await planner.createTask({ ...item, date: todayKey(), kind: item.kind ?? 'timed', status: 'open' }); for (const item of sampleSchedule) await planner.createSchedule({ ...item, date: todayKey() }); } await planner.savePreferences({ calendar: preferences.calendar, sampleDataInitialized: true }); } } catch (e) { console.error(e); } if (alive) setReady(true); })(); return () => { alive = false; }; }, []);
  useEffect(() => { if (ready) void load(); }, [load, ready]);
  useEffect(() => { const id = window.setInterval(() => setClockTick(value => value + 1), 1000); return () => clearInterval(id); }, []);
  useEffect(() => { if (!toast) return; const id = setTimeout(() => setToast(''), 2600); return () => clearTimeout(id); }, [toast]);
  useEffect(() => { if (loading || noteForDate !== date) return; const id = setTimeout(() => planner.saveNote(date, note).then(() => setNoteSaved(true)).catch(() => setToast('ذخیره‌ی یادداشت انجام نشد.')), 450); return () => clearTimeout(id); }, [note, date, loading, noteForDate]);

  async function saveGoal(input: GoalInput) { await planner.createGoal(input); await load(); setToast('هدف به مسیرت اضافه شد'); }
  async function saveShortTask(input: ShortTermTaskInput) { await planner.createShortTermTask(input); await load(); setToast('کار به برنامه اضافه شد'); }
  async function updateGoal(id: string, input: GoalInput) { await planner.updateGoal(id, input); await load(); setEditingItem(undefined); setToast('تغییرات هدف ذخیره شد'); }
  async function updateShortTask(id: string, input: ShortTermTaskInput) { await planner.updateShortTermTask(id, input); await load(); setEditingItem(undefined); setToast('تغییرات کار ذخیره شد'); }
  async function deleteManagedItem(item: Goal | ShortTermTask) { if (item.kind === 'short-term') await planner.deleteShortTermTask(item.id); else await planner.deleteGoal(item.id); await load(); setToast('مورد حذف شد'); }
  async function toggleTask(entry: TaskEntry) {
    if (entry.source === 'short-term' && entry.shortTaskId) {
      const item = shortTasks.find(task => task.id === entry.shortTaskId); if (!item) return;
      if (item.mode === 'job') await planner.updateShortTermTask(item.id, { completed: !item.completed });
      else { const dates = item.completedDates.includes(entry.date) ? item.completedDates.filter(date => date !== entry.date) : [...item.completedDates, entry.date]; await planner.updateShortTermTask(item.id, { completedDates: dates }); }
    } else { const task = tasks.find(item => item.id === entry.id); if (task) await planner.updateTask(task.id, { status: task.status === 'done' ? 'open' : 'done' }); }
    await load();
  }
  async function toggleRoutine(item: ScheduleEntry) {
    if (!item.shortTaskId) return;
    const task = shortTasks.find(candidate => candidate.id === item.shortTaskId);
    if (!task) return;
    const completedDates = task.completedDates.includes(item.date) ? task.completedDates.filter(day => day !== item.date) : [...task.completedDates, item.date];
    await planner.updateShortTermTask(task.id, { completedDates });
    await load();
  }
  async function removeScheduleEntry(item: ScheduleEntry) {
    if (item.shortTaskId) await planner.deleteShortTermTask(item.shortTaskId);
    else await planner.deleteSchedule(item.id);
    await load(); setToast('بازه حذف شد');
  }
  async function removeTask(entry: TaskEntry) {
    if (entry.source === 'short-term' && entry.shortTaskId) await planner.deleteShortTermTask(entry.shortTaskId);
    else await planner.deleteTask(entry.id);
    await load(); setToast('کار حذف شد');
  }
  async function changeCalendar(value: CalendarSystem) { setCalendar(value); await planner.savePreferences({ calendar: value }); }
  const visibleEntries = datesToLoad.flatMap(day => taskEntriesForDate(tasks, shortTasks, day, calendar));
  const todoItems = taskEntriesForDate(tasks, shortTasks, date, calendar, true).filter(task => task.kind === 'todo');
  const timedTasks = taskEntriesForDate(tasks, shortTasks, date, calendar).filter(task => task.kind === 'timed');
  const daySchedule = scheduleEntriesForDate(schedule, shortTasks, date, calendar);
  const visibleSchedule = datesToLoad.flatMap(day => scheduleEntriesForDate(schedule, shortTasks, day, calendar));
  const midGoals = goals.filter((goal): goal is Extract<Goal, { kind: 'mid-term' }> => goal.kind === 'mid-term');
  const weeklyCommitmentHours = midGoals.reduce((total, goal) => total + goal.weeklyHours, 0);
  const progressFor = (goal: Goal) => goalProgress(goal, goals, shortTasks, todayKey(), calendar);
  const selectedDateLabel = formatDate(date, calendar, { weekday: 'long', day: 'numeric', month: 'long' });
  function navigate(amount: number) { if (view === 'weekly') setDate(shiftDate(date, amount)); else if (view === 'monthly') setDate(shiftMonth(date, amount, calendar)); else if (view === 'yearly') setDate(shiftYear(date, amount, calendar)); else setDate(shiftDate(date, amount)); }
  return <main className="app-shell">
    <header className="topbar"><a className="brand" href="#" aria-label="روز، خانه"><span className="brand-icon"><Clock3 size={20}/></span><span>روز<small>برنامه‌ریز شخصی</small></span></a><div className="topbar-center-actions"><button className="do-button" onClick={() => { setEditingItem(undefined); setDoDialog(true); }} aria-label="ساخت هدف یا کار جدید"><BattleHelmetIcon/></button><button className="all-tasks-button" onClick={() => setManagerOpen(true)} aria-label="نمایش همه‌ی تسک‌ها"><ListTodo size={17}/><span>همه‌ی تسک‌ها</span></button></div><div className="topbar-right"><CalendarSwitch value={calendar} onChange={changeCalendar}/><button className="icon-button settings-button" aria-label="تنظیمات" onClick={() => setSettingsOpen(true)}><Settings2 size={18}/></button><div className="avatar">م</div></div></header>
    <section className="page-intro"><div><div className="greeting"><span className="greeting-mark"><Sparkles size={15}/></span><span>به روزِ خودت خوش آمدی</span></div><h1>سلام <em>شکمو</em></h1><p>یک نگاه به برنامه‌ات بنداز و با آرامش شروع کن.</p></div><div className="date-card"><span>{formatDate(date, calendar, { year: 'numeric' })}</span><strong>{formatDate(date, calendar, { day: 'numeric', month: 'long' })}</strong><small>{formatDate(date, calendar, { weekday: 'long' })}</small></div></section>
    <nav className="view-navigation"><div className="view-tabs">{(['daily', 'weekly', 'monthly', 'yearly'] as View[]).map(item => <button key={item} className={view === item ? 'active' : ''} onClick={() => setView(item)}>{item === 'daily' ? <Clock3 size={16}/> : item === 'weekly' ? <CalendarDays size={16}/> : item === 'monthly' ? <ListTodo size={16}/> : <ArrowUpRight size={16}/>}<span>{viewLabels[item]}</span></button>)}</div><div className="date-navigation"><button aria-label="قبلی" className="icon-button" onClick={() => navigate(view === 'yearly' ? -1 : view === 'monthly' ? -1 : view === 'weekly' ? -7 : -1)}><ChevronRight/></button><span>{view === 'daily' ? selectedDateLabel : formatDate(date, calendar, { month: view === 'weekly' ? 'long' : undefined, year: 'numeric' })}</span><button aria-label="بعدی" className="icon-button" onClick={() => navigate(view === 'yearly' ? 1 : view === 'monthly' ? 1 : view === 'weekly' ? 7 : 1)}><ChevronLeft/></button>{date !== todayKey() && <button className="today-button" onClick={() => setDate(todayKey())}>امروز</button>}</div></nav>
    {view === 'daily' ? <>
      <section className="daily-heading"><div><span className="eyebrow">نقشه‌ی روز</span><h2>{selectedDateLabel}</h2></div><div className="day-summary"><span><b>{new Intl.NumberFormat('fa-IR').format(timedTasks.length)}</b> کار زمان‌دار</span><i/><span><b>{new Intl.NumberFormat('fa-IR').format(daySchedule.length)}</b> بازه</span></div></section>
      {loading ? <div className="loading-state">در حال آماده‌سازی روزت…</div> : <ClockPlanner tasks={timedTasks} schedule={daySchedule} onToggle={toggleTask} onToggleRoutine={toggleRoutine} onDelete={removeTask} onDeleteSchedule={removeScheduleEntry}/>}
      <div className="below-grid"><section className="todo-section"><div className="panel-heading"><div className="panel-icon todo-icon"><ListTodo size={17}/></div><div><span className="eyebrow">کارهای کوچک و بزرگ</span><h2>TODO های بدون وابستگی زمانی</h2></div><span className="count-badge">{new Intl.NumberFormat('fa-IR').format(todoItems.length)}</span></div><div className="todo-list">{todoItems.length ? todoItems.map(task => <div key={task.id} className={`todo-row ${task.status === 'done' ? 'completed' : ''}`}><button className="todo-check" aria-label={task.status === 'done' ? 'بازگرداندن کار' : 'انجام کار'} onClick={() => toggleTask(task)}>{task.status === 'done' ? '✓' : ''}</button><span className="todo-title">{task.title}</span><button className="todo-delete" onClick={() => removeTask(task)} aria-label="حذف">×</button></div>) : <div className="empty-state"><span>✳</span><p>کار بدون زمان‌بندی‌ای نداری.<br/>ذهن‌ات را برای چیزهای مهم آزاد بگذار.</p></div>}</div></section>
        <section className="note-section"><div className="panel-heading"><div className="panel-icon note-icon"><StickyNote size={17}/></div><div><span className="eyebrow">فضای فکر کردن</span><h2>یادداشت روزانه</h2></div><span className="save-indicator"><i className={noteSaved ? '' : 'saving'}/>{noteSaved ? 'ذخیره شد' : 'در حال ذخیره'}</span></div><textarea aria-label="یادداشت روزانه" value={note} onChange={e => { setNote(e.target.value); setNoteSaved(false); }} onBlur={() => { if (noteForDate === date) void planner.saveNote(date, note).then(() => setNoteSaved(true)); }} placeholder="امروز چه چیزی ذهنت را مشغول کرده؟ هرچه هست اینجا بنویس…"/><div className="note-footer"><span>یادداشت فقط برای همین روز است</span><span>{new Intl.NumberFormat('fa-IR').format(note.length)} نویسه</span></div></section></div>
    </> : <CalendarViews view={view} date={date} calendar={calendar} tasks={visibleEntries} schedule={visibleSchedule} goals={goals} weeklyCommitmentHours={weeklyCommitmentHours} getProgress={progressFor} onSelectDate={key => { setDate(key); if (view === 'monthly') setView('daily'); }} onSelectMonth={key => { setDate(key); setView('monthly'); }} onNavigate={navigate}/>}
    <footer className="app-footer"><span>آرام‌تر برنامه‌ریزی کن، عمیق‌تر زندگی کن.</span><span>روز <i>·</i> فضای شخصی تو</span></footer>
    <DoTaskDialog key={editingItem?.id ?? 'new-task'} open={doDialog} calendar={calendar} goals={goals} editing={editingItem} onClose={() => { setDoDialog(false); setEditingItem(undefined); }} onSaveGoal={saveGoal} onSaveShortTask={saveShortTask} onUpdateGoal={updateGoal} onUpdateShortTask={updateShortTask}/>
    <TaskManagerDialog open={managerOpen} goals={goals} shortTasks={shortTasks} calendar={calendar} getProgress={progressFor} onClose={() => setManagerOpen(false)} onEdit={item => { setManagerOpen(false); setEditingItem(item); setDoDialog(true); }} onDelete={deleteManagedItem}/>
    <SettingsDialog open={settingsOpen} calendar={calendar} onCalendarChange={changeCalendar} onClose={() => setSettingsOpen(false)}/>
    {toast && <div className="toast" role="status">{toast}</div>}
  </main>;
}
