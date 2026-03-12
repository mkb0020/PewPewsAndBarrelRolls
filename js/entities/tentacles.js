// Updated 3/12/26 @ 2AM
// tentacles.js

const HALF_PI = Math.PI * 0.5;

// BOTTOM ARC: ANCHORS SPREAD ACROSS LOWER HALF OF BODY (~150° → 30° GOING THROUGH STRAIGHT DOWN)
// IN CANVAS COORDS: 0=RIGHT  π/2=DOWN  π=LEFT  3π/2=UP
// π/6 = 30° (LOWER-RIGHT EDGE)   5π/6 = 150° (LOWER-LEFT EDGE)
const ARC_START = Math.PI / 6;        // RIGHTMOST ANCHOR ANGLE
const ARC_END   = Math.PI * (5 / 6);  // LEFTMOST ANCHOR ANGLE

// WHICH ENEMY TYPES USE THE TENTACLE SYSTEM
export const TENTACLE_TYPES = new Set(['ZIGZAG', 'FAST', 'FLIMFLAM']);

// ── SINGLE TENTACLE ───────────────────────────────────────────────────────────
class Tentacle {
  /**
   * @param {number} anchorAngle  ANGLE (RADIANS) FROM BODY CENTER WHERE THIS TENTACLE ATTACHES
   * @param {object} cfg          ENEMY CONFIG BLOCK (HAS ALL TENTACLE_* VALUES)
   * @param {number} phaseOffset  UNIQUE PER-TENTACLE PHASE SO EACH WANDERS INDEPENDENTLY
   */
  constructor(anchorAngle, cfg, phaseOffset) {
    this.segCount     = cfg.TENTACLE_SEGMENTS;
    this.segLen       = cfg.TENTACLE_SEGMENT_LENGTH;
    this.baseWidth    = cfg.TENTACLE_BASE_WIDTH;
    this.reach        = cfg.TENTACLE_REACH;
    this.curlStr      = cfg.TENTACLE_CURL_STRENGTH;
    this.wanderSpd    = cfg.TENTACLE_WANDER_SPEED;
    this.anchorAng    = anchorAngle;
    this.anchorRad    = cfg.TENTACLE_ANCHOR_RADIUS;
    this.anchorYOff   = cfg.TENTACLE_ANCHOR_Y_OFFSET;  // px DOWN FROM BODY CENTER — PINS TO BASE OF HEAD
    this.repelRadius  = cfg.TENTACLE_REPEL_RADIUS;     // px — HEAD PUSHES SEGMENTS OUTSIDE THIS SPHERE
    this.repelStr     = cfg.TENTACLE_REPEL_STRENGTH;   // px OF PUSH PER FRAME AT FULL OVERLAP
    this.tipGravity   = cfg.TENTACLE_TIP_GRAVITY;       // px CONSTANT DOWNWARD PULL ON TIP TARGET
    this.tipRepelRad  = cfg.TENTACLE_TIP_REPEL_RADIUS;   // px — TIPS PUSH EACH OTHER APART
    this.tipRepelStr  = cfg.TENTACLE_TIP_REPEL_STRENGTH;  // PUSH MAGNITUDE AT FULL OVERLAP
    this.maxBend      = cfg.TENTACLE_MAX_BEND   ?? Math.PI; // MAX BEND ANGLE PER SEGMENT — PREVENTS SHARP KINKS
    // LOWERED DEFAULTS: STIFFNESS 6 + DRAG 0.92 REMOVES ~90% OF SPRING SPAZ (WAS 12/0.88)
    this.tipStiffness = cfg.TENTACLE_TIP_STIFFNESS ?? 6;
    this.tipDrag      = cfg.TENTACLE_TIP_DRAG      ?? 0.92;
    this.anchorSway   = cfg.TENTACLE_ANCHOR_SWAY   ?? 0;    // px — SUBTLE ROOT MOTION AMPLITUDE

    // TIP DIRECTIONAL BIAS — SET BY TentacleSystem AFTER CONSTRUCTION BASED ON TENTACLE INDEX
    // OUTER TIPS NUDGE OUTWARD (LEFT/RIGHT), INNER TIPS NUDGE DOWNWARD
    this.tipBiasX = 0;
    this.tipBiasY = 0;

    // PER-TENTACLE CURL DIRECTION — RANDOMIZED SO ARMS WRITHE INDEPENDENTLY (SOME CW, SOME CCW)
    this.curlDir = Math.random() > 0.5 ? 1 : -1;

    // IRRATIONAL Y PHASE OFFSET — DESYNC X/Y WANDER AXES FOR ORGANIC FEEL
    this.phaseX = phaseOffset;
    this.phaseY = phaseOffset + 1.91;

    // TIP VELOCITY — DRIVES THE INERTIA/DRAG SYSTEM (GROK'S CORE FIX)
    // INSTEAD OF HARD-SETTING TIP POSITION EACH FRAME, WE SPRING-CHASE THE WANDER TARGET
    // THIS GIVES NATURAL LAG, OVERSHOOT, AND PROPAGATING WAVES DOWN THE CHAIN
    this.tipVx = 0;
    this.tipVy = 0;

    // xs[0] = TIP   xs[segCount] = BASE (at body anchor)
    // Float32Array FOR PERFORMANCE — NO GC PRESSURE DURING UPDATE
    this.xs = new Float32Array(this.segCount + 1);
    this.ys = new Float32Array(this.segCount + 1);

    // PRE-ALLOCATED SEGMENT LENGTHS — STORES sl FROM FORWARD PASS FOR REUSE IN BACKWARD PASS
    // FIXES FORWARD/BACKWARD LENGTH MISMATCH THAT CAUSES CONSTANT MICRO-JITTER
    this.segLens = new Float32Array(this.segCount + 1);

    // DEATH DROOP STATE
    this.dying    = false;
    this.deathT   = 0;
    this.deathDur = 0.55;
    this.drapVy   = 0;   // ACCUMULATED TIP GRAVITY VELOCITY
    this.alpha    = 1;
  }

