// Updated 3/11/26 @ 1AM
// glitchFleshAssembly.js

import { ImageLoader, ENEMY_SPRITE } from '../utils/imageLoader.js';
import { CONFIG }                    from '../utils/config.js';

// ── TIER DEFINITIONS ──────────────────────────────────────────────────────────
const TIER_B_TYPES = new Set(['TANK', 'ZIGZAG', 'FLIMFLAM']);

const T_B = {
  TEAR_END:  0.30,
  BURST_END: 0.80,
  WIRE_END:  1.40,
  FLESH_END: 1.80,
  DONE:      2.00,
};

const T_A = {
  TEAR_END:  0.30,
  BURST_END: 0.70,
  DONE:      1.20,
};

// ── SPRITE TARGET CACHE ───────────────────────────────────────────────────────
const _targetCache = {};

function _buildTargets(enemyType) {
  const spriteKey  = ENEMY_SPRITE[enemyType];
  const typeCfg    = CONFIG.ENEMIES.TYPES[enemyType];
  const frameCount = typeCfg.SPRITE_FRAMES;
  const img        = ImageLoader.get(spriteKey);
  if (!img) return [];

  const fw  = Math.floor(img.width / frameCount);
  const fh  = img.height;

  const oc  = document.createElement('canvas');
  oc.width  = fw;
  oc.height = fh;
  const oc2 = oc.getContext('2d');

  // USE BODY_FRAME IF DEFINED (OCTOPUS TYPES) — ELSE USE MIDPOINT HEURISTIC
  const keyFrame = typeCfg.BODY_FRAME ?? Math.floor(frameCount / 2);
  oc2.drawImage(img, keyFrame * fw, 0, fw, fh, 0, 0, fw, fh);

  const { data } = oc2.getImageData(0, 0, fw, fh);
  const targets  = [];
  const DENSITY  = 4; 

  for (let y = 0; y < fh; y += DENSITY) {
    for (let x = 0; x < fw; x += DENSITY) {
      if (data[(y * fw + x) * 4 + 3] > 100) {
        targets.push({
          x: (x / fw) - 0.5,   
          y: (y / fh) - 0.5,
        });
      }
    }
  }

  return targets;
}

function _getTargets(enemyType) {
  if (!_targetCache[enemyType]) {
    _targetCache[enemyType] = _buildTargets(enemyType);
  }
  return _targetCache[enemyType];
}

// ── SPAWN PARTICLE ────────────────────────────────────────────────────────────
class SpawnParticle {
  constructor(cx, cy, vfxSize, targetNorm, glowColor) {
    const a     = Math.random() * Math.PI * 2;
    const r     = vfxSize * (0.2 + Math.random() * 0.5);
    this.x      = cx + Math.cos(a) * r;
    this.y      = cy + Math.sin(a) * r;
    this.vx     = (Math.random() - 0.5) * 160;
    this.vy     = (Math.random() - 0.5) * 160;
    this.swirl  = Math.random() * Math.PI * 2;

    this.tx = cx + targetNorm.x * vfxSize * 1.5;
    this.ty = cy + targetNorm.y * vfxSize * 1.5;

    this.glowColor = glowColor;
    this.radius    = 1.2 + Math.random() * 1.8;
    this.alpha     = 0.65 + Math.random() * 0.35;
    this.isCyan    = true; 
  }

  update(dt, phase) {
    this.swirl += 4.0 * dt;
    const DAMP = Math.pow(0.88, dt * 60); 

    if (phase === 1) {
      this.x  += this.vx * dt;
      this.y  += this.vy * dt;
      this.vx *= Math.pow(0.90, dt * 60);
      this.vy *= Math.pow(0.90, dt * 60);
    } else {
      const pull = phase === 2 ? 3.5 : 9.0;
      this.vx += (this.tx - this.x) * pull * dt;
      this.vy += (this.ty - this.y) * pull * dt;
      this.vx += Math.cos(this.swirl) * 22 * dt;
      this.vy += Math.sin(this.swirl) * 22 * dt;
      this.vx *= DAMP;
      this.vy *= DAMP;
      this.x  += this.vx * dt;
      this.y  += this.vy * dt;
    }
  }
}

// ── MAIN CLASS ────────────────────────────────────────────────────────────────
export class GlitchFleshAssembly {
  /**
   * @param {import('../entities/enemies.js').Enemy} enemy
   */
  constructor(enemy) {
    this.enemy  = enemy;
    this.isDone = false;
    this.t      = 0;

    this.isB     = TIER_B_TYPES.has(enemy.type);
    this.timings = this.isB ? T_B : T_A;
    this.targetParticleCount = this.isB ? 50 : 28;

    this.tearAlpha      = 0;
    this.tearRadius     = 0;

    this.particles      = null;    
    this._ready         = false;   // TRUE ONCE PARTICLES INITIALIZE 
    this._wfPairs       = null;    // PRECOMPUTED WIREFRAME
    this._vfxSize       = 50;      // PIXEL RADIUS
    this._cx            = 0;       // ENEMY CENTER
    this._cy            = 0;

    this.shockRadius    = 0;
    this.shockAlpha     = 0;

    this.pulseT         = 0;
    this.pulseAlpha     = 0;
    this._pulseFired    = false;
  }

