import type { LocalDatabase } from "./observation-store";

// One Expo SQLite connection is shared by all stores. Serialize async operations so a draft write
// cannot accidentally join a package-removal transaction while it is suspended at an await.
const pending = new WeakMap<LocalDatabase, Promise<unknown>>();

export function databaseWrite<T>(db: LocalDatabase, work: () => Promise<T>): Promise<T> {
  const previous = pending.get(db) ?? Promise.resolve();
  const next = previous.then(work, work);
  pending.set(db, next);
  return next;
}

export function databaseTransaction<T>(db: LocalDatabase, work: () => Promise<T>): Promise<T> {
  return databaseWrite(db, async () => {
    await db.execAsync("BEGIN IMMEDIATE;");
    try {
      const result = await work();
      await db.execAsync("COMMIT;");
      return result;
    } catch (error) {
      await db.execAsync("ROLLBACK;");
      throw error;
    }
  });
}
