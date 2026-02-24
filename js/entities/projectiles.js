// projectiles.js
// ~~~~~~~~~~~~~~~~~~~~ IMPORTS ~~~~~~~~~~~~~~~~~~~~
import { CONFIG } from '../utils/config.js';
import { isKeyPressed, analogInput, isMobile } from '../utils/controls.js';
import { segmentCircleCollision } from '../utils/collision.js';
import { ImageLoader } from '../utils/imageLoader.js';
// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

export class Projectile {
  constructor(x, y, dirX, dirY, targetX, targetY) {
    this.x    = x;
    this.y    = y;
    this.dirX = dirX;
    this.dirY = dirY;
    this.speed  = CONFIG.SHOOTING.PROJECTILE_SPEED;
    this.size   = CONFIG.SHOOTING.PROJECTILE_SIZE;
    this.length = CONFIG.SHOOTING.PROJECTILE_LENGTH;
    this.color      = CONFIG.SHOOTING.PROJECTILE_COLOR;
    this.glowColor  = CONFIG.SHOOTING.PROJECTILE_GLOW_COLOR;
    this.isDead = false;

    // 3D PERSPECTIVE — TARGET POS IS THE VANISHING POINT
    this.startX = x;
    this.startY = y;
    const dx = (targetX ?? window.innerWidth  / 2) - x;
    const dy = (targetY ?? window.innerHeight / 2) - y;
    this.maxDistance     = Math.sqrt(dx * dx + dy * dy); // REACH CROSSHAIR EXACTLY
    this.distanceTraveled = 0;
    this.depthScale = 1.0;
    this.alpha      = 1.0;
  }

  update(dt) {
    this.x += this.dirX * this.speed * dt;
    this.y += this.dirY * this.speed * dt;
    this.distanceTraveled += this.speed * dt;

    // EASE IN — SLOW SHRINK THEN ACCELERATES INTO TUNNEL
    const rawProgress   = Math.min(this.distanceTraveled / this.maxDistance, 1.0);
    const easedProgress = rawProgress * rawProgress; // QUADRATIC
    this.depthScale = 1.0 - easedProgress * 0.92;   // SCALES DOWN TO ~8%

    // FADE STARTS AT 55% THROUGH TRAVEL
    const fadeStart = 0.55;
    this.alpha = rawProgress > fadeStart
      ? 1.0 - ((rawProgress - fadeStart) / (1.0 - fadeStart))
      : 1.0;

    if (rawProgress >= 1.0 || this.alpha <= 0.03) this.isDead = true;
  }

