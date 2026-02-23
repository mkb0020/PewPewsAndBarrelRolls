/// WORM.JS
// ~~~~~~~~~~~~~~~~~~~~ IMPORTS ~~~~~~~~~~~~~~~~~~~~
import { CONFIG } from '../utils/config.js';
// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

// ======================= LAYERED SINE NOISE - OVERLAPPING SINE WAVES AT DIFFERENT FREQUENCIES/PHASES PRODUCE - SMOOTH ORGANIC MOTION WITHOUT ANY EXTERNAL NOISE LIBRARY.- =======================
function organicNoise(t, layers) {
  let val = 0;
  for (const [amp, freq, phase] of layers) {
    val += amp * Math.sin(t * freq + phase);
  }
  return val;
}

// ======================= WORM CONFIG =======================
const WORM = {
  NUM_SEGMENTS:     20,
  SEGMENT_SPACING:  30,    // WORLD-SPACE DISTANCE BETWEEN SEGMENTS
  BASE_SIZE:        375,   // HEAD SPRITE SIZE AT SCALE 1.0
  TAIL_SIZE_RATIO:  0.28,  // TAIL SCALES DOWN SMALLER SINCE NO DEDICATED TAIL SPRITE
  FOCAL_LENGTH:     200,   // PERSPECTIVE FOCAL LENGTH
  START_Z:          1400,  // STARTS FAR AWAY (TINY)
  IDLE_Z:           320,   // HOVERS AT THIS DEPTH WHEN ACTIVE
  APPROACH_SPEED:   0.006, // LERP FACTOR TOWARD IDLE Z
  SPRITE_FRAMES:    9,
  FRAME_HEAD:       0,
  FRAME_SEGMENT:    1,
  FRAME_TAIL:       1,     // REUSE SEGMENT SPRITE, JUST SCALED SMALLER
  FRAME_TRANSITION:   2,   // FRAME 3 (0-INDEXED) – SHOWN BEFORE  ATTACK LOOP
  TRANSITION_DURATION: 0.25, // HOW LONG THE TRANSITION FRAME HOLDS
  FRAME_ATTACK_START:   3, 
  FRAME_ATTACK_END:   8,   // 0-INDEXED: FRAME 9 = INDEX 8
  DEATH_PAUSE_DURATION: 1.36, // FREEZE BEFORE RIPPLE/POPS BEGIN — DRAMATIC BEAT (2 BEATS AT 90 BPM = 1.33)
  ATTACK_INTERVAL:    15,   // SECONDS BETWEEN ATTACKS
  ATTACK_DURATION:    7,
  BABY_ATTACK_DURATION: 9,  // BABY WORM ATTACK LASTS LONGER — MORE TIME FOR WORMS TO REACH YOU
  ATTACK_FPS:         10,  // FRAMES PER SECOND FOR ATTACK ANIMATION
  SPAWN_OFFSET_X:  -520, // SPAWN OFFSET – NEGATIVE X = LEFT
  SPAWN_OFFSET_Y:   200, //POSITIVE Y = DOWN (COMES FROM AROUND THE BEND)
  ALPHA_START:      0.0,
  ALPHA_FULL:       1.0,
  ALPHA_SPEED:      0.012, // LERP FACTOR TOWARD FULL ALPHA - FADE IN AS IT EMERGES
  WIGGLE_X: [  // HEAD WIGGLE - TWO OVERLAPPING PATTERNS FOR ORGANIC FEEL
    [200, 0.55, 0.0],     // [AMPLITUDE, FREQUENCY, PHASE]
    [90,  1.20, 1.1],
    [35,  2.30, 2.7],
  ],
  WIGGLE_Y: [
    [150, 0.70, Math.PI * 0.5],
    [80,  1.10, 0.4],
    [30,  2.10, 1.9],
  ],
  HEAD_SMOOTH:      0.07,  // HOW SNAPPILY HEAD CHASES WIGGLE TARGET
  HEALTH:           150,
  SEGMENT_HEALTH:   2,     // BODY SEGMENTS TAKE LESS DAMAGE
  HEAD_HEALTH_MULT: 3,     // HEAD TAKES MORE
};

