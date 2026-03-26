// Updated 3/26/26 @ 10AM
// WORM.JS
// ~~~~~~~~~~~~~~~~~~~~ IMPORTS ~~~~~~~~~~~~~~~~~~~~
import { CONFIG }      from '../utils/config.js';
import { ImageLoader } from '../utils/imageLoader.js';
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
  AI_TIER_BABYWORM: 0.80, // BELOW THIS HEALTH → BABY WORM ATTACK UNLOCKED (80% HP)
  AI_TIER_SUCTION:   0.50, // BELOW THIS HEALTH → SUCTION ATTACK UNLOCKED (50% HP)
  AI_TIER_DISABLE_CELLULAR: 0.40, // BELOW THIS HEALTH → CELLULAR ATTACK DISABLED (40% HP — PRE-RAGE WIND-DOWN)
  AI_TIER_DISABLE_ALL:      0.31, // BELOW THIS HEALTH → ALL NEW ATTACKS GATED OFF (33% HP — CLEARS FIELD BEFORE RAGE)
  AI_DIST_CLOSE:    180,   // PIXELS — BELOW THIS: STRONGLY PREFER LUNGE
  AI_DIST_FAR:      400,   // PIXELS — ABOVE THIS: PREFER RANGED ATTACKS
  CELLULAR_SPIT_DURATION: 1, // SECONDS MOUTH STAYS OPEN AFTER SEED FIRES
  CELLULAR_SEED_DELAY:    0.5, // SECONDS INTO LOOP BEFORE onSpawnCellular FIRES
  CELLULAR_MAX_DURATION:  30,  // FAILSAFE — FORCE-END ATTACK IF STILL ACTIVE AFTER THIS
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
  HEALTH:           300, // For Testing
  SEGMENT_HEALTH:   1,     
  HEAD_HEALTH_MULT: 2,     
  RAGE_TRIGGER_THRESHOLD: 0.3,
  RAGE_THRESHOLD:     0.25,
  RAGE_INTERVAL_MULT: 0.75,
  RAGE_LUNGE_WEIGHT:  5.0,
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
  constructor(smokeSprite, smokeFrameWidth) { // SPAWN JUST OUTSIDE A RANDOM SCREEN EDGE
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

  update(dt, targetX, targetY) {  // VECTOR FROM PARTICLE TO WORM MOUTH
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

    const tx = -ny; // CCW TANGENTIAL: ROTATE RADIAL 90° COUNTER-CLOCKWISE  → (-ny, nx)
    const ty =  nx;

    const closeness  = Math.max(0, 1 - dist / SUCTION.VORTEX_RADIUS); // VORTEX ACCELERATION: RAMPS UP SMOOTHLY AS PARTICLE CLOSES IN
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
    this.headFrame = WORM.FRAME_HEAD; // USED IN enterRageMode
    this.headFrameTime = 0;
    this.health       = WORM.HEALTH;
    this.maxHealth    = WORM.HEALTH;
    this.isDead       = false;
    this.isActive     = false;
    this.alpha        = WORM.ALPHA_START;
    // ATTACK ANIMATION STATE
    this.attackTimer     = this._rollInterval();  // ATTACK ANIMATION STATE
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
    this._attacksLocked = false;       // HARD LOCK
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

    this.isRaging     = false; // RAGE MODE
    this.onRageStart  = null;
    this.rageBufferTimer = 0;
    this._rageWaitingForHit = false; // TRUE WHEN HP HITS 30% MID-ATTACK — ARMS HIT-TRIGGER
    this._rageOnNextHit     = false; // TRUE WHEN ATTACK ENDS AND RAGE IS STILL PENDING — FIRES ON FIRST PLAYER HIT
    this.freeze = false;
    // LUNGE ATTACK STATE
    this._shipScreenX     = 0;    // UPDATED EACH FRAME BY bossBattle.js VIA setShipPosition()
    this._shipScreenY     = 0;
    this._lungeOriginX    = 0;    // WORLD-SPACE HEAD POSITION WHEN LUNGE STARTED
    this._lungeOriginY    = 0;
    this._lungeDirX       = 0;    // NORMALIZED WORLD-SPACE DIRECTION TOWARD SHIP
    this._lungeDirY       = 0;
    this._lungePhase      = 'rearBack'; // REAR BACK | LUNGE | SNAP
    this._lungeGrowlFired = false;
    this._lungeSnapFired  = false;
    this.isSuctionActive = false;

    this._orbitScreenX    = null;     // BLACK HOLE ORBIT STATE — SET EACH FRAME BY singularityBomb.js WHILE ACTIVE
    this._orbitScreenY    = null;

    this.isDying       = false; // DEATH SEQUENCE STATE
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

    // ── INSIDE-OUT RAGE TRANSFORMATION — 
    const _n = WORM.NUM_SEGMENTS;
    this._rageTransform = {
      active:       false,
      segCount:     0,          // HOW MANY RAGE SEGMENTS HAVE BEEN REVEALED (HEAD FIRST)
      timer:        0,          // ACCUMULATOR FOR NEXT REVEAL (only ticks when NOT frozen)
      segInterval:  0.4,        // SECONDS PER SEGMENT — 20 × 0.4s = 8s FULL CRAWL
      shinePulse:   0,          // RUNNING CLOCK FOR WET SHEEN ANIMATION
      rageAlphas:   new Float32Array(_n),           // PER-SEGMENT FADE-IN (0→1)
      normalAlphas: new Float32Array(_n).fill(1),   // PER-SEGMENT FADE-OUT (1→0)
      rageSegs:     Array.from({ length: _n }, () => ({ x: 0, y: 0, screenX: 0, screenY: 0 })),
      drips:        [],         // BLOOD/SLIME DRIP PARTICLES AT EACH EMERGENCE POINT
      emerged:      false,      // TRUE WHEN ALL SEGMENTS FULLY TRANSITIONED
      headAlphaNormal: 1.0, 
      headAlphaRage: 0.0,
      headSwapProgress: 0,
      normalHeadStartX: 0, 
      normalHeadStartY: 0, 
      forwardX: 0,
      forwardY: 0, 
      maxOffset: 150,   
      initialPopOffset: 80,          //HOW FAR THE HEAD POPS DURING OPENING
      stepPerSegment: WORM.SEGMENT_SPACING * 0.55, // HOW MUCH HEAD ADVANCES PER NEW SEGMENT
      normalFadeCount: 0,   // HOW MANY NORMAL SEGMENTS (FROM TAIL) HAVE STARTED FADING
    };
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

    this.isRaging = false;
    this.rageBufferTimer = 0;
    this._rageWaitingForHit = false;
    this._rageOnNextHit     = false;


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
      const _rt = this._rageTransform;
      _rt.active = false; 
      _rt.segCount = 0; 
      _rt.timer = 0; 
      _rt.shinePulse = 0;
      _rt.rageAlphas.fill(0); 
      _rt.normalAlphas.fill(1); 
      _rt.drips = []; 
      _rt.emerged = false;
      _rt.normalFadeCount = 0;           
      for (let _i = 0; _i < WORM.NUM_SEGMENTS; _i++) {
        _rt.rageSegs[_i].x = WORM.SPAWN_OFFSET_X;
        _rt.rageSegs[_i].y = WORM.SPAWN_OFFSET_Y;
        _rt.rageSegs[_i].screenX = 0;
        _rt.rageSegs[_i].screenY = 0;
      }
      this._introFired = false;
    }

  applyBlackHoleStun(duration) {
    this.stunTimer = Math.max(this.stunTimer, duration); 
    // console.log(`💜 Worm stunned for ${duration}s by Singularity Bomb`);
    if (this.onStunned) this.onStunned(duration);
  }

  // CALLED BY bossBattle.readyForBattle() WHEN THE RISER ENDS AND BOSS MUSIC STARTS - STARTS THE ATTACK COUNTDOWN SO THE FIRST ATTACK NEVER FIRES DURING THE INTRO
  enableAttacks() {
    this._attacksEnabled = true;
    this.attackTimer     = this._rollInterval();
  }


  disableAllAttacks() { // FOR WORM RAGE TRANSFORMATION
    this._attacksLocked = true;
    this.isAttacking = false;
    this.attackPhase = 'idle';
  }

  enableAllAttacks() { // FOR WORM RAGE TRANSFORMATION
    this._attacksLocked = false;
}


  forceNeutralHead() { 
    this.headFrame = WORM.FRAME_HEAD;
    this.headFrameTime = 0;
  }
  // ======================= INSIDE-OUT RAGE TRANSFORM =======================
    startRageTransform() {
      const rt = this._rageTransform;
      const hx = this.segments[0].x;
      const hy = this.segments[0].y;
      rt.active = true;
      rt.segCount  = 1;
      rt.timer     = 0;
      rt.shinePulse = 0;
      rt.rageAlphas.fill(0);
      rt.normalAlphas.fill(1);
      rt.drips  = [];
      rt.emerged = false;
      rt.normalFadeCount = 0;               

      rt.headAlphaNormal = 1.0;
      rt.headAlphaRage = 0.0;
      rt.headSwapProgress = 0;
      rt.headSwapStarted = false;

      rt.normalHeadStartX = hx;
      rt.normalHeadStartY = hy;

      if (this.segments.length > 1) {
        const dx = this.segments[0].x - this.segments[1].x;
        const dy = this.segments[0].y - this.segments[1].y;
        const len = Math.hypot(dx, dy);
        if (len > 0.001) {
          rt.forwardX = dx / len;
          rt.forwardY = dy / len;
        } else {
          rt.forwardX = 0;
          rt.forwardY = -1;
        }
      } else {
        rt.forwardX = 0;
        rt.forwardY = -1;
      }

      for (let i = 0; i < WORM.NUM_SEGMENTS; i++) {
        rt.rageSegs[i].x = hx;
        rt.rageSegs[i].y = hy;
        rt.rageSegs[i].screenX = this.segments[0].screenX;
        rt.rageSegs[i].screenY = this.segments[0].screenY;
      }
      ImageLoader.load('wormRage');
    }

  // CALLED BY startSuctionAttack() — INSTANTLY FINALISES THE TRANSFORM IF THE TIMING GAP BETWEEN
  // THE LAST SEGMENT REVEAL AND normalAlphas[0] REACHING 0 WOULD LEAVE SEGMENTS[0] AT THE WRONG POSITION.
  // SAFE TO CALL WHEN ALREADY EMERGED (NO-OP).
  _forceCompleteRageTransform() {
    const rt = this._rageTransform;
    if (!rt.active) return;
    const n = WORM.NUM_SEGMENTS;
    rt.segCount = n;
    rt.rageAlphas.fill(1);
    rt.normalAlphas.fill(0);
    rt.headAlphaNormal = 0;
    rt.headAlphaRage   = 1;
    rt.normalFadeCount = n;
    rt.emerged         = true;
    this.headX         = rt.rageSegs[0].x;
    this.headY         = rt.rageSegs[0].y;
    for (let i = 0; i < n; i++) {
      this.segments[i].x = rt.rageSegs[i].x;
      this.segments[i].y = rt.rageSegs[i].y;
    }
    rt.active = false;
    rt.drips  = [];
  }

    _updateRageTransform(dt) {
      const rt = this._rageTransform;
      const n  = WORM.NUM_SEGMENTS;
      const bs = this.baseScale || 0.001;
      const cx = window.innerWidth / 2;
      const cy = window.innerHeight / 2;

      rt.shinePulse += dt * 5;

      // HEAD SWAP ANIMATION 
      if (rt.active && !rt.emerged && !this.freeze) {
        if (!rt.headSwapStarted) {
          rt.headSwapStarted = true;
          rt.headSwapProgress = 0;
        }
        rt.headSwapProgress = Math.min(1.0, rt.headSwapProgress + dt * 0.9);
        const easeInOut = rt.headSwapProgress < 0.5
          ? 2 * rt.headSwapProgress * rt.headSwapProgress
          : 1 - Math.pow(-2 * rt.headSwapProgress + 2, 2) / 2;

        const rageStart = 0.2;
        rt.headAlphaRage = Math.min(1, Math.max(0, (easeInOut - rageStart) / (1 - rageStart)));


      rt.rageAlphas[0] = rt.headAlphaRage;

      // ─── NORMAL HEAD LINGERS UNTIL ~55% OF FULL TRANSFORMATION ───
      if (rt.active && !rt.emerged) {
        const overallProgress = Math.min(1, rt.segCount / n);
        if (overallProgress > 0.8) {
          const fadeStart = 0.8;
          const fadeProgress = (overallProgress - fadeStart) / (1 - fadeStart);
          rt.headAlphaNormal = Math.max(0, 1 - fadeProgress * 1.8);
        } else {
          rt.headAlphaNormal = 1.0;
        }
      }



      }

      // LOCK NORMAL HEAD POSITION
      if (rt.active && !rt.emerged) {
        this.headX = rt.normalHeadStartX;
        this.headY = rt.normalHeadStartY;
      }

      // RAGE HEAD MOVEMENT (SLITHERING OUT)
      if (!rt.emerged) {
        let offset = 0;
        if (rt.active) {
          const popProgress = Math.min(1, rt.headSwapProgress);
          const popOffset = popProgress * rt.initialPopOffset;
          const segmentAdvance = (rt.segCount - 1) * rt.stepPerSegment;
          offset = popOffset + segmentAdvance;
        }
        const rageHeadX = rt.normalHeadStartX + rt.forwardX * offset;
        const rageHeadY = rt.normalHeadStartY + rt.forwardY * offset;
        rt.rageSegs[0].x = rageHeadX;
        rt.rageSegs[0].y = rageHeadY;
        rt.rageSegs[0].screenX = cx + rageHeadX * bs;
        rt.rageSegs[0].screenY = cy + rageHeadY * bs;
      }

      // RAGE IK CHAIN
      for (let k = 1; k < rt.segCount; k++) {
        const prev = rt.rageSegs[k - 1];
        const curr = rt.rageSegs[k];
        const dx = curr.x - prev.x;
        const dy = curr.y - prev.y;
        const dist = Math.hypot(dx, dy);
        if (dist > WORM.SEGMENT_SPACING && dist > 0) {
          const ratio = WORM.SEGMENT_SPACING / dist;
          curr.x = prev.x + dx * ratio;
          curr.y = prev.y + dy * ratio;
        }
        curr.screenX = cx + curr.x * bs;
        curr.screenY = cy + curr.y * bs;
      }

      // DRIP PHYSICS
      for (let i = rt.drips.length - 1; i >= 0; i--) {
        const d = rt.drips[i];
        d.x += d.vx * dt;
        d.y += d.vy * dt;
        d.vy += 300 * dt;
        d.life -= dt;
        if (d.life <= 0) rt.drips.splice(i, 1);
      }

      if (rt.emerged) return;

      // FADE IN RAGE SEGMENTS 
      for (let i = 1; i < rt.segCount; i++) {
        rt.rageAlphas[i] = Math.min(1, rt.rageAlphas[i] + dt * 4.0);
      }

      // FADE OUT NORMAL SEGMENTS — ONE-BY-ONE FROM TAIL - SYNCED 
      for (let k = 0; k < rt.normalFadeCount; k++) {
        const j = n - 1 - k;
        rt.normalAlphas[j] = Math.max(0, rt.normalAlphas[j] - dt * 2.5);
      }

      // SEGMENT REVEAL — ADVANCES THE NORMAL FADE COUNT
      if (!this.freeze) {
        rt.timer += dt;
        while (rt.timer >= rt.segInterval && rt.segCount < n) {
          rt.timer -= rt.segInterval;
          const k = rt.segCount;
          rt.segCount++;
          rt.normalFadeCount = Math.min(n, rt.normalFadeCount + 1);   // ← SYNC: ONE NORMAL SEGMENT FADES PER RAGE SEGMENT REVEALED

          const mouth = this.segments[0];
          rt.rageSegs[k].x = mouth.x;
          rt.rageSegs[k].y = mouth.y;
          rt.rageSegs[k].screenX = mouth.screenX;
          rt.rageSegs[k].screenY = mouth.screenY;

          const count = 4 + Math.floor(Math.random() * 4);
          for (let d = 0; d < count; d++) {
            const life = 0.5 + Math.random() * 0.7;
            const sz = mouth.drawSize;
            rt.drips.push({
              x: mouth.screenX + (Math.random() - 0.5) * sz * 0.45,
              y: mouth.screenY + (Math.random() - 0.5) * sz * 0.15,
              vx: (Math.random() - 0.5) * 55,
              vy: 20 + Math.random() * 65,
              size: 2 + Math.random() * 5,
              life,
              maxLife: life,
            });
          }
        }
      }

      // COMPLETION CHECK — FULL HAND-OFF
      if (rt.segCount >= n && rt.normalAlphas[0] <= 0 && !rt.emerged) {
        rt.emerged = true;
        rt.rageAlphas.fill(1);
        rt.normalAlphas.fill(0);
        rt.headAlphaNormal = 0;
        rt.headAlphaRage = 1;
        rt.normalFadeCount = n;

        this.headX = rt.rageSegs[0].x;
        this.headY = rt.rageSegs[0].y;
        for (let i = 0; i < n; i++) {
          this.segments[i].x = rt.rageSegs[i].x;
          this.segments[i].y = rt.rageSegs[i].y;
        }

        rt.active = false;
        rt.drips = [];
      }
    }

  enterRageMode() {
    this.isRaging = true;
    if (this.onRageStart) this.onRageStart();
  }

  startSuctionAttack() {
    // FORCE-COMPLETE RAGE TRANSFORM IF STILL IN PROGRESS — PREVENTS SUCTION TARGETING
    // THE LOCKED NORMAL-HEAD POSITION (AT THE RAGE WORM'S TAIL) INSTEAD OF THE RAGE HEAD
    if (this._rageTransform.active) this._forceCompleteRageTransform();
    this.isAttacking     = true;
    this.attackType      = 'suction';
    this.attackPhase     = 'loop';
    this.attackProgress  = 0;
    this.attackFrame     = WORM.FRAME_ATTACK_START;
    this.attackFrameTime = 0;
    this._babySpawnFired     = false;
    this._cellularSpawnFired = false;
    this._lungeGrowlFired    = false;
    this._lungeSnapFired     = false;
    this.isSuctionActive = true; 
  }

  stopSuctionAttack() {
    this.isSuctionActive = false;
    this.isAttacking = false;
    this.attackType = null;
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

    // RAGE TRANSFORM RUNS BEFORE THE FREEZE CHECK — IT IS THE VISUAL PAYLOAD OF THE FREEZE WINDOW
    if (this._rageTransform.active) this._updateRageTransform(dt);

    if (this.freeze) return;

    this.time += dt;

    // CACHE SCREEN CENTER ONCE PER FRAME — REUSED IN DYING PATH, ORBIT PATH, AND SEGMENT PROJECTION
    const cx = window.innerWidth  / 2;
    const cy = window.innerHeight / 2;

    // ============= APPROACH / SCALE (ALWAYS NEEDED — EVEN WHILE DYING) =============
    this.z       += (WORM.IDLE_Z - this.z) * WORM.APPROACH_SPEED;
    this.baseScale = WORM.FOCAL_LENGTH / (WORM.FOCAL_LENGTH + this.z);

    // ============= RAGE MODE TRIGGER =============
    if (!this.isRaging && !this._rageWaitingForHit && this.health / this.maxHealth <= WORM.RAGE_TRIGGER_THRESHOLD) {
      if (!this.isAttacking) {
        this.enterRageMode();                 // IDLE — FIRE IMMEDIATELY
      } else {
        this._rageWaitingForHit = true;       // MID-ATTACK — WAIT FOR ATTACK TO END, THEN ARM HIT-TRIGGER
      }
    }

    // ============= RAGE ON NEXT HIT — ARMS ONCE PENDING ATTACK COMPLETES =============
    // WHEN THE ATTACK THAT WAS RUNNING AT 30% HP FINALLY ENDS, WE SWITCH FROM
    // "WAITING FOR ATTACK" → "WAITING FOR PLAYER HIT" — checkProjectileHit() PULLS THE TRIGGER
    if (this._rageWaitingForHit && !this.isAttacking && !this._rageOnNextHit) {
      this._rageOnNextHit = true;
    }

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

      // UPDATE SCREEN POSITIONS cx / cy CACHED AT TOP OF update()
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
        this.attackTimer         = WORM.ATTACK_INTERVAL_MIN * 0.5;
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

      if (this._attacksLocked) {
        this.isAttacking = false;
        this.attackPhase = 'idle';
        return;
}

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

        if (this.attackTimer <= 0 && this.alpha > 0.8 && (this.isRaging || this.getHealthPercent() > WORM.AI_TIER_DISABLE_ALL)) {
          
          this._attackIndex++;
          this.attackType      = this._pickNextAttack();  // AI — HEALTH-TIERED, DISTANCE-WEIGHTED SELECTION
          this._lastAttackType = this.attackType;
          this._attackHistory.push(this.attackType);     
          if (this._attackHistory.length > 3) this._attackHistory.shift();
          this.isAttacking     = true;
          this.attackProgress  = 0;
          this._cellularSpitTimer = 0;

          if (this.attackType === 'lunge') {
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
      // ── BLACK HOLE ORBIT (cx / cy CACHED AT TOP OF update()) ──
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
      let targetX = spawnBlendX + organicNoise(t, WORM.WIGGLE_X);
      let targetY = spawnBlendY + organicNoise(t, WORM.WIGGLE_Y);

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
    this.suctionParticles.draw(ctx);

    ctx.save();
    ctx.globalAlpha = this.alpha;

    const rt         = this._rageTransform;
    const rageSprite = (rt.active || this.isRaging) ? ImageLoader.get('wormRage') : null;
    const rageFrameW = rageSprite ? rageSprite.width / WORM.SPRITE_FRAMES : 0;

    // PRE-COMPUTE ATTACK HEAD FRAME — SHARED BY BOTH DRAW PASSES
    let headFrame;
    if (this.attackPhase === 'loop') {
      if (this.attackType === 'cellular') {
        headFrame = (this._cellularSpitTimer < WORM.CELLULAR_SPIT_DURATION)
          ? this.attackFrame : WORM.FRAME_HEAD;
      } else if (this.attackType === 'lunge') {
        headFrame = (this._lungePhase === 'lunge') ? WORM.FRAME_ATTACK_START : WORM.FRAME_HEAD;
      } else {
        headFrame = this.attackFrame;
      }
    } else if (this.attackPhase === 'transIn') {
      headFrame = WORM.FRAME_TRANSITION;
    } else {
      headFrame = WORM.FRAME_HEAD;
    }

    // PASS 1: NORMAL WORM — TAIL → HEAD, DRAWING ALL NORMAL SEGMENTS FIRST SO RAGE WORM IS LAYERED ON TOP
    for (let i = WORM.NUM_SEGMENTS - 1; i >= 0; i--) {
      const seg = this.segments[i];
      if (seg.isDead) continue;
      const size = seg.drawSize;
      if (size < 1) continue;

      const normalAlpha = rt.active ? rt.normalAlphas[i] : (this.isRaging ? 0.0 : 1.0);

      // ── CAVITY VOID ──
      if (rt.active && normalAlpha < 0.85 && normalAlpha > 0) {
        const cavityA = (0.85 - normalAlpha) / 0.85 * 0.72 * this.alpha;
        if (cavityA > 0.01) {
          ctx.save();
          ctx.globalAlpha = cavityA;
          ctx.fillStyle   = '#000000';
          ctx.beginPath();
          ctx.arc(seg.screenX + (seg.rippleX || 0), seg.screenY + (seg.rippleY || 0),
            size * 0.46, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }

      // ── NORMAL SEGMENT ──
      if (normalAlpha > 0.01) {
        ctx.save();
        const headBlendAlpha = (i === 0 && rt.active) ? rt.headAlphaNormal : 1.0;
        ctx.globalAlpha = this.alpha * normalAlpha * headBlendAlpha;
        ctx.translate(seg.screenX + (seg.rippleX || 0), seg.screenY + (seg.rippleY || 0));

        if (i === 0) {
          const wiggle = Math.sin(this.time * 3.5 + this.phaseOffset) * 0.08;
          ctx.rotate(wiggle);

          let normalHeadFrame = headFrame;
          if (rt.active && !rt.emerged && rt.headAlphaNormal > 0.1) {
            let openAmount;
            if (rt.headSwapProgress < 0.3) {
              openAmount = rt.headSwapProgress / 0.3;
            } else {
              openAmount = 1.0;
            }
            const frameIndex = Math.floor(openAmount * (WORM.FRAME_ATTACK_END - WORM.FRAME_ATTACK_START + 1));
            normalHeadFrame = WORM.FRAME_ATTACK_START + Math.min(frameIndex, WORM.FRAME_ATTACK_END - WORM.FRAME_ATTACK_START);
            ctx.scale(1 + openAmount * 0.3, 1 - openAmount * 0.3);
          } else if (headFrame >= WORM.FRAME_ATTACK_START) {
            ctx.scale(WORM.ATTACK_HEAD_SCALE, WORM.ATTACK_HEAD_SCALE);
          }
          if (this.spriteLoaded && this.frameWidth > 0) {
            ctx.drawImage(this.sprite, normalHeadFrame * this.frameWidth, 0,
              this.frameWidth, this.sprite.height,
              -size / 2, -size / 2, size, size);
          }

        } else {
          const bodyFrame = (i === WORM.NUM_SEGMENTS - 1) ? WORM.FRAME_TAIL : WORM.FRAME_SEGMENT;
          const prev = this.segments[i - 1];
          ctx.rotate(Math.atan2(prev.screenY - seg.screenY, prev.screenX - seg.screenX) - Math.PI / 2);
          if (seg.flashTimer > 0) {
            ctx.globalCompositeOperation = 'lighter';
            ctx.globalAlpha = 0.6 * normalAlpha * headBlendAlpha;
          }
          if (this.spriteLoaded && this.frameWidth > 0) {
            ctx.drawImage(this.sprite, bodyFrame * this.frameWidth, 0,
              this.frameWidth, this.sprite.height,
              -size / 2, -size / 2, size, size);
          } else {
            const colors = ['#ff00aa', '#cc00ff', '#8800cc'];
            ctx.fillStyle = colors[bodyFrame] || '#ff00aa';
            ctx.beginPath();
            ctx.arc(0, 0, size / 2, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        ctx.restore();
      }

      // ── APPROACH TINT ──
      const tintStrength = (1 - Math.min(1, this.alpha * 3)) * 0.85;
      if (tintStrength > 0.01) {
        ctx.save();
        ctx.globalAlpha = tintStrength;
        ctx.fillStyle   = '#000000';
        ctx.beginPath();
        ctx.arc(seg.screenX + (seg.rippleX || 0), seg.screenY + (seg.rippleY || 0),
          size * 0.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    // ── SLIME DRIPS —  ──
    if (rt.active && rt.drips.length > 0) {
      ctx.save();
      ctx.shadowColor = '#990000';
      ctx.shadowBlur  = 5;
      for (const d of rt.drips) {
        const t     = Math.max(0, 1 - d.life / d.maxLife);
        const alpha = Math.max(0, (1 - t * 1.05)) * 0.88 * this.alpha;
        if (alpha < 0.01) continue;
        ctx.globalAlpha = alpha;
        ctx.fillStyle   = '#5a0000';
        ctx.beginPath();
        ctx.ellipse(d.x, d.y, d.size * 0.55, d.size * (1 + t * 0.8), 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // PASS 2: RAGE WORM — TAIL → HEAD, DRAWN ABOVE ALL NORMAL SEGMENTS
    if (rageSprite && rageFrameW > 0) {
      for (let i = WORM.NUM_SEGMENTS - 1; i >= 0; i--) {
        const seg = this.segments[i];
        if (seg.isDead) continue;
        const size = seg.drawSize;
        if (size < 1) continue;

        const rageAlpha = (rt.active && i < rt.segCount)
          ? rt.rageAlphas[i]
          : (rt.emerged && this.isRaging ? 1.0 : 0.0);
        if (rageAlpha <= 0.01) continue;

        const headBlendAlpha = (i === 0 && rt.active) ? rt.headAlphaRage : 1.0;
        const rsx = (rt.active && i < rt.segCount) ? rt.rageSegs[i].screenX : seg.screenX;
        const rsy = (rt.active && i < rt.segCount) ? rt.rageSegs[i].screenY : seg.screenY;

        // PER-SEGMENT RAGE FRAME
        let rageFrame;
        if (i === 0) {
          rageFrame = rt.emerged
            ? ((headFrame >= WORM.FRAME_ATTACK_START) ? headFrame : WORM.FRAME_HEAD)
            : WORM.FRAME_HEAD;
        } else {
          rageFrame = (i === WORM.NUM_SEGMENTS - 1) ? WORM.FRAME_TAIL : WORM.FRAME_SEGMENT;
        }

        // ── CHROMATIC FRINGE ──
        if (rageAlpha < 0.6) {
          const fringeA = (0.6 - rageAlpha) / 0.6 * 0.35 * this.alpha * headBlendAlpha;
          if (fringeA > 0.01) {
            ctx.save();
            ctx.globalCompositeOperation = 'screen';
            ctx.globalAlpha = fringeA;
            ctx.translate(rsx, rsy);
            if (i === 0) {
              ctx.rotate(Math.sin(this.time * 3.5 + this.phaseOffset) * 0.08);
            } else {
              const rprev = (rt.active && i < rt.segCount) ? rt.rageSegs[i - 1] : this.segments[i - 1];
              ctx.rotate(Math.atan2(rprev.screenY - rsy, rprev.screenX - rsx) - Math.PI / 2);
            }
            ctx.drawImage(rageSprite, rageFrame * rageFrameW, 0, rageFrameW, rageSprite.height,
              -size / 2 - 5, -size / 2, size, size);
            ctx.restore();
          }
        }

        // ── MAIN RAGE SPRITE ──
        ctx.save();
        ctx.globalAlpha = this.alpha * rageAlpha * headBlendAlpha;
        ctx.translate(rsx, rsy);


        if (i === 0) {
          ctx.rotate(Math.sin(this.time * 3.5 + this.phaseOffset) * 0.08);
          if (rt.active && !rt.emerged) {
            // SCALE UP FROM SMALL AS THE HEAD POPS OUT — STARTS AT 30%, REACHES 100% WHEN POP COMPLETES
            const eased = rt.headSwapProgress * rt.headSwapProgress * (3 - 2 * rt.headSwapProgress); // SMOOTHSTEP
            const rageHeadScale = 0.30 + eased * 0.70;
            ctx.scale(rageHeadScale, rageHeadScale);
          } else if (headFrame >= WORM.FRAME_ATTACK_START && rt.emerged) {
            ctx.scale(WORM.ATTACK_HEAD_SCALE, WORM.ATTACK_HEAD_SCALE);
          }
        } else {
          const rprev = (rt.active && i < rt.segCount) ? rt.rageSegs[i - 1] : this.segments[i - 1];
          ctx.rotate(Math.atan2(rprev.screenY - rsy, rprev.screenX - rsx) - Math.PI / 2);
          if (seg.flashTimer > 0) {
            ctx.globalCompositeOperation = 'lighter';
            ctx.globalAlpha = 0.6 * rageAlpha * headBlendAlpha;
          }
        }
        ctx.drawImage(rageSprite, rageFrame * rageFrameW, 0, rageFrameW, rageSprite.height,
          -size / 2, -size / 2, size, size);
        ctx.restore();

        // ── WET SPECULAR SHEEN ──
        const shineA = (0.11 + Math.sin(rt.shinePulse + i * 0.55) * 0.07)
          * rageAlpha * this.alpha * headBlendAlpha;
        if (shineA > 0.005) {
          ctx.save();
          ctx.globalCompositeOperation = 'screen';
          const shineGrad = ctx.createRadialGradient(
            rsx - size * 0.17, rsy - size * 0.22, size * 0.03,
            rsx + size * 0.05, rsy + size * 0.05, size * 0.55
          );
          shineGrad.addColorStop(0,    `rgba(255, 245, 230, ${shineA})`);
          shineGrad.addColorStop(0.35, `rgba(230, 110, 80,  ${shineA * 0.4})`);
          shineGrad.addColorStop(1,    'rgba(0, 0, 0, 0)');
          ctx.fillStyle = shineGrad;
          ctx.beginPath();
          ctx.arc(rsx, rsy, size * 0.55, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }

        // ── EMERGENCE GLOW  ──
        if (rt.active && i === rt.segCount - 1 && !rt.emerged) {
          const pulseG = (0.28 + Math.sin(rt.shinePulse * 4.5) * 0.18)
            * rageAlpha * this.alpha * headBlendAlpha;
          if (pulseG > 0.01) {
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            const eGrad = ctx.createRadialGradient(rsx, rsy, 0, rsx, rsy, size * 1.4);
            eGrad.addColorStop(0,   `rgba(255, 55, 10, ${pulseG})`);
            eGrad.addColorStop(0.4, `rgba(160, 8, 0,   ${pulseG * 0.45})`);
            eGrad.addColorStop(1,   'rgba(0, 0, 0, 0)');
            ctx.fillStyle = eGrad;
            ctx.beginPath();
            ctx.arc(rsx, rsy, size * 1.4, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          }
        }
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

        // RAGE ON NEXT HIT — FIRES WHEN: 30% HP WAS HIT MID-ATTACK → ATTACK ENDED → PLAYER LANDED THIS SHOT
        if (this._rageOnNextHit && !this.isRaging) {
          this._rageOnNextHit     = false;
          this._rageWaitingForHit = false;
          this.enterRageMode();
        }

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
    let interval = WORM.ATTACK_INTERVAL_MIN
      + Math.random() * (WORM.ATTACK_INTERVAL_MAX - WORM.ATTACK_INTERVAL_MIN);

    if (this.isRaging) interval *= WORM.RAGE_INTERVAL_MULT;

    return interval;
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
      { type: 'lunge',    weight: 1.0 },  // TIER 1: ALWAYS AVAILABLE
    ];
    if (hp > WORM.AI_TIER_DISABLE_CELLULAR) pool.push({ type: 'cellular', weight: 1.0 }); // DISABLED BELOW 40% HP
    if (hp <= WORM.AI_TIER_BABYWORM) pool.push({ type: 'babyworm', weight: 1.0 }); // TIER 2: UNLOCKED BELOW 80% HP
    if (hp <= WORM.AI_TIER_SUCTION)  pool.push({ type: 'suction',  weight: 1.0 }); // TIER 3: UNLOCKED BELOW 50% HP

    if (this.isRaging) { // RAGE MODE PRIORITIZATION: LUNGE > SUCTION > BABYWORM (DISABLE CELLULAR ENTIRELY)
      const rageWeights = {
        lunge: 4.0,
        suction: 3.0,
        babyworm: 2.0,
        cellular: 0.0
      };
      for (const entry of pool) {
        entry.weight = entry.type in rageWeights ? rageWeights[entry.type] : 1.0;
      }
    } else {
      // DISTANCE MODIFIER — SCREEN-SPACE PROXIMITY TO HEAD
      const head = this.segments[0];
      const dx   = this._shipScreenX - head.screenX;
      const dy   = this._shipScreenY - head.screenY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      for (const entry of pool) {
        if (entry.type === 'lunge') {
          if (dist < WORM.AI_DIST_CLOSE) {
            entry.weight = 3.0;
          } else if (dist < WORM.AI_DIST_FAR) {
            entry.weight = 1.5;
          } else {
            entry.weight = 0.4;
          }
        } else {
          if (dist > WORM.AI_DIST_FAR) {
            entry.weight = 1.6;
          }
        }
      }
    }

    // NO-REPEAT GUARD — HALVE WEIGHT OF LAST ATTACK TO DISCOURAGE BACK-TO-BACK
    if (this._lastAttackType) {
      const last = pool.find(e => e.type === this._lastAttackType);
      if (last) last.weight *= 0.5;
    }

    // ATTACK HISTORY GUARD — FURTHER REDUCE WEIGHT FOR ANY ATTACK IN RECENT 3-ATTACK MEMORY
    if (!this.isRaging) {
      for (const entry of pool) {
        if (this._attackHistory.includes(entry.type)) entry.weight *= 0.55;
      }
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