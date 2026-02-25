// enemies.js
// ~~~~~~~~~~~~~~~~~~~~ IMPORTS ~~~~~~~~~~~~~~~~~~~~
import { CONFIG } from '../utils/config.js';
import { ImageLoader, ENEMY_SPRITE } from '../utils/imageLoader.js';
// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

// ======================= ENEMY LASER =======================
class EnemyLaser {
  constructor(x, y, targetX, targetY, color) {
    this.x      = x;
    this.y      = y;
    const dx    = targetX - x;
    const dy    = targetY - y;
    const dist  = Math.sqrt(dx * dx + dy * dy) || 1;
    this.dirX   = dx / dist;
    this.dirY   = dy / dist;
    this.color  = color;
    this.isDead = false;

    const cfg       = CONFIG.ENEMY_LASER;
    this.speed      = cfg.SPEED;
    this.hitRadius  = cfg.HIT_RADIUS;
    this.boltLength = cfg.BOLT_LENGTH;
    this.boltWidth  = cfg.BOLT_WIDTH;
    this.glowBlur   = cfg.GLOW_BLUR;
  }

  update(dt) {
    this.x += this.dirX * this.speed * dt;
    this.y += this.dirY * this.speed * dt;

    const pad = 80;
    if (
      this.x < -pad || this.x > window.innerWidth  + pad ||
      this.y < -pad || this.y > window.innerHeight + pad
    ) this.isDead = true;
  }

  checkShipHit(shipX, shipY) {
    const dx = this.x - shipX;
    const dy = this.y - shipY;
    return (dx * dx + dy * dy) < (this.hitRadius * this.hitRadius);
  }

  draw(ctx) {
    const tailX = this.x - this.dirX * this.boltLength;
    const tailY = this.y - this.dirY * this.boltLength;

    ctx.save();
    ctx.shadowBlur  = this.glowBlur;
    ctx.shadowColor = this.color;
    ctx.strokeStyle = this.color;
    ctx.lineWidth   = this.boltWidth;
    ctx.lineCap     = 'round';
    ctx.globalAlpha = 0.9;

    ctx.beginPath();
    ctx.moveTo(tailX, tailY);
    ctx.lineTo(this.x, this.y);
    ctx.stroke();

    ctx.shadowBlur  = 0;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth   = 1;
    ctx.globalAlpha = 0.75;
    ctx.beginPath();
    ctx.moveTo(tailX, tailY);
    ctx.lineTo(this.x, this.y);
    ctx.stroke();

    ctx.restore();
  }
}

export class Enemy {
  constructor(x, y, type = 'BASIC', curveProgress = 0) {
    this.x = x;
    this.y = y;
    this.type = type;
    this.config = CONFIG.ENEMIES.TYPES[type];

    this.size      = this.config.SIZE;
    this.speed     = this.config.SPEED;
    this.color     = this.config.COLOR;
    this.glowColor = this.config.GLOW_COLOR;
    this.health    = this.config.HEALTH;
    this.maxHealth = this.config.HEALTH;
    this.score     = this.config.SCORE;

    // 3D CURVE TRACKING
    this.curveProgress = curveProgress; // POSITION ON TUNNEL CURVE
    this.spawnProgress = curveProgress; // ORIGINAL SPAWN POSITION
    this.scale = 0.05;                   // SMALL -> BIG -- FAKE APPROACHING
    this.screenX = x;                   // CACHED SCREEN POS
    this.screenY = y;

    this.spriteKey  = ENEMY_SPRITE[type];
    this.animFrame  = Math.random() * this.config.SPRITE_FRAMES;
    this.animCount  = this.config.SPRITE_FRAMES;
    this.animSpeed  = this.config.ANIM_SPEED;
    this.frameIndex = Math.floor(this.animFrame);
    this.pulsePhase = Math.random() * Math.PI * 2;
    this.zigzagPhase  = Math.random() * Math.PI * 2;
    this.lateralOffset = -(20 + Math.random() * 180)
                       + (Math.random() < 0.2 ? Math.random() * 40 : 0);

    this.isDead = false;

    this.hasDealtCollisionDamage = false;

    const lcfg = CONFIG.ENEMY_LASER;
    this.laserTimer    = lcfg.FIRST_SHOT_MIN
                       + Math.random() * (lcfg.FIRST_SHOT_MAX - lcfg.FIRST_SHOT_MIN);
    this.laserInterval = this.config.LASER_INTERVAL;
    this.laserColor    = this.config.LASER_COLOR;
    this.pendingLaser  = null; 
  }