// ======================= SUCTION PARTICLES CONFIG =======================
const SUCTION = {
  MAX_PARTICLES:    60,    // HARD CAP FOR PERFORMANCE
  SPAWN_RATE:       6,     // PARTICLES PER SECOND DURING ATTACK
  SMOKE_FRAMES:     9,     
  SMOKE_SPRITE:     './images/smoke.png',
  SIZE_MIN:         100,    
  SIZE_MAX:         170,   
  BASE_SPEED:       500,   // BASE TRAVEL SPEED PX/S
  SPEED_VARIANCE:   90,
  SPIN_STRENGTH:    1.6,   // TANGENTIAL (CCW) FORCE MULTIPLIER
  PULL_STRENGTH:    0.8,   // RADIAL (INWARD) FORCE MULTIPLIER
  VORTEX_ACCEL:     3,   // EXTRA SPEED MULTIPLIER WHEN CLOSE
  VORTEX_RADIUS:    250,   // DISTANCE AT WHICH VORTEX EFFECT KICKS IN
  KILL_RADIUS:      40,    // ABSORBED WHEN WITHIN THIS DISTANCE OF MOUTH
  FADE_IN_FRAC:     0.15,  // FRACTION OF LIFE SPENT FADING IN
  FADE_OUT_FRAC:    0.25,  // FRACTION OF LIFE SPENT FADING OUT
  OPACITY_MIN:      0.4,
  OPACITY_MAX:      0.5,
  LIFE_MIN:         1.5,   // SECONDS
  LIFE_VARIANCE:    1.6,
  SELF_ROTATE_SPEED: 0.9,  // PARTICLE SELF-ROTATION SPEED (RAD/S)
};

// ======================= SUCTION PARTICLE =======================
class SuctionParticle {
  constructor(smokeSprite, smokeFrameWidth) {
    // SPAWN JUST OUTSIDE A RANDOM SCREEN EDGE
    const w = window.innerWidth;
    const h = window.innerHeight;
    const edge = Math.floor(Math.random() * 4);
    switch (edge) {
      case 0: this.x = Math.random() * w;       this.y = -50;     break; // TOP
      case 1: this.x = Math.random() * w;       this.y = h + 50;  break; // BOTTOM
      case 2: this.x = -50;                     this.y = Math.random() * h; break; // LEFT
      case 3: this.x = w + 50;                  this.y = Math.random() * h; break; // RIGHT
    }

    this.frame      = Math.floor(Math.random() * SUCTION.SMOKE_FRAMES);
    this.size       = SUCTION.SIZE_MIN + Math.random() * (SUCTION.SIZE_MAX - SUCTION.SIZE_MIN);
    this.peakAlpha  = SUCTION.OPACITY_MIN + Math.random() * (SUCTION.OPACITY_MAX - SUCTION.OPACITY_MIN);
    this.maxLife    = SUCTION.LIFE_MIN + Math.random() * SUCTION.LIFE_VARIANCE;
    this.life       = this.maxLife;
    this.speed      = SUCTION.BASE_SPEED + Math.random() * SUCTION.SPEED_VARIANCE;
    this.rotation   = Math.random() * Math.PI * 2; 
    this.rotSpeed   = -(SUCTION.SELF_ROTATE_SPEED + Math.random() * 0.8); // CCW SELF-SPIN (NEGATIVE = COUNTER-CLOCKWISE)

    this.smokeSprite     = smokeSprite;
    this.smokeFrameWidth = smokeFrameWidth;
    this.isDead          = false;
  }

  update(dt, targetX, targetY) {
    // VECTOR FROM PARTICLE TO WORM MOUTH
    const dx   = targetX - this.x;
    const dy   = targetY - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    this.distToMouth = dist; // CACHE FOR DRAW

    if (dist < SUCTION.KILL_RADIUS) {
      this.isDead = true;
      return;
    }

    // NORMALIZED RADIAL (INWARD) DIRECTION
    const nx = dx / dist;
    const ny = dy / dist;

    // CCW TANGENTIAL: ROTATE RADIAL 90° COUNTER-CLOCKWISE  → (-ny, nx)
    const tx = -ny;
    const ty =  nx;

    // VORTEX ACCELERATION: RAMPS UP SMOOTHLY AS PARTICLE CLOSES IN
    const closeness  = Math.max(0, 1 - dist / SUCTION.VORTEX_RADIUS);
    const speedScale = 1 + closeness * closeness * SUCTION.VORTEX_ACCEL;

    const vx = (tx * SUCTION.SPIN_STRENGTH + nx * SUCTION.PULL_STRENGTH) * this.speed * speedScale;
    const vy = (ty * SUCTION.SPIN_STRENGTH + ny * SUCTION.PULL_STRENGTH) * this.speed * speedScale;

    this.x += vx * dt;
    this.y += vy * dt;

    this.rotation += this.rotSpeed * dt; // SELF-ROTATION (CCW)

    this.life -= dt;
    if (this.life <= 0) this.isDead = true;
  }

