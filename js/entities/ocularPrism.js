// ocularPrism.js
// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

import { CONFIG } from '../utils/config.js';
import { ImageLoader } from '../utils/imageLoader.js';

const WARP_PRESETS = [
  { hue:  120, scale: 0.88, flipX: false, flipY: false }, // GREEN = SLOW
  { hue:  240, scale: 1.18, flipX: false, flipY: false }, //  BLUE = FAST
  { hue:    0, scale: 1.00, flipX: true,  flipY: false }, // RED = MIRROR X
  { hue:  300, scale: 1.00, flipX: false, flipY: true  }, // PURPLE = MIRROR Y
  { hue:   60, scale: 0.92, flipX: true,  flipY: true  }, // YELLOW = DOUBLE MIRROR
];

export class OcularPrism {
  constructor() {
    this.active     = false;
    this.shards     = [];
    this.ichor      = [];
    this.fadeAlpha  = 1;
    this.fadingOut  = false;
    this.fadeTimer  = 0;
    this.duration   = 0;
    this.totalDur   = 0;
    this.defeated   = false;    

    this.pupil = {
      x: 0, y: 0,
      r: 0, pulsePhase: 0,
      health: 0, maxHealth: 0,
    };

    this.offscreen = document.createElement('canvas');
    this.offCtx    = this.offscreen.getContext('2d');

    this.onDefeated = null; 
    this.onExpired  = null; 
  }

  // ─── ACTIVATION ──────────────────────────────────────────────────────────
  activate(w, h) {
    const cfg         = CONFIG.OCULAR_PRISM;
    this.active       = true;
    this.fadingOut    = false;
    this.fadeAlpha    = 1;
    this.defeated     = false;
    this.duration     = cfg.DURATION;
    this.totalDur     = cfg.DURATION;

    this.offscreen.width  = w;
    this.offscreen.height = h;

    const cx = w / 2, cy = h / 2;

    this.pupil = {
      x: cx, y: cy, r: cfg.PUPIL_RADIUS,
      health: cfg.PUPIL_HEALTH, maxHealth: cfg.PUPIL_HEALTH,
      pulsePhase: 0,
    };

    const num = cfg.SHARD_MIN + Math.floor(Math.random() * (cfg.SHARD_MAX - cfg.SHARD_MIN + 1));
    this.shards = this._buildShards(num, cx, cy, w, h);
    this._seedIchor(w, h);

    ImageLoader.load('prismEye'); 
  }

  // ─── SHARD GEOMETRY ──────────────────────────────────────────────────────
  _buildShards(num, cx, cy, w, h) {
    const R = Math.hypot(w, h); 
    const sliceAngle = (Math.PI * 2) / num;

    const cuts = [];
    for (let i = 0; i < num; i++) {
      const base   = i * sliceAngle;
      const jitter = (Math.random() - 0.5) * sliceAngle * 0.55;
      cuts.push(base + jitter);
    }
    cuts.sort((a, b) => a - b);

    return cuts.map((a1, i) => {
      const a2 = cuts[(i + 1) % num];

      const poly = [[cx, cy]]; // START AT CENTER
      const steps = 5;         //POINTS ALONG ARC EDGE
      for (let s = 0; s <= steps; s++) {
        const t    = s / steps;
        const span = ((a2 - a1) + Math.PI * 2) % (Math.PI * 2); // LINEAR ANGLE LERPING - HANDLING WRAPAROUND FOR LAST SHARD
        const a    = a1 + span * t;
        const r    = R + (Math.random() - 0.5) * 60; // EDGE JITTER
        poly.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
      }

      const warp = { ...WARP_PRESETS[i % WARP_PRESETS.length] };

      const edgePoints = [];
      for (let s = 0; s <= steps; s++) {
        const t    = s / steps;
        const span = ((a2 - a1) + Math.PI * 2) % (Math.PI * 2);
        const a    = a1 + span * t;
        const r    = Math.min(R * 0.85, 200 + Math.random() * 200);
        edgePoints.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
      }

      return {
        poly,
        warp,
        edgePoints,
        glowPhase: Math.random() * Math.PI * 2,
      };
    });
  }

