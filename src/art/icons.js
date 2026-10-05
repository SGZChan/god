// Small portraits for the interface (inspector, overview): the creature as it is drawn in the world, so a species or
// champion that uses a ready-made sprite sheet shows that sprite and not the procedural creature of its genes.
import { creatureDataURL } from './creatureSprite.js';
import { sheetThumb, whenReady, sheetInfo } from './sheetSprites.js';

// The sheet a species may use (the first it lists), or null
export function speciesSheet(species) {
  const s = species && species.sheets;
  if (!s) return null;
  const pick = v => (Array.isArray(v) ? v[0] : v);
  return pick(s.any) || pick(s.F) || pick(s.M) || (typeof s === 'string' ? s : null);
}

// Sets img.src to the portrait of `sheetId` (when given and known) or of the genes, upgrading from the genes once the sheet has loaded
export function setPortrait(img, traits, sheetId = null) {
  img.src = creatureDataURL(traits);
  if (!sheetId || !sheetInfo(sheetId)) return img;
  const now = sheetThumb(sheetId);
  if (now) { img.src = now; return img; }
  whenReady(sheetId).then(() => { const url = sheetThumb(sheetId); if (url) img.src = url; });
  return img;
}

export function entityPortrait(img, ent) { return setPortrait(img, ent.traits, ent.sheetId); }
