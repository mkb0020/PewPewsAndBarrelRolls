// Updated 3/12/26 @ 10:30PM
// fractalCascade.js

import { CONFIG }      from '../utils/config.js';
import { ImageLoader } from '../utils/imageLoader.js';

// ── ECHO SCALE TIERS (OUTER → INNER) ─────────────────────────────────────────
const ECHO_SCALES = [1.0, 0.65, 0.42, 0.28, 0.18];

// ── PRE-COMPUTED ECHO TINT COLORS (CYAN → WARM GREEN, OUTER → INNER) ──────────
// #00ffff at i=0 → #88ff00 at i=4
const ECHO_COLORS = ECHO_SCALES.map((_, i) => {
  const t = i / (ECHO_SCALES.length - 1);
  return `rgb(${Math.round(t * 136)},255,${Math.round(255 * (1 - t))})`;
});

// ── TERMINAL COPY ─────────────────────────────────────────────────────────────
const TERMINAL_LINES = [
  "movingUp     = isKeyPressed('W')",
  "movingUp     = isKeyPressed('S')",
  "",
  "collision.resolve() = FAILED",
  "player.position = NULL",
  "",
  "WARNING: MULTIPLE PLAYER INSTANCES DETECTED",
  "",
  "inverting control matrix...",
  "",
  "which one is real?",
];

// ─────────────────────────────────────────────────────────────────────────────
export class FractalCascade {
  constructor() {
    this.active = false;

    // ── TELEGRAPH ──
    this._telegraphing   = false;
    this._telegraphTimer = 0;

    // ── MAIN PHASE ──
    this._timer = 0;   // COUNTS UP FROM 0 DURING MAIN PHASE
    this._time  = 0;   // RUNNING CLOCK FOR SINE MOTION (CONTINUES THROUGH RECOMPILE)

    // ── ECHO STATE ────────────────────────────────────────────────────────────
    // [{ scale, offsetX, offsetY, phaseX, phaseY }]
    this._echoes = [];

    // ── GHOST TRAIL — FLAT OBJECT POOL ────────────────────────────────────────
    // [{ x, y, scale, alpha, life, maxLife, delay }]
    // delay > 0 = "not yet visible — waiting for sub-ghost stagger"
    this._ghosts     = [];
    this._ghostTimer = 0;  // ACCUMULATOR → TRIGGERS SPAWN BATCH EVERY GHOST_INTERVAL

    // ── MICRO SHAKE — FIRES ONCE WHEN CONTROLS FLIP 
    this._shakeX     = 0;
    this._shakeY     = 0;
    this._shakeTimer = 0;

    // ── RECOMPILE 
    this._recompiling = false;
    this._recompileT  = 0; // 0→1 WITHIN RECOMPILE WINDOW

    // ── TERMINAL DOM 
    this._terminalEl  = null;  // CREATED ONCE ON FIRST ACTIVATE, REUSED
    this._termLines   = [];    // LINES TYPED SO FAR
    this._termTimer   = 0;
    this._termLineIdx = 0;

    // ── SHIP REFERENCE — STORED EACH UPDATE SO _deactivate CAN CLEAR THE FLAG ─
    this._ship = null;

    this.cooldownUntil = 0;

    // ── CALLBACKS 
    this.onRecompile = null; // CALLED WHEN RECOMPILE SNAP BEGINS (SFX HOOK)
    this.onEnd       = null; // CALLED WHEN ATTACK FULLY ENDS
  }

  // PUBLIC API
  /** @returns {boolean} FALSE IF ALREADY ACTIVE OR ON COOLDOWN  */
  activate() {
    if (this.active || Date.now() < this.cooldownUntil) return false;

    const CFG          = CONFIG.FRACTAL_CASCADE;
    this.active        = true;
    this._telegraphing = true;
    this._telegraphTimer = 0;
    this._timer        = 0;
    this._time         = 0;
    this._ghostTimer   = 0;
    this._ghosts       = [];
    this._shakeX = this._shakeY = this._shakeTimer = 0;
    this._recompiling  = false;
    this._recompileT   = 0;
    this._termLines    = [];
    this._termLineIdx  = 0;
    this._termTimer    = 0;

    // INIT ECHO OBJECTS — RANDOMIZE OSCILLATION PHASES
    this._echoes = ECHO_SCALES.map(scale => ({
      scale,
      offsetX: (Math.random() - 0.5) * 20,
      offsetY: (Math.random() - 0.5) * 20,
      phaseX:  Math.random() * Math.PI * 2,
      phaseY:  Math.random() * Math.PI * 2 + Math.PI * 0.5, // PHASE-SHIFTED FOR X/Y INDEPENDENCE
    }));

    this._ensureTerminal();
    return true;
  }

