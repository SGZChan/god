import * as THREE from 'three';

// Camera-facing text label for the 3D space views. Returns null when there is no DOM (unit tests).
export function makeLabelSprite(text, { color = '#e2e8f0', width = 120 } = {}) {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 96;
  const ctx = canvas.getContext('2d');
  ctx.font = '600 44px Outfit, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
  ctx.shadowBlur = 10;
  ctx.fillStyle = color;
  ctx.fillText(text, 256, 48);

  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(width, width * (96 / 512), 1);
  sprite.renderOrder = 10;
  return sprite;
}

// An invisible sphere used as a click target for raycasting.
export function makePickSphere(radius) {
  const material = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
  return new THREE.Mesh(new THREE.SphereGeometry(radius, 12, 12), material);
}
