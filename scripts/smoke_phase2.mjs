// Headless end-to-end check of save/load. Usage: node scripts/smoke_phase2.mjs <url>
import puppeteer from 'puppeteer-core';

const url = process.argv[2] || 'http://localhost:5173/';
const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const wait = ms => new Promise(r => setTimeout(r, ms));
const results = [];
const check = (ok, label, extra = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}: ${label} ${extra}`); };

const browser = await puppeteer.launch({ executablePath: chrome, headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
const errors = [];
page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
page.on('console', m => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });

const gotoFresh = async () => { await page.goto(url, { waitUntil: 'load' }); await wait(1200); };

await gotoFresh();
// Leaving a page autosaves, so switch autosave off before clearing
await page.evaluate(() => { window.game.autosaveEnabled = false; localStorage.clear(); });
await gotoFresh();

check(await page.evaluate(() => document.getElementById('continue-modal').classList.contains('hidden')),
  'no continue prompt on a fresh profile');

// Go to a populated planet and let it run
const before = await page.evaluate(async () => {
  const g = window.game;
  for (const sys of g.galaxy.systems) {
    const planet = sys.planets.find(p => p.isPopulated);
    if (planet) { g.loadSystem(sys.id); g.setActivePlanet(planet.id); break; }
  }
  g.switchView('SURFACE');
  g.timeSpeed = 100;
  await new Promise(r => setTimeout(r, 6000));
  g.timeSpeed = 0; // freeze so the saved state equals what is measured
  const sim = g.activeSim;
  return {
    seed: g.currentSeed,
    planetId: sim.planet.id,
    cosmic: g.cosmicTimeAge,
    civs: sim.society.civilizations.map(c => c.name),
    entities: sim.ecosystem.entities.length,
    tile: sim.terrain.getTile(sim.terrain.home.x + 5, sim.terrain.home.y + 3).elevation
  };
});
check(before.civs.length > 0, 'a populated planet is running', `(${before.civs.length} civs, ${before.entities} creatures)`);

const saved = await page.evaluate(() => window.game.saveGame({ announce: true }));
check(saved === true, 'saveGame() succeeds');
const size = await page.evaluate(() => localStorage.getItem('genesis-cosmos-save-v2').length);
check(size > 1000 && size < 4e6, 'save fits in localStorage', `(${Math.round(size / 1024)} KB)`);

// Reload: the prompt must appear, and autosave must not overwrite the save before the choice
await gotoFresh();
check(await page.evaluate(() => !document.getElementById('continue-modal').classList.contains('hidden')),
  'reload shows the continue prompt');
check(await page.evaluate(() => window.game.autosaveEnabled === false), 'autosave waits for the choice');

await page.click('#btn-continue-save');
await page.evaluate(() => { window.game.timeSpeed = 0; });
await wait(300);
const after = await page.evaluate(() => {
  const g = window.game;
  const sim = g.activeSim;
  return {
    seed: g.currentSeed,
    planetId: sim.planet.id,
    civs: sim.society.civilizations.map(c => c.name),
    entities: sim.ecosystem.entities.length,
    cosmic: g.cosmicTimeAge,
    tile: sim.terrain.getTile(sim.terrain.home.x + 5, sim.terrain.home.y + 3).elevation,
    modalHidden: document.getElementById('continue-modal').classList.contains('hidden'),
    autosave: g.autosaveEnabled
  };
});
check(after.seed === before.seed && after.planetId === before.planetId, 'same seed and planet after loading');
check(JSON.stringify(after.civs) === JSON.stringify(before.civs), 'same civilizations after loading', after.civs.join(', '));
check(Math.abs(after.entities - before.entities) <= 3, 'creature count restored', `(${before.entities} -> ${after.entities})`);
check(Math.abs(after.tile - before.tile) < 0.01, 'terrain restored');
check(after.cosmic >= before.cosmic - 0.001, 'cosmic time restored');
check(after.modalHidden && after.autosave, 'prompt closed and autosave re-enabled');

// Keep playing after load, then export/import and bad input
const alive = await page.evaluate(async () => {
  const g = window.game;
  g.switchView('SURFACE');
  g.timeSpeed = 100;
  const t0 = g.activeSim.terrain.timeAge;
  await new Promise(r => setTimeout(r, 3000));
  return g.activeSim.terrain.timeAge > t0;
});
check(alive, 'the loaded world keeps simulating');

const roundtrip = await page.evaluate(() => {
  const g = window.game;
  const text = g.buildSaveText();
  const ok = g.loadFromText(text);
  const bad = g.loadFromText('{"version": 999}');
  const junk = g.loadFromText('not json');
  return { ok, bad, junk, planet: g.activeSim && g.activeSim.planet.id };
});
check(roundtrip.ok === true && roundtrip.bad === false && roundtrip.junk === false,
  'import accepts a valid save and rejects bad ones');
check(Boolean(roundtrip.planet), 'game still has an active planet after a rejected import');

// Same seed -> same world across page loads (no save involved)
await page.evaluate(() => { window.game.autosaveEnabled = false; localStorage.clear(); });
const worldFingerprint = async () => {
  await page.goto(url, { waitUntil: 'load' });
  await wait(1200);
  return page.evaluate(() => {
    const g = window.game;
    // A planet nobody visited has not been advanced by frame-timing-dependent time yet
    const sim = [...g.simulations.values()].filter(x => !x.everActive).pop();
    return JSON.stringify({
      planet: sim.planet.id,
      e: [[0, 0], [77, -40], [-250, 300], [999, 999]].map(([x, y]) => sim.terrain.getTile(x, y).elevation),
      civs: sim.society.civilizations.map(c => [c.name, c.capitalX, c.capitalY]),
      n: sim.ecosystem.entities.length,
      structures: (() => { let n = 0; sim.terrain.forEachLoadedTile(t => { if (t.structure) n++; }); return n; })()
    });
  });
};
const w1 = await worldFingerprint();
await page.evaluate(() => { window.game.autosaveEnabled = false; localStorage.clear(); });
const w2 = await worldFingerprint();
check(w1 === w2, 'the same seed builds the same world on every page load');

await browser.close();
console.log(errors.length ? `ERRORS:\n${errors.join('\n')}` : 'No console errors.');
const failed = results.filter(r => !r).length + (errors.length ? 1 : 0);
console.log(failed ? `${failed} check(s) FAILED` : 'ALL BROWSER CHECKS PASSED');
process.exit(failed ? 1 : 0);
