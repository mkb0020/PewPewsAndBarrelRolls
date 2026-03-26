// Updated 3/26/26 @ 5PM
// bossBattle.js
// ~~~~~~~~~~~~~~~~~~~~ IMPORTS ~~~~~~~~~~~~~~~~~~~~
import { CONFIG }      from '../utils/config.js';
import { ImageLoader } from '../utils/imageLoader.js';
import { CellularAttack } from '../entities/cellularAttack.js';
import { SessionRecorder } from '../temp/devTools.js';
// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// ── LARVA SYSTEM ─────────────────────────────────────────────────────────────
const LARVA = {
  TOTAL_FRAMES: 11, WIGGLE_START_FRAME: 0, WIGGLE_FRAMES_COUNT: 4,
  EXPLODE_FRAMES_COUNT: 7, WIGGLE_FRAME_DUR: 0.12, EXPLODE_FRAME_DUR: 0.085,
  BASE_WIGGLE_DURATION: 8.0, STAGGER_MIN: -0.35, STAGGER_MAX: 0.65,
  FADE_IN_DURATION: 0.75, COUNT: 30, MIN_SCALE: 0.18, MAX_SCALE: 0.38,
  OUTWARD_SPEED: 40, SPAWN_RADIUS: 15,
};

class LarvaSystem {
  constructor() { this._larvae = []; this._active = false; }

  spawn(screenX, screenY) {
    const sprite = ImageLoader.get('larva');
    if (!sprite) return;
    const fw = sprite.width / LARVA.TOTAL_FRAMES;
    const fh = sprite.height;
    const now = performance.now();
    this._larvae = [];
    this._active = true;
    for (let i = 0; i < LARVA.COUNT; i++) {
      const scale   = LARVA.MIN_SCALE + Math.random() * (LARVA.MAX_SCALE - LARVA.MIN_SCALE);
      const angle   = Math.random() * Math.PI * 2;
      const oAngle  = Math.random() * Math.PI * 2;
      const oRad    = Math.random() * LARVA.SPAWN_RADIUS;
      const stagger = LARVA.STAGGER_MIN + Math.random() * (LARVA.STAGGER_MAX - LARVA.STAGGER_MIN);
      this._larvae.push({
        x: screenX + Math.cos(oAngle) * oRad - fw * scale / 2,
        y: screenY + Math.sin(oAngle) * oRad - fh * scale / 2,
        vx: Math.cos(angle) * LARVA.OUTWARD_SPEED,
        vy: Math.sin(angle) * LARVA.OUTWARD_SPEED,
        scale, angle, creationTime: now, stagger,
        explosionStartTime: now + (LARVA.BASE_WIGGLE_DURATION + stagger) * 1000,
        phase: 'wiggle', explosionFrameStart: null, active: true,
      });
    }
  }

  update(dt) {
    if (!this._active) return;
    const now = performance.now();
    for (const l of this._larvae) {
      if (!l.active) continue;
      l.x += l.vx * dt;
      l.y += l.vy * dt;
      if (l.phase === 'wiggle' && now >= l.explosionStartTime) {
        l.phase = 'explode';
        l.explosionFrameStart = l.explosionStartTime;
      }
    }
    this._larvae = this._larvae.filter(l => l.active);
    if (!this._larvae.length) this._active = false;
  }

  draw(ctx) {
    if (!this._active) return;
    const sprite = ImageLoader.get('larva');
    if (!sprite) return;
    const fw  = sprite.width / LARVA.TOTAL_FRAMES;
    const fh  = sprite.height;
    const now = performance.now();
    for (const l of this._larvae) {
      if (!l.active) continue;
      let fi;
      if (l.phase === 'wiggle') {
        fi = (Math.floor((now - l.creationTime) / 1000 / LARVA.WIGGLE_FRAME_DUR) % LARVA.WIGGLE_FRAMES_COUNT) + LARVA.WIGGLE_START_FRAME;
      } else {
        fi = Math.floor((now - l.explosionFrameStart) / 1000 / LARVA.EXPLODE_FRAME_DUR);
        if (fi >= LARVA.EXPLODE_FRAMES_COUNT) { l.active = false; continue; }
        fi += LARVA.WIGGLE_FRAMES_COUNT;
      }
      const alpha = Math.min(1, (now - l.creationTime) / 1000 / LARVA.FADE_IN_DURATION);
      const dw = fw * l.scale, dh = fh * l.scale;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(l.x + dw / 2, l.y + dh / 2);
      ctx.rotate(l.angle);
      ctx.drawImage(sprite, fi * fw, 0, fw, fh, -dw / 2, -dh / 2, dw, dh);
      ctx.restore();
    }
  }

