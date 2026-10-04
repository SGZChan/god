// Autotiled road tiles (pure, 14x14 RGBA): a worn path that connects to road neighbours, like the dirt paths in the
// reference art. mask: N=1 E=2 S=4 W=8; variant 0..3 changes the pebbles and the ragged edge.
import { Pix, hash, hex, shade } from './pixelKit.js';
import { TILE_PX } from '../world/buildings.js';

const KINDS = {
  dirt: { base: hex('#a86f42'), lt: hex('#bd8550'), dk: hex('#8c5832'), edge: hex('#74482a'), pebble: hex('#6f6a62') },
  gravel: { base: hex('#b3ab98'), lt: hex('#cbc4b0'), dk: hex('#968f7d'), edge: hex('#7a7464'), pebble: hex('#e4dfd0') },
  cobble: { base: hex('#8e8e96'), lt: hex('#a9a9b1'), dk: hex('#6f6f78'), edge: hex('#4f4f58'), pebble: hex('#b9b9c2') }
};

export function composeRoadTile(kind, mask, variant = 0) {
  const T = TILE_PX;
  const K = KINDS[kind] || KINDS.dirt;
  const p = new Pix(T, T);
  const c = (T - 1) / 2;
  const half = kind === 'cobble' ? 5.6 : 4.3;
  const seed = variant * 31 + (kind === 'dirt' ? 1 : kind === 'gravel' ? 2 : 3);
  for (let y = 0; y < T; y++) {
    for (let x = 0; x < T; x++) {
      const dx = Math.abs(x - c);
      const dy = Math.abs(y - c);
      let inside = dx <= half && dy <= half;
      // arms toward connected neighbours run to the tile edge
      if (!inside) {
        if ((mask & 1) && y < c && dx <= half) inside = true;
        if ((mask & 4) && y > c && dx <= half) inside = true;
        if ((mask & 2) && x > c && dy <= half) inside = true;
        if ((mask & 8) && x < c && dy <= half) inside = true;
      }
      // ragged edge: pixels at the border of the path are sometimes grass again (not toward a neighbour)
      const bx = (x === 0 || x === T - 1) && !((mask & 8) && x === 0 && dy <= half) && !((mask & 2) && x === T - 1 && dy <= half);
      if (inside) {
        const n = hash(x, y, seed);
        const edgeDist = Math.min(half - dx, half - dy);
        const armLeak = (mask & 1 && y < c) || (mask & 4 && y > c) ? dx : (mask & 2 && x > c) || (mask & 8 && x < c) ? dy : 0;
        const border = armLeak > half - 1.2 || (!((mask & 1) && y < c) && !((mask & 4) && y > c) && !((mask & 2) && x > c) && !((mask & 8) && x < c) && edgeDist < 1.2);
        if (border && n > 0.72) continue;
        if (bx) continue;
        let col = n > 0.8 ? K.lt : (n > 0.25 ? K.base : K.dk);
        if (border) col = shade(K.dk, 0.92);
        if (kind === 'cobble') {
          const row = Math.floor(y / 3);
          if (y % 3 === 2 || (x + (row % 2) * 2) % 5 === 4) col = K.edge;
          else if (hash(x >> 1, row, seed) > 0.6) col = K.lt;
        }
        p.set(x, y, col);
      }
    }
  }
  // a few pebbles and tufts
  for (let i = 0; i < 4; i++) {
    const x = Math.floor(hash(i, 1, seed) * (T - 2)) + 1;
    const y = Math.floor(hash(i, 2, seed) * (T - 2)) + 1;
    if (p.alpha(x, y)) p.set(x, y, K.pebble);
  }
  return p;
}
