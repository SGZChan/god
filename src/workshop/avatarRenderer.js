// Procedural 2D Canvas Avatar Renderer for Custom Beings and Champions

export class AvatarRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
  }

  render(appearance, gender = 'Female', isSpecial = true) {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.clearRect(0, 0, w, h);

    const cx = w / 2;
    const cy = h / 2;

    // 1. Divine Aura / Halo
    if (isSpecial) {
      const grad = ctx.createRadialGradient(cx, cy - 20, 20, cx, cy - 20, 75);
      grad.addColorStop(0, appearance.auraColor || 'rgba(255, 215, 0, 0.45)');
      grad.addColorStop(0.7, appearance.auraColor ? appearance.auraColor + '33' : 'rgba(255, 215, 0, 0.1)');
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy - 20, 75, 0, Math.PI * 2);
      ctx.fill();

      // Golden Halo ring
      ctx.strokeStyle = appearance.auraColor || '#ffd700';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(cx, cy - 65, 30, 8, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    // 2. Torso & Attire
    const bodyWidth = appearance.bodyType === 'heavy' ? 44 : (appearance.bodyType === 'slender' ? 28 : 36);

    // Attire styling
    let attireColor = '#3b82f6';
    if (appearance.attire === 'armor') attireColor = '#94a3b8';
    if (appearance.attire === 'robes') attireColor = '#8b5cf6';
    if (appearance.attire === 'scholar') attireColor = '#10b981';
    if (appearance.attire === 'tribal') attireColor = '#b45309';
    if (appearance.attire === 'celestial') attireColor = '#f59e0b';

    ctx.fillStyle = attireColor;
    ctx.beginPath();
    ctx.roundRect(cx - bodyWidth / 2, cy - 5, bodyWidth, 65, 8);
    ctx.fill();

    // Armor / Robe trim
    ctx.strokeStyle = '#fef08a';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Belt / Sash
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(cx - bodyWidth / 2, cy + 30, bodyWidth, 8);

    // 3. Neck
    ctx.fillStyle = appearance.skinColor || '#f3c192';
    ctx.fillRect(cx - 7, cy - 18, 14, 15);

    // 4. Head
    ctx.beginPath();
    ctx.arc(cx, cy - 32, 22, 0, Math.PI * 2);
    ctx.fill();

    // 5. Hair (Back layer for long hair)
    ctx.fillStyle = appearance.hairColor || '#3a2010';
    if (appearance.hairStyle === 'long') {
      ctx.beginPath();
      ctx.roundRect(cx - 26, cy - 35, 52, 60, [15, 15, 8, 8]);
      ctx.fill();
    }

    // Face features (Eyes, eyebrows, mouth)
    // Eyes
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(cx - 8, cy - 32, 4.5, 3, 0, 0, Math.PI * 2);
    ctx.ellipse(cx + 8, cy - 32, 4.5, 3, 0, 0, Math.PI * 2);
    ctx.fill();

    // Irises
    ctx.fillStyle = appearance.eyeColor || '#2563eb';
    ctx.beginPath();
    ctx.arc(cx - 8, cy - 32, 2.5, 0, Math.PI * 2);
    ctx.arc(cx + 8, cy - 32, 2.5, 0, Math.PI * 2);
    ctx.fill();

    // Eyebrows
    ctx.strokeStyle = appearance.hairColor || '#3a2010';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - 13, cy - 38);
    ctx.lineTo(cx - 4, cy - 37);
    ctx.moveTo(cx + 4, cy - 37);
    ctx.lineTo(cx + 13, cy - 38);
    ctx.stroke();

    // Smile / mouth
    ctx.strokeStyle = '#b91c1c';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy - 23, 5, 0.2, Math.PI - 0.2);
    ctx.stroke();

    // 6. Hair (Front layer)
    ctx.fillStyle = appearance.hairColor || '#3a2010';
    if (appearance.hairStyle === 'short') {
      ctx.beginPath();
      ctx.arc(cx, cy - 38, 24, Math.PI, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(cx - 24, cy - 40, 48, 14);
    } else if (appearance.hairStyle === 'braided') {
      ctx.beginPath();
      ctx.arc(cx, cy - 36, 24, Math.PI * 0.9, Math.PI * 2.1);
      ctx.fill();
      // Braids over shoulders
      ctx.fillRect(cx - 22, cy - 25, 8, 40);
      ctx.fillRect(cx + 14, cy - 25, 8, 40);
    } else if (appearance.hairStyle === 'crown') {
      // Royal crown
      ctx.fillStyle = '#ffd700';
      ctx.beginPath();
      ctx.moveTo(cx - 18, cy - 50);
      ctx.lineTo(cx - 9, cy - 42);
      ctx.lineTo(cx, cy - 55);
      ctx.lineTo(cx + 9, cy - 42);
      ctx.lineTo(cx + 18, cy - 50);
      ctx.lineTo(cx + 16, cy - 38);
      ctx.lineTo(cx - 16, cy - 38);
      ctx.closePath();
      ctx.fill();
    }
  }
}
