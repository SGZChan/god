import { edit } from './_ed.mjs';
edit('scripts/soak_society.mjs', [
[`import { BUILDING_TYPES } from '../src/world/buildings.js';
`, `import { BUILDING_TYPES } from '../src/world/buildings.js';
import { Entity } from '../src/life/entity.js';

// count how sapients die
const deaths = {};
const originalDie = Entity.prototype.die;
Entity.prototype.die = function (cause = 'Unknown') {
  const was = this.alive;
  originalDie.call(this, cause);
  if (was && !this.alive && this.isSapient) {
    const key = cause.replace(/Killed in War.*/, 'War').replace(/Hunted by .*/, 'Hunted').replace(/Executed.*/, 'Executed');
    deaths[key] = (deaths[key] || 0) + 1;
  }
};
`],
[`  const animals = ecosystem`, `  console.log('  sapient deaths so far: ' + JSON.stringify(deaths));
  const animals = ecosystem`],
]);