  draw(ctx) {
    if (!this.smokeSprite || this.smokeFrameWidth <= 0) return;

    const progress = 1 - (this.life / this.maxLife); // ENVELOPE: FADE IN → PEAK → FADE OUT /  0=fresh, 1=dead
    let envelope;
    if (progress < SUCTION.FADE_IN_FRAC) {
      envelope = progress / SUCTION.FADE_IN_FRAC;
    } else if (progress > (1 - SUCTION.FADE_OUT_FRAC)) {
      envelope = (1 - progress) / SUCTION.FADE_OUT_FRAC;
    } else {
      envelope = 1.0;
    }

    const dist       = this.distToMouth ?? 9999;     // SHRINK AS PARTICLE GETS SUCKED INTO THE MOUTH -  FULL SIZE UNTIL VORTEX_RADIUS, THEN LERPS DOWN TO ~8% AT KILL_RADIUS
    const shrinkFrac = Math.max(0, Math.min(1, 1 - (dist - SUCTION.KILL_RADIUS) / (SUCTION.VORTEX_RADIUS - SUCTION.KILL_RADIUS)));
    const drawSize   = this.size * (1 - shrinkFrac * 0.92); // → 8% OF ORIGINAL AT MOUTH

    ctx.save();
    ctx.globalAlpha = this.peakAlpha * Math.max(0, envelope);
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rotation);

    const sx = this.frame * this.smokeFrameWidth;
    ctx.drawImage(
      this.smokeSprite,
      sx, 0, this.smokeFrameWidth, this.smokeSprite.height,
      -drawSize / 2, -drawSize / 2, drawSize, drawSize
    );
    ctx.restore();
  }
}

// ======================= SUCTION PARTICLE SYSTEM =======================
class SuctionParticleSystem {
  constructor() {
    this.particles      = [];
    this.spawnAccum     = 0;    // ACCUMULATOR FOR FRACTIONAL SPAWN
    this.smokeSprite    = new Image();
    this.smokeFrameWidth = 0;
    this.spriteLoaded   = false;

    this.smokeSprite.src = SUCTION.SMOKE_SPRITE;
    this.smokeSprite.onload = () => {
      this.spriteLoaded    = true;
      this.smokeFrameWidth = this.smokeSprite.width / SUCTION.SMOKE_FRAMES;
      console.log('✔ Suction smoke sprite loaded');
    };
    this.smokeSprite.onerror = () => {
      console.warn('⚠ Suction smoke sprite not found');
    };
  }

 
  update(dt, isAttacking, targetX, targetY) {  // CALL EVERY FRAME WHILE ATTACK IS ACTIVE - SPAWN NEW PARTICLES ONLY DURING ACTIVE ATTACK LOOP
    if (isAttacking && this.particles.length < SUCTION.MAX_PARTICLES) {
      this.spawnAccum += SUCTION.SPAWN_RATE * dt;
      while (this.spawnAccum >= 1 && this.particles.length < SUCTION.MAX_PARTICLES) {
        this.particles.push(new SuctionParticle(this.smokeSprite, this.smokeFrameWidth));
        this.spawnAccum -= 1;
      }
    } else if (!isAttacking) {
      this.spawnAccum = 0;
    }

    // UPDATE ALL ALIVE PARTICLES (EVEN AFTER ATTACK ENDS SO THEY FINISH THEIR JOURNEY)
    for (let i = this.particles.length - 1; i >= 0; i--) {
      this.particles[i].update(dt, targetX, targetY);
      if (this.particles[i].isDead) this.particles.splice(i, 1);
    }
  }

  draw(ctx) {
    for (const p of this.particles) p.draw(ctx);
  }

  clear() {
    this.particles = [];
    this.spawnAccum = 0;
  }
}

