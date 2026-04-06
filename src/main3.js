// Updated 3/22/26 @ 11PM
// main.js — PRODUCTION BUILD
// Dev tools, bot player, SessionRecorder, boss shortcut, and tentacle lab removed.
// ~~~~~~~~~~~~~~~~~~~~ IMPORTS ~~~~~~~~~~~~~~~~~~~~
import { CONFIG }                                    from './utils/config.js';
import { initKeyboard, initMobileControls, revealMobileControls } from './utils/controls.js';
import { segmentCircleCollision }                    from './utils/collision.js';
import { AudioManager }                              from './utils/audio.js';
import { GameUI }                                    from './utils/ui.js';
import { ScoreManager }                              from './utils/score.js';
import { ImageLoader }                               from './utils/imageLoader.js';
import { Tunnel }                                    from './visuals/tunnel.js';
import { Ship }                                      from './entities/ship.js';
import { EnemyManager, setActiveSingularityBH }      from './entities/enemies.js';
import { ProjectileManager, Crosshair, MuzzleFlash } from './entities/projectiles.js';
import { WormBoss }                                  from './entities/worm.js';
import { BabyWormManager }                           from './entities/babyWorm.js';
import { Menu }                                      from './scenes/menu.js';
import { SlimeAttack }                               from './entities/slimeAttack.js';
import { OcularPrism }                               from './entities/ocularPrism.js';
import { FractalCascade }                            from './entities/fractalCascade.js';
import { WaveWormManager }                           from './entities/waveWorm.js';
import { GameplayScene }                             from './scenes/gameplay.js';
import { TransitionScene }                           from './scenes/transitions.js';
import { BossBattleScene }                           from './scenes/bossBattle.js';
import { StarfieldScene }                            from './visuals/starfieldScene.js';
import { OpeningScene }                              from './scenes/openingScene.js';
import { ClosingScene }                              from './scenes/closingScene.js';
import { BossTransmission }                          from './scenes/bossTransmission.js';
import { CosmicPrismManager }                        from './entities/cosmicPrism.js';
import { TesseractFragmentManager }                  from './entities/tesseractFragment.js';
import { SingularityBombManager }                    from './entities/singularityBomb.js';
import { EnemyDeathManager }                         from './visuals/enemyDeath.js';

// ==================== CANVAS ====================
const gameCanvas    = document.createElement('canvas');
gameCanvas.id       = 'game-canvas';
gameCanvas.width    = window.innerWidth;
gameCanvas.height   = window.innerHeight;
document.body.appendChild(gameCanvas);
const ctx = gameCanvas.getContext('2d');

// ==================== INSTANCES ====================
const tunnel            = new Tunnel();
const ship              = new Ship(gameCanvas, ctx);
const audio             = new AudioManager();
const ui                = new GameUI();
const enemyManager      = new EnemyManager(ship.particles, tunnel);
const projectileManager = new ProjectileManager();
const crosshair         = new Crosshair();
const muzzleFlash       = new MuzzleFlash();
const scoreManager      = new ScoreManager();
const wormBoss          = new WormBoss();
const babyWormManager   = new BabyWormManager(audio);
const menu              = new Menu();
const slimeAttack       = new SlimeAttack();
const ocularPrism       = new OcularPrism();
const fractalCascade    = new FractalCascade();
const waveWormManager   = new WaveWormManager();
const cosmicPrismManager = new CosmicPrismManager();
cosmicPrismManager.audio = audio;
const tesseractManager   = new TesseractFragmentManager();
tesseractManager.audio   = audio;
const singularityBombManager = new SingularityBombManager();
singularityBombManager.audio = audio;
singularityBombManager.onSpinorCollect = () => tunnel.triggerSpinor();
const enemyDeathManager      = new EnemyDeathManager();
const gameplayScene     = new GameplayScene({
  enemyManager,
  waveWormManager,
  scoreManager,
  audio,
  singularityBombManager,
});
const transitionScene   = new TransitionScene();
const starfield         = new StarfieldScene(tunnel.renderer);
const openingScene      = new OpeningScene(starfield, audio);
const bossTransmission  = new BossTransmission();
const closingScene      = new ClosingScene(starfield, tunnel, audio);
const bossBattleScene   = new BossBattleScene({
  wormBoss,
  babyWormManager,
  audio,
  scoreManager,
  projectileManager,
  transitionScene,
  singularityBombManager,
  tunnel,
});

