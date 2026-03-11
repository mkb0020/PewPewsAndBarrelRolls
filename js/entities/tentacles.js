// Updated 3/11/26 @ 1AM
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
    this.tipRepelRad  = cfg.TENTACLE_TIP_REPEL_RADIUS;  // px — TIPS PUSH EACH OTHER APART
    this.tipRepelStr  = cfg.TENTACLE_TIP_REPEL_STRENGTH; // PUSH MAGNITUDE AT FULL OVERLAP

    // IRRATIONAL Y PHASE OFFSET — DESYNC X/Y WANDER AXES FOR ORGANIC FEEL
    this.phaseX = phaseOffset;
    this.phaseY = phaseOffset + 1.91;

    // xs[0] = TIP   xs[segCount] = BASE (at body anchor)
    // Float32Array FOR PERFORMANCE — NO GC PRESSURE DURING UPDATE
    this.xs = new Float32Array(this.segCount + 1);
    this.ys = new Float32Array(this.segCount + 1);

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
    // anchorYOff SHIFTS THE ATTACHMENT POINT DOWN SO TENTACLES ROOT AT HEAD BASE, NOT CENTER
    const ax = bodyX + Math.cos(this.anchorAng) * anchorR;
    const ay = bodyY + Math.sin(this.anchorAng) * anchorR + this.anchorYOff * scale;

    // ── TIP TARGET ────────────────────────────────────────────────────────────
    if (!this.dying) {
      // WANDER: INDEPENDENT LISSAJOUS-LIKE MOTION PER TENTACLE (DIFFERENT X/Y SPEEDS)
      // GRAVITY PULLS TIP DOWNWARD — OSCILLATION HAS TO FIGHT UPWARD, FALLS FREELY DOWNWARD
      // THIS GIVES NATURAL DROOP AND STOPS TIPS FLOATING UP BEHIND THE HEAD
      const swing   = Math.sin(time * this.wanderSpd * 0.62 + this.phaseY) * this.reach * 0.52 * scale;
      const gravity = this.tipGravity * scale;  // CONSTANT DOWNWARD PULL
      this.xs[0] = bodyX + Math.cos(time * this.wanderSpd + this.phaseX) * this.reach * scale;
      this.ys[0] = bodyY + this.anchorYOff * scale * 0.6   // ANCHOR OFFSET
                         + swing                            // OSCILLATION (UP AND DOWN EQUALLY)
                         + gravity;                         // GRAVITY ALWAYS WINS DOWNWARD
    } else {
      // DEATH DROOP — GRAVITY TAKES OVER, TIP FALLS
      this.deathT += dt;
      this.drapVy += 400 * dt;
      this.ys[0]  += this.drapVy * dt;
      this.alpha   = Math.max(0, 1 - this.deathT / this.deathDur);
    }

    // ── FORWARD PASS: TIP → BASE ──────────────────────────────────────────────
    // EACH SEGMENT FOLLOWS THE PREVIOUS AT FIXED DISTANCE
    // CURL WAVE ADDS ORGANIC WRITHING WITHOUT VERLET COST
    for (let i = 1; i <= this.segCount; i++) {
      const dx  = this.xs[i - 1] - this.xs[i];
      const dy  = this.ys[i - 1] - this.ys[i];
      const ang = Math.atan2(dy, dx)
                + Math.sin(i * 0.7 + time * 2.8) * this.curlStr; // CURL WAVE
      this.xs[i] = this.xs[i - 1] - Math.cos(ang) * segLen;
      this.ys[i] = this.ys[i - 1] - Math.sin(ang) * segLen;
    }

    // ── LOCK BASE TO ANCHOR ───────────────────────────────────────────────────
    this.xs[this.segCount] = ax;
    this.ys[this.segCount] = ay;

    // ── BACKWARD PASS: BASE → TIP (RECONCILE ANCHOR) ─────────────────────────
    // ONE PASS IS SUFFICIENT FOR SMOOTH RESULTS AT LOW COST
    for (let i = this.segCount - 1; i >= 0; i--) {
      const dx  = this.xs[i + 1] - this.xs[i];
      const dy  = this.ys[i + 1] - this.ys[i];
      const d   = Math.sqrt(dx * dx + dy * dy) || 1;
      const inv = segLen / d;
      this.xs[i] = this.xs[i + 1] - dx * inv;
      this.ys[i] = this.ys[i + 1] - dy * inv;
    }

    // ── REPULSION PASS — PUSH SEGMENTS AWAY FROM BODY CENTER ─────────────────
    // PREVENTS TENTACLES BUNCHING INSIDE THE HEAD SPRITE
    // APPLIED AFTER CONSTRAINT SOLVE SO IT DOESN'T FIGHT THE CHAIN
    if (!this.dying) {
      const repR  = this.repelRadius * scale;
      const repR2 = repR * repR;
      for (let i = 0; i < this.segCount; i++) {
        const dx = this.xs[i] - bodyX;
        const dy = this.ys[i] - bodyY;
        const d2 = dx * dx + dy * dy;
        if (d2 < repR2 && d2 > 0.01) {
          const d    = Math.sqrt(d2);
          const push = (1 - d / repR) * this.repelStr * scale;
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

    // ANCHOR ANGLES SPREAD EVENLY ACROSS THE BOTTOM ARC (ARC_START → ARC_END)
    // SMALL RANDOM JITTER PER INSTANCE SO NO TWO ENEMIES LOOK IDENTICAL
    const jitter = (Math.random() - 0.5) * 0.25; // ±~14° MAX VARIATION

    this.tentacles = [];
    for (let i = 0; i < count; i++) {
      // LERP EVENLY ACROSS ARC — count-1 DENOMINATOR PUTS OUTERMOST PAIR AT THE EDGES
      const t_    = count > 1 ? i / (count - 1) : 0.5;
      const angle = ARC_START + t_ * (ARC_END - ARC_START) + jitter;
      const phaseOffset = angle + Math.random() * Math.PI;
      const t           = new Tentacle(angle, cfg, phaseOffset);
      t.initialize(enemy.x, enemy.y);
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
          const push = (1 - d / repR) * ti.tipRepelStr * e.scale * 0.5; // SPLIT EVENLY
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