// Cloud saves linked to the player's Google account, with Firebase (Authentication + Firestore). Optional: nothing here
// loads unless a Firebase config is present, so the game runs the same without one. The game itself is hosted on Vercel; this
// only talks to Firebase from the browser. The Firebase web SDK is loaded on demand from Google's CDN (no npm dependency).
//
// Config: window.__FIREBASE_CONFIG__ = { apiKey, authDomain, projectId, appId, ... }, or Vite env variables
//   VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN, VITE_FIREBASE_PROJECT_ID, VITE_FIREBASE_APP_ID (see .env.example).
// (These web config values are public by design; what protects the data is firestore.rules. The Vercel address must be
// listed under Firebase Authentication > Settings > Authorized domains for sign-in to work there.)
//
// Data layout in Firestore (see firestore.rules: only the owner can read or write):
//   users/{uid}/saves/main            { savedAt, chunks, bytes }
//   users/{uid}/saves/main/chunks/{n} { data }     the gzip-compressed save as base64 text, 600 KB per chunk
const SDK = 'https://www.gstatic.com/firebasejs/10.14.1';
const CHUNK = 600 * 1024;

export function readFirebaseConfig() {
  if (typeof window !== 'undefined' && window.__FIREBASE_CONFIG__) return window.__FIREBASE_CONFIG__;
  const env = (typeof import.meta !== 'undefined' && import.meta.env) || {};
  if (env.VITE_FIREBASE_API_KEY && env.VITE_FIREBASE_PROJECT_ID) {
    return {
      apiKey: env.VITE_FIREBASE_API_KEY,
      authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: env.VITE_FIREBASE_PROJECT_ID,
      appId: env.VITE_FIREBASE_APP_ID
    };
  }
  return null;
}

async function toBase64(blob) {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(bin);
}

function fromBase64(text) {
  const bin = atob(text);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return new Blob([buf]);
}

export class CloudStore {
  // options.sdk = { app, auth, fs } replaces the SDK modules loaded from the CDN (tests)
  constructor(config = null, { sdk = null } = {}) {
    this.config = config || readFirebaseConfig();
    this.injected = sdk;
    this.user = null;
    this.sdk = null;
    this.onUserChange = null;
  }

  get configured() {
    return Boolean(this.config);
  }

  async ensureSdk() {
    if (this.sdk) return this.sdk;
    if (!this.config) throw new Error('Cloud saves are not set up (see docs/HOSTING.md)');
    const [app, auth, fs] = this.injected
      ? [this.injected.app, this.injected.auth, this.injected.fs]
      : await Promise.all([
        import(/* @vite-ignore */ `${SDK}/firebase-app.js`),
        import(/* @vite-ignore */ `${SDK}/firebase-auth.js`),
        import(/* @vite-ignore */ `${SDK}/firebase-firestore.js`)
      ]);
    const instance = app.getApps().length ? app.getApp() : app.initializeApp(this.config);
    this.sdk = { app, auth, fs, instance, authInstance: auth.getAuth(instance), db: fs.getFirestore(instance) };
    auth.onAuthStateChanged(this.sdk.authInstance, (u) => { this.user = u; if (this.onUserChange) this.onUserChange(u); });
    return this.sdk;
  }

  // Restores a session left from an earlier visit (no popup)
  async restore() {
    if (!this.configured) return null;
    try {
      const { authInstance, auth } = await this.ensureSdk();
      await new Promise(resolve => { const off = auth.onAuthStateChanged(authInstance, () => { off(); resolve(); }); });
      return this.user;
    } catch {
      return null;
    }
  }

  async signIn() {
    const { auth, authInstance } = await this.ensureSdk();
    const result = await auth.signInWithPopup(authInstance, new auth.GoogleAuthProvider());
    this.user = result.user;
    return this.user;
  }

  async signOut() {
    const { auth, authInstance } = await this.ensureSdk();
    await auth.signOut(authInstance);
    this.user = null;
  }

  async save(text, compressed) {
    const { fs, db } = await this.ensureSdk();
    if (!this.user) throw new Error('Not signed in');
    const b64 = await toBase64(compressed instanceof Blob ? compressed : new Blob([text]));
    const chunks = [];
    for (let i = 0; i < b64.length; i += CHUNK) chunks.push(b64.slice(i, i + CHUNK));
    const base = ['users', this.user.uid, 'saves', 'main'];
    await Promise.all(chunks.map((data, n) => fs.setDoc(fs.doc(db, ...base, 'chunks', String(n)), { data })));
    await fs.setDoc(fs.doc(db, ...base), { savedAt: Date.now(), chunks: chunks.length, bytes: b64.length, gzip: compressed instanceof Blob });
  }

  async load() {
    const { fs, db } = await this.ensureSdk();
    if (!this.user) throw new Error('Not signed in');
    const base = ['users', this.user.uid, 'saves', 'main'];
    const meta = await fs.getDoc(fs.doc(db, ...base));
    if (!meta.exists()) return null;
    const { chunks, gzip } = meta.data();
    const parts = await Promise.all(Array.from({ length: chunks }, (_, n) => fs.getDoc(fs.doc(db, ...base, 'chunks', String(n)))));
    const blob = fromBase64(parts.map(p => p.data().data).join(''));
    if (!gzip) return blob.text();
    return new Response(blob.stream().pipeThrough(new DecompressionStream('gzip'))).text();
  }
}
