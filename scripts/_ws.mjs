import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: '/opt/pw-browsers/chromium', headless: 'new', args: ['--no-sandbox'] });
const p = await b.newPage(); await p.setViewport({ width: 1400, height: 900 });
p.on('pageerror', e => console.log('PAGEERR', e.message));
p.on('console', m => { if (m.type() === 'error') console.log('CONSOLE', m.text()); });
await p.goto('http://localhost:5199/', { waitUntil: 'load' });
await p.evaluate(() => { window.game.autosaveEnabled = false; localStorage.clear(); });
await p.reload({ waitUntil: 'load' });
await new Promise(r => setTimeout(r, 1500));
await p.evaluate(() => { const g = window.game; for (const sys of g.galaxy.systems) { const pl = sys.planets.find(x => x.isPopulated); if (pl) { g.loadSystem(sys.id); g.setActivePlanet(pl.id); break; } } g.switchView('SURFACE'); });
await new Promise(r => setTimeout(r, 1000));
await p.evaluate(async () => { await window.game.skipYears(120); });
for (let n = 0; n < 3; n++) {
  const res = await p.evaluate(async (n) => {
    const g = window.game; const sim = g.activeSim;
    const before = sim.ecosystem.entities.length;
    document.getElementById('btn-open-workshop').click();
    await new Promise(r => setTimeout(r, 300));
    const tabs = [...document.querySelectorAll('#workshop-modal button, #workshop-modal [role=tab]')].map(e => e.id || e.textContent.trim().slice(0, 14));
    const speciesTab = [...document.querySelectorAll('#workshop-modal button')].find(e => /creature|species/i.test(e.textContent));
    if (speciesTab) speciesTab.click();
    const btn = document.getElementById('btn-spawn-creation');
    const info = { disabled: btn.disabled, text: btn.textContent, tabs: tabs.slice(0, 12) };
    if (!btn.disabled) btn.click();
    console.log(JSON.stringify(info));
    const armed = sim.divine.pendingSpawn ? sim.divine.pendingSpawn.species.name : null;
    const power = sim.divine.activePower.id;
    // click the middle of the canvas like the player
    const rect = g.surfaceCanvas.getBoundingClientRect();
    const x = rect.left + rect.width / 2 + n * 40, y = rect.top + rect.height / 2;
    return { before, armed, power, x, y, hidden: document.getElementById('workshop-modal').classList.contains('hidden') };
  }, n);
  console.log('armed', JSON.stringify(res));
  await p.mouse.click(res.x, res.y);
  await new Promise(r => setTimeout(r, 500));
  const after = await p.evaluate(() => ({ animals: window.game.activeSim.ecosystem.entities.filter(e => !e.isSapient).length, n: window.game.activeSim.ecosystem.entities.length, power: window.game.activeSim.divine.activePower.id, species: window.game.activeSim.ecosystem.registry.species.filter(s => s.isCustom).map(s => s.name + ':' + s.population) }));
  console.log('after click', JSON.stringify(after));
}
await b.close();