  draw(ctx) {
    ctx.save();

    const angle        = Math.atan2(this.dirY, this.dirX);
    const scaledSize   = this.size   * this.depthScale;
    const scaledLength = this.length * this.depthScale;

    // GLOW
    ctx.globalAlpha = 0.3 * this.alpha;
    ctx.strokeStyle = this.glowColor;
    ctx.lineWidth   = scaledSize * 2;
    ctx.lineCap     = 'round';
    ctx.beginPath();
    ctx.moveTo(this.x, this.y);
    ctx.lineTo(this.x - Math.cos(angle) * scaledLength, this.y - Math.sin(angle) * scaledLength);
    ctx.stroke();

    // CORE
    ctx.globalAlpha = 1.0 * this.alpha;
    ctx.strokeStyle = this.color;
    ctx.lineWidth   = scaledSize;
    ctx.beginPath();
    ctx.moveTo(this.x, this.y);
    ctx.lineTo(this.x - Math.cos(angle) * scaledLength, this.y - Math.sin(angle) * scaledLength);
    ctx.stroke();

    // BRIGHT TIP
    ctx.globalAlpha = this.alpha;
    ctx.fillStyle   = '#ffffff';
    ctx.beginPath();
    ctx.arc(this.x, this.y, scaledSize / 2, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  getPosition() { return { x: this.x, y: this.y }; }
  getRadius()   { return this.size; }

  getSegment() { // TAIL POINT — FOR SEGMENT COLLISION
    return {
      x1: this.x,
      y1: this.y,
      x2: this.x - this.dirX * this.length * (1 / (this.depthScale || 1)),
      y2: this.y - this.dirY * this.length * (1 / (this.depthScale || 1)),
    };
  }
}

// ======================= EXPLOSION =======================
export class Explosion {
  constructor(x, y, type = 'bam') {
    this.x = x;
    this.y = y;
    this.type         = type;
    this.currentFrame = 0;
    this.frameTime    = 0;
    this.isDead       = false;
    if (type === 'boom') {
      this.spriteKey = 'boom';
      this.frames    = CONFIG.EXPLOSIONS.BOOM_FRAMES;
      this.size      = CONFIG.EXPLOSIONS.BOOM_SIZE;
    } else {
      this.spriteKey = 'bam';
      this.frames    = CONFIG.EXPLOSIONS.BAM_FRAMES;
      this.size      = CONFIG.EXPLOSIONS.BAM_SIZE;
    }
  }

  update(dt) {
    this.frameTime += dt;
    if (this.frameTime >= CONFIG.EXPLOSIONS.FRAME_DURATION) {
      this.frameTime = 0;
      this.currentFrame++;
      if (this.currentFrame >= this.frames) this.isDead = true;
    }
  }

  draw(ctx) {
    const sprite = ImageLoader.get(this.spriteKey);
    if (!sprite) return;

    const frameWidth = sprite.width / this.frames;
    ctx.save();
    ctx.drawImage(
      sprite,
      this.currentFrame * frameWidth, 0, frameWidth, sprite.height,
      this.x - this.size / 2,
      this.y - this.size / 2,
      this.size, this.size
    );
    ctx.restore();
  }
}

// ======================= PROJECTILE MANAGER =======================
export class ProjectileManager {
  constructor() {
    this.projectiles = [];
    this.explosions  = [];
  }

  shoot(x, y, targetX, targetY) {
    if (this.projectiles.length >= CONFIG.SHOOTING.MAX_PROJECTILES) return;
    const dx       = targetX - x;
    const dy       = targetY - y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const dirX     = dx / distance;
    const dirY     = dy / distance;
    this.projectiles.push(new Projectile(x, y, dirX, dirY, targetX, targetY));
  }

  createExplosion(x, y, type = 'bam') {
    this.explosions.push(new Explosion(x, y, type));
  }

  update(dt) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      this.projectiles[i].update(dt);
      if (this.projectiles[i].isDead) this.projectiles.splice(i, 1);
    }
    for (let i = this.explosions.length - 1; i >= 0; i--) {
      this.explosions[i].update(dt);
      if (this.explosions[i].isDead) this.explosions.splice(i, 1);
    }
  }

  draw(ctx) {
    for (const p of this.projectiles) p.draw(ctx);
    for (const e of this.explosions)  e.draw(ctx);
  }

  getProjectiles()          { return this.projectiles; }
  removeProjectile(projectile) {
    const i = this.projectiles.indexOf(projectile);
    if (i > -1) this.projectiles.splice(i, 1);
  }
  clear() { this.projectiles = []; this.explosions = []; }
}

// ======================= CROSSHAIR =======================
export class Crosshair {
  constructor() {
    const cx = window.innerWidth  / 2;
    const cy = window.innerHeight / 2;

    // INNER RETICLE
    this.x       = cx;
    this.y       = cy;
    this.targetX = cx;
    this.targetY = cy;

    // OUTER BRACKETS
    this.outerX = cx;
    this.outerY = cy;

    this.size = CONFIG.SHOOTING.CROSSHAIR_SIZE;

    this.isLockedOn   = false;
    this.flashTimer   = 0;
    this.lockFlashOn  = false; // ALTERNATES FOR LOCK FLASH

    this.mouseInput   = { x: 0, y: 0 };
    this.smoothedInput = { x: 0, y: 0 };
  }

  setMouseInput(nx, ny) {
    this.mouseInput.x = nx;
    this.mouseInput.y = ny;
  }