  /** SEED ALL SEGMENTS AT BODY CENTER BEFORE FIRST UPDATE */
  initialize(cx, cy) {
    for (let i = 0; i <= this.segCount; i++) {
      this.xs[i] = cx;
      this.ys[i] = cy;
    }
  }

  /**
   * @param {number} dt
   * @param {number} time    GLOBAL GAME TIME (DRIVES CURL WAVE ANIMATION)
   * @param {number} bodyX
   * @param {number} bodyY
   * @param {number} scale   ENEMY SCALE — SEGMENT LENGTH AND REACH SCALE WITH THIS
   */
  update(dt, time, bodyX, bodyY, scale) {
    const segLen  = this.segLen  * scale;
    const anchorR = this.anchorRad * scale;

    // ANCHOR POINT — WHERE THIS TENTACLE MEETS THE BODY
    // ANCHOR SWAY: TINY SINUSOIDAL ROOT MOTION — EVEN STATIONARY CREATURES FLEX AT THE BASE
    // anchorYOff SHIFTS THE ATTACHMENT POINT DOWN SO TENTACLES ROOT AT HEAD BASE, NOT CENTER
    const sway = Math.sin(time * 1.5 + this.phaseX) * this.anchorSway * scale;
    const ax = bodyX + Math.cos(this.anchorAng) * anchorR + sway;
    const ay = bodyY + Math.sin(this.anchorAng) * anchorR + this.anchorYOff * scale;

    // ── TIP REST POINT (PASSIVE GRAVITY ANCHOR — NO WANDER) ──────────────────
    // THE TIP NO LONGER CHASES AN ANIMATED TARGET.
    // INSTEAD IT HAS A LOOSE GRAVITY HANG POINT BELOW THE BODY.
    // ALL VISIBLE MOTION COMES FROM THE TRAVELLING CURL WAVE IN THE FORWARD PASS.
    // THE SPRING JUST STOPS THE TIP DRIFTING INFINITELY FAR — IT'S A SOFT LEASH, NOT A DRIVER.
    if (!this.dying) {
      const restX = bodyX + this.tipBiasX * scale;
      const restY = bodyY + this.anchorYOff * scale + this.tipGravity * scale + this.tipBiasY * scale;

      this.tipVx += (restX - this.xs[0]) * this.tipStiffness * dt;
      this.tipVy += (restY - this.ys[0]) * this.tipStiffness * dt;
      this.tipVx *= this.tipDrag;
      this.tipVy *= this.tipDrag;

      // CLAMP MAX TIP SPEED — PREVENTS SPRING EXPLOSION ON LARGE POSITION DELTAS
      const maxSpeed = 200 * scale;
      const speed    = Math.hypot(this.tipVx, this.tipVy);
      if (speed > maxSpeed) {
        const inv    = maxSpeed / speed;
        this.tipVx  *= inv;
        this.tipVy  *= inv;
      }

      // FIX: MULTIPLY BY dt SO POSITION INTEGRATION IS FRAME-RATE INDEPENDENT (WAS MISSING dt)
      this.xs[0] += this.tipVx * dt;
      this.ys[0] += this.tipVy * dt;
    } else {
      // DEATH DROOP — GRAVITY TAKES OVER, TIP FALLS
      this.deathT += dt;
      this.drapVy += 400 * dt;
      this.ys[0]  += this.drapVy * dt;
      this.alpha   = Math.max(0, 1 - this.deathT / this.deathDur);
    }

    // ── FORWARD PASS: TIP → BASE ──────────────────────────────────────────────
    // TRAVELLING WAVE: NEGATIVE TIME SIGN MAKES THE WAVE CRAWL FROM BASE → TIP
    // THIS IS WHAT GIVES THE "MUSCLE CONTRACTION MOVING DOWN THE ARM" FEEL
    // TIP FACTOR: CURL AMPLITUDE GROWS TOWARD THE TIP — BASE STAYS PLANTED, TIP IS EXPRESSIVE
    // CURL DIR: PER-TENTACLE RANDOM SIGN SO SOME ARMS CURL CW, OTHERS CCW
    // MICRO STRETCH: ±5% SEGMENT LENGTH VARIATION FOR ORGANIC FLEX — NO ROBOTIC UNIFORMITY
    // sl STORED IN segLens[] SO THE BACKWARD PASS USES THE EXACT SAME LENGTH (FIXES MICRO-JITTER)
    for (let i = 1; i <= this.segCount; i++) {
      const dx  = this.xs[i - 1] - this.xs[i];
      const dy  = this.ys[i - 1] - this.ys[i];
      const tipFactor = (this.segCount - i) / this.segCount; // 0 AT BASE, ~1 AT TIP
      const ang = Math.atan2(dy, dx)
                + Math.sin(i * 0.8 - time * 2.2 + this.phaseX) * this.curlStr * tipFactor * this.curlDir;
      const sl  = segLen * (0.95 + Math.sin(time * 1.3 + i * 1.7 + this.phaseX) * 0.05); // MICRO STRETCH
      this.segLens[i] = sl; // CACHE FOR BACKWARD PASS — AVOIDS LENGTH MISMATCH JITTER
      this.xs[i] = this.xs[i - 1] - Math.cos(ang) * sl;
      this.ys[i] = this.ys[i - 1] - Math.sin(ang) * sl;
    }

    // ── LOCK BASE TO ANCHOR ───────────────────────────────────────────────────
    this.xs[this.segCount] = ax;
    this.ys[this.segCount] = ay;

    // ── BACKWARD PASS: BASE → TIP (RECONCILE ANCHOR) ─────────────────────────
    // ONE PASS IS SUFFICIENT FOR SMOOTH RESULTS AT LOW COST
    // ANGLE CAP CLAMPS EACH SEGMENT'S BEND RELATIVE TO ITS PARENT — NO SHARP KINKS
    // FIX: USE segLens[i] (CACHED FROM FORWARD PASS) INSTEAD OF PLAIN segLen
    // THIS ENSURES BOTH PASSES AGREE ON SEGMENT LENGTH — ELIMINATES CONSTANT CONSTRAINT FIGHTING
    for (let i = this.segCount - 1; i >= 0; i--) {
      const sl  = this.segLens[i + 1]; // REUSE THE SAME LENGTH COMPUTED IN FORWARD PASS
      const dx  = this.xs[i + 1] - this.xs[i];
      const dy  = this.ys[i + 1] - this.ys[i];
      const d   = Math.sqrt(dx * dx + dy * dy) || 1;
      const inv = sl / d;

      // UNCONSTRAINED POSITION
      let nx = this.xs[i + 1] - dx * inv;
      let ny = this.ys[i + 1] - dy * inv;

      // ANGLE CAP — SKIP THE BASE SEGMENT (i = segCount-1) SINCE IT HAS NO PARENT REFERENCE
      if (i < this.segCount - 1) {
        const pdx      = this.xs[i + 1] - this.xs[i + 2];
        const pdy      = this.ys[i + 1] - this.ys[i + 2];
        const parentAng = Math.atan2(pdy, pdx);

        let diff = Math.atan2(ny - this.ys[i + 1], nx - this.xs[i + 1]) - parentAng;
        // NORMALIZE TO [-PI, PI]
        if (diff >  Math.PI) diff -= Math.PI * 2;
        if (diff < -Math.PI) diff += Math.PI * 2;

        if (Math.abs(diff) > this.maxBend) {
          const clampedAng = parentAng + Math.sign(diff) * this.maxBend;
          nx = this.xs[i + 1] + Math.cos(clampedAng) * sl;
          ny = this.ys[i + 1] + Math.sin(clampedAng) * sl;
        }
      }

      this.xs[i] = nx;
      this.ys[i] = ny;
    }

    // ── REPULSION PASS — PUSH SEGMENTS AWAY FROM BODY CENTER ─────────────────
    // PREVENTS TENTACLES BUNCHING INSIDE THE HEAD SPRITE
    // APPLIED AFTER CONSTRAINT SOLVE SO IT DOESN'T FIGHT THE CHAIN
    // FIX: MULTIPLY push BY dt — WAS APPLYING FULL PIXEL PUSH EVERY FRAME REGARDLESS OF FRAME RATE
    if (!this.dying) {
      const repR  = this.repelRadius * scale;
      const repR2 = repR * repR;
      for (let i = 0; i < this.segCount; i++) {
        const dx = this.xs[i] - bodyX;
        const dy = this.ys[i] - bodyY;
        const d2 = dx * dx + dy * dy;
        if (d2 < repR2 && d2 > 0.01) {
          const d    = Math.sqrt(d2);
          const push = (1 - d / repR) * this.repelStr * scale * dt; // dt ADDED — FRAME-RATE INDEPENDENT
          this.xs[i] += (dx / d) * push;
          this.ys[i] += (dy / d) * push;
        }
      }
    }
  }

