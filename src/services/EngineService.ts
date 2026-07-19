import { EngineRepository } from "../repositories/EngineRepository";
import { CodemodRepository } from "../repositories/CodemodRepository";
import { FrameworkRepository } from "../repositories/FrameworkRepository";
import { MigrationEngineDto, CodemodDto, CompilerSettingsDto, FrameworkStatus, OptimizationLevel } from "../types/framework.types";
import { logger } from "../utils/logger";
import { queryDatabase } from "../lib/database";
import { FrameworkService } from "./FrameworkService";

export class EngineService {
  private engineRepo = new EngineRepository();
  private codemodRepo = new CodemodRepository();
  private frameworkRepo = new FrameworkRepository();

  private async logAudit(action: string, details: any, userId?: string) {
    const userStr = userId ? `User: ${userId}` : "System Admin";
    const logMsg = `[AUDIT] ${action} - ${JSON.stringify(details)} by ${userStr}`;
    logger.info(logMsg);

    // Save to migration_logs if pool exists, with null job_id for system/admin actions
    try {
      await queryDatabase(`
        INSERT INTO migration_logs (level, message)
        VALUES ($1, $2)
      `, ["INFO", logMsg]);
    } catch (e: any) {
      logger.error(`Failed to write audit log to database: ${e.message}`);
    }
  }

  async getEngines(): Promise<MigrationEngineDto[]> {
    return this.engineRepo.findAll();
  }

  async updateEngine(id: string, patch: { status?: FrameworkStatus; optimizationLevel?: OptimizationLevel; compilerVersion?: string; astVersion?: string; supported?: boolean }, userId?: string): Promise<MigrationEngineDto> {
    const current = await this.engineRepo.findById(id);
    if (!current) {
      throw new Error(`Engine with ID ${id} not found`);
    }

    const updated = await this.engineRepo.updateEngine(id, patch);
    if (!updated) {
      throw new Error(`Failed to update engine with ID ${id}`);
    }

    await this.logAudit("UPDATE_ENGINE", { engineId: id, old: current, patch }, userId);
    FrameworkService.invalidateCaches();
    return updated;
  }

  async getCodemods(frameworkId?: string): Promise<CodemodDto[]> {
    return this.codemodRepo.findAll(frameworkId);
  }

  async updateCodemod(id: string, patch: { enabled?: boolean; priority?: number }, userId?: string): Promise<CodemodDto> {
    const current = await this.codemodRepo.findById(id);
    if (!current) {
      throw new Error(`Codemod with ID ${id} not found`);
    }

    const updated = await this.codemodRepo.updateCodemod(id, patch);
    if (!updated) {
      throw new Error(`Failed to update codemod with ID ${id}`);
    }

    await this.logAudit("UPDATE_CODEMOD", { codemodId: id, old: current, patch }, userId);

    // Dynamic engine active_codemods count recalculation
    if (current.engineId && patch.enabled !== undefined) {
      const activeCountRow = await queryDatabase(`
        SELECT COUNT(*)::int as count 
        FROM codemods 
        WHERE engine_id = $1 AND enabled = true
      `, [current.engineId]);
      const count = activeCountRow[0]?.count || 0;
      await queryDatabase(`
        UPDATE migration_engines 
        SET active_codemods = $1 
        WHERE id = $2
      `, [count, current.engineId]);
    }

    FrameworkService.invalidateCaches();
    return updated;
  }

  async updateCompilerSettings(frameworkId: string, patch: Partial<CompilerSettingsDto>, userId?: string): Promise<CompilerSettingsDto> {
    const current = await this.frameworkRepo.findSettings(frameworkId);
    if (!current) {
      throw new Error(`Compiler settings for framework ID ${frameworkId} not found`);
    }

    const updated = await this.frameworkRepo.updateSettings(current.id, patch);
    if (!updated) {
      throw new Error(`Failed to update compiler settings for framework ID ${frameworkId}`);
    }

    await this.logAudit("UPDATE_COMPILER_SETTINGS", { frameworkId, old: current, patch }, userId);
    FrameworkService.invalidateCaches();
    return updated;
  }
}
