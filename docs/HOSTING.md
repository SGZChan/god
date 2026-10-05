# Hosting on Vercel, saves in Firebase (linked to the player's Google account)

The game is a static site (Vite build). **Vercel** hosts the files; **Firebase** (Authentication + Firestore, free Spark plan is
enough) holds the accounts and each player's save. The game talks to Firebase straight from the browser, so there is no server code
to run: Firestore rules let each signed-in player read and write only their own save.

Without the Firebase settings the game still runs exactly as before (saves in the browser database or a file on the device).

## 1. Firebase (once)
1. Create a project at <https://console.firebase.google.com> (you do not need Firebase Hosting).
2. **Build > Authentication > Get started > Sign-in method**: enable **Google**.
3. **Build > Firestore Database > Create database** (production mode, any region).
4. **Authentication > Settings > Authorized domains**: add your Vercel domain (`your-game.vercel.app`, and your own domain if you add one).
   Preview deploys have their own addresses; add them too if you want to sign in there. `localhost` is already allowed.
5. **Project settings > Your apps > Web app (</>)**: register an app, copy the config values (`apiKey`, `authDomain`, `projectId`, `appId`).
6. Publish the rules in `firestore.rules`: either paste them into **Firestore > Rules > Publish**, or with the CLI:
   edit `.firebaserc` with your project id, then `npm i -g firebase-tools`, `firebase login`, `firebase deploy --only firestore`.

## 2. Vercel
1. <https://vercel.com/new> > import the GitHub repository `sgzchan/god`. Vercel reads `vercel.json` (Vite, `npm ci`, `npm run build`,
   output `dist`); nothing to change. The production branch is `main`.
2. **Settings > Environment Variables** (all environments): `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`,
   `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID`. Redeploy after adding them (the values are baked in at build).
3. Every push to `main` now deploys by itself; other branches get preview addresses.

CLI instead of the dashboard: `npm i -g vercel`, then `vercel` (preview) or `vercel --prod`.

## Playing with an account
Menu > **Save location…** > *Sign in with Google*. From then on autosave writes the universe to your account; signing in on another
device offers to continue it. *Sign out* returns saving to this browser. The browser copy is always kept as well.

## Where the data lives
`users/{uid}/saves/main` (`savedAt`, `chunks`, `bytes`) and `users/{uid}/saves/main/chunks/{n}` hold the gzip-compressed save as base64
text in 600 KB pieces (Firestore documents are limited to 1 MB). One save per account (the latest autosave). A save is a few hundred
KB to about 1 MB compressed, far inside the free quota (1 GiB stored, 20k writes a day).

## Local testing of accounts
Copy `.env.example` to `.env.local`, fill in the values, run `npm run dev` (localhost is an authorized domain by default).

## What is already prepared
- `vercel.json`: build settings, long-lived caching for hashed assets, no-cache for the service worker, basic security headers.
- `firestore.rules`, `firestore.indexes.json`, `firebase.json` (rules only), `.firebaserc`.
- `vite.config.js`: relative asset paths, Three.js in its own chunk. The Firebase SDK is loaded from Google's CDN only when the config exists.
- `public/manifest.webmanifest`, `public/sw.js`: installable and playable offline after the first visit.
- `src/persistence/saveStore.js` (browser database / file / account) and `cloudStore.js` (Firebase sign-in and Firestore).

## Notes
- Saving to a file needs Chrome, Edge or Opera and a click after each restart to allow access again; other browsers use the browser
  database plus Export / Import.
- Sprite sheets in `public/sprites/` are third-party art; check their licence terms before making the site public (`docs/CREDITS.md`).