  // ── INIT ───────────────────────────────────────────────────────────────────
  _initParticles() {
    if (this._ready) return;

    const targets = _getTargets(this.enemy.type);
    if (!targets.length) {
      return;
    }

    const e         = this.enemy;
    this._cx        = e.x;
    this._cy        = e.y;
    this._vfxSize   = Math.max(48, e.config.SIZE * e.scale);

    const glowColor = e.glowColor;

    const shuffled  = targets.slice().sort(() => Math.random() - 0.5);
    const count     = Math.min(this.targetParticleCount, shuffled.length);

    this.particles = [];
    for (let i = 0; i < count; i++) {
      this.particles.push(
        new SpawnParticle(this._cx, this._cy, this._vfxSize, shuffled[i], glowColor)
      );
    }

    if (this.isB) {
      this._wfPairs = [];
      const maxD2 = (this._vfxSize * 0.22) ** 2;
      for (let i = 0; i < this.particles.length; i++) {
        for (let j = i + 1; j < this.particles.length; j++) {
          const dx = this.particles[i].tx - this.particles[j].tx;
          const dy = this.particles[i].ty - this.particles[j].ty;
          if (dx * dx + dy * dy < maxD2) {
            this._wfPairs.push(i, j); 
          }
        }
      }
    }

    this._ready = true;
  }

  // ── UPDATE ─────────────────────────────────────────────────────────────────
  update(dt) {
    if (this.isDone) return;
    this.t += dt;

    const T = this.timings;

    if (!this._ready && this.t > 0.04) this._initParticles();

    // ── TEAR ──
    if (this.t < T.TEAR_END) {
      const p         = this.t / T.TEAR_END;
      this.tearAlpha  = p < 0.5 ? p * 2 : 2 - p * 2;
      this.tearRadius = p * this._vfxSize * 0.65;
    } else {
      this.tearAlpha  = 0;
    }

    // ── PARTICLES ──
    if (this._ready) {
      const phase = this._phase();
      for (const p of this.particles) p.update(dt, phase);

      if (this.isB && phase === 3) {
        const t = (this.t - T.WIRE_END) / (T.FLESH_END - T.WIRE_END);
        for (const p of this.particles) p.isCyan = t < 0.5;
      }

      const pulseThreshold = this.isB ? T.FLESH_END : T.BURST_END;
      if (!this._pulseFired && this.t >= pulseThreshold) this._firePulse();
    }

    // ── SILHOUETTE PULSE ──
    if (this._pulseFired) {
      this.pulseT     += dt * 2.0;
      this.pulseAlpha  = Math.max(0, 1 - this.pulseT);
      this.shockRadius += 290 * dt;
      this.shockAlpha  = Math.max(0, this.shockAlpha - 2.2 * dt);

      if (this.pulseAlpha <= 0 && this.shockAlpha <= 0) this.isDone = true;
    }
  }

  _firePulse() {
    this._pulseFired = true;
    this.pulseT      = 0;
    this.pulseAlpha  = 1;
    this.shockRadius = this._vfxSize * 0.4;
    this.shockAlpha  = 1;
  }

  // RETURNS 1-4 (1=BURST, 2=WIREFRAME, 3=FLESH, 4=PULSE) BASED ON CURRENT TIME
  _phase() {
    const T = this.timings;
    if (!this.isB) return this.t < T.BURST_END ? 1 : 2;
    if (this.t < T.BURST_END) return 1;
    if (this.t < T.WIRE_END)  return 2;
    if (this.t < T.FLESH_END) return 3;
    return 4;
  }

