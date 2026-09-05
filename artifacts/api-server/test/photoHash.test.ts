import assert from "node:assert/strict";
import test from "node:test";
import { DuplicatePhotoError, reservePhotoHash } from "../src/lib/photoHash.ts";

test("refuses the second concurrent creation of the same photo", async () => {
  const reservedHashes = new Set<string>();
  const insertHash = async (hash: string): Promise<ReadonlyArray<unknown>> => {
    const inserted = !reservedHashes.has(hash);
    reservedHashes.add(hash);
    await new Promise((resolve) => setImmediate(resolve));
    return inserted ? [{ id: 1 }] : [];
  };

  const results = await Promise.allSettled([
    reservePhotoHash("same-photo-hash", insertHash),
    reservePhotoHash("same-photo-hash", insertHash),
  ]);

  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  const rejected = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
  assert.ok(rejected);
  assert.ok(rejected.reason instanceof DuplicatePhotoError);
});