  isActive() { return this.active; }

  /** HARD STOP WITH COOLDOWN RESET - CALL ON SHIP DEATH / WAVE CLEAR / BOSS TRANSITION */
  reset() {
    this._deactivate(/* skipCooldown= */ true);
    this.cooldownUntil = 0;
  }

  // UPDATE — CALL EVERY FRAME WHILE GAMEPLAY IS ACTIVE 
  /**
   * @param {number} dt
   * @param {number} shipX    — SHIP WORLD x
   * @param {number} shipY    — SHIP WORLD y
   * @param {object} ship     — SHIP INSTANCE 
   */
  update(dt, shipX, shipY, ship) {
    if (!this.active) return;

    const CFG = CONFIG.FRACTAL_CASCADE;

    // ── TELEGRAPH PHASE ──────────────────────────────────────────────────────
    if (this._telegraphing) {
      this._telegraphTimer += dt;
      if (this._telegraphTimer >= CFG.TELEGRAPH_DURATION) {
        this._telegraphing = false;
        if (this._terminalEl) this._terminalEl.style.display = 'block'; // TERMINAL APPEARS ON MAIN PHASE START
      }
      return;
    }

    // ── MAIN PHASE ───────────────────────────────────────────────────────────
    this._timer += dt;
    this._time  += dt;

    const fullDuration   = CFG.DURATION;
    const recompileStart = fullDuration - CFG.RECOMPILE_WINDOW;

    if (!this._recompiling && this._timer >= recompileStart) {
      this._beginRecompile();
    }

    // ── ECHO OSCILLATION ─────────────────────────────────────────────────────
    // AMPLITUDES COLLAPSE TO 0 DURING RECOMPILE (LERP → PLAYER POSITION)
    let collapseT = 0;
    if (this._recompiling) {
      this._recompileT = Math.min(1, this._recompileT + dt / CFG.RECOMPILE_WINDOW);
      collapseT        = this._recompileT;
    }

    const t = this._time;
    for (let i = 0; i < this._echoes.length; i++) {
      const e   = this._echoes[i];
      const amp = (18 + i * 6) * (1 - collapseT); // OUTER ECHOES HAVE WIDER ORBITS
      e.offsetX = Math.sin(t * (1.2 + i * 0.3) + e.phaseX) * amp;
      e.offsetY = Math.cos(t * (1.0 + i * 0.25) + e.phaseY) * amp;
    }

    // ── GHOST TRAIL ──────────────────────────────────────────────────────────
    if (!this._recompiling) {
      this._ghostTimer += dt;
      if (this._ghostTimer >= CFG.GHOST_INTERVAL) {
        this._ghostTimer = 0;
        // SPAWN GHOST CHAIN AT EACH ECHO POSITION
        for (let i = 0; i < this._echoes.length; i++) {
          const e = this._echoes[i];
          this._spawnGhostChain(shipX + e.offsetX, shipY + e.offsetY, e.scale, 0, 0);
        }
      }
    }

    // UPDATE GHOST POOL — DELAY COUNTDOWN, FADE, SHRINK, CULL
    for (let i = this._ghosts.length - 1; i >= 0; i--) {
      const g = this._ghosts[i];
      if (g.delay > 0) { g.delay -= dt; continue; }
      g.life -= dt;
      if (g.life <= 0) { this._ghosts.splice(i, 1); continue; }
      g.alpha  = Math.max(0, (g.life / g.maxLife) * 0.6);
      g.scale -= g.scale * dt * 1.0; // SLIGHT SCALE BLEED-OUT
    }

    // ── CONTROL REVERSAL — FLIP SHIP INPUTS DURING MAIN PHASE, RESTORE ON RECOMPILE ──
    this._ship = ship;
    if (ship) ship._fractalControlsReversed = !this._recompiling;

    // ── ONE-TIME SHAKE ON CONTROLS FLIPPING (FIRST FRAME OF MAIN PHASE) ──────
    if (this._timer <= dt && this._shakeTimer === 0) {
      this._shakeX     = (Math.random() - 0.5) * 10;
      this._shakeY     = (Math.random() - 0.5) * 8;
      this._shakeTimer = 0.18;
    }
    if (this._shakeTimer > 0) {
      this._shakeTimer -= dt;
      if (this._shakeTimer <= 0) { this._shakeX = 0; this._shakeY = 0; }
    }

    // ── TERMINAL TYPING ──────────────────────────────────────────────────────
    if (!this._recompiling && this._termLineIdx < TERMINAL_LINES.length) {
      this._termTimer += dt;
      if (this._termTimer >= CFG.TERMINAL_LINE_INTERVAL) {
        this._termTimer = 0;
        this._termLines.push(TERMINAL_LINES[this._termLineIdx++]);
        this._renderTerminal(false);
      }
    }

    // ── END CHECK ─────────────────────────────────────────────────────────────
    if (this._timer >= fullDuration) {
      this._deactivate(false);
    }
  }

