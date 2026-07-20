import { ActivityRepository } from "../repositories/activity.repository";

export class WorkspaceActivityService {
  private activityRepo = new ActivityRepository();

  async logActivity(
    workspaceId: string, 
    userId: string | null, 
    action: string, 
    metadata?: any
  ) {
    return this.activityRepo.log(workspaceId, userId, action, metadata);
  }

  async listActivity(workspaceId: string, limit = 20, offset = 0) {
    return this.activityRepo.listActivity(workspaceId, limit, offset);
  }
}
export const workspaceActivityService = new WorkspaceActivityService();
