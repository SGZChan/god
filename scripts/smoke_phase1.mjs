// Headless smoke check: loads the game, descends to the surface, runs at high speed,
// and reports console errors, notifications and frame rate. Usage: node scripts/smoke_phase1.mjs <url> [screenshot.png]
import puppeteer from 'puppeteer-core';

const url = process.argv[2] || 'http://localhost:5173/';
const shot = process.argv[3];
const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const browser = await puppeteer.launch({ executablePath: chrome, headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
const errors = [];
page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
page.on('console', m => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });

const report0 = {};
await page.goto(url, { waitUntil: 'load' });
await page.evaluate(() => { window.game.autosaveEnabled = false; localStorage.clear(); });
await page.reload({ waitUntil: 'load' });
await new Promise(r => setTimeout(r, 1500));
await page.evaluate(() => {
  window.__toasts = [];
  new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => {
    if (n.textContent) window.__toasts.push(n.textContent.replace('×', '').trim());
  }))).observe(document.getElementById('notifications-stream'), { childList: true });
});
report0.planet = await page.evaluate(() => {
  const sys = document.getElementById('system-select');
  const sel = document.getElementById('planet-select');
  for (const sysOpt of [...sys.options]) {
    sys.value = sysOpt.value;
    sys.dispatchEvent(new Event('change'));
    const opt = [...sel.options].find(o => o.text.includes('[Life]'));
    if (opt) {
      sel.value = opt.value;
      sel.dispatchEvent(new Event('change'));
      return sysOpt.text + ' / ' + opt.text;
    }
  }
  return 'no populated planet';
});
await page.click('#btn-view-surface');

const fps = () => page.evaluate(() => new Promise(res => {
  let n = 0; const t0 = performance.now();
  const f = () => { n++; performance.now() - t0 < 2000 ? requestAnimationFrame(f) : res(n / 2); };
  requestAnimationFrame(f);
}));

const report = report0;
for (const speed of (process.env.SPEEDS || "1,100,10000").split(",").map(Number)) {
  await page.click(`.time-btn[data-speed="${speed}"]`);
  await new Promise(r => setTimeout(r, +(process.env.SOAK_MS || 12000)));
  report[`fps@${speed}x`] = Math.round(await fps());
}
report.toasts = await page.evaluate(() => window.__toasts);
if (shot) await page.screenshot({ path: shot });
await browser.close();

console.log(JSON.stringify({ ...report, errors }, null, 2));
process.exit(errors.length ? 1 : 0);
