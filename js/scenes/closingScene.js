// Updated 3/28/26 @ 1:30AM
// scenes/closingScene.js
import { ImageLoader } from '../utils/imageLoader.js';

// ── CLOSING SCENE TIMING ──────────────────────────────────────────────────────
const CREDITS = [
  { role: null,   name: 'WORMHOLES'               },
  { role: null,   name: 'ALL THE WAY DOWN'        },
  { role: null,   name: null                      },
  { role: 'Concept · Art · Music · SFX',  name: 'MK'      },
  { role: 'Chief Space Tunnel Officer',   name: 'Claude'   },
  { role: 'Director, Worm Physics Lab',   name: 'ChatGPT'  },
  { role: 'Head of Chaos Department',     name: 'Grok'     },
];

const BURST_FLASH_DELAY     = 0.7;
const BURST_FLASH_DURATION  = 15;
const WARP_SPEED_START      = 2;
const WARP_SPEED_END        = 7;
const WARP_DECEL_DURATION   = 3.5;
const VICTORY_FADE_START    = 18;
const VICTORY_FADE_END      = 25;
const CREDITS_FADE_START    = 27;
const CREDITS_FADE_OUT      = 47;   // CREDITS CONTAINER FADES OUT
const CREDITS_LINE_INTERVAL = 2.5;  // 7 LINES × 2.5s
const CREDITS_FADE_EACH     = 2;
const BACK_TO_MENU_DELAY    = 50;

// ── SPACE WHALE  ────────────────────────────────────────────────────────
const WHALE_APPEAR_TIME   = 0.1;    // SECONDS INTO CLOSING SCENE BEFORE WHALE FADES IN
const WHALE_FADE_IN_SECS  = 1.5;    // FADE-IN DURATION
const WHALE_SPEED         = 45;     // px/s — CROSSES 1920PX SCREEN IN ~22s
const WHALE_BASE_Y_FRAC   = 0.25;   // VERTICAL POSITION — BELOW CENTERED CREDITS TEXT
const WHALE_BOB_AMP       = 8;      // px — VERTICAL SINE DRIFT AMPLITUDE
const WHALE_BOB_FREQ      = 0.000133; // Hz (cycles/ms) — period = 1/freq ms // 0.00075 → ~1333ms | 0.0015 → ~667ms | 0.0005 → ~2000ms
const WHALE_FRAME_COUNT   = 12;     // FRAMES IN spaceWhale.png SPRITE SHEET
const WHALE_TAIL_SEGS     = 12;     // TAIL SEGMENT COUNT
const WHALE_SEG_LEN       = 8;      // px BETWEEN TAIL SEGMENTS
const WHALE_PREWARM_STEPS = 220;    // PHYSICS STEPS RUN BEFORE FIRST FRAME (SETTLES TAIL)
const WHALE_TRAIL_MAX     = 40;     // TRAIL SNAPSHOTS — AT 60fps ≈ 0.83s HISTORY, ~1.4px APART

const WHALE_TWO_PI = 2 * Math.PI;   // CACHED — AVOIDS RECOMPUTING EVERY FRAME


class SpaceWhale {
  constructor() {
    this._active     = false;
    this._alpha      = 0;
    this._x          = 0;
    this._y          = 0;
    this._baseY      = 0;
    this._timeMs     = 0;     // MILLISECOND CLOCK — DRIVES BOB, TAIL WAVE, AND FRAME PHASE
    this._frameIndex = 0;     // COMPUTED FROM PHASE EACH FRAME — NO LONGER ADVANCED BY TIMER
    this._fw         = 0;     // SPRITE FRAME WIDTH (CACHED)
    this._fh         = 0;     // SPRITE FRAME HEIGHT (CACHED)
    this._tailAngle  = 0;     // SMOOTHED FLUKE ROTATION (RAD)

    // TAIL SEGMENT POSITIONS — INDEX 0 = BASE (BODY ATTACHMENT), LAST = FLUKE TIP
    this._tail = Array.from({ length: WHALE_TAIL_SEGS }, () => ({ x: 0, y: 0 }));

    // TIME-BASED GHOST TRAIL — ONE SNAPSHOT PER update() CALL [{x, y, frame, tailAngle, tailXY: Float32Array(SEGS*2)}]
    this._trail = [];
  }