  update(shipOffsetX, shipOffsetY, dt, enemies, vanishingPoint) {
    // VANISHING POINT — WHERE TUNNEL MOUTH CONVERGES
    const centerX = vanishingPoint ? vanishingPoint.x : window.innerWidth  / 2;
    const centerY = vanishingPoint ? vanishingPoint.y : window.innerHeight / 2;

    const shipX = window.innerWidth  / 2 + shipOffsetX;
    const shipY = window.innerHeight / 2 - shipOffsetY;

    // ── RESOLVE RAW INPUT (mobile joystick > mouse > keyboard) ──
    let rawX = 0, rawY = 0;
    if (isMobile) {
      rawX = analogInput.x;
      rawY = analogInput.y;
    } else if (this.mouseInput.x !== 0 || this.mouseInput.y !== 0) {
      rawX = this.mouseInput.x;
      rawY = this.mouseInput.y;
    } else {
      if (isKeyPressed('d') || isKeyPressed('arrowright')) rawX += 1;
      if (isKeyPressed('a') || isKeyPressed('arrowleft'))  rawX -= 1;
      if (isKeyPressed('w') || isKeyPressed('arrowup'))    rawY += 1;
      if (isKeyPressed('s') || isKeyPressed('arrowdown'))  rawY -= 1;
      const mag = Math.sqrt(rawX * rawX + rawY * rawY) || 1;
      rawX /= mag;
      rawY /= mag;
    }

    // ── SMOOTH INPUT VECTOR ──
    const sl = CONFIG.SHOOTING.CROSSHAIR_INPUT_SMOOTHING;
    this.smoothedInput.x += (rawX - this.smoothedInput.x) * sl;
    this.smoothedInput.y += (rawY - this.smoothedInput.y) * sl;

    // ── COMPUTE AIM TARGET ──
    const deflect   = CONFIG.SHOOTING.CROSSHAIR_AIM_DEFLECT_PX;
    const normX     = shipOffsetX / CONFIG.SHIP.MAX_OFFSET_X;
    const normY     = shipOffsetY / CONFIG.SHIP.MAX_OFFSET_Y;
    const edgeMag   = Math.min(Math.sqrt(normX * normX + normY * normY), 1.0);
    const pullFactor = 1.0 - edgeMag * CONFIG.SHOOTING.CROSSHAIR_CENTER_PULL;

    const rawTargetX = centerX + this.smoothedInput.x * deflect * pullFactor;
    const rawTargetY = centerY - this.smoothedInput.y * deflect * pullFactor;

    const margin = this.size * 0.6;
    this.targetX = Math.max(margin, Math.min(window.innerWidth  - margin, rawTargetX));
    this.targetY = Math.max(margin, Math.min(window.innerHeight - margin, rawTargetY));

    // ── CHASE INNER → TARGET ──
    this.x += (this.targetX - this.x) * CONFIG.SHOOTING.CROSSHAIR_INNER_LAG;
    this.y += (this.targetY - this.y) * CONFIG.SHOOTING.CROSSHAIR_INNER_LAG;

    // ── OUTER TRAILS INNER ──
    this.outerX += (this.x - this.outerX) * CONFIG.SHOOTING.CROSSHAIR_OUTER_LAG;
    this.outerY += (this.y - this.outerY) * CONFIG.SHOOTING.CROSSHAIR_OUTER_LAG;

    // CAP MAX SEPARATION
    const sep  = CONFIG.SHOOTING.CROSSHAIR_MAX_SEPARATION;
    const dx   = this.outerX - this.x;
    const dy   = this.outerY - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > sep) {
      this.outerX = this.x + (dx / dist) * sep;
      this.outerY = this.y + (dy / dist) * sep;
    }

    // ── LOCK-ON: LINE OF FIRE vs ENEMY CIRCLES ──
    this.isLockedOn = false;
    if (enemies?.length > 0) {
      const seg = { x1: shipX, y1: shipY, x2: this.targetX, y2: this.targetY };
      for (const enemy of enemies) {
        const pos = enemy.getPosition();
        const r   = enemy.getSize() * 1.1;
        if (segmentCircleCollision(seg, { x: pos.x, y: pos.y, radius: r })) {
          this.isLockedOn = true;
          break;
        }
      }
    }