// ======================= WORM BOSS =======================
export class WormBoss {
  constructor() {
    this.time         = 0;
    this.phaseOffset  = Math.random() * Math.PI * 2; // RANDOMISE START POSE
    this.z            = WORM.START_Z;
    this.baseScale    = 0;

    this.health       = WORM.HEALTH;
    this.maxHealth    = WORM.HEALTH;
    this.isDead       = false;
    this.isActive     = false;
    this.alpha        = WORM.ALPHA_START;

    // ATTACK ANIMATION STATE
    this.attackTimer     = WORM.ATTACK_INTERVAL;
    this.isAttacking     = false;
    this.attackPhase     = 'idle';
    this.attackType      = 'suction';  // ALTERNATES: 'suction' | 'babyworm'
    this._attackIndex    = 0;          // INCREMENTS EACH ATTACK TO DRIVE ALTERNATION
    this.attackProgress  = 0;
    this.attackFrame     = WORM.FRAME_ATTACK_START;
    this.attackFrameTime = 0;
    this._babySpawnFired = false;      // ENSURES onSpawnBabyWorms FIRES EXACTLY ONCE PER ATTACK

    this.onAttack         = null;
    this.onIntro          = null;
    this.onSegmentDeath   = null;
    this.onDeathPauseEnd  = null;
    this.onDeath          = null;
    this.onSpawnBabyWorms = null;  // CALLBACK(mouthX, mouthY) — FIRES ONCE AT BABY ATTACK LOOP START
    this._introFired      = false;

    // DEATH SEQUENCE STATE
    this.isDying       = false;
    this.dyingTimer    = 0;
    this.dyingSegIndex = 0;  // HOW MANY SEGMENTS HAVE BEEN POPPED SO FAR (TAIL→HEAD)
    this._pauseEndFired = false; // ENSURES onDeathPauseEnd FIRES EXACTLY ONCE

    this.headX  = WORM.SPAWN_OFFSET_X;  // HEAD WORLD-SPACE POSITION – START AT SPAWN OFFSET
    this.headY  = WORM.SPAWN_OFFSET_Y;

    this.segments = Array.from({ length: WORM.NUM_SEGMENTS }, (_, i) => ({  // CHAIN OF SEGMENTS – INDEX 0 IS THE HEAD
      x:           WORM.SPAWN_OFFSET_X,
      y:           WORM.SPAWN_OFFSET_Y + i * WORM.SEGMENT_SPACING,
      screenX:     0,
      screenY:     0,
      drawSize:    0,
      hitRadius:   0,
      health:      i === 0 ? WORM.HEAD_HEALTH_MULT : WORM.SEGMENT_HEALTH,
      flashTimer:  0,
      isDead:      false,  // FLAGGED TRUE AS DEATH SEQUENCE POPS THIS SEGMENT
      rippleX:     0,      // SCREEN-SPACE RIPPLE OFFSET — ONLY USED DURING DEATH THRASH
      rippleY:     0,
    }));

    this.sprite      = new Image();
    this.sprite.src  = './images/worm.png';
    this.frameWidth  = 0;
    this.spriteLoaded = false;
    this.sprite.onload = () => {
      this.spriteLoaded = true;
      this.frameWidth   = this.sprite.width / WORM.SPRITE_FRAMES;
      console.log('✔ Worm sprite loaded');
    };
    this.sprite.onerror = () => {
      console.warn('⚠ WORM SPRITE NOT FOUND, USING FALLBACK');
    };

    this.suctionParticles = new SuctionParticleSystem();

    console.log('✔ WormBoss initialized');
  }

