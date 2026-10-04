// CPU-profiles the surface view of a populated planet. Usage: node scripts/profile_surface.mjs <url> [speed]
import puppeteer from 'puppeteer-core';

const url = process.argv[2] || 'http://localhost:5173/';
const speed = Number(process.argv[3] || 0);
const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const wait = ms => new Promise(r => setTimeout(r, ms));

const browser = await puppeteer.launch({ executablePath: chrome, headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
await page.goto(url, { waitUntil: 'load' });
await page.evaluate(() => { window.game.autosaveEnabled = false; localStorage.clear(); });
await page.reload({ waitUntil: 'load' });
await wait(1200);

await page.evaluate(async () => {
  const g = window.game;
  for (const sys of g.galaxy.systems) {
    const planet = sys.planets.find(p => p.isPopulated);
    if (planet) { g.loadSystem(sys.id); g.setActivePlanet(planet.id); break; }
  }
  g.switchView('SURFACE');
  g.timeSpeed = 100;
  await new Promise(r => setTimeout(r, 12000)); // let civilizations grow
  g.timeSpeed = 0;
});
await wait(500);
await page.evaluate(() => { window.game.timeSpeed = 0; });
await page.evaluate((s) => { window.game.timeSpeed = s; }, speed);

const client = await page.createCDPSession();
await client.send('Profiler.enable');
await client.send('Profiler.setSamplingInterval', { interval: 500 });
await client.send('Profiler.start');
await wait(4000);
const { profile } = await client.send('Profiler.stop');

const byId = new Map(profile.nodes.map(n => [n.id, n]));
const self = new Map();
const dt = profile.timeDeltas;
profile.samples.forEach((id, i) => {
  const n = byId.get(id);
  const key = `${n.callFrame.functionName || '(anonymous)'} ${n.callFrame.url.split('/').pop()}:${n.callFrame.lineNumber + 1}`;
  self.set(key, (self.get(key) || 0) + (dt[i] || 0));
});
const total = [...self.values()].reduce((a, b) => a + b, 0);
console.log(`speed ${speed}x, sampled ${(total / 1000).toFixed(0)} ms of CPU over 4 s`);
[...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14)
  .forEach(([k, v]) => console.log(`${((v / total) * 100).toFixed(1).padStart(5)}%  ${k}`));
await browser.close();
