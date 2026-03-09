// Updated 3/9/26 12PM
// enemyDeath.js  —
// ~~~~~~~~~~~~~~~~~~~~ IMPORTS ~~~~~~~~~~~~~~~~~~~~
import { CONFIG }      from '../utils/config.js';
import { ImageLoader } from '../utils/imageLoader.js';

// ── CONSTANTS ────────────────────────────────────────────────────────────────
const SLICES          = 10;    // HORIZONTAL STRIPS FOR MELT DISTORTION
const SAMPLE_STEP     = 4;     // px  STEP WHEN SAMPLING DRIP COLORS (64X64 CANVAS)
const SAMPLE_SIZE     = 64;    //  OFFSCREEN CANVAS SIZE FOR COLOR SAMPLING
const MAX_DRIPS_EFFECT = 35;   //  DRIP CAP PER INDIVIDUAL DEATH
const MAX_DRIPS_TOTAL  = 150;  //  GLOBAL BUDGET ACCROSS ALL CURRENT DEATHS 
const POOL_MAX         = 300;  //  RECYCLED DRIP OBJECTS

// ── DRIP PARTICLE POOL ────────────────────────────────────────────────────────
const _pool = [];

function _getDrip() {
  return _pool.length ? _pool.pop() : {};
}
function _recycleDrip(d) {
  if (_pool.length < POOL_MAX) _pool.push(d);
}

// ── PIXEL COLOR CACHE ────
const _colorCache = new Map(); // type -> [{rx, ry, r, g, b}, ...]

function _getColorSamples(type, sprite, frameIndex, animCount) {
  if (_colorCache.has(type)) return _colorCache.get(type);

  const fw  = sprite.width / animCount;
  const fh  = sprite.height;
  const sx  = frameIndex * fw;

  const off = document.createElement('canvas');
  off.width  = SAMPLE_SIZE;
  off.height = SAMPLE_SIZE;
  const octx = off.getContext('2d');
  octx.drawImage(sprite, sx, 0, fw, fh, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);

  const data   = octx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE).data;
  const result = [];

  for (let y = 0; y < SAMPLE_SIZE; y += SAMPLE_STEP) {
    for (let x = 0; x < SAMPLE_SIZE; x += SAMPLE_STEP) {
      const i = (y * SAMPLE_SIZE + x) * 4;
      if (data[i + 3] > 100) {
        result.push({
          rx: (x / SAMPLE_SIZE) - 0.5,   // NORMALIZED OFFSET FROM CENTER 
          ry: (y / SAMPLE_SIZE) - 0.5,
          r:  data[i],
          g:  data[i + 1],
          b:  data[i + 2],
        });
      }
    }
  }

  _colorCache.set(type, result);
  return result;
}

// ── SINGLE DEATH EFFECT ───────────────────────────────────────────────────────
class EnemyDeathEffect {
  constructor(x, y, scale, type, spriteKey, frameIndex, animCount, spriteSize) {
    this.x          = x;
    this.y          = y;
    this.scale      = scale;
    this.type       = type;
    this.spriteKey  = spriteKey;
    this.frameIndex = frameIndex;
    this.animCount  = animCount;
    this.spriteSize = spriteSize;
    this.timer      = 0;
    this.duration   = type === 'TANK' ? 1.0 : 0.8; // TANK MELTS SLOWER  
    this.isDone     = false;
    this.drips      = [];
  }

  spawnDrips(colorSamples, currentTotalDrips) {
    const available = MAX_DRIPS_TOTAL - currentTotalDrips;
    const count     = Math.min(MAX_DRIPS_EFFECT, available);
    if (count <= 0 || colorSamples.length === 0) return;

    const renderSize = this.spriteSize * this.scale;
    const step       = Math.max(1, Math.floor(colorSamples.length / count));

    for (let i = 0; i < colorSamples.length && this.drips.length < count; i += step) {
      const s = colorSamples[i];
      const d = _getDrip();
      d.x     = this.x + s.rx * renderSize;
      d.y     = this.y + s.ry * renderSize;
      d.vx    = (Math.random() - 0.5) * 0.5;       // SUBTLE LATERAL SPREAD 
      d.vy    = Math.random() * 2.5 + 0.8;
      d.color = `rgb(${s.r},${s.g},${s.b})`;
      d.alpha = 0.9;
      d.size  = Math.random() < 0.3 ? 2 : 1;
      this.drips.push(d);
    }
  }

