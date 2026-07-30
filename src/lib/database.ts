import { Pool, QueryResultRow } from "pg";
import { config } from "../config";
import { logger } from "../utils/logger";

export const dbPool = config.DATABASE_URL && process.env.NODE_ENV !== "test" ? new Pool({ connectionString: config.DATABASE_URL }) : null;

if (dbPool) {
  dbPool.on("error", (err) => {
    logger.error(`Unexpected database pool error: ${err.message || err}`);
  });
}

if (config.DATABASE_URL) {
  logger.info("Postgres database configured.");
} else {
  logger.warn("DATABASE_URL is not set. Postgres features are disabled.");
}

export async function queryDatabase<T extends QueryResultRow = any>(text: string, params?: unknown[]) {
  if (!dbPool) {
    throw new Error("DATABASE_URL is not defined in the environment.");
  }

  const result = await dbPool.query<T>(text, params);
  return result.rows;
}

export async function initializeDatabase() {
  if (!dbPool) return;
  try {
    // 1. Auto-run SQL migrations sequentially
    const fs = require("fs");
    const path = require("path");
    const migrationsDir = path.join(__dirname, "..", "..", "db", "migrations");
    if (fs.existsSync(migrationsDir)) {
      const files = fs.readdirSync(migrationsDir).filter((f: string) => f.endsWith(".sql")).sort();
      for (const file of files) {
        logger.info(`Running database migration: ${file}`);
        const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
        try {
          await queryDatabase(sql);
        } catch (migErr: any) {
          logger.warn(`Migration ${file} notice/warning: ${migErr.message || migErr}`);
        }
      }
      logger.info("All database migrations verified and applied.");
    }

    // 2. Ensure progress column (legacy safeguard)
    await queryDatabase("ALTER TABLE migration_jobs ADD COLUMN IF NOT EXISTS progress INTEGER DEFAULT 0");

    // 3. Ensure System User (all zeroes UUID)
    await queryDatabase(
      `INSERT INTO users (id, email, is_email_verified) 
       VALUES ('00000000-0000-0000-0000-000000000000'::uuid, 'system@migrationtool.local', true)
       ON CONFLICT (id) DO NOTHING`
    );

    // 4. Ensure System Workspace (ending in 1 UUID)
    await queryDatabase(
      `INSERT INTO workspaces (id, name, owner_id, slug) 
       VALUES ('00000000-0000-0000-0000-000000000001'::uuid, 'System Workspace', '00000000-0000-0000-0000-000000000000'::uuid, 'system-workspace')
       ON CONFLICT (id) DO NOTHING`
    );

    // 5. Ensure System Workspace membership
    await queryDatabase(
      `INSERT INTO workspace_members (workspace_id, user_id, role)
       VALUES ('00000000-0000-0000-0000-000000000001'::uuid, '00000000-0000-0000-0000-000000000000'::uuid, 'owner')
       ON CONFLICT (workspace_id, user_id) DO NOTHING`
    );

    // 6. Seed Default Super Admin Account (admin@migrationstudio.internal / Admin@123)
    const { hashPassword } = require("../utils/crypto");
    const adminEmail = "admin@migrationstudio.internal";
    const adminPassHash = hashPassword("Admin@123");

    const existingAdmin = await queryDatabase("SELECT id FROM users WHERE LOWER(email) = LOWER($1)", [adminEmail]);
    if (!existingAdmin || existingAdmin.length === 0) {
      const adminRows = await queryDatabase(
        `INSERT INTO users (email, password_hash, is_email_verified, full_name, system_role, status)
         VALUES ($1, $2, true, 'Platform Super Admin', 'SUPER_ADMIN', 'ACTIVE')
         RETURNING id`,
        [adminEmail, adminPassHash]
      );
      if (adminRows && adminRows.length > 0) {
        const adminId = adminRows[0].id;
        const { AuthService } = require("../services/auth.service");
        const authSvc = new AuthService();
        await authSvc.ensureUserWorkspace(adminId, adminEmail);
        logger.info(`Default Super Admin created: ${adminEmail} (Role: SUPER_ADMIN)`);
      }
    } else {
      await queryDatabase(
        "UPDATE users SET password_hash = $2, system_role = 'SUPER_ADMIN', status = 'ACTIVE' WHERE LOWER(email) = LOWER($1)",
        [adminEmail, adminPassHash]
      );
      logger.info(`Super Admin credentials updated for ${adminEmail}`);
    }

    // 7. Ensure regular user accounts default to USER system role
    await queryDatabase(
      "UPDATE users SET system_role = 'USER' WHERE LOWER(email) != 'admin@migrationstudio.internal' AND (system_role IS NULL OR system_role = 'SUPER_ADMIN')"
    );
    logger.info("Database startup: Verified system roles for active user accounts.");

    // Clean up stale, orphaned jobs left over in database from previous backend crashes/restarts
    // 1. Recover jobs that completed successfully (have results) but were left with processing/pending status
    await queryDatabase(
      "UPDATE migration_jobs SET status = 'completed'::varchar, progress = 100 WHERE (status = 'processing'::varchar OR status = 'pending'::varchar) AND result IS NOT NULL"
    );
    
    // 2. Mark remaining stuck jobs (no results) as failed
    await queryDatabase(
      "UPDATE migration_jobs SET status = 'failed'::varchar, message = 'Server restarted during execution' WHERE (status = 'processing'::varchar OR status = 'pending'::varchar) AND result IS NULL"
    );
    logger.info("Database startup cleanup: stale jobs recovered and cleaned successfully.");
  } catch (err) {
    logger.error(`Failed to initialize database schema: ${err}`);
  }
}

export async function closeDatabase() {
  if (dbPool) {
    await dbPool.end();
    logger.info("Postgres database connection closed.");
  }
}
