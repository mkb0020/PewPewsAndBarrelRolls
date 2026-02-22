// babyWorm.js
// ~~~~~~~~~~~~~~~~~~~~ IMPORTS ~~~~~~~~~~~~~~~~~~~~
import { CONFIG } from './config.js';
// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

const BW = CONFIG.BABY_WORM; // SHORTHAND

class BabyWorm {
  constructor(x, y, spawnIndex) {
    this.x = x;
    this.y = y;

    this.segments = Array.from({ length: BW.NUM_SEGMENTS }, () => ({ x, y }));     // SEGMENT CHAIN — ALL START AT MOUTH POSITION

    const scatterAngle = (spawnIndex / BW.SPAWN_COUNT) * Math.PI * 2 + Math.random() * 0.5; // VELOCITY — INITIAL BURST SCATTER SO THEY DON'T ALL OVERLAP
    this.vx = Math.cos(scatterAngle) * 60;
    this.vy = Math.sin(scatterAngle) * 60;
    this.speed = BW.SEEK_SPEED;

    this.wigglePhase = spawnIndex * 1.3 + Math.random() * Math.PI; // ORGANIC WIGGLE — PHASE-STAGGERED PER WORM SO THEY MOVE INDEPENDENTLY
    this.time = 0;
    this.alpha = 0; // FADE IN OVER FIRST FEW FRAMES

    this.trail = Array.from({ length: BW.TRAIL_LENGTH }, () => ({ x, y })); // TRAIL — RING BUFFER OF RECENT HEAD POSITIONS

    this.isLatched    = false; // LATCH STATE
    this.latchAngle   = (spawnIndex / BW.SPAWN_COUNT) * Math.PI * 2; // SPREAD AROUND SHIP
    this.latchDist    = BW.LATCH_ORBIT_DIST;

    this.flashTimer = 0; // HIT FLASH

    this.isDead  = false;
    this.health  = 1;
  }

  update(dt, shipX, shipY) {
    if (this.isDead) return;
    this.time += dt;
    this.alpha = Math.min(1, this.alpha + dt * 5);

    if (this.isLatched) { //  ORBIT SHIP
      this.latchAngle += BW.LATCH_ORBIT_SPEED * dt;
      this.x = shipX + Math.cos(this.latchAngle) * this.latchDist;
      this.y = shipY + Math.sin(this.latchAngle) * this.latchDist;

    } else { //  SEEK SHIP
      const dx   = shipX - this.x;
      const dy   = shipY - this.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < BW.LATCH_RADIUS) { // LATCH WHEN CLOSE ENOUGH
        this.isLatched  = true;
        this.latchAngle = Math.atan2(this.y - shipY, this.x - shipX);
        return;
      }

      const nx = dx / dist; // NORMALIZED DIRECTION TOWARD SHIP
      const ny = dy / dist;

      const perpX  = -ny; // PERPENDICULAR WOBBLE — GIVES THE ORGANIC SLITHERING LOOK
      const perpY  =  nx;
      const wobble = Math.sin(this.time * BW.WIGGLE_FREQ + this.wigglePhase) * BW.WIGGLE_AMP;

      this.speed = Math.min(this.speed + BW.SEEK_ACCEL * dt, BW.MAX_SPEED); // ACCELERATE TOWARD SHIP

      this.vx = nx * this.speed + perpX * wobble;
      this.vy = ny * this.speed + perpY * wobble;

      this.x += this.vx * dt;
      this.y += this.vy * dt;
    }

    //  SEGMENT CHAIN IK 
    this.segments[0].x = this.x;
    this.segments[0].y = this.y;
    for (let i = 1; i < this.segments.length; i++) {
      const prev = this.segments[i - 1];
      const curr = this.segments[i];
      const sdx  = curr.x - prev.x;
      const sdy  = curr.y - prev.y;
      const sd   = Math.sqrt(sdx * sdx + sdy * sdy);
      if (sd > BW.SEGMENT_SPACING) {
        const r  = BW.SEGMENT_SPACING / sd;
        curr.x = prev.x + sdx * r;
        curr.y = prev.y + sdy * r;
      }
    }

    //  TRAIL — PUSH HEAD, DROP OLDEST 
    this.trail.unshift({ x: this.x, y: this.y });
    if (this.trail.length > BW.TRAIL_LENGTH) this.trail.pop();