  update(dt) {
    this.timer += dt;
    if (this.timer >= this.duration) {
      for (const d of this.drips) _recycleDrip(d);
      this.drips.length = 0;
      this.isDone = true;
      return;
    }

    // DRIPS ACTIVATE AFTER HALFWAY POINT 
    if (this.timer / this.duration > 0.5) {
      const time = this.timer;
      for (let i = this.drips.length - 1; i >= 0; i--) {
        const d = this.drips[i];
        d.vy     += 0.35;
        d.y      += d.vy * dt * 60;
        d.x      += d.vx + Math.sin(time * 5 + d.y * 0.1) * 0.15;
        d.alpha  -= 0.018;
        if (d.alpha <= 0) {
          _recycleDrip(d);
          this.drips.splice(i, 1);
        }
      }
    }
  }

  draw(ctx) {
    const sprite = ImageLoader.get(this.spriteKey);
    if (!sprite) return;

    const progress   = this.timer / this.duration;
    const renderSize = this.spriteSize * this.scale;
    const fw         = sprite.width  / this.animCount;
    const fh         = sprite.height;
    const sx         = this.frameIndex * fw;
    const sliceSrcH  = fh           / SLICES;
    const sliceDstH  = renderSize   / SLICES;
    const dx0        = this.x - renderSize / 2;
    const dy0        = this.y - renderSize / 2;

    ctx.save();

    // ── BRIEF WHITE FLASH AT MOMENT OF DEATH  
    if (this.timer < 0.05) {
      const f = 1 - (this.timer / 0.05);
      ctx.save();
      ctx.globalAlpha = f * 0.65;
      ctx.fillStyle   = '#ffffff';
      ctx.beginPath();
      ctx.arc(this.x, this.y, renderSize * 0.52, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // ── SLICE MELT PASS - LOWER SLICES STRETCH MORE AND FADE FASTER 
    for (let i = 0; i < SLICES; i++) {
      const frac    = i / SLICES;           // 0 = TOP, 1 = BOTTOM
      const stretch = 1 + progress * (0.4 + frac * 0.5);
      const offX    = Math.sin(i * 0.7 + progress * 9) * 6 * progress * (0.5 + frac);
      const offY    = frac * progress * renderSize * 0.35;
      const alpha   = Math.max(0, 1 - progress * (0.55 + frac * 0.85));

      ctx.globalAlpha = alpha;
      ctx.drawImage(
        sprite,
        sx,  frac * fh,  fw, sliceSrcH,        
        dx0 + offX,
        dy0 + i * sliceDstH * stretch + offY,    
        renderSize,
        sliceDstH * stretch                       // VERTICALLY STRETCHED
      );
    }

    ctx.restore();

    // ── DRIP PARTICLES ────────────────────────────────────────────────────────
    if (progress > 0.5 && this.drips.length > 0) {
      ctx.save();
      for (const d of this.drips) {
        if (d.alpha <= 0) continue;
        ctx.globalAlpha = d.alpha;
        ctx.fillStyle   = d.color;
        ctx.fillRect(d.x, d.y, d.size, d.size);
      }
      ctx.restore();
    }
  }
}

// ── MANAGER ───────────────────────────────────────────────────────────────────
export class EnemyDeathManager {
  constructor() {
    this.effects = [];
  }

  /**
   * MELT EFFECT - CSLLED BEFORE ENEMY IS REMOVED FROM ENEMY MANAGER ARRAY
   * @param {Enemy} enemy
   */
  spawn(enemy) {
    // RESOLVE CORRECT frameIndex FOR FLIMFLAM 
    let frameIndex = enemy.frameIndex;
    let animCount  = enemy.animCount;
    if (enemy.type === 'FLIMFLAM') {
      const cfg  = CONFIG.ENEMIES.TYPES.FLIMFLAM;
      frameIndex = cfg.BODY_FRAME_OFFSET + (enemy.bodyIndex ?? 0);
      animCount  = cfg.SPRITE_FRAMES;
    }

    const effect = new EnemyDeathEffect(
      enemy.x,
      enemy.y,
      enemy.scale,
      enemy.type,
      enemy.spriteKey,
      frameIndex,
      animCount,
      enemy.config.SIZE,
    );

    const sprite = ImageLoader.get(enemy.spriteKey);
    if (sprite) {
      const samples = _getColorSamples(enemy.type, sprite, frameIndex, animCount);

      // COUNT CURRENT GLOBAL DRIP LOAD FOR BUDGET ENFORCEMENT
      let totalDrips = 0;
      for (const e of this.effects) totalDrips += e.drips.length;

      effect.spawnDrips(samples, totalDrips);
    }

    this.effects.push(effect);
  }

  update(dt) {
    for (let i = this.effects.length - 1; i >= 0; i--) {
      this.effects[i].update(dt);
      if (this.effects[i].isDone) this.effects.splice(i, 1);
    }
  }

  draw(ctx) {
    for (const effect of this.effects) effect.draw(ctx);
  }

  /** CALLL WHEN RESETTING GAME STATE  */
  clear() {
    for (const effect of this.effects) {
      for (const d of effect.drips) _recycleDrip(d);
    }
    this.effects = [];
  }
}