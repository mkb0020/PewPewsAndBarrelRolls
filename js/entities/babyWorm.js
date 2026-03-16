// Updated 3/16/26 @ 7PM
// babyWorm.js
// ~~~~~~~~~~~~~~~~~~~~ IMPORTS ~~~~~~~~~~~~~~~~~~~~
import { CONFIG } from '../utils/config.js';
import { ImageLoader } from '../utils/imageLoader.js';
// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

const BW = CONFIG.BABY_WORM;

// ── DRIP PARTICLE POOL FOR SLIME FRAGMENTS ────────────────────────────────────────────────────────
const _dripPool = [];
const MAX_DRIPS = 100;

function _getDrip() {
  return _dripPool.length ? _dripPool.pop() : {};
}

function _recycleDrip(d) {
  if (_dripPool.length < MAX_DRIPS) _dripPool.push(d);
} 

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
    this.trail = new Array(BW.TRAIL_LENGTH);
    for (let i = 0; i < BW.TRAIL_LENGTH; i++) {
      this.trail[i] = { x, y };
    }
    this.trailIndex = 0;

    // LATCH STATE
    this.isLatched  = false;
    this.latchAngle = (spawnIndex / BW.SPAWN_COUNT) * Math.PI * 2;
    this.latchDist  = BW.LATCH_ORBIT_DIST;

    this.flashTimer = 0;
    this.isDead  = false;
    this.health  = 1;

    this.state     = "seeking"; // "SEEKING", "LATCHED", "FLUNG"
    this.life      = 0;
    this.rotation  = 0;
    this.spin      = 0;
    this.tearing   = false;
    this.tearTimer = 0;
    this.tearDuration = 0.6;
    this.slimeBurst = false;
    this.drips     = []; // SLIME FRAGMENTS
    this._audioPlayed = false; // PREVENT MULTIPLE AUDIO PLAYS
  }

  update(dt, shipX, shipY) {
    if (this.isDead) return;
    this.time  += dt;
    this.alpha  = Math.min(1, this.alpha + dt * 5);

    if (this.state === "flung") {
      // FLUNG PHYSICS
      this.x += this.vx * dt;
      this.y += this.vy * dt;

      if (!Number.isFinite(this.x)) this.x = 0;
      if (!Number.isFinite(this.y)) this.y = 0;
      if (!Number.isFinite(this.vx)) this.vx = 0;
      if (!Number.isFinite(this.vy)) this.vy = 0;

      this.vx *= 0.98;
      this.vy *= 0.98;
      this.rotation += this.spin * dt;
      this.life -= dt;

      if (this.life <= 0.6 && !this.tearing) {
        this.startMeltyTear();
      }

      if (this.tearing) {
        this.tearTimer += dt;
        const progress = this.tearTimer / this.tearDuration;

        // SPAWN SLIME FRAGMENTS HALFWAY THROUGH TEAR
        if (progress > 0.5 && !this.slimeBurst) {
          this.spawnSlimeFragments();
          this.slimeBurst = true;
        }

        // UPDATE DRIPS
        for (let i = this.drips.length - 1; i >= 0; i--) {
          const d = this.drips[i];
          d.x += d.vx * dt;
          d.y += d.vy * dt;
          d.vx *= 0.97;
          d.vy *= 0.97;
          d.alpha -= 0.02 * dt * 60; // FADE OUT
          if (d.alpha <= 0) {
            _recycleDrip(d);
            this.drips.splice(i, 1);
          }
        }

        if (progress >= 1.0) {
          // CLEAN UP DRIPS BEFORE DYING
          for (const d of this.drips) _recycleDrip(d);
          this.drips.length = 0;
          this.isDead = true;
        }
      }

      if (this.isDead) return; // DON'T UPDATE FURTHER IF DEAD

    } else if (this.isLatched) {
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
        this.state      = "latched";
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
      const sd   = Math.hypot(sdx, sdy);
      if (sd > 0 && sd > BW.SEGMENT_SPACING) {
        const r  = BW.SEGMENT_SPACING / sd;
        curr.x   = prev.x + sdx * r;
        curr.y   = prev.y + sdy * r;
      }
    }

    // TRAIL — RING BUFFER (NO ALLOCATIONS)
    const t = this.trail[this.trailIndex];
    t.x = this.x;
    t.y = this.y;
    this.trailIndex = (this.trailIndex + 1) % BW.TRAIL_LENGTH;

    if (this.flashTimer > 0) this.flashTimer -= dt;
  }

  draw(ctx, sprite) {
    if (this.isDead) return;

    const frameWidth = sprite ? sprite.width / BW.SPRITE_FRAMES : 0;

    ctx.save();

    // SHADOW STATE SET ONCE BEFORE THE TRAIL LOOP — NOT PER ELEMENT
    ctx.fillStyle   = BW.TRAIL_COLOR;
    ctx.shadowColor = BW.TRAIL_GLOW;
    ctx.shadowBlur  = 10;
    const len = this.trail.length;
    for (let i = 0; i < len; i++) {
      const idx = (this.trailIndex - 1 - i + len) % len;
      const t     = i / (len - 1); // 0=FRESHEST, 1=OLDEST
      const size  = BW.TRAIL_MAX_SIZE * (1 - t * 0.85);
      const alpha = BW.TRAIL_MAX_ALPHA * (1 - t) * this.alpha;
      if (alpha < 0.01) continue;

      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(this.trail[idx].x, this.trail[idx].y, Math.max(0.5, size), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0; // RESET ONCE AFTER THE LOOP

    ctx.globalAlpha = this.alpha; // BODY SEGMENTS — TAIL FIRST SO HEAD RENDERS ON TOP

    if (this.state === "flung" && this.tearing) {
      // MELTY TEAR DISTORTION
      this._drawMeltyTear(ctx, sprite, frameWidth);
    } else {
      // NORMAL DRAWING
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
      } else if (this.state === "flung") {
        headAngle = this.rotation;
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
    }

    ctx.restore();

    // DRAW SLIME DRIPS
    if (this.drips.length > 0) {
      ctx.save();
      for (const d of this.drips) {
        if (d.alpha <= 0) continue;
        ctx.globalAlpha = d.alpha;
        ctx.fillStyle = d.color;
        ctx.fillRect(d.x, d.y, d.size, d.size);
      }
      ctx.restore();
    }
  }

  _drawMeltyTear(ctx, sprite, frameWidth) {
    if (!sprite || frameWidth <= 0) return;

    const progress = this.tearTimer / this.tearDuration;
    const speed = Math.hypot(this.vx, this.vy) || 1;
    const dirX = this.vx / speed;
    const dirY = this.vy / speed;

    const slices = 8; 
    const sliceSrcH = sprite.height / slices;
    const sliceDstH = BW.HEAD_SIZE / slices;
    const dx0 = this.x - BW.HEAD_SIZE / 2;
    const dy0 = this.y - BW.HEAD_SIZE / 2;

    // SLICE MELT PASS - SLICES STRETCH ALONG VELOCITY DIRECTION
    for (let i = 0; i < slices; i++) {
      const frac = i / slices; // 0 = TOP, 1 = BOTTOM
      const shear = progress * 14 * frac;
      const offX = dirX * shear + Math.sin(i + progress * 8) * 3;
      const offY = dirY * shear;
      const alpha = Math.max(0, 1 - progress * (0.55 + frac * 0.85));

      ctx.globalAlpha = alpha * this.alpha;
      ctx.drawImage(
        sprite,
        0, i * sliceSrcH, frameWidth, sliceSrcH,
        dx0 + offX,
        dy0 + i * sliceDstH + offY,
        BW.HEAD_SIZE,
        sliceDstH
      );
    }
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

  startMeltyTear() {
    this.tearing = true;
    this.tearTimer = 0;
  }

  detach(ship, rollDir) {
    if (!this.isLatched) return;

    this.isLatched = false;
    this.state = "flung";
    this.life = 1.4;

    // COMPUTE TANGENTIAL FLING VELOCITY
    const dx = this.x - ship.x;
    const dy = this.y - ship.y;
    const dist = Math.hypot(dx, dy) || 1;
    const nx = dx / dist;
    const ny = dy / dist;

    // TANGENT VECTOR (PERPENDICULAR TO RADIAL)
    const tx = -ny * rollDir;
    const ty = nx * rollDir;

    const tangentialForce = 220;
    const outwardForce = 120;

    this.vx = tx * tangentialForce + nx * outwardForce + (ship.velocity?.x ?? 0) * 0.4;
    this.vy = ty * tangentialForce + ny * outwardForce + (ship.velocity?.y ?? 0) * 0.4;

    // SAFETY: PREVENT ANY NaN FROM BREAKING THE ANIMATION
    if (!Number.isFinite(this.vx)) this.vx = 0;
    if (!Number.isFinite(this.vy)) this.vy = 0;

    this.spin = (Math.random() * 8 + 6) * rollDir;
    this.rotation = 0;
  }

  spawnSlimeFragments() {
    const count = 8; // NUMBER OF FRAGMENTS
    for (let i = 0; i < count; i++) {
      const d = _getDrip();
      d.x = this.x;
      d.y = this.y;
      d.vx = this.vx * 0.4 + (Math.random() - 0.5) * 2;
      d.vy = this.vy * 0.4 + (Math.random() - 0.5) * 2;
      d.alpha = 0.9;
      d.size = Math.random() < 0.4 ? 2 : 1;
      d.color = Math.random() < 0.5 ? '#55ff88' : '#33cc66'; // GREEN SLIME COLORS
      this.drips.push(d);
    }
  }

  getHeadPos() { return { x: this.x, y: this.y }; }
}

// ======================= SLIME SPLAT =======================
const SLIME_FRAMES   = 15;
const SLIME_FPS      = 20; 
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
  constructor(audio = null) {
    this.worms      = [];
    this.spawnQueue = [];
    this.spawnTimer = 0;
    this._spawning  = false;
    this._splats    = []; 
    this.audio      = audio; 
    // console.log('✔ BabyWormManager initialized');
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

      // CHECK FOR SLIME BURST AUDIO
      if (w.slimeBurst && !w._audioPlayed) {
        if (this.audio) this.audio.playBabyWormDeath();
        w._audioPlayed = true;
      }

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
      const dx  = seg.x1 - w.x;
      const dy  = seg.y1 - w.y;
      const r   = BW.HEAD_SIZE * 0.5;
      if (dx * dx + dy * dy < r * r) {  // SQUARED DISTANCE — NO Math.sqrt NEEDED
        const killed = w.takeDamage();
        return { hit: true, x: w.x, y: w.y, killed };
      }
    }
    return { hit: false };
  }

  detachAll(ship, rollDir) {
    let count = 0;
    for (const w of this.worms) {
      if (w.isLatched) { w.detach(ship, rollDir); count++; }
    }
    return count;
  }

  hasLatched() { return this.worms.some(w => w.isLatched && !w.isDead); }
  getCount()   { return this.worms.length; }

  clear() {
    // CLEAN UP DRIPS
    for (const w of this.worms) {
      for (const d of w.drips) _recycleDrip(d);
    }
    this.worms      = [];
    this.spawnQueue = [];
    this._spawning  = false;
    this.spawnTimer = 0;
  }
}