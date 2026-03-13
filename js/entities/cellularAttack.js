// Updated 3/13/26 @ 5:45pm
// cellularAttack.js 
// ~~~~~~~~~~~~~~~~~~~~ IMPORTS ~~~~~~~~~~~~~~~~~~~~
import { CONFIG } from '../utils/config.js';
// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

export class CellularAttack {
  constructor() {

    // CALLBACKS — WIRE IN bossBattle.js
    this.onAttackEnd     = null;  // (didSucceed: bool) → void
    this.onCollapseBurst = null;  // ([{x, y}]) → void

    // ── ATTACK STATE ──
    this.isActive        = false;
    this._phase          = 'idle'; // 'growing' | 'successFade' | 'collapse'
    this._time           = 0;
    this._stepAccum      = 0;
    this._fadeTimer      = 0;
    this._collapseTimer  = 0;
    this._attackTimer    = 0;
    this._didSucceed     = false;

    // ── BREAK NODE TRACKING ──
    this._breakNodes       = [];
    this._breakNodesKilled = 0;

    // ── SHIP DAMAGE ACCUMULATOR ──
    this._damageAccum = 0;

    // ── GRID — INITIALISED IN _initGrid() ──
    this.cols     = 0;
    this.rows     = 0;
    this.cellSize = 0;
    this.gridOffX = 0;
    this.gridOffY = 0;
    this.grid     = null; // Uint8Array — CELL AGE (0 = DEAD)
    this._next    = null; // Uint8Array — SCRATCH BUFFER FOR STEP

    // ── RULE LOOKUP TABLES ──
    this._surviveSet = null; // Uint8Array[9] — INDICES 0–8
    this._birthSet   = null; // Uint8Array[9]

    // ── COLLAPSE + SUCCESS PARTICLES ──
    this._collapseParticles = [];
    this._successParticles  = [];

    this._buildRuleTables();
  }

  // ══════════════════════ PUBLIC API ══════════════════════

  start(seedX, seedY) {
    this._buildRuleTables();
    this._initGrid();
    this._seedAt(seedX, seedY);

    this.isActive          = true;
    this._phase            = 'growing';
    this._time             = 0;
    this._stepAccum        = 0;
    this._fadeTimer        = 0;
    this._collapseTimer    = 0;
    this._attackTimer      = CONFIG.CELLULAR_ATTACK.ATTACK_DURATION;
    this._breakNodesKilled = 0;
    this._didSucceed       = false;
    this._collapseParticles = [];
    this._successParticles  = [];
    this._damageAccum      = 0;
  }

  update(dt) {
    if (!this.isActive) return;
    const C = CONFIG.CELLULAR_ATTACK;
    this._time += dt;

    if (this._phase === 'growing') {
      this._attackTimer -= dt;
      if (this._attackTimer <= 0) {
        this._triggerFailure();
        return;
      }
      this._stepAccum += dt;
      if (this._stepAccum >= C.STEP_RATE) {
        this._stepAccum -= C.STEP_RATE;
        this._step();
      }

    } else if (this._phase === 'successFade') {
      this._fadeTimer += dt;
      // TICK SUCCESS PARTICLES — SMALL SQUARE CELLS FLYING APART
      for (let i = this._successParticles.length - 1; i >= 0; i--) {
        const p = this._successParticles[i];
        p.x    += p.vx * dt;
        p.y    += p.vy * dt;
        p.life -= dt;
        if (p.life <= 0) this._successParticles.splice(i, 1);
      }
      if (this._fadeTimer >= C.SUCCESS_FADE_DURATION) {
        this._phase   = 'idle';
        this.isActive = false;
        this.onAttackEnd?.(true);
      }

    } else if (this._phase === 'collapse') {
      this._collapseTimer += dt;
      for (let i = this._collapseParticles.length - 1; i >= 0; i--) {
        const p = this._collapseParticles[i];
        p.x   += p.vx * dt;
        p.y   += p.vy * dt;
        p.vy  += 120 * dt;
        p.life -= dt;
        if (p.life <= 0) this._collapseParticles.splice(i, 1);
      }
      if (this._collapseParticles.length === 0 && this._collapseTimer > 0.2) {
        this._phase   = 'idle';
        this.isActive = false;
        this.onAttackEnd?.(false);
      }
    }
  }

