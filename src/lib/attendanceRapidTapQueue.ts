export type RapidTapQueueStatus = "queued" | "saving" | "retrying" | "failed";

/**
 * A Rapid Tap item is deliberately scoped to the Adviser and the class
 * context in which the RFID was read. The server remains authoritative for
 * attendance time and authorization; this context prevents an old local item
 * from being sent as a different day's or session's attendance.
 */
export type RapidTapQueueItem = {
  id: string;
  scope: string;
  rfidCard: string;
  section: string;
  grade: string;
  scanDate: string;
  sessionType: "Morning" | "Afternoon";
  queueOrder: number;
  status: RapidTapQueueStatus;
  attempts: number;
  nextAttemptAt: number | null;
  lastError: string | null;
  // After a session closes, a scan may be reconciled safely but must not be
  // written into a later session. Retain an unsaved scan for manual review.
  requiresManualReview?: boolean;
};

const DATABASE_NAME = "parentconnect-attendance-rapid-tap";
const DATABASE_VERSION = 1;
const STORE_NAME = "rapid-tap-scans";

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = window.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onerror = () => reject(request.error ?? new Error("Could not open Rapid Tap storage."));
    request.onupgradeneeded = () => {
      const database = request.result;
      const store = database.objectStoreNames.contains(STORE_NAME)
        ? request.transaction!.objectStore(STORE_NAME)
        : database.createObjectStore(STORE_NAME, { keyPath: "id" });
      if (!store.indexNames.contains("scope")) store.createIndex("scope", "scope", { unique: false });
    };
    request.onsuccess = () => resolve(request.result);
  });
}

async function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>) {
  const database = await openDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, mode);
      const request = run(transaction.objectStore(STORE_NAME));
      let result: T;
      request.onerror = () => reject(request.error ?? new Error("Rapid Tap storage request failed."));
      request.onsuccess = () => { result = request.result; };
      transaction.oncomplete = () => resolve(result);
      transaction.onerror = () => reject(transaction.error ?? new Error("Rapid Tap storage transaction failed."));
      transaction.onabort = () => reject(transaction.error ?? new Error("Rapid Tap storage transaction was aborted."));
    });
  } finally {
    database.close();
  }
}

export async function loadRapidTapQueue(scope: string) {
  const database = await openDatabase();
  try {
    return await new Promise<RapidTapQueueItem[]>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readonly");
      const request = transaction.objectStore(STORE_NAME).index("scope").getAll(scope);
      request.onerror = () => reject(request.error ?? new Error("Could not read Rapid Tap scans."));
      request.onsuccess = () => {
        const items = (request.result as RapidTapQueueItem[])
          .sort((first, second) => first.queueOrder - second.queueOrder);
        transaction.oncomplete = () => resolve(items);
      };
      transaction.onerror = () => reject(transaction.error ?? new Error("Rapid Tap storage transaction failed."));
      transaction.onabort = () => reject(transaction.error ?? new Error("Rapid Tap storage transaction was aborted."));
    });
  } finally {
    database.close();
  }
}

export function saveRapidTapQueueItem(item: RapidTapQueueItem) {
  return withStore("readwrite", (store) => store.put(item));
}

export function removeRapidTapQueueItem(id: string) {
  return withStore("readwrite", (store) => store.delete(id));
}
