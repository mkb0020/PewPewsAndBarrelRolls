// enemies.js
// ~~~~~~~~~~~~~~~~~~~~ IMPORTS ~~~~~~~~~~~~~~~~~~~~
import { CONFIG } from './config.js';
// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

export class Enemy {
  constructor(x, y, type = 'BASIC', curveProgress = 0) {
    this.x = x;
    this.y = y;
    this.type = type;
    this.config = CONFIG.ENEMIES.TYPES[type];
    
    this.size = this.config.SIZE;
    this.speed = this.config.SPEED;
    this.color = this.config.COLOR;
    this.glowColor = this.config.GLOW_COLOR;
    this.health = this.config.HEALTH;
    this.maxHealth = this.config.HEALTH;
    this.score = this.config.SCORE;
    
    // 3D CURVE TRACKING
    this.curveProgress = curveProgress; // POSITION ON TUNNEL CURVE
    this.spawnProgress = curveProgress; // ORIGINAL SPWAN POSITION
    this.scale = 0.2; // SMALL -> BIG - FAKE APPROACHING
    this.screenX = x; // CACHED SCREEN POS
    this.screenY = y;
    
    this.useSprite = true;

    // SPRITE ANIMATION 
    const range = CONFIG.ENEMIES.FRAME_RANGES[type] || CONFIG.ENEMIES.FRAME_RANGES.BASIC;
    this.animStart  = range.start;
    this.animCount  = range.count;
    this.animSpeed  = CONFIG.ENEMIES.ANIM_SPEEDS[type] || 12; // FPS
    this.animFrame  = Math.random() * this.animCount; // STAGGER STARTING FRAME
    this.spriteFrame = this.animStart + Math.floor(this.animFrame); // SHEET INDEX
    
    // VISUAL EFFECTS
    this.pulsePhase = Math.random() * Math.PI * 2;
    
    // MOVEMENT PATTERNS
    this.zigzagPhase = Math.random() * Math.PI * 2;
    // BIAS LEFT 
    this.lateralOffset = -(20 + Math.random() * 180) + (Math.random() < 0.2 ? Math.random() * 40 : 0);
    
    this.isDead = false;
  }

  update(dt, time, curve, playerProgress) {    // MOVE ALONG CURVE TOWARDS PLAYER - MOVE BACKWARDS ON THE CURVE ( DECREASING PROGRESS)
    const moveSpeed = 0.05; // CURVE PROGRESS PER SECOND
    this.curveProgress -= moveSpeed * dt;
  
    if (this.curveProgress < 0) {
      this.curveProgress += 1;
    }
    if (this.curveProgress > 1) {
      this.curveProgress -= 1;
    }
    
    let progressDelta = this.spawnProgress - this.curveProgress; // CALCULATE HOW CLOSE TO PLAYER (0 @ SPAWN, 1 @ PLAYER)
    
    // WRAP AROUND FOR CIRCULAR CURVE  
    if (progressDelta < -0.5) progressDelta += 1;
    if (progressDelta > 0.5) progressDelta -= 1;
    
    const distanceToPlayer = Math.abs(progressDelta) / 0.3; // 0.3 = SPAWN DISTANCE
    
    this.scale = 0.2 + (Math.min(distanceToPlayer, 1.0) * 0.8);  // SCALE AS APPROACHING ( 0.2 TO 1 )
    
    // APPLY FULL OFFSET FROM THE START
    this.screenX = window.innerWidth / 2 + this.lateralOffset;
    this.screenY = window.innerHeight / 2;
 
    if (this.type === 'ZIGZAG') {
      this.zigzagPhase += this.config.ZIGZAG_FREQUENCY * dt;
      this.screenX += Math.sin(this.zigzagPhase) * this.config.ZIGZAG_AMPLITUDE * this.scale;
    }
    
    this.x = this.screenX;
    this.y = this.screenY;
    
    this.pulsePhase += CONFIG.ENEMIES.PULSE_SPEED * dt;

    // ADVANCE ANIMATION Ã¢â‚¬â€ SPRITE SHEET FRAME RANGES
    this.animFrame = (this.animFrame + this.animSpeed * dt) % this.animCount;
    this.spriteFrame = this.animStart + Math.floor(this.animFrame);
    
    if (this.scale >= 0.95 || distanceToPlayer >= 1.0) {
      this.isDead = true;
    }
  }

