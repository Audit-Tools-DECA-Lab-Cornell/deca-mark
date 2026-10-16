import { z } from "zod";
import { receiptSchema } from "../sync/contracts";
import { databaseWrite } from "./database-write";
import type { LocalDatabase } from "./observation-store";

export function lastReceivedAt(db: LocalDatabase, scope: string): Promise<string | null> {
  return databaseWrite(db, async () => {
    const rows = z
      .array(z.object({ server_receipt: z.string() }))
      .parse(
        await db.getAllAsync(
          "SELECT server_receipt FROM observations WHERE owner_scope = ? AND sync_state = 'synced'",
          scope,
        ),
      );
    let newest: string | null = null;
    let newestOrder = "";
    for (const row of rows) {
      const receivedAt = receiptSchema.parse(JSON.parse(row.server_receipt)).received_at;
      const order =
        new Date(receivedAt).toISOString().slice(0, 19) + (receivedAt.match(/\.\d+/)?.[0] ?? ".0");
      if (order > newestOrder) {
        newest = receivedAt;
        newestOrder = order;
      }
    }
    return newest;
  });
}
