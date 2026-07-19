const DATABASE_NAME = "maildesk-cache";
const STORE_NAME = "mailboxes";
const DATABASE_VERSION = 1;
const CACHE_FORMAT_VERSION = 1;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_CACHE_ENTRIES = 12;

export function mailboxCacheKey(account, folder, query) {
  return [
    String(account || "").trim().toLowerCase(),
    String(folder || "inbox").trim().toLowerCase(),
    String(query || "").trim().toLowerCase()
  ].join("::");
}

export async function readMailboxCache(account, folder, query) {
  if (!account || !globalThis.indexedDB) return null;
  const database = await openDatabase();
  const key = mailboxCacheKey(account, folder, query);
  const record = await requestResult(database.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(key));
  if (!record) return null;

  const expired = Date.now() - record.updatedAt > CACHE_TTL_MS;
  if (record.version !== CACHE_FORMAT_VERSION || expired || !Array.isArray(record.messages)) {
    await deleteCacheRecord(database, key);
    return null;
  }
  return { messages: record.messages, updatedAt: record.updatedAt };
}

export async function writeMailboxCache(account, folder, query, messages) {
  if (!account || !globalThis.indexedDB || !Array.isArray(messages)) return;
  const database = await openDatabase();
  const key = mailboxCacheKey(account, folder, query);
  const transaction = database.transaction(STORE_NAME, "readwrite");
  transaction.objectStore(STORE_NAME).put({
    key,
    version: CACHE_FORMAT_VERSION,
    account: account.trim().toLowerCase(),
    folder,
    query: query.trim(),
    updatedAt: Date.now(),
    messages
  });
  await transactionComplete(transaction);
  await pruneCache(database);
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = globalThis.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionComplete(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

async function deleteCacheRecord(database, key) {
  const transaction = database.transaction(STORE_NAME, "readwrite");
  transaction.objectStore(STORE_NAME).delete(key);
  await transactionComplete(transaction);
}

async function pruneCache(database) {
  const records = await requestResult(database.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).getAll());
  const obsolete = records
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(MAX_CACHE_ENTRIES);
  if (!obsolete.length) return;
  const transaction = database.transaction(STORE_NAME, "readwrite");
  const store = transaction.objectStore(STORE_NAME);
  obsolete.forEach((record) => store.delete(record.key));
  await transactionComplete(transaction);
}