  update(dt, time, curve, playerProgress) {
    const moveSpeed = 0.05;
    this.curveProgress -= moveSpeed * dt;

    if (this.curveProgress < 0) this.curveProgress += 1;
    if (this.curveProgress > 1) this.curveProgress -= 1;

    let progressDelta = this.spawnProgress - this.curveProgress;
    if (progressDelta < -0.5) progressDelta += 1;
    if (progressDelta >  0.5) progressDelta -= 1;

    const distanceToPlayer = Math.abs(progressDelta) / 0.3;

    this.scale = 0.2 + (Math.min(distanceToPlayer, 1.0) * 0.8);

    this.screenX = window.innerWidth  / 2 + this.lateralOffset;
    this.screenY = window.innerHeight / 2;

    if (this.type === 'ZIGZAG') {
      this.zigzagPhase += this.config.ZIGZAG_FREQUENCY * dt;
      this.screenX += Math.sin(this.zigzagPhase) * this.config.ZIGZAG_AMPLITUDE * this.scale;
    }

    this.x = this.screenX;
    this.y = this.screenY;

    this.pulsePhase += CONFIG.ENEMIES.PULSE_SPEED * dt;

    this.animFrame  = (this.animFrame + this.animSpeed * dt) % this.animCount;
    this.frameIndex = Math.floor(this.animFrame);

    // LASER TIMER 
    if (this.scale > 0.4) {
      this.laserTimer -= dt;
      if (this.laserTimer <= 0) {
        this.laserTimer   = this.laserInterval;
        this.pendingLaser = { x: this.x, y: this.y, color: this.laserColor };
      }
    }

    if (this.scale >= 0.95 || distanceToPlayer >= 1.0) {
      this.isDead = true;
    }
  }

  checkCollision(shipX, shipY) { // RETURNS COLLISION DAMAGE IF CLOSE AND HASN'T ALREADY HIT / 0 OTHERSWISE
    if (this.hasDealtCollisionDamage || this.scale < 0.82) return 0;
    const hitRadius = this.getSize() * 0.75; // SLIGHTLY FORGIVING
    const dx = this.x - shipX;
    const dy = this.y - shipY;
    if ((dx * dx + dy * dy) < (hitRadius * hitRadius)) {
      this.hasDealtCollisionDamage = true;
      this.isDead = true;
      return this.config.COLLISION_DAMAGE;
    }
    return 0;
  }

  draw(ctx) {
    ctx.save();
    ctx.globalAlpha = 1.0;

    const sprite      = ImageLoader.get(this.spriteKey);
    const renderSize  = CONFIG.ENEMIES.SPRITE_SIZE * this.scale;

    if (sprite) {
      const frameWidth = sprite.width / this.animCount;
      const sx = this.frameIndex * frameWidth;

      ctx.drawImage(
        sprite,
        sx, 0, frameWidth, sprite.height,
        this.x - renderSize / 2,
        this.y - renderSize / 2,
        renderSize, renderSize
      );
    } else {
      ctx.fillStyle = this.color;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size * this.scale, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();

    if (this.type === 'TANK' && this.health < this.maxHealth) {
      const barWidth  = this.size * 2 * this.scale;
      const barHeight = 4;
      const barY      = this.y - (this.size * this.scale) - 10;

      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(this.x - barWidth / 2, barY, barWidth, barHeight);

      const pct = this.health / this.maxHealth;
      ctx.fillStyle = pct > 0.5 ? '#00ff00' : '#ff0000';
      ctx.fillRect(this.x - barWidth / 2, barY, barWidth * pct, barHeight);
    }
  }

  takeDamage(amount = 1) {
    this.health -= amount;
    if (this.health <= 0) {
      this.isDead = true;
      return true;
    }
    return false;
  }

  getPosition() { return { x: this.x, y: this.y }; }

  getSize() {
    return (CONFIG.ENEMIES.SPRITE_SIZE / 2) * this.scale;
  }
}

export class EnemyManager {
  constructor(particleSystem, tunnel) {
    this.enemies    = [];
    this.lasers     = [];
    this.particleSystem = particleSystem;
    this.tunnel     = tunnel;
    this.spawnTimer = 0;
    this.nextSpawnDelay = this.randomSpawnDelay();
    this.time       = 0;

    this.onLaserFired = null; 
  }

