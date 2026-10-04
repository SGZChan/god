// Headless check of the god powers in the real page. Usage: node scripts/smoke_powers.mjs [url] [--shots]
// Casts every power on a populated planet, checks for console errors and that effects/events show up,
// and (with --shots) saves screenshots of several effects and of the palette to scripts/shots/.
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const url = process.argv.find(a => a.startsWith('http')) || 'http://localhost:5202/';
const shots = process.argv.includes('--shots');
const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const wait = ms => new Promise(r => setTimeout(r, ms));
const results = [];
const check = (ok, label, extra = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}: ${label} ${extra}`); };
if (shots) fs.mkdirSync('scripts/shots', { recursive: true });

const browser = await puppeteer.launch({ executablePath: chrome, headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
const errors = [];
page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
page.on('console', m => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });

await page.goto(url, { waitUntil: 'load' });
await wait(1200);
await page.evaluate(() => { window.game.autosaveEnabled = false; localStorage.clear(); });
await page.goto(url, { waitUntil: 'load' });
await wait(1200);

// Go to a populated planet and let life settle
await page.evaluate(async () => {
  const g = window.game;
  for (const sys of g.galaxy.systems) {
    const planet = sys.planets.find(p => p.isPopulated);
    if (planet) { g.loadSystem(sys.id); g.setActivePlanet(planet.id); break; }
  }
  g.switchView('SURFACE');
  g.timeSpeed = 1;
});
await wait(1500);

const info = await page.evaluate(() => {
  const g = window.game;
  const sim = g.activeSim;
  const civ = sim.society.civilizations.find(c => c.isAlive);
  const home = civ ? { x: civ.capitalX, y: civ.capitalY } : sim.terrain.home;
  sim.renderer.camera.zoom = 1.6;
  sim.renderer.camera.x = sim.renderer.canvas.width / 2 - (home.x + 0.5) * sim.renderer.tileSize * 1.6;
  sim.renderer.camera.y = sim.renderer.canvas.height / 2 - (home.y + 0.5) * sim.renderer.tileSize * 1.6;
  return { home, count: sim.ecosystem.entities.length, powers: document.querySelectorAll('.pp-cell').length };
});
check(info.count > 20, 'planet is populated', `(${info.count} creatures)`);
check(info.powers >= 32, 'palette has the power buttons', `(${info.powers})`);

// palette structure
const ui = await page.evaluate(() => ({
  tabs: [...document.querySelectorAll('.pp-tab')].map(t => t.textContent),
  visible: [...document.querySelectorAll('.pp-cell')].filter(c => !c.hidden).length,
  legacyBtn: Boolean(document.querySelector('.power-btn[data-power="TERRAFORM_RAISE"]')),
  inspect: Boolean(document.getElementById('power-inspect')),
  asteroid: Boolean(document.getElementById('btn-launch-asteroid')),
  blackhole: Boolean(document.getElementById('btn-spawn-blackhole')),
  workshop: Boolean(document.getElementById('btn-open-workshop'))
}));
check(ui.tabs.join() === 'Terrain,Nature,Blessings,Curses,Creatures,Chaos,Cosmic', 'seven category tabs', ui.tabs.join());
check(ui.visible > 5 && ui.legacyBtn && ui.inspect && ui.asteroid && ui.blackhole && ui.workshop, 'legacy ids, cosmic buttons and workshop are present');

// clicking a tab and a power through the UI
await page.click('.pp-tab[data-category="curses"]');
await page.click('.pp-cell[data-power="TORNADO"]');
const sel = await page.evaluate(() => ({
  power: window.game.activeSim.divine.activePower.id,
  renderer: window.game.activeSim.renderer.currentPower.id,
  banner: document.getElementById('power-hint-text').textContent
}));
check(sel.power === 'TORNADO' && sel.renderer === 'TORNADO' && /Tornado/.test(sel.banner), 'selecting a power updates the sim and the hint banner', sel.banner.slice(0, 50));
// hotkeys: first power of the Terrain tab
await page.click('.pp-tab[data-category="terrain"]');
await page.keyboard.press('1');
check(await page.evaluate(() => window.game.activeSim.divine.activePower.id) === 'TERRAFORM_RAISE', 'hotkey 1 selects the first visible power');
await page.type('.pp-search input', 'fire');
const found = await page.evaluate(() => [...document.querySelectorAll('.pp-cell')].filter(c => !c.hidden).map(c => c.dataset.power));
check(found.includes('GIFT_OF_FIRE') && found.includes('WILDFIRE'), 'search filters across categories', found.join());
await page.evaluate(() => { const i = document.querySelector('.pp-search input'); i.value = ''; i.dispatchEvent(new Event('input')); i.blur(); });
await page.evaluate(() => document.getElementById('power-inspect').click());

if (shots) {
  await page.click('.pp-tab[data-category="blessings"]');
  await page.hover('.pp-cell[data-power="DIVINE_SHIELD"]');
  await wait(300);
  await page.screenshot({ path: 'scripts/shots/palette_1440.png' });
}

// screenshots of several effects
if (shots) {
  const stage = async (name, powerId, opts = {}) => {
    await page.mouse.move(700, 300);
    await page.evaluate(({ id, home, dx, dy }) => {
      const g = window.game;
      const sim = g.activeSim;
      sim.terrain.effects.list.length = 0;
      sim.terrain.effects.visuals.length = 0;
      g.timeSpeed = 1;
      document.querySelector(`.pp-cell[data-power="${id}"]`).click();
      sim.divine.lastPaintedTile = { x: -999, y: -999 };
      sim.divine.applyAt(Math.floor(home.x) + dx, Math.floor(home.y) + dy, false);
      document.getElementById('power-inspect').click();
    }, { id: powerId, home: info.home, dx: opts.dx || 0, dy: opts.dy || 0 });
    await wait(opts.after || 2500);
    await page.screenshot({ path: `scripts/shots/${name}.png` });
  };
  await stage('fx_tornado', 'TORNADO');
  await stage('fx_wildfire', 'WILDFIRE', { after: 4000 });
  await stage('fx_meteor_shower', 'METEOR_SHOWER', { after: 5000 });
  await stage('fx_healing', 'HEALING_SPRING');
  await stage('fx_blizzard', 'BLIZZARD', { after: 3500 });
  await stage('fx_shield', 'DIVINE_SHIELD');
  await stage('fx_lightning_storm', 'LIGHTNING_STORM', { after: 3000 });
  await stage('fx_locusts', 'LOCUSTS', { after: 3000 });
  await stage('fx_earthquake', 'EARTHQUAKE', { after: 900 });
  await stage('fx_aurora', 'AURORA', { after: 5000 });
  await stage('fx_rainbow', 'RAINBOW', { after: 4000 });
  await stage('fx_dragon', 'MONSTER', { after: 5000, dx: -3 });
  await stage('fx_fireworks', 'FIREWORKS', { after: 2500 });
  await stage('fx_gravity', 'GRAVITY_WELL', { after: 2500 });
  await stage('fx_resurrect', 'RESURRECTION', { after: 1200 });
}


// Cast every power on the home area with the page's own divine manager
const ids = await page.evaluate(() => [...document.querySelectorAll('.pp-cell')].map(c => c.dataset.power));
const castResults = [];
for (const id of ids) {
  const r = await page.evaluate((powerId, home) => {
    const g = window.game;
    const sim = g.activeSim;
    const divine = sim.divine;
    // make sure there is something dead to resurrect
    const victim = sim.ecosystem.entities.find(e => e.alive && e.isSapient) || sim.ecosystem.entities.find(e => e.alive);
    if (powerId === 'RESURRECTION' && victim) { victim.x = home.x + 1; victim.y = home.y + 1; victim.die('smoke test'); }
    if (['GIANT_GROWTH', 'SHRINK', 'SHAPESHIFT', 'CHARM'].includes(powerId)) {
      const target = sim.ecosystem.entities.find(e => e.alive && e !== victim);
      if (target) { target.x = home.x + 0.5; target.y = home.y + 0.5; }
    }
    const before = sim.ecosystem.worldEvents.length;
    const fx = sim.terrain.effects;
    const power = document.querySelector(`.pp-cell[data-power="${powerId}"]`);
    power.click();
    const dx = powerId === 'MONSTER' ? 4 : 0;
    divine.lastPaintedTile = { x: -999, y: -999 };
    divine.applyAt(Math.floor(home.x) + dx, Math.floor(home.y), false);
    return { ok: sim.ecosystem.worldEvents.length === before + 1, message: divine.lastMessage, effects: fx.list.length, visuals: fx.visuals.length };
  }, id, info.home);
  castResults.push([id, r]);
}
const failedCasts = castResults.filter(([, r]) => !r.ok).map(([id, r]) => `${id}(${r.message})`);
check(failedCasts.length === 0, 'every power casts through the UI path and emits an event', failedCasts.join(', '));
await wait(400);
await page.evaluate(() => document.getElementById('power-inspect').click());

// let everything run, fast, then check the world is still sane
await page.evaluate(() => { window.game.timeSpeed = 60; });
await wait(5000);
const after = await page.evaluate(() => {
  const g = window.game;
  const sim = g.activeSim;
  return { events: sim.ecosystem.worldEvents.length, effects: sim.terrain.effects.list.length, entities: sim.ecosystem.entities.length, types: [...new Set(sim.terrain.effects.list.map(e => e.type))] };
});
check(after.events >= ids.length, 'world events were recorded', `(${after.events})`);
check(after.entities > 0, 'the world survives all the powers', `(${after.entities} creatures, effects: ${after.types.join()})`);
await page.evaluate(() => { window.game.timeSpeed = 0; });

// save / load round trip keeps the effects
const roundTrip = await page.evaluate(async () => {
  const g = window.game;
  const sim = g.activeSim;
  sim.terrain.effects.list.length = 0;
  g.timeSpeed = 0;
  const divine = sim.divine;
  document.querySelector('.pp-cell[data-power="TORNADO"]').click();
  divine.lastPaintedTile = { x: -999, y: -999 };
  const civ = sim.society.civilizations.find(c => c.isAlive);
  divine.applyAt(Math.floor(civ.capitalX) + 3, Math.floor(civ.capitalY), false);
  const before = sim.terrain.effects.list.length;
  g.saveGame({ announce: false });
  const text = localStorage.getItem('genesis-cosmos-save-v2');
  return { before, saved: Boolean(text), hasEffects: text && text.includes('"effects"') && text.includes('tornado') };
});
check(roundTrip.before === 1 && roundTrip.saved && roundTrip.hasEffects, 'the save contains the active tornado');

if (shots) {
  await page.setViewport({ width: 900, height: 700 });
  await wait(600);
  await page.screenshot({ path: 'scripts/shots/palette_900.png' });
  await page.setViewport({ width: 600, height: 800 });
  await wait(600);
  await page.screenshot({ path: 'scripts/shots/palette_600.png' });
}

check(errors.length === 0, 'no console or page errors', errors.slice(0, 5).join(' | '));
await browser.close();
const failed = results.filter(r => !r).length;
console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL CHECKS PASSED');
process.exit(failed ? 1 : 0);
