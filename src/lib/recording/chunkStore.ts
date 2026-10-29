// src/lib/recording/chunkStore.ts
// -----------------------------------------------------------
// Keeps recorded chunks on this device until they're safely uploaded and the
// track has been joined. A dropped connection, a closed tab or a crash loses
// nothing: chunks wait in IndexedDB and upload on the next chance.
// -----------------------------------------------------------

export interface StoredChunk {
  key: string;          // `${trackId}:${seq}`
  recordingId: string;
  trackId: string;
  seq: number;
  blob: Blob;
  mimeType: string;
  startMs: number;
  durationMs: number;
  uploaded: boolean;
}

export interface ChunkStore {
  put(chunk: StoredChunk): Promise<void>;
  /** Every chunk on this device, oldest first. */
  all(): Promise<StoredChunk[]>;
  markUploaded(key: string): Promise<void>;
  removeTrack(trackId: string): Promise<void>;
  removeRecording(recordingId: string): Promise<void>;
}

export const chunkKey = (trackId: string, seq: number) => `${trackId}:${seq}`;

const bySeq = (a: StoredChunk, b: StoredChunk) =>
  a.trackId === b.trackId ? a.seq - b.seq : a.trackId < b.trackId ? -1 : 1;

// --------------- IndexedDB ---------------

const DB_NAME = 'cm-session-recording';
const STORE = 'chunks';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE, { keyPath: 'key' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function run<T>(db: IDBDatabase, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req ? req.result : undefined);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export function createIdbChunkStore(): ChunkStore {
  let dbp: Promise<IDBDatabase> | null = null;
  const db = () => (dbp ??= openDb());

  const removeWhere = async (match: (c: StoredChunk) => boolean) => {
    const d = await db();
    const all = (await run<StoredChunk[]>(d, 'readonly', s => s.getAll())) ?? [];
    const keys = all.filter(match).map(c => c.key);
    if (keys.length) await run(d, 'readwrite', s => { for (const k of keys) s.delete(k); });
  };

  return {
    async put(chunk) { await run(await db(), 'readwrite', s => s.put(chunk)); },
    async all() {
      const rows = (await run<StoredChunk[]>(await db(), 'readonly', s => s.getAll())) ?? [];
      return rows.sort(bySeq);
    },
    async markUploaded(key) {
      const d = await db();
      const row = await run<StoredChunk>(d, 'readonly', s => s.get(key));
      if (row) await run(d, 'readwrite', s => s.put({ ...row, uploaded: true }));
    },
    removeTrack: (trackId) => removeWhere(c => c.trackId === trackId),
    removeRecording: (recordingId) => removeWhere(c => c.recordingId === recordingId),
  };
}

// --------------- In-memory (tests, and browsers without IndexedDB) ---------------

export function createMemoryChunkStore(): ChunkStore {
  const rows = new Map<string, StoredChunk>();
  return {
    async put(chunk) { rows.set(chunk.key, chunk); },
    async all() { return [...rows.values()].sort(bySeq); },
    async markUploaded(key) {
      const row = rows.get(key);
      if (row) rows.set(key, { ...row, uploaded: true });
    },
    async removeTrack(trackId) { for (const [k, c] of rows) if (c.trackId === trackId) rows.delete(k); },
    async removeRecording(recordingId) { for (const [k, c] of rows) if (c.recordingId === recordingId) rows.delete(k); },
  };
}

export function createChunkStore(): ChunkStore {
  return typeof indexedDB === 'undefined' ? createMemoryChunkStore() : createIdbChunkStore();
}