// ==================== ENEMY CALLBACKS ====================
enemyManager.onLaserFired  = () => audio.playEnemyLaser();
enemyManager.onTelegraph   = () => { ocularPrism._stopTelegraph = audio.startLoopTelegraph(); };
enemyManager.onOcularPrism = (w, h) => {
  ocularPrism._stopTelegraph?.();
  ocularPrism._stopTelegraph = null;
  if (ocularPrism.activate(w, h)) {
    ocularPrism._stopPrism?.();
    ocularPrism._stopPrism = audio.startLoopPrism();
  }
};
enemyManager.onSlimeTelegraph = () => {
  if (slimeAttack.isActive()) return;
  audio._stopSlimeSounds?.();
  audio._stopSlimeSounds = audio.startSlimeSounds();
};
enemyManager.onSlimeAttack = (glorkX, glorkY) => {
  ImageLoader.load('slimeDrip');
  slimeAttack.trigger(glorkX, glorkY);
};
enemyManager.onEnemyKilled = (type) => {
  if (type === 'TANK') {
    audio._stopSlimeSounds?.(); audio._stopSlimeSounds = null;
  }
  if (type === 'FLIMFLAM') {
    ocularPrism._stopTelegraph?.(); ocularPrism._stopTelegraph = null;
  }
  if (type === 'ZIGZAG') {
    audio._stopFractalCode?.(); audio._stopFractalCode = null;
  }
};

// ==================== FRACTAL CASCADE CALLBACKS ====================
enemyManager.onFractalTelegraph = () => {
  if (fractalCascade.isActive()) return;
  audio._stopFractalCode?.();
  audio._stopFractalCode = audio.startFractalCode();
};
enemyManager.onFractalCascade = () => {
  audio._stopFractalCode?.(); audio._stopFractalCode = null;
  fractalCascade.activate();
};
fractalCascade.onRecompile = () => {
  audio.startFractalCode();
};

// ==================== OCULAR PRISM CALLBACKS ====================
ocularPrism.onDefeated = () => {
  ocularPrism._stopPrism?.();
  ocularPrism._stopPrism = null;
  ocularPrism._stopTelegraph?.();
  ocularPrism._stopTelegraph = null;
  audio.playPop();
  scoreManager.addScore(CONFIG.OCULAR_PRISM.PUPIL_KILL_SCORE, gameCanvas.width / 2, gameCanvas.height / 2);
  audio.playImpact();
};
ocularPrism.onExpired = () => {
  ocularPrism._stopPrism?.();
  ocularPrism._stopPrism = null;
};

// ==================== COSMIC PRISM CALLBACKS ====================
cosmicPrismManager.onCollect = (healAmt) => {
  ship.heal(healAmt);
};

// ==================== SINGULARITY BOMB CALLBACKS ====================
singularityBombManager.onInventoryChange = (count) => {
  updateBombDisplay(count);
};
singularityBombManager.onEnemyKilledByBH = (x, y) => {
  projectileManager.createExplosion(x, y, 'bam');
  audio.playImpact();
};

// ==================== GAMEPLAY SCENE CALLBACKS ====================
gameplayScene.onCheckpoint = () => {
  const raw = document.getElementById('score-value')?.textContent?.replace(/,/g, '') ?? '0';
  transitionScene.saveCheckpoint(parseInt(raw, 10) || 0);
};

gameplayScene.onWormKill = (kills, required) => {
  updateWaveCounter(kills, required);
};

gameplayScene.onWaveStart = (waveIndex) => {
  updateWaveCounter(0, waveWormManager.getRequired());
  showWaveHUD(true);
  audio.playWaveStart();
  if (waveIndex > 0) audio.startWaveMusic(waveIndex);
  if (waveIndex === 0) {
    cosmicPrismManager.start();
    tesseractManager.start();
    singularityBombManager.start();
  }
};

gameplayScene.onWaveCleared = (waveIndex) => {
  unlockWaveBadge(waveIndex);
  audio.playImpact();

  if (waveIndex < 4) {
    audio.playWaveTransition(waveIndex + 1);
    tunnel.setWavePulse(1);
    setTimeout(() => tunnel.setWavePulse(0), 3500);
    return;
  }

  // ══════ AFTER KILLING FINAL WAVE WORM — DRAMATIC TRANSITION TO BOSS BATTLE ══════
  showWaveHUD(false);

  audio.stopAllLoopingSfx();
  enemyManager.clear();
  enemyDeathManager.clear();
  slimeAttack.reset();
  ocularPrism.active = false;
  ocularPrism._stopPrism?.();     ocularPrism._stopPrism = null;
  ocularPrism._stopTelegraph?.(); ocularPrism._stopTelegraph = null;
  fractalCascade.reset();
  singularityBombManager.blackHole = null;

  cosmicPrismManager.stop();
  tesseractManager.stop();
  singularityBombManager.stop();
  tunnel.setBossTransitionSurge(1);
  _bossTracerTarget = 1;
  audio.playBossTransition1();

  setTimeout(() => tunnel.setBossFlash(1), 1000);

  setTimeout(() => {
    tunnel.setBossFlash(0);
    tunnel.setBossTransitionSurge(0);
    tunnel.setBossEmergenceFog(1);
    audio.playBossTransition2();
  }, 5000);

  setTimeout(() => {
    bossTransmission.play();
  }, 7000);

  setTimeout(() => {
    const raw = document.getElementById('score-value')?.textContent?.replace(/,/g, '') ?? '0';
    transitionScene.saveCheckpoint(parseInt(raw, 10) || 0);
    bossTransmission.hide();
    wormBoss.activate();
    ship.deathSequenceEnabled = false;
    audio.stopMusic();
  }, 16000);
};

