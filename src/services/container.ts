import { LocalGoalRepository, LocalNoteRepository, LocalPreferencesRepository, LocalScheduleRepository, LocalShortTermTaskRepository, LocalTaskRepository } from '../repositories/localRepositories';
import { PlannerService } from './plannerService';

export const planner = new PlannerService(new LocalTaskRepository(), new LocalScheduleRepository(), new LocalNoteRepository(), new LocalPreferencesRepository(), new LocalGoalRepository(), new LocalShortTermTaskRepository());
