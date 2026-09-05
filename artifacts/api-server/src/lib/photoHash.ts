export class DuplicatePhotoError extends Error {
  constructor() {
    super("Photo hash already reserved.");
    this.name = "DuplicatePhotoError";
  }
}

/**
 * Reserves a photo hash using the database's unique constraint.
 *
 * The insert callback must use ON CONFLICT DO NOTHING and return the inserted
 * row. An empty result means another request won the race.
 */
export async function reservePhotoHash(
  hash: string,
  insert: (hash: string) => Promise<ReadonlyArray<unknown>>,
): Promise<void> {
  const inserted = await insert(hash);
  if (inserted.length === 0) throw new DuplicatePhotoError();
}
