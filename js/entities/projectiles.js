// projectiles.js
// ~~~~~~~~~~~~~~~~~~~~ IMPORTS ~~~~~~~~~~~~~~~~~~~~
import { CONFIG } from '../utils/config.js';
import { isKeyPressed, analogInput, isMobile } from '../utils/controls.js';
import { segmentCircleCollision } from '../utils/collision.js';
// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

export class Projectile {
  constructor(x, y, dirX, dirY, targetX, targetY) {
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

    // 3D PERSPECTIVE - USE ACTUAL TARGET POS AS VANISHING POINT 
    this.startX = x;
    this.startY = y;
    const dx = (targetX ?? window.innerWidth  / 2) - x;
    const dy = (targetY ?? window.innerHeight / 2) - y;
    this.maxDistance = Math.sqrt(dx * dx + dy * dy); // REACH CROSS HAIR EXACTLY - ALPHA FADES TO 0 THERE
    this.distanceTraveled = 0;
    this.depthScale = 1.0;
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
  constructor(x, y, sprite, frameWidth) {
    this.x = x;
    this.y = y;
    this.currentFrame = 0;
    this.frameTime = 0;
    this.isDead = false;
    this.size = CONFIG.EXPLOSIONS.SIZE;
    this.sprite = sprite;         // SHARED 
    this.frameWidth = frameWidth; // SHARED
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
    if (!this.sprite || !this.frameWidth) return;

    ctx.save();
    const sx = this.currentFrame * this.frameWidth;

    ctx.drawImage(
      this.sprite,
      sx, 0, this.frameWidth, this.sprite.height,
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
    
    // CACHE EXPLOSION SPRITE ONCE 
    this.explosionSprite = new Image();
    this.explosionFrameWidth = 0;
    this.explosionSprite.src = CONFIG.EXPLOSIONS.SPRITE;
    this.explosionSprite.onload = () => {
      this.explosionFrameWidth = this.explosionSprite.width / CONFIG.EXPLOSIONS.FRAMES;
    };
    
    console.log('âœ” Projectile manager initialized');
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

    const projectile = new Projectile(x, y, dirX, dirY, targetX, targetY);
    this.projectiles.push(projectile);
  }

  createExplosion(x, y) {
    const explosion = new Explosion(x, y, this.explosionSprite, this.explosionFrameWidth);
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

// ================================== CROSSHAIR - INPUT DRIVEN (NOT SHIP POS DERIVED) / CROSSHAIR REPRESENTS INTENTION NOT WHERE SHIP IS ==================================
export class Crosshair {
  constructor() {
    const cx = window.innerWidth  / 2;
    const cy = window.innerHeight / 2;

    // INNER RETICLE 
    this.x = cx;
    this.y = cy;
    this.targetX = cx;
    this.targetY = cy;

    // OUTER BRACKETS 
    this.outerX = cx;
    this.outerY = cy;

    this.sprite = null;
    this.spriteLoaded = false;
    this.frameWidth = 0;
    this.size = CONFIG.SHOOTING.CROSSHAIR_SIZE;

    this.isLockedOn = false;
    this.flashTimer = 0;
    this.currentFrame = 0; // 0=NORMAL(purple), 1=RED, 2=YELLOW

    this.mouseInput = { x: 0, y: 0 };

    this.smoothedInput = { x: 0, y: 0 };

    this.loadSprite();
    console.log('ÃƒÂ¢Ã…â€œÃ¢â‚¬Â Crosshair initialized');
  }

  loadSprite() {
    this.sprite = new Image();
    this.sprite.src = CONFIG.SHOOTING.CROSSHAIR_SPRITE;
    this.sprite.onload = () => {
      this.spriteLoaded = true;
      this.frameWidth = this.sprite.width / CONFIG.SHOOTING.CROSSHAIR_FRAMES;
      console.log('ÃƒÂ¢Ã…â€œÃ¢â‚¬Â Crosshair sprite loaded');
    };
    this.sprite.onerror = () => {
      console.warn('ÃƒÂ¢Ã…Â¡Ã‚Â   Crosshair sprite not found, using fallback');
    };
  }

  setMouseInput(nx, ny) {
    this.mouseInput.x = nx;
    this.mouseInput.y = ny;
  }

  // ================== UPDATE / shipOffsetX/Y: CURRENT SHIP OFFSET FROMS CREEN CENTER  ==================
  update(shipOffsetX, shipOffsetY, dt, enemies, vanishingPoint) {
    // VANISHING POINT - WHERE THE TUNNEL MOUTH CONVERGES ON SCREEN - CROSSHAIR'S GRAVITY TARGET
    const centerX = vanishingPoint ? vanishingPoint.x : window.innerWidth  / 2;
    const centerY = vanishingPoint ? vanishingPoint.y : window.innerHeight / 2;
    // SHIP - ALWAYS RENDERED AT SCREEN CENTER + OFFSET (INDEPENDENT OF TUNNEL PERSPECTIVE)
    const shipX = window.innerWidth  / 2 + shipOffsetX;
    const shipY = window.innerHeight / 2 - shipOffsetY;

    // ================== RESOLVE RAW INPUT VECTOR ==================
    // Priority: mobile joystick > mouse > keyboard
    let rawX = 0;
    let rawY = 0;

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

    // ================== SMOOTH THE INPUT VECTOR - LERP SMOOTHEDINPUT TOWARD RAW EACH FRAME - WHEN KEYS/JOYSTICK RELEASE - rawX/Y DROPS TO 0 BUT smoothedInput DECAYS GRADUALLY ==================
    const sl = CONFIG.SHOOTING.CROSSHAIR_INPUT_SMOOTHING;
    this.smoothedInput.x += (rawX - this.smoothedInput.x) * sl;
    this.smoothedInput.y += (rawY - this.smoothedInput.y) * sl;

    const inputX = this.smoothedInput.x;
    const inputY = this.smoothedInput.y;

    // ==================  COMPUTE AIM TARGET (INPUT-DRIVEN) / DEFLECT FROM CENTER IN DIRECTION OF INPUT - CENTER PULL GENTLY CORRECTS FOR EXTREME SHIP OFFSET ==================
    const deflect    = CONFIG.SHOOTING.CROSSHAIR_AIM_DEFLECT_PX;
    const normX      = shipOffsetX / CONFIG.SHIP.MAX_OFFSET_X; // -1..1
    const normY      = shipOffsetY / CONFIG.SHIP.MAX_OFFSET_Y;
    const edgeMag    = Math.min(Math.sqrt(normX * normX + normY * normY), 1.0);
    const pullFactor = 1.0 - edgeMag * CONFIG.SHOOTING.CROSSHAIR_CENTER_PULL; //GENTLE

    const rawTargetX = centerX + inputX * deflect * pullFactor;
    //  INPUT IS +1 UP BUT SCREEN y INCREASES DOWNWARD
    const rawTargetY = centerY - inputY * deflect * pullFactor;

    // CLAMP TO SCREEN WITH MARGIN
    const margin = this.size * 0.6;
    this.targetX = Math.max(margin, Math.min(window.innerWidth  - margin, rawTargetX));
    this.targetY = Math.max(margin, Math.min(window.innerHeight - margin, rawTargetY));

    // =============== CHASE INNER ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ TARGET ===============
    this.x += (this.targetX - this.x) * CONFIG.SHOOTING.CROSSHAIR_INNER_LAG;
    this.y += (this.targetY - this.y) * CONFIG.SHOOTING.CROSSHAIR_INNER_LAG;

    // =============== OUTER TRAILS INNER ===============
    this.outerX += (this.x - this.outerX) * CONFIG.SHOOTING.CROSSHAIR_OUTER_LAG;
    this.outerY += (this.y - this.outerY) * CONFIG.SHOOTING.CROSSHAIR_OUTER_LAG;

    // CAP - MAX SEPARATION
    const sep = CONFIG.SHOOTING.CROSSHAIR_MAX_SEPARATION;
    const dx  = this.outerX - this.x;
    const dy  = this.outerY - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > sep) {
      this.outerX = this.x + (dx / dist) * sep;
      this.outerY = this.y + (dy / dist) * sep;
    }

    // ========================== LOCK-ON: SHIP ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ CROSSHAIR LINE SEGMENT vs ENEMY CIRCLE / lLINE OF FIRE - ANYWHERE BETWEEN SHIP AND RECTILE ==========================
    this.isLockedOn = false;
    if (enemies && enemies.length > 0) {
      const seg = { x1: shipX, y1: shipY, x2: this.targetX, y2: this.targetY };
      for (const enemy of enemies) {
        const pos = enemy.getPosition();
        const r   = enemy.getSize() * 1.1; // SLIGHT FORGIVENESS
        if (segmentCircleCollision(seg, { x: pos.x, y: pos.y, radius: r })) {
          this.isLockedOn = true;
          break;
        }
      }
    }

    // ========================== LOCK-ON FLASH ==========================
    if (this.isLockedOn) {
      this.flashTimer += dt;
      if (this.flashTimer >= CONFIG.SHOOTING.CROSSHAIR_FLASH_SPEED) {
        this.flashTimer = 0;
        this.currentFrame = this.currentFrame === 1 ? 2 : 1;
      }
    } else {
      this.currentFrame = 0;
      this.flashTimer   = 0;
    }
  }

  // ======================= DRAW =======================
  draw(ctx) {
    const outerSize = this.size * CONFIG.SHOOTING.CROSSHAIR_OUTER_SCALE;
    const alpha = this.isLockedOn ? 0.95 : 0.75;

    // OUTER SEPARATION AS A 0..1 ALIGNMENT METER 1=PERFECTLY ALIGNED
    const dx        = this.outerX - this.x;
    const dy        = this.outerY - this.y;
    const sepDist   = Math.sqrt(dx * dx + dy * dy);
    const alignFrac = 1 - Math.min(sepDist / CONFIG.SHOOTING.CROSSHAIR_MAX_SEPARATION, 1);

    // OUTER BRACKETS
    ctx.save();
    const color = this.isLockedOn
      ? (this.currentFrame === 1 ? '#ff2222' : '#ffcc00')
      : '#cc88ff';
    ctx.strokeStyle  = color;
    ctx.lineWidth    = 2;
    ctx.globalAlpha  = alpha * 0.7 * (0.5 + alignFrac * 0.5); // DIM WHEN SEPARATED - BRIGHT WHEN ALIGNED 
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

    // INNER RETICLE 
    if (this.spriteLoaded && this.frameWidth > 0) {
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
    } else {
      ctx.save();
      ctx.strokeStyle = this.isLockedOn ? '#ff2222' : '#cc88ff';
      ctx.lineWidth   = 2;
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

  handleResize() {
    const cx = window.innerWidth  / 2;
    const cy = window.innerHeight / 2;
    this.x      = cx;
    this.y      = cy;
    this.outerX = cx;
    this.outerY = cy;
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