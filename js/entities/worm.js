// Updated 3/14/26 @ 2:30AM
// WORM.JS
// ~~~~~~~~~~~~~~~~~~~~ IMPORTS ~~~~~~~~~~~~~~~~~~~~
import { CONFIG } from '../utils/config.js';
// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

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
  BASE_SIZE:        450,   // HEAD SPRITE SIZE AT SCALE 1.0
  TAIL_SIZE_RATIO:  0.28,  // TAIL SCALES DOWN SMALLER SINCE NO DEDICATED TAIL SPRITE
  FOCAL_LENGTH:     200,   // PERSPECTIVE FOCAL LENGTH
  START_Z:          1400,  // STARTS FAR AWAY (TINY)
  IDLE_Z:           320,   // HOVERS AT THIS DEPTH WHEN ACTIVE
  APPROACH_SPEED:   0.006, // LERP FACTOR TOWARD IDLE Z
  SPRITE_FRAMES:    9,
  FRAME_HEAD:       0,
  FRAME_SEGMENT:    1,
  FRAME_TAIL:       1,     
  FRAME_TRANSITION:   2,   // FRAME 3 (0-INDEXED) – SHOWN BEFORE  ATTACK LOOP
  TRANSITION_DURATION: 0.25, 
  FRAME_ATTACK_START:   3, // FOR SUCTION ATTACK
  FRAME_ATTACK_END:     8, // 0-INDEXED: FRAME 9 = INDEX 8 / END FRAMES FOR SUCTION ATTACK
  ATTACK_HEAD_SCALE:  0.85, // SCALE MULTIPLIER FOR HEAD DURING ATTACK FRAMES (4-9) — COMPENSATES FOR OVERSIZED SPRITE
  DEATH_PAUSE_DURATION: 1.36, // FREEZE BEFORE RIPPLE/POPS BEGIN — DRAMATIC BEAT (2 BEATS AT 90 BPM = 1.33)
  ATTACK_INTERVAL_MIN: 1,  // AI — MINIMUM SECONDS BETWEEN ATTACKS
  ATTACK_INTERVAL_MAX: 2, // AI — MAXIMUM SECONDS BETWEEN ATTACKS
  ATTACK_DURATION:    5,
  BABY_ATTACK_DURATION: 5,  
  BABY_SPIT_DURATION:   0.8, // SECONDS MOUTH STAYS OPEN WHEN BABY WORMS ARE EXPELLED
  ATTACK_FPS:         7,  
  SPAWN_OFFSET_X:  -520, // SPAWN OFFSET – NEGATIVE X = LEFT
  SPAWN_OFFSET_Y:   200, // POSITIVE Y = DOWN (COMES FROM AROUND THE BEND)
  // AI — HEALTH THRESHOLDS FOR UNLOCKING ATTACKS (as fraction of max HP)
  AI_TIER_CELLULAR:  0.80, // BELOW THIS HEALTH → CELLULAR ATTACK UNLOCKED
  AI_TIER_SUCTION:   0.40, // BELOW THIS HEALTH → SUCTION ATTACK UNLOCKED
  // AI — SCREEN-SPACE DISTANCE THRESHOLDS FOR LUNGE WEIGHTING
  AI_DIST_CLOSE:    180,   // PIXELS — BELOW THIS: STRONGLY PREFER LUNGE
  AI_DIST_FAR:      400,   // PIXELS — ABOVE THIS: PREFER RANGED ATTACKS
  CELLULAR_SPIT_DURATION: 1, // SECONDS MOUTH STAYS OPEN AFTER SEED FIRES
  CELLULAR_SEED_DELAY:    0.5, // SECONDS INTO LOOP BEFORE onSpawnCellular FIRES
  CELLULAR_MAX_DURATION:  30,  // FAILSAFE — FORCE-END ATTACK IF STILL ACTIVE AFTER THIS
  // LUNGE / BITE ATTACK
  LUNGE_REAR_DURATION:   0.3,  // SECONDS TO PULL HEAD BACK BEFORE STRIKE
  LUNGE_STRIKE_DURATION: 0.4,  // SECONDS FOR THE FORWARD SNAP (FAST)
  LUNGE_SNAP_DURATION:   0.3,  // SECONDS TO WHIP BACK TO ORIGIN
  LUNGE_REACH_PX:        180,   // MAX SCREEN-PX REACH FROM ORIGIN (SHORT RANGE)
  LUNGE_PULLBACK_PX:     75,    // SCREEN-PX PULLED BACK DURING REAR PHASE
  LUNGE_BITE_RADIUS:     140,   // HIT DETECTION RADIUS AT PEAK LUNGE (SCREEN PX)
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
  HEALTH:           300, 
  SEGMENT_HEALTH:   1,     
  HEAD_HEALTH_MULT: 2,     
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
    const dist = Math.sqrt(dx * dx + dy * dy) || 0.0001;  // GUARD: PREVENT NaN IF PARTICLE LANDS EXACTLY ON MOUTH

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
    const speedScale = 1 + Math.pow(closeness, 3) * SUCTION.VORTEX_ACCEL;  // CUBIC: RAMPS HARDER NEAR MOUTH FOR SATISFYING FINAL SLURP

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
      // console.log('✔ Suction smoke sprite loaded');
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
    this.attackTimer     = this._rollInterval();  // FIX: WORM.ATTACK_INTERVAL DOESN'T EXIST — ONLY MIN/MAX DO
    this.stunTimer       = 0;   // SINGULARITY BOMB 
    this.isAttacking     = false;
    this.attackPhase     = 'idle';
    this.attackType      = 'suction';  // CURRENT ATTACK TYPE
    this._attackIndex    = 0;          // TOTAL ATTACK COUNT (DEBUGGING / STATS)
    this._lastAttackType = null;       // AI — PREVENTS BACK-TO-BACK SAME ATTACK
    this._attackHistory  = [];         // AI — ROLLING 3-ATTACK MEMORY FOR VARIETY
    this.attackProgress  = 0;
    this.attackFrame     = WORM.FRAME_ATTACK_START;
    this.attackFrameTime = 0;
    this._babySpawnFired = false;      // ENSURES onSpawnBabyWorms FIRES EXACTLY ONCE PER ATTACK
    this._babySpitTimer  = 0;          // COUNTDOWN — MOUTH OPEN BRIEFLY WHEN WORMS ARE EXPELLED
    this._attacksEnabled = false;      // GATED UNTIL readyForBattle() — PREVENTS ATTACKS DURING RISER
    this._cellularSpawnFired = false;  // ENSURES onSpawnCellular FIRES EXACTLY ONCE PER ATTACK
    this._cellularSpitTimer  = 0;      // TRACKS TIME SINCE CELLULAR LOOP STARTED (FOR SPIT ANIMATION)

    this.onAttack         = null;
    this.onIntro          = null;
    this.onSegmentDeath   = null;
    this.onDeathPauseEnd  = null;
    this.onDeath          = null;
    this.onSpawnBabyWorms = null;  // CALLBACK(mouthX, mouthY) — FIRES ONCE PER BABY WORM ATTACK
    this.onSpawnCellular  = null;  // CALLBACK(mouthX, mouthY) — FIRES ONCE PER CELLULAR ATTACK
    this.onLungeGrowl     = null;  // CALLBACK() — FIRES WHEN REAR-BACK PHASE BEGINS
    this.onLungeSnap      = null;  // CALLBACK() — FIRES WHEN SNAP-BACK PHASE BEGINS
    this.onLungeBite      = null;  // CALLBACK(hx, hy, biteRadius) — FIRES AT PEAK LUNGE REACH
    this.onScreenShake    = null;  // CALLBACK(strength, duration) — FIRES ON LUNGE BITE FOR IMPACT FEEDBACK
    this._introFired      = false;

    // LUNGE ATTACK STATE
    this._shipScreenX     = 0;    // UPDATED EACH FRAME BY bossBattle.js VIA setShipPosition()
    this._shipScreenY     = 0;
    this._lungeOriginX    = 0;    // WORLD-SPACE HEAD POSITION WHEN LUNGE STARTED
    this._lungeOriginY    = 0;
    this._lungeDirX       = 0;    // NORMALIZED WORLD-SPACE DIRECTION TOWARD SHIP
    this._lungeDirY       = 0;
    this._lungePhase      = 'rearBack'; // rearBack | lunge | snap
    this._lungeGrowlFired = false;
    this._lungeSnapFired  = false;

    // BLACK HOLE ORBIT STATE — SET EACH FRAME BY singularityBomb.js WHILE ACTIVE
    this._orbitScreenX    = null;
    this._orbitScreenY    = null;

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
      // console.log('✔ Worm sprite loaded');
    };
    this.sprite.onerror = () => {
      console.warn('⚠ WORM SPRITE NOT FOUND, USING FALLBACK');
    };

    this.suctionParticles = new SuctionParticleSystem();

    // console.log('✔ WormBoss initialized');
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
    this.headX        = WORM.SPAWN_OFFSET_X;
    this.headY        = WORM.SPAWN_OFFSET_Y;

    // RESET ATTACK CYCLE
    this.isAttacking     = false;
    this.attackPhase     = 'idle';
    this.attackType      = 'suction';
    this._attackIndex    = 0;
    this._lastAttackType = null;
    this._attackHistory  = [];         // RESET ATTACK MEMORY ON REACTIVATION
    this.attackTimer     = WORM.ATTACK_INTERVAL_MIN;
    this.stunTimer       = 0;
    this.attackProgress  = 0;
    this.attackFrame     = WORM.FRAME_ATTACK_START;
    this.attackFrameTime = 0;
    this._babySpawnFired     = false;
    this._babySpitTimer      = 0;
    this._attacksEnabled     = false;  // GATE ATTACKS UNTIL enableAttacks() IS CALLED
    this._cellularSpawnFired = false;
    this._cellularSpitTimer  = 0;
    this._lungeGrowlFired    = false;
    this._lungeSnapFired     = false;
    this._lungePhase         = 'rearBack';

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

  applyBlackHoleStun(duration) {
    this.stunTimer = Math.max(this.stunTimer, duration); 
    // console.log(`💜 Worm stunned for ${duration}s by Singularity Bomb`);
    if (this.onStunned) this.onStunned(duration);
  }

  // CALLED BY bossBattle.readyForBattle() WHEN THE RISER ENDS AND BOSS MUSIC STARTS
  // STARTS THE ATTACK COUNTDOWN SO THE FIRST ATTACK NEVER FIRES DURING THE INTRO
  enableAttacks() {
    this._attacksEnabled = true;
    this.attackTimer     = this._rollInterval();
  }

  // ======================= BLACK HOLE ORBIT API - CALLED EACH FRAME WHILE BLACK HOLE IS ACTIVE =======================
  setOrbitPosition(sx, sy) {
    this._orbitScreenX = sx;
    this._orbitScreenY = sy;
    this.stunTimer = Math.max(this.stunTimer, 0.35); // DISABLE ATTACKS WHILE ORBITING BLACK HOLE
  }

  clearOrbit() {  // WHEN BLACK HOLE COLLAPSES 
    this._orbitScreenX = null;
    this._orbitScreenY = null;
  }

  // ======================= UPDATE =======================
  update(dt) {
    if (!this.isActive || this.isDead) return;

    this.time += dt;

    // CACHE SCREEN CENTER ONCE PER FRAME — REUSED IN DYING PATH, ORBIT PATH, AND SEGMENT PROJECTION
    const cx = window.innerWidth  / 2;
    const cy = window.innerHeight / 2;

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
      // cx / cy CACHED AT TOP OF update()
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

      this.dyingTimer += dt; // POP SEGMENTS TAIL → HEAD

      if (this.dyingTimer < WORM.DEATH_PAUSE_DURATION) {  // DRAMATIC PAUSE - ZERO OUT RIPPLES DURING THE FREEZE 
        for (let i = 0; i < WORM.NUM_SEGMENTS; i++) { 
          this.segments[i].rippleX = 0;
          this.segments[i].rippleY = 0;
        }
        this.suctionParticles.update(dt, false, this.segments[0].screenX, this.segments[0].screenY);
        return;
      }

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

      this.suctionParticles.update(dt, false, this.segments[0].screenX, this.segments[0].screenY); // DRAIN REMAINING SUCTION PARTICLES (NO NEW SPAWNS)

      if (this.dyingSegIndex >= WORM.NUM_SEGMENTS) { // ALL SEGMENTS GONE — FULLY DEAD
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
    // SINGULARITY BOMB STUN — 
    if (this.stunTimer > 0) {
      this.stunTimer -= dt;
      if (this.stunTimer < 0) this.stunTimer = 0;
      if (this.isAttacking) {
        this.isAttacking         = false;
        this.attackPhase         = 'idle';
        this.attackTimer         = WORM.ATTACK_INTERVAL_MIN * 0.5; // SHORT RECOVERY AFTER STUN
        this._babySpawnFired     = false;
        this._babySpitTimer      = 0;
        this._cellularSpawnFired = false;
        this._cellularSpitTimer  = 0;
        this._lungeGrowlFired    = false;
        this._lungeSnapFired     = false;
      }
    } else if (this.isAttacking) {
      this.attackProgress += dt;

      if (this.attackPhase === 'transIn') {
        if (this.attackProgress >= WORM.TRANSITION_DURATION) {
          this.attackPhase     = 'loop';
          this.attackProgress  = 0;
          this.attackFrame     = (this.attackType === 'babyworm') ? WORM.FRAME_HEAD : WORM.FRAME_ATTACK_START;
          this.attackFrameTime = 0;
        }

      } else if (this.attackPhase === 'loop') {

        if (this.attackType === 'suction') {
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
            this.attackTimer = this._rollInterval();
          }

        } else if (this.attackType === 'babyworm') {
          // TICK SPIT WINDOW — ANIMATE MOUTH OPEN BRIEFLY WHEN WORMS ARE EXPELLED
          if (this._babySpitTimer > 0) {
            this._babySpitTimer  -= dt;
            this.attackFrameTime += dt;
            const frameDur = 1 / WORM.ATTACK_FPS;
            if (this.attackFrameTime >= frameDur) {
              this.attackFrameTime -= frameDur;
              this.attackFrame++;
              if (this.attackFrame > WORM.FRAME_ATTACK_END) this.attackFrame = WORM.FRAME_ATTACK_START;
            }
            if (this._babySpitTimer <= 0) {
              this._babySpitTimer = 0;
              this.attackFrame    = WORM.FRAME_HEAD; // SNAP MOUTH CLOSED AFTER SPIT
            }
          }

          if (!this._babySpawnFired) {
            this._babySpawnFired = true;
            this._babySpitTimer  = WORM.BABY_SPIT_DURATION; // OPEN MOUTH ON SPAWN
            this.attackFrame     = WORM.FRAME_ATTACK_START;
            this.attackFrameTime = 0;
            const head = this.segments[0];
            if (this.onSpawnBabyWorms) this.onSpawnBabyWorms(head.screenX, head.screenY);
          }
          if (this.attackProgress >= WORM.BABY_ATTACK_DURATION) {
            this.isAttacking     = false;
            this.attackPhase     = 'idle';
            this.attackTimer     = this._rollInterval();
            this._babySpawnFired = false;
            this._babySpitTimer  = 0;
            this.attackFrame     = WORM.FRAME_HEAD;
          }

        } else if (this.attackType === 'cellular') {
          // ── CELLULAR AUTOMATTACK LOOP ──
          this._cellularSpitTimer += dt;

          // ANIMATE MOUTH OPEN DURING SPIT WINDOW
          if (this._cellularSpitTimer < WORM.CELLULAR_SPIT_DURATION) {
            this.attackFrameTime += dt;
            const frameDur = 1 / WORM.ATTACK_FPS;
            if (this.attackFrameTime >= frameDur) {
              this.attackFrameTime -= frameDur;
              this.attackFrame++;
              if (this.attackFrame > WORM.FRAME_ATTACK_END) this.attackFrame = WORM.FRAME_ATTACK_START;
            }
          }

          // SEED FIRES ONCE, PARTWAY INTO THE SPIT WINDOW
          if (!this._cellularSpawnFired && this._cellularSpitTimer >= WORM.CELLULAR_SEED_DELAY) {
            this._cellularSpawnFired = true;
            const head = this.segments[0];
            this.onSpawnCellular?.(head.screenX, head.screenY);
          }

          // FAILSAFE TIMEOUT — cellularAttack.onAttackEnd SHOULD CALL endCellularAttack() FIRST
          if (this.attackProgress >= WORM.CELLULAR_MAX_DURATION) {
            this._endCellularAttackInternal();
          }

        } else if (this.attackType === 'lunge') {
          // ── LUNGE / BITE ATTACK LOOP ──
          const p          = this.attackProgress;
          const rearDur    = WORM.LUNGE_REAR_DURATION;
          const strikeDur  = WORM.LUNGE_STRIKE_DURATION;
          const snapDur    = WORM.LUNGE_SNAP_DURATION;
          const bs         = this.baseScale || 0.001;
          const rearWorld  = WORM.LUNGE_PULLBACK_PX / bs;
          const reachWorld = WORM.LUNGE_REACH_PX    / bs;

          // GROWL FIRES ONCE AT START OF REAR-BACK
          if (!this._lungeGrowlFired) {
            this._lungeGrowlFired = true;
            this.onLungeGrowl?.();
          }

          if (p < rearDur) {
            // ── REAR BACK — PULL AWAY FROM SHIP, EASE IN ──
            const t    = p / rearDur;
            const ease = t * t;
            this.headX = this._lungeOriginX - this._lungeDirX * rearWorld * ease;
            this.headY = this._lungeOriginY - this._lungeDirY * rearWorld * ease;
            this._lungePhase = 'rearBack';

          } else if (p < rearDur + strikeDur) {
            // ── FORWARD LUNGE — FAST SNAP TOWARD SHIP, EASE OUT ──
            const t     = (p - rearDur) / strikeDur;
            const ease  = 1 - (1 - t) * (1 - t);
            const fromX = this._lungeOriginX - this._lungeDirX * rearWorld;
            const fromY = this._lungeOriginY - this._lungeDirY * rearWorld;
            const toX   = this._lungeOriginX + this._lungeDirX * reachWorld;
            const toY   = this._lungeOriginY + this._lungeDirY * reachWorld;
            this.headX  = fromX + (toX - fromX) * ease;
            this.headY  = fromY + (toY - fromY) * ease;
            this._lungePhase = 'lunge';

          } else if (p < rearDur + strikeDur + snapDur) {
            // ── SNAP BACK — RETURN TO ORIGIN, EASE OUT ──
            if (!this._lungeSnapFired) {
              this._lungeSnapFired = true;
              const head = this.segments[0];
              this.onLungeSnap?.();
              this.onLungeBite?.(head.screenX, head.screenY, WORM.LUNGE_BITE_RADIUS);
              this.onScreenShake?.(14, 0.28);  // IMPACT FEEDBACK — "OH SHIT" MOMENT
            }
            const t     = (p - rearDur - strikeDur) / snapDur;
            const ease  = t * (2 - t); // EASE OUT
            const fromX = this._lungeOriginX + this._lungeDirX * reachWorld;
            const fromY = this._lungeOriginY + this._lungeDirY * reachWorld;
            this.headX  = fromX + (this._lungeOriginX - fromX) * ease;
            this.headY  = fromY + (this._lungeOriginY - fromY) * ease;
            this._lungePhase = 'snap';

          } else {
            // ── DONE — RETURN HEAD TO ORIGIN, HAND BACK TO WIGGLE ──
            this.headX           = this._lungeOriginX;
            this.headY           = this._lungeOriginY;
            this.isAttacking     = false;
            this.attackPhase     = 'idle';
            this.attackTimer     = this._rollInterval();
            this._lungePhase     = 'rearBack'; // RESET SUB-PHASE
            this._lungeGrowlFired = false;
            this._lungeSnapFired  = false;
          }
        }
      }
    } else {
      if (this._attacksEnabled) { // WAIT FOR RISER TO FINISH BEFORE FIRST ATTACK
        this.attackTimer -= dt;
        if (this.attackTimer <= 0 && this.alpha > 0.8) {
          this._attackIndex++;
          this.attackType      = this._pickNextAttack();  // AI — HEALTH-TIERED, DISTANCE-WEIGHTED SELECTION
          this._lastAttackType = this.attackType;
          this._attackHistory.push(this.attackType);        // ROLLING 3-ATTACK MEMORY
          if (this._attackHistory.length > 3) this._attackHistory.shift();
          this.isAttacking     = true;
          this.attackProgress  = 0;
          this._cellularSpitTimer = 0;

          if (this.attackType === 'lunge') {
            // SKIP transIn — LUNGE STARTS IMMEDIATELY IN LOOP PHASE
            this.attackPhase = 'loop';
            this._initLunge();
          } else {
            this.attackPhase = 'transIn';
          }

          if (this.onAttack) this.onAttack();
        }
      }
    }

    // ============= ORGANIC HEAD MOVEMENT =============
    if (this._orbitScreenX !== null) {
      // ── BLACK HOLE ORBIT ──
      // cx / cy CACHED AT TOP OF update()
      const bs = this.baseScale || 0.001;
      const worldTargetX = (this._orbitScreenX - cx) / bs;
      const worldTargetY = (this._orbitScreenY - cy) / bs;
      this.headX += (worldTargetX - this.headX) * Math.min(1, 9 * dt);
      this.headY += (worldTargetY - this.headY) * Math.min(1, 9 * dt);
    } else if (this.isAttacking && this.attackType === 'lunge') {
      // ── LUNGE — HEAD POSITION DRIVEN DIRECTLY BY ATTACK HANDLER ABOVE, SKIP WIGGLE ──
    } else {
      // ── NORMAL WIGGLE ──
      const t = this.time + this.phaseOffset;
      const approachFrac = 1.0 - Math.max(0, (this.z - WORM.IDLE_Z) / (WORM.START_Z - WORM.IDLE_Z));
      const spawnBlendX  = WORM.SPAWN_OFFSET_X * (1.0 - approachFrac);
      const spawnBlendY  = WORM.SPAWN_OFFSET_Y * (1.0 - approachFrac);
      const targetX = spawnBlendX + organicNoise(t, WORM.WIGGLE_X);
      const targetY = spawnBlendY + organicNoise(t, WORM.WIGGLE_Y);
      this.headX += (targetX - this.headX) * WORM.HEAD_SMOOTH;
      this.headY += (targetY - this.headY) * WORM.HEAD_SMOOTH;
    }

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
    // cx / cy CACHED AT TOP OF update()
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
        if (this.attackPhase === 'loop') {
          if (this.attackType === 'cellular') {
            // USE ATTACK FRAMES ONLY DURING SPIT WINDOW, THEN RETURN TO NEUTRAL HEAD
            frame = (this._cellularSpitTimer < WORM.CELLULAR_SPIT_DURATION)
              ? this.attackFrame
              : WORM.FRAME_HEAD;
          } else if (this.attackType === 'lunge') {
            // OPEN MOUTH (FRAME 4) ONLY DURING THE FORWARD STRIKE PHASE; IDLE OTHERWISE
            frame = (this._lungePhase === 'lunge') ? WORM.FRAME_ATTACK_START : WORM.FRAME_HEAD;
          } else {
            frame = this.attackFrame;
          }
        }
        else if (this.attackPhase === 'transIn') frame = WORM.FRAME_TRANSITION;
        else                                     frame = WORM.FRAME_HEAD;
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
        // SCALE DOWN HEAD IF ON AN ATTACK FRAME (FRAMES 4-14 ARE SLIGHTLY OVERSIZED)
        if (frame >= WORM.FRAME_ATTACK_START) {
          ctx.scale(WORM.ATTACK_HEAD_SCALE, WORM.ATTACK_HEAD_SCALE);
        }
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

      const tintStrength = (1 - Math.min(1, this.alpha * 3)) * 0.85; 
      if (tintStrength > 0.01) {
        ctx.save();
        ctx.globalAlpha = tintStrength;
        ctx.fillStyle   = '#000000';
        ctx.beginPath();
        ctx.arc(
          seg.screenX + (seg.rippleX || 0),
          seg.screenY + (seg.rippleY || 0),
          size * 0.5, 0, Math.PI * 2
        );
        ctx.fill();
        ctx.restore();
      }
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
          this.isDying      = true;
          this.dyingTimer   = 0;
          this.dyingSegIndex = 0;
        }

        return { hit: true, segIndex: i, killed, x: ws.screenX, y: ws.screenY };
      }
    }
    return { hit: false };
  }

  // ======================= AI — ATTACK SELECTION =======================

  // RETURNS A RANDOMIZED WAIT TIME BETWEEN ATTACKS (5–10s BY DEFAULT)
  _rollInterval() {
    return WORM.ATTACK_INTERVAL_MIN
      + Math.random() * (WORM.ATTACK_INTERVAL_MAX - WORM.ATTACK_INTERVAL_MIN);
  }

  /**
   * WEIGHTED ATTACK PICKER — THE BOSS'S BRAIN
   * THREE LAYERS OF DECISION MAKING:
   *   1. HEALTH TIER GATES   — limits which attacks are even available
   *   2. DISTANCE WEIGHTS    — boosts lunge when close, ranged when far
   *   3. NO-REPEAT GUARD     — halves the weight of the last attack used
   * @returns {string} attackType
   */
  _pickNextAttack() {
    const hp = this.getHealthPercent();

    // BUILD POOL — HEALTH TIER GATES WHAT'S AVAILABLE
    const pool = [
      { type: 'babyworm', weight: 1.0 },  // TIER 1: ALWAYS AVAILABLE
      { type: 'lunge',    weight: 1.0 },  // TIER 1: ALWAYS AVAILABLE
    ];
    if (hp <= WORM.AI_TIER_CELLULAR) pool.push({ type: 'cellular', weight: 1.0 }); // TIER 2: 75% HP
    if (hp <= WORM.AI_TIER_SUCTION)  pool.push({ type: 'suction',  weight: 1.0 }); // TIER 3: 40% HP

    // DISTANCE MODIFIER — SCREEN-SPACE PROXIMITY TO HEAD
    const head = this.segments[0];
    const dx   = this._shipScreenX - head.screenX;
    const dy   = this._shipScreenY - head.screenY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    for (const entry of pool) {
      if (entry.type === 'lunge') {
        // LUNGE IS STRONGEST WHEN CLOSE — RAMP FROM 0.4x (FAR) UP TO 3x (CLOSE)
        if      (dist < WORM.AI_DIST_CLOSE) entry.weight = 3.0;
        else if (dist < WORM.AI_DIST_FAR)   entry.weight = 1.5;
        else                                 entry.weight = 0.4;
      } else {
        // RANGED ATTACKS GET A BUMP WHEN SHIP IS FARTHER AWAY
        if (dist > WORM.AI_DIST_FAR) entry.weight = 1.6;
      }
    }

    // NO-REPEAT GUARD — HALVE WEIGHT OF LAST ATTACK TO DISCOURAGE BACK-TO-BACK
    if (this._lastAttackType) {
      const last = pool.find(e => e.type === this._lastAttackType);
      if (last) last.weight *= 0.5;
    }

    // ATTACK HISTORY GUARD — FURTHER REDUCE WEIGHT FOR ANY ATTACK IN RECENT 3-ATTACK MEMORY
    for (const entry of pool) {
      if (this._attackHistory.includes(entry.type)) entry.weight *= 0.55;
    }

    // WEIGHTED RANDOM PICK
    const total = pool.reduce((sum, e) => sum + e.weight, 0);
    let r = Math.random() * total;
    for (const entry of pool) {
      r -= entry.weight;
      if (r <= 0) return entry.type;
    }
    return pool[pool.length - 1].type; // FALLBACK (FLOATING POINT EDGE CASE)
  }

  // ======================= CELLULAR ATTACK END =======================

  // CALLED BY bossBattle.js VIA cellularAttack.onAttackEnd — ENDS THE CELLULAR LOOP CLEANLY
  endCellularAttack() { this._endCellularAttackInternal(); }

  _endCellularAttackInternal() {
    this.isAttacking          = false;
    this.attackPhase          = 'idle';
    this.attackTimer          = this._rollInterval();
    this._cellularSpawnFired  = false;
    this._cellularSpitTimer   = 0;
  }

  // SNAPSHOT HEAD ORIGIN + AIMED DIRECTION TOWARD SHIP AT LUNGE START
  _initLunge() {
    this._lungeOriginX    = this.headX;
    this._lungeOriginY    = this.headY;
    this._lungeGrowlFired = false;
    this._lungeSnapFired  = false;
    this._lungePhase      = 'rearBack';

    // CONVERT SHIP SCREEN COORDS → WORLD SPACE AND AIM
    const cx = window.innerWidth  / 2;
    const cy = window.innerHeight / 2;
    const bs = this.baseScale || 0.001;
    const shipWorldX = (this._shipScreenX - cx) / bs;
    const shipWorldY = (this._shipScreenY - cy) / bs;
    const dx  = shipWorldX - this.headX;
    const dy  = shipWorldY - this.headY;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    this._lungeDirX = dx / len;
    this._lungeDirY = dy / len;
  }

  // CALLED EACH FRAME BY bossBattle.js SO THE LUNGE CAN AIM AT THE SHIP
  setShipPosition(sx, sy) {
    this._shipScreenX = sx;
    this._shipScreenY = sy;
  }

  // FORCE WORM INTO SUCTION ATTACK LOOP IMMEDIATELY — USED BY BOSS GAME OVER SEQUENCE
  forceSuction() {
    this.isAttacking     = true;
    this.attackType      = 'suction';
    this.attackPhase     = 'loop';
    this.attackProgress  = 0;
    this.attackFrame     = WORM.FRAME_ATTACK_START;
    this.attackFrameTime = 0;
    this._babySpawnFired = false;
  }

  getHeadPosition() {
    const s = this.segments[0];
    return { x: s.screenX, y: s.screenY };
  }

  getHealthPercent() {
    return Math.max(0, this.health / this.maxHealth);
  }
}