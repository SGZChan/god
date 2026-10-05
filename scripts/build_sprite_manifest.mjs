// Copies the Pipoya sprite sheets (RPG-Maker layout: 3 columns x 4 rows of one frame: down, left, right, up) from a
// source folder into public/sprites/pipoya/ with plain file names, and writes public/sprites/manifest.json:
//   { sheets: [{ id, cat, sex, label, file, fw, fh }] }   (see src/art/sheetSprites.js)
// Usage: node scripts/build_sprite_manifest.mjs "<path to 'PIPOYA FREE RPG Character Sprites 32x32'>"
import fs from 'node:fs';
import path from 'node:path';

const src = process.argv[2];
if (!src || !fs.existsSync(src)) { console.error('Usage: node scripts/build_sprite_manifest.mjs <source folder>'); process.exit(1); }
const out = path.resolve('public/sprites/pipoya');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

const slug = s => s.toLowerCase().replace(/\.png$/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const CATS = { male: 'people', female: 'people', soldier: 'soldier', enemy: 'monster', animal: 'animal', boss: 'boss', other: 'other', xmas: 'festive', 'japanese school characters': 'school' };
const sheets = [];

function walk(dir, top) {
  for (const name of fs.readdirSync(dir).sort()) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) { walk(full, top || name.toLowerCase()); continue; }
    if (!name.toLowerCase().endsWith('.png')) continue;
    const buf = fs.readFileSync(full);
    const w = buf.readUInt32BE(16);
    const h = buf.readUInt32BE(20);
    const t = top || 'other';
    const cat = CATS[t] || 'other';
    const sex = t === 'female' || /fmale|female/i.test(name) ? 'F' : (t === 'male' || /\bmale\b/i.test(name) ? 'M' : null);
    const id = `${slug(t)}-${slug(name)}`.replace(/^(.+?)-\1-/, '$1-');
    const file = `${id}.png`;
    fs.writeFileSync(path.join(out, file), buf);
    sheets.push({ id, cat, sex, label: name.replace(/\.png$/i, ''), file, fw: w / 3, fh: h / 4 });
  }
}
walk(src, null);
fs.writeFileSync(path.resolve('public/sprites/manifest.json'), JSON.stringify({ credit: 'PIPOYA FREE RPG Character Sprites 32x32', sheets }, null, 0));
const counts = {};
for (const s of sheets) counts[s.cat] = (counts[s.cat] || 0) + 1;
console.log(`${sheets.length} sheets`, JSON.stringify(counts));