gameplayScene.onGooHit = () => {
  if (ship.isAlive && !ship.isInvincible) {
    ship.takeDamage(CONFIG.GAMEPLAY.GOO_DAMAGE);
    audio.playOuch();
  }
};

// ==================== WAVE WORM CALLBACKS ====================
waveWormManager.onWormSpawn  = () => audio.playWaveWormSfx();

waveWormManager.onWormKilled = (x, y) => {
  projectileManager.createExplosion(x, y, 'zap');
};

// ==================== BOSS BATTLE SCENE CALLBACKS ====================
bossBattleScene.onCinematicStart = () => ship.enterCinematic();
bossBattleScene.onCinematicEnd   = () => ship.exitCinematic();
bossBattleScene.onCheckpoint     = () => {
  const raw = document.getElementById('score-value')?.textContent?.replace(/,/g, '') ?? '0';
  transitionScene.saveCheckpoint(parseInt(raw, 10) || 0);
};

bossBattleScene.onCollapseHit = () => {
  bossBattleScene.activateCellularDistort(ship);
  audio.playOuch();
};

wormBoss.onScreenShake = (strength, duration) => triggerScreenShake(strength, duration);

// ==================== WORM DEATH → CLOSING SCENE ====================
wormBoss.onDeath = () => {
  audio.stopMusic();
  ship.exitCinematic();
  document.querySelectorAll('#hud, #hp-container, #lives-container, #boss-health-container, #wave-hud, #ui-buttons, #bomb-container')
    .forEach(el => el.classList.add('pre-game-hidden'));
  const rawScore = document.getElementById('score-value')?.textContent?.replace(/,/g, '') ?? '0';
  closingScene.start(parseInt(rawScore, 10) || 0);
  setTimeout(() => projectileManager.clear(), 11000);
};

// ==================== CLOSING SCENE → BACK TO MENU ====================
closingScene.onBackToMenu = () => {
  audio.stop();
  window.location.reload();
};

ship.onHPChange    = (hp, max)   => updateHPBar(hp, max);
ship.onLivesChange = (lives)     => updateLivesDisplay(lives);

// ==================== SHIP DEATH SEQUENCE CALLBACK ====================
ship.onDeathSequenceStart = () => {
  audio.playGlitchOut();
};

function wireShipOnDeath() {
  ship.onDeath = (livesLeft) => {
    audio.stopMusic();
    const inWormBattle = wormBoss.isActive && !wormBoss.isDead;

    if (livesLeft <= 0 && inWormBattle) {
      babyWormManager.clear();
      bossBattleScene.startWormholeGameOver(ship);
      return;
    }

    if (inWormBattle) {
      babyWormManager.clear();
    }

    if (!inWormBattle) {
      enemyManager.clear();
      slimeAttack.reset();
      audio._stopSlimeSounds?.(); audio._stopSlimeSounds = null;
      ocularPrism.active = false;
      ocularPrism._stopPrism?.();     ocularPrism._stopPrism = null;
      ocularPrism._stopTelegraph?.(); ocularPrism._stopTelegraph = null;
      fractalCascade.reset();
    }

    transitionScene.handleDeath(livesLeft, inWormBattle);
  };
}
wireShipOnDeath();

// ==================== HUD HELPERS ====================
function updateHPBar(hp, maxHP) {
  const pct   = Math.max(0, (hp / maxHP) * 100);
  const fill  = document.getElementById('hp-bar-fill');
  const track = document.getElementById('hp-bar-track');
  if (fill)  fill.style.width = pct + '%';
  if (track) track.classList.toggle('hp-critical', pct < 30);
}

function updateLivesDisplay(lives) {
  const el = document.getElementById('lives-count');
  if (el) el.textContent = lives;
}

function updateBombDisplay(count) {
  const el = document.getElementById('bomb-count');
  if (el) el.textContent = `x ${count}`;
  const container = document.getElementById('bomb-container');
  if (container) {
    container.classList.toggle('bomb-empty', count === 0);
    container.classList.remove('bomb-flash');
    void container.offsetWidth;
    container.classList.add('bomb-flash');
  }
}

