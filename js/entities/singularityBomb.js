// Updated 3/12/26 @ 7AM
// js/entities/singularityBomb.js
import { CONFIG } from '../utils/config.js';

// ======================= SPINOR COLLECT EFFECT =======================
// DOUBLE HELIX RIBBON + COLLECTION FLASH — PLAYS ON PICKUP, ~1 SECOND DURATION
const SPINOR_FX = {
  DURATION:       1.0,
  HELIX_SEGMENTS: 32,     // DOTS PER STRAND — BALANCED PERF/DENSITY
  HELIX_TURNS:    3.5,    // SPIRAL TURNS VISIBLE AT ANY TIME
  RADIUS_START:   26,     // PX FROM SHIP CENTER
  RADIUS_END:     52,     // EXPANDS OUTWARD OVER DURATION
  DOT_SIZE:       2.6,    // BASE DOT RADIUS
  FADE_IN:        0.08,   // SECONDS
  FADE_OUT:       0.22,   // SECONDS
  STRAND_COLORS:  ['#00ffff', '#c71585'],   // CYAN, MAGENTA
  STRAND_GLOWS:   ['#00cccc', '#8a0050'],   // SHADOW COLORS
};

class SpinorCollectEffect {
  constructor(collectX, collectY) {
    this.cx    = collectX;   // FLASH RING ORIGIN (WHERE ITEM WAS)
    this.cy    = collectY;
    this.timer = 0;
  }

  isDead()     { return this.timer >= SPINOR_FX.DURATION; }
  update(dt)   { this.timer += dt; }

