import type { FeedPostInput } from '@workspace/api-client-react';

const DATABASE_NAME = 'payloca-local-safety';
const DATABASE_VERSION = 1;
const FEED_QUEUE_STORE = 'feed-queue';
const SOS_CONTACTS_STORE = 'sos-contacts';

export type FeedQueueStatus = 'queued' | 'sending' | 'failed';

export type QueuedFeedPost = {
  id: string;
  userId: string;
  authorName: string;
  input: FeedPostInput;
  createdAt: number;
  status: FeedQueueStatus;
  lastError?: string;
};

export type SosContact = {
  id: string;
  userId: string;
  name: string;
  phone: string;
  createdAt: number;
};

export const SOS_CONTACT_LIMIT_ERROR = 'SOS_CONTACT_LIMIT';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('Le stockage hors connexion n’est pas disponible sur cet appareil.'));
      return;
    }
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onerror = () => reject(request.error ?? new Error('Stockage local indisponible.'));
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(FEED_QUEUE_STORE)) {
        const store = database.createObjectStore(FEED_QUEUE_STORE, { keyPath: 'id' });
        store.createIndex('userId', 'userId', { unique: false });
      }
      if (!database.objectStoreNames.contains(SOS_CONTACTS_STORE)) {
        const store = database.createObjectStore(SOS_CONTACTS_STORE, { keyPath: 'id' });
        store.createIndex('userId', 'userId', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Opération locale impossible.'));
  });
}

async function withStore<T>(
  storeName: string,
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => Promise<T>,
): Promise<T> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(storeName, mode);
    const result = await action(transaction.objectStore(storeName));
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('Écriture locale impossible.'));
      transaction.onabort = () => reject(transaction.error ?? new Error('Écriture locale annulée.'));
    });
    return result;
  } finally {
    database.close();
  }
}

export async function listQueuedFeedPosts(userId: string): Promise<QueuedFeedPost[]> {
  return withStore(FEED_QUEUE_STORE, 'readonly', async (store) => {
    const records = await requestResult(store.index('userId').getAll(userId)) as QueuedFeedPost[];
    return records.sort((left, right) => right.createdAt - left.createdAt);
  });
}

export async function saveQueuedFeedPost(post: QueuedFeedPost): Promise<void> {
  await withStore(FEED_QUEUE_STORE, 'readwrite', async (store) => {
    const existing = await requestResult(store.get(post.id)) as QueuedFeedPost | undefined;
    if (existing && existing.userId !== post.userId) {
      throw new Error('Cette publication locale appartient à un autre compte.');
    }
    await requestResult(store.put(post));
  });
}

export async function deleteQueuedFeedPost(id: string, userId: string): Promise<void> {
  await withStore(FEED_QUEUE_STORE, 'readwrite', async (store) => {
    const existing = await requestResult(store.get(id)) as QueuedFeedPost | undefined;
    if (existing && existing.userId !== userId) {
      throw new Error('Cette publication locale appartient à un autre compte.');
    }
    await requestResult(store.delete(id));
  });
}

export async function listSosContacts(userId: string): Promise<SosContact[]> {
  return withStore(SOS_CONTACTS_STORE, 'readonly', async (store) => {
    const records = await requestResult(store.index('userId').getAll(userId)) as SosContact[];
    return records.sort((left, right) => left.createdAt - right.createdAt);
  });
}

export async function saveSosContact(contact: SosContact): Promise<void> {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(SOS_CONTACTS_STORE, 'readwrite');
      const store = transaction.objectStore(SOS_CONTACTS_STORE);
      const countRequest = store.index('userId').count(contact.userId);
      let limitReached = false;

      countRequest.onerror = () => reject(countRequest.error ?? new Error('Lecture des contacts impossible.'));
      countRequest.onsuccess = () => {
        if (countRequest.result >= 5) {
          limitReached = true;
          transaction.abort();
          return;
        }
        const addRequest = store.add(contact);
        addRequest.onerror = () => reject(addRequest.error ?? new Error('Ajout du contact impossible.'));
      };
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(new Error(limitReached
        ? SOS_CONTACT_LIMIT_ERROR
        : 'Ajout du contact annulé.'));
      transaction.onerror = () => reject(transaction.error ?? new Error('Ajout du contact impossible.'));
    });
  } finally {
    database.close();
  }
}

export async function countSosContacts(userId: string): Promise<number> {
  return withStore(SOS_CONTACTS_STORE, 'readonly', async (store) => {
    return requestResult(store.index('userId').count(userId));
  });
}

export async function deleteSosContact(id: string, userId: string): Promise<void> {
  await withStore(SOS_CONTACTS_STORE, 'readwrite', async (store) => {
    const existing = await requestResult(store.get(id)) as SosContact | undefined;
    if (existing && existing.userId !== userId) {
      throw new Error('Ce contact SOS appartient à un autre compte.');
    }
    await requestResult(store.delete(id));
  });
}
