// projectiles.js
// ~~~~~~~~~~~~~~~~~~~~ IMPORTS ~~~~~~~~~~~~~~~~~~~~
import { CONFIG } from './config.js';
// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

export class Projectile {
  constructor(x, y, dirX, dirY) {
    this.x = x;
    this.y = y;
    this.dirX = dirX;
    this.dirY = dirY;
    this.speed = CONFIG.SHOOTING.PROJECTILE_SPEED;
    this.size = CONFIG.SHOOTING.PROJECTILE_SIZE;
    this.length = CONFIG.SHOOTING.PROJECTILE_LENGTH;
    this.color = CONFIG.SHOOTING.PROJECTILE_COLOR;
    this.glowColor = CONFIG.SHOOTING.PROJECTILE_GLOW_COLOR;
    this.isDead = false;

    // 3D PERSPECTIVE - TRACK DISTANCE TO VANISHING POINT ( SCREEN CENTER)
    this.startX = x;
    this.startY = y;
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    const dx = cx - x;
    const dy = cy - y;
    this.maxDistance = Math.sqrt(dx * dx + dy * dy) * 0.88;     // MAX TRAVEL = DISTANCE FROM SHIP TO CENTER * 0.88 ( DIES RIGHT BEFORE VANISHING POINT) 
    this.distanceTraveled = 0;
    this.depthScale = 1.0; // 1.0 AT SHIP, ~0 AT VANISHING POINT
    this.alpha = 1.0;
  }

  update(dt) {
    this.x += this.dirX * this.speed * dt;
    this.y += this.dirY * this.speed * dt;

    this.distanceTraveled += this.speed * dt;

    const rawProgress = Math.min(this.distanceTraveled / this.maxDistance, 1.0); // EASE IN CURVE - SLOW SHRINK THEN SHRINKS FASTER - PULLING INTO TUNNEL
    const easedProgress = rawProgress * rawProgress; // QUADRATIC EASE IN

    this.depthScale = 1.0 - easedProgress * 0.92; // SCALES DOWN TO ~8% ORIGINAL SIZE

    
    const fadeStart = 0.55; // FADE STARTS AT 55% THROUGH TRAVEL - 100% = FULLY GONE
    if (rawProgress > fadeStart) {
      this.alpha = 1.0 - ((rawProgress - fadeStart) / (1.0 - fadeStart));
    } else {
      this.alpha = 1.0;
    }

    if (rawProgress >= 1.0 || this.alpha <= 0.03) {
      this.isDead = true;
    }
  }

