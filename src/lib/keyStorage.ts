/**
 * Persist a non-extractable CryptoKey in IndexedDB across page refreshes.
 * The browser stores the key handle via structured clone — raw key bytes
 * are never accessible to JavaScript, even with extractable: false.
 */

const DB_NAME = "devcents-enc";
const STORE_NAME = "keys";
const DB_VERSION = 1;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Persist a CryptoKey keyed by userId. */
export async function saveKey(userId: string, key: CryptoKey): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const req = store.put(key, userId);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/** Retrieve a stored CryptoKey, or null if not found. */
export async function loadKey(userId: string): Promise<CryptoKey | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(userId);
    req.onsuccess = () => resolve((req.result as CryptoKey) ?? null);
    req.onerror = () => reject(req.error);
  });
}

/** Remove a stored key (e.g. on sign-out or manual lock). */
export async function clearKey(userId: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const req = store.delete(userId);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}
