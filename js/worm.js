// worm.js
// ~~~~~~~~~~~~~~~~~~~~ IMPORTS ~~~~~~~~~~~~~~~~~~~~
import { CONFIG } from './config.js';
// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

// ======================= LAYERED SINE NOISE =======================
// OVERLAPPING SINE WAVES AT DIFFERENT FREQUENCIES / PHASES PRODUCE SMOOTH ORGANIC MOTITON WITHOUT ANY EXTERNAL NOISE LIBRARY
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
  BASE_SIZE:        200,   // HEAD SPRITE SIZE AT SCALE 1.0
  TAIL_SIZE_RATIO:  0.28,  // TAIL SCALES DOWN SMALLER SINCE NO DEDICATED TAIL SPRITE
  FOCAL_LENGTH:     200,   // PERSPECTIVE FOCAL LENGTH
  START_Z:          1400,  // STARTS FAR AWAY (TINY)
  IDLE_Z:           320,   // HOVERS AT THIS DEPTH WHEN ACTIVE
  APPROACH_SPEED:   0.006, // LERP FACTOR TOWARD IDLE Z
  SPRITE_FRAMES:    9,
  FRAME_HEAD:       0,
  FRAME_SEGMENT:    1,
  FRAME_TAIL:       1,     // REUSE SEGMENT SPRITE, JUST SCALED SMALLER

  // ATTACK ANIMATION (FRAMES 4-9 ON HEAD ONLY)
  FRAME_ATTACK_START: 3,   // 0-INDEXED: FRAME 4 = INDEX 3
  FRAME_ATTACK_END:   8,   // 0-INDEXED: FRAME 9 = INDEX 8
  ATTACK_INTERVAL:    7,   // SECONDS BETWEEN ATTACKS
  ATTACK_DURATION:    3,   // HOW LONG THE ATTACK LOOP PLAYS
  ATTACK_FPS:         10,  // FRAMES PER SECOND FOR ATTACK ANIMATION

  // SPAWN OFFSET — NEGATIVE X = LEFT, POSITIVE Y = DOWN (COMES FROM AROUND THE BEND)
  SPAWN_OFFSET_X:  -520,
  SPAWN_OFFSET_Y:   200,

  // FADE IN AS IT EMERGES
  ALPHA_START:      0.0,
  ALPHA_FULL:       1.0,
  ALPHA_SPEED:      0.012, // LERP FACTOR TOWARD FULL ALPHA

  // HEAD WIGGLE - TWO OVERLAPPING PATTERNS FOR ORGANIC FEEL
  WIGGLE_X: [
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
    this.attackTimer    = WORM.ATTACK_INTERVAL; // COUNTDOWN TO NEXT ATTACK
    this.isAttacking    = false;
    this.attackProgress = 0;   // TIME SPENT IN CURRENT ATTACK
    this.attackFrame    = WORM.FRAME_ATTACK_START; // CURRENT SPRITE FRAME DURING ATTACK
    this.attackFrameTime = 0;  // ACCUMULATOR FOR FRAME STEPPING

    // OPTIONAL CALLBACK — SET THIS TO PLAY SOUND FROM MAIN.JS
    this.onAttack = null;

    // HEAD WORLD-SPACE POSITION — START AT SPAWN OFFSET
    this.headX  = WORM.SPAWN_OFFSET_X;
    this.headY  = WORM.SPAWN_OFFSET_Y;

    // CHAIN OF SEGMENTS — INDEX 0 IS THE HEAD
    // START STACKED WITH SPAWN OFFSET SO IT APPEARS FROM LOWER-LEFT (AROUND THE BEND)
    this.segments = Array.from({ length: WORM.NUM_SEGMENTS }, (_, i) => ({
      x:           WORM.SPAWN_OFFSET_X,
      y:           WORM.SPAWN_OFFSET_Y + i * WORM.SEGMENT_SPACING,
      screenX:     0,
      screenY:     0,
      drawSize:    0,
      hitRadius:   0,
      health:      i === 0 ? WORM.HEAD_HEALTH_MULT : WORM.SEGMENT_HEALTH,
      flashTimer:  0,
    }));

    // SPRITE
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

    console.log('✔ WormBoss initialized');
  }

  activate() {
    this.isActive = true;
    this.z        = WORM.START_Z;
    this.alpha    = WORM.ALPHA_START;
    this.health   = WORM.HEALTH;
    this.isDead   = false;
    this.headX    = WORM.SPAWN_OFFSET_X;
    this.headY    = WORM.SPAWN_OFFSET_Y;
  }

  // ======================= UPDATE =======================
  update(dt) {
    if (!this.isActive || this.isDead) return;

    this.time += dt;

    // ======== APPROACH ========
    this.z       += (WORM.IDLE_Z - this.z) * WORM.APPROACH_SPEED;
    this.baseScale = WORM.FOCAL_LENGTH / (WORM.FOCAL_LENGTH + this.z);

    // ======== FADE IN ========
    this.alpha += (WORM.ALPHA_FULL - this.alpha) * WORM.ALPHA_SPEED;

    // ======== ATTACK CYCLE ========
    if (this.isAttacking) {
      this.attackProgress  += dt;
      this.attackFrameTime += dt;

      // STEP THROUGH FRAMES 4–9 AT ATTACK_FPS
      const frameDur = 1 / WORM.ATTACK_FPS;
      if (this.attackFrameTime >= frameDur) {
        this.attackFrameTime -= frameDur;
        this.attackFrame++;
        if (this.attackFrame > WORM.FRAME_ATTACK_END) {
          this.attackFrame = WORM.FRAME_ATTACK_START; // LOOP
        }
      }

      // END ATTACK AFTER ATTACK_DURATION
      if (this.attackProgress >= WORM.ATTACK_DURATION) {
        this.isAttacking    = false;
        this.attackProgress = 0;
        this.attackTimer    = WORM.ATTACK_INTERVAL;
      }
    } else {
      this.attackTimer -= dt;
      if (this.attackTimer <= 0 && this.alpha > 0.8) { // DON'T ATTACK WHILE STILL FADING IN
        this.isAttacking    = true;
        this.attackProgress = 0;
        this.attackFrameTime = 0;
        this.attackFrame    = WORM.FRAME_ATTACK_START;
        if (this.onAttack) this.onAttack(); // FIRE SOUND CALLBACK
      }
    }

    // ======== ORGANIC HEAD MOVEMENT ========
    // WIGGLE TARGET DRIFTS FROM SPAWN OFFSET TOWARD SCREEN CENTER OVER TIME
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

    // ======== CHAIN IK — EACH SEGMENT FOLLOWS THE ONE AHEAD ========
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

    // ======== PROJECT TO SCREEN SPACE & CACHE ========
    const cx = window.innerWidth  / 2;
    const cy = window.innerHeight / 2;
    const bs = this.baseScale;

    for (let i = 0; i < WORM.NUM_SEGMENTS; i++) {
      const seg = this.segments[i];

      // ANATOMICAL TAPER: 0=HEAD(1.0) → 1=TAIL(TAIL_SIZE_RATIO)
      const t      = i / (WORM.NUM_SEGMENTS - 1);
      const aScale = 1.0 - t * (1.0 - WORM.TAIL_SIZE_RATIO);
      const scale  = bs * aScale;

      seg.screenX   = cx + seg.x * bs;
      seg.screenY   = cy + seg.y * bs;
      seg.drawSize  = WORM.BASE_SIZE * scale;
      seg.hitRadius = seg.drawSize * 0.45; // SLIGHTLY INSIDE VISUAL EDGE

      // COUNT DOWN FLASH
      if (seg.flashTimer > 0) seg.flashTimer -= dt;
    }
  }

  // ======================= DRAW =======================
  draw(ctx) {
    if (!this.isActive || this.isDead) return;

    // DRAW TAIL → HEAD SO HEAD RENDERS ON TOP
    ctx.save();
    ctx.globalAlpha = this.alpha;
    for (let i = WORM.NUM_SEGMENTS - 1; i >= 0; i--) {
      const seg  = this.segments[i];
      const size = seg.drawSize;
      if (size < 1) continue;

      // SPRITE FRAME
      let frame;
      if (i === 0)                          frame = this.isAttacking ? this.attackFrame : WORM.FRAME_HEAD;
      else if (i === WORM.NUM_SEGMENTS - 1) frame = WORM.FRAME_TAIL;
      else                                  frame = WORM.FRAME_SEGMENT;

      ctx.save();
      ctx.translate(seg.screenX, seg.screenY);

      // ======== ROTATION ========
      if (i === 0) {
        // HEAD: FACES US — JUST A TINY WIGGLE SO IT FEELS ALIVE
        const wiggle = Math.sin(this.time * 3.5 + this.phaseOffset) * 0.08;
        ctx.rotate(wiggle);
      } else {
        // BODY/TAIL: ROTATE TO POINT TOWARD PREVIOUS SEGMENT
        const prev = this.segments[i - 1];
        const dx   = prev.screenX - seg.screenX;
        const dy   = prev.screenY - seg.screenY;
        ctx.rotate(Math.atan2(dy, dx) - Math.PI / 2);
      }

      // ======== HIT FLASH ========
      if (seg.flashTimer > 0) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.6;
      }

      // ========= DRAW SPRITE (OR FALLBACK CIRCLES) =========
      if (this.spriteLoaded && this.frameWidth > 0) {
        ctx.drawImage(
          this.sprite,
          frame * this.frameWidth, 0, this.frameWidth, this.sprite.height,
          -size / 2, -size / 2, size, size
        );
      } else {
        // FALLBACK: COLOURED CIRCLES
        const colors = ['#ff00aa', '#cc00ff', '#8800cc'];
        ctx.fillStyle = colors[frame] || '#ff00aa';
        ctx.beginPath();
        ctx.arc(0, 0, size / 2, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    }
    ctx.restore(); // RESTORE GLOBAL ALPHA
  }

  /**
   * CHECK A PROJECTILE SEGMENT AGAINST EVERY WORM SEGMENT.
   * RETURNS { HIT: TRUE, SEGINDEX, KILLED } OR { HIT: FALSE }
   */
  checkProjectileHit(seg) {
    if (!this.isActive || this.isDead) return { hit: false };

    for (let i = 0; i < WORM.NUM_SEGMENTS; i++) {
      const ws = this.segments[i];
      if (ws.hitRadius < 1) continue;

      // POINT-IN-CIRCLE FOR THE PROJECTILE TIP
      const dx   = seg.x1 - ws.screenX;
      const dy   = seg.y1 - ws.screenY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < ws.hitRadius) {
        const damage  = i === 0 ? WORM.HEAD_HEALTH_MULT : 1;
        ws.flashTimer = 0.1;
        ws.health    -= damage;

        this.health  -= damage;
        const killed  = this.health <= 0;
        if (killed) this.isDead = true;

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