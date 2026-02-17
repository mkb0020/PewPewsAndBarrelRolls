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
  }

  update(dt) {
    this.x += this.dirX * this.speed * dt;
    this.y += this.dirY * this.speed * dt;

    if (this.y < -100 || this.y > window.innerHeight + 100 ||
        this.x < -100 || this.x > window.innerWidth + 100) {
      this.isDead = true;
    }
  }

  draw(ctx) {
    ctx.save();

    const angle = Math.atan2(this.dirY, this.dirX); // CALC ANGLE FOR LASER

    ctx.globalAlpha = 0.3; // LASER GLOW
    ctx.strokeStyle = this.glowColor;
    ctx.lineWidth = this.size * 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(this.x, this.y);
    ctx.lineTo(
      this.x - Math.cos(angle) * this.length,
      this.y - Math.sin(angle) * this.length
    );
    ctx.stroke();

    ctx.globalAlpha = 1; // CORE LASER
    ctx.strokeStyle = this.color;
    ctx.lineWidth = this.size;
    ctx.beginPath();
    ctx.moveTo(this.x, this.y);
    ctx.lineTo(
      this.x - Math.cos(angle) * this.length,
      this.y - Math.sin(angle) * this.length
    );
    ctx.stroke();

    ctx.fillStyle = '#ffffff';  // BRIGHT TIP
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size / 2, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  getPosition() {
    return { x: this.x, y: this.y };
  }

  getRadius() {
    return this.size;
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
    
    console.log('✓ Projectile manager initialized');
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
    this.x = window.innerWidth / 2;
    this.y = window.innerHeight / 2;
    this.sprite = null;
    this.spriteLoaded = false;
    this.size = CONFIG.SHOOTING.CROSSHAIR_SIZE;

    this.loadSprite();
    console.log('✓ Crosshair initialized');
  }

  loadSprite() {
    this.sprite = new Image();
    this.sprite.src = CONFIG.SHOOTING.CROSSHAIR_SPRITE;
    this.sprite.onload = () => {
      this.spriteLoaded = true;
      console.log('✓ Crosshair sprite loaded');
    };
    this.sprite.onerror = () => {
      console.warn('⚠ Crosshair sprite not found, using fallback');
    };
  }

  update(shipOffsetX, shipOffsetY) {
    const centerX = window.innerWidth / 2;
    const centerY = window.innerHeight / 2;

    this.x = centerX + shipOffsetX * CONFIG.SHOOTING.CROSSHAIR_OFFSET_MULTIPLIER;
    this.y = centerY - shipOffsetY * CONFIG.SHOOTING.CROSSHAIR_OFFSET_MULTIPLIER;
  }

  draw(ctx) {
    if (this.spriteLoaded) {
      ctx.save();
      ctx.globalAlpha = 0.8;
      ctx.drawImage(
        this.sprite,
        this.x - this.size / 2,
        this.y - this.size / 2,
        this.size,
        this.size
      );
      ctx.restore();
    } else { // FALLBACK
      ctx.save();
      ctx.strokeStyle = '#00ffff';
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.8;

      ctx.beginPath();
      ctx.moveTo(this.x, this.y - 20);
      ctx.lineTo(this.x, this.y + 20);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(this.x - 20, this.y);
      ctx.lineTo(this.x + 20, this.y);
      ctx.stroke();

      ctx.fillStyle = '#00ffff';
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