  draw(ctx) {
    if (!this.isActive) return;
    const C = CONFIG.CELLULAR_ATTACK;

    if (this._phase === 'growing') {
      const doomFrac = 1 - Math.max(0, this._attackTimer / C.ATTACK_DURATION);
      this._drawBackdrop(ctx, doomFrac);
      this._drawCells(ctx, 1.0);

    } else if (this._phase === 'successFade') {
      const t     = this._fadeTimer / C.SUCCESS_FADE_DURATION;
      const alpha = Math.max(0, 1 - t);
      if (alpha > 0.01) {
        ctx.save();
        ctx.globalAlpha = alpha;
        this._drawBackdrop(ctx, 0);
        this._drawCells(ctx, 1 - t); // CELLS SHRINK TO NOTHING ON SUCCESS
        ctx.restore();
      }
      this._drawSuccessParticles(ctx); // SQUARE CELL FRAGMENTS FLY APART

    } else if (this._phase === 'collapse') {
      if (this._collapseTimer < 0.35) {
        const flashAlpha = (1 - this._collapseTimer / 0.35) * 0.85;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = flashAlpha;
        ctx.fillStyle   = '#ffffff';
        ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);
        ctx.restore();
      }
      this._drawCollapseParticles(ctx);
    }
  }

  /** RETURNS INTEGER DAMAGE IF SHIP OVERLAPS A DAMAGING CELL */
  getDamageForShip(shipX, shipY, dt) {
    if (!this.isActive || this._phase !== 'growing') {
      this._damageAccum = 0;
      return 0;
    }
    const C   = CONFIG.CELLULAR_ATTACK;
    const cgx = Math.floor((shipX - this.gridOffX) / this.cellSize);
    const cgy = Math.floor((shipY - this.gridOffY) / this.cellSize);

    // CHECK ±1 NEIGHBOURHOOD (9 CELLS — O(1) EFFECTIVELY)
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const gx = cgx + dx;
        const gy = cgy + dy;
        if (gx < 0 || gy < 0 || gx >= this.cols || gy >= this.rows) continue;
        if (this.grid[gy * this.cols + gx] < C.DAMAGE_AGE) continue;
        const px = this.gridOffX + gx * this.cellSize;
        const py = this.gridOffY + gy * this.cellSize;
        if (shipX >= px && shipX < px + this.cellSize &&
            shipY >= py && shipY < py + this.cellSize) {
          this._damageAccum += C.SHIP_DAMAGE_RATE * dt;
          const dmg = Math.floor(this._damageAccum);
          this._damageAccum -= dmg;
          return dmg;
        }
      }
    }
    this._damageAccum = 0;
    return 0;
  }

  /** TEST PROJECTILE MID-POINT AGAINST BREAK NODES — GENEROUS HIT RADIUS FOR PLAYABILITY */
  checkProjectileHit(seg) {
    if (!this.isActive || this._phase !== 'growing') return { hit: false };
    const mx = (seg.x1 + seg.x2) * 0.5;
    const my = (seg.y1 + seg.y2) * 0.5;
    const r2 = (this.cellSize * 2) * (this.cellSize * 2); // 2-CELL RADIUS

    for (let bi = this._breakNodes.length - 1; bi >= 0; bi--) {
      const { gx, gy } = this._breakNodes[bi];
      const cx = this.gridOffX + gx * this.cellSize + this.cellSize * 0.5;
      const cy = this.gridOffY + gy * this.cellSize + this.cellSize * 0.5;
      const dx = mx - cx;
      const dy = my - cy;
      if (dx * dx + dy * dy < r2) {
        this.grid[gy * this.cols + gx] = 0;
        this._breakNodes.splice(bi, 1);
        this._breakNodesKilled++;
        this._checkWinCondition();
        return { hit: true, sx: cx, sy: cy };
      }
    }
    return { hit: false };
  }

  reset() {
    this.isActive           = false;
    this._phase             = 'idle';
    this._time              = 0;
    this._stepAccum         = 0;
    this._fadeTimer         = 0;
    this._collapseTimer     = 0;
    this._attackTimer       = 0;
    this._breakNodes        = [];
    this._breakNodesKilled  = 0;
    this._damageAccum       = 0;
    this._collapseParticles = [];
    this._successParticles  = [];
    if (this.grid)  this.grid.fill(0);
    if (this._next) this._next.fill(0);
  }

  // ══════════════════════ PRIVATE — GRID INIT ══════════════════════

  _initGrid() {
    const C      = CONFIG.CELLULAR_ATTACK;
    const w      = window.innerWidth;
    const h      = window.innerHeight;
    const isMob  = w < 768;

    this.cellSize = isMob ? C.CELL_SIZE_MOBILE : C.CELL_SIZE_DESKTOP;

    // GRID COVERS A CENTRE PORTION OF THE SCREEN — NOT EDGE TO EDGE
    this.cols = Math.floor(w * C.GRID_COVERAGE_X / this.cellSize);
    this.rows = Math.floor(h * C.GRID_COVERAGE_Y / this.cellSize);

    // CENTRE THE GRID ON SCREEN
    this.gridOffX = Math.round((w - this.cols * this.cellSize) * 0.5);
    this.gridOffY = Math.round((h - this.rows * this.cellSize) * 0.5);

    const size = this.cols * this.rows;
    this.grid  = new Uint8Array(size);
    this._next = new Uint8Array(size);
  }

  // ══════════════════════ PRIVATE — AUTOMATON ══════════════════════

  _buildRuleTables() {
    const C = CONFIG.CELLULAR_ATTACK;
    this._surviveSet = new Uint8Array(9);
    this._birthSet   = new Uint8Array(9);
    for (const n of C.SURVIVE) if (n < 9) this._surviveSet[n] = 1;
    for (const n of C.BIRTH)   if (n < 9) this._birthSet[n]   = 1;
  }

  _seedAt(screenX, screenY) {
    const C  = CONFIG.CELLULAR_ATTACK;
    const sr = C.SEED_RADIUS_CELLS;

    for (let c = 0; c < C.SEED_CLUSTER_COUNT; c++) {
      const angle = Math.random() * Math.PI * 2;
      const dist  = Math.random() * C.SEED_SPREAD_CELLS;
      const ocx   = Math.round((screenX - this.gridOffX) / this.cellSize + Math.cos(angle) * dist);
      const ocy   = Math.round((screenY - this.gridOffY) / this.cellSize + Math.sin(angle) * dist);

      for (let dgy = -sr; dgy <= sr; dgy++) {
        for (let dgx = -sr; dgx <= sr; dgx++) {
          const gx = ocx + dgx;
          const gy = ocy + dgy;
          if (gx < 0 || gy < 0 || gx >= this.cols || gy >= this.rows) continue;
          if (Math.sqrt(dgx * dgx + dgy * dgy) <= sr && Math.random() > 0.05) {
            this.grid[gy * this.cols + gx] = 1;
          }
        }
      }
    }
  }

  _step() {
    const C    = CONFIG.CELLULAR_ATTACK;
    const { cols, rows, grid, _next: next } = this;

    // COLLECT BREAK NODES IN THE SAME PASS — ELIMINATES SECOND FULL GRID SCAN
    const newBreakNodes = [];

    for (let gy = 0; gy < rows; gy++) {
      for (let gx = 0; gx < cols; gx++) {
        const i          = gy * cols + gx;
        const currentAge = grid[i];
        const neighbors  = this._countNeighbors(gx, gy);

        const newAge = currentAge > 0
          ? (this._surviveSet[neighbors] ? Math.min(currentAge + 1, C.MAX_AGE) : 0)
          : (this._birthSet[neighbors] ? 1 : 0);

        next[i] = newAge;

        // CAPTURE BREAK NODES WHILE WE'RE ALREADY HERE — NO EXTRA PASS NEEDED
        if (newAge >= C.BREAK_AGE) newBreakNodes.push({ gx, gy });
      }
    }

    // SWAP BUFFERS — ZERO ALLOCATION PER STEP
    this.grid  = next;
    this._next = grid;
    this._next.fill(0);

    this._breakNodes = newBreakNodes;
    this._checkWinCondition();
  }

  _countNeighbors(gx, gy) {
    // MOORE NEIGHBOURHOOD — ALL 8 SURROUNDING CELLS
    const { cols, rows, grid } = this;
    let count = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = gx + dx;
        const ny = gy + dy;
        if (nx >= 0 && ny >= 0 && nx < cols && ny < rows) {
          if (grid[ny * cols + nx] > 0) count++;
        }
      }
    }
    return count;
  }

  _checkWinCondition() {
    const C = CONFIG.CELLULAR_ATTACK;
    if (this._phase !== 'growing') return;
    if (this._breakNodesKilled >= C.BREAK_NODES_TO_WIN) {
      this._triggerSuccess();
    }
  }

  // ══════════════════════ PRIVATE — PHASE TRANSITIONS ══════════════════════

  _triggerSuccess() {
    if (this._phase !== 'growing') return;
    this._phase      = 'successFade';
    this._fadeTimer  = 0;
    this._didSucceed = true;

    // SPAWN SMALL SQUARE CELL FRAGMENTS FROM ALL ALIVE CELLS — LOOKS LIKE INFECTION SHATTERING
    const C        = CONFIG.CELLULAR_ATTACK;
    const PALETTE  = ['#0091b0', '#892bec', '#cc0099'];
    const alivePts = [];
    for (let i = 0; i < this.grid.length; i++) {
      if (this.grid[i] > 0) alivePts.push(i);
    }
    // SAMPLE UP TO SUCCESS_BURST_COUNT CELLS — SHUFFLE THEN SLICE
    for (let i = alivePts.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = alivePts[i]; alivePts[i] = alivePts[j]; alivePts[j] = tmp;
    }
    const sample = alivePts.slice(0, C.SUCCESS_BURST_COUNT);

    this._successParticles = sample.map(idx => {
      const gx      = idx % this.cols;
      const gy      = Math.floor(idx / this.cols);
      const angle   = Math.random() * Math.PI * 2;
      const speed   = 40 + Math.random() * 140;   // SLOW — DRIFT APART, NOT EXPLODE
      const lifeMax = 0.6 + Math.random() * 0.8;
      return {
        x:       this.gridOffX + gx * this.cellSize + this.cellSize * 0.5,
        y:       this.gridOffY + gy * this.cellSize + this.cellSize * 0.5,
        vx:      Math.cos(angle) * speed,
        vy:      Math.sin(angle) * speed,
        size:    this.cellSize * (0.4 + Math.random() * 0.5), // SMALLER THAN A FULL CELL
        life:    lifeMax,
        lifeMax,
        color:   PALETTE[Math.floor(Math.random() * PALETTE.length)],
      };
    });
  }

  _triggerFailure() {
    if (this._phase !== 'growing') return;
    this._phase         = 'collapse';
    this._collapseTimer = 0;

    const C        = CONFIG.CELLULAR_ATTACK;
    const alivePts = [];
    for (let i = 0; i < this.grid.length; i++) {
      if (this.grid[i] > 0) {
        alivePts.push({
          sx: this.gridOffX + (i % this.cols) * this.cellSize + this.cellSize * 0.5,
          sy: this.gridOffY + Math.floor(i / this.cols) * this.cellSize + this.cellSize * 0.5,
        });
      }
    }

    // FISHER-YATES SHUFFLE THEN SLICE
    for (let i = alivePts.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = alivePts[i]; alivePts[i] = alivePts[j]; alivePts[j] = tmp;
    }
    const sample = alivePts.slice(0, C.COLLAPSE_BURST_COUNT);

    const PALETTE  = ['#0091b0', '#892bec', '#cc0099', '#d20404'];
    const cx = window.innerWidth  * 0.5;
    const cy = window.innerHeight * 0.5;
    this._collapseParticles = sample.map(({ sx, sy }) => {
      const angle   = Math.atan2(sy - cy, sx - cx) + (Math.random() - 0.5) * 0.5;
      const speed   = 180 + Math.random() * 380;
      const lifeMax = 0.55 + Math.random() * 0.5;
      return {
        x: sx, y: sy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: this.cellSize * (0.5 + Math.random() * 1.0), 
        life: lifeMax, lifeMax,
        color: PALETTE[Math.floor(Math.random() * PALETTE.length)],
      };
    });

    this.onCollapseBurst?.(sample.map(({ sx, sy }) => ({ x: sx, y: sy })));
  }

  // ══════════════════════ PRIVATE — DRAW ══════════════════════

  _drawBackdrop(ctx, doomFrac = 0) {
    ctx.save();
    ctx.globalAlpha = 0.30;
    ctx.fillStyle   = '#000814';
    ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);
    // CRIMSON WASH RAMPS IN DURING FINAL 40% OF COUNTDOWN
    const redFrac = Math.max(0, (doomFrac - 0.6) / 0.4);
    if (redFrac > 0.01) {
      ctx.globalAlpha = redFrac * 0.35;
      ctx.fillStyle   = '#d20404';
      ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);
    }
    ctx.restore();
  }

  /**
   * FOUR-PASS BATCHED SQUARE DRAW — ONE shadowBlur SWITCH PER COLOUR TIER
   * scaleFrac: 1.0 DURING PLAY, SHRINKS TOWARD 0 DURING SUCCESS FADE
   */
  _drawCells(ctx, scaleFrac) {
    const C   = CONFIG.CELLULAR_ATTACK;
    const cs  = this.cellSize * scaleFrac;
    const gap = Math.max(1, Math.round(this.cellSize * 0.12)); // GAP BETWEEN CELLS
    const draw = cs - gap;
    if (draw <= 0) return;

    // RE-CENTRE CELLS WHEN SHRINKING ON SUCCESS FADE
    const offX = this.gridOffX + (this.cellSize - cs) * 0.5;
    const offY = this.gridOffY + (this.cellSize - cs) * 0.5;

    // ── PASS 1: HARMLESS — TEAL #0091b0 (age 1 → DAMAGE_AGE-1) ──
    ctx.save();
    ctx.shadowBlur  = C.GLOW_HARMLESS;
    ctx.shadowColor = '#00c8f0';   // LIGHTER VERSION FOR GLOW
    ctx.fillStyle   = '#0091b0';
    for (let i = 0; i < this.grid.length; i++) {
      const age = this.grid[i];
      if (age === 0 || age >= C.DAMAGE_AGE) continue;
      ctx.fillRect(
        offX + (i % this.cols) * this.cellSize,
        offY + Math.floor(i / this.cols) * this.cellSize,
        draw, draw
      );
    }
    ctx.restore();

    // ── PASS 2: DAMAGING — MAGENTA (age DAMAGE_AGE → BREAK_AGE-1) — KEEP AS-IS ──
    ctx.save();
    ctx.shadowBlur  = C.GLOW_DAMAGING;
    ctx.shadowColor = '#ff00cc';
    ctx.fillStyle   = '#cc0099';
    for (let i = 0; i < this.grid.length; i++) {
      const age = this.grid[i];
      if (age < C.DAMAGE_AGE || age >= C.BREAK_AGE) continue;
      ctx.fillRect(
        offX + (i % this.cols) * this.cellSize,
        offY + Math.floor(i / this.cols) * this.cellSize,
        draw, draw
      );
    }
    ctx.restore();

    // ── PASS 3: BREAK NODES — PURPLE #892bec PULSING (age BREAK_AGE → DOOM_AGE-1) ──
    const pulse = 0.72 + 0.28 * Math.sin(this._time * C.BREAK_PULSE_HZ * Math.PI * 2);
    ctx.save();
    ctx.shadowBlur  = C.GLOW_BREAK * pulse;
    ctx.shadowColor = `rgba(160, 80, 255, ${0.55 + pulse * 0.45})`;
    ctx.fillStyle   = '#892bec';
    for (let i = 0; i < this.grid.length; i++) {
      const age = this.grid[i];
      if (age < C.BREAK_AGE || age >= C.DOOM_AGE) continue;
      ctx.fillRect(
        offX + (i % this.cols) * this.cellSize,
        offY + Math.floor(i / this.cols) * this.cellSize,
        draw, draw
      );
    }
    ctx.restore();

    // ── PASS 4: DOOM — RED #d20404 RAPID-PULSING (age >= DOOM_AGE) ──
    const dPulse = 0.6 + 0.4 * Math.sin(this._time * C.DOOM_PULSE_HZ * Math.PI * 2);
    ctx.save();
    ctx.shadowBlur  = C.GLOW_DOOM * dPulse;
    ctx.shadowColor = `rgba(255, 30, 30, ${0.6 + dPulse * 0.4})`;
    ctx.fillStyle   = '#d20404';
    for (let i = 0; i < this.grid.length; i++) {
      if (this.grid[i] < C.DOOM_AGE) continue;
      ctx.fillRect(
        offX + (i % this.cols) * this.cellSize,
        offY + Math.floor(i / this.cols) * this.cellSize,
        draw, draw
      );
    }
    ctx.restore();
  }

  _drawCollapseParticles(ctx) {
    if (this._collapseParticles.length === 0) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter'; // ADDITIVE — FREE GLOW
    for (const p of this._collapseParticles) {
      const t     = 1 - p.life / p.lifeMax;
      const alpha = Math.max(0, 1 - t) * 0.9;
      const size  = p.size * (1 + t * 0.4); // GROW VERY SLIGHTLY AS THEY FLY
      ctx.globalAlpha = alpha;
      ctx.fillStyle   = p.color;
      ctx.fillRect(p.x - size * 0.5, p.y - size * 0.5, size, size);
    }
    ctx.restore();
  }

  _drawSuccessParticles(ctx) {
    if (this._successParticles.length === 0) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of this._successParticles) {
      const t     = 1 - p.life / p.lifeMax;
      const alpha = Math.max(0, 1 - t * 1.4) * 0.8; // FADE OUT FASTER THAN COLLAPSE
      if (alpha <= 0) continue;
      ctx.globalAlpha = alpha;
      ctx.fillStyle   = p.color;
      ctx.fillRect(p.x - p.size * 0.5, p.y - p.size * 0.5, p.size, p.size);
    }
    ctx.restore();
  }
}