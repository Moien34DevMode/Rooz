import Dexie, { type Table } from 'dexie';
import type { DayNote, Goal, Preferences, ScheduleItem, ShortTermTask, Task } from '../domain/models';

class PlannerDatabase extends Dexie {
  tasks!: Table<Task, string>; schedule!: Table<ScheduleItem, string>;
  goals!: Table<Goal, string>; shortTasks!: Table<ShortTermTask, string>;
  notes!: Table<DayNote, string>; preferences!: Table<{ id: string; value: Preferences }, string>;
  constructor() {
    super('rooz-planner');
    this.version(1).stores({ tasks: 'id,date,kind,status', schedule: 'id,date', notes: 'date', preferences: 'id' });
    this.version(2).stores({ tasks: 'id,date,kind,status', schedule: 'id,date', notes: 'date', preferences: 'id', goals: 'id,kind', shortTasks: 'id,kind,mode,triggerDate' });
  }
}
export const database = new PlannerDatabase();
