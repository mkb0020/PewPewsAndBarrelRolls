// Updated 4/21/26 @ 12:30pm
// gameplay.js
// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ IMPORTS ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
import { CONFIG }          from '../utils/config.js';
import { WaveWormManager } from '../entities/waveWorm.js';
// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

// ── SPECIAL ATTACK GLOBAL WINDOW ─────────────────────────────────────────────────
// AFTER ANY SPECIAL FIRES, ALL OTHER SPECIALS ARE BLOCKED FOR THIS MANY MS.
// INDEXED BY WORM KILLS ACHIEVED SO FAR THIS WAVE (0 = WAVE START, 1 = AFTER 1ST KILL…).
// THE LAST ENTRY PERSISTS FOR ANY REMAINING KILLS.
//
// HIGH VALUE  = ATTACKS STAY SEPARATED (NO OVERLAP)
// LOW VALUE   = ATTACKS CAN FIRE CLOSE TOGETHER (CHAOS)
// 0           = NO INTER-SPECIAL GATE AT ALL (FULL OVERLAP POSSIBLE)
//
// SPECIAL DURATIONS FOR REFERENCE:
//   FRACTAL CASCADE: ~4S TOTAL    SLIME ATTACK: ~9S    OCULAR PRISM: ~7.6S
//   → WINDOW >9S  = HARD SEPARATION (NEVER OVERLAP)
//   → WINDOW ~4–8S = 2 CAN OVERLAP (ONE ENDS BEFORE NEXT ONE BLOCKED)
//   → WINDOW 0     = ALL 3 CAN FIRE SIMULTANEOUSLY

export const WAVE_CONFIGS = [
  { // WAVE 1 — GLIP GLOP ONLY (JELLYFISH) — TUTORIAL PRESSURE
    types:          ['BASIC'],
    weights:        [1.00],
    maxEnemies:     4,
    // NO SPECIALS THIS WAVE — WINDOWS ARE MOOT BUT KEPT FOR CONSISTENCY
    specialWindows: [0, 0, 0, 0],   // 3 KILLS REQUIRED → INDICES  0–2 
  },
  { // WAVE 2 — + ZIP ZAP  |  FRACTAL CASCADE ONLY
    // BASIC HEAVY — KEEP ZIP ZAP RARE SO THE NEW FRACTAL MECHANIC IS LEARNABLE
    types:          ['BASIC', 'ZIGZAG'],
    weights:        [0.65,    0.35],
    maxEnemies:     5,
    // FRACTAL STARTS RARE. BY 3RD KILL IT'S FREQUENT.
    specialWindows: [22000, 14000, 7000, 3000],   // 4 KILLS → INDICES 0–3
  },
  { // WAVE 3 — + GLORK / TANK
    types:          ['BASIC', 'ZIGZAG', 'TANK'],
    weights:        [0.40,    0.40,     0.20],
    maxEnemies:     6,
    specialWindows: [18000, 12000, 6000, 2000],   // 4 KILLS → INDICES 0–3
  },
  { // WAVE 4 — + PHIL  |  FAST BECOMES DOMINANT 
    types:          ['BASIC', 'ZIGZAG', 'TANK', 'FAST'],
    weights:        [0.30,    0.20,     0.20,   0.30],
    maxEnemies:     7,
    // GLORK-HEAVY. TWO SPECIALS (FRACTAL + SLIME) — START SEPARATED, CONVERGE.
    specialWindows: [20000, 14000, 8000, 3000, 0],   // 5 KILLS → INDICES 0–4
  },
  { // WAVE 5 — + FLIM FLAM  |  CHAOS PEAK
    types:          ['BASIC', 'ZIGZAG', 'FAST', 'TANK', 'FLIMFLAM'],
    weights:        [0.25,    0.15,     0.20,   0.20,   0.20],
    maxEnemies:     8,
    // STARTS WITH ZERO OVERLAP POSSIBLE. BY KILL 4: FULL THREE-WAY CHAOS.
    specialWindows: [30000, 20000, 8000, 2000, 0],   // 5 KILLS → INDICES 0–4
  },
];

const STATE = {
  IDLE:          'IDLE',          // NOT STARTED YET
  WAVE_ACTIVE:   'WAVE_ACTIVE',
  TRANSITIONING: 'TRANSITIONING', // KILL TARGET MET / RISER PLAYS / ENEMIES DRAIN OUT
  COMPLETE:      'COMPLETE',      // ALL 5 WAVES COMPLETE
};

