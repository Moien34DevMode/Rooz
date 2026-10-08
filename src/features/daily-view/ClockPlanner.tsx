import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Circle, Trash2 } from 'lucide-react';
import type { CalendarSystem, ScheduleEntry, TaskEntry } from '../../domain/models';
import { CLOCK_SIZE, CENTER, FACE_RADIUS, spiralPoint, pointAt, rangePath } from './clockGeometry';

import { formatDate, todayKey } from '../calendar/calendar';
import { durationMinutes } from '../calendar/calendarSummary';
import '../../styles/clock.css';

interface Props { date: string; calendar: CalendarSystem; tasks: TaskEntry[]; schedule: ScheduleEntry[]; onToggle: (task: TaskEntry) => void; onToggleRoutine: (item: ScheduleEntry) => void; onDelete: (task: TaskEntry) => void; onDeleteSchedule: (item: ScheduleEntry) => void }
type HoverTarget = { type: 'task'; id: string } | { type: 'schedule'; id: string } | null;
type CursorPosition = { x: number; y: number };
const isMorning = (time: string) => Number(time.slice(0, 2)) < 12;

export function ClockPlanner({ date, calendar, tasks, schedule, onToggle, onToggleRoutine, onDelete, onDeleteSchedule }: Props) {
  const [hovered, setHovered] = useState<HoverTarget>(null);
  const [cursor, setCursor] = useState<CursorPosition | null>(null);
  const closeTimer = useRef<number | undefined>(undefined);
  const cancelClose = () => { if (closeTimer.current !== undefined) window.clearTimeout(closeTimer.current); };
  const deferClose = () => { cancelClose(); closeTimer.current = window.setTimeout(() => setHovered(null), 250); };
  const showAtCursor = (target: HoverTarget, position: CursorPosition) => { cancelClose(); setHovered(target); setCursor(position); };
  useEffect(() => () => cancelClose(), []);

  const taskGroups = useMemo(() => {
    const groups = new Map<string, TaskEntry[]>();
    for (const task of tasks) {
      if (task.kind !== 'timed' || !task.startTime) continue;
      groups.set(task.startTime, [...(groups.get(task.startTime) ?? []), task]);
    }
    return [...groups.entries()].map(([time, items]) => ({ time, items, key: `task-${time}` }));
  }, [tasks]);
  const activeTaskGroup = hovered?.type === 'task' ? taskGroups.find(group => group.key === hovered.id) : undefined;
  const activeSchedule = hovered?.type === 'schedule' ? schedule.find(item => item.id === hovered.id) : undefined;
  const popupHeight = activeTaskGroup ? 62 + activeTaskGroup.items.length * 31 : 126;
  const popupPosition = cursor ? {
    left: Math.max(12, Math.min(window.innerWidth - 230, cursor.x + 15)),
    top: Math.max(12, Math.min(window.innerHeight - popupHeight - 12, cursor.y + 15))
  } : undefined;

  const current = new Date();
  const isToday = date === todayKey();
  const completed = tasks.filter(task => task.status === 'done').length + schedule.filter(item => item.completed).length;
  const plannedMinutes = schedule.reduce((total, item) => total + durationMinutes(item.startTime, item.endTime), 0);
  const agenda = useMemo(() => [
    ...tasks.map(task => ({ type: 'task' as const, item: task })),
    ...schedule.map(item => ({ type: 'schedule' as const, item }))
  ].sort((a, b) => (a.item.startTime ?? '').localeCompare(b.item.startTime ?? '')), [tasks, schedule]);
  const nowPoint = spiralPoint(`${String(current.getHours()).padStart(2, '0')}:${String(current.getMinutes()).padStart(2, '0')}`);
  const minuteAngle = current.getMinutes() / 60 * Math.PI * 2 - Math.PI / 2;
  const hourAngle = (current.getHours() % 12 + current.getMinutes() / 60) / 12 * Math.PI * 2 - Math.PI / 2;
  const secondAngle = current.getSeconds() / 60 * Math.PI * 2 - Math.PI / 2;
  const focusPosition = (element: SVGElement) => { const rect = element.getBoundingClientRect(); return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }; };

  return <section className="clock-layout" aria-label="برنامه زمان‌بندی روز">
    <div className="clock-stage">
      <div className="clock-caption"><span className="live-dot"/> ساعت زنده <span className="caption-divider"/> <time className="current-time" dateTime={current.toISOString()}>{current.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' })}</time><span className="clock-date-context">{isToday ? 'امروز' : 'برنامه‌ی روز انتخاب‌شده'}</span></div>
      <svg className="clock-svg" viewBox={`0 0 ${CLOCK_SIZE} ${CLOCK_SIZE}`} role="group" aria-label="برنامه‌ی روز روی مسیر مارپیچی ۲۴ ساعته، از نیمه‌شب تا نیمه‌شب بعد">
        <circle cx={CENTER} cy={CENTER} r={FACE_RADIUS + 15} className="clock-halo"/><circle cx={CENTER} cy={CENTER} r={FACE_RADIUS} className="clock-face"/>
        <path d={rangePath('00:00', '24:00')} className="range-track"/>
        {['00:00', '12:00', '24:00'].map(time => { const point = spiralPoint(time); return <g key={time}><circle cx={point.x} cy={point.y} r="2" fill="#9ba99f"/><text x={point.x + 12} y={point.y} dominantBaseline="central" className="clock-center-label">{new Intl.NumberFormat('fa-IR').format(Number(time.slice(0, 2)))}</text></g>; })}
        {Array.from({ length: 60 }, (_, index) => { const angle = index / 60 * Math.PI * 2 - Math.PI / 2; const start = pointAt(angle, index % 5 === 0 ? FACE_RADIUS - 12 : FACE_RADIUS - 5); const end = pointAt(angle, FACE_RADIUS - 1); return <line key={index} x1={start.x} y1={start.y} x2={end.x} y2={end.y} className={index % 5 === 0 ? 'tick major' : 'tick'}/>; })}
        {[12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((number, index) => { const point = pointAt(index * Math.PI / 6 - Math.PI / 2, FACE_RADIUS - 35); return <text key={number} x={point.x} y={point.y} className="clock-number" dominantBaseline="central" textAnchor="middle">{new Intl.NumberFormat('fa-IR').format(number)}</text>; })}
        {schedule.map(item => { const start = spiralPoint(item.startTime); const target = { type: 'schedule' as const, id: item.id }; const isActive = hovered?.type === 'schedule' && hovered.id === item.id; return <g key={item.id} className={`range ${isActive ? 'active' : ''}`} onMouseEnter={event => showAtCursor(target, { x: event.clientX, y: event.clientY })} onMouseLeave={deferClose} onFocus={event => showAtCursor(target, focusPosition(event.currentTarget))} onBlur={deferClose} onClick={event => showAtCursor(target, { x: event.clientX, y: event.clientY })} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); showAtCursor(target, focusPosition(event.currentTarget)); } }} role="button" tabIndex={0} aria-label={`${item.title}، ${item.startTime} تا ${item.endTime}`}><path d={rangePath(item.startTime, item.endTime)} stroke={item.color}/><circle cx={start.x} cy={start.y} r="4" fill={item.color}/><title>{`${item.title}، ${item.startTime} تا ${item.endTime}`}</title></g>; })}
        {taskGroups.map(group => { const point = spiralPoint(group.time); const target = { type: 'task' as const, id: group.key }; const active = hovered?.type === 'task' && hovered.id === group.key; const color = group.items[0].color; return <g key={group.key} className={`task-marker ${active ? 'active' : ''}`} onMouseEnter={event => showAtCursor(target, { x: event.clientX, y: event.clientY })} onMouseLeave={deferClose} onFocus={event => showAtCursor(target, focusPosition(event.currentTarget))} onBlur={deferClose} onClick={event => showAtCursor(target, { x: event.clientX, y: event.clientY })} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); showAtCursor(target, focusPosition(event.currentTarget)); } }} role="button" tabIndex={0} aria-label={`${group.items.length} کار در ساعت ${group.time}`}><circle cx={point.x} cy={point.y} r="14" className="marker-hit-area"/><circle cx={point.x} cy={point.y} r={active ? 8 : 6} fill={color} className="marker-dot"/><circle cx={point.x} cy={point.y} r="2.5" fill="#fff"/>{group.items.length > 1 && <text x={point.x} y={point.y - 13} textAnchor="middle" className="marker-count">{new Intl.NumberFormat('fa-IR').format(group.items.length)}</text>}</g>; })}
        <line x1={CENTER} y1={CENTER} x2={CENTER + Math.cos(hourAngle) * 75} y2={CENTER + Math.sin(hourAngle) * 75} className="hand hour-hand"/><line x1={CENTER} y1={CENTER} x2={CENTER + Math.cos(minuteAngle) * 116} y2={CENTER + Math.sin(minuteAngle) * 116} className="hand minute-hand"/><line x1={CENTER} y1={CENTER} x2={CENTER + Math.cos(secondAngle) * 135} y2={CENTER + Math.sin(secondAngle) * 135} className="hand second-hand"/><circle cx={CENTER} cy={CENTER} r="5" className="hand-pin"/>
        {isToday && <g className="clock-now" aria-label="اکنون روی مسیر ۲۴ ساعته"><circle cx={nowPoint.x} cy={nowPoint.y} r="8"/><circle cx={nowPoint.x} cy={nowPoint.y} r="3" className="clock-now-core"/></g>}
        <text x={CENTER} y={CENTER + 83} textAnchor="middle" className="clock-center-label">روزِ تو</text>
      </svg>
    </div>
    <aside className="clock-agenda" aria-label="فهرست زمان‌بندی روز">
      <div className="clock-agenda-heading"><span className="eyebrow">از نگاه تا عمل</span><h3>{formatDate(date, calendar, { weekday: 'long', day: 'numeric', month: 'long' })}</h3><p>مسیر بیرونی ساعت، برنامه‌ی کامل ۲۴ ساعت است.</p></div>
      <div className="clock-metrics"><div><strong>{new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 1 }).format(plannedMinutes / 60)}</strong><span>ساعت بازه</span></div><div><strong>{new Intl.NumberFormat('fa-IR').format(tasks.length + schedule.length)}</strong><span>فعالیت</span></div><div><strong>{new Intl.NumberFormat('fa-IR').format(completed)}</strong><span>انجام‌شده</span></div></div>
      <div className="clock-legend"><span><i className="legend-line"/>بازه‌ی زمانی</span><span><i className="legend-dot"/>کار زمان‌دار</span>{isToday && <span><i className="legend-now"/>اکنون</span>}</div>
      <div className="clock-agenda-list">{agenda.length ? agenda.map(entry => {
        const done = entry.type === 'task' ? entry.item.status === 'done' : entry.item.completed;
        return <article className={`clock-agenda-item ${done ? 'done' : ''}`} key={`${entry.type}-${entry.item.id}`}>
          <i style={{ background: entry.item.color }}/><div><span className="clock-agenda-time">{entry.item.startTime}{entry.item.endTime ? ` — ${entry.item.endTime}` : ''}</span><strong>{entry.item.title}</strong><small>{entry.type === 'task' ? 'کار زمان‌دار' : entry.item.occurrenceDate && entry.item.occurrenceDate < date ? 'ادامه از روز قبل' : 'بازه‌ی برنامه'}</small></div>
          {(entry.type === 'task' || entry.item.shortTaskId) && <button className="icon-button" aria-label={`${done ? 'بازگرداندن' : 'انجام شد:'} ${entry.item.title}`} aria-pressed={!!done} onClick={() => entry.type === 'task' ? onToggle(entry.item) : onToggleRoutine(entry.item)}>{done ? <Check size={16}/> : <Circle size={16}/>}</button>}
          <button className="clock-agenda-delete" aria-label={`حذف ${entry.item.title}`} onClick={() => entry.type === 'task' ? onDelete(entry.item) : onDeleteSchedule(entry.item)}><Trash2 size={14}/></button>
        </article>;
      }) : <p className="clock-agenda-empty">برنامه‌ی امروز هنوز خالی است.<br/>از دکمه‌ی ساخت، یک کار یا روتین اضافه کن.</p>}</div>
    </aside>
    {popupPosition && activeTaskGroup && <div className="clock-hover-card" style={popupPosition} onMouseEnter={cancelClose} onMouseLeave={deferClose} onFocusCapture={cancelClose} onBlurCapture={deferClose}>
      <div className="hover-card-heading"><span>{activeTaskGroup.time}</span><small>{isMorning(activeTaskGroup.time) ? 'صبح' : 'بعدازظهر'}</small></div>
      {activeTaskGroup.items.map(task => <div className="hover-task-row" key={task.id}><button className="hover-task-check" aria-label={task.status === 'done' ? 'بازگرداندن کار' : `انجام شد: ${task.title}`} onClick={() => onToggle(task)}>{task.status === 'done' ? <Check size={13}/> : <Circle size={14}/>}</button><span className={`hover-task-title ${task.status === 'done' ? 'completed' : ''}`}>{task.title}</span><button className="hover-task-delete" aria-label={`حذف ${task.title}`} onClick={() => onDelete(task)}><Trash2 size={13}/></button></div>)}
    </div>}
    {popupPosition && activeSchedule && <div className="clock-hover-card schedule-hover-card" style={popupPosition} onMouseEnter={cancelClose} onMouseLeave={deferClose} onFocusCapture={cancelClose} onBlurCapture={deferClose}>
      <div className="hover-card-heading"><span>{activeSchedule.startTime} ـ {activeSchedule.endTime}</span><small>{activeSchedule.occurrenceDate && activeSchedule.occurrenceDate < activeSchedule.date ? 'ادامه از روز قبل' : activeSchedule.endTime === '24:00' ? 'تا نیمه‌شب' : isMorning(activeSchedule.startTime) ? 'صبح' : 'بعدازظهر'}</small></div><div className="hover-schedule-row">{activeSchedule.shortTaskId && <button className="hover-task-check" aria-label={activeSchedule.completed ? 'بازگرداندن روتین' : `انجام شد: ${activeSchedule.title}`} onClick={() => onToggleRoutine(activeSchedule)}>{activeSchedule.completed ? <Check size={13}/> : <Circle size={14}/>}</button>}<strong className={`hover-schedule-title ${activeSchedule.completed ? 'completed' : ''}`}>{activeSchedule.title}</strong><button className="hover-task-delete" aria-label={`حذف ${activeSchedule.title}`} onClick={() => onDeleteSchedule(activeSchedule)}><Trash2 size={13}/></button></div>
    </div>}
  </section>;
}