  clear() { this._larvae = []; this._active = false; }
}


export class BossBattleScene {

  constructor({ wormBoss, babyWormManager, audio, scoreManager, projectileManager, transitionScene, singularityBombManager, tunnel }) {
    this.wormBoss              = wormBoss;
    this.babyWormManager       = babyWormManager;
    this.audio                 = audio;
    this.scoreManager          = scoreManager;
    this.projectileManager     = projectileManager;
    this.transitionScene       = transitionScene;
    this.singularityBombManager = singularityBombManager ?? null;
    this.tunnel                = tunnel;

    //  INTERNAL STATE 
    this._wormBattleStarted = false;
    this._warningSounded    = false;
    this._battleReady       = false;
    this.rageStarted        = false; 

    //  CALLBACKS (main.js  ) 
    this.onCinematicStart    = null;   
    this.onCinematicEnd      = null;   
    this.onCheckpoint        = null;
    this.onWormholeGameOver  = null;   // FIRES AFTER VORTEX COMPLETES — WIRE TO WAVE-1 RESTART IN main.js
    this.onCollapseHit       = null;   // FIRES WHEN CELLULAR CONTAINMENT FAILS — main.js APPLIES FLAT DAMAGE TO SHIP

    //  WORMHOLE GAME OVER STATE
    this._wormholeActive = false;
    this._vortex         = null;

    this._larvaSystem = new LarvaSystem();

    //  DOM REFS — BOSS HEALTH BAR 
    this._bossBarFill      = document.getElementById('boss-bar-fill');
    this._bossBarContainer = document.getElementById('boss-health-container');
    this._bossHPText       = document.getElementById('boss-hp-text');
    this._wormMaxHP        = CONFIG.WORM?.HEALTH ?? 300; // NOT FINALIZED
    this.cellularAttack = new CellularAttack();
    this._distortTimer  = 0;  // COUNTDOWN — CLEARS ship._cellularDistortActive WHEN DONE 
    this._wireCallbacks();  //  WIRE WORM BOSS CALLBACKS
    // console.log('✔ BossBattleScene initialized');
  }

  //  PUBLIC API
  /**
   * CALL EVERY FRAME INSIDE THE ACTIVE GAME LOOP - HANDLES WORM + BABY UPDATES, SUCTION PHYSICS, AND CHECKPOINT
   * @param {number} dt
   * @param {object} ship  
   */
  update(dt, ship) {
    this.ship = ship;
    this.wormBoss.setShipPosition(ship.x, ship.y);
    this.wormBoss.update(dt);
    this.babyWormManager.update(dt, ship);

    this._updateSuction(dt, ship);
    this._checkBattleCheckpoint();

    if (this.cellularAttack.isActive) { // CELLULAR AUTOMATTACK — TICK AND CHECK SHIP DAMAGE
      this.cellularAttack.update(dt);

      if (ship.isAlive && !ship.isInvincible) {
        const dmg = this.cellularAttack.getDamageForShip(ship.x, ship.y, dt);
        if (dmg > 0) {
          ship.takeDamage(dmg);
          this.audio.playOuch();
        }
      }
    }

    // CELLULAR DISTORTION TIMER — CLEAR FLAG WHEN DURATION EXPIRES
    if (this._distortTimer > 0) {
      this._distortTimer -= dt;
      if (this._distortTimer <= 0) {
        this._distortTimer          = 0;
        ship._cellularDistortActive = false;
      }
    }

    // VORTEX UPDATE — DRIVES THREE.JS RENDER EACH FRAME AFTER SHIP IS CONSUMED
    this._vortex?.update(dt);
    this._larvaSystem.update(dt);
  }

