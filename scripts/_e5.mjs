import { edit } from './_ed.mjs';
edit('src/civilization/townPlanner.js', [
[`  if (tier >= 0 && have('lumber_camp')`, `  if (have('lumber_camp')`],
[`  if (tier >= 1) {
    if (have('granary')`, `  {
    if (have('granary')`],
[`  if (tier >= 2) {
    if (have('market') < 1 && pop >= 8) want('market', 2);`, `  {
    if (have('market') < 1 && pop >= 8) want('market', 2);`],
[`  if (tier >= 3) {
    if (have('library')`, `  {
    if (have('library')`],
[`  if (tier >= 4) {
    if (have('factory')`, `  {
    if (have('factory')`],
[`  if (tier >= 5 && st.capital && have('spaceport')`, `  if (st.capital && have('spaceport')`],
[`      if (isDiscovered(civ, res) && have('mine') < Math.min(4, 1 + Math.floor(pop / 25)) && pop >= 8 && (!k || tier >= 2)) {`, `      if (isDiscovered(civ, res) && have('mine') < Math.min(4, 1 + Math.floor(pop / 25)) && pop >= 8 && k) {`],
]);