export class GameplayScene {
  constructor({ enemyManager, waveWormManager, scoreManager, audio, singularityBombManager = null }) {
    this.enemyManager           = enemyManager;
    this.waveWormManager        = waveWormManager;
    this.scoreManager           = scoreManager;
    this.audio                  = audio;
    this.singularityBombManager = singularityBombManager;

    this.state           = STATE.IDLE;
    this.waveIndex       = 0;       // 0–4, CURRENT WAVE
    this.transitionTimer = 0;       // COUNTDOWN DURING TRANSITIONING

    // SPECIAL WINDOW STATE — TRACKS KILLS THIS WAVE TO SCALE THE INTER-SPECIAL COOLDOWN
    this._wormKillsThisWave   = 0;
    this._currentSpecialWindows = null; // REFERENCE TO ACTIVE WAVE'S specialWindows ARRAY

    //  CALLBACKS
    this.onGooHit           = null;
    this.onWormKill         = null;
    this.onWaveStart        = null;
    this.onWaveCleared      = null;
    this.onAllWavesComplete = null;
    this.onCheckpoint       = null;

    this.waveWormManager.onKill = (kills, required) => {
      this._wormKillsThisWave = kills;
      this._applySpecialWindow(kills);   // TIGHTEN WINDOW ON EACH KILL
      this.onWormKill?.(kills, required);
    };
    this.waveWormManager.onWaveCleared = () => this._onWaveCleared();
    this.waveWormManager.onGooHit      = () => this.onGooHit?.();

    // console.log('✔ GameplayScene initialized');
  }

  //  PUBLIC API
  start() {
    this.waveIndex = 0;
    this._beginWave(0);
  }

  update(dt, shipX, shipY) {
    if (this.state === STATE.IDLE || this.state === STATE.COMPLETE) return;

    this.waveWormManager.update(dt, shipX, shipY);

    if (this.state === STATE.TRANSITIONING) {
      this.transitionTimer -= dt;
      if (this.transitionTimer <= 0) {
        if (this.waveIndex >= WAVE_CONFIGS.length - 1) {
          this.state = STATE.COMPLETE;
          this.onAllWavesComplete?.();
        } else {
          this.waveIndex++;
          this._beginWave(this.waveIndex);
        }
      }
    }
  }

  draw(ctx) {
    this.waveWormManager.draw(ctx);
  }

  drawBehindEnemies(ctx) {
    this.waveWormManager.drawBehindEnemies(ctx);
  }

  drawAboveEnemies(ctx) {
    this.waveWormManager.drawAboveEnemies(ctx);
  }

  checkWormHit(seg, damage = 1) {
    return this.waveWormManager.checkProjectileHit(seg, damage);
  }

  //  RESET / RESTART
  reset() {
    this.state                  = STATE.IDLE;
    this.waveIndex              = 0;
    this._wormKillsThisWave     = 0;
    this._currentSpecialWindows = null;
    this.waveWormManager.clear();
    this.enemyManager.setSpawningEnabled(false);
    this.enemyManager.setMaxCount(0);
    this.enemyManager.setGlobalSpecialWindow(0);
  }

  restartCurrentWave() {
    this.waveWormManager.clear();
    this._beginWave(this.waveIndex);
  }

  //  GETTERS
  isActive()        { return this.state !== STATE.IDLE && this.state !== STATE.COMPLETE; }
  isTransitioning() { return this.state === STATE.TRANSITIONING; }
  getWaveIndex()    { return this.waveIndex; }
  getState()        { return this.state; }

  //  INTERNAL
  _beginWave(waveIndex) {
    const cfg = WAVE_CONFIGS[waveIndex];

    this.state                  = STATE.WAVE_ACTIVE;
    this._wormKillsThisWave     = 0;
    this._currentSpecialWindows = cfg.specialWindows;

    this.enemyManager.setAllowedTypes(cfg.types, cfg.weights);
    this.enemyManager.setMaxCount(cfg.maxEnemies);
    this.enemyManager.setSpawningEnabled(true);
    this.enemyManager.setGlobalSpecialWindow(cfg.specialWindows[0]); // OPEN WAVE WITH MAX SEPARATION

    this.waveWormManager.startWave(waveIndex);

    if (this.singularityBombManager) this.singularityBombManager.deployEnabled = true;

    this.onCheckpoint?.();
    this.onWaveStart?.(waveIndex);
  }

  _onWaveCleared() {
    this.state           = STATE.TRANSITIONING;
    this.transitionTimer = CONFIG.GAMEPLAY.WAVE_TRANSITION_DURATION;

    this.enemyManager.setSpawningEnabled(false);

    if (this.singularityBombManager) this.singularityBombManager.deployEnabled = false;

    this.onWaveCleared?.(this.waveIndex);
  }

  // CALLED ON EACH WORM KILL — STEPS DOWN THE INTER-SPECIAL WINDOW SO ATTACKS CONVERGE OVER TIME
  _applySpecialWindow(kills) {
    if (!this._currentSpecialWindows) return;
    const idx = Math.min(kills, this._currentSpecialWindows.length - 1);
    this.enemyManager.setGlobalSpecialWindow(this._currentSpecialWindows[idx]);
  }
}