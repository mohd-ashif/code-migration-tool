import { initializeDatabase, queryDatabase, closeDatabase } from "../src/lib/database";
import { logger } from "../src/utils/logger";

async function run() {
  await initializeDatabase();
  
  const users = await queryDatabase("SELECT id, email FROM users");
  logger.info("--- USERS ---");
  console.log(users);

  const workspaces = await queryDatabase("SELECT id, name, owner_id FROM workspaces");
  logger.info("--- WORKSPACES ---");
  console.log(workspaces);

  const jobs = await queryDatabase("SELECT id, project_name, workspace_id, user_id, status FROM migration_jobs");
  logger.info("--- JOBS ---");
  console.log(jobs);

  await closeDatabase();
}

run().catch(console.error);
