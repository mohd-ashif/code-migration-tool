import { onMigrationJob } from "../migration.queue";
import { migrateProject } from "../../services/migration.service";
import { markJobCompleted, markJobFailed } from "../../services/job.service";
import { logger } from "../../utils/logger";

onMigrationJob(async (request) => {
  const jobId = request.jobId;
  try {
    const result = await migrateProject(request);
    if (jobId) {
      await markJobCompleted(jobId, result);
    }
    logger.info(`Migration worker completed job ${jobId ?? "(no-id)"} for target ${request.targetFramework}`);
  } catch (error: any) {
    logger.error(`Migration worker failed for job ${jobId ?? "(no-id)"}: ${error}`);
    if (jobId) {
      await markJobFailed(jobId, error?.message ?? String(error));
    }
  }
});