  // ─── ICHOR PARTICLES ─────────────────────────────────────────────────────
  _seedIchor(w, h) {
    this.ichor = [];
    const cfg = CONFIG.OCULAR_PRISM;
    for (const shard of this.shards) {
      const perEdge = Math.ceil(cfg.ICHOR_COUNT / this.shards.length);
      for (let i = 0; i < perEdge; i++) {
        const [ex, ey] = shard.edgePoints[Math.floor(Math.random() * shard.edgePoints.length)];
        const hue = (shard.warp.hue + 160 + Math.random() * 40) % 360; // COMPLEMENTARY BLEED
        this.ichor.push({
          x:    ex + (Math.random() - 0.5) * 30,
          y:    ey + (Math.random() - 0.5) * 30,
          vx:   (Math.random() - 0.5) * 1.2,
          vy:   0.6 + Math.random() * 2.2,
          life: 0.5 + Math.random() * 0.5,
          color:`hsl(${hue},100%,55%)`,
          size: 2 + Math.random() * 3.5,
        });
      }
    }
  }

  // ─── CAPTURE ─────────────────────────────────────────────────────────────
  captureFrame(tunnelCanvas, gameCanvas) {
    if (!this.active) return;
    const w = gameCanvas.width, h = gameCanvas.height;
    if (this.offscreen.width !== w || this.offscreen.height !== h) {
      this.offscreen.width = w; this.offscreen.height = h;
    }
    this.offCtx.drawImage(tunnelCanvas, 0, 0, w, h);
    this.offCtx.drawImage(gameCanvas, 0, 0);
  }

  // ─── UPDATE ──────────────────────────────────────────────────────────────
  update(dt) {
    if (!this.active) return;
    this.pupil.pulsePhase += dt * 4.5;

    for (let i = this.ichor.length - 1; i >= 0; i--) { //  ICHOR DRIP PYSICS
      const p  = this.ichor[i];
      p.x     += p.vx;
      p.y     += p.vy;
      p.vy    += 0.09; // GRAVITY
      p.life  -= dt * 0.12;
      if (p.life <= 0) this.ichor.splice(i, 1);
    }

    if (this.fadingOut) {
      this.fadeTimer -= dt;
      this.fadeAlpha  = Math.max(0, this.fadeTimer / CONFIG.OCULAR_PRISM.FADE_DURATION);
      if (this.fadeTimer <= 0) this.active = false;
      return;
    }

    this.duration -= dt;
    if (this.duration <= 0) {
      this._beginFade();
      this.onExpired?.();
    }
  }

  _beginFade() {
    this.fadingOut = true;
    this.fadeTimer = CONFIG.OCULAR_PRISM.FADE_DURATION;
  }

  // ─── PROJECTILE HIT CHECK ────────────────────────────────────────────────
  checkProjectileHit(px, py) {
    if (!this.active || this.fadingOut) return false;
    const dx = px - this.pupil.x, dy = py - this.pupil.y;
    const r  = this.pupil.r + Math.sin(this.pupil.pulsePhase) * 8;
    if (dx * dx + dy * dy < r * r) {
      this.pupil.health--;
      if (this.pupil.health <= 0) {
        this.defeated = true;
        this._beginFade();
        this.onDefeated?.();
      }
      return true;
    }
    return false;
  }