    if (this.flashTimer > 0) this.flashTimer -= dt;
  }

  draw(ctx, sprite, frameWidth) {
    if (this.isDead) return;

    ctx.save();

    //  SLIME TRAIL 
    for (let i = 0; i < this.trail.length; i++) {
      const t     = i / (this.trail.length - 1); // 0=FRESHEST, 1=OLDEST
      const size  = BW.TRAIL_MAX_SIZE * (1 - t * 0.85);
      const alpha = BW.TRAIL_MAX_ALPHA * (1 - t) * this.alpha;
      if (alpha < 0.01) continue;

      ctx.globalAlpha  = alpha;
      ctx.fillStyle    = BW.TRAIL_COLOR;
      ctx.shadowColor  = BW.TRAIL_GLOW;
      ctx.shadowBlur   = 10;
      ctx.beginPath();
      ctx.arc(this.trail[i].x, this.trail[i].y, Math.max(0.5, size), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;

    ctx.globalAlpha = this.alpha; //  BODY SEGMENTS — TAIL FIRST SO HEAD RENDERS ON TOP 
    for (let i = this.segments.length - 1; i >= 0; i--) {
      const seg   = this.segments[i];
      const taper = i / (this.segments.length - 1);                      // 0=NEAR HEAD, 1=TAIL
      const scale = 1 - taper * (1 - 0.38);                              // TAPER TO 38%
      const size  = BW.HEAD_SIZE * BW.SEGMENT_SIZE_RATIO * scale;

      let angle = 0; // POINT TOWARD THE SEGMENT AHEAD (HEAD DIRECTION)
      const ref = i > 0 ? this.segments[i - 1] : { x: this.x, y: this.y };
      angle = Math.atan2(ref.y - seg.y, ref.x - seg.x) - Math.PI / 2;

      ctx.save();
      ctx.translate(seg.x, seg.y);
      ctx.rotate(angle);

      if (sprite && frameWidth > 0) {
        ctx.drawImage(sprite, frameWidth, 0, frameWidth, sprite.height,
          -size / 2, -size / 2, size, size);
      } else {
        ctx.fillStyle = '#33cc66';
        ctx.beginPath();
        ctx.arc(0, 0, size / 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    const headSize = BW.HEAD_SIZE; //  HEAD 
    let headAngle;
    if (this.isLatched) {
      headAngle = this.latchAngle + Math.PI / 2; // FACE INWARD TOWARD SHIP WHEN LATCHED
    } else {
      const mag = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
      headAngle = mag > 1 ? Math.atan2(this.vy, this.vx) - Math.PI / 2 : 0;
    }

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(headAngle);

    if (this.flashTimer > 0) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.7;
    }

    if (sprite && frameWidth > 0) {
      ctx.drawImage(sprite, 0, 0, frameWidth, sprite.height,
        -headSize / 2, -headSize / 2, headSize, headSize);
    } else {
      ctx.fillStyle = '#00ff55';
      ctx.beginPath();
      ctx.arc(0, 0, headSize / 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    ctx.restore();
  }

  takeDamage() {
    this.health--;
    this.flashTimer = 0.08;
    if (this.health <= 0) {
      this.isDead = true;
      return true; // KILLED
    }
    return false;
  }

  detach() { // CALLED BY BARREL ROLL — FLING OFF AND DIE
    this.isLatched = false;
    this.isDead    = true;
  }

  getHeadPos() {
    return { x: this.x, y: this.y };
  }
}

// ======================= BABY WORM MANAGER =======================
export class BabyWormManager {
  constructor() {
    this.worms       = [];
    this.spawnQueue  = []; // { delay, x, y, index }
    this.spawnTimer  = 0;
    this._spawning   = false;

    this.sprite      = new Image();
    this.frameWidth  = 0;
    this.spriteLoaded = false;
    this.sprite.src  = BW.SPRITE_PATH;
    this.sprite.onload = () => {
      this.spriteLoaded = true;
      this.frameWidth   = this.sprite.width / BW.SPRITE_FRAMES;
      console.log('✔ Baby worm sprite loaded');
    };
    this.sprite.onerror = () => {
      console.warn('⚠ Baby worm sprite not found — using fallback circles');
    };

    console.log('✔ BabyWormManager initialized');
  }

  spawnWave(mouthX, mouthY) { // CALLED BY wormBoss.onSpawnBabyWorms — QUEUES STAGGERED SPAWNS
    this.spawnQueue = [];
    this.spawnTimer = 0;
    this._spawning  = true;
    for (let i = 0; i < BW.SPAWN_COUNT; i++) {
      this.spawnQueue.push({
        delay: i * BW.SPAWN_INTERVAL,
        x:     mouthX,
        y:     mouthY,
        index: i,
      });
    }
  }

  update(dt, ship) { // PROCESS SPAWN QUEUE 
    if (this._spawning && this.spawnQueue.length > 0) {
      this.spawnTimer += dt;
      while (this.spawnQueue.length > 0 && this.spawnTimer >= this.spawnQueue[0].delay) {
        const e = this.spawnQueue.shift();
        this.worms.push(new BabyWorm(e.x, e.y, e.index));
      }
      if (this.spawnQueue.length === 0) this._spawning = false;
    }

    let latchedCount = 0; // UPDATE ALL WORMS
    for (let i = this.worms.length - 1; i >= 0; i--) {
      const w = this.worms[i];
      w.update(dt, ship.x, ship.y);
      if (w.isLatched && !w.isDead) latchedCount++;
      if (w.isDead) this.worms.splice(i, 1);
    }

    if (latchedCount > 0) { // LATCH DAMAGE — CONTINUOUS, NO IFRAMES
      ship.takeLatchDamage(BW.LATCH_DAMAGE_RATE * latchedCount * dt);
    }
  }

  draw(ctx) {
    const spr = this.spriteLoaded ? this.sprite : null;
    this.worms.forEach(w => w.draw(ctx, spr, this.frameWidth));
  }

  checkProjectileHit(seg) {   // CHECK A PROJECTILE SEGMENT AGAINST ALL NON-LATCHED BABY WORMS / LATCHED ONES CAN ONLY BE REMOVED BY BARREL ROLL 
    for (let i = this.worms.length - 1; i >= 0; i--) {
      const w = this.worms[i];
      if (w.isDead || w.isLatched) continue;
      const dx   = seg.x1 - w.x;
      const dy   = seg.y1 - w.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < BW.HEAD_SIZE * 0.5) {
        const killed = w.takeDamage();
        return { hit: true, x: w.x, y: w.y, killed };
      }
    }
    return { hit: false };
  }

  detachAll() { // BARREL ROLL — FLING ALL LATCHED WORMS, RETURNS COUNT DETACHED
    let count = 0;
    for (const w of this.worms) {
      if (w.isLatched) { w.detach(); count++; }
    }
    return count;
  }

  hasLatched()  { return this.worms.some(w => w.isLatched && !w.isDead); }
  getCount()    { return this.worms.length; }

  clear() {
    this.worms      = [];
    this.spawnQueue = [];
    this._spawning  = false;
    this.spawnTimer = 0;
  }
}