  /**
   * CATMULL-ROM SPLINE RENDER — SMOOTH TAPERED RIBBON THROUGH ALL SEGMENT POINTS
   * NO SPRITES USED — JUST A VARIABLE-WIDTH STROKED PATH WITH GLOW
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} scale
   * @param {string} splineColor  HEX/RGB COLOR FOR THIS TENTACLE (FROM CONFIG PER ENEMY TYPE)
   * @param {string} glowColor
   */
  draw(ctx, scale, splineColor, glowColor) {
    if (this.alpha <= 0.01) return;

    const n = this.segCount;

    ctx.save();
    ctx.globalAlpha = this.alpha;
    ctx.lineCap     = 'round';
    ctx.lineJoin    = 'round';

    // ── TWO PASSES: GLOW THEN SOLID ───────────────────────────────────────────
    // GLOW PASS USES A WIDER LINE + shadowBlur FOR THE ALIEN BIOLUMINESCENCE LOOK
    for (let pass = 0; pass < 2; pass++) {
      const isGlow = pass === 0;
      ctx.shadowBlur  = isGlow ? 3 : 0;
      ctx.shadowColor = glowColor;
      ctx.strokeStyle = isGlow ? glowColor : splineColor;

      // CATMULL-ROM: DRAW A SEPARATE SEGMENT BETWEEN EACH PAIR OF POINTS
      // WIDTH TAPERS FROM baseWidth AT BASE (i=n) DOWN TO ~0.25x AT TIP (i=0)
      // DRAWING BASE → TIP SO WIDER BASE SEGMENTS ARE DRAWN FIRST (UNDER THE TIP)
      for (let i = n - 1; i >= 0; i--) {
        const t0 = i       / n;   // 0=TIP  1=BASE
        const t1 = (i + 1) / n;
        const w0 = (0.25 + t0 * 0.75) * this.baseWidth * scale * (isGlow ? 1 : 1.0);
        const w1 = (0.25 + t1 * 0.75) * this.baseWidth * scale * (isGlow ? 1 : 1.0);
        ctx.lineWidth = (w0 + w1) * 0.5; // AVERAGE WIDTH FOR THIS SEGMENT STROKE

        // CATMULL-ROM CONTROL POINTS
        // P0 = POINT BEFORE i  (CLAMP TO ARRAY BOUNDS)
        // P1 = POINT i         (START OF THIS SEGMENT)
        // P2 = POINT i+1       (END OF THIS SEGMENT)
        // P3 = POINT AFTER i+1 (CLAMP TO ARRAY BOUNDS)
        const p0x = this.xs[Math.max(0, i - 1)],  p0y = this.ys[Math.max(0, i - 1)];
        const p1x = this.xs[i],                    p1y = this.ys[i];
        const p2x = this.xs[i + 1],                p2y = this.ys[i + 1];
        const p3x = this.xs[Math.min(n, i + 2)],  p3y = this.ys[Math.min(n, i + 2)];

        // CONVERT CATMULL-ROM SPAN → CUBIC BEZIER CONTROL POINTS (STANDARD ALPHA=0.5)
        const cp1x = p1x + (p2x - p0x) / 6;
        const cp1y = p1y + (p2y - p0y) / 6;
        const cp2x = p2x - (p3x - p1x) / 6;
        const cp2y = p2y - (p3y - p1y) / 6;

        ctx.beginPath();
        ctx.moveTo(p1x, p1y);
        ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2x, p2y);
        ctx.stroke();
      }
    }