  activate() {
    this.isActive     = true;
    this.z            = WORM.START_Z;
    this.alpha        = WORM.ALPHA_START;
    this.health       = WORM.HEALTH;
    this.isDead       = false;
    this.isDying      = false;
    this.dyingTimer   = 0;
    this.dyingSegIndex = 0;
    this._pauseEndFired = false;
    this._pauseEndFired = false;
    this.headX        = WORM.SPAWN_OFFSET_X;
    this.headY        = WORM.SPAWN_OFFSET_Y;

    // RESET ATTACK CYCLE
    this.isAttacking     = false;
    this.attackPhase     = 'idle';
    this.attackType      = 'suction';
    this._attackIndex    = 0;
    this.attackTimer     = WORM.ATTACK_INTERVAL;
    this.attackProgress  = 0;
    this.attackFrame     = WORM.FRAME_ATTACK_START;
    this.attackFrameTime = 0;
    this._babySpawnFired = false;

    for (let i = 0; i < WORM.NUM_SEGMENTS; i++) { // RESET ALL SEGMENTS
      const seg    = this.segments[i];
      seg.isDead   = false;
      seg.health   = i === 0 ? WORM.HEAD_HEALTH_MULT : WORM.SEGMENT_HEALTH;
      seg.flashTimer = 0;
      seg.rippleX  = 0;
      seg.rippleY  = 0;
      seg.x        = WORM.SPAWN_OFFSET_X;
      seg.y        = WORM.SPAWN_OFFSET_Y + i * WORM.SEGMENT_SPACING;
    }

    this.suctionParticles.clear();
    this._introFired = false;
  }

  // ======================= UPDATE =======================
  update(dt) {
    if (!this.isActive || this.isDead) return;

    this.time += dt;

    // ============= APPROACH / SCALE (ALWAYS NEEDED — EVEN WHILE DYING) =============
    this.z       += (WORM.IDLE_Z - this.z) * WORM.APPROACH_SPEED;
    this.baseScale = WORM.FOCAL_LENGTH / (WORM.FOCAL_LENGTH + this.z);

    // ============= DYING SEQUENCE — HEAD STAYS PUT, RIPPLE WAVE DOWN THE BODY =============
    if (this.isDying) { // HEAD  STAYS ROUGHLY IN PLACE
      const t = this.time + this.phaseOffset;
      const tremble = organicNoise(t, WORM.WIGGLE_X) * 0.25;  
      this.headX += (tremble - this.headX) * WORM.HEAD_SMOOTH;
      this.headY += (0       - this.headY) * WORM.HEAD_SMOOTH;
      this.segments[0].x = this.headX;
      this.segments[0].y = this.headY;

      for (let i = 1; i < WORM.NUM_SEGMENTS; i++) { // CHAIN  — KEEP BODY CONNECTED
        const prev = this.segments[i - 1];
        const curr = this.segments[i];
        const dx   = curr.x - prev.x;
        const dy   = curr.y - prev.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > WORM.SEGMENT_SPACING) {
          const ratio = WORM.SEGMENT_SPACING / dist;
          curr.x = prev.x + dx * ratio;
          curr.y = prev.y + dy * ratio;
        }
      }

      // UPDATE SCREEN POSITIONS
      const cx = window.innerWidth  / 2;
      const cy = window.innerHeight / 2;
      const bs = this.baseScale;
      for (let i = 0; i < WORM.NUM_SEGMENTS; i++) {
        const seg = this.segments[i];
        if (seg.isDead) { seg.rippleX = 0; seg.rippleY = 0; continue; }
        const taper  = i / (WORM.NUM_SEGMENTS - 1);
        const aScale = 1.0 - taper * (1.0 - WORM.TAIL_SIZE_RATIO);
        seg.screenX  = cx + seg.x * bs;
        seg.screenY  = cy + seg.y * bs;
        seg.drawSize  = WORM.BASE_SIZE * bs * aScale;
        seg.hitRadius = seg.drawSize * 0.45;

        if (seg.flashTimer <= 0) seg.flashTimer = 0.05 + Math.random() * 0.04;  // RAPID CONTINUOUS FLASH
        else seg.flashTimer -= dt;

        // === TRAVELING SINE RIPPLE — ONLY AFTER DEATH PAUSE ===
        if (this.dyingTimer < WORM.DEATH_PAUSE_DURATION) {
          seg.rippleX = 0;
          seg.rippleY = 0;
        } else {
        // PERPENDICULAR TO THE BODY DIRECTION AT THIS SEGMENT - DIRECTION: FROM THIS SEGMENT TOWARD THE ONE AHEAD (HEAD SIDE)
        let fdx = 0, fdy = -1; // FALLBACK — POINT UP
        if (i > 0) {
          const prev  = this.segments[i - 1];
          const ddx   = prev.screenX - seg.screenX;
          const ddy   = prev.screenY - seg.screenY;
          const ddist = Math.sqrt(ddx * ddx + ddy * ddy) || 1;
          fdx = ddx / ddist;
          fdy = ddy / ddist;
        }
        const px = -fdy;
        const py =  fdx;

        // WAVE TRAVELS HEAD→TAIL: PHASE INCREASES WITH SEGMENT INDEX
        const RIPPLE_SPEED   = 18;   // HOW FAST THE WAVE TRAVELS DOWN - HIGH FREQUENCY FOR FAST NERVOUS RIPPLING
        const RIPPLE_PHASE   = 0.55; // RADIANS PER SEGMENT —  WAVE DENSITY
        const RIPPLE_AMP_PX  = 40;   // PEAK DISPLACEMENT IN SCREEN PIXELS
        const ampScale = 0.15 + (i / (WORM.NUM_SEGMENTS - 1)) * 0.85; // AMPLITUDE RAMPS UP FROM HEAD → TAIL (HEAD BARELY MOVES, TAIL THRASHES)
        const wave = Math.sin(this.time * RIPPLE_SPEED - i * RIPPLE_PHASE);

        seg.rippleX = px * wave * RIPPLE_AMP_PX * ampScale;
        seg.rippleY = py * wave * RIPPLE_AMP_PX * ampScale;
        } 
      } 

      // POP SEGMENTS TAIL → HEAD
      this.dyingTimer += dt;

      // DRAMATIC PAUSE 
      if (this.dyingTimer < WORM.DEATH_PAUSE_DURATION) {
        // ZERO OUT RIPPLES DURING THE FREEZE
        for (let i = 0; i < WORM.NUM_SEGMENTS; i++) {
          this.segments[i].rippleX = 0;
          this.segments[i].rippleY = 0;
        }
        this.suctionParticles.update(dt, false, this.segments[0].screenX, this.segments[0].screenY);
        return;
      }

      // PAUSE JUST ENDED — FIRE CALLBACK EXACTLY ONCE SO AUDIO CUE 2 CAN START
      if (!this._pauseEndFired) {
        this._pauseEndFired = true;
        if (this.onDeathPauseEnd) this.onDeathPauseEnd();
      }

      const SEG_INTERVAL = 0.18;
      const elapsed      = this.dyingTimer - WORM.DEATH_PAUSE_DURATION; // COUNT FROM AFTER THE PAUSE
      const targetKills  = Math.floor(elapsed / SEG_INTERVAL);
      while (this.dyingSegIndex < targetKills && this.dyingSegIndex < WORM.NUM_SEGMENTS) {
        const i   = WORM.NUM_SEGMENTS - 1 - this.dyingSegIndex; // TAIL FIRST
        const seg = this.segments[i];
        seg.isDead = true;
        if (this.onSegmentDeath) this.onSegmentDeath(seg.screenX, seg.screenY, i);
        this.dyingSegIndex++;
      }

      // DRAIN REMAINING SUCTION PARTICLES (NO NEW SPAWNS)
      this.suctionParticles.update(dt, false, this.segments[0].screenX, this.segments[0].screenY);

      // ALL SEGMENTS GONE — FULLY DEAD
      if (this.dyingSegIndex >= WORM.NUM_SEGMENTS) {
        this.isDead   = true;
        this.isActive = false;
        if (this.onDeath) this.onDeath();
      }
      return;
    }

