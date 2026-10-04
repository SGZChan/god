// Screenshots the surface at several zoom levels. Usage: node scripts/screenshot_life.mjs <url> <outDir> [seconds]
import puppeteer from 'puppeteer-core';

const url = process.argv[2] || 'http://localhost:5173/';
const out = process.argv[3] || '.';
const seconds = Number(process.argv[4] || 20);
const wait = ms => new Promise(r => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(url, { waitUntil: 'load' });
await page.evaluate(() => { window.game.autosaveEnabled = false; localStorage.clear(); });
await page.reload({ waitUntil: 'load' });
await wait(1200);
await page.evaluate(async (s) => {
  const g = window.game;
  for (const sys of g.galaxy.systems) {
    const planet = sys.planets.find(p => p.isPopulated);
    if (planet) { g.loadSystem(sys.id); g.setActivePlanet(planet.id); break; }
  }
  g.switchView('SURFACE');
  g.timeSpeed = 10;
  await new Promise(r => setTimeout(r, s * 1000));
  g.timeSpeed = 1;
}, seconds);
await page.screenshot({ path: `${out}/life-default.png` });

// Zoom in on a herd of the most numerous wild species
await page.evaluate(() => {
  const sim = window.game.activeSim;
  const r = sim.renderer;
  const counts = new Map();
  for (const e of sim.ecosystem.entities) if (e.alive && !e.isSapient) counts.set(e.species, (counts.get(e.species) || 0) + 1);
  const species = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const herd = sim.ecosystem.entities.filter(e => e.alive && e.species === species);
  const cx = herd.reduce((s, e) => s + e.x, 0) / herd.length;
  const cy = herd.reduce((s, e) => s + e.y, 0) / herd.length;
  r.camera.zoom = 3;
  r.camera.x = r.canvas.width / 2 - cx * r.tileSize * 3;
  r.camera.y = r.canvas.height / 2 - cy * r.tileSize * 3;
});
await wait(1500);
await page.screenshot({ path: `${out}/life-zoomed.png` });
await browser.close();
console.log(errors.length ? errors.join('\n') : 'ok');