// ==================== WAVE HUD HELPERS ====================
function updateWaveCounter(kills, required) {
  const el = document.getElementById('wave-counter');
  if (!el) return;
  el.textContent = `${kills} / ${required}`;
  el.classList.remove('pop');
  void el.offsetWidth;
  el.classList.add('pop');
}

function unlockWaveBadge(waveIndex) {
  const badge = document.getElementById(`wave-badge-${waveIndex}`);
  if (!badge) return;
  badge.classList.remove('greyed');
  badge.classList.add('unlocked');
  badge.classList.remove('badge-flash');
  void badge.offsetWidth;
  badge.classList.add('badge-flash');
}

function showWaveHUD(visible) {
  const el = document.getElementById('wave-hud');
  if (el) el.classList.toggle('hidden', !visible);
}

function resetWaveBadges() {
  for (let i = 0; i < 5; i++) {
    const badge = document.getElementById(`wave-badge-${i}`);
    if (!badge) continue;
    badge.classList.remove('unlocked', 'badge-flash');
    badge.classList.add('greyed');
  }
}

// ==================== SCREEN SHAKE ====================
function triggerScreenShake(strength, duration) {
  _screenShakeStrength = strength;
  _screenShakeDuration = duration || 1;
  _screenShakeTimer    = _screenShakeDuration;
}

// ==================== SHOOT ====================
function doShoot() {
  if (isPaused || ship.isBarrelRolling) return;
  const crosshairPos = crosshair.getPosition();
  const shootData    = ship.shoot(crosshairPos.x, crosshairPos.y);
  if (shootData) {
    projectileManager.shoot(
      shootData.x, shootData.y,
      shootData.targetX, shootData.targetY,
      tesseractManager.isBoostActive()
    );
    muzzleFlash.trigger(shootData.x, shootData.y);
    audio.playLaser();
  }
}

// ==================== TRANSITION CALLBACKS ====================
transitionScene.onRestart = () => {
  ship.resetForNewGame();
  ship.deathSequenceEnabled = true;
  scoreManager.reset();
  enemyManager.clear();
  projectileManager.clear();
  babyWormManager.clear();
  slimeAttack.reset();
  audio._stopSlimeSounds?.(); audio._stopSlimeSounds = null;
  ocularPrism.active = false;
  ocularPrism._stopPrism?.();     ocularPrism._stopPrism = null;
  ocularPrism._stopTelegraph?.(); ocularPrism._stopTelegraph = null;
  gameplayScene.reset();
  resetWaveBadges();
  cosmicPrismManager.reset();
  tesseractManager.reset();
  singularityBombManager.reset();

  bossBattleScene.reset(ship);
  tunnel.resetBossTransition();
  _bossTracerTarget    = 0;
  _bossTracerIntensity = 0;
  CONFIG.ENEMIES.MAX_COUNT = currentEnemyCount;
  gameplayScene.start();

  bossBattleScene.updateHUD();
  audio.stop();
  audio.start();
  audio.startWaveMusic(0);
};

// ==================== WORMHOLE GAME OVER → RESTART FROM WAVE 1 ====================
bossBattleScene.onWormholeGameOver = () => {
  wormBoss.isActive = false;
  ship.resetForNewGame();
  ship.deathSequenceEnabled = true;
  scoreManager.reset();
  enemyManager.clear();
  projectileManager.clear();
  babyWormManager.clear();
  slimeAttack.reset();
  ocularPrism.active = false;
  ocularPrism._stopPrism?.();     ocularPrism._stopPrism = null;
  ocularPrism._stopTelegraph?.(); ocularPrism._stopTelegraph = null;
  enemyDeathManager.clear();
  gameplayScene.reset();
  resetWaveBadges();
  bossBattleScene.reset(ship);
  tunnel.resetBossTransition();
  _bossTracerTarget    = 0;
  _bossTracerIntensity = 0;

  CONFIG.ENEMIES.MAX_COUNT = currentEnemyCount;
  cosmicPrismManager.reset();
  tesseractManager.reset();
  singularityBombManager.reset();
  wireShipOnDeath();

  gameplayScene.start();
  bossBattleScene.updateHUD();
  showWaveHUD(true);

  audio.stop();
  audio.start();
  audio.startWaveMusic(0);
};

transitionScene.onContinue = () => {
  const inWormBattle = wormBoss.isActive && !wormBoss.isDead;
  const inGameplay   = gameplayScene.isActive();

  scoreManager.reset();
  const cpScore = transitionScene.getCheckpointScore();
  if (cpScore > 0) scoreManager.addScore(cpScore, -9999, -9999);

  if (inWormBattle) {
    wormBoss.activate();
    ship.deathSequenceEnabled = false;
    babyWormManager.clear();
    bossBattleScene.reset(ship);
    bossBattleScene.updateHUD();
  }

  if (inGameplay) {
    gameplayScene.restartCurrentWave();
  }

  ship.respawn();
  if (inWormBattle) {
    audio.startBossMusic();
  } else {
    audio.startWaveMusic(gameplayScene.getWaveIndex());
  }
};

