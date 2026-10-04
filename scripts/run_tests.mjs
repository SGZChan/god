// Runs every test file named in package.json's "test" script (even after a failure) and prints the failing checks.
// Usage: node scripts/run_tests.mjs [filter]
import { spawnSync } from 'child_process';
import fs from 'fs';

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const files = [...pkg.scripts.test.matchAll(/node (tests\/[\w.]+\.js)/g)].map(m => m[1]);
const filter = process.argv[2];
let failedFiles = 0;
let totalPassed = 0;
let totalFailed = 0;
for (const file of files) {
  if (filter && !file.includes(filter)) continue;
  const r = spawnSync(process.execPath, [file], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const out = (r.stdout || '') + (r.stderr || '');
  const m = out.match(/TOTAL TESTS: (\d+) \| PASSED: (\d+) \| FAILED: (\d+)/);
  const fails = out.split('\n').filter(l => /FAIL/.test(l) && !/TOTAL/.test(l));
  if (m) { totalPassed += Number(m[2]); totalFailed += Number(m[3]); }
  const ok = r.status === 0 && m && Number(m[3]) === 0;
  if (!ok) failedFiles++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${file} ${m ? `${m[2]}/${m[1]}` : '(no summary)'}`);
  if (!ok) {
    for (const l of fails.slice(0, 12)) console.log('     ' + l.trim());
    if (!m) console.log(out.split('\n').slice(-12).join('\n'));
  }
}
console.log(`\n${files.length} files, ${totalPassed} passed, ${totalFailed} failed checks, ${failedFiles} failing files`);
process.exit(failedFiles ? 1 : 0);
