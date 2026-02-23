// babyWorm.js
// ~~~~~~~~~~~~~~~~~~~~ IMPORTS ~~~~~~~~~~~~~~~~~~~~
import { CONFIG } from '../utils/config.js';
import { ImageLoader } from '../utils/imageLoader.js';
// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

const BW = CONFIG.BABY_WORM; 

class BabyWorm {
  constructor(x, y, spawnIndex) {
    this.x = x;
    this.y = y;

    this.segments = Array.from({ length: BW.NUM_SEGMENTS }, () => ({ x, y })); // SEGMENT CHAIN — ALL START AT MOUTH POSITION

    const scatterAngle = (spawnIndex / BW.SPAWN_COUNT) * Math.PI * 2 + Math.random() * 0.5; // INITIAL BURST SCATTER SO THEY DON'T ALL OVERLAP
    this.vx    = Math.cos(scatterAngle) * 60;
    this.vy    = Math.sin(scatterAngle) * 60;
    this.speed = BW.SEEK_SPEED;

    this.wigglePhase = spawnIndex * 1.3 + Math.random() * Math.PI; // ORGANIC WIGGLE — PHASE-STAGGERED SO WORMS MOVE INDEPENDENTLY
    this.time  = 0;
    this.alpha = 0; // FADE IN OVER FIRST FEW FRAMES

    // TRAIL — RING BUFFER OF RECENT HEAD POSITIONS
    this.trail = Array.from({ length: BW.TRAIL_LENGTH }, () => ({ x, y }));

    // LATCH STATE
    this.isLatched  = false;
    this.latchAngle = (spawnIndex / BW.SPAWN_COUNT) * Math.PI * 2;
    this.latchDist  = BW.LATCH_ORBIT_DIST;

    this.flashTimer = 0;
    this.isDead  = false;
    this.health  = 1;
  }

  update(dt, shipX, shipY) {
    if (this.isDead) return;
    this.time  += dt;
    this.alpha  = Math.min(1, this.alpha + dt * 5);

    if (this.isLatched) {
      // ORBIT SHIP
      this.latchAngle += BW.LATCH_ORBIT_SPEED * dt;
      this.x = shipX + Math.cos(this.latchAngle) * this.latchDist;
      this.y = shipY + Math.sin(this.latchAngle) * this.latchDist;

    } else {
      // SEEK SHIP
      const dx   = shipX - this.x;
      const dy   = shipY - this.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < BW.LATCH_RADIUS) {
        this.isLatched  = true;
        this.latchAngle = Math.atan2(this.y - shipY, this.x - shipX);
        return;
      }

      const nx = dx / dist;
      const ny = dy / dist;

      const perpX  = -ny;  // PERPENDICULAR WOBBLE — ORGANIC SLITHERING
      const perpY  =  nx;
      const wobble = Math.sin(this.time * BW.WIGGLE_FREQ + this.wigglePhase) * BW.WIGGLE_AMP;

      this.speed = Math.min(this.speed + BW.SEEK_ACCEL * dt, BW.MAX_SPEED);
      this.vx    = nx * this.speed + perpX * wobble;
      this.vy    = ny * this.speed + perpY * wobble;

      this.x += this.vx * dt;
      this.y += this.vy * dt;
    }

