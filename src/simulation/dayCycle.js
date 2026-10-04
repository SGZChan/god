// Day and night. A day lasts DAY_SECONDS simulated seconds (one simulated year is 4 seconds, so a "day" is a compressed
// rhythm rather than a calendar day). People sleep at night and work by day (life/entity.js, civilization/jobs.js);
// the surface darkens at night and windows and hearths glow (planet/surfaceRenderer.js).
export const DAY_SECONDS = 24;
export const NIGHT_START = 0.83; // fraction of the day when night falls
export const NIGHT_END = 0.17;   // ... and when the sun rises (a third of the day is night)

// 0..1 through the current day (0 = midnight, 0.5 = noon), from the ecosystem's clock in years
export function timeOfDay(timeYears) {
  const s = (timeYears || 0) * 4;
  return ((s / DAY_SECONDS) % 1 + 1) % 1;
}

export function isNight(t) {
  return t >= NIGHT_START || t < NIGHT_END;
}

// 0 at midnight .. 1 in the bright middle of the day, with soft dawns and dusks
export function daylight(t) {
  const sun = Math.sin((t - 0.25) * Math.PI * 2); // -1 midnight, +1 noon
  return Math.max(0, Math.min(1, (sun + 0.35) / 0.8));
}

export function dayNumber(timeYears) {
  return Math.floor(((timeYears || 0) * 4) / DAY_SECONDS) + 1;
}

export function partOfDay(t) {
  if (t < NIGHT_END) return 'Night';
  if (t < 0.3) return 'Dawn';
  if (t < 0.45) return 'Morning';
  if (t < 0.58) return 'Noon';
  if (t < 0.7) return 'Afternoon';
  if (t < NIGHT_START) return 'Dusk';
  return 'Night';
}