    if (this.isLockedOn) {
      this.flashTimer += dt;
      if (this.flashTimer >= CONFIG.SHOOTING.CROSSHAIR_FLASH_SPEED) {
        this.flashTimer  = 0;
        this.lockFlashOn = !this.lockFlashOn;
      }
    } else {
      this.lockFlashOn = false;
      this.flashTimer  = 0;
    }
  }

  draw(ctx) {
    const outerSize = this.size * CONFIG.SHOOTING.CROSSHAIR_OUTER_SCALE;
    const alpha     = this.isLockedOn ? 0.95 : 0.75;

    // ALIGNMENT METER — 1 = PERFECTLY ALIGNED, 0 = OUTER FAR FROM INNER
    const dx        = this.outerX - this.x;
    const dy        = this.outerY - this.y;
    const sepDist   = Math.sqrt(dx * dx + dy * dy);
    const alignFrac = 1 - Math.min(sepDist / CONFIG.SHOOTING.CROSSHAIR_MAX_SEPARATION, 1);

    ctx.save();
    const color = this.isLockedOn
      ? (this.lockFlashOn ? '#ff2222' : '#ffcc00')
      : '#cc88ff';
    ctx.strokeStyle = color;
    ctx.lineWidth   = 2;
    ctx.globalAlpha = alpha * 0.7 * (0.5 + alignFrac * 0.5);

    const b      = outerSize / 2;
    const corner = outerSize * 0.28;
    const ox = this.outerX;
    const oy = this.outerY;
    [[-1,-1],[1,-1],[1,1],[-1,1]].forEach(([sx, sy]) => {
      ctx.beginPath();
      ctx.moveTo(ox + sx * b, oy + sy * (b - corner));
      ctx.lineTo(ox + sx * b, oy + sy * b);
      ctx.lineTo(ox + sx * (b - corner), oy + sy * b);
      ctx.stroke();
    });
    ctx.restore();

    ctx.save();
    const ic = this.isLockedOn ? (this.lockFlashOn ? '#ff2222' : '#ffcc00') : '#cc88ff';
    ctx.strokeStyle = ic;
    ctx.fillStyle   = ic;
    ctx.lineWidth   = 2;
    ctx.globalAlpha = alpha;

    const arm = this.size * 0.32;
    const gap = this.size * 0.12;
    ctx.beginPath();
    ctx.moveTo(this.x, this.y - arm); ctx.lineTo(this.x, this.y - gap);
    ctx.moveTo(this.x, this.y + gap); ctx.lineTo(this.x, this.y + arm);
    ctx.moveTo(this.x - arm, this.y); ctx.lineTo(this.x - gap, this.y);
    ctx.moveTo(this.x + gap, this.y); ctx.lineTo(this.x + arm, this.y);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(this.x, this.y, 2.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  getPosition()   { return { x: this.x, y: this.y }; }
  handleResize()  {
    const cx = window.innerWidth  / 2;
    const cy = window.innerHeight / 2;
    this.x = cx; this.y = cy; this.outerX = cx; this.outerY = cy;
  }
}

// ======================= MUZZLE FLASH =======================
export class MuzzleFlash {
  constructor() {
    this.active  = false;
    this.timer   = 0;
    this.x       = 0;
    this.y       = 0;
    this.duration = CONFIG.SHOOTING.FLASH_DURATION;
  }

  trigger(x, y) {
    this.active = true;
    this.timer  = 0;
    this.x = x;
    this.y = y;
  }

  update(dt) {
    if (!this.active) return;
    this.timer += dt;
    if (this.timer >= this.duration) this.active = false;
  }

  draw(ctx) {
    if (!this.active) return;

    const progress = this.timer / this.duration;   // 0 → 1
    const alpha    = 1 - progress;                 // FADE OUT
    const radius   = 18 + progress * 28;           // EXPAND OUTWARD

    ctx.save();

    const glow = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, radius * 1.8);
    glow.addColorStop(0,   `rgba(0, 255, 255, ${alpha * 0.6})`);
    glow.addColorStop(0.4, `rgba(0, 200, 255, ${alpha * 0.25})`);
    glow.addColorStop(1,   'rgba(0, 100, 255, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(this.x, this.y, radius * 1.8, 0, Math.PI * 2);
    ctx.fill();

    const core = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, radius);
    core.addColorStop(0,   `rgba(255, 255, 255, ${alpha})`);
    core.addColorStop(0.3, `rgba(180, 255, 255, ${alpha * 0.8})`);
    core.addColorStop(1,   'rgba(0, 200, 255, 0)');
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(this.x, this.y, radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }
}