  // DRAW A — ECHO SHIPS + GHOST TRAILS
  drawEchoes(ctx, shipX, shipY) {
    if (!this.active || this._telegraphing) return;

    const sprite = ImageLoader.get('ship');
    if (!sprite) return;

    const CFG    = CONFIG.FRACTAL_CASCADE;
    const frameW = sprite.width / CONFIG.SHIP.SPRITE_FRAMES;
    const frame  = CONFIG.SHIP.NEUTRAL_FRAME; // ECHOES ALWAYS USE NEUTRAL FRAME
    const shipW  = CONFIG.SHIP.WIDTH;
    const shipH  = CONFIG.SHIP.HEIGHT;

    // APPLY MICRO-SHAKE OFFSET TO DRAW ORIGIN
    const sx = shipX + this._shakeX;
    const sy = shipY + this._shakeY;

    // ── 1. GHOST TRAILS (BOTTOM LAYER) ───────────────────────────────────────
    for (const g of this._ghosts) {
      if (g.delay > 0 || g.alpha < 0.01) continue;
      const gW = shipW * g.scale;
      const gH = shipH * g.scale;
      ctx.save();
      ctx.globalAlpha = g.alpha;
      ctx.shadowColor = '#00ff66';
      ctx.shadowBlur  = 5;
      ctx.drawImage(sprite, frame * frameW, 0, frameW, sprite.height,
        g.x - gW / 2, g.y - gH / 2, gW, gH);
      ctx.globalCompositeOperation = 'source-atop';
      ctx.globalAlpha = g.alpha * 0.5;
      ctx.fillStyle   = '#00ff66';
      ctx.fillRect(g.x - gW / 2, g.y - gH / 2, gW, gH);
      ctx.restore();
    }

    // ── 2. ECHO SHIPS (OUTER TO INNER — SMALLEST ON TOP) ─────────────────────
    for (let i = 0; i < this._echoes.length; i++) {
      const e     = this._echoes[i];
      const ex    = sx + e.offsetX;
      const ey    = sy + e.offsetY;
      const ew    = shipW * e.scale;
      const eh    = shipH * e.scale;
      const alpha = Math.max(0.05, 0.55 - i * 0.09); // OUTER MORE OPAQUE
      const color = ECHO_COLORS[i];

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.shadowColor = color;
      ctx.shadowBlur  = 10 + e.scale * 6;
      ctx.drawImage(sprite, frame * frameW, 0, frameW, sprite.height,
        ex - ew / 2, ey - eh / 2, ew, eh);
      // TINT PASS
      ctx.globalCompositeOperation = 'source-atop';
      ctx.globalAlpha = alpha * 0.42;
      ctx.fillStyle   = color;
      ctx.fillRect(ex - ew / 2, ey - eh / 2, ew, eh);
      ctx.restore();
    }

    // ── 3. RECOMPILE SNAP FLASH ───────────────────────────────────────────────
    if (this._recompiling && this._recompileT < 0.75) {
      ctx.save();
      ctx.globalAlpha = ((0.75 - this._recompileT) / 0.75) * 0.22;
      ctx.fillStyle   = '#00ff88';
      ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      ctx.restore();
    }
  }

