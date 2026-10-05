import { assert, section, summary } from './helpers.js';
import { CloudStore } from '../src/persistence/cloudStore.js';

console.log('====================================================');
console.log('   ACCOUNT SAVE TESTS                                ');
console.log('====================================================');

// a small in-memory stand-in for the Firebase SDK: Google sign-in, and Firestore with the owner-only rule of firestore.rules
function fakeFirebase() {
  const docs = new Map();
  const listeners = [];
  const state = { user: null };
  const authInstance = {};
  const notify = () => listeners.forEach(cb => cb(state.user));
  const app = { getApps: () => [], getApp: () => ({}), initializeApp: () => ({}) };
  const auth = {
    getAuth: () => authInstance,
    onAuthStateChanged: (_a, cb) => { listeners.push(cb); Promise.resolve().then(() => cb(state.user)); return () => { const i = listeners.indexOf(cb); if (i >= 0) listeners.splice(i, 1); }; },
    GoogleAuthProvider: class {},
    signInWithPopup: async () => { state.user = { uid: 'u1', email: 'me@example.com' }; notify(); return { user: state.user }; },
    signOut: async () => { state.user = null; notify(); }
  };
  const allowed = path => state.user && path[0] === 'users' && path[1] === state.user.uid;
  const fs = {
    getFirestore: () => ({}),
    doc: (_db, ...path) => ({ path }),
    setDoc: async (ref, data) => { if (!allowed(ref.path)) throw new Error('Missing or insufficient permissions.'); docs.set(ref.path.join('/'), data); },
    getDoc: async ref => {
      if (!allowed(ref.path)) throw new Error('Missing or insufficient permissions.');
      const d = docs.get(ref.path.join('/'));
      return { exists: () => d !== undefined, data: () => d };
    }
  };
  return { sdk: { app, auth, fs }, docs, state };
}

const cfg = { apiKey: 'k', authDomain: 'x.firebaseapp.com', projectId: 'x', appId: 'a' };

section('Config');
{
  assert(!new CloudStore(null).configured, 'without settings there is no cloud');
  assert(new CloudStore(cfg).configured, 'with a Firebase config there is');
}

section('Sign in with Google, save, load, sign out');
{
  const fake = fakeFirebase();
  const cloud = new CloudStore(cfg, { sdk: fake.sdk });
  assert((await cloud.restore()) === null, 'nobody is signed in at first');
  let err = null;
  try { await cloud.save('hello', null); } catch (e) { err = e; }
  assert(err && /sign/i.test(err.message), 'saving needs an account');
  const user = await cloud.signIn();
  assert(user && user.email === 'me@example.com' && cloud.user, 'signing in gives the account');
  assert((await cloud.load()) === null, 'a new account has no save yet');
  const universe = JSON.stringify({ seed: 'abc', data: 'x'.repeat(2_000_000) });
  const gz = await new Response(new Blob([universe]).stream().pipeThrough(new CompressionStream('gzip'))).blob();
  await cloud.save(universe, gz);
  assert([...fake.docs.keys()].every(k => k.startsWith('users/u1/saves/main')), 'everything is kept under the account\'s own path');
  const chunks = [...fake.docs.keys()].filter(k => k.includes('/chunks/'));
  assert(chunks.length >= 1 && chunks.every(k => fake.docs.get(k).data.length <= 600 * 1024), `in pieces under the document limit (${chunks.length})`);
  assert((await cloud.load()) === universe, 'it comes back exactly');
  await cloud.save('{"small":1}', null);
  assert((await cloud.load()) === '{"small":1}', 'an uncompressed save works too');
  // another account cannot touch it
  fake.state.user = { uid: 'u2' };
  const other = new CloudStore(cfg, { sdk: fake.sdk });
  other.user = fake.state.user;
  let denied = null;
  try { await other.sdk || await other.ensureSdk(); const { fs, db } = await other.ensureSdk(); await fs.getDoc(fs.doc(db, 'users', 'u1', 'saves', 'main')); } catch (e) { denied = e; }
  assert(denied && /permission/i.test(denied.message), 'another account is refused by the rules');
  fake.state.user = { uid: 'u1', email: 'me@example.com' };
  await cloud.signOut();
  assert(cloud.user === null, 'signing out clears the account');
}

summary();
