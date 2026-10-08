import type { NoteRepository, PreferencesRepository, ScheduleRepository, TaskRepository } from '../domain/repositories';
import type { GoalInput, Preferences, ScheduleInput, ShortTermTaskInput, TaskInput } from '../domain/models';
import type { GoalRepository, ShortTermTaskRepository } from '../domain/repositories';
import type { PlannerBackup } from '../storage/plannerBackup';

interface BackupStorage {
  exportData: () => Promise<PlannerBackup>;
  importData: (backup: PlannerBackup) => Promise<void>;
}

export class PlannerService {
  constructor(private tasks: TaskRepository, private schedule: ScheduleRepository, private notes: NoteRepository, private preferences: PreferencesRepository, private goals: GoalRepository, private shortTasks: ShortTermTaskRepository, private resetStorage: () => Promise<void>, private backupStorage?: BackupStorage) {}
  clearMemory() { return this.resetStorage(); }
  async exportData() {
    if (!this.backupStorage) throw new Error('Backup storage is unavailable');
    return this.backupStorage.exportData();
  }
  async importData(backup: PlannerBackup) {
    if (!this.backupStorage) throw new Error('Backup storage is unavailable');
    await this.backupStorage.importData(backup);
  }
  getTasks(date: string) { return this.tasks.getByDate(date); }
  getTasksBetween(start: string, end: string) { return this.tasks.getBetween(start, end); }
  getAllTasks() { return this.tasks.getAll(); }
  getSchedule(date: string) { return this.schedule.getByDate(date); }
  getScheduleBetween(start: string, end: string) { return this.schedule.getBetween(start, end); }
  getAllSchedule() { return this.schedule.getAll(); }
  getNote(date: string) { return this.notes.getByDate(date); }
  getNotesBetween(start: string, end: string) { return this.notes.getBetween(start, end); }
  createTask(input: TaskInput) { return this.tasks.create(input); }
  updateTask(id: string, changes: Partial<TaskInput>) { return this.tasks.update(id, changes); }
  deleteTask(id: string) { return this.tasks.delete(id); }
  createSchedule(input: ScheduleInput) { return this.schedule.create(input); }
  updateSchedule(id: string, changes: Partial<ScheduleInput>) { return this.schedule.update(id, changes); }
  deleteSchedule(id: string) { return this.schedule.delete(id); }
  saveNote(date: string, content: string) { return this.notes.save(date, content); }
  getPreferences() { return this.preferences.get(); }
  savePreferences(value: Preferences) { return this.preferences.save(value); }
  getGoals() { return this.goals.getAll(); }
  createGoal(input: GoalInput) { return this.goals.create(input); }
  updateGoal(id: string, changes: Partial<GoalInput>) { return this.goals.update(id, changes); }
  deleteGoal(id: string) { return this.goals.delete(id); }
  getShortTermTasks() { return this.shortTasks.getAll(); }
  createShortTermTask(input: ShortTermTaskInput) { return this.shortTasks.create(input); }
  updateShortTermTask(id: string, changes: Partial<ShortTermTaskInput>) { return this.shortTasks.update(id, changes); }
  deleteShortTermTask(id: string) { return this.shortTasks.delete(id); }
}
