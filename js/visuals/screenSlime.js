// Updated 3/10/26 @ 7:50am
// screenSlime.js

// ── DRIP CONSTANTS ────────────────────────────────────────────────────────────
const POOL_H        = 32;    // px — HEIGHT OF SLIME POOL AT TOP OF SCREEN
const DRIP_COUNT    = 9;     
const GROW_MIN      = 42;    // px/s SLOW DRIP SPEED
const GROW_MAX      = 85;    
const LEN_MIN       = 105;   // px — DRIP LENGTH BEFORE DROPS DETACH 
const LEN_MAX       = 295;  
const ROOT_W_MIN    = 12;    // px — NARROWEST ROOT WIDTH 
const ROOT_W_MAX    = 28;    // px — WIDEST ROOT WIDTH 
const WOBBLE_AMP    = 24;    // px — MAX HORIZONTAL SWAY OF DRIP TIP
const DRIP_GAP_MIN  = 0.25;  // s  — MIN PAUSE BEFORE DRIP RESTARTS 
const DRIP_GAP_MAX  = 2.2;   // s  — MAX PAUSE
const DROP_GRAVITY  = 195;   // px/s² — FALLING DROPLET ACCELERATION 
const DROP_SPEED_0  = 22;    // px/s —  INITIAL DETACH SPEED
const DROP_MAX      = 18;    // MAX SIMULTANEOUS FALLING DROPLETS 

// ── COLORS ────────────────────────────────────────────────────────────────────
const C_DARK      = '#1a7a1a';
const C_MID       = '#33cc44';
const C_BRIGHT    = '#66ff77';
const C_GLOW      = '#22ff44';
const C_POOL_TOP  = '#33cc44';
const C_POOL_BOT  = 'rgba(40,180,60,0)';
const C_SPEC      = 'rgba(195,255,205,0.55)';

export class ScreenSlime {
  constructor() {
    this.drips    = [];
    this.droplets = [];
    this._waveT   = 0;
    this._init();
  }

  // ── INIT / SPAWN ─────────────────────────────────────────────────────────────
  _init() {
    this.drips    = [];
    this.droplets = [];
    this._waveT   = 0;
    for (let i = 0; i < DRIP_COUNT; i++) {
      this.drips.push(this._makeDrip(true));
    }
  }

  _makeDrip(staggerDelay = false) {
    const W = window.innerWidth;
    return {
      x:         60 + Math.random() * (W - 120),
      length:    0,
      maxLen:    LEN_MIN + Math.random() * (LEN_MAX - LEN_MIN),
      speed:     GROW_MIN + Math.random() * (GROW_MAX - GROW_MIN),
      rootW:     ROOT_W_MIN + Math.random() * (ROOT_W_MAX - ROOT_W_MIN),
      wobble:    (Math.random() - 0.5) * 2 * WOBBLE_AMP,
      wobSpd:    0.3 + Math.random() * 0.5,
      wobPhase:  Math.random() * Math.PI * 2,
      delay:     staggerDelay ? Math.random() * 2.4 : 0, 
      active:    false,
    };
  }

  _resetDrip(d) {
    const W  = window.innerWidth;
    d.x      = 60 + Math.random() * (W - 120);
    d.length = 0;
    d.maxLen = LEN_MIN + Math.random() * (LEN_MAX - LEN_MIN);
    d.speed  = GROW_MIN + Math.random() * (GROW_MAX - GROW_MIN);
    d.rootW  = ROOT_W_MIN + Math.random() * (ROOT_W_MAX - ROOT_W_MIN);
    d.wobble = (Math.random() - 0.5) * 2 * WOBBLE_AMP;
    d.wobSpd = 0.3 + Math.random() * 0.5;
    d.wobPhase = Math.random() * Math.PI * 2;
    d.delay  = DRIP_GAP_MIN + Math.random() * (DRIP_GAP_MAX - DRIP_GAP_MIN);
    d.active = false;
  }

  spawn() {
    this._init();
  }

  // ── UPDATE ───────────────────────────────────────────────────────────────────
  update(dt, intensity) {
    if (intensity < 0.01) return;
    this._waveT += dt;

    for (const d of this.drips) {
      if (!d.active) {
        d.delay -= dt;
        if (d.delay <= 0) d.active = true;
        continue;
      }

      d.wobPhase += d.wobSpd * dt;
      d.length   += d.speed  * dt;

      if (d.length >= d.maxLen) {
        if (this.droplets.length < DROP_MAX) {
          const wobX = Math.sin(d.wobPhase) * d.wobble;
          const tipR = this._tipRadius(d);
          this.droplets.push({
            x:  d.x + wobX,
            y:  POOL_H + d.length + tipR,
            vy: DROP_SPEED_0,
            r:  tipR * 0.85,
          });
        }
        this._resetDrip(d);
      }
    }

    const H = window.innerHeight;
    for (let i = this.droplets.length - 1; i >= 0; i--) {
      const dr = this.droplets[i];
      dr.vy += DROP_GRAVITY * dt;
      dr.y  += dr.vy * dt;
      if (dr.y > H + 60) this.droplets.splice(i, 1);
    }
  }

