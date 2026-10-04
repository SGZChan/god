import { edit } from './_ed.mjs';
edit('src/civilization/jobs.js', [
[`  const foodTarget = Math.max(8, pop * 3);
  const foodU = eco.foodUnits(st.stock);
  const foodShort = foodU < foodTarget ? 1 - foodU / foodTarget : 0;
  const foodRich = foodU > foodTarget * 2.2;`,
`  const foodTarget = foodTargetOf(pop);
  const foodU = eco.foodUnits(st.stock);
  const foodShort = foodU < foodTarget ? 1 - foodU / foodTarget : 0;
  const foodRich = foodU > foodTarget * 1.3;`],
[`  add('builder', Math.min(Math.ceil(N * 0.45), sites.length * 2 + (roads > 0 ? 1 : 0)));`,
`  // builders are only needed where work can actually go on: materials delivered or in the stockpile
  let workable = 0;
  for (const s of sites) {
    if (s.progress < deliveredFraction(s) - 0.002) { workable++; continue; }
    const inb = (st._inbound && st._inbound.get(s.id)) || {};
    for (const [res, n] of Object.entries(missingMaterials(s))) {
      if (n - (inb[res] || 0) > 0.01 && (st.stock[res] || 0) > 0.01) { workable++; break; }
    }
  }
  add('builder', Math.min(Math.ceil(N * 0.4), workable * 2 + (roads > 0 ? 1 : 0)));`],
[`    food: Math.max(0, 1 - eco.foodUnits(st.stock) / Math.max(8, members.length * 3))`, `    food: Math.max(0, 1 - eco.foodUnits(st.stock) / foodTargetOf(members.length))`],
[`  short.food = eco.foodUnits(st.stock) < Math.max(8, members.length * 3);`, `  short.food = eco.foodUnits(st.stock) < foodTargetOf(members.length);`],
[`// ---------- the labour market ----------
`, `// ---------- the labour market ----------

function foodTargetOf(pop) {
  return Math.min(70, Math.max(8, pop * 2.5));
}
`],
[`    if (rec.tier > tier) continue;
    if (rec.needs`, `    const outKey = Object.keys(rec.out)[0];
    if (rec.tier > tier && !(nextReq.output && nextReq.output[outKey])) continue; // (the goods the next era needs are made early)
    if (rec.needs`],
]);
edit('src/civilization/townPlanner.js', [
[`    if (!def || def.tier > tier || !affordable(civ, terrain, st, type)) return;`, `    // buildings of the next era's requirements may be raised one era early (a kiln and a smithy lead INTO the bronze age)
    if (!def || (def.tier > tier && !(def.tier === tier + 1 && need.has(type))) || !affordable(civ, terrain, st, type)) return;`],
[`  const cap = maxSites !== null ? maxSites : 2 + Math.min(5, (st.jobs.builder || 0) + (st.jobs.hauler || 0));`, `  const cap = maxSites !== null ? maxSites : Math.max(2, 1 + Math.ceil(((st.jobs.builder || 0) + (st.jobs.hauler || 0)) / 2));`],
]);
edit('src/life/ecosystem.js', [
[`    if (this.entities.length >= MAX_ENTITIES) return false;
    if (!father.alive`, `    // wildlife may not crowd the sapients out of the safety cap: animals stop breeding at 80% of it
    if (this.entities.length >= (mother.isSapient ? MAX_ENTITIES : MAX_ENTITIES * 0.8)) return false;
    if (!father.alive`],
]);
