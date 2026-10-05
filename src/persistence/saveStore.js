// Where the universe is saved. Three places, chosen by the player (menu: Save location) and remembered:
//
//   browser   the browser's IndexedDB (a much larger quota than localStorage, gzip-compressed): the default
//   file      a file on this device, chosen once with the File System Access API (Chrome, Edge, Opera): every
//             autosave rewrites that file, no downloads, no browser storage. Other browsers fall back to the browser
//             database plus Export / Import.
//   cloud     your account: signed in (email link or Google), saved to Supabase Storage (see cloudStore.js); needs a Supabase config
//
// Whatever the mode, the browser database always keeps the newest copy as a safety net, and a save left in
// localStorage by an older version is found and moved over.
//
//   const store = new SaveStore({ legacyKey });  await store.init();
//   await store.save(text)   await store.load() -> text | null   await store.peek() -> { seed, savedAt } | null
//   store.mode  store.setMode(mode)  store.chooseFile()  store.reconnectFile()  store.supportsFile
import { CloudStore } from './cloudStore.js';

const DB_NAME = 'genesis-cosmos';
const STORE = 'kv';

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('IndexedDB is not available')); return; }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idb(mode, fn) {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const result = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(result && 'result' in result ? result.result : undefined);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

const idbGet = key => idb('readonly', s => s.get(key));
const idbSet = (key, value) => idb('readwrite', s => s.put(value, key));

// ---- gzip (CompressionStream where the browser has it; plain text otherwise) ----

async function compress(text) {
  if (typeof CompressionStream === 'undefined') return text;
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Response(stream).blob();
}

async function decompress(value) {
  if (typeof value === 'string' || value === undefined || value === null) return value || null;
  if (typeof DecompressionStream === 'undefined') return null;
  const stream = value.stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}

// seed and savedAt from the start of a save, without parsing the whole thing twice
function headerOf(text) {
  try {
    const data = JSON.parse(text);
    return { seed: data.seed, savedAt: data.savedAt };
  } catch {
    return null;
  }
}

export class SaveStore {
  constructor({ legacyKey = null, cloudConfig = null, createClient = null } = {}) {
    this.legacyKey = legacyKey;
    this.mode = 'browser';
    this.fileHandle = null;
    this.cloud = new CloudStore(cloudConfig, { createClient });
    this.lastError = null;
  }

  get supportsFile() {
    return typeof window !== 'undefined' && typeof window.showSaveFilePicker === 'function';
  }

  get supportsCloud() {
    return this.cloud.configured;
  }

  async init() {
    try {
      const settings = await idbGet('settings');
      if (settings && settings.mode) this.mode = settings.mode;
      this.fileHandle = (await idbGet('fileHandle')) || null;
    } catch (err) {
      this.lastError = err;
    }
    if (this.mode === 'file' && !this.fileHandle) this.mode = 'browser';
    if (this.mode === 'cloud' && !this.cloud.configured) this.mode = 'browser';
    // a save kept by an older version in localStorage is moved into the browser database
    try {
      if (this.legacyKey && typeof localStorage !== 'undefined') {
        const old = localStorage.getItem(this.legacyKey);
        if (old && !(await idbGet('save'))) {
          await idbSet('save', await compress(old));
          localStorage.removeItem(this.legacyKey);
        }
      }
    } catch (err) {
      this.lastError = err;
    }
  }

  async setMode(mode) {
    this.mode = mode;
    try { await idbSet('settings', { mode }); } catch (err) { this.lastError = err; }
  }

  describe() {
    if (this.mode === 'file') return this.fileHandle ? `File on this device: ${this.fileHandle.name}` : 'File on this device (not chosen yet)';
    if (this.mode === 'cloud') return this.cloud.user ? `Your account (${this.cloud.user.email || 'signed in'})` : 'Your account (not signed in)';
    return 'This browser (IndexedDB)';
  }

  // ---- file on the device ----

  async chooseFile() {
    if (!this.supportsFile) throw new Error('This browser cannot save to a file on the device. Use Export instead.');
    const handle = await window.showSaveFilePicker({
      suggestedName: 'genesis-cosmos-save.json',
      types: [{ description: 'Universe save', accept: { 'application/json': ['.json'] } }]
    });
    this.fileHandle = handle;
    await idbSet('fileHandle', handle);
    await this.setMode('file');
    return handle;
  }

  // After a restart the browser asks again before writing to the file: this must run from a click
  async reconnectFile() {
    if (!this.fileHandle) return false;
    const opts = { mode: 'readwrite' };
    if ((await this.fileHandle.queryPermission(opts)) === 'granted') return true;
    return (await this.fileHandle.requestPermission(opts)) === 'granted';
  }

  async fileReady() {
    if (!this.fileHandle) return false;
    try { return (await this.fileHandle.queryPermission({ mode: 'readwrite' })) === 'granted'; } catch { return false; }
  }

  // ---- save / load ----

  // Returns { where: 'file' | 'cloud' | 'browser', note? } (the browser copy is always written)
  async save(text) {
    let where = 'browser';
    let note = null;
    const blob = await compress(text);
    try { await idbSet('save', blob); } catch (err) { this.lastError = err; note = `Browser storage failed: ${err.message}`; where = null; }
    if (this.mode === 'file') {
      if (await this.fileReady()) {
        const writable = await this.fileHandle.createWritable();
        await writable.write(text);
        await writable.close();
        where = 'file';
      } else note = 'Allow access to the save file (Menu > Save location > Reconnect). Saved in the browser meanwhile.';
    } else if (this.mode === 'cloud') {
      if (this.cloud.user) {
        await this.cloud.save(text, blob);
        where = 'cloud';
      } else note = 'Sign in to save to the cloud (Menu > Save location). Saved in the browser meanwhile.';
    }
    if (!where) throw new Error(note || 'Could not save');
    return { where, note };
  }

  async load() {
    if (this.mode === 'file' && (await this.fileReady())) {
      try {
        const text = await (await this.fileHandle.getFile()).text();
        if (text) return text;
      } catch (err) { this.lastError = err; }
    }
    if (this.mode === 'cloud' && this.cloud.user) {
      try {
        const text = await this.cloud.load();
        if (text) return text;
      } catch (err) { this.lastError = err; }
    }
    try { return await decompress(await idbGet('save')); } catch (err) { this.lastError = err; return null; }
  }

  async peek() {
    const text = await this.load();
    return text ? headerOf(text) : null;
  }

  async hasSave() {
    return Boolean(await this.peek());
  }
}
