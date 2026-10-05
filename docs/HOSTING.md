# Hosting on Vercel, with saves linked to an account

The game is a static site (Vite build). **Vercel** serves it; **Supabase** (free tier) holds the accounts and each player's
save. Yes, accounts need a small backend: Vercel only hosts the files and has no sign-in or storage of its own for this, and
the browser alone cannot keep a save that follows you from device to device. Supabase fills that gap without any server code
of ours: the game talks to it straight from the browser, and a policy on the bucket lets each account touch only its own save.

Without the Supabase settings the game still runs exactly as before (saves in the browser database or a file on the device).

## 1. Supabase (once, about 5 minutes)
1. Create a project at <https://supabase.com> (free plan is enough; one save is a few hundred KB).
2. **SQL Editor > New query**: paste `supabase/setup.sql` and Run. It creates the private `saves` bucket and the
   owner-only rules.
3. **Authentication > Providers**: *Email* is on by default (magic link, no password). Optional: enable *Google*.
4. **Authentication > URL Configuration**: set *Site URL* to your Vercel address (for example `https://your-game.vercel.app`) and add
   it, `https://*-your-team.vercel.app/**` (preview deploys) and `http://localhost:5173/**` under *Redirect URLs*.
5. **Project settings > API**: copy the *Project URL* and the *anon (publishable)* key. Both are meant to be public.

## 2. Vercel
1. <https://vercel.com/new> > import the GitHub repository `sgzchan/god`. Vercel reads `vercel.json` (Vite, `npm ci`, `npm run build`,
   output `dist`); nothing to change. The production branch is `main`.
2. **Settings > Environment Variables** (all environments): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and optionally
   `VITE_SUPABASE_PROVIDERS` (`email`, `google` or `email,google`). Redeploy after adding them (the values are baked in at build).
3. Every push to `main` now deploys by itself; other branches get preview addresses.

CLI instead of the dashboard: `npm i -g vercel`, then `vercel` (preview) or `vercel --prod`.

## Playing with an account
Menu > **Save location…** > *Sign in with email* (or Google). The link in the email brings you back to the game signed in, and from then
on autosave writes the universe to your account (`saves/{your id}/main.json.gz`). On another device sign in the same way: the game
offers to continue the saved universe. *Sign out* returns saving to this browser. The browser copy is always kept as well.

## Local testing of accounts
Copy `.env.example` to `.env.local`, fill in the two values, run `npm run dev`. Add `http://localhost:5173/**` to Supabase's redirect URLs.

## What is already prepared
- `vercel.json`: build settings, long-lived caching for hashed assets, no-cache for the service worker, basic security headers.
- `vite.config.js`: relative asset paths, Three.js in its own chunk; the Supabase library is its own chunk too, fetched only when the
  settings above exist.
- `public/manifest.webmanifest`, `public/sw.js`: installable and playable offline after the first visit.
- `src/persistence/saveStore.js` (browser database / file / account) and `cloudStore.js` (Supabase sign-in and Storage).

## Notes
- Saving to a file needs Chrome, Edge or Opera and a click after each restart to allow access again; other browsers use the browser
  database plus Export / Import.
- One save per account (the latest autosave). Keeping several slots or a history would be a small addition: more files under the
  same folder.
- Sprite sheets in `public/sprites/` are third-party art; check their licence terms before making the site public (`docs/CREDITS.md`).
