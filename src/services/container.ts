import { LocalGoalRepository, LocalNoteRepository, LocalPreferencesRepository, LocalScheduleRepository, LocalShortTermTaskRepository, LocalTaskRepository } from '../repositories/localRepositories';
import { PlannerService } from './plannerService';
import { clearAllPlannerData } from '../storage/localDatabase';
import { exportPlannerBackup, importPlannerBackup } from '../storage/plannerBackup';

export const planner = new PlannerService(new LocalTaskRepository(), new LocalScheduleRepository(), new LocalNoteRepository(), new LocalPreferencesRepository(), new LocalGoalRepository(), new LocalShortTermTaskRepository(), clearAllPlannerData, { exportData: exportPlannerBackup, importData: importPlannerBackup });
