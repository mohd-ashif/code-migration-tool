import { queryDatabase } from "../lib/database";
import { logger } from "../utils/logger";

export interface AuditLogOptions {
  adminUserId: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  workspaceId?: string;
  metadata?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
}

export class AdminAuditService {
  /**
   * Redact sensitive fields from audit metadata
   */
  private static redactMetadata(meta?: Record<string, any>): Record<string, any> | null {
    if (!meta) return null;
    const clean = JSON.parse(JSON.stringify(meta));
    const SENSITIVE_KEYS = [
      "password", "password_hash", "passwordHash", "token", "jwt",
      "secret", "apiKey", "api_key", "key", "authorization", "razorpay_key_secret"
    ];

    const sanitize = (obj: any) => {
      if (!obj || typeof obj !== "object") return;
      for (const k of Object.keys(obj)) {
        if (SENSITIVE_KEYS.some((s) => k.toLowerCase().includes(s.toLowerCase()))) {
          obj[k] = "[REDACTED]";
        } else if (typeof obj[k] === "object") {
          sanitize(obj[k]);
        }
      }
    };

    sanitize(clean);
    return clean;
  }

  /**
   * Log an immutable admin audit record to database
   */
  public static async log(options: AuditLogOptions): Promise<void> {
    try {
      const redactedMeta = this.redactMetadata(options.metadata);
      const query = `
        INSERT INTO admin_audit_logs (
          admin_user_id, action, resource_type, resource_id, workspace_id, metadata, ip_address, user_agent
        )
        VALUES ($1::uuid, $2, $3, $4, $5::uuid, $6, $7, $8)
      `;
      await queryDatabase(query, [
        options.adminUserId,
        options.action,
        options.resourceType,
        options.resourceId || null,
        options.workspaceId || null,
        redactedMeta ? JSON.stringify(redactedMeta) : null,
        options.ipAddress || null,
        options.userAgent || null,
      ]);

      logger.info(`[ADMIN AUDIT] ${options.action} on ${options.resourceType}:${options.resourceId || "N/A"} by Admin ${options.adminUserId}`);
    } catch (err: any) {
      logger.error(`Failed to write admin audit log: ${err.message}`);
    }
  }

  /**
   * Retrieve audit logs with pagination and filters
   */
  public static async getLogs(filters: {
    adminUserId?: string;
    action?: string;
    resourceType?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ logs: any[]; total: number }> {
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (filters.adminUserId) {
      conditions.push(`admin_user_id = $${paramIndex++}::uuid`);
      params.push(filters.adminUserId);
    }
    if (filters.action) {
      conditions.push(`action = $${paramIndex++}`);
      params.push(filters.action);
    }
    if (filters.resourceType) {
      conditions.push(`resource_type = $${paramIndex++}`);
      params.push(filters.resourceType);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const countQuery = `SELECT COUNT(*) as total FROM admin_audit_logs ${whereClause}`;
    const countRows = await queryDatabase(countQuery, params);
    const total = parseInt(countRows[0]?.total ?? "0", 10);

    const limit = filters.limit ?? 20;
    const offset = filters.offset ?? 0;

    params.push(limit, offset);
    const query = `
      SELECT 
        a.id, a.admin_user_id as "adminUserId", u.email as "adminEmail", u.full_name as "adminName",
        a.action, a.resource_type as "resourceType", a.resource_id as "resourceId",
        a.workspace_id as "workspaceId", a.metadata, a.ip_address as "ipAddress",
        a.user_agent as "userAgent", a.created_at as "createdAt"
      FROM admin_audit_logs a
      LEFT JOIN users u ON u.id = a.admin_user_id
      ${whereClause}
      ORDER BY a.created_at DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `;

    const logs = await queryDatabase(query, params);
    return { logs, total };
  }
}
