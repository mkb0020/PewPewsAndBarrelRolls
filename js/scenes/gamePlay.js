// Updated 3/13/26 @ 10:30PM
// gameplay.js
// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ IMPORTS ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
import { CONFIG }          from '../utils/config.js';
import { WaveWormManager } from '../entities/waveWorm.js';
// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
const WAVE_CONFIGS = [
  { // WAVE 1 — GLIP GLOP ONLY (JELLYFISH)
    types:      ['BASIC'],
    weights:    [1.00],
    maxEnemies: 6, 
  },
  { // WAVE 2 — + ZIP ZAP 
    types:      ['BASIC', 'ZIGZAG'],
    weights:    [0.4,    0.6], //  TESTING
    maxEnemies: 6,
  },
  { // WAVE 3 — + PHIL 
    types:      ['BASIC', 'ZIGZAG', 'FAST'],
    weights:    [0.3,    0.3,     0.4], //  TESTING
    maxEnemies: 6,
  },
  { // WAVE 4 — + GLORK 
    types:      ['BASIC', 'ZIGZAG', 'FAST',  'TANK'],
    weights:    [0.3,    0.3,     0.1,    0.3],  // TESTING
    maxEnemies: 6,
  },
  { // WAVE 5 — + FLIM FLAM 
    types:      ['BASIC', 'ZIGZAG', 'FAST',  'TANK',  'FLIMFLAM'],
    weights:    [0.25,    0.2,     0.1,    0.2,    0.25], //  TESTING
    maxEnemies: 6,
  },
];

const STATE = {
  IDLE:         'IDLE',         // NOT STARTED YET
  WAVE_ACTIVE:  'WAVE_ACTIVE',  
  TRANSITIONING:'TRANSITIONING',// KILL TARGET MADE / RISER PLAYS / ENEMIES DRAIN OUT
  COMPLETE:     'COMPLETE',     // ALL 5 WAVES COMPLETE
};

export class GameplayScene {
  constructor({ enemyManager, waveWormManager, scoreManager, audio, singularityBombManager = null }) {
    this.enemyManager           = enemyManager;
    this.waveWormManager        = waveWormManager;
    this.scoreManager           = scoreManager;
    this.audio                  = audio;
    this.singularityBombManager = singularityBombManager;

    this.state            = STATE.IDLE;
    this.waveIndex        = 0;        // 0–4, CURRENT WAVE
    this.transitionTimer  = 0;        // COUNTDOWN DURING TRANSITIONING

    //  CALLBACKS 
    this.onGooHit          = null;    
    this.onWormKill        = null;    
    this.onWaveStart       = null;    
    this.onWaveCleared     = null;    
    this.onAllWavesComplete = null;   
    this.onCheckpoint      = null;    

    this.waveWormManager.onKill = (kills, required) => {
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
        } else { // NEXT WAVE
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
    return this.waveWormManager.checkProjectileHit(seg, damage);  // DAMAGE THREADED FROM COLLISION LOOP (boost-aware)
  }

  //  RESET / RESTART 
  reset() {
    this.state       = STATE.IDLE;
    this.waveIndex   = 0;
    this.waveWormManager.clear();
    this.enemyManager.setSpawningEnabled(false);
    this.enemyManager.setMaxCount(0);
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

    this.state = STATE.WAVE_ACTIVE;

    this.enemyManager.setAllowedTypes(cfg.types, cfg.weights);
    this.enemyManager.setMaxCount(cfg.maxEnemies);
    this.enemyManager.setSpawningEnabled(true);

    this.waveWormManager.startWave(waveIndex);

    if (this.singularityBombManager) this.singularityBombManager.deployEnabled = true;

    this.onCheckpoint?.();

    this.onWaveStart?.(waveIndex);

    // console.log(
     // `▶ Wave ${waveIndex + 1} / ${WAVE_CONFIGS.length} | ` +
    //  `Types: [${cfg.types.join(', ')}] | Max enemies: ${cfg.maxEnemies}`
  //  );
  }

  _onWaveCleared() {
    this.state           = STATE.TRANSITIONING;
    this.transitionTimer = CONFIG.GAMEPLAY.WAVE_TRANSITION_DURATION;

    this.enemyManager.setSpawningEnabled(false);

    if (this.singularityBombManager) this.singularityBombManager.deployEnabled = false;

    this.onWaveCleared?.(this.waveIndex);

    // console.log(`✔ Wave ${this.waveIndex + 1} cleared! Transitioning in ${CONFIG.GAMEPLAY.WAVE_TRANSITION_DURATION}s`);
  }
}