  draw(ctx, shipX, shipY) {
    if (this.isDead()) return;
    const t       = this.timer / SPINOR_FX.DURATION;
    const fadeIn  = Math.min(1, this.timer / SPINOR_FX.FADE_IN);
    const fadeOut = Math.min(1, (SPINOR_FX.DURATION - this.timer) / SPINOR_FX.FADE_OUT);
    const env     = fadeIn * fadeOut;
    if (env <= 0.01) return;

    const radius = SPINOR_FX.RADIUS_START + (SPINOR_FX.RADIUS_END - SPINOR_FX.RADIUS_START) * t;
    const speed  = this.timer * 9;   // RADIANS OF ROTATION ACCUMULATED

    // ── COLLECTION FLASH RING (FIRST 0.35s — AT ITEM ORIGIN) ──────────────────
    if (t < 0.35) {
      const rt = t / 0.35;
      ctx.save();
      ctx.globalAlpha = (1 - rt) * 0.9;
      ctx.strokeStyle = '#c71585';
      ctx.shadowBlur  = 22;
      ctx.shadowColor = '#ff69b4';
      ctx.lineWidth   = 2.5;
      ctx.beginPath();
      ctx.arc(this.cx, this.cy, rt * 85, 0, Math.PI * 2);
      ctx.stroke();
      // SECOND RING — SMALLER, WHITE CORE
      if (rt > 0.12) {
        const rt2 = (rt - 0.12) / 0.88;
        ctx.globalAlpha = (1 - rt2) * 0.5;
        ctx.strokeStyle = '#ffffff';
        ctx.shadowBlur  = 8;
        ctx.lineWidth   = 1.5;
        ctx.beginPath();
        ctx.arc(this.cx, this.cy, rt2 * 60, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }

    // ── DOUBLE HELIX RIBBON (ORBITS SHIP) ─────────────────────────────────────
    // DRAWN BACK-STRAND FIRST (depth < 0), THEN FRONT STRAND — CHEAP PAINTER'S ORDER
    const S  = SPINOR_FX.HELIX_SEGMENTS;
    const tw = SPINOR_FX.HELIX_TURNS;

    for (let backFront = 0; backFront < 2; backFront++) {
      // backFront=0 → DRAW ONLY BACK-DEPTH DOTS; backFront=1 → FRONT DEPTH DOTS
      for (let strand = 0; strand < 2; strand++) {
        ctx.save();
        ctx.shadowBlur  = 9;
        ctx.shadowColor = SPINOR_FX.STRAND_GLOWS[strand];

        const phaseOff = strand * Math.PI;   // STRANDS ARE π APART = DNA

        for (let i = 0; i < S; i++) {
          const u     = i / (S - 1);
          const theta = u * tw * Math.PI * 2 + phaseOff + speed;

          const cosT  = Math.cos(theta);
          const sinT  = Math.sin(theta);   // sinT DRIVES DEPTH ILLUSION

          // SKIP IF WRONG DEPTH PASS
          if (backFront === 0 && sinT >= 0) continue;
          if (backFront === 1 && sinT < 0)  continue;

          // PERSPECTIVE-SQUASHED ORBIT AROUND SHIP
          const px = shipX + cosT * radius;
          const py = shipY + sinT * radius * 0.38;   // SQUASH Y FOR 3/4 PERSPECTIVE

          // DEPTH MODULATION — FRONT DOTS BRIGHTER + LARGER
          const depthNorm = (sinT + 1) * 0.5;        // 0 (back) → 1 (front)
          const dotA      = env * (0.3 + 0.7 * depthNorm);
          const dotR      = SPINOR_FX.DOT_SIZE * (0.45 + 0.55 * depthNorm);

          ctx.globalAlpha = dotA;
          ctx.fillStyle   = SPINOR_FX.STRAND_COLORS[strand];
          ctx.beginPath();
          ctx.arc(px, py, dotR, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
    }

    // ── WHITE CORE FLASH AT SHIP CENTER (FIRST 0.15s) ─────────────────────────
    if (t < 0.15) {
      const ft = t / 0.15;
      ctx.save();
      ctx.globalAlpha = (1 - ft) * 0.7;
      ctx.fillStyle   = '#ffffff';
      ctx.shadowBlur  = 18;
      ctx.shadowColor = '#c0a0ff';
      ctx.beginPath();
      ctx.arc(shipX, shipY, (1 - ft) * 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
}


class SpinorItem {
  constructor(x, y) {
    this.x         = x;
    this.y         = y;
    this.timer     = 0;
    this.angle     = 0;   // INTERNAL ANGLE - ADVANCES AT FULL ROTATION_SPEED
    this.bobPhase  = Math.random() * Math.PI * 2;
    this.collected = false;
  }

  isDead() {
    const C = CONFIG.SINGULARITY_BOMB;
    return this.timer >= C.LIFETIME || this.collected;
  }

  update(dt) {
    this.timer += dt;
    this.angle += CONFIG.SINGULARITY_BOMB.ROTATION_SPEED * dt;
  }

  draw(ctx) {
    if (this.collected) return;
    const C    = CONFIG.SINGULARITY_BOMB;
    const fade = Math.min(1, Math.min((C.LIFETIME - this.timer) / 2, this.timer / 0.6));
    if (fade <= 0) return;

    const bob = Math.sin(this.timer * 2.1 + this.bobPhase) * 7;
    const cx  = this.x;
    const cy  = this.y + bob;
    const R   = C.RADIUS;

    // SPINOR RULE: displayAngle = internalAngle / 2  (ONE VISUAL CYCLE = 720° INTERNAL) - isFlipped    = TRUE WHEN INTERNAL 60-720
    const dispAngle = this.angle * 0.5;
    const isFlipped = (this.angle % (Math.PI * 2)) > Math.PI;

    ctx.save();
    ctx.globalAlpha = fade;
    ctx.translate(cx, cy);

    // ── OUTER GLOW AURA ──
    const grd = ctx.createRadialGradient(0, 0, R * 0.15, 0, 0, R * 2.2);
    grd.addColorStop(0,   'rgba(180, 80, 255, 0.4)');
    grd.addColorStop(0.5, 'rgba(100, 20, 200, 0.15)');
    grd.addColorStop(1,   'rgba(60,  0, 140, 0)');
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(0, 0, R * 2.2, 0, Math.PI * 2);
    ctx.fill();

    // ── OUTER RING — ROTATES AT FULL DISPLAY ANGLE (HORIZONTAL TOROID) ──
    ctx.save();
    ctx.rotate(dispAngle);
    ctx.strokeStyle = '#c060ff';
    ctx.lineWidth   = 2.5;
    ctx.shadowBlur  = 14;
    ctx.shadowColor = '#9900ff';
    ctx.beginPath();
    ctx.ellipse(0, 0, R, R * 0.32, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // ── INNER RING — COUNTER-ROTATES, FLIPS AT 360° INTERNAL ──
    ctx.save();
    ctx.rotate(-dispAngle * 0.6);
    if (isFlipped) ctx.scale(-1, 1);   // SPINOR INVERSION 
    ctx.strokeStyle = '#e8b0ff';
    ctx.lineWidth   = 2;
    ctx.shadowBlur  = 10;
    ctx.shadowColor = '#cc44ff';
    ctx.beginPath();
    ctx.ellipse(0, 0, R * 0.38, R, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // ── CORE DARK SPHERE ──
    const core = ctx.createRadialGradient(0, 0, 0, 0, 0, R * 0.6);
    core.addColorStop(0,   'rgba(10, 0, 25, 1)');
    core.addColorStop(0.65,'rgba(60, 0, 130, 0.7)');
    core.addColorStop(1,   'rgba(60, 0, 130, 0)');
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.6, 0, Math.PI * 2);
    ctx.fill();

    // ── CENTRE DOT  ──
    const pulse = 0.5 + 0.5 * Math.sin(this.timer * 5.5);
    ctx.shadowBlur  = 8 + pulse * 10;
    ctx.shadowColor = '#ff88ff';
    ctx.fillStyle   = `rgba(255, 200, 255, ${0.6 + pulse * 0.35})`;
    ctx.beginPath();
    ctx.arc(0, 0, 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }
}


// ======================= BLACK HOLE SMOKE CONFIG =======================
const BH_SMOKE = {
  MAX_PARTICLES:    22,    // LOW CAP — ALWAYS-ON EFFECT, MUST BE LIGHT ON PERF
  SPAWN_RATE:       3.5,   // PARTICLES PER SECOND
  SMOKE_FRAMES:     9,
  SMOKE_SPRITE:     './images/smoke.png',
  SPAWN_RADIUS_MIN: 180,   // INNER SPAWN RING (PX FROM BH CENTER)
  SPAWN_RADIUS_MAX: 340,   // OUTER SPAWN RING
  SIZE_MIN:         80,
  SIZE_MAX:         140,
  BASE_SPEED:       260,
  SPEED_VARIANCE:   80,
  SPIN_STRENGTH:    1.8,   // TANGENTIAL FORCE — DRIVES THE SPIRAL
  PULL_STRENGTH:    0.7,   // RADIAL INWARD FORCE
  VORTEX_ACCEL:     2.8,   // SPEED RAMP-UP AS PARTICLE CLOSES IN
  VORTEX_RADIUS:    200,   // DISTANCE WHERE VORTEX KICKS IN
  KILL_RADIUS:      28,    // ABSORBED AT EDGE OF EVENT HORIZON
  FADE_IN_FRAC:     0.18,
  FADE_OUT_FRAC:    0.22,
  OPACITY_MIN:      0.28,
  OPACITY_MAX:      0.42,
  LIFE_MIN:         1.8,
  LIFE_VARIANCE:    1.4,
  SELF_ROTATE_SPEED: 0.7,
};

// ======================= BLACK HOLE SMOKE PARTICLE =======================
class BHSmokeParticle {
  constructor(bhX, bhY, smokeSprite, smokeFrameWidth) {
    // SPAWN AT RANDOM ANGLE, RANDOM RADIUS IN THE SPAWN RING AROUND THE BH
    const angle  = Math.random() * Math.PI * 2;
    const radius = BH_SMOKE.SPAWN_RADIUS_MIN + Math.random() * (BH_SMOKE.SPAWN_RADIUS_MAX - BH_SMOKE.SPAWN_RADIUS_MIN);
    this.x = bhX + Math.cos(angle) * radius;
    this.y = bhY + Math.sin(angle) * radius;

    this.frame     = Math.floor(Math.random() * BH_SMOKE.SMOKE_FRAMES);
    this.size      = BH_SMOKE.SIZE_MIN + Math.random() * (BH_SMOKE.SIZE_MAX - BH_SMOKE.SIZE_MIN);
    this.peakAlpha = BH_SMOKE.OPACITY_MIN + Math.random() * (BH_SMOKE.OPACITY_MAX - BH_SMOKE.OPACITY_MIN);
    this.maxLife   = BH_SMOKE.LIFE_MIN + Math.random() * BH_SMOKE.LIFE_VARIANCE;
    this.life      = this.maxLife;
    this.speed     = BH_SMOKE.BASE_SPEED + Math.random() * BH_SMOKE.SPEED_VARIANCE;
    this.rotation  = Math.random() * Math.PI * 2;
    this.rotSpeed  = (Math.random() < 0.5 ? -1 : 1) * (BH_SMOKE.SELF_ROTATE_SPEED + Math.random() * 0.5);

    this.smokeSprite     = smokeSprite;
    this.smokeFrameWidth = smokeFrameWidth;
    this.isDead          = false;
    this.distToCenter    = radius;
  }

  update(dt, targetX, targetY) {
    const dx   = targetX - this.x;
    const dy   = targetY - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    this.distToCenter = dist;

    if (dist < BH_SMOKE.KILL_RADIUS) { this.isDead = true; return; }

    const nx = dx / dist;
    const ny = dy / dist;
    // CW SPIRAL INTO THE BLACK HOLE (CLOCKWISE = FLIP TANGENTIAL SIGN VS WORM)
    const tx = ny;
    const ty = -nx;

    const closeness  = Math.max(0, 1 - dist / BH_SMOKE.VORTEX_RADIUS);
    const speedScale = 1 + closeness * closeness * BH_SMOKE.VORTEX_ACCEL;

    this.x += (tx * BH_SMOKE.SPIN_STRENGTH + nx * BH_SMOKE.PULL_STRENGTH) * this.speed * speedScale * dt;
    this.y += (ty * BH_SMOKE.SPIN_STRENGTH + ny * BH_SMOKE.PULL_STRENGTH) * this.speed * speedScale * dt;

    this.rotation += this.rotSpeed * dt;
    this.life -= dt;
    if (this.life <= 0) this.isDead = true;
  }

  draw(ctx) {
    if (!this.smokeSprite || this.smokeFrameWidth <= 0) return;

    const progress = 1 - (this.life / this.maxLife);
    let envelope;
    if (progress < BH_SMOKE.FADE_IN_FRAC) {
      envelope = progress / BH_SMOKE.FADE_IN_FRAC;
    } else if (progress > (1 - BH_SMOKE.FADE_OUT_FRAC)) {
      envelope = (1 - progress) / BH_SMOKE.FADE_OUT_FRAC;
    } else {
      envelope = 1.0;
    }

    const dist      = this.distToCenter;
    const shrinkFrac = Math.max(0, Math.min(1, 1 - (dist - BH_SMOKE.KILL_RADIUS) / (BH_SMOKE.VORTEX_RADIUS - BH_SMOKE.KILL_RADIUS)));
    const drawSize  = this.size * (1 - shrinkFrac * 0.90);

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

// ======================= BLACK HOLE SMOKE SYSTEM =======================
class BHSmokeSystem {
  constructor() {
    this.particles       = [];
    this.spawnAccum      = 0;
    this.smokeSprite     = new Image();
    this.smokeFrameWidth = 0;
    this.spriteLoaded    = false;

    this.smokeSprite.src = BH_SMOKE.SMOKE_SPRITE;
    this.smokeSprite.onload = () => {
      this.spriteLoaded    = true;
      this.smokeFrameWidth = this.smokeSprite.width / BH_SMOKE.SMOKE_FRAMES;
    };
  }

  update(dt, bhX, bhY, isActive) {
    // SPAWN ONLY WHILE BLACK HOLE IS ACTIVE OR COLLAPSING
    if (isActive && this.spriteLoaded && this.particles.length < BH_SMOKE.MAX_PARTICLES) {
      this.spawnAccum += BH_SMOKE.SPAWN_RATE * dt;
      while (this.spawnAccum >= 1 && this.particles.length < BH_SMOKE.MAX_PARTICLES) {
        this.particles.push(new BHSmokeParticle(bhX, bhY, this.smokeSprite, this.smokeFrameWidth));
        this.spawnAccum -= 1;
      }
    } else if (!isActive) {
      this.spawnAccum = 0;
    }

    for (let i = this.particles.length - 1; i >= 0; i--) {
      this.particles[i].update(dt, bhX, bhY);
      if (this.particles[i].isDead) this.particles.splice(i, 1);
    }
  }

  draw(ctx) {
    for (const p of this.particles) p.draw(ctx);
  }

  clear() { this.particles = []; this.spawnAccum = 0; }
}

export class BabyBlackHole {
  constructor(x, y, isBossBattle = false) {
    this.x      = x;
    this.y      = y;
    this.phase  = 'growing';
    this.phaseTimer = 0;
    this.radius = 0;
    this.angle  = 0;
    this._isBossBattle = isBossBattle;

    this._ripples          = [];
    this._rippleTimer      = 0;
    this._hawking          = [];
    this._dead             = false;
    this._bossStunApplied  = false;

    this._bossOrbitActive  = false; // BOSS ORBIT STATE
    this._bossOrbitAngle   = 0;
    this._bossOrbitRadius  = 0;

    this._wanderTargetX = x; // ORGANIC WANDER - SKIP FOR BOSS BATTLE
    this._wanderTargetY = y;
    if (!isBossBattle) this._pickWanderTarget();

    this._smokeSystem = new BHSmokeSystem(); // SPIRAL SMOKE INTO THE BLACK HOLE
  }

  isDead() { return this._dead; }

  // RETURNS 0-1 LENS DISTORTION STRENGTH — USED BY enemies.js FOR GRAVITATIONAL LENSING
  getLensStrength() {
    if (this.phase === 'growing')    return (this.phaseTimer / CONFIG.SINGULARITY_BOMB.BH_GROW_TIME) * 0.25;
    if (this.phase === 'active')     return 0.28 + Math.sin(this.phaseTimer * 2.1) * 0.13; // PULSING 0.15→0.41
    if (this.phase === 'collapsing') return (1 - this.phaseTimer / CONFIG.SINGULARITY_BOMB.BH_COLLAPSE_TIME) * 0.25;
    return 0;
  }

  // ── MAIN UPDATE ──────────────────────────────────────────────────────────────
  update(dt) {
    const C = CONFIG.SINGULARITY_BOMB;
    this.phaseTimer += dt;
    this.angle      += 2.2 * dt;

    // RIPPLE SPAWNER
    if (this.phase !== 'burst' && this.phase !== 'dead') {
      this._rippleTimer -= dt;
      if (this._rippleTimer <= 0 && this._ripples.length < 8) {
        this._ripples.push({ r: this.radius * 0.5, alpha: 0.65 });
        this._rippleTimer = 0.28;
      }
    }

    for (let i = this._ripples.length - 1; i >= 0; i--) {
      const rip = this._ripples[i];
      rip.r     += 110 * dt;
      rip.alpha -= 1.5 * dt;
      if (rip.alpha <= 0) this._ripples.splice(i, 1);
    }

    // ── PHASE MACHINE ──
    if (this.phase === 'growing') {
      const t    = Math.min(1, this.phaseTimer / C.BH_GROW_TIME);
      this.radius = t * C.BH_MAX_RADIUS;
      if (t >= 1) { this.phase = 'active'; this.phaseTimer = 0; }

    } else if (this.phase === 'active') {
      this.radius = C.BH_MAX_RADIUS;
      if (!this._isBossBattle) this._updateWander(dt);

      if (this.phaseTimer >= C.BH_LIFETIME) {
        this.phase = 'collapsing';
        this.phaseTimer = 0;
      }

    } else if (this.phase === 'collapsing') {
      const t    = Math.min(1, this.phaseTimer / C.BH_COLLAPSE_TIME);
      this.radius = C.BH_MAX_RADIUS * (1 - t);
      if (t >= 1) {
        this.phase = 'burst';
        this.phaseTimer = 0;
        this._spawnHawking();
      }

    } else if (this.phase === 'burst') {
      // UPDATE HAWKING PARTICLES
      for (let i = this._hawking.length - 1; i >= 0; i--) {
        const p = this._hawking[i];
        p.x    += p.vx * dt;
        p.y    += p.vy * dt;
        p.life -= dt;
        if (p.life <= 0) this._hawking.splice(i, 1);
      }
      if (this.phaseTimer > 1.5 && this._hawking.length === 0) {
        this._dead = true;
      }
    }

    // SMOKE SPIRALING INTO THE BLACK HOLE — ACTIVE + COLLAPSING PHASES
    const smokeActive = (this.phase === 'active' || this.phase === 'collapsing');
    this._smokeSystem.update(dt, this.x, this.y, smokeActive);
  }

  applyGravity(dt, enemies) {
    const C = CONFIG.SINGULARITY_BOMB;
    const isActive     = this.phase === 'active';
    const isCollapsing = this.phase === 'collapsing';

    if (!isActive && !isCollapsing) {
      for (const enemy of enemies) {
        if (enemy._bhSucked) enemy._bhSucked = false;
      }
      return;
    }

    for (const enemy of enemies) {
      if (enemy.isDead) continue;

      const dx   = this.x - enemy.x;
      const dy   = this.y - enemy.y;
      const dist = Math.hypot(dx, dy);

      if (isActive) {
        if (dist > C.GRAVITY_RANGE || dist < 1) continue;

        if (!enemy._bhSucked && dist < C.ORBIT_CAPTURE_RANGE) {
          enemy._bhSucked        = true;
          enemy._bhOrbitAngle    = Math.atan2(enemy.y - this.y, enemy.x - this.x);
          enemy._bhOrbitRadius   = dist;
          enemy._bhOriginalScale = enemy.scale;
        }

        if (enemy._bhSucked) {
          const orbitSpeed = C.ORBIT_SPEED / Math.sqrt(Math.max(enemy._bhOrbitRadius, 20));
          enemy._bhOrbitAngle  += orbitSpeed * dt;
          enemy._bhOrbitRadius  = Math.max(
            this.radius * 1.5,
            enemy._bhOrbitRadius - C.ORBIT_DRIFT_RATE * dt
          );
        } else {
          const nx   = dx / dist;
          const ny   = dy / dist;
          const pull = Math.min(C.GRAVITY_STRENGTH / dist * 55, 700) * dt;
          enemy.x += nx * pull;
          enemy.y += ny * pull;
        }

      // ── COLLAPSING PHASE ──
      } else if (isCollapsing) {
        if (!enemy._bhSucked) continue;

        const orbitSpeed = C.ORBIT_SPEED / Math.sqrt(Math.max(enemy._bhOrbitRadius, 5));
        enemy._bhOrbitAngle  += orbitSpeed * dt * 2.5; 
        enemy._bhOrbitRadius  = Math.max(
          0,
          enemy._bhOrbitRadius - C.ORBIT_COLLAPSE_RATE * dt
        );
      }

      // ── APPLY POLAR POSITION  ──
      if (enemy._bhSucked) {
        enemy.x       = this.x + Math.cos(enemy._bhOrbitAngle) * enemy._bhOrbitRadius;
        enemy.y       = this.y + Math.sin(enemy._bhOrbitAngle) * enemy._bhOrbitRadius;
        enemy.screenX = enemy.x;
        enemy.screenY = enemy.y;

        // SHRINK 
        const maxR = C.ORBIT_CAPTURE_RANGE;
        const shrinkT = Math.max(0, (enemy._bhOrbitRadius - this.radius) / (maxR - this.radius));
        enemy.scale   = Math.max(0.04, enemy._bhOriginalScale * shrinkT);

        // EVENT HORIZON 
        if (enemy._bhOrbitRadius <= this.radius * 1.1) {
          enemy._bhSucked = false;
          enemy.health    = 0;
          enemy.isDead    = true;
        }
      }
    }
  }

  // ── ORGANIC WANDER ────────────────────────────────────────────────────────────
  _updateWander(dt) {
    const C    = CONFIG.SINGULARITY_BOMB;
    const step = C.BH_WANDER_SPEED * dt;
    const dx   = this._wanderTargetX - this.x;
    const dy   = this._wanderTargetY - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist <= step + 2) {
      this.x = this._wanderTargetX;
      this.y = this._wanderTargetY;
      this._pickWanderTarget();
    } else {
      const inv = 1 / dist;
      this.x += dx * inv * step;
      this.y += dy * inv * step;
    }
  }

  _pickWanderTarget() {
    const C      = CONFIG.SINGULARITY_BOMB;
    const margin = 80;
    const cx     = window.innerWidth  * C.BH_WANDER_BIAS_X;
    const cy     = window.innerHeight * C.BH_WANDER_BIAS_Y;
    this._wanderTargetX = Math.max(margin, Math.min(window.innerWidth  - margin, cx + (Math.random() * 2 - 1) * C.BH_WANDER_X));
    this._wanderTargetY = Math.max(margin, Math.min(window.innerHeight - margin, cy + (Math.random() * 2 - 1) * C.BH_WANDER_Y));
  }

  // ── MINI HAWKING BURST  ────────────────────────────────────
  _spawnEnemyConsumptionBurst(x, y) {
    const C       = CONFIG.SINGULARITY_BOMB;
    const palette = ['#e25513', '#ff8a55', '#ffb48a', '#c71585', '#ff6030', '#ffff88'];
    const count   = 10;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.5;
      const speed = C.HAWKING_SPEED * (0.25 + Math.random() * 0.45);
      const life  = 0.28 + Math.random() * 0.3;
      this._hawking.push({
        x, y,
        vx:      Math.cos(angle) * speed,
        vy:      Math.sin(angle) * speed,
        color:   palette[Math.floor(Math.random() * palette.length)],
        size:    1 + Math.random() * 2.5,
        life,
        maxLife: life,
      });
    }
  }

  // ── BOSS ORBIT — TRAPS WORM HEAD IN CIRCULAR ORBIT, BODY FOLLOWS VIA IK CHAIN ─
  applyBossEffect(wormBoss, dt) {
    if (!wormBoss || !wormBoss.isActive || wormBoss.isDead) return;

    const C             = CONFIG.SINGULARITY_BOMB;
    const isOrbitPhase  = (this.phase === 'active' || this.phase === 'collapsing');

    if (isOrbitPhase) {
      if (!this._bossOrbitActive) {
        // CAPTURE — MEASURE WORM'S HEAD'S CURRENT SCREEN POSITION TO SET STARTING ANGLE/RADIUS
        this._bossOrbitActive = true;
        const head = wormBoss.segments[0];
        this._bossOrbitAngle  = Math.atan2(head.screenY - this.y, head.screenX - this.x);
        this._bossOrbitRadius = Math.min(
          Math.hypot(head.screenX - this.x, head.screenY - this.y),
          350  // DON'T START TOO FAR OUT
        );
        // console.log('🌀 Worm boss captured in black hole orbit');
      }

      // ADVANCE ORBIT ANGLE
      this._bossOrbitAngle += C.BOSS_ORBIT_SPEED * dt;

      // EASE RADIUS TOWARD TARGET
      this._bossOrbitRadius +=
        (C.BOSS_ORBIT_RADIUS - this._bossOrbitRadius) * Math.min(1, C.BOSS_ORBIT_EASE * dt);

      // PUSH ORBIT TARGET TO WORM EACH FRAME
      const targetSX = this.x + Math.cos(this._bossOrbitAngle) * this._bossOrbitRadius;
      const targetSY = this.y + Math.sin(this._bossOrbitAngle) * this._bossOrbitRadius;
      wormBoss.setOrbitPosition(targetSX, targetSY);

    } else if (this._bossOrbitActive) {
      // PHASE ENDED — RELEASE WORM
      this._bossOrbitActive = false;
      wormBoss.clearOrbit();
      // console.log('🌀 Worm boss released from orbit');
    }
  }

  // ── HAWKING BURST ────────────────────────────────────────────────────────────
  _spawnHawking() {
    const C      = CONFIG.SINGULARITY_BOMB;
    const count  = C.HAWKING_PARTICLES;
    const palette = ['#e25513', '#ff8a55', '#ffb48a', '#c71585', '#ff6030', '#ffb48a'];
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.4;
      const speed = C.HAWKING_SPEED * (0.55 + Math.random() * 0.9);
      const life  = 0.55 + Math.random() * 0.5;
      this._hawking.push({
        x:       this.x,
        y:       this.y,
        vx:      Math.cos(angle) * speed,
        vy:      Math.sin(angle) * speed,
        color:   palette[Math.floor(Math.random() * palette.length)],
        size:    1.5 + Math.random() * 4.5,
        life,
        maxLife: life,
      });
    }
  }

  // ── DRAW ─────────────────────────────────────────────────────────────────────
  draw(ctx) {
    if (this._dead) return;
    const r  = this.radius;
    const cx = this.x;
    const cy = this.y;

    // ── HAWKING BURST  ──
    if (this._hawking.length > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const p of this._hawking) {
        const a = p.life / p.maxLife;
        ctx.globalAlpha = a * 0.85;
        ctx.fillStyle   = p.color;
        ctx.shadowBlur  = 8;
        ctx.shadowColor = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * a, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // ── SMOKE SPIRALING IN — DRAW BEHIND BH VISUALS ──
    this._smokeSystem.draw(ctx);

    if (r < 1) return;

    ctx.save();

    // ── 1. OUTER CORONA / GRAVITATIONAL GLOW ──────────────────────────────────
    const coronaR = r * 4.5;
    const corona  = ctx.createRadialGradient(cx, cy, r * 0.9, cx, cy, coronaR);
    corona.addColorStop(0,    'rgba(226,  85, 19, 0.25)');  
    corona.addColorStop(0.28, 'rgba(199,  21,133, 0.15)'); 
    corona.addColorStop(0.60, 'rgba(199,  21,133, 0.05)');  
    corona.addColorStop(1,    'rgba(  0,   0,  0, 0)');
    ctx.fillStyle = corona;
    ctx.beginPath();
    ctx.arc(cx, cy, coronaR, 0, Math.PI * 2);
    ctx.fill();

    // ── 2. SPACE RIPPLES ────────────────────
    if (this._ripples.length > 0) {
      ctx.save();
      ctx.lineWidth   = 1.2;
      ctx.shadowBlur  = 6;
      ctx.shadowColor = '#e25513';
      for (const rip of this._ripples) {
        if (rip.alpha <= 0) continue;
        ctx.globalAlpha = rip.alpha * 0.35;
        ctx.strokeStyle = '#ff8a55';
        ctx.beginPath();
        ctx.arc(cx, cy, rip.r, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }

    // ── 3. ACCRETION DISK — FIXED ELLIPSE / SPINNING CONTENT  ───────────────────
    const TILT   = 0.08;         // VIEWING ANGLE COMPRESION: 1= FACE-ON. 0 = SIDE
    const DISK_R = r * 2.5;      // OUTER RADIUS OF DISK

    const drawDiskRings = () => {
      ctx.rotate(this.angle * 0.35); 

      // OUTER PINK RING
      ctx.save();
      ctx.strokeStyle = '#c71585';
      ctx.lineWidth   = r * 0.28;
      ctx.shadowBlur  = 50;
      ctx.shadowColor = '#c71585';
      ctx.globalAlpha = 0.55;
      ctx.beginPath();
      ctx.arc(0, 0, DISK_R, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      // ── DEEP ORANGE MID RING ──
      ctx.save();
      ctx.strokeStyle = '#e25513';
      ctx.lineWidth   = r * 0.50;
      ctx.shadowBlur  = 50;
      ctx.shadowColor = '#e25513';
      ctx.globalAlpha = 0.72;
      ctx.beginPath();
      ctx.arc(0, 0, DISK_R * 0.85, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      //  BRIGHT ORANGE INNER RING ──
      ctx.save();
      ctx.strokeStyle = '#ff8a55';
      ctx.lineWidth   = r * 0.6;
      ctx.shadowBlur  = 50;
      ctx.shadowColor = '#ff8a55';
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.arc(0, 0, DISK_R * 0.7, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      // ── HOTTEST INNER EDGE - NEAR WHITE ORANGE - RIGHT AT EVENT HORIZON ──
      ctx.save();
      ctx.strokeStyle = '#ffb48a';
      ctx.lineWidth   = r * 0.5;
      ctx.shadowBlur  = 28;
      ctx.shadowColor = '#ffb48a';
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.arc(0, 0, r * 1.2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      // ── RELATIVELISTIC HOT SPOT - BRIGHT ARC THAT LAPS DISK
      ctx.save();
      ctx.strokeStyle = '#ffb48a';
      ctx.lineWidth   = r * 0.55;
      ctx.shadowBlur  = 35;
      ctx.shadowColor = '#ffffff';
      ctx.globalAlpha = 0.45;
      ctx.beginPath();
      ctx.arc(0, 0, DISK_R * 0.60, -0.45, 0.45); // SHORT BRIGHT ARC
      ctx.stroke();
      // HOT PINK CENTER-SPOT ON OPPOSITE SIDE (180° AWAY)
      ctx.strokeStyle = '#c71585';
      ctx.shadowColor = '#c71585';
      ctx.shadowBlur  = 20;
      ctx.globalAlpha = 0.3;
      ctx.beginPath();
      ctx.arc(0, 0, DISK_R * 0.60, Math.PI - 0.35, Math.PI + 0.35);
      ctx.stroke();
      ctx.restore();
    };

    // ── BACK HALF  ──
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(1, TILT);
    ctx.save();
    // CLIP TO Y<0 (TOP HALF DISK SPACE = BACK OF DISK
    ctx.beginPath();
    ctx.rect(-DISK_R * 3, -DISK_R * 3, DISK_R * 6, DISK_R * 3);
    ctx.clip();
    drawDiskRings();
    ctx.restore();
    ctx.restore();

    // ── 4. EVENT HORIZON — SOLID BLACK DISC───────────────────────────────────
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();

    // ── 5. PHOTON RING — THE BRIGHT RING RIGHT AT THE EVENT HORIZON - IN REAL BH IMAGES, THIS IS THE SHARPEST BRIGHTEST FEATURE - TWO STROKES - A WIDE SOFT GLOW + A THIN HARD BRIGHT LINE ON TOP
    ctx.save();
    //  WIDE ORANGE GLOW
    ctx.strokeStyle = '#ff8a55';
    ctx.lineWidth   = 4;
    ctx.shadowBlur  = 28;
    ctx.shadowColor = '#e25513';
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    // THIN BRIGHT HOT-WHITE CORE LINE
    ctx.strokeStyle = '#ffb48a';
    ctx.lineWidth   = 1.5;
    ctx.shadowBlur  = 8;
    ctx.shadowColor = '#ffffff';
    ctx.globalAlpha = 1.0;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // ── 6. FRONT HALF OF DISK (DRAWN AFTER BH — OVERLAP EVENT HORIZON ───────
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(1, TILT);
    ctx.save();
    ctx.beginPath();
    ctx.rect(-DISK_R * 3, 0, DISK_R * 6, DISK_R * 3);
    ctx.clip();
    drawDiskRings();
    ctx.restore();
    ctx.restore();

    ctx.restore(); 
  }
}

//  SINGULARITY BOMB MANAGER
export class SingularityBombManager {
  constructor() {
    this._active     = false;
    this._spawnTimer = 0;
    this._items      = [];     
    this.blackHole   = null;   

    this.inventory   = 0;      

    this.audio       = null;
    this.isBossBattle  = false;  // SET BY bossBattle.js — CHANGES SPAWN + MOVEMENT BEHAVIOR
    this.deployEnabled = false;  // GATED EXTERNALLY — ONLY TRUE DURING ACTIVE WAVE / BOSS BATTLE

    this._collectEffects = [];   // SPINOR COLLECT VISUAL EFFECTS
    this._lastShipX      = 0;   // CACHED FOR drawItems() — SET EACH update()
    this._lastShipY      = 0;

    // CALLBACKS
    this.onInventoryChange = null;  
    this.onEnemyKilledByBH = null;  
    this.onSpinorCollect   = null;  // FIRES ON PICKUP — USE TO TRIGGER TUNNEL SPINOR EFFECT
  }

  // ── LIFECYCLE ────────────────────────────────────────────────────────────────
  start() {
    const C        = CONFIG.SINGULARITY_BOMB;
    this._active   = true;
    this._spawnTimer = C.FIRST_SPAWN_DELAY;
    this._items    = [];
    this.blackHole = null;
  }

  stop() {
    this._active     = false;
    this._items      = [];
    this._collectEffects = [];
  }

  reset() {
    this._active      = false;
    this._spawnTimer  = 0;
    this._items       = [];
    this.blackHole    = null;
    this.inventory    = 0;
    this.deployEnabled = false;
    this._collectEffects = [];
    this.onInventoryChange?.(0);
  }

  deploy(shipX, shipY) {
    if (!this.deployEnabled) return;         // BLOCKED OUTSIDE ACTIVE GAMEPLAY / BOSS BATTLE
    if (this.inventory <= 0) return;
    if (this.blackHole && !this.blackHole.isDead()) return; 
    this.inventory--;
    this.onInventoryChange?.(this.inventory);
    this.audio?.playBabyBlackhole();
    const spawnX = this.isBossBattle ? window.innerWidth  / 2 : shipX;
    const spawnY = this.isBossBattle ? window.innerHeight / 2 : shipY;
    this.blackHole = new BabyBlackHole(spawnX, spawnY, this.isBossBattle);
    // console.log(`💣 Singularity Bomb deployed | remaining: ${this.inventory} | boss: ${this.isBossBattle}`);
  }

  // ── UPDATE ───────────────────────────────────────────────────────────────────
  update(dt, shipX, shipY) {
    const C = CONFIG.SINGULARITY_BOMB;

    this._lastShipX = shipX;
    this._lastShipY = shipY;

    // SPAWN NEW SPINOR ITEMS
    if (this._active) {
      this._spawnTimer -= dt;
      if (this._spawnTimer <= 0 && this._items.length < C.MAX_COUNT) {
        this._spawnItem();
        this._spawnTimer = C.SPAWN_INTERVAL;
      }
    }

    // UPDATE ITEMS + CHECK COLLECTION
    for (let i = this._items.length - 1; i >= 0; i--) {
      const item = this._items[i];
      item.update(dt);

      if (!item.collected) {
        const dx = shipX - item.x;
        const dy = shipY - item.y;
        if (dx * dx + dy * dy < C.COLLECT_RADIUS * C.COLLECT_RADIUS) {
          item.collected = true;
          this._collect(item.x, item.y);  // PASS ITEM POSITION FOR FLASH RING
        }
      }

      if (item.isDead()) this._items.splice(i, 1);
    }

    // UPDATE SPINOR COLLECT EFFECTS
    for (let i = this._collectEffects.length - 1; i >= 0; i--) {
      this._collectEffects[i].update(dt);
      if (this._collectEffects[i].isDead()) this._collectEffects.splice(i, 1);
    }

    if (this.blackHole) {
      this.blackHole.update(dt);
      if (this.blackHole.isDead()) {
        this.blackHole = null;
      }
    }
  }

  applyGravityAndBossEffect(dt, enemies, wormBoss) {
    if (!this.blackHole || this.blackHole.isDead()) return;
    this.blackHole.applyGravity(dt, enemies);
    this.blackHole.applyBossEffect(wormBoss, dt);
  }

  // ── DRAW — SPLIT SO BH CAN BE DRAWN BEHIN ENEMIES, ITEMS ABOVE ─────────────
  drawBlackHole(ctx) {
    this.blackHole?.draw(ctx);
  }

  drawItems(ctx) {
    for (const item of this._items) item.draw(ctx);
    // COLLECT EFFECTS USE CACHED SHIP POSITION FROM LAST UPDATE
    for (const e of this._collectEffects) e.draw(ctx, this._lastShipX, this._lastShipY);
  }

  // ── INTERNAL ─────────────────────────────────────────────────────────────────
  _spawnItem() { // SPAWN IN SHIP'S REACHABLE ZONE
    const SHIP   = CONFIG.SHIP;
    const cx     = window.innerWidth  / 2;
    const cy     = window.innerHeight / 2;
    const rangeX = SHIP.MAX_OFFSET_X - 50;
    const rangeY = SHIP.MAX_OFFSET_Y - 50;
    const x      = cx + (Math.random() * 2 - 1) * rangeX;
    const y      = cy + (Math.random() * 2 - 1) * rangeY;
    this._items.push(new SpinorItem(x, y));
  }

  _collect(collectX = 0, collectY = 0) {
    const C = CONFIG.SINGULARITY_BOMB;
    if (this.inventory >= C.MAX_INVENTORY) return; // FULL INVENTORY
    this.inventory++;
    this.onInventoryChange?.(this.inventory);
    this.audio?.playPowerUp3();
    this._collectEffects.push(new SpinorCollectEffect(collectX, collectY));
    this.onSpinorCollect?.();   // → tunnel.triggerSpinor()
    // console.log(`💜 Singularity Bomb collected | inventory: ${this.inventory}`);
  }
}