  // ── PUBLIC: START ───────────────────────────────────────────────────────────
  start(canvasW, canvasH) {
    const sprite = ImageLoader.get('spaceWhale');
    this._fw = sprite ? sprite.width / WHALE_FRAME_COUNT : 120;
    this._fh = sprite ? sprite.height : 60;

    this._alpha      = 0;
    this._baseY      = canvasH * WHALE_BASE_Y_FRAC;
    this._x          = canvasW * 2;
    this._y          = this._baseY;
    this._timeMs     = 0;
    this._frameIndex = 0;
    this._tailAngle  = 0;
    this._trail      = [];
    this._active     = true;

    // SEED SEGMENTS AT THEIR EQUILIBRIUM X-POSITIONS SO THEY DON'T SNAP FROM (0,0)
    const tx = this._x + this._fw * 0.83;
    const ty = this._y + this._fh * 0.445;
    for (let i = 0; i < WHALE_TAIL_SEGS; i++) {
      this._tail[i].x = tx + i * WHALE_SEG_LEN;
      this._tail[i].y = ty;
    }

    // PRE-WARM PHYSICS — ADVANCES _timeMs SO WAVE PHASE IS CONTINUOUS FROM T=0, AND RUNS THE SPRING PHYSICS TO SETTLE ALL SEGMENTS INTO THEIR NATURAL WAVE.
    for (let i = 0; i < WHALE_PREWARM_STEPS; i++) {
      this._timeMs += 16;
      this._stepTailPhysics(16);
    }
    // SYNC FRAME INDEX AFTER PREWARM
    this._frameIndex = this._computeFrameIndex();
  }

  // ── PUBLIC: UPDATE ──────────────────────────────────────────────────────────
  /** @param {number} dt  SECONDS */
  update(dt, sceneFadeAlpha) {
    if (!this._active) return;

    const dtMs    = dt * 1000;
    this._timeMs += dtMs;

    // FADE IN RELATIVE TO sceneFadeAlpha (SCENE OVERALL OPACITY AFTER FLASH)
    this._alpha = Math.min(1, this._alpha + dt / WHALE_FADE_IN_SECS) * sceneFadeAlpha;

    // ── BOB — sin(2π × freq × time) GIVES PERIOD = 1/freq ms ──────────────────
    this._x -= WHALE_SPEED * dt;
    this._y  = this._baseY + Math.sin(WHALE_TWO_PI * WHALE_BOB_FREQ * this._timeMs) * WHALE_BOB_AMP;

    // WRAP AROUND — CLEAR TRAIL AND RESET TAIL SO YOU DON'T GET A CROSS-SCREEN FLASH
    if (this._x < -(this._fw + 80)) {
      this._x   = window.innerWidth + 80;
      this._trail = [];

      // REPOSITION TAIL SEGMENTS IMMEDIATELY TO NEW LOCATION
      const tx = this._x + this._fw * 0.835;
      const ty = this._y + this._fh * 0.445;
      for (let i = 0; i < WHALE_TAIL_SEGS; i++) {
        this._tail[i].x = tx + i * WHALE_SEG_LEN;
        this._tail[i].y = ty;
      }
      this._tailAngle = 0;
    }

    // ── PHASE-DRIVEN FRAME INDEX — PHASE GOES 0→1 OVER EXACTLYY ONE BOB──────────
    this._frameIndex = this._computeFrameIndex();

    // TAIL PHYSICS
    this._stepTailPhysics(dtMs);

    // CAPTURE TRAIL SNAPSHOT THIS FRAME
    const tailXY = new Float32Array(WHALE_TAIL_SEGS * 2);
    for (let i = 0; i < WHALE_TAIL_SEGS; i++) {
      tailXY[i * 2]     = this._tail[i].x;
      tailXY[i * 2 + 1] = this._tail[i].y;
    }
    this._trail.unshift({
      x: this._x,
      y: this._y,
      frame: this._frameIndex,
      tailAngle: this._tailAngle,
      tailXY,
    });
    if (this._trail.length > WHALE_TRAIL_MAX) this._trail.length = WHALE_TRAIL_MAX;
  }

