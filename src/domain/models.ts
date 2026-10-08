export type CalendarSystem = 'gregorian' | 'persian';
export type TaskKind = 'timed' | 'todo';
export type GoalRelation = { goalId: string; coefficient: 1 | 2 | 3 | 4 | 5 };

interface GoalBase {
  id: string; title: string; createdAt: string; updatedAt: string;
}
export interface LongTermGoal extends GoalBase {
  kind: 'long-term'; deadlineDate: string; note: string;
}
export interface MidTermGoal extends GoalBase {
  kind: 'mid-term'; relatedLongTermGoals: GoalRelation[]; category: string; customCategory: string;
  why: string; importance: number; deadlineChoice: 'yes' | 'no' | 'unsure'; deadlineDate?: string;
  dateReason: string; deadlineType: 'fixed' | 'self-imposed' | 'flexible' | ''; realism: 'definitely' | 'probably' | 'unsure' | 'probably-not';
  doneCriteria: string; milestones: string[]; keyMilestone: number; firstAction: string; weeklyHours: number;
  tradeoffs: string; difficulty: number; obstacles: string[]; controllableObstacle: number; motivationPlan: string;
  priorityChoice: 'yes' | 'no' | 'unsure'; competingGoals: string; adaptPlan: string; progressMeasures: string;
  reviewFrequency: 'weekly' | 'two-weeks' | 'monthly' | 'other'; reviewFrequencyOther: string;
  progressOneMonth: string; progressThreeMonths: string; progressHalfway: string;
  checkWant: 'yes' | 'no' | 'unsure'; checkEffort: 'yes' | 'no' | 'unsure'; checkSpecific: 'yes' | 'no';
  checkTimeframe: 'yes' | 'no' | 'not-needed'; checkInfluence: 'yes' | 'partly' | 'no'; checkFirstStep: 'yes' | 'no';
  finalWant: string; finalBecause: string; finalBy: string; finalSuccess: string; finalFirstStep: string; finalReviewDate: string;
}
export type Goal = LongTermGoal | MidTermGoal;
export type LongTermGoalInput = Omit<LongTermGoal, keyof GoalBase> & { kind: 'long-term'; title: string };
export type MidTermGoalInput = Omit<MidTermGoal, keyof GoalBase> & { kind: 'mid-term'; title: string };
export type GoalInput = LongTermGoalInput | MidTermGoalInput;

export type ShortTaskMode = 'job' | 'routine';
export type RoutinePattern = 'daily' | 'weekdays' | 'weekends' | 'selected' | 'even-dates' | 'odd-dates';
export interface RoutineSchedule {
  pattern: RoutinePattern; weekdays: number[]; startDate: string; endDate?: string;
  isTimed: boolean; startTime?: string; endTime?: string;
}
export interface ShortTermTask {
  id: string; kind: 'short-term'; mode: ShortTaskMode; title: string; color: string; priority: number;
  relatedMidTermGoals: GoalRelation[]; triggerDate?: string; triggerTime?: string; routine?: RoutineSchedule;
  completed: boolean; completedDates: string[]; createdAt: string; updatedAt: string;
}
export type ShortTermTaskInput = Omit<ShortTermTask, 'id' | 'createdAt' | 'updatedAt'>;

/** View model for a single dated occurrence of an older task or a short-term task. */
export interface TaskEntry {
  id: string; title: string; date: string; kind: TaskKind; startTime?: string; endTime?: string;
  status: 'open' | 'done'; color: string; source: 'legacy' | 'short-term'; shortTaskId?: string;
}
export interface Task {
  id: string; title: string; description?: string; date: string; kind: TaskKind;
  startTime?: string; endTime?: string; status: 'open' | 'done'; color: string;
  createdAt: string; updatedAt: string;
}
export interface ScheduleItem {
  id: string; title: string; date: string; startTime: string; endTime: string;
  color: string; createdAt: string; updatedAt: string;
}
export interface ScheduleEntry extends ScheduleItem {
  shortTaskId?: string; completed?: boolean; sourceId?: string; occurrenceDate?: string;
}
export interface DayNote { date: string; content: string; updatedAt: string }
export interface Preferences { calendar: CalendarSystem; theme?: import('../features/themes/registry').ThemePreferences }
export type TaskInput = Omit<Task, 'id' | 'createdAt' | 'updatedAt'>;
export type ScheduleInput = Omit<ScheduleItem, 'id' | 'createdAt' | 'updatedAt'>;