    ctx.restore();
  }

  triggerDeath() {
    this.dying  = true;
    this.deathT = 0;
    this.drapVy = 0;
  }

  get isDone() {
    return this.dying && this.deathT >= this.deathDur;
  }
}

// ── TENTACLE SYSTEM ───────────────────────────────────────────────────────────
export class TentacleSystem {
  /**
   * @param {import('../entities/enemies.js').Enemy} enemy
   */
  constructor(enemy) {
    this.enemy       = enemy;
    const cfg        = enemy.config;
    const count      = cfg.TENTACLE_COUNT;

    // CACHE DRAW PARAMS — AVOIDS REPEATED CONFIG LOOKUPS IN DRAW()
    this.segFrame    = cfg.SEGMENT_FRAME;
    this.totalFrames = cfg.SPRITE_FRAMES;
    this.splineColor = cfg.SPLINE_COLOR;

    this.tentacles = [];
    for (let i = 0; i < count; i++) {
      // LERP EVENLY ACROSS ARC — count-1 DENOMINATOR PUTS OUTERMOST PAIR AT THE EDGES
      const t_    = count > 1 ? i / (count - 1) : 0.5;
      // FIX: JITTER COMPUTED PER-TENTACLE (WAS SHARED — ALL ARMS ROTATED AS ONE UNIT)
      // NOW EACH ARM GETS INDEPENDENT ANGLE VARIATION FOR A MORE ORGANIC SPREAD
      const jitter      = (Math.random() - 0.5) * 0.25; // ±~14° MAX VARIATION PER ARM
      const angle       = ARC_START + t_ * (ARC_END - ARC_START) + jitter;
      const phaseOffset = angle + Math.random() * Math.PI;
      const t           = new Tentacle(angle, cfg, phaseOffset);
      t.initialize(enemy.x, enemy.y);

      // PER-TENTACLE DIRECTIONAL BIAS — FANS TENTACLES OUTWARD FOR A MORE ORGANIC SPREAD
      // i=0 (RIGHTMOST) → NUDGE RIGHT  |  i=count-1 (LEFTMOST) → NUDGE LEFT  |  MIDDLE → NUDGE DOWN
      const bias = cfg.TENTACLE_TIP_BIAS || 0;
      if      (i === 0)          { t.tipBiasX =  bias; t.tipBiasY =    0; }
      else if (i === count - 1)  { t.tipBiasX = -bias; t.tipBiasY =    0; }
      else                       { t.tipBiasX =     0; t.tipBiasY = bias; }

      this.tentacles.push(t);
    }
  }