  // ── PUBLIC: DRAW ────────────────────────────────────────────────────────────
  /** @param {CanvasRenderingContext2D} ctx */
  draw(ctx) {
    if (!this._active || this._alpha < 0.005) return;

    const whale = ImageLoader.get('spaceWhale');
    const fluke = ImageLoader.get('whaleTail');
    if (!whale) return;

    const fw = this._fw;
    const fh = this._fh;
    const n  = this._trail.length;

    ctx.save();

    // ── GHOST TRAILS (OLDEST → NEWEST SO NEWEST RENDERS ON TOP)
    ctx.globalCompositeOperation = 'lighter';

    for (let i = n - 1; i >= 0; i--) {
      const g = this._trail[i];
      const t = i / Math.max(n - 1, 1);
      const a = Math.pow(1 - t, 2.4) * 0.36 * this._alpha;
      if (a < 0.004) continue;

      const hue = (this._timeMs * 0.001 + (n - 1 - i) * 7) % 360;

      // ── GHOST TAIL SEGMENTS ──────────────────────────────────────────────
      const xy = g.tailXY;
      if (xy) {
        ctx.lineCap = 'round';
        for (let j = 0; j < WHALE_TAIL_SEGS - 1; j++) {
          const x0 = xy[j * 2],   y0 = xy[j * 2 + 1];
          const x1 = xy[(j+1)*2], y1 = xy[(j+1)*2 + 1];
          ctx.beginPath();
          ctx.moveTo(x0, y0);
          ctx.lineTo(x1, y1);
          ctx.strokeStyle = `hsla(${hue}, 100%, 65%, ${a * 1.2})`;
          ctx.lineWidth   = Math.max(0.5, (45 - j * 3) * a * 1.6);
          ctx.stroke();
        }
      }

      // ── GHOST FLUKE ──────────────────────────────────────────────────────
      if (fluke && xy) {
        const lx = xy[(WHALE_TAIL_SEGS - 1) * 2];
        const ly = xy[(WHALE_TAIL_SEGS - 1) * 2 + 1];
        ctx.save();
        ctx.translate(lx, ly);
        ctx.rotate(g.tailAngle);
        ctx.globalAlpha = a;
        ctx.drawImage(fluke, -8, -20, 45, 45);
        ctx.globalCompositeOperation = 'source-atop';
        ctx.globalAlpha = 1;
        ctx.fillStyle   = `hsla(${hue}, 100%, 65%, ${a})`;
        ctx.fillRect(-8, -20, 45, 45);
        ctx.restore();
      }

      // ── GHOST BODY ───────────────────────────────────────────────────────
      ctx.save();
      ctx.globalAlpha = a;
      ctx.drawImage(whale, g.frame * fw, 0, fw, fh, g.x, g.y, fw, fh);
      ctx.globalCompositeOperation = 'source-atop';
      ctx.globalAlpha = 1;
      ctx.fillStyle   = `hsla(${hue}, 100%, 65%, ${a})`;
      ctx.fillRect(g.x, g.y, fw, fh);
      ctx.restore();
    }

    // RESET COMPOSITE BEFORE DRAWING THE SOLID WHALE
    ctx.globalCompositeOperation = 'source-over';
    ctx.shadowBlur = 0;

    // ── MAIN TAIL ─────────────────────────────────────────────────────────────
    ctx.lineCap = 'round';
    for (let i = 0; i < WHALE_TAIL_SEGS - 1; i++) {
      ctx.beginPath();
      ctx.moveTo(this._tail[i].x, this._tail[i].y);
      ctx.lineTo(this._tail[i + 1].x, this._tail[i + 1].y);
      ctx.shadowColor  = 'rgba(95,0,209,0.5)';
      ctx.shadowBlur   = 24;
      ctx.lineWidth    = Math.max(1, 44.5 - i * 3);
      ctx.strokeStyle  = `rgba(95,0,209,${0.7 * this._alpha})`;
      ctx.stroke();
    }

    // ── MAIN FLUKE ────────────────────────────────────────────────────────────
    if (fluke) {
      const last = this._tail[WHALE_TAIL_SEGS - 1];
      ctx.save();
      ctx.globalAlpha = this._alpha;
      ctx.shadowBlur  = 2;
      ctx.translate(last.x, last.y);
      ctx.rotate(this._tailAngle);
      ctx.drawImage(fluke, -8, -20, 45, 45);
      ctx.restore();
    }

    // ── BODY — PREV FRAME GHOSTED FOR MOTION BLUR, THEN CURRENT FRAME ─────────
    ctx.shadowBlur = 0;
    const prevFrame = (this._frameIndex - 1 + WHALE_FRAME_COUNT) % WHALE_FRAME_COUNT;
    ctx.globalAlpha = this._alpha * 0.4;
    ctx.drawImage(whale, prevFrame * fw, 0, fw, fh, this._x, this._y, fw, fh);
    ctx.globalAlpha = this._alpha * 0.95;
    ctx.drawImage(whale, this._frameIndex * fw, 0, fw, fh, this._x, this._y, fw, fh);

    ctx.restore();
  }

