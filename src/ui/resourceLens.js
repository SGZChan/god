// The Resources lens control (surface view): a toggle button (key R) and a legend of every resource marker.
import { RESOURCES, RESOURCE_TYPES, TIER_NAMES } from '../world/resources.js';
import { getResourceIcon } from '../art/resourceIcons.js';

export class ResourceLensPanel {
  constructor(root) {
    this.root = root;
    this.renderer = null;
    const rows = RESOURCE_TYPES.map(type => {
      const r = RESOURCES[type];
      return `<li title="${r.description} (${TIER_NAMES[r.tier]})"><img src="${getResourceIcon(type).toDataURL()}" alt=""><span>${r.name}</span></li>`;
    }).join('');
    root.innerHTML = `
      <button id="lens-toggle" class="lens-btn" aria-pressed="false" title="Show deposits of wood, stone, ores and more on the map (R)">
        <span class="lens-glyph" aria-hidden="true"></span><span>Resources</span><kbd>R</kbd>
      </button>
      <ul id="lens-legend" class="lens-legend hidden" aria-label="Resource legend">${rows}</ul>`;
    this.button = root.querySelector('#lens-toggle');
    this.legend = root.querySelector('#lens-legend');
    this.button.addEventListener('click', () => {
      if (this.renderer) this.renderer.setResourceLens(!this.renderer.showResources);
    });
  }

  setVisible(visible) {
    this.root.classList.toggle('hidden', !visible);
  }

  // Follows the renderer of the planet being viewed.
  setRenderer(renderer) {
    if (this.renderer) this.renderer.onLensChange = null;
    this.renderer = renderer;
    renderer.onLensChange = (on) => this.sync(on);
    this.sync(renderer.showResources);
  }

  sync(on) {
    this.button.classList.toggle('active', on);
    this.button.setAttribute('aria-pressed', String(on));
    this.legend.classList.toggle('hidden', !on);
  }
}
