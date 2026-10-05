# Hosting on Firebase (not in use yet)

The game currently runs locally with `npm run dev` (saves go to this browser's database, or a file you pick under Menu > Save location). Nothing here is deployed or required; cloud saves stay hidden until a Firebase config is present, and the deploy workflow only runs when started by hand.

The game is a static site (Vite build): `npm run build` writes `dist/`, Firebase Hosting serves it.

## One-time setup
1. Create a project at <https://console.firebase.google.com>, then edit `.firebaserc` with its project id.
2. `npm i -g firebase-tools` and `firebase login`.
3. Optional, for cloud saves: in the console enable **Authentication > Google** and create a **Firestore** database
   (production mode). Copy the web app config into `.env.local` (see `.env.example`). Deploy the rules with
   `firebase deploy --only firestore`. (On Firebase Hosting the config is also fetched from `/__/firebase/init.json`.)

## Deploy
```
npm run build
firebase deploy --only hosting        # or: npm run deploy
```
Preview first with `firebase hosting:channel:deploy preview`.

## Deploys from GitHub
`.github/workflows/firebase-hosting.yml` tests, builds and deploys when started by hand (Actions tab); change its `on:` to run on every push to `main`. Add the repository secret
`FIREBASE_SERVICE_ACCOUNT` (service account JSON, role *Firebase Hosting Admin*) and, for cloud saves, the four
`VITE_FIREBASE_*` secrets.

## What is already prepared
- `firebase.json`: serves `dist/`, long-lived caching for hashed assets, no-cache for the service worker, basic security headers.
- `vite.config.js`: relative asset paths, Three.js in its own chunk.
- `public/manifest.webmanifest`, `public/sw.js`: installable and playable offline after the first visit.
- Saves (`src/persistence/saveStore.js`): browser database (IndexedDB, gzip), a file on the device (File System Access API),
  or the cloud (`cloudStore.js`: Google sign-in, Firestore, per-user rules in `firestore.rules`). Menu > *Save location…*.
- Older localStorage saves are moved into the browser database on first start.

## Notes
- Saving to a file needs Chrome, Edge or Opera and a click after each restart to allow access again; other browsers use the
  browser database plus Export / Import.
- Firestore documents are limited to 1 MB, so cloud saves are split into 600 KB chunks of the compressed save.
