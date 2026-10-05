import { assert, section, summary } from './helpers.js';
import { CloudStore } from '../src/persistence/cloudStore.js';

console.log('====================================================');
console.log('   ACCOUNT SAVE TESTS                                ');
console.log('====================================================');

// a tiny in-memory stand-in for the Supabase client: auth session, and a storage bucket with per-user folders
function fakeSupabase() {
  const files = new Map();
  let listener = null;
  let session = null;
  const calls = [];
  const client = {
    auth: {
      onAuthStateChange: cb => { listener = cb; },
      getSession: async () => ({ data: { session } }),
      signInWithOtp: async ({ email }) => { calls.push(['otp', email]); return { error: null }; },
      signInWithOAuth: async ({ provider }) => { calls.push(['oauth', provider]); return { error: null }; },
      signOut: async () => { session = null; listener && listener('SIGNED_OUT', null); }
    },
    storage: {
      from: bucket => ({
        upload: async (path, blob, opts) => {
          if (!session || path.split('/')[0] !== session.user.id) return { error: { message: 'new row violates row-level security policy' } };
          if (files.has(path) && !opts.upsert) return { error: { message: 'exists' } };
          files.set(path, blob);
          return { error: null };
        },
        download: async path => {
          if (!session || path.split('/')[0] !== session.user.id) return { error: { message: 'Object not found' } };
          return files.has(path) ? { data: files.get(path), error: null } : { data: null, error: { message: 'Object not found' } };
        }
      })
    }
  };
  return { client, files, calls, signInAs: (id, email) => { session = { user: { id, email } }; listener && listener('SIGNED_IN', session); } };
}

section('Config');
{
  assert(!new CloudStore(null).configured, 'without settings there is no cloud');
  assert(new CloudStore({ url: 'https://x.supabase.co', anonKey: 'k' }).configured, 'with a url and key there is');
  assert(new CloudStore({ url: 'u', anonKey: 'k', providers: ['email', 'google'] }).providers.includes('google'), 'providers come from the config');
}

section('Sign in, save, load, sign out');
{
  const fake = fakeSupabase();
  const cloud = new CloudStore({ url: 'https://x.supabase.co', anonKey: 'k' }, { createClient: () => fake.client });
  assert((await cloud.restore()) === null, 'nobody is signed in at first');
  let err = null;
  try { await cloud.save('hello', null); } catch (e) { err = e; }
  assert(err && /sign/i.test(err.message), 'saving needs an account');
  assert((await cloud.signIn('email', 'me@example.com')).pending === 'email' && fake.calls[0][1] === 'me@example.com', 'a sign-in link is sent to the address');
  err = null;
  try { await cloud.signIn('email', 'nonsense'); } catch (e) { err = e; }
  assert(err, 'a bad address is refused');
  assert((await cloud.signIn('google')).pending === 'redirect' && fake.calls[1][0] === 'oauth', 'Google leaves for the provider');
  fake.signInAs('user-1', 'me@example.com');
  assert(cloud.user && cloud.user.email === 'me@example.com', 'the session reaches the store');
  assert((await cloud.load()) === null, 'a new account has no save yet');
  const universe = JSON.stringify({ seed: 'abc', data: 'x'.repeat(5000) });
  await cloud.save(universe, null);
  assert(fake.files.has('user-1/main.json.gz'), 'the save lives in the account\'s own folder');
  assert(fake.files.get('user-1/main.json.gz').size < universe.length, 'and is compressed');
  assert((await cloud.load()) === universe, 'it comes back exactly');
  await cloud.save(universe + ' again', null);
  assert((await cloud.load()) === universe + ' again', 'a newer autosave replaces it');
  // another account cannot read it
  const other = new CloudStore({ url: 'https://x.supabase.co', anonKey: 'k' }, { createClient: () => fake.client });
  await other.ensureClient();
  other.user = { id: 'user-2' };
  assert((await other.load()) === null, 'another account sees nothing of it');
  await cloud.signOut();
  assert(cloud.user === null, 'signing out clears the account');
}

summary();
