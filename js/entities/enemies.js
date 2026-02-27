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

    // ─── 3D CURVE / APPROACH ───
    this.curveProgress = curveProgress;
    this.spawnProgress = curveProgress;
    this.scale         = 0.05;
    this.screenX       = x;
    this.screenY       = y;

    // ─── SPRITE / ANIMATION ───
    this.spriteKey  = ENEMY_SPRITE[type];
    this.animFrame  = Math.random() * this.config.SPRITE_FRAMES;
    this.animCount  = this.config.SPRITE_FRAMES;
    this.animSpeed  = this.config.ANIM_SPEED;
    this.frameIndex = Math.floor(this.animFrame);
    this.pulsePhase = Math.random() * Math.PI * 2;

    // ─── PHASE STATE MACHINE ───
    this.phase        = 'APPROACH';  // 'APPROACH' | 'COMBAT'
    this.combatTimer  = 0;

    // ─── APPROACH-SPECIFIC ───
    this.zigzagPhase    = Math.random() * Math.PI * 2;
    this.lateralOffset  = -(20 + Math.random() * 180)
                        + (Math.random() < 0.2 ? Math.random() * 40 : 0);

    // ─── COMBAT WANDER (shared by BASIC / FAST / TANK / ZIGZAG) ───
    this.wanderTargetX = x;
    this.wanderTargetY = y;

    // ─── FLIM FLAM SPECIFIC ───
    if (this.type === 'FLIMFLAM') {
      this.wingCycle        = [0, 1, 2, 1];
      this.wingT            = 0;
      this.wingIndex        = 0;
      this.bodyT            = 0;
      this.bodyIndex        = 0;
      this.ffState          = 'HOVER';
      this.ffTimer          = 0.3 + Math.random() * 0.4;
      this.ffTargetX        = window.innerWidth  / 2;
      this.ffTargetY        = window.innerHeight / 2;
      this.ffBobPhase       = Math.random() * Math.PI * 2;
      this.pendingBuzzStart = true;
      this.stopBuzz         = null;
      // OCULAR PRISM ATTACK STATE
      this.ffAttackState    = 'IDLE';       // 'IDLE' | 'TELEGRAPHING'
      this.ffAttackTimer    = this.config.PRISM_FIRST_DELAY_MIN
                            + Math.random() * (this.config.PRISM_FIRST_DELAY_MAX - this.config.PRISM_FIRST_DELAY_MIN);
      this.pendingOcularPrism = false;
    }

    this.isDead = false;
    this.hasDealtCollisionDamage = false;

    // ─── LASERS ───
    const lcfg = CONFIG.ENEMY_LASER;
    this.laserTimer    = lcfg.FIRST_SHOT_MIN
                       + Math.random() * (lcfg.FIRST_SHOT_MAX - lcfg.FIRST_SHOT_MIN);
    this.laserInterval = this.config.LASER_INTERVAL;
    this.laserColor    = this.config.LASER_COLOR;
    this.pendingLaser  = null;

    // ─── TANK SLIME ATTACK ───
    if (this.type === 'TANK') {
      const scfg = CONFIG.SLIME_ATTACK;
      this.slimeTimer   = scfg.FIRST_ATTACK_MIN
                        + Math.random() * (scfg.FIRST_ATTACK_MAX - scfg.FIRST_ATTACK_MIN);
      this.pendingSlime = false;
    }
  }

  update(dt, time, curve, playerProgress) {
    // ─── ANIMATION (always runs) ───
    this.pulsePhase += CONFIG.ENEMIES.PULSE_SPEED * dt;

    if (this.type === 'FLIMFLAM') {
      this.wingT    += this.config.WING_ANIM_SPEED * dt;
      this.wingIndex = this.wingCycle[Math.floor(this.wingT) % 4];
      this.bodyT     = (this.bodyT + this.config.ANIM_SPEED * dt) % this.config.BODY_FRAMES;
      this.bodyIndex = Math.floor(this.bodyT);
    } else {
      this.animFrame  = (this.animFrame + this.animSpeed * dt) % this.animCount;
      this.frameIndex = Math.floor(this.animFrame);
    }

    // ═══════════════════════════════════════════════
    //  PHASE: APPROACH
    // ═══════════════════════════════════════════════
    if (this.phase === 'APPROACH') {
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
      if (this.type === 'FLIMFLAM') this._updateFlimFlamMove(dt);

      this.x = this.screenX;
      this.y = this.screenY;

      // ─── TRANSITION TO COMBAT ───
      if (this.scale >= CONFIG.ENEMIES.COMBAT_SCALE) {
        this.phase       = 'COMBAT';
        this.scale       = CONFIG.ENEMIES.COMBAT_SCALE;
        this.combatTimer = this.config.COMBAT_DURATION;
        this._pickNewWanderTarget();
      }
      return;
    }

    // ═══════════════════════════════════════════════
    //  PHASE: COMBAT
    // ═══════════════════════════════════════════════
    this.combatTimer -= dt;
    if (this.combatTimer <= 0) {
      this.isDead = true;
      return;
    }

    // ─── COMBAT MOVEMENT ───
    if (this.type === 'FLIMFLAM') {
      this._updateFlimFlamMove(dt);
      this.x = this.screenX;
      this.y = this.screenY;

    } else if (this.type === 'ZIGZAG') {
      this._updateWander(dt, false);
      this.zigzagPhase += this.config.ZIGZAG_FREQUENCY * dt;
      this.x = this.screenX + Math.sin(this.zigzagPhase) * this.config.ZIGZAG_AMPLITUDE;
      this.y = this.screenY;

    } else {
      this._updateWander(dt, true);
      this.x = this.screenX;
      this.y = this.screenY;
    }

    // ─── LASERS  ───
    const isTelegraphing = this.type === 'FLIMFLAM' && this.ffAttackState === 'TELEGRAPHING';
    if (!isTelegraphing) {
      this.laserTimer -= dt;
      if (this.laserTimer <= 0) {
        this.laserTimer   = this.laserInterval;
        this.pendingLaser = { x: this.x, y: this.y, color: this.laserColor };
      }
    }

    // ─── FLIM FLAM OCULAR PRISM ATTACK STATE MACHINE ───
    if (this.type === 'FLIMFLAM') {
      const cfg = this.config;
      this.ffAttackTimer -= dt;

      if (this.ffAttackState === 'IDLE' && this.ffAttackTimer <= 0) {
        this.ffAttackState = 'TELEGRAPHING';
        this.ffAttackTimer = cfg.PRISM_TELEGRAPH;
      } else if (this.ffAttackState === 'TELEGRAPHING' && this.ffAttackTimer <= 0) {
        this.pendingOcularPrism = true;
        this.ffAttackState      = 'IDLE';
        this.ffAttackTimer      = cfg.PRISM_COOLDOWN_MIN
                                + Math.random() * (cfg.PRISM_COOLDOWN_MAX - cfg.PRISM_COOLDOWN_MIN);
        this.laserTimer = 1.0; 
      }
    }

    // ─── TANK SLIME ───
    if (this.type === 'TANK') {
      this.slimeTimer -= dt;
      if (this.slimeTimer <= 0) {
        this.slimeTimer   = CONFIG.SLIME_ATTACK.REPEAT_INTERVAL;
        this.pendingSlime = true;
      }
    }
  }

  // ─── WANDER HELPERS ─────────────────────────────────────────────────────────
  _updateWander(dt, fullXY = true) {
    const step = this.config.WANDER_SPEED * dt;
    const dx   = this.wanderTargetX - this.screenX;
    const dy   = this.wanderTargetY - this.screenY;
    const dist = fullXY ? Math.sqrt(dx * dx + dy * dy) : Math.abs(dy);

    if (dist <= step + 2) {
      if (fullXY) { this.screenX = this.wanderTargetX; this.screenY = this.wanderTargetY; }
      else        { this.screenY = this.wanderTargetY; }
      this._pickNewWanderTarget();
    } else {
      if (fullXY) { const inv = 1 / dist; this.screenX += dx * inv * step; this.screenY += dy * inv * step; }
      else        { this.screenY += (dy > 0 ? 1 : -1) * step; }
    }
  }

  _pickNewWanderTarget() {
    const { WANDER_X, WANDER_Y } = this.config;
    const margin = 90;
    const cx = window.innerWidth  / 2;
    const cy = window.innerHeight / 2;
    this.wanderTargetX = Math.max(margin, Math.min(window.innerWidth  - margin, cx + (Math.random() * 2 - 1) * WANDER_X));
    this.wanderTargetY = Math.max(margin, Math.min(window.innerHeight - margin, cy + (Math.random() * 2 - 1) * WANDER_Y));
  }

  // ─── FLIM FLAM HOVER-DASH ───────────────────────────────────────────────────
  _updateFlimFlamMove(dt) {
    const cfg    = this.config;
    const margin = 90;
    const cx = window.innerWidth  / 2;
    const cy = window.innerHeight / 2;

    this.ffTimer -= dt;

    if (this.ffState === 'HOVER') {
      this.ffBobPhase += cfg.BOB_SPEED * dt;
      this.screenX = this.ffTargetX;
      this.screenY = this.ffTargetY + Math.sin(this.ffBobPhase) * cfg.BOB_AMPLITUDE * this.scale;

      if (this.ffTimer <= 0) {
        this.ffTargetX = Math.max(margin, Math.min(window.innerWidth  - margin, cx + (Math.random() * 2 - 1) * cfg.ROAM_X));
        this.ffTargetY = Math.max(margin, Math.min(window.innerHeight - margin, cy + (Math.random() * 2 - 1) * cfg.ROAM_Y));
        this.ffState   = 'DASH';
        this.ffTimer   = 99;
      }
    } else {
      const dx   = this.ffTargetX - this.screenX;
      const dy   = this.ffTargetY - this.screenY;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const step = cfg.DASH_SPEED * this.scale * dt;

      if (dist <= step + 2) {
        this.screenX = this.ffTargetX;
        this.screenY = this.ffTargetY;
        this.ffState = 'HOVER';
        this.ffTimer = cfg.HOVER_DURATION_MIN + Math.random() * (cfg.HOVER_DURATION_MAX - cfg.HOVER_DURATION_MIN);
      } else {
        this.screenX += (dx / dist) * step;
        this.screenY += (dy / dist) * step;
      }
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
    const fadeProgress = Math.min(1, Math.max(0, (this.scale - 0.2) / 0.6));
    const spriteAlpha  = 0.1 + fadeProgress * 0.9;
    const tintAlpha    = (1 - Math.min(1, fadeProgress / 0.2)) * 0.3;
    const renderSize   = CONFIG.ENEMIES.SPRITE_SIZE * this.scale;
    const sprite       = ImageLoader.get(this.spriteKey);

    ctx.save();

    if (this.type === 'FLIMFLAM' && sprite) {
      // ─── FLIM FLAM ───
      ctx.globalAlpha = spriteAlpha;
      const fw  = sprite.width / this.config.SPRITE_FRAMES; 
      const fh  = sprite.height;
      const dx  = this.x - renderSize / 2;
      const dy  = this.y - renderSize / 2;

      ctx.drawImage(sprite, this.wingIndex * fw, 0, fw, fh, dx, dy, renderSize, renderSize);

      if (this.ffAttackState === 'TELEGRAPHING') {
        // RED EYE frame 
        const telegraphPulse = (Math.sin(this.pulsePhase * 4) + 1) * 0.5; 
        ctx.save();
        ctx.shadowColor = '#ff0000';
        ctx.shadowBlur  = 25 + telegraphPulse * 40;
        ctx.globalAlpha = spriteAlpha;
        ctx.drawImage(sprite, this.config.RED_EYE_FRAME * fw, 0, fw, fh, dx, dy, renderSize, renderSize);
        ctx.restore();
      } else {
        ctx.drawImage(sprite, (this.config.BODY_FRAME_OFFSET + this.bodyIndex) * fw, 0, fw, fh, dx, dy, renderSize, renderSize);
      }
    } else {
      // ─── ALL OTHER ENEMIES ───
      ctx.globalAlpha = spriteAlpha;
      if (sprite) {
        const fw = sprite.width / this.animCount;
        ctx.drawImage(sprite, this.frameIndex * fw, 0, fw, sprite.height,
          this.x - renderSize / 2, this.y - renderSize / 2, renderSize, renderSize);
      } else {
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size * this.scale, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // ─── APPROACH TINT OVERLAY ───
    if (tintAlpha > 0.01) {
      ctx.globalAlpha = tintAlpha;
      ctx.fillStyle   = '#000000';
      ctx.beginPath();
      ctx.arc(this.x, this.y, renderSize * 0.5, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();

    // ─── HEALTH BAR  ───
    if (fadeProgress > 0.15) {
      const halfSprite = renderSize * 0.5;
      const barW    = Math.max(55, renderSize * 0.72);
      const barH    = 5;
      const barX    = this.x - barW / 2;
      const barY    = this.y - halfSprite - 16;
      const pct     = this.health / this.maxHealth;
      const barAlpha = Math.min(1, (fadeProgress - 0.15) / 0.3);

      ctx.save();
      ctx.globalAlpha = barAlpha;
      ctx.fillStyle   = 'rgba(0,0,0,0.65)';
      ctx.fillRect(barX - 1, barY - 1, barW + 2, barH + 2);
      const barColor  = pct > 0.55 ? this.glowColor : (pct > 0.28 ? '#ffcc00' : '#ff2200');
      ctx.fillStyle   = barColor;
      ctx.fillRect(barX, barY, barW * pct, barH);
      ctx.restore();
    }

    if (this.phase === 'COMBAT') {
      const halfSprite = renderSize * 0.5;
      const ringPct = this.combatTimer / this.config.COMBAT_DURATION;
      const ringR   = halfSprite + 7;
      ctx.save();
      ctx.globalAlpha = CONFIG.ENEMIES.COMBAT_RING_ALPHA;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth   = 2;
      ctx.lineCap     = 'round';
      ctx.beginPath();
      ctx.arc(this.x, this.y, ringR, -Math.PI / 2, -Math.PI / 2 + ringPct * Math.PI * 2);
      ctx.stroke();
      ctx.restore();
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

    this.onLaserFired   = null; 
    this.onSlimeAttack  = null; 
    this.onBuzzStart    = null; 
    this.onOcularPrism  = null; 
  }

  randomSpawnDelay() {
    return CONFIG.ENEMIES.SPAWN_INTERVAL_MIN
         + Math.random() * (CONFIG.ENEMIES.SPAWN_INTERVAL_MAX - CONFIG.ENEMIES.SPAWN_INTERVAL_MIN);
  }

  getRandomEnemyType() {
    const rand = Math.random();
    if (rand < 0.30) return 'BASIC';
    if (rand < 0.50) return 'FAST';
    if (rand < 0.68) return 'ZIGZAG';
    if (rand < 0.84) return 'TANK';
    return 'FLIMFLAM';
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

      // FLIM FLAM BUZZ — START ON FIRST FRAME
      if (enemy.pendingBuzzStart && this.onBuzzStart) {
        enemy.stopBuzz         = this.onBuzzStart();
        enemy.pendingBuzzStart = false;
      }

      // FLIM FLAM OCULAR PRISM — FIRE WHEN TELEGRAPHING COMPLETES
      if (enemy.pendingOcularPrism) {
        this.onOcularPrism?.(window.innerWidth, window.innerHeight);
        enemy.pendingOcularPrism = false;
      }

      // COLLECT SLIME ATTACK (TANK / GLORK ONLY)
      if (enemy.pendingSlime) {
        this.onSlimeAttack?.(enemy.x, enemy.y);
        enemy.pendingSlime = false;
      }

      if (enemy.isDead) {
        enemy.stopBuzz?.(); // STOP BUZZ IF THIS IS A FLIM FLAM
        this.enemies.splice(i, 1);
      }
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
  clear() {
    for (const enemy of this.enemies) enemy.stopBuzz?.();
    this.enemies = [];
    this.lasers  = [];
  }
  getCount()   { return this.enemies.length; }
}