  // ── PRIVATE: PHASE → FRAME INDEX ───────────────────────────────────────────
  // phase = 0→1 over one full bob cycle. frame 0 = bottom of bob (phase 0.75 in a sine wave,
  // since sin bottoms out at -π/2 = 0.75 of a full cycle).
  // If you want frame 0 at the TOP of the bob instead, change the offset to 0.25.
  _computeFrameIndex() {
    // SHIFT PHASE SO FRAME 0 ALIGNS WITH THE BOTTOM OF THE BOB
    // sin bottoms at t where 2π·f·t = -π/2, i.e. phase = 0.75
    // Subtract 0.75 and wrap with % 1 to put frame 0 at the trough
    const rawPhase    = (this._timeMs * WHALE_BOB_FREQ) % 1;
    const shiftedPhase = (rawPhase + 0.25) % 1; // +0.25 shifts frame 0 to trough
    return Math.floor(shiftedPhase * WHALE_FRAME_COUNT);
  }

  // ── PRIVATE: TAIL PHYSICS ───────────────────────────────────────────────────
  _stepTailPhysics(dtMs) {
    const tx = this._x + this._fw * 0.82;
    const ty = this._y + this._fh * 0.445;

    // BASE (SEGMENT 0) IS PINNED TO THE BODY ATTACHMENT POINT
    this._tail[0].x = tx;
    this._tail[0].y = ty;

    for (let i = 1; i < WHALE_TAIL_SEGS; i++) {
      const progress = i / (WHALE_TAIL_SEGS - 1);   // 0=base, 1=tip
      const amp      = WHALE_BOB_AMP * 0.15 * (1 + progress * 9.0); // TIP WAVES MORE
      // TAIL PHYSICS USES THE SAME 2π FORMULA AS THE BOB
      const phase    = WHALE_TWO_PI * WHALE_BOB_FREQ * this._timeMs - i * 0.3;

      const targetX = tx + i * WHALE_SEG_LEN;
      const targetY = ty + Math.sin(phase) * amp;

      const dtScale = Math.min(3, dtMs / 16);
      const kX = Math.min(1, 0.20 * dtScale);
      const kY = Math.min(1, (0.005 + progress * 0.065) * dtScale);

      this._tail[i].x += (targetX - this._tail[i].x) * kX;
      this._tail[i].y += (targetY - this._tail[i].y) * kY;
    }

    // FLUKE ANGLE — SMOOTHED FROM DIRECTION OF FINAL SEGMENTS
    const tipA = this._tail[WHALE_TAIL_SEGS - 5];
    const tipB = this._tail[WHALE_TAIL_SEGS - 1];
    const raw  = Math.atan2(tipB.y - tipA.y, tipB.x - tipA.x);
    this._tailAngle = this._tailAngle * 0.9 + raw * 0.1;
  }
}

// ── CLOSING SCENE ─────────────────────────────────────────────────────────────
export class ClosingScene {

