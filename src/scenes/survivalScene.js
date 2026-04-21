// Updated 4/20/26 @ 12:30PM
// survivalScene.js
// ~~~~~~~~~~~~~~~~~~~~ IMPORTS ~~~~~~~~~~~~~~~~~~~~
import { CONFIG } from '../utils/config.js';
// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

// ── DIFFICULTY RAMP ───────────────────────────────────────────────────────────
// ALL VALUES LERP LINEARLY FROM _START → _END OVER RAMP_DURATION SECONDS.
// BEYOND RAMP_DURATION, DIFFICULTY IS CAPPED AT MAX — THE GRIND IS PERMANENT.
const RAMP_DURATION = 480; // 8 MINUTES TO REACH PEAK DIFFICULTY

const RAMP = {
  MAX_ENEMIES:    { start: 3,   end: 10  },
  SPAWN_INT_MIN:  { start: 5.0, end: 1.5 }, // SECONDS — MIN SPAWN COOLDOWN
  SPAWN_INT_MAX:  { start: 8.0, end: 2.5 }, // SECONDS — MAX SPAWN COOLDOWN
  LASER_INT_MULT: { start: 1.6, end: 0.7 }, // >1 = SLOWER FIRE, <1 = FASTER
  LASER_DMG_MULT: { start: 0.6, end: 1.4 }, // FRACTION OF CONFIG.ENEMY_LASER.DAMAGE
};

// ENEMY TYPE WEIGHTS — LERP PER-TYPE FROM START → END
// TANK AND FLIMFLAM START RARE, BECOME COMMON AS PRESSURE MOUNTS
// ORDER: BASIC  FAST   ZIGZAG  TANK   FLIMFLAM
const TYPES   = ['BASIC', 'FAST', 'ZIGZAG', 'TANK', 'FLIMFLAM'];
const W_START = [  0.42,   0.33,    0.15,   0.07,     0.03   ];
const W_END   = [  0.18,   0.18,    0.20,   0.24,     0.20   ];

function _lerp(a, b, t) { return a + (b - a) * Math.max(0, Math.min(1, t)); }