  draw(ctx) {
    ctx.save();

    const angle = Math.atan2(this.dirY, this.dirX); // CALC ANGLE FOR LASER
    const scaledSize = this.size * this.depthScale;
    const scaledLength = this.length * this.depthScale;

    ctx.globalAlpha = 0.3 * this.alpha; // LASER GLOW
    ctx.strokeStyle = this.glowColor;
    ctx.lineWidth = scaledSize * 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(this.x, this.y);
    ctx.lineTo(
      this.x - Math.cos(angle) * scaledLength,
      this.y - Math.sin(angle) * scaledLength
    );
    ctx.stroke();

    ctx.globalAlpha = 1.0 * this.alpha; // CORE LASER
    ctx.strokeStyle = this.color;
    ctx.lineWidth = scaledSize;
    ctx.beginPath();
    ctx.moveTo(this.x, this.y);
    ctx.lineTo(
      this.x - Math.cos(angle) * scaledLength,
      this.y - Math.sin(angle) * scaledLength
    );
    ctx.stroke();

    ctx.globalAlpha = this.alpha;
    ctx.fillStyle = '#ffffff';  // BRIGHT TIP
    ctx.beginPath();
    ctx.arc(this.x, this.y, scaledSize / 2, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  getPosition() {
    return { x: this.x, y: this.y };
  }

  getRadius() {
    return this.size;
  }

  getSegment() {   // RETURNS TAIL POINT OF LASER - FOR SEGMENT COLLISION
    return {
      x1: this.x,
      y1: this.y,
      x2: this.x - this.dirX * this.length * (1 / this.depthScale || 1),
      y2: this.y - this.dirY * this.length * (1 / this.depthScale || 1),
    };
  }
}

export class Explosion {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.currentFrame = 0;
    this.frameTime = 0;
    this.isDead = false;
    this.size = CONFIG.EXPLOSIONS.SIZE;
    this.sprite = null;
    this.spriteLoaded = false;
    this.frameWidth = 0;

    this.loadSprite();
  }

  loadSprite() {
    this.sprite = new Image();
    this.sprite.src = CONFIG.EXPLOSIONS.SPRITE;
    this.sprite.onload = () => {
      this.spriteLoaded = true;
      this.frameWidth = this.sprite.width / CONFIG.EXPLOSIONS.FRAMES;
    };
  }

  update(dt) {
    this.frameTime += dt;

    if (this.frameTime >= CONFIG.EXPLOSIONS.FRAME_DURATION) {
      this.frameTime = 0;
      this.currentFrame++;

      if (this.currentFrame >= CONFIG.EXPLOSIONS.FRAMES) {
        this.isDead = true;
      }
    }
  }

  draw(ctx) {
    if (!this.spriteLoaded) return;

    ctx.save();
    const sx = this.currentFrame * this.frameWidth;
    const sy = 0;
    const sw = this.frameWidth;
    const sh = this.sprite.height;

    ctx.drawImage(
      this.sprite,
      sx, sy, sw, sh,
      this.x - this.size / 2,
      this.y - this.size / 2,
      this.size,
      this.size
    );
    ctx.restore();
  }
}

export class ProjectileManager {
  constructor() {
    this.projectiles = [];
    this.explosions = [];
    
    console.log('âœ“ Projectile manager initialized');
  }

  shoot(x, y, targetX, targetY) {
    if (this.projectiles.length >= CONFIG.SHOOTING.MAX_PROJECTILES) return;

    // CALC DIRECTION FROM SHIP TO TARGET
    const dx = targetX - x; 
    const dy = targetY - y;
    const distance = Math.sqrt(dx * dx + dy * dy); 
    
    // NORMALIZE DIRECTION
    const dirX = dx / distance;
    const dirY = dy / distance;

    const projectile = new Projectile(x, y, dirX, dirY);
    this.projectiles.push(projectile);
  }

  createExplosion(x, y) {
    const explosion = new Explosion(x, y);
    this.explosions.push(explosion);
  }

  update(dt) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) { // UPDATE PROJECTILES
      this.projectiles[i].update(dt);
      if (this.projectiles[i].isDead) {
        this.projectiles.splice(i, 1);
      }
    }

    for (let i = this.explosions.length - 1; i >= 0; i--) { // UPDATE EXPLOSIONS
      this.explosions[i].update(dt);
      if (this.explosions[i].isDead) {
        this.explosions.splice(i, 1);
      }
    }
  }

  draw(ctx) {
    this.projectiles.forEach(p => p.draw(ctx));
    this.explosions.forEach(e => e.draw(ctx));
  }

  getProjectiles() {
    return this.projectiles;
  }

  removeProjectile(projectile) {
    const index = this.projectiles.indexOf(projectile);
    if (index > -1) {
      this.projectiles.splice(index, 1);
    }
  }

  clear() {
    this.projectiles = [];
    this.explosions = [];
  }
}

export class Crosshair {
  constructor() {
    // INNER RETICLE 
    this.x = window.innerWidth / 2;
    this.y = window.innerHeight / 2;
    this.targetX = this.x;
    this.targetY = this.y;

    // OUTER RETICLE
    this.outerX = this.x;
    this.outerY = this.y;

    this.sprite = null;
    this.spriteLoaded = false;
    this.frameWidth = 0;
    this.size = CONFIG.SHOOTING.CROSSHAIR_SIZE;

    this.isLockedOn = false;     // LOCK-ON STATE
    this.flashTimer = 0;
    this.currentFrame = 0; // 0=NORMAL(purple), 1=RED, 2=YELLOW

    this.loadSprite();
    console.log('✔ Crosshair initialized');
  }