  // ── DRAW ───────────────────────────────────────────────────────────────────
  draw(ctx) {
    if (this.isDone) return;

    const e    = this.enemy;
    const T    = this.timings;
    const cx   = this._ready ? this._cx : e.x;
    const cy   = this._ready ? this._cy : e.y;
    const size = this._vfxSize;

    ctx.save();

    // ── 1. WORMHOLE TEAR ──────────────────────────────────────────────────────
    if (this.tearAlpha > 0.01) {
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, this.tearRadius);
      grad.addColorStop(0,   `rgba(160, 0, 255, ${(this.tearAlpha * 0.65).toFixed(2)})`);
      grad.addColorStop(0.5, `rgba(0, 220, 255, ${(this.tearAlpha * 0.35).toFixed(2)})`);
      grad.addColorStop(1,   'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(cx, cy, this.tearRadius * 0.55, this.tearRadius, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // ── 2. WIREFRAME LINES ─────────────────────────────
    if (this.isB && this._ready && this._wfPairs && this._phase() === 2) {
      const wfT      = (this.t - T.BURST_END) / (T.WIRE_END - T.BURST_END);
      const lineAlpha = Math.min(1, wfT * 2.5) * (1 - wfT * 0.45) * 0.55;

      if (lineAlpha > 0.01 && this._wfPairs.length > 0) {
        ctx.save();
        ctx.globalAlpha = lineAlpha;
        ctx.strokeStyle = '#00ffff';
        ctx.shadowColor = '#00ffff';
        ctx.shadowBlur  = 5;
        ctx.lineWidth   = 0.75;
        ctx.beginPath();
        for (let k = 0; k < this._wfPairs.length; k += 2) {
          const pi = this.particles[this._wfPairs[k]];
          const pj = this.particles[this._wfPairs[k + 1]];
          ctx.moveTo(pi.x, pi.y);
          ctx.lineTo(pj.x, pj.y);
        }
        ctx.stroke();
        ctx.restore();
      }
    }

    // ── 3. PARTICLES ─────────────────────────────────────────────────────────
    if (this._ready && this.particles) {
      const phase      = this._phase();
      const fadeOut    = this._pulseFired ? Math.max(0, 1 - this.pulseT * 2.5) : 1;

      if (fadeOut > 0.01) {
        for (const p of this.particles) {
          const a = p.alpha * fadeOut;
          if (a < 0.01) continue;

          ctx.save();
          ctx.globalAlpha = a;
          ctx.fillStyle   = p.isCyan ? '#00ffff' : p.glowColor;
          ctx.shadowColor = ctx.fillStyle;
          ctx.shadowBlur  = 7;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }
    }

    // ── 4. GHOST SPRITE  ──────────
    if (this.isB && this._ready && this.t > T.WIRE_END && !this._pulseFired) {
      const sprite = ImageLoader.get(ENEMY_SPRITE[e.type]);
      if (sprite) {
        const ghostT      = Math.min(1, (this.t - T.WIRE_END) / (T.FLESH_END - T.WIRE_END));
        const ghostAlpha  = ghostT * 0.45;
        const renderSize  = e.config.SIZE * e.scale;
        const fw          = sprite.width / e.animCount;
        const frame       = this._getFrameIndex();

        ctx.save();
        ctx.globalAlpha = ghostAlpha;
        ctx.shadowColor = e.glowColor;
        ctx.shadowBlur  = 12;
        ctx.drawImage(
          sprite,
          frame * fw, 0, fw, sprite.height,
          cx - renderSize / 2, cy - renderSize / 2, renderSize, renderSize
        );
        ctx.restore();
      }
    }

    // ── 5. SILHOUETTE PULSE ───────────────────────────────────────────────────
    if (this._pulseFired && this.pulseAlpha > 0.01) {
      const sprite = ImageLoader.get(ENEMY_SPRITE[e.type]);
      if (sprite) {
        const expand     = 1 + (1 - this.pulseAlpha) * 0.38;
        const renderSize = e.config.SIZE * e.scale;
        const pulseSize  = renderSize * expand;
        const fw         = sprite.width / e.animCount;
        const frame      = this._getFrameIndex();

        ctx.save();
        ctx.globalAlpha = this.pulseAlpha * 0.9;
        ctx.shadowColor = e.glowColor;
        ctx.shadowBlur  = 25 + (1 - this.pulseAlpha) * 55;
        ctx.drawImage(
          sprite,
          frame * fw, 0, fw, sprite.height,
          cx - pulseSize / 2, cy - pulseSize / 2, pulseSize, pulseSize
        );
        ctx.restore();
      }
    }

    // ── 6. SHOCKWAVE RING ─────────────────────────────────────────────────────
    if (this.shockAlpha > 0.01) {
      ctx.save();
      ctx.globalAlpha = this.shockAlpha * 0.8;
      ctx.strokeStyle = e.glowColor;
      ctx.shadowColor = e.glowColor;
      ctx.shadowBlur  = 10;
      ctx.lineWidth   = 1.8;
      ctx.beginPath();
      ctx.arc(cx, cy, this.shockRadius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    ctx.restore();
  }

  _getFrameIndex() {
    const e = this.enemy;
    // USE BODY_FRAME IF DEFINED (ALL OCTOPUS TYPES) — ELSE USE CURRENT FRAME
    return e.config.BODY_FRAME ?? e.frameIndex ?? 0;
  }
}