  /**
   * @param {import('../visuals/starfieldScene.js').StarfieldScene} starfield
   * @param {import('../visuals/tunnel.js').Tunnel}                 tunnel
   * @param {import('../utils/audio.js').AudioManager}              audio
   * @param {object|null} singularityBombManager                    optional — disabled on close
   */
  constructor(starfield, tunnel, audio, singularityBombManager = null) {
    this._starfield              = starfield;
    this._tunnel                 = tunnel;
    this._audio                  = audio;
    this._singularityBombManager = singularityBombManager;

    this._active     = false;
    this._elapsed    = 0;
    this._flashAlpha  = 0;
    this._flashActive = false;

    // DOM REFS
    this._creditsEl       = document.getElementById('closing-credits');
    this._creditLines     = [];
    this._victoryStarted  = false;
    this._creditsStarted  = false;
    this._creditsHidden   = false;
    this._linesRevealed   = 0;
    this._menuBtnShown    = false;
    this._menuBtnEl       = null;

    // WHALE
    this._whale       = new SpaceWhale();
    this._whaleStarted = false;

    /** @type {Function|null} — called when player clicks "BACK TO MENU" */
    this.onBackToMenu = null;

    console.log('✔ ClosingScene initialized');
  }

  // ── PUBLIC API ──────────────────────────────────────────────────────────────

  isActive() { return this._active; }

  start(finalScore = 0) {
    if (this._active) return;
    this._active     = true;
    this._elapsed    = 0;
    this._finalScore = finalScore;

    this._flashAlpha   = 0;
    this._flashActive  = false;
    this._flashPending = true;

    this._starfield.speed   = WARP_SPEED_START;
    this._starfield.opacity = 0;
    this._starfield.start();

    this._creditsStarted = false;
    this._creditsHidden  = false;
    this._linesRevealed  = 0;
    this._menuBtnShown   = false;
    this._whaleStarted   = false;
    this._buildCreditLines();

    this._audio?.stopMusic();
    setTimeout(() => this._audio?.startCreditsMusic(), 6800);

    if (this._singularityBombManager) this._singularityBombManager.deployEnabled = false;

    console.log('★ ClosingScene started');
  }

  /**
   * CALLED EVERY FRAME FROM MAIN GAME LOOP
   * @param {number} dt  SECONDS
   */
  update(dt) {
    if (!this._active) return;

    this._elapsed += dt;

    // ── BURST FLASH DELAY + FADE ──────────────────────────────────────────────
    if (this._flashPending && this._elapsed >= BURST_FLASH_DELAY) {
      this._flashPending = false;
      this._flashAlpha   = 1.0;
      this._flashActive  = true;
    }
    if (this._flashActive) {
      this._flashAlpha -= dt / BURST_FLASH_DURATION;
      if (this._flashAlpha <= 0) {
        this._flashAlpha  = 0;
        this._flashActive = false;
      }
    }

    // ── STARFIELD ─────────────────────────────────────────────────────────────
    const warpT = Math.min(this._elapsed / WARP_DECEL_DURATION, 1);
    this._starfield.speed = WARP_SPEED_START + (WARP_SPEED_END - WARP_SPEED_START) * easeOut(warpT);

    // STARFIELD OPACITY TRACKS THE FLASH FADE (STARS RISE AS FLASH FALLS)
    this._starfield.opacity = Math.max(0, Math.min(
      (this._elapsed - BURST_FLASH_DELAY) / BURST_FLASH_DURATION, 1
    ));
    this._starfield.update(dt);

    // ── SPACE WHALE — APPEARS WHEN WARP HAS SETTLED AT WHALE_APPEAR_TIME ──────
    if (!this._whaleStarted && this._elapsed >= WHALE_APPEAR_TIME) {
      this._whaleStarted = true;
      this._whale.start(window.innerWidth, window.innerHeight);
    }
    if (this._whaleStarted) {
      // PASS CURRENT STARFIELD OPACITY AS SCENE FADE MULTIPLIER SO WHALE AND STARS FADE IN TOGETHER
      this._whale.update(dt, this._starfield.opacity);
    }

    // ── VICTORY TEXT ──────────────────────────────────────────────────────────
    if (!this._victoryStarted && this._elapsed >= VICTORY_FADE_START) {
      this._victoryStarted = true;
      this._showVictoryText();
    }
    if (this._victoryStarted && this._elapsed >= VICTORY_FADE_END) {
      document.getElementById('closing-victory')?.classList.remove('visible');
    }

    // ── CREDITS ───────────────────────────────────────────────────────────────
    if (!this._creditsStarted && this._elapsed >= CREDITS_FADE_START) {
      this._creditsStarted = true;
      this._creditsEl?.classList.add('visible');
      this._revealNextLine();
    }

    if (!this._creditsHidden && this._elapsed >= CREDITS_FADE_OUT) {
      this._creditsHidden = true;
      this._creditsEl?.classList.remove('visible');
    }

    if (!this._menuBtnShown && this._elapsed >= BACK_TO_MENU_DELAY) {
      this._menuBtnShown = true;
      this._showMenuButton();
    }
  }