  loadSprite() {
    this.sprite = new Image();
    this.sprite.src = CONFIG.SHOOTING.CROSSHAIR_SPRITE;
    this.sprite.onload = () => {
      this.spriteLoaded = true;
      this.frameWidth = this.sprite.width / CONFIG.SHOOTING.CROSSHAIR_FRAMES;
      console.log('✔ Crosshair sprite loaded');
    };
    this.sprite.onerror = () => {
      console.warn('⚠  Crosshair sprite not found, using fallback');
    };
  }

  update(shipOffsetX, shipOffsetY, dt, enemies) {
    const centerX = window.innerWidth / 2;
    const centerY = window.innerHeight / 2;

    // CENTER GRAVITY: CROSS HAIR TARGET IS BETWEEN SHIP AND CENTER - NOT BEYOND SHIP - THE FURTHER THE SHIP IS FROM THE CENTER, THE MORETHE CROSSHAIR PULLS BACK TOWARDS CENTER
    const normX = shipOffsetX / CONFIG.SHIP.MAX_OFFSET_X; // -1 to 1
    const normY = shipOffsetY / CONFIG.SHIP.MAX_OFFSET_Y;
    const pullFactor = 1.0 - Math.min(Math.sqrt(normX * normX + normY * normY), 1.0)
                           * CONFIG.SHOOTING.CROSSHAIR_CENTER_PULL;

    const offsetMult = CONFIG.SHOOTING.CROSSHAIR_OFFSET_MULTIPLIER * pullFactor;
    const rawX = centerX + shipOffsetX * offsetMult;
    const rawY = centerY - shipOffsetY * offsetMult;

    const margin = this.size * 0.6;     // CLAMP TO SCREEN WITH  MARGIN
    this.targetX = Math.max(margin, Math.min(window.innerWidth  - margin, rawX));
    this.targetY = Math.max(margin, Math.min(window.innerHeight - margin, rawY));

    this.x += (this.targetX - this.x) * CONFIG.SHOOTING.CROSSHAIR_INNER_LAG;     // INNER 
    this.y += (this.targetY - this.y) * CONFIG.SHOOTING.CROSSHAIR_INNER_LAG;

    this.outerX += (this.targetX - this.outerX) * CONFIG.SHOOTING.CROSSHAIR_OUTER_LAG;     // OUTER 
    this.outerY += (this.targetY - this.outerY) * CONFIG.SHOOTING.CROSSHAIR_OUTER_LAG;

    const sep = CONFIG.SHOOTING.CROSSHAIR_MAX_SEPARATION;     // CAP DISTANCE FOR INNER AND OTER CROSS HAIR
    const dx = this.outerX - this.x;
    const dy = this.outerY - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > sep) {
      this.outerX = this.x + (dx / dist) * sep;
      this.outerY = this.y + (dy / dist) * sep;
    }

    this.isLockedOn = false;     // LOCK-ON DETECTION
    if (enemies) {
      const lockRadius = this.size * CONFIG.SHOOTING.CROSSHAIR_LOCK_RADIUS_MULTIPLIER;
      for (const enemy of enemies) {
        const ep = enemy.getPosition();
        const es = enemy.getSize();
        const ex = this.x - ep.x;
        const ey = this.y - ep.y;
        if (Math.sqrt(ex * ex + ey * ey) < lockRadius + es) {
          this.isLockedOn = true;
          break;
        }
      }
    }

