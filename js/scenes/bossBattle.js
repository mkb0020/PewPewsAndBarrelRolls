// bossBattle.js
// ~~~~~~~~~~~~~~~~~~~~ IMPORTS ~~~~~~~~~~~~~~~~~~~~
import { CONFIG }      from '../utils/config.js';
import { ImageLoader } from '../utils/imageLoader.js';
// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
export class BossBattleScene {

  constructor({ wormBoss, babyWormManager, audio, scoreManager, projectileManager, transitionScene }) {
    this.wormBoss          = wormBoss;
    this.babyWormManager   = babyWormManager;
    this.audio             = audio;
    this.scoreManager      = scoreManager;
    this.projectileManager = projectileManager;
    this.transitionScene   = transitionScene;

    //  INTERNAL STATE 
    this._wormBattleStarted = false;
    this._warningSounded    = false;

    //  CALLBACKS (main.js  ) 
    this.onCinematicStart = null;   
    this.onCinematicEnd   = null;   
    this.onCheckpoint     = null;   

    //  DOM REFS — BOSS HEALTH BAR 
    this._bossBarFill      = document.getElementById('boss-bar-fill');
    this._bossBarContainer = document.getElementById('boss-health-container');
    this._bossHPText       = document.getElementById('boss-hp-text');
    this._wormMaxHP        = CONFIG.WORM?.HEALTH ?? 150;

    //  WIRE WORM BOSS CALLBACKS 
    this._wireCallbacks();

    console.log('✔ BossBattleScene initialized');
  }

  //  PUBLIC API
  /**
   * CALL EVERY FRAME INSIDE THE ACTIVE GAME LOOP - HANDLES WORM + BABY UPDATES, SUCTION PHYSICS, AND CHECKPOINT
   * @param {number} dt
   * @param {object} ship  
   */
  update(dt, ship) {
    this.wormBoss.update(dt);
    this.babyWormManager.update(dt, ship);

    this._updateSuction(dt, ship);
    this._checkBattleCheckpoint();
  }

  /**
   * Must run every frame even while paused — keeps health bar opacity smooth.
   */
  updateHUD() {
    const wb  = this.wormBoss;
    const vis = wb.isActive && !wb.isDead && wb.alpha > 0.15;

    if (this._bossBarContainer) {
      this._bossBarContainer.style.opacity = vis
        ? Math.min(1, (wb.alpha - 0.15) / 0.25)
        : 0;
    }
    if (vis) {
      const pct = wb.getHealthPercent();
      if (this._bossBarFill) this._bossBarFill.style.width = (pct * 100) + '%';
      if (this._bossHPText)  this._bossHPText.textContent  =
        Math.ceil(pct * this._wormMaxHP) + ' / ' + this._wormMaxHP;
    }
  }

  /**
   * Test a single projectile against the worm boss AND baby worms.
   * If hit, the projectile is removed, explosion created, and score awarded
   * automatically.  Returns true if the projectile was consumed.
   * @param {object} projectile
   * @returns {boolean}
   */
  processProjectileHit(projectile) {
    const seg = projectile.getSegment();

    // PROJECTILE vs WORM BOSS
    const wormHit = this.wormBoss.checkProjectileHit(seg);
    if (wormHit.hit) {
      this.projectileManager.removeProjectile(projectile);
      this.audio.playImpact();
      this._flashBossBar();
      this.updateHUD();
      this.projectileManager.createExplosion(wormHit.x, wormHit.y);

      if (wormHit.killed) {
        this.scoreManager.addScore(500, wormHit.x, wormHit.y);
        this.audio.stopMusic();
        this.audio.playWormDeath1();
        this.onCinematicStart?.();
      } else {
        const segScore = wormHit.segIndex === 0 ? 25 : 10;
        this.scoreManager.addScore(segScore, wormHit.x, wormHit.y);
      }
      return true;
    }

    // PROJECTILE vs BABY WORMS
    const babyHit = this.babyWormManager.checkProjectileHit(seg);
    if (babyHit.hit) {
      this.projectileManager.removeProjectile(projectile);
      this.audio.playImpact();
      this.projectileManager.createExplosion(babyHit.x, babyHit.y);
      this.scoreManager.addScore(15, babyHit.x, babyHit.y);
      return true;
    }

    return false;
  }