transitionScene.onGameOver = () => audio.playGameOver1();

// ==================== GAME STATE ====================
let isPaused           = false;
let isMuted            = false;
let _prevBarrelRolling = false;
let _bossTracerIntensity = 0;
let _bossTracerTarget    = 0;
let _screenShakeTimer    = 0;
let _screenShakeStrength = 0;
let _screenShakeDuration = 1;

let currentEnemyCount = 5;

// ==================== KEYBOARD SHORTCUTS ====================
function deployBomb() {
  if (isPaused || !ship.isAlive) return;
  singularityBombManager.deploy(ship.x, ship.y);
}

window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyP') {
    isPaused = !isPaused;
    ui.update(isMuted, isPaused);
    return;
  }
  if (e.code === 'KeyM') {
    isMuted = audio.toggleMute();
    ui.update(isMuted, isPaused);
    return;
  }
  if (e.code === 'Space' && !isPaused && !ship.isBarrelRolling) {
    e.preventDefault();
    doShoot();
    return;
  }
  if (e.code === 'KeyQ' && !ship.isBarrelRolling) {
    e.preventDefault();
    ship.startBarrelRoll(-1);
    audio.playBarrelRoll();
    return;
  }
  if (e.code === 'KeyE' && !ship.isBarrelRolling) {
    e.preventDefault();
    ship.startBarrelRoll(1);
    audio.playBarrelRoll();
    return;
  }
  if (e.code === 'KeyF') {
    e.preventDefault();
    deployBomb();
    return;
  }
  if (e.code === 'ShiftRight') {
    e.preventDefault();
    ship.activateBoost();
    return;
  }
});

gameCanvas.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  deployBomb();
});

// ==================== BUTTON EVENTS ====================
document.getElementById('btn-sound')?.addEventListener('click', () => {
  isMuted = audio.toggleMute();
  ui.update(isMuted, isPaused);
});
document.getElementById('btn-pause')?.addEventListener('click', () => {
  isPaused = !isPaused;
  ui.update(isMuted, isPaused);
});

// ==================== WINDOW RESIZE ====================
window.addEventListener('resize', () => {
  tunnel.handleResize();
  gameCanvas.width  = window.innerWidth;
  gameCanvas.height = window.innerHeight;
  ship.handleResize();
  crosshair.handleResize();
});

// ==================== GAME LOOP ====================
let lastTime = performance.now();