  // ─── RENDER ──────────────────────────────────────────────────────────────
  render(ctx) {
    if (!this.active) return;
    const w = ctx.canvas.width, h = ctx.canvas.height;
    const cx = w / 2, cy = h / 2;

    ctx.save();
    ctx.globalAlpha = this.fadeAlpha;

    // ── 1. DRAW EACH SHARD ──────────────────────────────────────────────────
    for (const shard of this.shards) {
      ctx.save();

      ctx.beginPath();
      shard.poly.forEach(([px, py], j) =>
        j === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py));
      ctx.closePath();
      ctx.clip();

      const { scale, flipX, flipY, hue } = shard.warp;
      ctx.translate(cx, cy);
      ctx.scale(flipX ? -scale : scale, flipY ? -scale : scale);
      ctx.translate(-cx, -cy);
      ctx.filter = `hue-rotate(${hue}deg) saturate(1.7) contrast(1.15)`;
      ctx.drawImage(this.offscreen, 0, 0);
      ctx.filter = 'none';

      ctx.restore(); // REMOVED CLIP + TRANSFORM

      shard.glowPhase += 0.025;
      const brightness = 55 + Math.sin(shard.glowPhase) * 30; // PULSING
      ctx.save();
      ctx.beginPath();
      shard.poly.forEach(([px, py], j) =>
        j === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py));
      ctx.closePath();
      ctx.shadowColor = `hsl(${hue},100%,${brightness}%)`;
      ctx.shadowBlur  = 22;
      ctx.strokeStyle = `hsl(${hue + 25},100%,72%)`;
      ctx.lineWidth   = 2.5;
      ctx.globalAlpha = this.fadeAlpha * 0.9;
      ctx.stroke();
      ctx.restore();
    }

    // ── 2. ICHOR DRIPS - BLEEDING FROM SHARD EDGES  ──────────────────────────
    ctx.save();
    for (const p of this.ichor) {
      ctx.globalAlpha = p.life * this.fadeAlpha * 0.85;
      ctx.fillStyle   = p.color;
      ctx.fillRect(p.x, p.y, p.size, p.size * 2.8); 
    }
    ctx.restore();

    this._drawPupil(ctx, cx, cy);

    ctx.restore(); 
  }

  // ─── PUPIL ───────────────────────────────────────────────────────────────
  _drawPupil(ctx, cx, cy) {
    const p      = this.pupil;
    const pulse  = Math.sin(p.pulsePhase) * 8;
    const r      = p.r + pulse;
    const anger  = 1 - p.health / p.maxHealth; // 0 = FULL HEALTH, 1 = LAST HIT
    const sprite = ImageLoader.isLoaded('prismEye') ? ImageLoader.get('prismEye') : null;

    // PUPIL ROAM - SINE BASED LOOK AROUND 
    const roamX  = Math.sin(p.pulsePhase * 0.7) * (r * 0.22);
    const roamY  = Math.cos(p.pulsePhase * 0.5) * (r * 0.12);

    // USES PUPIL_RADIUS ==TO SCALE NATURALLY
    const eyeSize = (p.r + 8) * 3.2;
    const half    = eyeSize / 2;

    ctx.save();

    if (sprite) {
      const fw = sprite.width / 3;   
      const fh = sprite.height;

      // ── FRAME 0: BASE ──
      ctx.save();
      ctx.shadowColor = `hsl(${320 - anger * 30}, 100%, 50%)`;
      ctx.shadowBlur  = 22 + anger * 28 + pulse;
      ctx.globalAlpha = this.fadeAlpha;
      ctx.drawImage(sprite, 0, 0, fw, fh, cx - half, cy - half, eyeSize, eyeSize);
      ctx.restore();

      // ── FRAME 1 - PUPIL ──
      ctx.save();
      ctx.globalAlpha = this.fadeAlpha;
      ctx.drawImage(sprite, fw, 0, fw, fh,
        cx - half + roamX, cy - half + roamY,
        eyeSize, eyeSize);
      ctx.restore();

      ctx.save();
      ctx.globalAlpha = this.fadeAlpha;
      ctx.drawImage(sprite, fw * 2, 0, fw, fh, cx - half, cy - half, eyeSize, eyeSize);
      ctx.restore();

    } else {
      // ── FALLBACK──
      ctx.shadowColor = `hsl(${320 - anger * 30}, 100%, 50%)`;
      ctx.shadowBlur  = 28 + anger * 25 + pulse * 1.5;
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      grad.addColorStop(0,    'rgba(255,255,255,0.98)');
      grad.addColorStop(0.20, `hsl(${340 - anger * 20}, 90%, 65%)`);
      grad.addColorStop(0.55, `hsl(${10  - anger * 10},100%, 30%)`);
      grad.addColorStop(1,    'rgba(0,0,0,0.7)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();

      const irisX = cx + roamX;
      const irisY = cy + roamY;
      ctx.shadowBlur = 0;
      ctx.fillStyle  = '#120020';
      ctx.beginPath();
      ctx.arc(irisX, irisY, r * 0.44, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#000000';
      ctx.beginPath();
      ctx.ellipse(irisX, irisY, r * 0.11, r * 0.36, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.beginPath();
      ctx.ellipse(irisX - r * 0.15, irisY - r * 0.18, r * 0.08, r * 0.05, -0.4, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();

    // ── HP PIPS —  ──
    if (p.maxHealth > 1) {
      const pipW = 14, pipH = 6, pipGap = 6;
      const total  = p.maxHealth * pipW + (p.maxHealth - 1) * pipGap;
      const startX = cx - total / 2;
      const pipY   = cy + half + pulse + 10;
      ctx.save();
      ctx.globalAlpha = this.fadeAlpha * 0.92;
      for (let i = 0; i < p.maxHealth; i++) {
        const active = i < p.health;
        ctx.fillStyle   = active ? '#ff2266' : '#220011';
        ctx.shadowColor = active ? '#ff2266' : 'transparent';
        ctx.shadowBlur  = active ? 8 : 0;
        ctx.fillRect(startX + i * (pipW + pipGap), pipY, pipW, pipH);
      }
      ctx.restore();
    }
  }
}