    // ============= FADE IN =============
    this.alpha += (WORM.ALPHA_FULL - this.alpha) * WORM.ALPHA_SPEED;

    // FIRE INTRO SOUND ONCE WORM IS CLEARLY VISIBLE
    if (!this._introFired && this.alpha >= 0.15) {
      this._introFired = true;
      if (this.onIntro) this.onIntro();
    }

    // ============= ATTACK CYCLE =============
    if (this.isAttacking) {
      this.attackProgress += dt;

      if (this.attackPhase === 'transIn') {
        if (this.attackProgress >= WORM.TRANSITION_DURATION) {
          this.attackPhase     = 'loop';
          this.attackProgress  = 0;
          this.attackFrame     = WORM.FRAME_ATTACK_START;
          this.attackFrameTime = 0;
        }

      } else if (this.attackPhase === 'loop') {

        if (this.attackType === 'suction') {
          // CYCLE ATTACK FRAMES FOR SUCTION
          this.attackFrameTime += dt;
          const frameDur = 1 / WORM.ATTACK_FPS;
          if (this.attackFrameTime >= frameDur) {
            this.attackFrameTime -= frameDur;
            this.attackFrame++;
            if (this.attackFrame > WORM.FRAME_ATTACK_END) {
              this.attackFrame = WORM.FRAME_ATTACK_START;
            }
          }
          if (this.attackProgress >= WORM.ATTACK_DURATION) {
            this.isAttacking = false;
            this.attackPhase = 'idle';
            this.attackTimer = WORM.ATTACK_INTERVAL;
          }

        } else {
          // BABY WORM ATTACK — HOLD MOUTH OPEN FRAME, FIRE SPAWN CALLBACK ONCE
          this.attackFrame = WORM.FRAME_ATTACK_START;
          if (!this._babySpawnFired) {
            this._babySpawnFired = true;
            const head = this.segments[0];
            if (this.onSpawnBabyWorms) this.onSpawnBabyWorms(head.screenX, head.screenY);
          }
          if (this.attackProgress >= WORM.BABY_ATTACK_DURATION) {
            this.isAttacking     = false;
            this.attackPhase     = 'idle';
            this.attackTimer     = WORM.ATTACK_INTERVAL;
            this._babySpawnFired = false;
          }
        }
      }

    } else {
      this.attackTimer -= dt;
      if (this.attackTimer <= 0 && this.alpha > 0.8) {
        this._attackIndex++;
        // ALTERNATE: ODD = SUCTION, EVEN = BABYWORM  
        // (FIRST ATTACK IS INDEX 1 = SUCTION SO PLAYER LEARNS MECHANIC FIRST)
        this.attackType     = (this._attackIndex % 2 === 1) ? 'suction' : 'babyworm';
        this.isAttacking    = true;
        this.attackPhase    = 'transIn';
        this.attackProgress = 0;
        if (this.onAttack) this.onAttack();
      }
    }

