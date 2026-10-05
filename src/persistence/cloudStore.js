// Cloud saves linked to an account, with Supabase (optional). Nothing here loads unless a Supabase config is present,
// so the game runs the same without one: saves then stay in the browser or in a file. The Supabase library is split into
// its own chunk and only fetched when the config exists.
//
// Config (the URL and the "anon" key are meant to be public; what protects the data is the policy in supabase/setup.sql):
//   window.__SUPABASE_CONFIG__ = { url, anonKey, providers: ['email', 'google'] }, or Vite env variables
//   VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY and optionally VITE_SUPABASE_PROVIDERS (comma list, default "email").
//
// Where the save lives: Storage bucket "saves", object  {user id}/main.json.gz  (the gzip-compressed save, a few hundred KB).
// Only its owner can read or write it (storage policies in supabase/setup.sql).
//
// Signing in: "email" sends a magic link (no password to keep); "google" is the usual Google sign-in. Both come back to
// the game with the session in the address, which the client picks up; `justSignedIn` tells the game so.
const BUCKET = 'saves';
const FILE = 'main.json.gz';

export function readSupabaseConfig() {
  if (typeof window !== 'undefined' && window.__SUPABASE_CONFIG__) return window.__SUPABASE_CONFIG__;
  const env = (typeof import.meta !== 'undefined' && import.meta.env) || {};
  if (env.VITE_SUPABASE_URL && env.VITE_SUPABASE_ANON_KEY) {
    return {
      url: env.VITE_SUPABASE_URL,
      anonKey: env.VITE_SUPABASE_ANON_KEY,
      providers: String(env.VITE_SUPABASE_PROVIDERS || 'email').split(',').map(s => s.trim()).filter(Boolean)
    };
  }
  return null;
}

async function gzip(text) {
  return new Response(new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))).blob();
}

async function gunzip(blob) {
  return new Response(blob.stream().pipeThrough(new DecompressionStream('gzip'))).text();
}

export class CloudStore {
  // options.createClient(url, key, opts) replaces the Supabase library (tests)
  constructor(config = null, { createClient = null } = {}) {
    this.config = config || readSupabaseConfig();
    this.createClient = createClient;
    this.user = null;
    this.client = null;
    this.onUserChange = null;
    // the page was opened by a sign-in link or a Google redirect
    this.justSignedIn = typeof location !== 'undefined' && /access_token=|[?&]code=/.test(`${location.hash}${location.search}`);
  }

  get configured() {
    return Boolean(this.config && this.config.url && this.config.anonKey);
  }

  get providers() {
    return (this.config && this.config.providers) || ['email'];
  }

  async ensureClient() {
    if (this.client) return this.client;
    if (!this.configured) throw new Error('Cloud saves are not set up (see docs/HOSTING.md)');
    const create = this.createClient || (await import('@supabase/supabase-js')).createClient;
    this.client = create(this.config.url, this.config.anonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
    this.client.auth.onAuthStateChange((_event, session) => {
      this.user = session ? session.user : null;
      if (this.onUserChange) this.onUserChange(this.user);
    });
    return this.client;
  }

  // Picks up a session left by an earlier visit, or the one in the address after a sign-in link (no prompt)
  async restore() {
    if (!this.configured) return null;
    try {
      const client = await this.ensureClient();
      const { data } = await client.auth.getSession();
      this.user = data && data.session ? data.session.user : null;
      if (this.justSignedIn && typeof history !== 'undefined' && this.user) history.replaceState(null, '', location.pathname); // (tidy the address)
      return this.user;
    } catch {
      return null;
    }
  }

  // provider 'email' (needs `email`: a link is sent, the user clicks it) or 'google' (leaves for Google and comes back).
  // Returns { pending: 'email' | 'redirect' }.
  async signIn(provider = 'email', email = '') {
    const client = await this.ensureClient();
    const redirectTo = typeof location !== 'undefined' ? `${location.origin}${location.pathname}` : undefined;
    if (provider === 'google') {
      const { error } = await client.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } });
      if (error) throw error;
      return { pending: 'redirect' };
    }
    if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('Enter a valid email address.');
    const { error } = await client.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo } });
    if (error) throw error;
    return { pending: 'email' };
  }

  async signOut() {
    const client = await this.ensureClient();
    await client.auth.signOut();
    this.user = null;
  }

  get path() {
    return `${this.user.id}/${FILE}`;
  }

  // `compressed` is the gzip blob the save store already made (or null: it is compressed here)
  async save(text, compressed) {
    const client = await this.ensureClient();
    if (!this.user) throw new Error('Not signed in');
    const blob = compressed instanceof Blob ? compressed : await gzip(text);
    const { error } = await client.storage.from(BUCKET).upload(this.path, blob, { upsert: true, contentType: 'application/gzip' });
    if (error) throw error;
  }

  // -> the save text, or null when this account has none yet
  async load() {
    const client = await this.ensureClient();
    if (!this.user) throw new Error('Not signed in');
    const { data, error } = await client.storage.from(BUCKET).download(this.path);
    if (error) {
      const missing = /not found|404|does not exist/i.test(`${error.message || ''} ${error.statusCode || ''} ${error.status || ''}`);
      if (missing) return null;
      throw error;
    }
    return gunzip(data);
  }
}
