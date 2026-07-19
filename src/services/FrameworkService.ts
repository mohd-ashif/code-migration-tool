import { FrameworkRepository } from "../repositories/FrameworkRepository";
import { FrameworkDto, FrameworkDetailDto, SupportedMigrationDto, CompilerHealthDto } from "../types/framework.types";
import { EngineRepository } from "../repositories/EngineRepository";

export class FrameworkService {
  private frameworkRepo = new FrameworkRepository();
  private engineRepo = new EngineRepository();

  // Simple in-memory cache for frameworks list & matrix to optimize performance
  private static frameworksCache: { data: FrameworkDto[]; expiresAt: number } | null = null;
  private static matrixCache: { data: SupportedMigrationDto[]; expiresAt: number } | null = null;
  private static CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes cache

  async getFrameworks(bypassCache = false): Promise<FrameworkDto[]> {
    const now = Date.now();
    if (!bypassCache && FrameworkService.frameworksCache && FrameworkService.frameworksCache.expiresAt > now) {
      return FrameworkService.frameworksCache.data;
    }

    const data = await this.frameworkRepo.findAll();
    FrameworkService.frameworksCache = {
      data,
      expiresAt: now + FrameworkService.CACHE_TTL_MS
    };
    return data;
  }

  async getFrameworkDetail(id: string): Promise<FrameworkDetailDto | null> {
    return this.frameworkRepo.findById(id);
  }

  async getMigrationMatrix(bypassCache = false): Promise<SupportedMigrationDto[]> {
    const now = Date.now();
    if (!bypassCache && FrameworkService.matrixCache && FrameworkService.matrixCache.expiresAt > now) {
      return FrameworkService.matrixCache.data;
    }

    const data = await this.frameworkRepo.findMigrationMatrix();
    FrameworkService.matrixCache = {
      data,
      expiresAt: now + FrameworkService.CACHE_TTL_MS
    };
    return data;
  }

  async getCompilerHealth(): Promise<CompilerHealthDto> {
    const healthStats = await this.engineRepo.getCompilerHealth();
    return {
      engines: healthStats.engines,
      healthy: healthStats.healthy,
      warnings: healthStats.warnings,
      failed: healthStats.failed,
      experimental: healthStats.experimental,
      totalMigrationsRun: healthStats.totalMigrationsRun,
      avgDurationMs: healthStats.avgDurationMs,
      lastChecked: new Date().toISOString()
    };
  }

  static invalidateCaches() {
    FrameworkService.frameworksCache = null;
    FrameworkService.matrixCache = null;
  }
}
