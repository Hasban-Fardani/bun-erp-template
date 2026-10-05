import type { KeyValueAdapter } from "../key-value.ts";

const OBJECT_STORE = "records";
const DEFAULT_DATABASE = "bun-erp-storage";

function key(namespace: string, recordKey: string): string {
  return `${encodeURIComponent(namespace)}\u001f${encodeURIComponent(recordKey)}`;
}

function requestValue<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed"));
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction was aborted"));
  });
}

function openDatabase(name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore(OBJECT_STORE, { keyPath: "id" });
      store.createIndex("namespace", "namespace", { unique: false });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open IndexedDB storage"));
  });
}

/** Browser storage for structured records; native builds inject encrypted SQLite instead. */
export async function createIndexedDbAdapter(databaseName = DEFAULT_DATABASE): Promise<KeyValueAdapter> {
  const database = await openDatabase(databaseName);
  return {
    async get(namespace, recordKey) {
      const record = await requestValue(
        database.transaction(OBJECT_STORE, "readonly").objectStore(OBJECT_STORE).get(key(namespace, recordKey)),
      );
      return record ? { value: record.value, updatedAt: record.updatedAt } : undefined;
    },
    async put(namespace, recordKey, value, updatedAt) {
      const transaction = database.transaction(OBJECT_STORE, "readwrite");
      transaction.objectStore(OBJECT_STORE).put({
        id: key(namespace, recordKey),
        namespace,
        key: recordKey,
        value,
        updatedAt,
      });
      await transactionDone(transaction);
    },
    async list(namespace) {
      const transaction = database.transaction(OBJECT_STORE, "readonly");
      const rows = await requestValue(transaction.objectStore(OBJECT_STORE).index("namespace").getAll(namespace));
      return rows
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
        .map(({ key: recordKey, value, updatedAt }) => ({ key: recordKey, value, updatedAt }));
    },
    async delete(namespace, recordKey) {
      const transaction = database.transaction(OBJECT_STORE, "readwrite");
      transaction.objectStore(OBJECT_STORE).delete(key(namespace, recordKey));
      await transactionDone(transaction);
    },
    async clear(namespace) {
      const transaction = database.transaction(OBJECT_STORE, "readwrite");
      const request = transaction.objectStore(OBJECT_STORE).index("namespace").openCursor(IDBKeyRange.only(namespace));
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        cursor.delete();
        cursor.continue();
      };
      await transactionDone(transaction);
    },
  };
}
