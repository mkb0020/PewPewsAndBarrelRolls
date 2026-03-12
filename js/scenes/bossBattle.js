// Updated 3/12/26 @ 7AM
// bossBattle.js
// ~~~~~~~~~~~~~~~~~~~~ IMPORTS ~~~~~~~~~~~~~~~~~~~~
import { CONFIG }      from '../utils/config.js';
import { ImageLoader } from '../utils/imageLoader.js';
// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
export class BossBattleScene {

  constructor({ wormBoss, babyWormManager, audio, scoreManager, projectileManager, transitionScene, singularityBombManager }) {
    this.wormBoss              = wormBoss;
    this.babyWormManager       = babyWormManager;
    this.audio                 = audio;
    this.scoreManager          = scoreManager;
    this.projectileManager     = projectileManager;
    this.transitionScene       = transitionScene;
    this.singularityBombManager = singularityBombManager ?? null;

    //  INTERNAL STATE 
    this._wormBattleStarted = false;
    this._warningSounded    = false;
    this._battleReady       = false; 

    //  CALLBACKS (main.js  ) 
    this.onCinematicStart    = null;   
    this.onCinematicEnd      = null;   
    this.onCheckpoint        = null;
    this.onWormholeGameOver  = null;   // FIRES AFTER VORTEX COMPLETES — WIRE TO WAVE-1 RESTART IN main.js

    //  WORMHOLE GAME OVER STATE
    this._wormholeActive = false;
    this._vortex         = null;

    //  DOM REFS — BOSS HEALTH BAR 
    this._bossBarFill      = document.getElementById('boss-bar-fill');
    this._bossBarContainer = document.getElementById('boss-health-container');
    this._bossHPText       = document.getElementById('boss-hp-text');
    this._wormMaxHP        = CONFIG.WORM?.HEALTH ?? 150;

    //  WIRE WORM BOSS CALLBACKS 
    this._wireCallbacks();

    // console.log('✔ BossBattleScene initialized');
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

    // VORTEX UPDATE — DRIVES THREE.JS RENDER EACH FRAME AFTER SHIP IS CONSUMED
    this._vortex?.update(dt);
  }

  /**
   * MUST RUN EVERY FRAME WHILE PAUSED - KEEPS HEALTH BAR OPACITY SMOOTH
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
   *  TEST A SINGLE PROJECTILE AGAINST THE WORM BOSS AND BABY WORMS
   * IF HIT, THE PROJECTILE IS REMOVED, EXPLOSION CREATED AND SCORE ADDED AUTOMATICALLY - RETURNS TRUE IF PROJECTILE WAS CONSUMED
   * @param {object} projectile
   * @returns {boolean}
   */
  processProjectileHit(projectile) {
    const seg = projectile.getSegment();

    // PROJECTILE vs WORM BOSS — BLOCKED UNTIL BATTLE IS READY / RISER STOPS / MUSIC STARTS
    if (!this._battleReady) return false;
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
        if (this.singularityBombManager) this.singularityBombManager.deployEnabled = false;
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
    this._battleReady       = false;
    this._wormholeActive    = false;
    this._vortex            = null;
    if (this.singularityBombManager) this.singularityBombManager.isBossBattle = false;
  }

  /** CALLED AUTOMATICALLY BY wormBoss.onIntro ONCE RISER FINISHES AND BOSS MUSIC STARTS */
  readyForBattle() {
    this._battleReady = true;
    if (this.singularityBombManager) this.singularityBombManager.deployEnabled = true;
    // console.log('⚔ Battle ready — boss damage unlocked');
  }

  /**
   * BOSS GAME OVER SEQUENCE — SWALLOWS THE SHIP THEN PLAYS THE VORTEX.
   * CALLED FROM main.js INSTEAD OF transitionScene.handleDeath() WHEN
   * livesLeft === 0 AND THE PLAYER IS IN THE BOSS BATTLE.
   * WORKS REGARDLESS OF WHICH ATTACK IS CURRENTLY ACTIVE.
   */
  startWormholeGameOver(ship) {
    if (this._wormholeActive) return;
    this._wormholeActive = true;

    this.audio.stopMusic();
    this.audio.playGameOver2();
    if (this.singularityBombManager) this.singularityBombManager.deployEnabled = false;

    // FORCE WORM INTO SUCTION VISUALS
    this.wormBoss.forceSuction();

    // NULL OUT onDeath SO THE CONSUMED ANIMATION DOESN'T RE-TRIGGER THE DEATH FLOW
    ship.onDeath = null;

    // REVIVE SHIP JUST LONG ENOUGH TO PLAY THE CONSUMED ANIMATION
    ship.isAlive             = true;
    ship.isInvincible        = true;
    ship.invincibilityTimer  = 9999;
    ship.hp                  = 1;
    ship.consumedMode        = false;
    ship._consumedDeathFired = false;
    ship.suctionScale        = Math.max(ship.suctionScale, 0.7); // ENSURE VISIBLE PULL-IN

    // WHEN CONSUMED ANIMATION COMPLETES → LAUNCH VORTEX
    ship.onConsumedComplete = () => {
      ship.onConsumedComplete  = null;
      this.wormBoss.isActive   = false;  // SHIP IS IN THE MOUTH — WORM GONE BEFORE VORTEX BEGINS
      import('../visuals/wormholeVortex.js').then(({ WormholeVortex }) => {
        this._vortex            = new WormholeVortex();
        this._vortex.onComplete = () => {
          this._vortex         = null;
          this._wormholeActive = false;
          this.onWormholeGameOver?.();
        };
        const shipSprite = ImageLoader.get('ship');
        this._vortex.start(shipSprite);
      });
    };

    // SEND SHIP SPIRALING INTO THE WORM'S MOUTH
    const head = this.wormBoss.getHeadPosition();
    ship.enterConsumed(head.x, head.y);
  }

  //  GETTERS 
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

    wormBoss.onIntro = () => {
      audio.stopMusic();
      audio.startBossMusic(); 
      ImageLoader.load('slime');
      if (this.singularityBombManager) this.singularityBombManager.isBossBattle = true;
      const riserMs = (audio._introBuffer?.duration ?? 10) * 1000;
      setTimeout(() => this.readyForBattle(), riserMs);
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

    if (segIndex === 0) {  // HEAD — GRAND FINALE
      audio.playWormDeath3();
      audio.stopMusic();

      // PRE-WARM BOTH LAZY SPRITES SO THEY'RE READY BY FINALE TIME
      ImageLoader.load('zap');
      ImageLoader.load('spiral');

      // ZAP CLUSTER — FOUR OVERLAPPING BURSTS SCATTERED AROUND THE HEAD
      setTimeout(() => projectileManager.createExplosion(x + 35,  y - 20,  'zap'), 25);
      setTimeout(() => projectileManager.createExplosion(x - 30,  y + 30,  'zap'), 50);
      setTimeout(() => projectileManager.createExplosion(x + 15,  y + 40,  'zap'), 75);
      setTimeout(() => projectileManager.createExplosion(x - 40,  y - 25,  'zap'), 100);

      setTimeout(() => projectileManager.createExplosion(x, y, 'spiral'), 110);
      setTimeout(() => projectileManager.burstSmoke(x, y), 130);
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