function gameLoop() {
  requestAnimationFrame(gameLoop);
  const now = performance.now();
  const dt  = Math.min((now - lastTime) / 1000, 0.05);
  lastTime  = now;

  if (!isPaused && !transitionScene.isBlocking) {
    const enemies = enemyManager.getEnemies();

    if (closingScene.isActive()) {
      closingScene.update(dt);
      starfield.render();
      ship.update(dt);
    } else {
      tunnel.update(dt);
      const shipOffset = ship.getOffset();
      tunnel.updateShipOffset(shipOffset.x, shipOffset.y);

      const suctionOn = bossBattleScene.isSuctionActive;
      tunnel.setSuctionIntensity(suctionOn ? 1 : 0);

      //  SLIME ATTACK UPDATE
      const activeGlork = enemies.find(e => e.type === 'TANK' && e.scale > CONFIG.SLIME_ATTACK.MIN_SCALE);
      const gx = activeGlork ? activeGlork.x : window.innerWidth  / 2;
      const gy = activeGlork ? activeGlork.y : window.innerHeight / 2;
      slimeAttack.update(dt, gx, gy, ship.x, ship.y);

      tunnel.setSlimeIntensity(slimeAttack.getSlimeIntensity());
      ship.setSlimeHeaviness(slimeAttack.getSlimeIntensity());

      ship.update(dt);

      crosshair.update(shipOffset.x, shipOffset.y, dt, enemies);
      enemyManager.update(dt, ship.x, ship.y);
      gameplayScene.update(dt, ship.x, ship.y);
      bossBattleScene.update(dt, ship);

      // SINGULARITY BOMB
      singularityBombManager.update(dt, ship.x, ship.y);
      singularityBombManager.applyGravityAndBossEffect(dt, enemies, wormBoss);
      setActiveSingularityBH(
        singularityBombManager.blackHole && !singularityBombManager.blackHole.isDead()
          ? singularityBombManager.blackHole
          : null
      );

      if (wormBoss.isActive) {
        if (wormBoss.alpha > 0.5)  tunnel.setBossEmergenceFog(0);
        if (wormBoss.alpha > 0.85) _bossTracerTarget = 0;
      }
      _bossTracerIntensity += (_bossTracerTarget - _bossTracerIntensity) * 0.04;
    }
    projectileManager.update(dt);
    muzzleFlash.update(dt);
    scoreManager.update(dt);
    ocularPrism.update(dt);
    if (_screenShakeTimer > 0) _screenShakeTimer = Math.max(0, _screenShakeTimer - dt);
    if (gameplayScene.isActive()) fractalCascade.update(dt, ship.x, ship.y, ship);
    cosmicPrismManager.update(dt, ship.x, ship.y);
    tesseractManager.update(dt, ship.x, ship.y);
    enemyDeathManager.update(dt);

    // BARREL ROLL RISING EDGE — DETACH ALL LATCHED BABY WORMS
    if (ship.isBarrelRolling && !_prevBarrelRolling) {
      const detached = babyWormManager.detachAll(ship, ship.barrelRollDirection);
      if (detached > 0) audio.playImpact();
    }
    _prevBarrelRolling = ship.isBarrelRolling;

    // ========================= COLLISION =========================
    const projectiles = projectileManager.getProjectiles();

    for (let i = projectiles.length - 1; i >= 0; i--) {
      const projectile = projectiles[i];

      // PROJECTILE vs ENEMIES
      for (let j = enemies.length - 1; j >= 0; j--) {
        const enemy   = enemies[j];
        const pos     = enemy.getPosition();
        const hit     = segmentCircleCollision(
          projectile.getSegment(),
          { x: pos.x, y: pos.y, radius: enemy.getSize() }
        );
        if (hit) {
          projectileManager.removeProjectile(projectile);
          const boostActive = tesseractManager.isBoostActive();
          const destroyed   = enemy.takeDamage(boostActive ? 2 : 1);
          if (destroyed) {
            projectileManager.createExplosion(pos.x, pos.y, boostActive ? 'boom' : 'bam');
            scoreManager.addScore(enemy.score, pos.x, pos.y);
            enemyDeathManager.spawn(enemy);
            audio.playEnemyDeath();
          }
          audio.playImpact();
          break;
        }
      }

      // PROJECTILE vs WORM BOSS + BABY WORMS
      if (!projectile.isDead) {
        if (bossBattleScene.processProjectileHit(projectile)) continue;
      }

      // PROJECTILE vs OCULAR PRISM PUPIL
      if (!projectile.isDead && ocularPrism.active) {
        const seg = projectile.getSegment();
        if (ocularPrism.checkProjectileHit(seg.x1, seg.y1)) {
          projectileManager.removeProjectile(projectile);
          audio.playImpact();
          scoreManager.addScore(CONFIG.OCULAR_PRISM.PUPIL_HIT_SCORE, gameCanvas.width / 2, gameCanvas.height / 2);
        }
      }

      // PROJECTILE vs WAVE WORM
      if (!projectile.isDead && gameplayScene.isActive()) {
        const wormHit = gameplayScene.checkWormHit(
          projectile.getSegment(),
          tesseractManager.isBoostActive() ? 2 : 1
        );
        if (wormHit.hit) {
          projectileManager.removeProjectile(projectile);
          audio.playImpact();
          if (wormHit.killed) {
            scoreManager.addScore(CONFIG.GAMEPLAY.WAVE_WORM_KILL_SCORE, wormHit.x, wormHit.y);
          }
        }
      }
    }

    // ENEMY BODY COLLISION vs SHIP
    if (ship.isAlive && !ship.isInvincible) {
      const collisionDamage = enemyManager.checkCollisions(ship.x, ship.y);
      if (collisionDamage > 0) { ship.takeDamage(collisionDamage); audio.playOuch(); }
    }

    // ENEMY LASER vs SHIP
    if (ship.isAlive && !ship.isInvincible) {
      const laserDamage = enemyManager.checkLaserHits(ship.x, ship.y);
      if (laserDamage > 0) { ship.takeDamage(laserDamage); audio.playOuch(); }
    }
  }

  if (!closingScene.shouldHideTunnel) tunnel.render();

  bossBattleScene.updateHUD(); // MUST RUN EVEN PAUSED SO BAR DOESN'T FREEZE
  ctx.clearRect(0, 0, gameCanvas.width, gameCanvas.height);

  // CANVAS SCREEN SHAKE
  const shakeDecay = _screenShakeDuration > 0 ? _screenShakeTimer / _screenShakeDuration : 0;
  const shakeX = _screenShakeTimer > 0 ? (Math.random() - 0.5) * 2 * _screenShakeStrength * shakeDecay : 0;
  const shakeY = _screenShakeTimer > 0 ? (Math.random() - 0.5) * 2 * _screenShakeStrength * shakeDecay : 0;
  ctx.save();
  ctx.translate(shakeX, shakeY);

  projectileManager.draw(ctx); // ALWAYS DRAW — EXPLOSIONS MUST SURVIVE INTO CLOSING SCENE
  if (!closingScene.isActive()) {
    wormBoss.draw(ctx);
    bossBattleScene.drawCellular(ctx);
    babyWormManager.draw(ctx);
    crosshair.draw(ctx);
    gameplayScene.drawBehindEnemies(ctx);
    singularityBombManager.drawBlackHole(ctx);
    enemyManager.draw(ctx);
    enemyDeathManager.draw(ctx);
    gameplayScene.drawAboveEnemies(ctx);
    if (gameplayScene.isActive()) cosmicPrismManager.draw(ctx);
    if (gameplayScene.isActive()) tesseractManager.drawItems(ctx);
    if (gameplayScene.isActive()) singularityBombManager.drawItems(ctx);
    if (gameplayScene.isActive()) fractalCascade.drawEchoes(ctx, ship.x, ship.y);
  }

  slimeAttack.drawScreenSlime(ctx);

  // SLIME GHOST TRAIL
  if (slimeAttack.getSlimeIntensity() > 0.02) {
    const sprite     = ImageLoader.isLoaded('ship') ? ImageLoader.get('ship') : null;
    const frameW     = sprite ? sprite.width / CONFIG.SHIP.SPRITE_FRAMES : 0;
    const trailSnaps = ship.getTrailPositions();
    if (sprite && trailSnaps.length > 0) {
      const si = slimeAttack.getSlimeIntensity();
      for (let i = 0; i < trailSnaps.length; i++) {
        const snap       = trailSnaps[i];
        const ageFrac    = (trailSnaps.length - i) / trailSnaps.length;
        const alpha      = si * 0.5 * (1 - ageFrac * 0.9);
        if (alpha < 0.01) continue;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(snap.x, snap.y);
        ctx.rotate(snap.rotation);
        ctx.drawImage(
          sprite,
          snap.frame * frameW, 0, frameW, sprite.height,
          -CONFIG.SHIP.WIDTH / 2, -CONFIG.SHIP.HEIGHT / 2,
          CONFIG.SHIP.WIDTH, CONFIG.SHIP.HEIGHT
        );
        ctx.globalCompositeOperation = 'source-atop';
        ctx.globalAlpha = alpha * 0.7;
        ctx.fillStyle   = '#22ff66';
        ctx.fillRect(-CONFIG.SHIP.WIDTH / 2, -CONFIG.SHIP.HEIGHT / 2, CONFIG.SHIP.WIDTH, CONFIG.SHIP.HEIGHT);
        ctx.restore();
      }
    }
  }

  // CELLULAR DISTORTION TRACERS
  if (ship._cellularDistortActive) {
    const sprite     = ImageLoader.isLoaded('ship') ? ImageLoader.get('ship') : null;
    const frameW     = sprite ? sprite.width / CONFIG.SHIP.SPRITE_FRAMES : 0;
    const trailSnaps = ship.getTrailPositions();
    if (sprite && trailSnaps.length > 0) {
      for (let i = 0; i < trailSnaps.length; i++) {
        const snap    = trailSnaps[i];
        const ageFrac = (trailSnaps.length - i) / trailSnaps.length;
        const alpha   = 0.55 * (1 - ageFrac * 0.88);
        if (alpha < 0.01) continue;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(snap.x, snap.y);
        ctx.rotate(snap.rotation);
        ctx.drawImage(sprite, snap.frame * frameW, 0, frameW, sprite.height,
          -CONFIG.SHIP.WIDTH / 2, -CONFIG.SHIP.HEIGHT / 2,
          CONFIG.SHIP.WIDTH, CONFIG.SHIP.HEIGHT);
        ctx.globalCompositeOperation = 'source-atop';
        ctx.globalAlpha = alpha * 0.85;
        ctx.fillStyle   = '#cc0099';
        ctx.fillRect(-CONFIG.SHIP.WIDTH / 2, -CONFIG.SHIP.HEIGHT / 2, CONFIG.SHIP.WIDTH, CONFIG.SHIP.HEIGHT);
        ctx.restore();
      }
      for (let i = Math.max(0, trailSnaps.length - 3); i < trailSnaps.length; i++) {
        const snap    = trailSnaps[i];
        const ageFrac = (trailSnaps.length - i) / trailSnaps.length;
        const alpha   = 0.28 * (1 - ageFrac * 0.5);
        if (alpha < 0.01) continue;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.globalCompositeOperation = 'lighter';
        ctx.translate(snap.x, snap.y);
        ctx.rotate(snap.rotation);
        ctx.drawImage(sprite, snap.frame * frameW, 0, frameW, sprite.height,
          -CONFIG.SHIP.WIDTH * 0.6, -CONFIG.SHIP.HEIGHT * 0.6,
          CONFIG.SHIP.WIDTH * 1.2, CONFIG.SHIP.HEIGHT * 1.2);
        ctx.restore();
      }
    }
  }

  // BOSS TRANSITION CRIMSON TRACERS
  if (_bossTracerIntensity > 0.01) {
    const sprite     = ImageLoader.isLoaded('ship') ? ImageLoader.get('ship') : null;
    const frameW     = sprite ? sprite.width / CONFIG.SHIP.SPRITE_FRAMES : 0;
    const trailSnaps = ship.getTrailPositions();
    if (sprite && trailSnaps.length > 0) {
      const ti = _bossTracerIntensity;
      for (let i = 0; i < trailSnaps.length; i++) {
        const snap    = trailSnaps[i];
        const ageFrac = (trailSnaps.length - i) / trailSnaps.length;
        const alpha   = ti * 0.55 * (1 - ageFrac * 0.88);
        if (alpha < 0.01) continue;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(snap.x, snap.y);
        ctx.rotate(snap.rotation);
        ctx.drawImage(sprite, snap.frame * frameW, 0, frameW, sprite.height,
          -CONFIG.SHIP.WIDTH / 2, -CONFIG.SHIP.HEIGHT / 2,
          CONFIG.SHIP.WIDTH, CONFIG.SHIP.HEIGHT);
        ctx.globalCompositeOperation = 'source-atop';
        ctx.globalAlpha = alpha * 0.85;
        ctx.fillStyle   = '#ff1133';
        ctx.fillRect(-CONFIG.SHIP.WIDTH / 2, -CONFIG.SHIP.HEIGHT / 2, CONFIG.SHIP.WIDTH, CONFIG.SHIP.HEIGHT);
        ctx.restore();
      }
      for (let i = Math.max(0, trailSnaps.length - 3); i < trailSnaps.length; i++) {
        const snap    = trailSnaps[i];
        const ageFrac = (trailSnaps.length - i) / trailSnaps.length;
        const alpha   = ti * 0.28 * (1 - ageFrac * 0.5);
        if (alpha < 0.01) continue;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.globalCompositeOperation = 'lighter';
        ctx.translate(snap.x, snap.y);
        ctx.rotate(snap.rotation);
        ctx.drawImage(sprite, snap.frame * frameW, 0, frameW, sprite.height,
          -CONFIG.SHIP.WIDTH * 0.6, -CONFIG.SHIP.HEIGHT * 0.6,
          CONFIG.SHIP.WIDTH * 1.2, CONFIG.SHIP.HEIGHT * 1.2);
        ctx.restore();
      }
    }
  }

  muzzleFlash.draw(ctx);
  ship.draw();
  fractalCascade.drawTelegraph(ctx, ship.x, ship.y);
  tesseractManager.drawAuraAndHUD(ctx, ship.x, ship.y);
  slimeAttack.drawWingDrip(
    ctx,
    ship.x, ship.y, ship.rotation,
    CONFIG.SHIP.WIDTH, CONFIG.SHIP.HEIGHT
  );
  babyWormManager.drawSlime(ctx);

  if (ocularPrism.active) {
    ocularPrism.captureFrame(tunnel.renderer.domElement, gameCanvas);
    ocularPrism.render(ctx);
  }

  if (closingScene.isActive()) closingScene.renderWhale(ctx);
  closingScene.renderFlash(ctx);
  ctx.restore(); // END SCREEN SHAKE TRANSLATE
}

// ==================== STARTUP ====================
async function startup() {
  await ImageLoader.preloadCritical();

  const { enemyCount } = await menu.show(starfield, () => audio.start());
  currentEnemyCount = enemyCount;

  await openingScene.play(true);

  // REVEAL HUD AND MOBILE CONTROLS AFTER OPENING SCENE
  document.querySelectorAll('.pre-game-hidden').forEach(el => el.classList.remove('pre-game-hidden'));
  revealMobileControls();

  CONFIG.ENEMIES.MAX_COUNT = 0;
  gameplayScene.start();
  showWaveHUD(true);

  updateHPBar(ship.getHP(), CONFIG.SHIP_HP.MAX_HP);
  updateLivesDisplay(ship.getLives());

  initKeyboard();
  ship.onBoost = () => audio.playBoost();
  initMobileControls(
    (direction) => { ship.startBarrelRoll(direction); audio.playBarrelRoll(); },
    () => doShoot(),
    () => ship.activateBoost(),
    () => deployBomb()
  );

  lastTime = performance.now();
  gameLoop();
}

startup();