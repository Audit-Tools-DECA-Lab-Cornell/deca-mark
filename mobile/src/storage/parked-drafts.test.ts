import { afterEach, expect, it } from "vitest";
import { clearDraft, readDraft, saveDraft } from "./draft-store";
import { installPackage, removePackage } from "./package-catalog";
import { boundDraft, entry, memoryDatabase, otherOwner, owner } from "./package-store.fixture";
import {
  activateParkedDraft,
  discardParkedDraft,
  listParkedDrafts,
  parkDraft,
} from "./parked-drafts";

const databases: Awaited<ReturnType<typeof memoryDatabase>>[] = [];
afterEach(() => {
  for (const value of databases.splice(0)) value.sqlite.close();
});
async function setup() {
  const value = await memoryDatabase();
  databases.push(value);
  await installPackage(value.db, owner, entry);
  await saveDraft(value.db, owner, boundDraft);
  return value;
}

it("frees the active slot while retaining exact parked answers and package references", async () => {
  const { db } = await setup();
  await parkDraft(db, owner, boundDraft.id);
  expect(await readDraft(db, owner)).toBeNull();
  expect(await listParkedDrafts(db, owner)).toEqual([boundDraft]);
  expect(await listParkedDrafts(db, otherOwner)).toEqual([]);
  expect(await removePackage(db, owner, entry.identity)).toMatchObject({
    removed: false,
    reasons: { drafts: 1 },
  });
});

it("never overwrites an active draft when resuming a parked observation", async () => {
  const { db } = await setup();
  await parkDraft(db, owner, boundDraft.id);
  const second = { ...boundDraft, id: "60000000-0000-4000-8000-000000000002" };
  await saveDraft(db, owner, second);
  await expect(activateParkedDraft(db, owner, boundDraft.id)).rejects.toThrow("unfinished");
  expect(await readDraft(db, owner)).toEqual(second);
  expect(await listParkedDrafts(db, owner)).toEqual([boundDraft]);
});

it("restores exact parked context after the active slot is cleared", async () => {
  const { db } = await setup();
  await parkDraft(db, owner, boundDraft.id);
  await clearDraft(db, owner);
  expect(await activateParkedDraft(db, owner, boundDraft.id)).toEqual(boundDraft);
  expect(await readDraft(db, owner)).toEqual(boundDraft);
  expect(await listParkedDrafts(db, owner)).toEqual([]);
});

it("discards only the explicitly selected account draft", async () => {
  const { db } = await setup();
  await parkDraft(db, owner, boundDraft.id);
  await discardParkedDraft(db, otherOwner, boundDraft.id);
  expect(await listParkedDrafts(db, owner)).toEqual([boundDraft]);
  await discardParkedDraft(db, owner, boundDraft.id);
  expect(await listParkedDrafts(db, owner)).toEqual([]);
});