    // SEGMENT CHAIN IK
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
        curr.x   = prev.x + sdx * r;
        curr.y   = prev.y + sdy * r;
      }
    }

    // TRAIL — PUSH HEAD, DROP OLDEST
    this.trail.unshift({ x: this.x, y: this.y });
    if (this.trail.length > BW.TRAIL_LENGTH) this.trail.pop();

    if (this.flashTimer > 0) this.flashTimer -= dt;
  }

  draw(ctx, sprite) {
    if (this.isDead) return;

    const frameWidth = sprite ? sprite.width / BW.SPRITE_FRAMES : 0;

    ctx.save();


    for (let i = 0; i < this.trail.length; i++) {
      const t     = i / (this.trail.length - 1); // 0=FRESHEST, 1=OLDEST
      const size  = BW.TRAIL_MAX_SIZE * (1 - t * 0.85);
      const alpha = BW.TRAIL_MAX_ALPHA * (1 - t) * this.alpha;
      if (alpha < 0.01) continue;

      ctx.globalAlpha = alpha;
      ctx.fillStyle   = BW.TRAIL_COLOR;
      ctx.shadowColor = BW.TRAIL_GLOW;
      ctx.shadowBlur  = 10;
      ctx.beginPath();
      ctx.arc(this.trail[i].x, this.trail[i].y, Math.max(0.5, size), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;

    ctx.globalAlpha = this.alpha; // BODY SEGMENTS — TAIL FIRST SO HEAD RENDERS ON TOP
    for (let i = this.segments.length - 1; i >= 0; i--) {
      const seg   = this.segments[i];
      const taper = i / (this.segments.length - 1); // 0=NEAR HEAD, 1=TAIL
      const scale = 1 - taper * (1 - 0.5);         // TAPER TO 50%
      const size  = BW.HEAD_SIZE * BW.SEGMENT_SIZE_RATIO * scale;

      const ref   = i > 0 ? this.segments[i - 1] : { x: this.x, y: this.y };
      const angle = Math.atan2(ref.y - seg.y, ref.x - seg.x) - Math.PI / 2;

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

    // HEAD
    const headSize  = BW.HEAD_SIZE;
    let   headAngle;
    if (this.isLatched) {
      headAngle = this.latchAngle + Math.PI / 2;
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
      return true;
    }
    return false;
  }

  detach() {
    this.isLatched = false;
    this.isDead    = true;
  }

  getHeadPos() { return { x: this.x, y: this.y }; }
}

// ======================= SLIME SPLAT =======================
const SLIME_FRAMES   = 11;
const SLIME_FPS      = 15; 
const SLIME_SPLAT_DELAY = 0.25;

class SlimeSplat {
  constructor(canvasW, canvasH) {
    this.frame = 0;
    this.timer = 0;
    this.delay = SLIME_SPLAT_DELAY;
    this.done  = false;

    // SCALE SO HEIGHT === CANVAS HEIGHT; WIDTH DERIVED FROM 16:9 SHEET RATIO
    this.h = canvasH;
    this.w = canvasH * (16 / 9);
    this.x = (canvasW - this.w) / 2;
    this.y = 0;
  }

  update(dt) {
    if (this.done) return;
    if (this.delay > 0) { this.delay -= dt; return; } // WAIT BEFORE SPLAT
    this.timer += dt;
    this.frame  = Math.floor(this.timer * SLIME_FPS);
    if (this.frame >= SLIME_FRAMES) this.done = true;
  }

  draw(ctx, sprite) {
    if (this.done || this.delay > 0 || !sprite) return;
    const frameW = sprite.width / SLIME_FRAMES;
    ctx.save();
    ctx.globalAlpha = 0.8; // SLIGHTLY TRANSLUCENT SO GAME IS STILL READABLE
    ctx.drawImage(
      sprite,
      this.frame * frameW, 0, frameW, sprite.height, // SOURCE
      this.x, this.y, this.w, this.h                 // DEST — FULL CANVAS HEIGHT
    );
    ctx.restore();
  }
}

// ======================= BABY WORM MANAGER =======================
export class BabyWormManager {
  constructor() {
    this.worms      = [];
    this.spawnQueue = [];
    this.spawnTimer = 0;
    this._spawning  = false;
    this._splats    = []; // ACTIVE SlimeSplat INSTANCES
    console.log('✔ BabyWormManager initialized');
  }

  spawnWave(mouthX, mouthY) {
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

  triggerSlimeSplat(canvasW, canvasH) {
    this._splats.push(new SlimeSplat(canvasW, canvasH));
  }

  update(dt, ship) {
    if (this._spawning && this.spawnQueue.length > 0) {
      this.spawnTimer += dt;
      while (this.spawnQueue.length > 0 && this.spawnTimer >= this.spawnQueue[0].delay) {
        const e = this.spawnQueue.shift();
        this.worms.push(new BabyWorm(e.x, e.y, e.index));
      }
      if (this.spawnQueue.length === 0) this._spawning = false;
    }

    let latchedCount = 0;
    for (let i = this.worms.length - 1; i >= 0; i--) {
      const w = this.worms[i];
      w.update(dt, ship.x, ship.y);
      if (w.isLatched && !w.isDead) latchedCount++;
      if (w.isDead) this.worms.splice(i, 1);
    }

    if (latchedCount > 0) {  // LATCH DAMAGE — CONTINUOUS, NO IFRAMES
      ship.takeLatchDamage(BW.LATCH_DAMAGE_RATE * latchedCount * dt);
    }

    // UPDATE SPLATS — CULL FINISHED ONES
    for (let i = this._splats.length - 1; i >= 0; i--) {
      this._splats[i].update(dt);
      if (this._splats[i].done) this._splats.splice(i, 1);
    }
  }

  draw(ctx) { // GET SPRITE ONCE PER  FRAME - NULL IF NOT LOADED - CIRCLE FALL BACKS
    const sprite = ImageLoader.get('babyWorm');
    for (const w of this.worms) w.draw(ctx, sprite);
  }

  drawSlime(ctx) { // DRAW SLIME SPLATS ON TOP OF ALL GAME ELEMENTS
    const sprite = ImageLoader.get('slime');
    for (const s of this._splats) s.draw(ctx, sprite);
  }

  checkProjectileHit(seg) { // LATCHED WORMS ARE IMMUNE TO PROJECTILES — BARREL ROLL ONLY
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

  detachAll() {
    let count = 0;
    for (const w of this.worms) {
      if (w.isLatched) { w.detach(); count++; }
    }
    return count;
  }

  hasLatched() { return this.worms.some(w => w.isLatched && !w.isDead); }
  getCount()   { return this.worms.length; }

  clear() {
    this.worms      = [];
    this.spawnQueue = [];
    this._spawning  = false;
    this.spawnTimer = 0;
  }
}