  // DRAW B — TELEGRAPH OVERLAY
  drawTelegraph(ctx, shipX, shipY) {
    if (!this.active || !this._telegraphing) return;

    const CFG  = CONFIG.FRACTAL_CASCADE;
    const tFrac = this._telegraphTimer / CFG.TELEGRAPH_DURATION;

    // ── NESTED ROTATING TRIANGLES (3 TIERS, SCALING DOWN) ───────────────────
    const flash = Math.sin(tFrac * Math.PI * 8) * 0.5 + 0.5;
    ctx.save();
    ctx.strokeStyle = '#00ff88';
    ctx.shadowColor = '#00ff88';
    ctx.shadowBlur  = 14;
    ctx.lineWidth   = 1.5;

    for (let tier = 0; tier < 3; tier++) {
      const sz  = (52 + tFrac * 22) * (1 - tier * 0.3);
      const rot = tFrac * Math.PI * 0.6 + tier * (Math.PI / 4);
      ctx.globalAlpha = tFrac * 0.55 * flash * (1 - tier * 0.25);
      ctx.beginPath();
      for (let v = 0; v <= 3; v++) {
        const angle = (v / 3) * Math.PI * 2 + rot;
        const px    = shipX + Math.cos(angle) * sz;
        const py    = shipY + Math.sin(angle) * sz;
        v === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
    ctx.restore();

    // ── SCREEN SHIMMER (SUBTLE GREEN FLASH ON BRIGHT PULSES) ─────────────────
    if (flash > 0.75 && tFrac > 0.25) {
      ctx.save();
      ctx.globalAlpha = ((flash - 0.75) / 0.25) * 0.06 * tFrac;
      ctx.fillStyle   = '#00ff88';
      ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      ctx.restore();
    }
  }

  // INTERNALS
  /**
   * SPAWNS A RECURSIVE GHOST CHAIN AT X, Y - EACH GHOST HAS A DELAY SO SUB-GHOSTS APPEAR ~60ms AFTER THEIR PARENT -  CAPPED @ 25 TOTAL
   */
  _spawnGhostChain(x, y, scale, depth, delay) {
    const CFG = CONFIG.FRACTAL_CASCADE;
    if (depth >= CFG.GHOST_DEPTH || this._ghosts.length >= 25) return;

    const maxLife = Math.max(0.18, 0.34 - depth * 0.06);
    this._ghosts.push({ x, y, scale, alpha: 0, maxLife, life: maxLife, delay });

    // SUB-GHOST: SLIGHT POSITIONAL DRIFT + 60ms STAGGER
    this._spawnGhostChain(
      x + (Math.random() - 0.5) * 10,
      y + (Math.random() - 0.5) * 10,
      scale * 0.6,
      depth + 1,
      delay + 0.06,
    );
  }

  _beginRecompile() {
    this._recompiling = true;
    this._recompileT  = 0;
    this._ghosts      = []; // INSTANTLY CLEAR GHOST TRAILS ON SNAP
    if (this._terminalEl) {
      this._termLines.push('');
      this._termLines.push('> RECOMPILING PLAYER MODULE...');
      this._termLines.push('> RECOMPILE COMPLETE');
      this._renderTerminal(true); // TRUE = HIGHLIGHT RECOMPILE LINES
    }
    this.onRecompile?.(); // SFX HOOK
  }

  /**
   * @param {boolean} skipCooldown — true when called from reset() (hard abort)
   */
  _deactivate(skipCooldown = false) {
    this.active        = false;
    this._telegraphing = false;
    this._ghosts       = [];
    if (this._ship) { this._ship._fractalControlsReversed = false; this._ship = null; }
    if (this._terminalEl) {
      this._terminalEl.style.display = 'none';
      this._terminalEl.innerHTML     = '';
    }
    this._termLines    = [];
    this._termLineIdx  = 0;
    if (!skipCooldown) {
      this.cooldownUntil = Date.now() + CONFIG.FRACTAL_CASCADE.COOLDOWN_MS;
    }
    this.onEnd?.();
  }

  /** Creates the terminal DOM element once, lazily. */
  _ensureTerminal() {
    if (this._terminalEl) return;
    const el = document.createElement('div');
    el.id    = 'fractal-terminal';
    Object.assign(el.style, {
      position:      'fixed',
      top:           '80px',
      left:          '22px',
      width:         '310px',
      background:    'rgba(0,0,0,0.52)',
      border:        '1px solid #00ff44',
      borderRadius:  '3px',
      color:         '#00ff44',
      fontFamily:    "'Courier New', monospace",
      fontSize:      '11.5px',
      padding:       '10px 14px',
      zIndex:        '300',
      pointerEvents: 'none',
      lineHeight:    '1.75',
      display:       'none',
      whiteSpace:    'pre',
      maxHeight:     '240px',
      overflow:      'hidden',
    });
    document.body.appendChild(el);
    this._terminalEl = el;
  }

  /**
   * @param {boolean} finalPass — colors the last 3 lines as recompile success
   */
  _renderTerminal(finalPass) {
    if (!this._terminalEl) return;
    const total = this._termLines.length;
    this._terminalEl.innerHTML = this._termLines
      .map((l, i) => {
        const isRecompile = finalPass && i >= total - 3;
        const color       = isRecompile ? '#ffffff' : '#00ff44';
        return `<div style="color:${color}">${l || '\u00A0'}</div>`;
      })
      .join('');
  }
}