  randomSpawnDelay() {
    return CONFIG.ENEMIES.SPAWN_INTERVAL_MIN
         + Math.random() * (CONFIG.ENEMIES.SPAWN_INTERVAL_MAX - CONFIG.ENEMIES.SPAWN_INTERVAL_MIN);
  }

  getRandomEnemyType() {
    const rand = Math.random();
    if (rand < 0.40) return 'BASIC';
    if (rand < 0.65) return 'FAST';
    if (rand < 0.80) return 'ZIGZAG';
    return 'TANK';
  }

  spawnEnemy() {
    if (this.enemies.length >= CONFIG.ENEMIES.MAX_COUNT) return;

    const playerProgress = (this.tunnel.getTime() * CONFIG.TUNNEL.SPEED) % 1;
    const spawnProgress  = (playerProgress + 0.3) % 1;
    const x    = window.innerWidth  / 2;
    const y    = window.innerHeight / 2;
    const type = this.getRandomEnemyType();

    this.enemies.push(new Enemy(x, y, type, spawnProgress));
  }

  update(dt, shipX, shipY) { // shipX/shipY - SO LASERS KNOW WHERE TO AIM
    this.time += dt;

    const playerProgress = (this.tunnel.getTime() * CONFIG.TUNNEL.SPEED) % 1;
    const curve = this.tunnel.curve;

    this.spawnTimer += dt;
    if (this.spawnTimer >= this.nextSpawnDelay) {
      this.spawnEnemy();
      this.spawnTimer = 0;
      this.nextSpawnDelay = this.randomSpawnDelay();
    }

    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const enemy = this.enemies[i];
      enemy.update(dt, this.time, curve, playerProgress);

      if (enemy.pendingLaser) { // COLLECT ANY LASER THIS ENEMY WANTS TO FIRE THIS FRAME
        const pl = enemy.pendingLaser;
        this.lasers.push(new EnemyLaser(pl.x, pl.y, shipX, shipY, pl.color));
        this.onLaserFired?.();
        enemy.pendingLaser = null;
      }

      if (enemy.isDead) this.enemies.splice(i, 1);
    }

    for (let i = this.lasers.length - 1; i >= 0; i--) {
      this.lasers[i].update(dt);
      if (this.lasers[i].isDead) this.lasers.splice(i, 1);
    }
  }

  checkLaserHits(shipX, shipY) { // CHECK ALL ENEMY LASERS V SHIP - RETURNS TOTAL DAMAGE DEALT THIS FRAME
    let totalDamage = 0;
    for (let i = this.lasers.length - 1; i >= 0; i--) {
      if (this.lasers[i].checkShipHit(shipX, shipY)) {
        totalDamage += CONFIG.ENEMY_LASER.DAMAGE;
        this.lasers.splice(i, 1);
      }
    }
    return totalDamage;
  }
 
  checkCollisions(shipX, shipY) {  // CHECK ALL ENEMIES FOR BODY COLLISION WITH SHIP - RETURNS TOTSL DAMAGE DEALT THIS FRAME
    let totalDamage = 0;
    for (const enemy of this.enemies) {
      totalDamage += enemy.checkCollision(shipX, shipY);
    }
    return totalDamage;
  }

  draw(ctx) {
    for (let i = this.enemies.length - 1; i >= 0; i--) this.enemies[i].draw(ctx);
    for (const laser of this.lasers) laser.draw(ctx);
  }

  getEnemies() { return this.enemies; }
  clear()      { this.enemies = []; this.lasers = []; }
  getCount()   { return this.enemies.length; }
}