  draw(ctx, enemySprite, spriteLoaded, frameWidth) {
    ctx.save();
    ctx.globalAlpha = 1.0; 
    
    if (spriteLoaded && this.useSprite) {
      const sx = this.spriteFrame * frameWidth;
      const sy = 0;
      const sw = frameWidth;
      const sh = enemySprite.height;
      const renderSize = CONFIG.ENEMIES.SPRITE_SIZE * this.scale; // SCALE
      
      ctx.drawImage(
        enemySprite,
        sx, sy, sw, sh,
        this.x - renderSize / 2,
        this.y - renderSize / 2,
        renderSize,
        renderSize
      );
    } else { // FALLBACK
      ctx.fillStyle = this.color;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size * this.scale, 0, Math.PI * 2);
      ctx.fill();
    }
    
    ctx.restore();
    
    if (this.type === 'TANK' && this.health < this.maxHealth) { // HEALTH INDICATOR FOR TANKS
      const barWidth = this.size * 2 * this.scale;
      const barHeight = 4;
      const barY = this.y - (this.size * this.scale) - 10;
      
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.fillRect(this.x - barWidth / 2, barY, barWidth, barHeight);
      
      const healthPercent = this.health / this.maxHealth;
      ctx.fillStyle = healthPercent > 0.5 ? '#00ff00' : '#ff0000';
      ctx.fillRect(this.x - barWidth / 2, barY, barWidth * healthPercent, barHeight);
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

  getPosition() {
    return { x: this.x, y: this.y };
  }

  getSize() {
    return (CONFIG.ENEMIES.SPRITE_SIZE / 2) * this.scale; // HITBOX = SPRITE VISUAL RADIUS NOT ABSTRACT SIZE
  }
}

export class EnemyManager {
  constructor(particleSystem, tunnel) {
    this.enemies = [];
    this.particleSystem = particleSystem;
    this.tunnel = tunnel; 
    this.spawnTimer = 0;
    this.nextSpawnDelay = this.randomSpawnDelay();
    this.time = 0;
    
    this.enemySprite = new Image();
    this.enemySprite.src = CONFIG.ENEMIES.SPRITE_PATH;
    this.spriteLoaded = false;
    this.frameWidth = 0;
    
    this.enemySprite.onload = () => {
      this.spriteLoaded = true;
      this.frameWidth = this.enemySprite.width / CONFIG.ENEMIES.SPRITE_FRAMES;
      console.log('ÃƒÆ’Ã‚Â¢Ãƒâ€¦Ã¢â‚¬Å“ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œ Enemy sprite sheet loaded');
    };
    
    this.enemySprite.onerror = () => {
      console.warn('ÃƒÆ’Ã‚Â¢Ãƒâ€¦Ã‚Â¡Ãƒâ€šÃ‚Â  Enemy sprite not found, using fallback rendering');
    };
    
    console.log('ÃƒÆ’Ã‚Â¢Ãƒâ€¦Ã¢â‚¬Å“ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œ Enemy manager initialized');
  }

  randomSpawnDelay() {
    return CONFIG.ENEMIES.SPAWN_INTERVAL_MIN + 
           Math.random() * (CONFIG.ENEMIES.SPAWN_INTERVAL_MAX - CONFIG.ENEMIES.SPAWN_INTERVAL_MIN);
  }

  getRandomEnemyType() {
    const rand = Math.random();
    
 
    if (rand < 0.5) return 'BASIC';      
    if (rand < 0.75) return 'FAST';      
    if (rand < 0.9) return 'ZIGZAG';    
    return 'TANK';                        
  }

  spawnEnemy() {
    if (this.enemies.length >= CONFIG.ENEMIES.MAX_COUNT) return;
    
    const playerProgress = (this.tunnel.getTime() * CONFIG.TUNNEL.SPEED) % 1;
    const spawnDistance = 0.3;
    const spawnProgress = (playerProgress + spawnDistance) % 1;
    const x = window.innerWidth / 2;
    const y = window.innerHeight / 2;
    const type = this.getRandomEnemyType();
    const enemy = new Enemy(x, y, type, spawnProgress);
    
    this.enemies.push(enemy);
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
      
      if (enemy.isDead) {
        this.enemies.splice(i, 1);
      }
    }
  }

  draw(ctx) {
    this.enemies.forEach(enemy => {
      enemy.draw(ctx, this.enemySprite, this.spriteLoaded, this.frameWidth);
    });
  }

  getEnemies() {
    return this.enemies;
  }

  clear() {
    this.enemies = [];
  }

  getCount() {
    return this.enemies.length;
  }
}