  /**
   * @param {number} dt
   * @param {number} time  GLOBAL GAME TIME
   */
  update(dt, time) {
    const e = this.enemy;
    for (const t of this.tentacles) {
      t.update(dt, time, e.x, e.y, e.scale);
    }

    // ── TIP-TO-TIP REPULSION — SPREAD TIPS APART SO ALL TENTACLES ARE VISIBLE ──
    // O(n²) ON TENTACLE COUNT — 6 PAIRS FOR 4 TENTACLES, NEGLIGIBLE COST
    // FIX: MULTIPLY push BY dt — WAS FRAME-RATE DEPENDENT (SAME BUG AS BODY REPULSION)
    const n = this.tentacles.length;
    for (let i = 0; i < n; i++) {
      const ti = this.tentacles[i];
      if (ti.dying) continue;
      const repR  = ti.tipRepelRad * e.scale;
      const repR2 = repR * repR;
      for (let j = i + 1; j < n; j++) {
        const tj = this.tentacles[j];
        if (tj.dying) continue;
        const dx = ti.xs[0] - tj.xs[0];
        const dy = ti.ys[0] - tj.ys[0];
        const d2 = dx * dx + dy * dy;
        if (d2 < repR2 && d2 > 0.01) {
          const d    = Math.sqrt(d2);
          const push = (1 - d / repR) * ti.tipRepelStr * e.scale * 0.5 * dt; // dt ADDED
          const nx   = dx / d;
          const ny   = dy / d;
          ti.xs[0] += nx * push;
          ti.ys[0] += ny * push;
          tj.xs[0] -= nx * push;
          tj.ys[0] -= ny * push;
        }
      }
    }
  }

  /** TRIGGER DEATH DROOP ON ALL TENTACLES */
  triggerDeath() {
    for (const t of this.tentacles) t.triggerDeath();
  }

  get isDone() {
    return this.tentacles.every(t => t.isDone);
  }

  /**
   * DRAW ALL TENTACLES. CALL BEFORE DRAWING ENEMY BODY SO BODY RENDERS ON TOP.
   * @param {CanvasRenderingContext2D} ctx
   */
  draw(ctx) {
    const e = this.enemy;
    for (const t of this.tentacles) {
      t.draw(ctx, e.scale, this.splineColor, e.glowColor);
    }
  }
}