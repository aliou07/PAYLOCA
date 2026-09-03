export type FeedQueueFlush =
  () => Promise<void>;

type FeedQueueRecord = {
  status:
    | "queued"
    | "sending"
    | "failed";
  lastError?: string;
};

type ProcessFeedQueueItemsOptions<
  T extends FeedQueueRecord,
> = {
  items: T[];
  isCurrentOwner: () => boolean;
  save: (item: T) => Promise<void>;
  send: (item: T) => Promise<void>;
};

export async function processFeedQueueItems<
  T extends FeedQueueRecord,
>({
  items,
  isCurrentOwner,
  save,
  send,
}: ProcessFeedQueueItemsOptions<T>): Promise<void> {
  for (const item of items) {
    if (
      item.status === "failed"
      || !isCurrentOwner()
    ) {
      continue;
    }

    const queuedItem =
      item.status === "sending"
        ? {
            ...item,
            status: "queued" as const,
            lastError:
              "Envoi interrompu, nouvelle tentative automatique",
          }
        : item;

    if (
      item.status === "sending"
    ) {
      await save(queuedItem);
    }

    if (!isCurrentOwner()) {
      return;
    }

    const sendingItem = {
      ...queuedItem,
      status: "sending" as const,
    };

    await save(sendingItem);

    if (!isCurrentOwner()) {
      await save({
        ...queuedItem,
        status: "queued" as const,
        lastError:
          "Changement de compte, en attente",
      });

      return;
    }

    await send(queuedItem);
  }
}

export function createFeedQueueFlusher(
  runPass: () => Promise<void>,
  isOnline: () => boolean,
): FeedQueueFlush {
  let active = false;
  let rerunRequested = false;

  const flush: FeedQueueFlush =
    async () => {
      if (!isOnline()) {
        return;
      }

      if (active) {
        rerunRequested = true;
        return;
      }

      active = true;

      try {
        do {
          rerunRequested = false;
          await runPass();
        } while (
          rerunRequested
          && isOnline()
        );
      } finally {
        active = false;
      }
    };

  return flush;
}
