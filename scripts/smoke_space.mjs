// Headless check of space navigation. Usage: node scripts/smoke_space.mjs <url> [screenshotDir]
import puppeteer from 'puppeteer-core';

const url = process.argv[2] || 'http://localhost:5173/';
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

await page.goto(url, { waitUntil: 'load' });
await page.evaluate(() => { window.game.autosaveEnabled = false; localStorage.clear(); });
await page.reload({ waitUntil: 'load' });
await wait(1500);

// ---- black holes belong to one system ----
const bh = await page.evaluate(async () => {
  const g = window.game;
  const sys = g.galaxy.systems;
  g.enterSystem(sys[0].id);
  g.solarSystem.createSingularity(160);
  const here = g.solarSystem.physics.blackHoles.length;
  const mesh = g.solarSystem.physics.blackHoles[0].mesh;
  g.enterSystem(sys[1].id);
  const elsewhere = g.solarSystem.physics.blackHoles.length;
  const meshDetached = mesh.parent === null;
  g.enterSystem(sys[0].id);
  const back = g.solarSystem.physics.blackHoles.length;
  const meshBack = mesh.parent === g.solarSystem.scene;
  return { here, elsewhere, meshDetached, back, meshBack };
});
check(bh.here === 1, 'a black hole spawns in the current system');
check(bh.elsewhere === 0 && bh.meshDetached, 'another system has no black hole (physics and scene)');
check(bh.back === 1 && bh.meshBack, 'the black hole is still there when you come back');

// ---- planets keep their state ----
const kept = await page.evaluate(() => {
  const g = window.game;
  const sys = g.galaxy.systems;
  g.enterSystem(sys[2].id);
  const planet = g.solarSystem.planets[0];
  planet.isConsumed = true;
  g.enterSystem(sys[3].id);
  g.enterSystem(sys[2].id);
  return g.solarSystem.planets[0] === planet && g.solarSystem.planets[0].isConsumed === true;
});
check(kept, 'a consumed planet stays consumed after leaving and re-entering its system');

// ---- universe view with real mouse clicks ----
await page.keyboard.press('1');
await wait(1500);
check(await page.evaluate(() => window.game.currentView === 'UNIVERSE'), 'key 1 opens the universe view');
check(await page.evaluate(() => window.game.universe.group.visible && !window.game.galaxy.group.visible), 'only the universe is drawn');
if (shots) await page.screenshot({ path: `${shots}/space-universe.png` });

const project = (pos) => page.evaluate((p) => {
  const g = window.game;
  const THREE_V = g.solarSystem.camera.position.constructor;
  const v = new THREE_V(p.x, p.y, p.z).project(g.solarSystem.camera);
  return { x: (v.x + 1) / 2 * window.innerWidth, y: (1 - v.y) / 2 * window.innerHeight };
}, pos);

const target = await page.evaluate(() => {
  const d = window.game.universe.defs[2];
  return { x: d.position.x, y: d.position.y, z: d.position.z, name: d.name };
});
const at = await project(target);
await page.mouse.click(at.x, at.y);
await wait(1800);
const afterClick = await page.evaluate(() => ({ view: window.game.currentView, galaxy: window.game.universe.activeIndex, name: window.game.galaxy.name }));
check(afterClick.view === 'GALAXY' && afterClick.galaxy === 2, `clicking a galaxy flies there (${afterClick.name})`);
if (shots) await page.screenshot({ path: `${shots}/space-galaxy.png` });

// ---- galaxy view: click a star system ----
const sysTarget = await page.evaluate(() => {
  const g = window.game;
  const s = g.galaxy.systems[4];
  return { x: s.galaxyPosition.x, y: s.galaxyPosition.y, z: s.galaxyPosition.z, id: s.id, name: s.name };
});
const sysAt = await project(sysTarget);
await page.mouse.click(sysAt.x, sysAt.y);
await wait(1800);
const inSystem = await page.evaluate(() => ({ view: window.game.currentView, system: window.game.galaxy.activeSystemId }));
check(inSystem.view === 'SYSTEM' && inSystem.system === sysTarget.id, `clicking a star system enters it (${sysTarget.name})`);
check(await page.evaluate(() => window.game.solarSystem.planets.every(p => p.id.startsWith('g2_'))), 'its planets belong to galaxy 2');

// ---- travel from this galaxy to another one ----
await page.select('#galaxy-select', '4');
await wait(600);
const other = await page.evaluate(() => ({ view: window.game.currentView, galaxy: window.game.universe.activeIndex, name: window.game.galaxy.name }));
check(other.galaxy === 4 && other.view === 'GALAXY', `the galaxy picker travels from galaxy 2 to galaxy 4 (${other.name})`);

// ---- breadcrumb and keyboard ----
const crumbs = await page.evaluate(() => [...document.querySelectorAll('#breadcrumb .crumb')].map(b => b.textContent));
check(crumbs[0] === 'Universe' && crumbs[1] === other.name && crumbs.length >= 3, 'breadcrumb shows the path', JSON.stringify(crumbs));
await page.keyboard.press('Backspace');
await wait(300);
check(await page.evaluate(() => window.game.currentView === 'UNIVERSE'), 'Backspace goes up one level');
await page.keyboard.press('3');
await wait(300);
check(await page.evaluate(() => window.game.currentView === 'SYSTEM'), 'key 3 opens the system view');
await page.click('#breadcrumb .crumb');
await wait(300);
check(await page.evaluate(() => window.game.currentView === 'UNIVERSE'), 'clicking "Universe" in the breadcrumb goes there');

// ---- the home galaxy still has its original ids ----
await page.select('#galaxy-select', '0');
await wait(400);
check(await page.evaluate(() => window.game.galaxy.systems[0].id === 'sys_0'), 'home galaxy keeps its original ids');

// ---- save and load in another galaxy ----
const savedState = await page.evaluate(() => {
  const g = window.game;
  g.enterGalaxy(3);
  const sys = g.galaxy.systems.find(s => s.planets.some(p => p.isPopulated)) || g.galaxy.systems[0];
  g.enterSystem(sys.id);
  g.timeSpeed = 0;
  g.saveGame();
  return { planet: g.activeSim.planet.id, galaxy: g.universe.activeIndex };
});
await page.reload({ waitUntil: 'load' });
await wait(1200);
await page.click('#btn-continue-save');
await page.evaluate(() => { window.game.timeSpeed = 0; });
await wait(500);
const loaded = await page.evaluate(() => ({ planet: window.game.activeSim.planet.id, galaxy: window.game.universe.activeIndex, view: window.game.currentView }));
check(loaded.galaxy === savedState.galaxy && loaded.planet === savedState.planet, 'loading restores the galaxy and planet', `(${loaded.planet})`);
check(loaded.planet.startsWith('g3_'), 'the loaded planet is in galaxy 3');

await page.evaluate(() => { window.game.autosaveEnabled = false; localStorage.clear(); });
await browser.close();
console.log(errors.length ? `ERRORS:\n${errors.join('\n')}` : 'No console errors.');
const failed = results.filter(r => !r).length + (errors.length ? 1 : 0);
console.log(failed ? `${failed} check(s) FAILED` : 'ALL SPACE CHECKS PASSED');
process.exit(failed ? 1 : 0);