  // ── HELPERS ──────────────────────────────────────────────────────────────────
  _tipRadius(d) {
    const t = d.length / d.maxLen;
    return d.rootW * 0.44 + t * d.rootW * 0.82;
  }

  // ── DRAW ─────────────────────────────────────────────────────────────────────
  draw(ctx, intensity) {
    if (intensity < 0.01) return;

    ctx.save();
    ctx.globalAlpha = Math.min(1, intensity);

    this._drawPool(ctx);
    this._drawDrips(ctx);
    this._drawDroplets(ctx);

    ctx.restore();
  }

  _drawPool(ctx) {
    const W = window.innerWidth;
    const t = this._waveT;

    const grad = ctx.createLinearGradient(0, 0, 0, POOL_H + 16);
    grad.addColorStop(0,   C_POOL_TOP);
    grad.addColorStop(0.65, C_MID);
    grad.addColorStop(1,   C_POOL_BOT);

    ctx.shadowColor = C_GLOW;
    ctx.shadowBlur  = 24;
    ctx.fillStyle   = grad;

    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(W, 0);
    ctx.lineTo(W, POOL_H);

    const step = 12;
    for (let x = W; x >= 0; x -= step) {
      const wave = Math.sin(x * 0.022 + t * 2.1) * 5
                 + Math.sin(x * 0.057 + t * 1.5) * 3
                 + Math.sin(x * 0.011 - t * 0.8) * 2;
      ctx.lineTo(x, POOL_H + wave);
    }
    ctx.closePath();
    ctx.fill();

    ctx.shadowBlur = 0;
    const specGrad = ctx.createLinearGradient(0, 1, 0, 10);
    specGrad.addColorStop(0, 'rgba(180,255,195,0.42)');
    specGrad.addColorStop(1, 'rgba(180,255,195,0)');
    ctx.fillStyle = specGrad;
    ctx.fillRect(0, 0, W, 10);
  }

  _drawDrips(ctx) {
    for (const d of this.drips) {
      if (!d.active || d.length < 4) continue;
      this._drawOneDrip(ctx, d);
    }
  }

  _drawOneDrip(ctx, d) {
    const { length: len, maxLen, rootW, x, wobPhase, wobble } = d;

    const wobX     = Math.sin(wobPhase) * wobble * (len / maxLen);
    const tipX     = x + wobX;
    const poolY    = POOL_H;
    const tipY     = poolY + len;
    const tipR     = this._tipRadius(d);
    const halfRoot  = rootW / 2;
    const halfStalk = rootW * 0.17;   

    const dripGrad = ctx.createLinearGradient(tipX - tipR, 0, tipX + tipR, 0);
    dripGrad.addColorStop(0,    C_DARK);
    dripGrad.addColorStop(0.25, C_MID);
    dripGrad.addColorStop(0.5,  C_BRIGHT);
    dripGrad.addColorStop(0.75, C_MID);
    dripGrad.addColorStop(1,    C_DARK);

    ctx.shadowColor = C_GLOW;
    ctx.shadowBlur  = 10;
    ctx.fillStyle   = dripGrad;

    ctx.beginPath();
    ctx.moveTo(x - halfRoot, poolY);
    ctx.bezierCurveTo(
      x    - halfRoot,  poolY + len * 0.35,   
      tipX - halfStalk, poolY + len * 0.65,   
      tipX - tipR,      tipY                 
    );
    ctx.arc(tipX, tipY, tipR, Math.PI, 0, false);  
    ctx.bezierCurveTo(
      tipX + halfStalk, poolY + len * 0.65,   
      x    + halfRoot,  poolY + len * 0.35,   
      x    + halfRoot,  poolY                 
    );
    ctx.closePath();
    ctx.fill();

    ctx.shadowBlur = 0;
    const specR = tipR * 0.38;
    const specX = tipX - tipR * 0.28;
    const specY = tipY - tipR * 0.32;
    const specGrad = ctx.createRadialGradient(specX, specY, 0, specX, specY, specR);
    specGrad.addColorStop(0, C_SPEC);
    specGrad.addColorStop(1, 'rgba(180,255,200,0)');
    ctx.fillStyle = specGrad;
    ctx.beginPath();
    ctx.arc(specX, specY, specR, 0, Math.PI * 2);
    ctx.fill();
  }

  _drawDroplets(ctx) {
    for (const dr of this.droplets) {
      const r  = dr.r;
      const rx = r;
      const ry = r * 0.78;   

      ctx.save();
      ctx.shadowColor = C_GLOW;
      ctx.shadowBlur  = 8;

      const dropGrad = ctx.createRadialGradient(
        dr.x - r * 0.3, dr.y - r * 0.3, r * 0.05,
        dr.x,            dr.y,            r
      );
      dropGrad.addColorStop(0,    'rgba(185,255,195,0.85)');
      dropGrad.addColorStop(0.38, C_MID);
      dropGrad.addColorStop(1,    C_DARK);

      ctx.fillStyle = dropGrad;
      ctx.beginPath();
      ctx.ellipse(dr.x, dr.y, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // ── RESET ────────────────────────────────────────────────────────────────────
  reset() {
    this._init();
  }
}