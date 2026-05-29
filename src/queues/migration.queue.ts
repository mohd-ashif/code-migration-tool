import { EventEmitter } from "events";
import { MigrationRequest } from "../types/migration.types";

const migrationEmitter = new EventEmitter();

export function enqueueMigration(request: MigrationRequest) {
  migrationEmitter.emit("job", request);
}

export function onMigrationJob(callback: (request: MigrationRequest) => Promise<void>) {
  migrationEmitter.on("job", callback);
}
