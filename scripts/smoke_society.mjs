// Browser check of the sapient society: a town under construction, workers carrying goods, a mine or quarry, scouts,
// the extended overview panel and inspector. Fast-forwards the live simulation between screenshots.
// Usage: node scripts/smoke_society.mjs <url> [screenshotDir]
import puppeteer from 'puppeteer-core';

const url = process.argv[2] || 'http://localhost:5204/';
const shots = process.argv[3];
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
const shot = async (name) => { if (shots) await page.screenshot({ path: `${shots}/${name}.png` }); };

await page.goto(url, { waitUntil: 'load' });
await page.evaluate(() => { window.game.autosaveEnabled = false; localStorage.clear(); });
await page.reload({ waitUntil: 'load' });
await wait(1200);
await page.evaluate(() => {
  const g = window.game;
  for (const sys of g.galaxy.systems) {
    const planet = sys.planets.find(p => p.isPopulated);
    if (planet) { g.loadSystem(sys.id); g.setActivePlanet(planet.id); break; }
  }
  g.switchView('SURFACE');
  g.timeSpeed = 1;
});
await wait(800);

// fast-forward the simulation by `years` simulated years (80 steps each), a slice at a time so the page stays alive
const forward = async (years) => {
  for (let done = 0; done < years; done += 5) {
    await page.evaluate((n) => {
      const sim = window.game.activeSim;
      for (let i = 0; i < n * 80; i++) { sim.ecosystem.update(0.05, 1); sim.society.update(0.05, 1); }
    }, Math.min(5, years - done));
    await wait(30);
  }
};
const look = (x, y, zoom) => page.evaluate((x, y, zoom) => {
  const r = window.game.activeSim.renderer;
  r.camera.zoom = zoom;
  r.jumpTo(x, y);
}, x, y, zoom);

// ---- 1. a young town: sites and the first finished buildings ----
await forward(22);
let info = await page.evaluate(() => {
  const sim = window.game.activeSim;
  const civ = sim.society.civilizations.find(c => c.isAlive && c.settlements.length);
  const b = [...sim.terrain.buildings.values()].filter(x => x.civId === civ.id && x.type !== 'ruins');
  return { x: civ.capitalX, y: civ.capitalY, name: civ.name, sites: b.filter(x => x.progress < 1).length, done: b.filter(x => x.progress >= 1).length, citizens: civ.citizens, clans: civ.clans.length };
});
console.log(JSON.stringify(info));
check(info.sites + info.done >= 4, 'the settlement has buildings and construction sites', `(${info.sites} sites, ${info.done} finished)`);
check(info.clans >= 3, 'founding families formed clans', `(${info.clans})`);
await look(info.x, info.y - 4, 2.6);
await wait(1200);
await shot('society-town-under-construction');

// ---- 2. workers carrying goods ----
const carrier = await page.evaluate(() => {
  const sim = window.game.activeSim;
  const w = sim.ecosystem.entities.find(e => e.alive && e.isSapient && e.civilization && Object.keys(e.inventory).length && e.job);
  return w ? { x: w.x, y: w.y, job: w.job, load: JSON.stringify(w.inventory), id: w.id } : null;
});
check(Boolean(carrier), 'someone is carrying goods', carrier ? `(${carrier.job}: ${carrier.load})` : '');
if (carrier) {
  await look(carrier.x, carrier.y, 3.4);
  await wait(900);
  await shot('society-workers-carrying');
  await page.evaluate((id) => {
    const g = window.game;
    const e = g.activeSim.ecosystem.entities.find(x => x.id === id);
    if (e) g.inspector.inspect('entity', e);
  }, carrier.id);
  await wait(500);
  await shot('society-inspector');
  await page.evaluate(() => window.game.inspector.clear());
}

