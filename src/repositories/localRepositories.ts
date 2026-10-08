import { database } from '../storage/localDatabase';
import type { NoteRepository, PreferencesRepository, ScheduleRepository, TaskRepository } from '../domain/repositories';
import type { DayNote, Goal, GoalInput, Preferences, ScheduleInput, ScheduleItem, ShortTermTask, ShortTermTaskInput, Task, TaskInput } from '../domain/models';

const now = () => new Date().toISOString();
const makeId = () => crypto.randomUUID();
export class LocalTaskRepository implements TaskRepository {
  getByDate(date: string) { return database.tasks.where('date').equals(date).toArray(); }
  getBetween(start: string, end: string) { return database.tasks.where('date').between(start, end, true, true).toArray(); }
  getAll() { return database.tasks.toArray(); }
  getById(id: string) { return database.tasks.get(id); }
  async create(input: TaskInput): Promise<Task> { const time = now(); const item = { ...input, id: makeId(), createdAt: time, updatedAt: time }; await database.tasks.add(item); return item; }
  async update(id: string, changes: Partial<TaskInput>): Promise<Task> { const current = await database.tasks.get(id); if (!current) throw new Error('Task not found'); const item = { ...current, ...changes, updatedAt: now() }; await database.tasks.put(item); return item; }
  async delete(id: string) { await database.tasks.delete(id); }
}
export class LocalScheduleRepository implements ScheduleRepository {
  getByDate(date: string) { return database.schedule.where('date').equals(date).toArray(); }
  getBetween(start: string, end: string) { return database.schedule.where('date').between(start, end, true, true).toArray(); }
  getAll() { return database.schedule.toArray(); }
  async create(input: ScheduleInput): Promise<ScheduleItem> { const time = now(); const item = { ...input, id: makeId(), createdAt: time, updatedAt: time }; await database.schedule.add(item); return item; }
  async update(id: string, changes: Partial<ScheduleInput>): Promise<ScheduleItem> { const current = await database.schedule.get(id); if (!current) throw new Error('Schedule item not found'); const item = { ...current, ...changes, updatedAt: now() }; await database.schedule.put(item); return item; }
  async delete(id: string) { await database.schedule.delete(id); }
}
export class LocalNoteRepository implements NoteRepository {
  getByDate(date: string) { return database.notes.get(date); }
  getBetween(start: string, end: string) { return database.notes.where('date').between(start, end, true, true).toArray(); }
  async save(date: string, content: string): Promise<DayNote> { const item = { date, content, updatedAt: now() }; await database.notes.put(item); return item; }
}
export class LocalPreferencesRepository implements PreferencesRepository {
  async get(): Promise<Preferences> { return (await database.preferences.get('app'))?.value ?? { calendar: 'persian' }; }
  async save(value: Preferences) { const current = await this.get(); await database.preferences.put({ id: 'app', value: { ...current, ...value } }); }
}
export class LocalGoalRepository {
  getAll(): Promise<Goal[]> { return database.goals.toArray(); }
  getById(id: string) { return database.goals.get(id); }
  async create(input: GoalInput): Promise<Goal> { const time = now(); const item = { ...input, id: makeId(), createdAt: time, updatedAt: time } as Goal; await database.goals.add(item); return item; }
  async update(id: string, changes: Partial<GoalInput>): Promise<Goal> { const current = await database.goals.get(id); if (!current) throw new Error('Goal not found'); const item = { ...current, ...changes, updatedAt: now() } as Goal; await database.goals.put(item); return item; }
  async delete(id: string) { await database.goals.delete(id); }
}
export class LocalShortTermTaskRepository {
  getAll(): Promise<ShortTermTask[]> { return database.shortTasks.toArray(); }
  getById(id: string) { return database.shortTasks.get(id); }
  async create(input: ShortTermTaskInput): Promise<ShortTermTask> { const time = now(); const item = { ...input, id: makeId(), createdAt: time, updatedAt: time }; await database.shortTasks.add(item); return item; }
  async update(id: string, changes: Partial<ShortTermTaskInput>): Promise<ShortTermTask> { const current = await database.shortTasks.get(id); if (!current) throw new Error('Short-term task not found'); const item = { ...current, ...changes, updatedAt: now() }; await database.shortTasks.put(item); return item; }
  async delete(id: string) { await database.shortTasks.delete(id); }
}
