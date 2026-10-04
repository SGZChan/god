import { edit } from './_ed.mjs';
edit('src/civilization/townPlanner.js', [
[`function wishes(civ, terrain, st, n, tier) {`, `function wishes(civ, terrain, st, n, tier, cn) {`],
[`  const have = type => (n[type] || 0);`, `  const have = type => (n[type] || 0);
  const civHave = type => (cn[type] || 0);   // across all settlements: specialised buildings are shared by the whole civilization
  const nSettle = Math.max(1, settlementsOf(civ).length);`],
[`    if (need.has(type) && !(civ.eraBuilt && civ.eraBuilt[type]) && have(type) === 0) weight *= 3;`, `    if (need.has(type) && civHave(type) === 0) weight *= 3;`],
[`    if (have('quarry') < 1 && pop >= 6 && !st.noQuarry)`, `    if (have('quarry') < 1 && civHave('quarry') < 1 + Math.floor(nSettle / 2) && pop >= 6 && !st.noQuarry)`],
[`    if (have('workshop') < Math.floor(pop / 14) + (pop >= 6 ? 1 : 0)) want('workshop', 2.5);
    if (have('kiln') < 1 + Math.floor(pop / 30) && pop >= 5) want('kiln', 2.5);
    if (have('smithy') < 1 + Math.floor(pop / 30) && pop >= 6 && (isDiscovered(civ, 'copper') || isDiscovered(civ, 'iron'))) want('smithy', 3);
    if (have('market_stall') + have('market') < Math.floor(pop / 12) && pop >= 8 && tier < 2) want('market_stall', 1.2);`, `    if (civHave('workshop') < 1 + Math.floor(nSettle / 3) && pop >= 6) want('workshop', 2.5);
    if (civHave('kiln') < 1 + Math.floor(nSettle / 3) && pop >= 5) want('kiln', 2.5);
    if (civHave('smithy') < 1 + Math.floor(nSettle / 3) && pop >= 6 && (isDiscovered(civ, 'copper') || isDiscovered(civ, 'iron'))) want('smithy', 3);
    if (have('market_stall') + have('market') < Math.floor(pop / 12) && pop >= 8 && tier < 2) want('market_stall', 1.2);`],
[`    if (have('market') < 1 && pop >= 8) want('market', 2);
    if (have('tavern') < Math.floor(pop / 16) + 1 && pop >= 10) want('tavern', 1);`, `    if (civHave('market') < 1 + Math.floor(nSettle / 3) && have('market') < 1 && pop >= 8) want('market', 2);
    if (civHave('tavern') < 1 + Math.floor(nSettle / 3) && have('tavern') < 1 && pop >= 10) want('tavern', 1);`],
[`have('mine') < Math.min(4, 1 + Math.floor(pop / 25)) && pop >= 8 && k)`, `civHave('mine') < Math.min(6, 1 + Math.floor(nSettle / 2)) && have('mine') < 2 && pop >= 8 && k)`],
[`    if (have('library') < 1 && pop >= 8) want('library', 1.5);
    if (have('barracks') < 1 && pop >= 14) want('barracks', 1);`, `    if (civHave('library') < 1 + Math.floor(nSettle / 4) && pop >= 8) want('library', 1.5);
    if (civHave('barracks') < 1 + Math.floor(nSettle / 4) && pop >= 14) want('barracks', 1);`],
[`    if (have('factory') < Math.floor(pop / 14) + 1 && pop >= 10) want('factory', 2, 'edge');
    if (have('power_plant') < 1 && pop >= 12) want('power_plant', 1.5, 'edge');`, `    if (civHave('factory') < 1 + Math.floor(nSettle / 3) && pop >= 10) want('factory', 2, 'edge');
    if (civHave('power_plant') < 1 + Math.floor(nSettle / 4) && pop >= 12) want('power_plant', 1.5, 'edge');`],
[`  const n = counts(terrain, st);
  const sites = openSites(terrain, st).length;`, `  const n = counts(terrain, st);
  const cn = {};
  for (const other of settlementsOf(civ)) for (const [k, v] of Object.entries(other === st ? n : counts(terrain, other))) cn[k] = (cn[k] || 0) + v;
  const sites = openSites(terrain, st).length;`],
[`  const list = wishes(civ, terrain, st, n, tier);`, `  const list = wishes(civ, terrain, st, n, tier, cn);`],
]);
