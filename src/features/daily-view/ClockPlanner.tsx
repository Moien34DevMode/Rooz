import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Circle, Trash2 } from 'lucide-react';
import type { ScheduleEntry, TaskEntry } from '../../domain/models';
import { CLOCK_SIZE, CENTER, FACE_RADIUS, AM_ARC_RADIUS, PM_ARC_RADIUS, AM_TASK_RADIUS, PM_TASK_RADIUS, timePoint, pointAt, rangePath } from './clockGeometry';

interface Props { tasks: TaskEntry[]; schedule: ScheduleEntry[]; onToggle: (task: TaskEntry) => void; onToggleRoutine: (item: ScheduleEntry) => void; onDelete: (task: TaskEntry) => void; onDeleteSchedule: (item: ScheduleEntry) => void }
type HoverTarget = { type: 'task'; id: string } | { type: 'schedule'; id: string } | null;
type CursorPosition = { x: number; y: number };
const isMorning = (time: string) => Number(time.slice(0, 2)) < 12;

export function ClockPlanner({ tasks, schedule, onToggle, onToggleRoutine, onDelete, onDeleteSchedule }: Props) {
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
  const minuteAngle = current.getMinutes() / 60 * Math.PI * 2 - Math.PI / 2;
  const hourAngle = (current.getHours() % 12 + current.getMinutes() / 60) / 12 * Math.PI * 2 - Math.PI / 2;
  const secondAngle = current.getSeconds() / 60 * Math.PI * 2 - Math.PI / 2;
  const focusPosition = (element: SVGElement) => { const rect = element.getBoundingClientRect(); return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }; };

  return <section className="clock-layout" aria-label="برنامه زمان‌بندی روز">
    <div className="clock-stage">
      <div className="clock-caption"><span className="live-dot"/> ساعت روز <span className="caption-divider"/> <span className="current-time">{current.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' })}</span></div>
      <svg className="clock-svg" viewBox={`0 0 ${CLOCK_SIZE} ${CLOCK_SIZE}`} role="group" aria-label="ساعت روز با بازه‌ها و کارهای زمان‌دار">
        <circle cx={CENTER} cy={CENTER} r={FACE_RADIUS + 15} className="clock-halo"/><circle cx={CENTER} cy={CENTER} r={FACE_RADIUS} className="clock-face"/>
        <circle cx={CENTER} cy={CENTER} r={AM_TASK_RADIUS} className="task-track"/><circle cx={CENTER} cy={CENTER} r={PM_TASK_RADIUS} className="task-track"/>
        <circle cx={CENTER} cy={CENTER} r={AM_ARC_RADIUS} className="range-track"/><circle cx={CENTER} cy={CENTER} r={PM_ARC_RADIUS} className="range-track"/>
        {Array.from({ length: 60 }, (_, index) => { const angle = index / 60 * Math.PI * 2 - Math.PI / 2; const start = pointAt(angle, index % 5 === 0 ? FACE_RADIUS - 12 : FACE_RADIUS - 5); const end = pointAt(angle, FACE_RADIUS - 1); return <line key={index} x1={start.x} y1={start.y} x2={end.x} y2={end.y} className={index % 5 === 0 ? 'tick major' : 'tick'}/>; })}
        {[12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((number, index) => { const point = pointAt(index * Math.PI / 6 - Math.PI / 2, FACE_RADIUS - 35); return <text key={number} x={point.x} y={point.y} className="clock-number" dominantBaseline="central" textAnchor="middle">{new Intl.NumberFormat('fa-IR').format(number)}</text>; })}
        {schedule.map(item => { const morning = isMorning(item.startTime); const radius = morning ? AM_ARC_RADIUS : PM_ARC_RADIUS; const start = timePoint(item.startTime, radius); const target = { type: 'schedule' as const, id: item.id }; const isActive = hovered?.type === 'schedule' && hovered.id === item.id; return <g key={item.id} className={`range ${isActive ? 'active' : ''}`} onMouseEnter={event => showAtCursor(target, { x: event.clientX, y: event.clientY })} onMouseLeave={deferClose} onFocus={event => showAtCursor(target, focusPosition(event.currentTarget))} onBlur={deferClose} role="button" tabIndex={0} aria-label={`${item.title}، ${item.startTime} تا ${item.endTime}`}><path d={rangePath(item.startTime, item.endTime, radius)} stroke={item.color}/><circle cx={start.x} cy={start.y} r="4" fill={item.color}/><title>{item.title}، {item.startTime} تا {item.endTime}</title></g>; })}
        {taskGroups.map(group => { const morning = isMorning(group.time); const radius = morning ? AM_TASK_RADIUS : PM_TASK_RADIUS; const point = timePoint(group.time, radius); const target = { type: 'task' as const, id: group.key }; const active = hovered?.type === 'task' && hovered.id === group.key; const color = group.items[0].color; return <g key={group.key} className={`task-marker ${active ? 'active' : ''}`} onMouseEnter={event => showAtCursor(target, { x: event.clientX, y: event.clientY })} onMouseLeave={deferClose} onFocus={event => showAtCursor(target, focusPosition(event.currentTarget))} onBlur={deferClose} onClick={event => showAtCursor(target, { x: event.clientX, y: event.clientY })} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); showAtCursor(target, focusPosition(event.currentTarget)); } }} role="button" tabIndex={0} aria-label={`${group.items.length} کار در ساعت ${group.time}`}><circle cx={point.x} cy={point.y} r="14" className="marker-hit-area"/><circle cx={point.x} cy={point.y} r={active ? 8 : 6} fill={color} className="marker-dot"/><circle cx={point.x} cy={point.y} r="2.5" fill="#fff"/>{group.items.length > 1 && <text x={point.x} y={point.y - 13} textAnchor="middle" className="marker-count">{new Intl.NumberFormat('fa-IR').format(group.items.length)}</text>}</g>; })}
        <line x1={CENTER} y1={CENTER} x2={CENTER + Math.cos(hourAngle) * 75} y2={CENTER + Math.sin(hourAngle) * 75} className="hand hour-hand"/><line x1={CENTER} y1={CENTER} x2={CENTER + Math.cos(minuteAngle) * 116} y2={CENTER + Math.sin(minuteAngle) * 116} className="hand minute-hand"/><line x1={CENTER} y1={CENTER} x2={CENTER + Math.cos(secondAngle) * 135} y2={CENTER + Math.sin(secondAngle) * 135} className="hand second-hand"/><circle cx={CENTER} cy={CENTER} r="5" className="hand-pin"/>
        <text x={CENTER} y={CENTER + 83} textAnchor="middle" className="clock-center-label">روزِ تو</text>
      </svg>
    </div>
    {popupPosition && activeTaskGroup && <div className="clock-hover-card" style={popupPosition} onMouseEnter={cancelClose} onMouseLeave={deferClose} onFocusCapture={cancelClose} onBlurCapture={deferClose}>
      <div className="hover-card-heading"><span>{activeTaskGroup.time}</span><small>{isMorning(activeTaskGroup.time) ? 'صبح' : 'بعدازظهر'}</small></div>
      {activeTaskGroup.items.map(task => <div className="hover-task-row" key={task.id}><button className="hover-task-check" aria-label={task.status === 'done' ? 'بازگرداندن کار' : `انجام شد: ${task.title}`} onClick={() => onToggle(task)}>{task.status === 'done' ? <Check size={13}/> : <Circle size={14}/>}</button><span className={`hover-task-title ${task.status === 'done' ? 'completed' : ''}`}>{task.title}</span><button className="hover-task-delete" aria-label={`حذف ${task.title}`} onClick={() => onDelete(task)}><Trash2 size={13}/></button></div>)}
    </div>}
    {popupPosition && activeSchedule && <div className="clock-hover-card schedule-hover-card" style={popupPosition} onMouseEnter={cancelClose} onMouseLeave={deferClose} onFocusCapture={cancelClose} onBlurCapture={deferClose}>
      <div className="hover-card-heading"><span>{activeSchedule.startTime} ـ {activeSchedule.endTime}</span><small>{isMorning(activeSchedule.startTime) ? 'صبح' : 'بعدازظهر'}</small></div><div className="hover-schedule-row">{activeSchedule.shortTaskId && <button className="hover-task-check" aria-label={activeSchedule.completed ? 'بازگرداندن روتین' : `انجام شد: ${activeSchedule.title}`} onClick={() => onToggleRoutine(activeSchedule)}>{activeSchedule.completed ? <Check size={13}/> : <Circle size={14}/>}</button>}<strong className={`hover-schedule-title ${activeSchedule.completed ? 'completed' : ''}`}>{activeSchedule.title}</strong><button className="hover-task-delete" aria-label={`حذف ${activeSchedule.title}`} onClick={() => onDeleteSchedule(activeSchedule)}><Trash2 size={13}/></button></div>
    </div>}
  </section>;
}
