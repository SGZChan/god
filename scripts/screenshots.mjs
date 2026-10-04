// Takes UI screenshots at several widths. Usage: node scripts/screenshots.mjs <url> <outDir>
import puppeteer from 'puppeteer-core';

const url = process.argv[2] || 'http://localhost:5173/';
const out = process.argv[3] || '.';
const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const wait = ms => new Promise(r => setTimeout(r, ms));

const browser = await puppeteer.launch({ executablePath: chrome, headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
page.on('console', m => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });

await page.setViewport({ width: 1440, height: 900 });
await page.goto(url, { waitUntil: 'load' });
await page.evaluate(() => { window.game.autosaveEnabled = false; localStorage.clear(); });
await page.reload({ waitUntil: 'load' });
await wait(1500);

// Land on a populated planet and let a little history happen
await page.evaluate(() => {
  const g = window.game;
  for (const sys of g.galaxy.systems) {
    const planet = sys.planets.find(p => p.isPopulated);
    if (planet) { g.loadSystem(sys.id); g.setActivePlanet(planet.id); break; }
  }
  g.timeSpeed = 100;
});
await wait(9000);
await page.evaluate(() => { window.game.timeSpeed = 1; });
await page.screenshot({ path: `${out}/1-system-1440.png` });

await page.click('#btn-view-surface');
await wait(1200);
await page.screenshot({ path: `${out}/2-surface-1440.png` });

await page.click('#btn-menu');
await wait(300);
await page.screenshot({ path: `${out}/3-menu-1440.png` });
await page.keyboard.press('Escape');

await page.setViewport({ width: 900, height: 700 });
await wait(600);
await page.screenshot({ path: `${out}/4-surface-900.png` });

await page.setViewport({ width: 600, height: 800 });
await wait(600);
await page.screenshot({ path: `${out}/5-surface-600.png` });

const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
console.log(overflow ? 'WARN: horizontal overflow at 600px' : 'no horizontal overflow at 600px');
await browser.close();
console.log(errors.length ? errors.join('\n') : 'No console errors.');
