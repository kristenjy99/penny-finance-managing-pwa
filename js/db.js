// IndexedDB: tx (giao dịch), kv (bảng nhỏ + trạng thái), queue (hàng đợi thay đổi chờ đẩy lên)

let dbp = null;
function open() {
  if (dbp) return dbp;
  dbp = new Promise((res, rej) => {
    const r = indexedDB.open('penny', 1);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains('tx')) db.createObjectStore('tx', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv', { keyPath: 'k' });
      if (!db.objectStoreNames.contains('queue')) db.createObjectStore('queue', { keyPath: 'qid', autoIncrement: true });
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return dbp;
}

function run(store, mode, fn) {
  return open().then((db) => new Promise((res, rej) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    let out;
    Promise.resolve(fn(s)).then((v) => { out = v; });
    t.oncomplete = () => res(out);
    t.onerror = () => rej(t.error);
    t.onabort = () => rej(t.error);
  }));
}
const req = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

export const getAll = (store) => run(store, 'readonly', (s) => req(s.getAll()));
export const put = (store, v) => run(store, 'readwrite', (s) => { (Array.isArray(v) ? v : [v]).forEach((x) => s.put(x)); });
export const del = (store, keys) => run(store, 'readwrite', (s) => { (Array.isArray(keys) ? keys : [keys]).forEach((k) => s.delete(k)); });
export const clear = (store) => run(store, 'readwrite', (s) => { s.clear(); });
// Thay toàn bộ nội dung store
export const replaceAll = (store, arr) => run(store, 'readwrite', (s) => { s.clear(); arr.forEach((x) => s.put(x)); });

export const kvGet = (k) => run('kv', 'readonly', (s) => req(s.get(k))).then((r) => (r ? r.v : undefined));
export const kvSet = (k, v) => put('kv', { k, v });

export async function wipe() {
  await clear('tx'); await clear('kv'); await clear('queue');
}