  reset() {
    this._wormBattleStarted = false;
    this._warningSounded    = false;
  }

  // ── GETTERS ────────────────────────────────────────────────────────────────

  /** True while the worm suction attack is in its loop phase. */
  get isSuctionActive() {
    return this.wormBoss.isActive
      && !this.wormBoss.isDead
      && this.wormBoss.attackPhase === 'loop'
      && this.wormBoss.attackType  === 'suction';
  }

  get isActive() { return this.wormBoss.isActive; }

  //  PRIVATE — WORM BOSS CALLBACK WIRING
  _wireCallbacks() {
    const { wormBoss, babyWormManager, audio, scoreManager,
            projectileManager, transitionScene } = this;

    wormBoss.onAttack = null; // PLACEHOLDER — NOT YET USED

    wormBoss.onIntro = () => {
      audio.stopMusic();
      audio.startBossMusic();
      ImageLoader.load('slime');
    };

    wormBoss.onDeathPauseEnd = () => {
      audio.playWormDeath2();
    };

    wormBoss.onSpawnBabyWorms = (mx, my) => {
      babyWormManager.spawnWave(mx, my);
      audio.playBabyWorms();
      const w = window.innerWidth;
      const h = window.innerHeight;
      babyWormManager.triggerSlimeSplat(w, h);
    };

    wormBoss.onSegmentDeath = (x, y, segIndex) => {
      projectileManager.createExplosion(x, y);
      if (segIndex === 0) {
        audio.playWormDeath3();
        audio.stopMusic();
        setTimeout(() => projectileManager.createExplosion(x + 20, y - 15), 60);
        setTimeout(() => projectileManager.createExplosion(x - 15, y + 20), 120);
      }
    };

    wormBoss.onDeath = () => {
      this.updateHUD(); // SNAP BAR TO 0
      transitionScene.showBossDefeated();

      const cx = window.innerWidth  / 2;
      const cy = window.innerHeight / 2;
      scoreManager.addScore(2000, cx, cy - 60);

      // RESPAWN AFTER 10s — LET wormDeath3 FINISH BEFORE MUSIC RETURNS
      setTimeout(() => {
        if (!transitionScene.isGameOver) {
          wormBoss.activate();
          this.onCinematicEnd?.();
          audio.playWormIntro();
          audio.startBossMusic();
        }
      }, 10000);
    };
  }

  //  PRIVATE — SUCTION PHYSICS
  _updateSuction(dt, ship) {
    if (this.isSuctionActive) {
      if (ship.isAlive && !ship.consumedMode) {
        const headPos = this.wormBoss.getHeadPosition();
        ship.applySuction(headPos.x, headPos.y, dt);
      }

      // WARNING — FIRES ONCE WHEN SHIP IS ~HALFWAY TO THE MOUTH
      if (!this._warningSounded && ship.getSuctionScale() < 0.65) {
        this._warningSounded = true;
        this.audio.playWarning();
      }

      // FULLY CONSUMED — INSTANT KILL
      if (ship.getSuctionScale() < CONFIG.SHIP_HP.SUCTION_DEATH_SCALE
          && ship.isAlive && !ship.isInvincible) {
        ship.takeDamage(ship.maxHP);
      }
    } else {
      if (!ship.consumedMode) ship.clearSuction();
      this._warningSounded = false;
    }
  }

  //  PRIVATE — CHECKPOINT ON FIRST WORM SIGHTING
  _checkBattleCheckpoint() {
    if (!this._wormBattleStarted
        && this.wormBoss.isActive
        && this.wormBoss.alpha >= 0.15) {
      this._wormBattleStarted = true;
      this.onCheckpoint?.();
    }
  }

  //  PRIVATE — BOSS HEALTH BAR HELPERS
  _flashBossBar() {
    if (!this._bossBarFill) return;
    this._bossBarFill.classList.remove('hit-flash');
    void this._bossBarFill.offsetWidth; // FORCE REFLOW TO RE-TRIGGER ANIMATION
    this._bossBarFill.classList.add('hit-flash');
  }
}