// ---- 3. a century on: mines, quarries, discoveries, scouts ----
await forward(110);
info = await page.evaluate(() => {
  const sim = window.game.activeSim;
  const civs = sim.society.civilizations.filter(c => c.isAlive);
  const out = [];
  for (const civ of civs) {
    const jobs = {};
    for (const e of sim.ecosystem.entities) if (e.alive && e.civilization === civ && e.job) jobs[e.job] = (jobs[e.job] || 0) + 1;
    const types = {};
    for (const b of sim.terrain.buildings.values()) if (b.civId === civ.id && b.progress >= 1) types[b.type] = (types[b.type] || 0) + 1;
    out.push({ name: civ.name, era: civ.era.name, citizens: civ.citizens, settlements: civ.settlements.length, discovered: civ.discovered, explored: civ.explored.length, jobs, types, x: civ.capitalX, y: civ.capitalY });
  }
  return out;
});
console.log(JSON.stringify(info.map(c => ({ ...c, jobs: undefined, types: undefined }))));
check(info.some(c => c.discovered.length > 0), 'scouts discovered resources', JSON.stringify(info.map(c => c.discovered)));
check(info.some(c => c.explored > 15), 'land was explored', JSON.stringify(info.map(c => c.explored)));
check(info.every(c => c.citizens > 3), 'every civilization is still populated', JSON.stringify(info.map(c => c.citizens)));
check(info.some(c => c.settlements > 1), 'a clan split off and founded a hamlet', JSON.stringify(info.map(c => c.settlements)));
check(info.some(c => Object.keys(c.jobs).length >= 5), 'many different jobs are being worked', JSON.stringify(info[0].jobs));

// the biggest civ: look at its town and at a quarry/mine/lumber camp
const big = info.sort((a, b) => b.citizens - a.citizens)[0];
await look(big.x, big.y - 3, 1.8);
await wait(1500);
await shot('society-town-grown');
const extractor = await page.evaluate(() => {
  const sim = window.game.activeSim;
  const order = ['mine', 'quarry', 'lumber_camp'];
  for (const type of order) {
    const b = [...sim.terrain.buildings.values()].find(x => x.type === type && x.progress >= 1 && x.civId);
    if (b) return { type, x: b.x + b.w / 2, y: b.y + b.h / 2 };
  }
  return null;
});
check(Boolean(extractor), 'a mine, quarry or lumber camp was built', extractor ? extractor.type : '');
if (extractor) {
  await look(extractor.x, extractor.y, 2.6);
  await wait(1200);
  await shot('society-mine');
}
const scout = await page.evaluate(() => {
  const sim = window.game.activeSim;
  const s = sim.ecosystem.entities.find(e => e.alive && e.job === 'scout' && e.civilization);
  return s ? { x: s.x, y: s.y } : null;
});
check(Boolean(scout), 'a scout is out exploring');
if (scout) {
  await look(scout.x, scout.y, 3);
  await wait(800);
  await shot('society-scout');
}

// ---- 4. panels ----
await look(big.x, big.y - 3, 1.4);
await page.evaluate(() => {
  const root = document.getElementById('overview-panel') || document.querySelector('.overview-panel');
  if (root && root.classList.contains('collapsed')) {
    const btn = root.querySelector('button');
    if (btn) btn.click();
  }
});
await wait(1500);
await shot('society-overview-panel');
const panel = await page.evaluate(() => {
  const body = document.querySelector('.overview-body');
  return body ? { text: body.innerText.slice(0, 700), chips: body.querySelectorAll('.civ-chip').length } : null;
});
console.log(panel ? panel.text.replace(/\n+/g, ' | ') : 'no overview body');
check(panel && panel.chips >= 4, 'the overview shows jobs, stockpiles and discoveries', panel ? `(${panel.chips} chips)` : '');
check(panel && /settlement/.test(panel.text) && /clan/.test(panel.text), 'the overview counts settlements and clans');

const fps = await page.evaluate((ms) => new Promise(res => {
  let n = 0;
  const t0 = performance.now();
  const f = () => { n++; performance.now() - t0 < ms ? requestAnimationFrame(f) : res(n / (ms / 1000)); };
  requestAnimationFrame(f);
}), 2500);
check(fps > 15, 'frame rate with a developed society in view', `(${fps.toFixed(0)} fps)`);
check(errors.length === 0, 'no page errors', errors.slice(0, 3).join(' | '));
await browser.close();
process.exit(results.every(Boolean) ? 0 : 1);