    if (this.isLockedOn) {     // FLASH BETWEEN FRAMES 1 (red) AND 2 (yellow) WHEN LOCKED ON
      this.flashTimer += dt;
      if (this.flashTimer >= CONFIG.SHOOTING.CROSSHAIR_FLASH_SPEED) {
        this.flashTimer = 0;
        this.currentFrame = this.currentFrame === 1 ? 2 : 1;
      }
    } else {
      this.currentFrame = 0;
      this.flashTimer = 0;
    }
  }

  draw(ctx) {
    const outerSize = this.size * CONFIG.SHOOTING.CROSSHAIR_OUTER_SCALE;
    const alpha = this.isLockedOn ? 0.95 : 0.75;

    ctx.save();  // OUTER RETICLE 
    ctx.globalAlpha = alpha * 0.7;
    const color = this.isLockedOn
      ? (this.currentFrame === 1 ? '#ff2222' : '#ffcc00')
      : '#cc88ff';
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    const b = outerSize / 2; 
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

    
    if (this.spriteLoaded && this.frameWidth > 0) { // INNER RETICLE
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.drawImage(
        this.sprite,
        this.currentFrame * this.frameWidth, 0,
        this.frameWidth, this.sprite.height,
        this.x - this.size / 2,
        this.y - this.size / 2,
        this.size,
        this.size
      );
      ctx.restore();
    } else { // FALLBACK 
      ctx.save();
      ctx.strokeStyle = this.isLockedOn ? '#ff2222' : '#cc88ff';
      ctx.lineWidth = 2;
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.moveTo(this.x, this.y - 14); ctx.lineTo(this.x, this.y + 14); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(this.x - 14, this.y); ctx.lineTo(this.x + 14, this.y); ctx.stroke();
      ctx.fillStyle = this.isLockedOn ? '#ff2222' : '#cc88ff';
      ctx.beginPath();
      ctx.arc(this.x, this.y, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  getPosition() {
    return { x: this.x, y: this.y };
  }
}

export class MuzzleFlash {
  constructor() {
    this.active = false;
    this.timer = 0;
    this.x = 0;
    this.y = 0;
    this.currentFrame = 0;
    this.sprite = null;
    this.spriteLoaded = false;
    this.frameWidth = 0;

    this.loadSprite();
  }

  loadSprite() {
    this.sprite = new Image();
    this.sprite.src = CONFIG.SHOOTING.FLASH_SPRITE;
    this.sprite.onload = () => {
      this.spriteLoaded = true;
      this.frameWidth = this.sprite.width / CONFIG.SHOOTING.FLASH_FRAMES;
    };
  }

  trigger(x, y) {
    this.active = true;
    this.timer = 0;
    this.x = x;
    this.y = y;
    this.currentFrame = 0;
  }

  update(dt) {
    if (!this.active) return;

    this.timer += dt;

    if (this.timer >= CONFIG.SHOOTING.FLASH_DURATION) {
      this.active = false;
    } else {
      const frameProgress = this.timer / CONFIG.SHOOTING.FLASH_DURATION;
      this.currentFrame = Math.floor(frameProgress * CONFIG.SHOOTING.FLASH_FRAMES);
      this.currentFrame = Math.min(this.currentFrame, CONFIG.SHOOTING.FLASH_FRAMES - 1);
    }
  }

  draw(ctx) {
    if (!this.active || !this.spriteLoaded) return;

    ctx.save();
    const sx = this.currentFrame * this.frameWidth;
    const sy = 0;
    const sw = this.frameWidth;
    const sh = this.sprite.height;

    ctx.globalAlpha = 1 - (this.timer / CONFIG.SHOOTING.FLASH_DURATION);
    ctx.drawImage(
      this.sprite,
      sx, sy, sw, sh,
      this.x - CONFIG.SHOOTING.FLASH_SIZE / 2,
      this.y - CONFIG.SHOOTING.FLASH_SIZE / 2,
      CONFIG.SHOOTING.FLASH_SIZE,
      CONFIG.SHOOTING.FLASH_SIZE
    );
    ctx.restore();
  }
}