  /**
   * CALLED ON CELLULAR ATTACK COLLAPSE — TRIGGERS REALITY DISTORTION INSTEAD OF FLAT DAMAGE
   * REVERSES CONTROLS, SLOWS MOVEMENT, ACTIVATES TRACERS + INVERTED SHIP COLORS FOR DISTORT_DURATION
   */
  activateCellularDistort(ship) {
    if (!ship || !ship.isAlive) return;
    ship._cellularDistortActive = true;
    this._distortTimer          = CONFIG.CELLULAR_ATTACK.DISTORT_DURATION;
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

  /** CALLED SEPARATELY IN THE DRAW PASS — BETWEEN TUNNEL AND WORM LAYER */
  drawCellular(ctx) {
    this.cellularAttack.draw(ctx);
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

    // PROJECTILE vs CELLULAR BREAK NODES
    if (this.cellularAttack.isActive) {
      const cellHit = this.cellularAttack.checkProjectileHit(seg);
      if (cellHit.hit) {
        this.projectileManager.removeProjectile(projectile);
        this.audio.playImpact();
        this.projectileManager.createExplosion(cellHit.sx, cellHit.sy);
        this.scoreManager.addScore(50, cellHit.sx, cellHit.sy);
        return true;
      }
    }

    return false;
  }

  reset(ship = null) {
    this._wormBattleStarted = false;
    this._warningSounded    = false;
    this._battleReady       = false;
    this._wormholeActive    = false;
    this._vortex            = null;
    this._distortTimer      = 0;
    this.rageStarted        = false;
    if (ship) ship._cellularDistortActive = false; // ENSURE FLAG IS CLEARED ON HARD RESET
    this.cellularAttack.reset();
    this._larvaSystem.clear();
    this.tunnel.resetRage();
    this.tunnel.resetBossTransition();
    this.wormBoss.isRaging = false;
    this.wormBoss.freeze = false;
    if (ship) ship.setRageSuction(false);
    if (this.singularityBombManager) this.singularityBombManager.isBossBattle = false;
  }

  /** CALLED AUTOMATICALLY BY wormBoss.onIntro ONCE RISER FINISHES AND BOSS MUSIC STARTS */
  readyForBattle() {
    this._battleReady = true;
    SessionRecorder.log('boss_battle_start');
    this.wormBoss.enableAttacks();  // UNLOCK ATTACK CYCLE — RISER COMPLETE, BATTLE BEGINS
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

    // HARD-CLEAR CELLULAR DISTORT — PREVENTS REVERSED CONTROLS, INVERTED SHIP COLORS,
    // AND MAGENTA TRACERS FROM CARRYING OVER INTO THE WORMHOLE VORTEX SCENE
    ship._cellularDistortActive = false;
    this._distortTimer          = 0;
    this.cellularAttack.reset();

    this.wormBoss.forceSuction(); // FORCE WORM INTO SUCTION VISUALS

    ship.onDeath = null;  // NULL OUT onDeath SO THE CONSUMED ANIMATION DOESN'T RE-TRIGGER THE DEATH FLOW

    // REVIVE SHIP JUST LONG ENOUGH TO PLAY THE CONSUMED ANIMATION
    ship.isAlive             = true;
    ship.isInvincible        = true;
    ship.invincibilityTimer  = 9999;
    ship.hp                  = 1;
    ship.consumedMode        = false;
    ship._consumedDeathFired = false;
    ship.suctionScale        = Math.max(ship.suctionScale, 0.7); // ENSURE VISIBLE PULL-IN

    ship.onConsumedComplete = () => { // WHEN CONSUMED ANIMATION COMPLETES → LAUNCH VORTEX
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

    wormBoss.onLungeGrowl = () => audio.playWormGrowl();  // REAR-BACK TELEGRAPH
    wormBoss.onLungeSnap  = () => audio.playWormSnap();   // BITE LANDS

    wormBoss.onLungeBite = (hx, hy, biteRadius) => {  // DAMAGE CHECK — FIRES AT PEAK LUNGE REACH
      const ship = this.ship;
      if (!ship?.isAlive || ship.isInvincible) return;
      const dx = ship.x - hx;
      const dy = ship.y - hy;
      if (dx * dx + dy * dy < biteRadius * biteRadius) {
        ship.takeDamage(CONFIG.WORM_BOSS.LUNGE_DAMAGE);
        audio.playOuch();
      }
    };

    wormBoss.onScreenShake = (strength, duration) => {  // CANVAS SHAKE — FIRES ON LUNGE BITE IMPACT
      const canvas = document.getElementById('game-canvas');
      if (!canvas) return;
      const start = performance.now();
      const tick = (now) => {
        const elapsed = (now - start) / 1000;
        if (elapsed >= duration) { canvas.style.transform = ''; return; }
        const decay = 1 - elapsed / duration;
        const dx = (Math.random() - 0.5) * strength * decay;
        const dy = (Math.random() - 0.5) * strength * decay;
        canvas.style.transform = `translate(${dx}px, ${dy}px)`;
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    };

    wormBoss.onRageStart = () => {
      this.enterRageSequence();
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

    wormBoss.onSpawnCellular = (mx, my) => { // CELLULAR AUTOMATTACK — WORM SPITS THE SEED; INFECTION BEGINS
      audio.playCellularSeed();
      this.cellularAttack.start(mx, my);

      this.cellularAttack.onAttackEnd = (didSucceed) => { // SUCCESS — PLAYER DESTROYED ENOUGH BREAK NODES
        if (didSucceed) {
          audio.playCellularSuccess();
          scoreManager.addScore(300, window.innerWidth * 0.5, window.innerHeight * 0.5);
        }
        wormBoss.endCellularAttack(); // RETURN WORM TO NORMAL ATTACK CYCLE
      };

      this.cellularAttack.onCollapseBurst = (positions) => { // FAILURE — CONTAINMENT OVERRUN, BURST FIRES
        audio.playCellularCollapse();
        const step = CONFIG.CELLULAR_ATTACK.COLLAPSE_BURST_MS / Math.max(1, positions.length);  // STAGGER EXPLOSIONS ACROSS ~550ms — PIXEL SUPERNOVA
        positions.forEach(({ x, y }, i) => {
          setTimeout(() => {
            projectileManager.createExplosion(x, y, 'bam');
          }, i * step);
        });
        // FLAT DAMAGE HIT TO SHIP ON COLLAPSE - (SHIP DAMAGE IS APPLIED DIRECTLY HERE — OUTSIDE THE NORMAL LOOP — SO USE THE STORED SHIP REF)
        this.onCollapseHit?.();
      };
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
      SessionRecorder.log('boss_battle_end'); 
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

drawLarvae(ctx) { this._larvaSystem.draw(ctx); }

enterRageSequence() {  
  if (this.rageStarted) return;
  this.rageStarted = true; 
  this.wormBoss.disableAllAttacks();
  this.tunnel.setBossFlash(1.0);
  this.wormBoss.startRageTransform();  
  this.ship.canShoot = false;
  this.wormBoss.freeze = true;
  this.wormBoss.isRaging = true;
  this.audio.startRageMusic();
  this.ship.setRageSuction(true);
  this.tunnel.setRageCrumble(1.0);

  // BAR 1 END (2.667s = 1 bar @ 90BPM) — FREEZE LIFTS, TRANSFORMATION CRAWL BEGINS
  setTimeout(() => {
    this.tunnel.setRageBlackout(1.0);
    this.wormBoss.freeze = false;
    this.tunnel.setRageCrumble(0.25);
    ImageLoader.load('larva').then(() => {
      const head = this.wormBoss.segments[0];
      this._larvaSystem.spawn(head.screenX, head.screenY);
    });
  }, 2667);

  // BAR 4 / THE DROP (10.667s = 4 bars @ 90BPM) — TRANSFORMATION COMPLETE, SUCTION ATTACK FIRES
  setTimeout(() => {
      this.wormBoss.startSuctionAttack();   // FORCE FIRST POST-RAGE ATTACK
      this.wormBoss.enableAllAttacks();     // IMMEDIATELY UNLOCK AI AFTER
      this.ship.canShoot = true;
  }, 10667);
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

    // FULLY CONSUMED — INSTANT KILL (VICTORY OVERRIDES — DON'T TRIGGER IF WORM IS ALREADY DYING)
    if (ship.getSuctionScale() < CONFIG.SHIP_HP.SUCTION_DEATH_SCALE
        && ship.isAlive && !ship.isInvincible
        && !this.wormBoss.isDying && !this.wormBoss.isDead) {
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