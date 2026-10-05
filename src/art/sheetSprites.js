// Ready-made character sprite sheets (the Pipoya free RPG sheets in public/sprites/pipoya/, see docs/CREDITS.md).
// Each sheet is 3 columns x 4 rows of one frame (RPG-Maker layout): rows are facing down, left, right, up; the
// middle column is standing, the outer two are the walking steps. public/sprites/manifest.json lists them
// (built by scripts/build_sprite_manifest.mjs):  { id, cat, sex, label, file, fw, fh }.
//
//   loadCatalog()                      Promise<sheets[]>; catalog() the same once loaded (or [])
//   sheetInfo(id)                      the manifest entry
//   drawSheet(ctx, id, dir, frame, x, y, h)  draws the frame standing on (x, y), `h` tall; false while loading
//   sheetThumb(id)                     a data URL of the standing frame (pickers, portraits), or null while loading
//   pickSheet(list, key)               one sheet out of a list, by a stable key (an entity id)
export const DIR_ROW = { down: 0, left: 1, right: 2, up: 3 };
export const WALK_FRAMES = [1, 0, 1, 2];
export const CATEGORIES = [
  { id: 'people', label: 'People' },
  { id: 'soldier', label: 'Soldiers' },
  { id: 'monster', label: 'Monsters' },
  { id: 'animal', label: 'Animals' },
  { id: 'boss', label: 'Bosses' },
  { id: 'other', label: 'Other' },
  { id: 'school', label: 'Students' },
  { id: 'festive', label: 'Festive' }
];

let sheets = [];
const byId = new Map();
let catalogPromise = null;
const images = new Map();   // id -> { img, ready, failed }
const thumbs = new Map();

const base = () => (typeof document !== 'undefined' ? document.baseURI : 'http://localhost/');

export function loadCatalog() {
  if (!catalogPromise) {
    catalogPromise = fetch(new URL('sprites/manifest.json', base()))
      .then(r => (r.ok ? r.json() : { sheets: [] }))
      .then((m) => {
        sheets = m.sheets || [];
        byId.clear();
        for (const s of sheets) byId.set(s.id, s);
        return sheets;
      })
      .catch(() => []);
  }
  return catalogPromise;
}

export const catalog = () => sheets;
export const sheetInfo = id => byId.get(id) || null;

function imageOf(id) {
  let rec = images.get(id);
  if (!rec) {
    const info = byId.get(id);
    rec = { img: null, ready: false, failed: !info };
    if (info && typeof Image !== 'undefined') {
      rec.img = new Image();
      rec.img.onload = () => { rec.ready = true; };
      rec.img.onerror = () => { rec.failed = true; };
      rec.img.src = new URL(`sprites/pipoya/${info.file}`, base()).href;
    }
    images.set(id, rec);
  }
  return rec;
}

// Standing on (x, y); `h` is the frame's height on screen (its width follows)
export function drawSheet(ctx, id, dir = 'down', frame = 1, x = 0, y = 0, h = 32) {
  const info = byId.get(id);
  if (!info) return false;
  const rec = imageOf(id);
  if (!rec.ready) return false;
  const w = (h * info.fw) / info.fh;
  ctx.drawImage(rec.img, frame * info.fw, (DIR_ROW[dir] || 0) * info.fh, info.fw, info.fh, x - w / 2, y - h * 0.92, w, h);
  return true;
}

export function sheetThumb(id) {
  if (thumbs.has(id)) return thumbs.get(id);
  const info = byId.get(id);
  const rec = info ? imageOf(id) : null;
  if (!rec || !rec.ready || typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = info.fw;
  c.height = info.fh;
  c.getContext('2d').drawImage(rec.img, info.fw, 0, info.fw, info.fh, 0, 0, info.fw, info.fh);
  const url = c.toDataURL();
  thumbs.set(id, url);
  return url;
}

// Waits until the sheet's image has loaded (pickers draw after this)
export function whenReady(id) {
  const rec = imageOf(id);
  if (!rec.img || rec.ready) return Promise.resolve(rec.ready);
  return new Promise(resolve => {
    rec.img.addEventListener('load', () => resolve(true), { once: true });
    rec.img.addEventListener('error', () => resolve(false), { once: true });
  });
}

export function pickSheet(list, key = '') {
  if (!list) return null;
  if (typeof list === 'string') return list;
  if (!list.length) return null;
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return list[h % list.length];
}
