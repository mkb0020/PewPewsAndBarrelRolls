// Updated 3/7/26 @ 12:30AM
// main.js
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


console.log('=== YOU HAVE NOW ENTERED THE WORMHOLE! ===');

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
const babyWormManager   = new BabyWormManager();
const menu              = new Menu();
const slimeAttack       = new SlimeAttack();
const ocularPrism       = new OcularPrism();
const waveWormManager   = new WaveWormManager();
const cosmicPrismManager = new CosmicPrismManager();
cosmicPrismManager.audio = audio; 
const tesseractManager   = new TesseractFragmentManager();
tesseractManager.audio   = audio;
const singularityBombManager = new SingularityBombManager();
singularityBombManager.audio = audio;
singularityBombManager.onSpinorCollect = () => tunnel.triggerSpinor(); // 💠 SPINOR PICKUP → 720° TUNNEL ROLL
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
});

// ==================== ENEMY CALLBACKS ====================
enemyManager.onLaserFired  = () => audio.playEnemyLaser();
enemyManager.onBuzzStart   = () => audio.startLoopBuzz(0.35);
enemyManager.onTelegraph   = () => { ocularPrism._stopTelegraph = audio.startLoopTelegraph(); };
enemyManager.onOcularPrism = (w, h) => {
  ocularPrism._stopTelegraph?.(); 
  ocularPrism._stopTelegraph = null;
  ocularPrism._stopPrism = audio.startLoopPrism();
  ocularPrism.activate(w, h);
};
enemyManager.onSlimeAttack = (glorkX, glorkY) => {
  ImageLoader.load('slimeProjectiles');
  ImageLoader.load('slimeDrip');
  slimeAttack.trigger(glorkX, glorkY);
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

// ==================== SLIME ATTACK CALLBACKS ====================
slimeAttack.onSplat = () => audio.playSplat();

// ==================== COSMIC PRISM CALLBACKS ====================
cosmicPrismManager.onCollect = (healAmt) => {
  ship.heal(healAmt);
};

// ==================== TESSERACT FRAGMENT CALLBACKS ====================
tesseractManager.onCollect = () => {
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
  if (waveIndex > 0) audio.startWaveMusic(waveIndex); // 🎵 WAVE 1 MUSIC FIRED BY openingScene
  if (waveIndex === 0) {
    cosmicPrismManager.start();        // 🔮 BEGIN PRISM SPAWNING FROM WAVE 1
    tesseractManager.start();          // ◈ BEGIN TESSERACT SPAWNING FROM WAVE 1
    singularityBombManager.start();    // 💣 BEGIN SINGULARITY BOMB SPAWNING FROM WAVE 1
  }
};

gameplayScene.onWaveCleared = (waveIndex) => {
  unlockWaveBadge(waveIndex);
  audio.playImpact();

  if (waveIndex < 4) {
    audio.playWaveTransition(waveIndex + 1); // WAVES 1-4 ONLY
    tunnel.setWavePulse(1);
    setTimeout(() => tunnel.setWavePulse(0), 3500); // FADE BACK BEFORE NEXT WAVE STARTS
    return;
  }

  // ══════ AFTER KILLING FINAL WAVE WORM - DRAMATIC TRANSITION TO BOSS BATTLE ══════
  showWaveHUD(false);
  cosmicPrismManager.stop(); // 🔮 NO PRISMS DURING BOSS SEQUENCE
  tesseractManager.stop();   // ◈ NO TESSERACT FRAGMENTS DURING BOSS SEQUENCE
  singularityBombManager.stop(); // 💣 NO NEW BOMBS DURING BOSS SEQUENCE (keep inventory)
  tunnel.setBossTransitionSurge(1); // PHASE 1 (t=0s): SURGE — TUNNEL SPEEDS AND TURNS RED - TRACERS ON
  _bossTracerTarget = 1;
  audio.playBossTransition1(); // PHASE 1 SFX — TUNNEL SURGE

  setTimeout(() => tunnel.setBossFlash(1), 1000); // PHASE 2 (t=1s): RED -> FLASHES

  setTimeout(() => {
    tunnel.setBossFlash(0);
    tunnel.setBossTransitionSurge(0);
    tunnel.setBossEmergenceFog(1);
    audio.playBossTransition2(); // PHASE 3 SFX — DARKNESS HITS
  }, 5000); // PHASE 3 (t=5s): FLASHES STOP AND CUT TO DARKNESS

  setTimeout(() => {
    bossTransmission.play();
  }, 7000); // (t=7s): DEEP SPACE COMMAND TRANSMISSION BEGINS - TRANSMISSION APPEARS 2 SECONDS INTO BLACKOUT

  setTimeout(() => {
    const raw = document.getElementById('score-value')?.textContent?.replace(/,/g, '') ?? '0';
    transitionScene.saveCheckpoint(parseInt(raw, 10) || 0);
    bossTransmission.hide();
    wormBoss.activate();
    audio.stopMusic();
  }, 16000); // PHASE 4 (t=16s): WORM ACTIVATES — EMERGES FROM FOG

};

gameplayScene.onAllWavesComplete = () => {
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

// ==================== WORM DEATH → CLOSING SCENE ====================
wormBoss.onDeath = () => {
  audio.stopMusic();
  ship.exitCinematic();
  document.querySelectorAll('#hud, #hp-container, #lives-container, #boss-health-container, #wave-hud, #ui-buttons, #bomb-container')
    .forEach(el => el.classList.add('pre-game-hidden'));
  const rawScore = document.getElementById('score-value')?.textContent?.replace(/,/g, '') ?? '0';
  closingScene.start(parseInt(rawScore, 10) || 0);
  setTimeout(() => projectileManager.clear(), 11000);
  console.log('★ Worm defeated — closing scene triggered');
};

// ==================== SHIP CALLBACKS ====================
ship.onHPChange    = (hp, max)   => updateHPBar(hp, max);
ship.onLivesChange = (lives)     => updateLivesDisplay(lives);
ship.onDeath       = (livesLeft) => {
  audio.stopMusic();
  const inWormBattle = wormBoss.isActive && !wormBoss.isDead;

  // BOSS GAME OVER — SWALLOW SEQUENCE INSTEAD OF INSTANT GAME OVER SCREEN
  if (livesLeft <= 0 && inWormBattle) {
    babyWormManager.clear(); // CLEAR BABY WORMS BEFORE VORTEX BEGINS SO THEY DON'T LATCH ON POST-RESET
    bossBattleScene.startWormholeGameOver(ship);
    return;
  }

  // BOSS REGULAR DEATH — CLEAR BABY WORMS SO THEY DON'T PERSIST ON THE DIED SCREEN
  if (inWormBattle) {
    babyWormManager.clear();
  }

  // GAMEPLAY DEATH (REGULAR OR GAME OVER) — CLEAR ALL ENEMIES AND CANCEL ANY ACTIVE ATTACKS
  if (!inWormBattle) {
    enemyManager.clear();
    slimeAttack.reset();
    ocularPrism.active = false;
    ocularPrism._stopPrism?.();     ocularPrism._stopPrism = null;
    ocularPrism._stopTelegraph?.(); ocularPrism._stopTelegraph = null;
  }

  transitionScene.handleDeath(livesLeft, inWormBattle);
};

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

// ==================== SHOOT ====================
function doShoot() {
  if (isPaused || ship.isBarrelRolling) return;
  const crosshairPos = crosshair.getPosition();
  const shootData    = ship.shoot(crosshairPos.x, crosshairPos.y);
  if (shootData) {
    projectileManager.shoot(
      shootData.x, shootData.y,
      shootData.targetX, shootData.targetY,
      tesseractManager.isBoostActive()   // BOOSTED = RAINBOW, WIDER BEAM
    );
    muzzleFlash.trigger(shootData.x, shootData.y);
    audio.playLaser();
  }
}

// ==================== TRANSITION CALLBACKS ====================
transitionScene.onRestart = () => {
  ship.resetForNewGame();
  scoreManager.reset();
  enemyManager.clear();
  projectileManager.clear();
  babyWormManager.clear();
  slimeAttack.reset();
  ocularPrism.active = false;
  ocularPrism._stopPrism?.();     ocularPrism._stopPrism = null;
  ocularPrism._stopTelegraph?.(); ocularPrism._stopTelegraph = null;
  gameplayScene.reset();
  cosmicPrismManager.reset();
  tesseractManager.reset();
  singularityBombManager.reset();

  bossBattleScene.reset();
  tunnel.resetBossTransition();
  _bossTracerTarget    = 0;
  _bossTracerIntensity = 0;
  CONFIG.ENEMIES.MAX_COUNT = (currentMode === 'gameplay') ? currentEnemyCount : 0;
  if (currentMode === 'bossBattle') wormBoss.activate();
  if (currentMode === 'gameplay')   gameplayScene.start();

  bossBattleScene.updateHUD();
  audio.stop();
  audio.start();
  if (currentMode !== 'bossBattle') audio.startWaveMusic(0);
};

// ==================== WORMHOLE GAME OVER → RESTART FROM WAVE 1 ====================
// FIRES AFTER THE VORTEX SEQUENCE COMPLETES — FULL RESET, BACK TO WAVE 1
bossBattleScene.onWormholeGameOver = () => {
  wormBoss.isActive = false;  // HIDE WORM IMMEDIATELY — WILL RE-ACTIVATE WHEN PLAYER REACHES BOSS BATTLE AGAIN
  ship.resetForNewGame();
  scoreManager.reset();
  enemyManager.clear();
  projectileManager.clear();
  babyWormManager.clear();
  slimeAttack.reset();
  ocularPrism.active = false;
  ocularPrism._stopPrism?.();     ocularPrism._stopPrism = null;
  ocularPrism._stopTelegraph?.(); ocularPrism._stopTelegraph = null;
  gameplayScene.reset();
  bossBattleScene.reset();
  tunnel.resetBossTransition();
  _bossTracerTarget    = 0;
  _bossTracerIntensity = 0;

  currentMode = 'gameplay'; // ALWAYS RETURN TO WAVE 1 — NEVER BACK TO BOSS DIRECTLY
  CONFIG.ENEMIES.MAX_COUNT = currentEnemyCount;
  cosmicPrismManager.reset();
  tesseractManager.reset();
  singularityBombManager.reset();
  gameplayScene.start();
  bossBattleScene.updateHUD();
  showWaveHUD(true);

  audio.stop();
  audio.start();
  audio.startWaveMusic(0);

  console.log('★ Wormhole game over — restarting from wave 1');
};

transitionScene.onContinue = () => {
  const inWormBattle = wormBoss.isActive && !wormBoss.isDead;
  const inGameplay   = gameplayScene.isActive();

  scoreManager.reset();
  const cpScore = transitionScene.getCheckpointScore();
  if (cpScore > 0) scoreManager.addScore(cpScore, -9999, -9999);

  if (inWormBattle) {
    wormBoss.activate();
    babyWormManager.clear();
    bossBattleScene.reset();
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
let _bossTracerIntensity = 0;   // CRIMSON SHIP TRACER — DRIVES BOSS TRANSITION VISUAL
let _bossTracerTarget    = 0;

let currentMode       = 'bossBattle'; 
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

    //  THREE.JS BACKGROUND 
    if (closingScene.isActive()) {
      closingScene.update(dt);         
      starfield.render();              
      ship.update(dt);                 // SHIP STAYS CONTROLLABLE IN OPEN SPACE
    } else {
      tunnel.update(dt);
      const shipOffset = ship.getOffset();
      tunnel.updateShipOffset(shipOffset.x, shipOffset.y);

      const suctionOn = bossBattleScene.isSuctionActive;
      tunnel.setSuctionIntensity(suctionOn ? 1 : 0);

      //  SLIME ATTACK UPDATE
      const glorks      = enemyManager.getEnemies().filter(e => e.type === 'TANK');
      const activeGlork = glorks.find(g => g.scale > CONFIG.SLIME_ATTACK.MIN_SCALE);
      const gx = activeGlork ? activeGlork.x : window.innerWidth  / 2;
      const gy = activeGlork ? activeGlork.y : window.innerHeight / 2;
      slimeAttack.update(dt, gx, gy, ship.x, ship.y);

      tunnel.setSlimeIntensity(slimeAttack.getSlimeIntensity());
      ship.setSlimeHeaviness(slimeAttack.getSlimeIntensity());

      ship.update(dt);
      crosshair.update(shipOffset.x, shipOffset.y, dt, enemyManager.getEnemies());
      enemyManager.update(dt, ship.x, ship.y);
      gameplayScene.update(dt, ship.x, ship.y);
      bossBattleScene.update(dt, ship);

      // SINGULARITY BOMB —
      singularityBombManager.update(dt, ship.x, ship.y);
      singularityBombManager.applyGravityAndBossEffect(dt, enemyManager.getEnemies(), wormBoss);
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
    cosmicPrismManager.update(dt, ship.x, ship.y);
    tesseractManager.update(dt, ship.x, ship.y);

    // BARREL ROLL RISING EDGE — DETACH ALL LATCHED BABY WORMS
    if (ship.isBarrelRolling && !_prevBarrelRolling) {
      const detached = babyWormManager.detachAll();
      if (detached > 0) audio.playImpact();
    }
    _prevBarrelRolling = ship.isBarrelRolling;

    // ========================= COLLISION  =========================
    const projectiles = projectileManager.getProjectiles();
    const enemies     = enemyManager.getEnemies();

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
 
  projectileManager.draw(ctx); // ALWAYS DRAW — EXPLOSIONS MUST SURVIVE INTO CLOSING SCENE
    if (!closingScene.isActive()) {
      wormBoss.draw(ctx);
      babyWormManager.draw(ctx);
      crosshair.draw(ctx);
      gameplayScene.drawBehindEnemies(ctx);
      singularityBombManager.drawBlackHole(ctx); // 💣 BLACK HOLE BEHIND ENEMIES
      enemyManager.draw(ctx);
      gameplayScene.drawAboveEnemies(ctx);
      if (gameplayScene.isActive()) cosmicPrismManager.draw(ctx); // 🔮 PRISMS ABOVE ENEMIES, BELOW SHIP
      if (gameplayScene.isActive()) tesseractManager.drawItems(ctx); // ◈ TESSERACT FRAGMENTS
      if (gameplayScene.isActive()) singularityBombManager.drawItems(ctx); // 💣 SPINOR COLLECTIBLES
  }

  slimeAttack.draw(ctx);

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

  //  BOSS TRANSITION CRIMSON TRACERS
  if (_bossTracerIntensity > 0.01) {
    const sprite     = ImageLoader.isLoaded('ship') ? ImageLoader.get('ship') : null;
    const frameW     = sprite ? sprite.width / CONFIG.SHIP.SPRITE_FRAMES : 0;
    const trailSnaps = ship.getTrailPositions();
    if (sprite && trailSnaps.length > 0) {
      const ti = _bossTracerIntensity;

      // PASS 1 — CRIMSON GHOST SHIPS
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

      // PASS 2 — HOT ADDITIVE GLOW ON FRESHEST 3 GHOSTS
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

  tesseractManager.drawAuraAndHUD(ctx, ship.x, ship.y); // ◈ LASER BOOST AURA + HUD TIMER

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

  closingScene.renderFlash(ctx);
}

// ==================== STARTUP ====================
async function startup() {
  await ImageLoader.preloadCritical();
  console.log('✔ Images ready');

  const { mode, enemyCount } = await menu.show(starfield, () => audio.start());

  currentMode       = mode;
  currentEnemyCount = enemyCount;
  console.log(`▶ Mode: ${mode} | Enemies: ${enemyCount}`);

  await openingScene.play(true); 
  console.log('✔ Opening scene complete');

  // REVEAL HUD AND MOBILE CONTROLS AFTER OPENING SCENE
  document.querySelectorAll('.pre-game-hidden').forEach(el => el.classList.remove('pre-game-hidden'));
  revealMobileControls();

  if (mode === 'bossBattle') {
    CONFIG.ENEMIES.MAX_COUNT = 0;
    wormBoss.activate();
  } else {
    CONFIG.ENEMIES.MAX_COUNT = 0;  
    gameplayScene.start();
    showWaveHUD(true);
  }

  updateHPBar(ship.getHP(), CONFIG.SHIP_HP.MAX_HP);
  updateLivesDisplay(ship.getLives());

  initKeyboard();
  initMobileControls(
    (direction) => { ship.startBarrelRoll(direction); audio.playBarrelRoll(); },
    () => doShoot(),
    () => audio.playPowerUp1(),   
    () => deployBomb()           
  );


  lastTime = performance.now();
  console.log('=== Starting game loop ===');
  gameLoop();
}

startup();