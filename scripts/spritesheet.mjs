// Screenshots the dev sprite sheet. Usage: node scripts/spritesheet.mjs <url> <out.png> [seed]
import puppeteer from 'puppeteer-core';

const base = process.argv[2] || 'http://localhost:5173';
const out = process.argv[3] || 'sprites.png';
const seed = process.argv[4] || 'sheet';
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1500, height: 1500 });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(`${base}/dev/${process.env.SHEET || 'sprites'}.html?seed=${seed}`, { waitUntil: 'load' });
await page.waitForFunction(() => document.title === 'ready', { timeout: 15000 });
await page.screenshot({ path: out, fullPage: true });
await browser.close();
console.log(errors.length ? errors.join('\n') : 'ok');
