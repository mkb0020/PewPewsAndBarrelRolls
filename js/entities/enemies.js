// enemies.js
// ~~~~~~~~~~~~~~~~~~~~ IMPORTS ~~~~~~~~~~~~~~~~~~~~
import { CONFIG } from '../utils/config.js';
import { ImageLoader, ENEMY_SPRITE } from '../utils/imageLoader.js';
// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

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
    this.scale = 0.2;                   // SMALL → BIG — FAKE APPROACHING
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
  }

  update(dt, time, curve, playerProgress) { // MOVE ALONG CURVE TOWARD PLAYER (DECREASING PROGRESS)
    const moveSpeed = 0.05;
    this.curveProgress -= moveSpeed * dt;

    if (this.curveProgress < 0) this.curveProgress += 1;
    if (this.curveProgress > 1) this.curveProgress -= 1;

    let progressDelta = this.spawnProgress - this.curveProgress; // HOW CLOSE TO THE PLAYER (0 AT SPAWN, 1 AT PLAYER)
    if (progressDelta < -0.5) progressDelta += 1;
    if (progressDelta >  0.5) progressDelta -= 1;

    const distanceToPlayer = Math.abs(progressDelta) / 0.3; // 0.3 = SPAWN DISTANCE

    this.scale = 0.2 + (Math.min(distanceToPlayer, 1.0) * 0.8); // SCALE UP AS THEY APPROACH (0.2 → 1.0)

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

    if (this.scale >= 0.95 || distanceToPlayer >= 1.0) {
      this.isDead = true;
    }
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
        sx, 0, frameWidth, sprite.height,        // SOURCE
        this.x - renderSize / 2,                 // DEST X
        this.y - renderSize / 2,                 // DEST Y
        renderSize, renderSize                   // DEST SIZE
      );
    } else { // FALLBACK
      ctx.fillStyle = this.color;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size * this.scale, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();

    // HEALTH BAR — TANKS ONLY, WHEN DAMAGED
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
    this.particleSystem = particleSystem;
    this.tunnel     = tunnel;
    this.spawnTimer = 0;
    this.nextSpawnDelay = this.randomSpawnDelay();
    this.time       = 0;
  }

  randomSpawnDelay() {
    return CONFIG.ENEMIES.SPAWN_INTERVAL_MIN
         + Math.random() * (CONFIG.ENEMIES.SPAWN_INTERVAL_MAX - CONFIG.ENEMIES.SPAWN_INTERVAL_MIN);
  }

  getRandomEnemyType() {
    const rand = Math.random();
    if (rand < 0.50) return 'BASIC';
    if (rand < 0.75) return 'FAST';
    if (rand < 0.90) return 'ZIGZAG';
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

  update(dt) {
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
      if (enemy.isDead) this.enemies.splice(i, 1);
    }
  }

  draw(ctx) {
    for (const enemy of this.enemies) enemy.draw(ctx);
  }

  getEnemies() { return this.enemies; }
  clear()      { this.enemies = []; }
  getCount()   { return this.enemies.length; }
}