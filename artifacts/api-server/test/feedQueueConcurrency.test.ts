import assert from "node:assert/strict";
import test from "node:test";
import {
  createFeedQueueFlusher,
  processFeedQueueItems,
} from "../../niger-habitat/src/lib/feedQueueControl.ts";
import { commitAccountScopedResult } from "../../niger-habitat/src/lib/accountScopedLocalData.ts";

test("a flush requested during an active pass drains the newly queued work", async () => {
  let passCount = 0;
  let releaseFirstPass!: () => void;
  const firstPassBlocked = new Promise<void>((resolve) => {
    releaseFirstPass = resolve;
  });

  const flush = createFeedQueueFlusher(async () => {
    passCount += 1;
    if (passCount === 1) await firstPassBlocked;
  }, () => true);

  const activeFlush = flush();
  await Promise.resolve();
  await Promise.all([flush(), flush()]);
  assert.equal(passCount, 1);

  releaseFirstPass();
  await activeFlush;
  assert.equal(passCount, 2);
});

test("an offline flush waits for a later online request", async () => {
  let online = false;
  let passCount = 0;
  const flush = createFeedQueueFlusher(async () => {
    passCount += 1;
  }, () => online);

  await flush();
  assert.equal(passCount, 0);

  online = true;
  await flush();
  assert.equal(passCount, 1);
});

test("an interrupted sending record is reclaimed before retry", async () => {
  const saves: string[] = [];
  const sends: string[] = [];
  const interrupted = { id: "post-1", status: "sending" as const };

  await processFeedQueueItems({
    items: [interrupted],
    isCurrentOwner: () => true,
    save: async (item) => {
      saves.push(item.status);
    },
    send: async (item) => {
      sends.push(item.id);
    },
  });

  assert.deepEqual(saves, ["queued", "sending"]);
  assert.deepEqual(sends, ["post-1"]);
});

test("an account switch restores the record without sending it as the new user", async () => {
  let currentOwner = true;
  const saves: string[] = [];
  let sendCount = 0;
  const queued = { id: "post-2", status: "queued" as const };

  await processFeedQueueItems({
    items: [queued],
    isCurrentOwner: () => currentOwner,
    save: async (item) => {
      saves.push(item.status);
      if (item.status === "sending") currentOwner = false;
    },
    send: async () => {
      sendCount += 1;
    },
  });

  assert.deepEqual(saves, ["sending", "queued"]);
  assert.equal(sendCount, 0);
});

test("a late feed queue read cannot appear under a different account", () => {
  let currentUserId = "account-b";
  let visiblePosts: string[] = [];

  const committed = commitAccountScopedResult(
    "account-a",
    () => currentUserId,
    ["private-post-a"],
    (items) => {
      visiblePosts = items;
    },
  );

  assert.equal(committed, false);
  assert.deepEqual(visiblePosts, []);
});

test("a late SOS contact read cannot appear under a different account", () => {
  let currentUserId = "account-b";
  let visibleContacts: Array<{ name: string; phone: string }> = [];

  const committed = commitAccountScopedResult(
    "account-a",
    () => currentUserId,
    [{ name: "Contact A", phone: "+22790000000" }],
    (items) => {
      visibleContacts = items;
    },
  );

  assert.equal(committed, false);
  assert.deepEqual(visibleContacts, []);
});
