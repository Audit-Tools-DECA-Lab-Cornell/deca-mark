import {
  completePackageFileReset,
  initializeDatabase,
  packageFileResetPending,
} from "./database-migrations";
import type { LocalDatabase } from "./observation-store";

/** SQLite finishes its reset first; a durable marker makes filesystem cleanup retry after a crash. */
export async function initializeCollectorDatabase(
  database: LocalDatabase,
  resetPackages: () => void,
): Promise<void> {
  await initializeDatabase(database);
  if (await packageFileResetPending(database)) {
    resetPackages();
    await completePackageFileReset(database);
  }
}