  /**
   * DRAWS THE SPACE WHALE ON THE 2D GAME CANVAS.
   * CALL THIS FROM main.js RIGHT BEFORE renderFlash().
   * @param {CanvasRenderingContext2D} ctx
   */
  renderWhale(ctx) {
    if (!this._active || !this._whaleStarted) return;
    this._whale.draw(ctx);
  }

  /**
   * DRAWS THE BURST FLASH OVERLAY ON THE 2D GAME CANVAS.
   * @param {CanvasRenderingContext2D} ctx
   */
  renderFlash(ctx) {
    if (!this._active || this._flashAlpha <= 0) return;
    ctx.save();
    ctx.globalAlpha = this._flashAlpha;
    ctx.fillStyle   = '#dac1f8';
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.restore();
  }

  shouldRenderStarfield() { return this._active; }

  get shouldHideTunnel() { return this._active && !this._flashPending; }

  // ── PRIVATE ─────────────────────────────────────────────────────────────────

  _showVictoryText() {
    const el = document.getElementById('closing-victory');
    if (!el) return;
    el.querySelector('#victory-score').textContent =
      'SCORE: ' + this._finalScore.toLocaleString();
    el.classList.add('visible');
  }

  _buildCreditLines() {
    if (!this._creditsEl) return;
    this._creditsEl.innerHTML = '';
    this._creditsEl.classList.remove('visible');
    this._creditLines = [];

    for (const entry of CREDITS) {
      const lineEl = document.createElement('div');

      if (!entry.role && !entry.name) {
        lineEl.className = 'credit-spacer';
      } else if (!entry.role) {
        lineEl.className   = 'credit-title-line';
        lineEl.textContent = entry.name;
      } else {
        lineEl.className = 'credit-entry';
        const roleEl = document.createElement('span');
        roleEl.className   = 'credit-role';
        roleEl.textContent = entry.role;
        const nameEl = document.createElement('span');
        nameEl.className   = 'credit-name';
        nameEl.textContent = entry.name;
        lineEl.appendChild(roleEl);
        lineEl.appendChild(nameEl);
      }

      lineEl.classList.add('credit-hidden');
      this._creditsEl.appendChild(lineEl);
      this._creditLines.push(lineEl);
    }
  }

  _revealNextLine() {
    if (this._linesRevealed >= this._creditLines.length) return;
    const el = this._creditLines[this._linesRevealed];
    el.classList.remove('credit-hidden');
    el.classList.add('credit-visible');
    this._linesRevealed++;
    if (this._linesRevealed < this._creditLines.length) {
      setTimeout(() => this._revealNextLine(), CREDITS_LINE_INTERVAL * 1000);
    }
  }

  _showMenuButton() {
    this._menuBtnEl?.remove();
    const btn = document.createElement('button');
    btn.id          = 'back-to-menu-btn';
    btn.textContent = 'BACK TO MENU';
    btn.classList.add('credit-hidden');
    btn.addEventListener('click', () => { this.onBackToMenu?.(); });
    document.body.appendChild(btn);
    this._menuBtnEl = btn;
    requestAnimationFrame(() => {
      btn.classList.remove('credit-hidden');
      btn.classList.add('credit-visible');
    });
  }
}

function easeOut(t) {
  return 1 - Math.pow(1 - t, 3);
}