function _fmtTime(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = Math.floor(totalSeconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export class SurvivalScene {
  /**
   * @param {object} deps
   * @param {import('../entities/enemies.js').EnemyManager}                       deps.enemyManager
   * @param {import('../utils/audio.js').AudioManager}                            deps.audio
   * @param {import('../entities/singularityBomb.js').SingularityBombManager}     deps.singularityBombManager
   * @param {import('../entities/cosmicPrism.js').CosmicPrismManager}             deps.cosmicPrismManager
   * @param {import('../entities/tesseractFragment.js').TesseractFragmentManager} deps.tesseractManager
   */
  constructor({ enemyManager, audio, singularityBombManager, cosmicPrismManager, tesseractManager }) {
    this.enemyManager           = enemyManager;
    this.audio                  = audio;
    this.singularityBombManager = singularityBombManager ?? null;
    this.cosmicPrismManager     = cosmicPrismManager     ?? null;
    this.tesseractManager       = tesseractManager       ?? null;

    this._active  = false;
    this._elapsed = 0;   // SECONDS SURVIVED THIS RUN

    // ── DOM REFS ──────────────────────────────────────────────────────────────
    this._hudEl        = document.getElementById('survival-hud');
    this._timerEl      = document.getElementById('survival-timer');
    this._overlayEl    = document.getElementById('survival-gameover');
    this._goTimeEl     = document.getElementById('survival-go-time');
    this._goScoreEl    = document.getElementById('survival-go-score');
    this._restartBtn   = document.getElementById('survival-go-restart');
    this._countdownEl  = document.getElementById('survival-countdown');

    // CALLBACK — WIRED IN main.js SO THE RESTART BUTTON FULLY RESETS GAME STATE
    this.onRestart = null;

    this._restartBtn?.addEventListener('click', () => {
      this._hideOverlay();
      this.onRestart?.();
    });

    // console.log('✔ SurvivalScene initialized');
  }

  // ── PUBLIC API ────────────────────────────────────────────────────────────

  /**
   * SHOW 3-2-1-GO! COUNTDOWN OVERLAY, THEN BEGIN THE RUN.
   * GAME LOOP SHOULD ALREADY BE RUNNING SO THE TUNNEL ANIMATES BEHIND IT.
   * RETURNS A PROMISE THAT RESOLVES AFTER start() IS CALLED.
   */
  showCountdown() {
    return new Promise(resolve => {
      const el = this._countdownEl;
      if (!el) { this.start(); resolve(); return; }

      const STEPS     = ['3', '2', '1', 'GO!'];
      const STEP_MS   = 1000;   // DURATION FOR DIGITS
      const GO_MS     = 700;    // SHORTER HOLD FOR "GO!"
      let   i         = 0;

      el.style.display = 'flex';

      const tick = () => {
        if (i >= STEPS.length) {
          el.style.display = 'none';
          this.start();
          resolve();
          return;
        }
        const isGo = i === STEPS.length - 1;
        el.textContent = STEPS[i++];
        // CHANGE COLOR ON GO!
        el.style.color = isGo ? '#58e84c' : '#00ffff';
        el.style.textShadow = isGo
          ? '0 0 30px #58e84c, 0 0 80px rgba(88,232,76,0.4)'
          : '0 0 30px #00ffff, 0 0 80px rgba(0,255,255,0.4)';
        el.classList.remove('countdown-pop');
        void el.offsetWidth; // FORCE REFLOW SO ANIMATION RESTARTS
        el.classList.add('countdown-pop');
        setTimeout(tick, isGo ? GO_MS : STEP_MS);
      };

      tick();
    });
  }

  /** BEGIN A NEW SURVIVAL RUN */
  start() {
    this._active  = true;
    this._elapsed = 0;

    this._applyDifficulty(0);  // APPLY INITIAL (EASY) DIFFICULTY IMMEDIATELY
    this.enemyManager.setSpawningEnabled(true);

    // POWER-UPS SPAWN AT THEIR CONFIG-DEFAULT RATES — UNCHANGED FROM REGULAR GAMEPLAY
    this.cosmicPrismManager?.start();
    this.tesseractManager?.start();
    if (this.singularityBombManager) {
      this.singularityBombManager.start();
      this.singularityBombManager.deployEnabled = true;
    }

    this._showHUD();
    this._updateTimerHUD(); // RENDER 0:00 IMMEDIATELY — DON'T WAIT FOR FIRST SECOND
  }

  /** CALLED EVERY FRAME WHILE SURVIVAL IS THE ACTIVE MODE */
  update(dt) {
    if (!this._active) return;
    this._elapsed += dt;
    this._applyDifficulty(this._elapsed);
    this._updateTimerHUD();
  }

  /**
   * CALLED WHEN THE PLAYER'S SINGLE LIFE RUNS OUT.
   * FREEZES THE SCENE AND SHOWS THE RESULTS SCREEN.
   * @param {number} finalScore
   */
  showResults(finalScore) {
    this._active = false;
    this.enemyManager.setSpawningEnabled(false);
    if (this.singularityBombManager) this.singularityBombManager.deployEnabled = false;
    this._hideHUD();
    this._showOverlay(finalScore);
  }

  /** HARD RESET — CALLED BEFORE start() ON EACH NEW RUN */
  reset() {
    this._active  = false;
    this._elapsed = 0;

    // RESTORE ENEMY MANAGER TO NEUTRAL — REGULAR GAMEPLAY DEFAULTS WILL APPLY IF NEEDED
    this.enemyManager.setSpawningEnabled(false);
    this.enemyManager.setMaxCount(0);
    this.enemyManager._laserIntervalMult = 1.0;
    this.enemyManager._laserDamageMult   = 1.0;
    this.enemyManager._spawnIntervalMin  = null;
    this.enemyManager._spawnIntervalMax  = null;

    // POWER-UPS
    this.cosmicPrismManager?.reset();
    this.tesseractManager?.reset();
    this.singularityBombManager?.reset();

    this._hideHUD();
    this._hideOverlay();
  }

  isActive()   { return this._active;  }
  getElapsed() { return this._elapsed; }

  // ── PRIVATE — DIFFICULTY RAMP ─────────────────────────────────────────────

  _applyDifficulty(elapsed) {
    const t = Math.min(1, elapsed / RAMP_DURATION);

    this.enemyManager.setMaxCount(
      Math.round(_lerp(RAMP.MAX_ENEMIES.start, RAMP.MAX_ENEMIES.end, t))
    );

    // DIRECTLY SET OVERRIDE PROPERTIES ON ENEMY MANAGER — NULL = USE CONFIG DEFAULTS
    this.enemyManager._spawnIntervalMin  = _lerp(RAMP.SPAWN_INT_MIN.start,  RAMP.SPAWN_INT_MIN.end,  t);
    this.enemyManager._spawnIntervalMax  = _lerp(RAMP.SPAWN_INT_MAX.start,  RAMP.SPAWN_INT_MAX.end,  t);
    this.enemyManager._laserIntervalMult = _lerp(RAMP.LASER_INT_MULT.start, RAMP.LASER_INT_MULT.end, t);
    this.enemyManager._laserDamageMult   = _lerp(RAMP.LASER_DMG_MULT.start, RAMP.LASER_DMG_MULT.end, t);

    // LERP WEIGHTS THEN NORMALIZE — GUARANTEES THEY SUM TO EXACTLY 1.0
    const raw   = W_START.map((s, i) => _lerp(s, W_END[i], t));
    const total = raw.reduce((a, b) => a + b, 0);
    this.enemyManager.setAllowedTypes(TYPES, raw.map(w => w / total));
  }

  // ── PRIVATE — HUD ─────────────────────────────────────────────────────────

  _showHUD() { if (this._hudEl) this._hudEl.style.display = 'flex'; }
  _hideHUD() { if (this._hudEl) this._hudEl.style.display = 'none'; }

  _updateTimerHUD() {
    if (this._timerEl) this._timerEl.textContent = _fmtTime(this._elapsed);
  }

  // ── PRIVATE — RESULTS OVERLAY ─────────────────────────────────────────────

  _showOverlay(score) {
    if (!this._overlayEl) return;
    if (this._goTimeEl)  this._goTimeEl.textContent  = _fmtTime(this._elapsed);
    if (this._goScoreEl) this._goScoreEl.textContent = score.toLocaleString();
    this._overlayEl.classList.add('active');
  }

  _hideOverlay() {
    this._overlayEl?.classList.remove('active');
  }
}