    // ============= ORGANIC HEAD MOVEMENT =============
    const t = this.time + this.phaseOffset;
    const approachFrac = 1.0 - Math.max(0, (this.z - WORM.IDLE_Z) / (WORM.START_Z - WORM.IDLE_Z));
    const spawnBlendX  = WORM.SPAWN_OFFSET_X * (1.0 - approachFrac);
    const spawnBlendY  = WORM.SPAWN_OFFSET_Y * (1.0 - approachFrac);
    const targetX = spawnBlendX + organicNoise(t, WORM.WIGGLE_X);
    const targetY = spawnBlendY + organicNoise(t, WORM.WIGGLE_Y);

    this.headX += (targetX - this.headX) * WORM.HEAD_SMOOTH;
    this.headY += (targetY - this.headY) * WORM.HEAD_SMOOTH;

    this.segments[0].x = this.headX;
    this.segments[0].y = this.headY;

    // ============= CHAIN IK – EACH SEGMENT FOLLOWS THE ONE AHEAD =============
    for (let i = 1; i < WORM.NUM_SEGMENTS; i++) {
      const prev = this.segments[i - 1];
      const curr = this.segments[i];
      const dx   = curr.x - prev.x;
      const dy   = curr.y - prev.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist > WORM.SEGMENT_SPACING) {
        const ratio = WORM.SEGMENT_SPACING / dist;
        curr.x = prev.x + dx * ratio;
        curr.y = prev.y + dy * ratio;
      }
    }

    // ============= PROJECT TO SCREEN SPACE & CACHE =============
    const cx = window.innerWidth  / 2;
    const cy = window.innerHeight / 2;
    const bs = this.baseScale;

    for (let i = 0; i < WORM.NUM_SEGMENTS; i++) {
      const seg = this.segments[i];

      const taper  = i / (WORM.NUM_SEGMENTS - 1);  // ANATOMICAL TAPER: HEAD(1.0) → TAIL(TAIL_SIZE_RATIO)
      const aScale = 1.0 - taper * (1.0 - WORM.TAIL_SIZE_RATIO);
      const scale  = bs * aScale;

      seg.screenX   = cx + seg.x * bs;
      seg.screenY   = cy + seg.y * bs;
      seg.drawSize  = WORM.BASE_SIZE * scale;
      seg.hitRadius = seg.drawSize * 0.45;

      if (seg.flashTimer > 0) seg.flashTimer -= dt;
    }

    // ============= SUCTION PARTICLES - ONLY DURING SUCTION ATTACK LOOP (MOUTH IS FULLY OPEN) =============
    const headScreen = this.segments[0];
    const suctionActive = this.isAttacking && this.attackPhase === 'loop' && this.attackType === 'suction';
    this.suctionParticles.update(dt, suctionActive, headScreen.screenX, headScreen.screenY);
  }

  // ======================= DRAW =======================
  draw(ctx) {
    if (!this.isActive || this.isDead) return;
    this.suctionParticles.draw(ctx);  // SUCTION PARTICLES DRAW BEHIND THE WORM

    ctx.save(); // DRAW TAIL FIRST →  SO HEAD RENDERS ON TOP
    ctx.globalAlpha = this.alpha;
    for (let i = WORM.NUM_SEGMENTS - 1; i >= 0; i--) {
      const seg  = this.segments[i];
      if (seg.isDead) continue;          
      const size = seg.drawSize;
      if (size < 1) continue;

      let frame;  // SPRITE FRAME SELECTION
      if (i === 0) {
        if (this.attackPhase === 'loop')    frame = this.attackFrame;
        else if (this.attackPhase === 'transIn') frame = WORM.FRAME_TRANSITION;
        else                                frame = WORM.FRAME_HEAD;
      } else if (i === WORM.NUM_SEGMENTS - 1) {
        frame = WORM.FRAME_TAIL;
      } else {
        frame = WORM.FRAME_SEGMENT;
      }

      ctx.save();
      ctx.translate(seg.screenX + (seg.rippleX || 0), seg.screenY + (seg.rippleY || 0));

      if (i === 0) {  // ROTATION - HEAD: TINY ALIVE WIGGLE
        const wiggle = Math.sin(this.time * 3.5 + this.phaseOffset) * 0.08;
        ctx.rotate(wiggle);
      } else {  // BODY/TAIL: POINT TOWARD SEGMENT AHEAD
        const prev = this.segments[i - 1];
        const dx   = prev.screenX - seg.screenX;
        const dy   = prev.screenY - seg.screenY;
        ctx.rotate(Math.atan2(dy, dx) - Math.PI / 2);
      }

      if (seg.flashTimer > 0) { // HIT FLASH
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.6;
      }

      if (this.spriteLoaded && this.frameWidth > 0) {  // DRAW SPRITE (OR FALLBACK CIRCLES)
        ctx.drawImage(
          this.sprite,
          frame * this.frameWidth, 0, this.frameWidth, this.sprite.height,
          -size / 2, -size / 2, size, size
        );
      } else {
        const colors = ['#ff00aa', '#cc00ff', '#8800cc'];
        ctx.fillStyle = colors[frame] || '#ff00aa';
        ctx.beginPath();
        ctx.arc(0, 0, size / 2, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    }
    ctx.restore();
  }

  checkProjectileHit(seg) {  //CHECK A PROJECTILE SEGMENT AGAINST EVERY WORM SEGMENT. RETURNS { hit, segIndex, killed, x, y } OR { hit: false }
    if (!this.isActive || this.isDead || this.isDying) return { hit: false };

    for (let i = 0; i < WORM.NUM_SEGMENTS; i++) {
      const ws = this.segments[i];
      if (ws.hitRadius < 1 || ws.isDead) continue;

      const dx   = seg.x1 - ws.screenX;
      const dy   = seg.y1 - ws.screenY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < ws.hitRadius) {
        const damage  = i === 0 ? WORM.HEAD_HEALTH_MULT : 1;
        ws.flashTimer = 0.1;
        ws.health    -= damage;

        this.health  -= damage;
        const killed  = this.health <= 0;
        if (killed) {
          // KICK OFF DEATH SEQUENCE INSTEAD OF INSTANT REMOVAL
          this.isDying      = true;
          this.dyingTimer   = 0;
          this.dyingSegIndex = 0;
        }

        return { hit: true, segIndex: i, killed, x: ws.screenX, y: ws.screenY };
      }
    }
    return { hit: false };
  }

  getHeadPosition() {
    const s = this.segments[0];
    return { x: s.screenX, y: s.screenY };
  }

  getHealthPercent() {
    return Math.max(0, this.health / this.maxHealth);
  }
}