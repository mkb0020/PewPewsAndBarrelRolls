// main.js
// ~~~~~~~~~~~~~~~~~~~~ IMPORTS ~~~~~~~~~~~~~~~~~~~~
import { CONFIG }                                    from './utils/config.js';
import { initKeyboard, initMobileControls }          from './utils/controls.js';
import { segmentCircleCollision }                    from './utils/collision.js';
import { AudioManager }                              from './utils/audio.js';
import { GameUI }                                    from './utils/ui.js';
import { ScoreManager }                              from './utils/score.js';
import { ImageLoader }                               from './utils/imageLoader.js';
import { Tunnel }                                    from './visuals/tunnel.js';
import { Ship }                                      from './entities/ship.js';
import { EnemyManager }                              from './entities/enemies.js';
import { ProjectileManager, Crosshair, MuzzleFlash } from './entities/projectiles.js';
import { WormBoss }                                  from './entities/worm.js';
import { BabyWormManager }                           from './entities/babyWorm.js';
import { Menu }                                      from './scenes/menu.js';
import { SlimeAttack }                               from './entities/slimeAttack.js';
import { OcularPrism }                               from './entities/ocularPrism.js';
import { WaveWormManager }                           from './entities/waveWorm.js';
import { GameplayScene }                             from './scenes/gameplay.js';

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
const gameplayScene     = new GameplayScene({
  enemyManager,
  waveWormManager,
  scoreManager,
  audio,
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

// ==================== GAMEPLAY SCENE CALLBACKS ====================
gameplayScene.onCheckpoint = () => saveCheckpoint();

gameplayScene.onWormKill = (kills, required) => {
  updateWaveCounter(kills, required);
};

gameplayScene.onWaveStart = (waveIndex) => {
  updateWaveCounter(0, waveWormManager.getRequired());
  showWaveHUD(true);
  audio.startWaveMusic(waveIndex); // 🎵 KICK OFF THIS WAVE'S LOOP
};

gameplayScene.onWaveCleared = (waveIndex) => {
  unlockWaveBadge(waveIndex);
  audio.playImpact();
  audio.playWaveTransition(); // 🎵 CUT WAVE MUSIC, PLAY TRANSITION STING
};

gameplayScene.onAllWavesComplete = () => {
  showWaveHUD(false);

  setTimeout(() => {
    saveCheckpoint();               
    wormBoss.activate();
    audio.stopMusic();
    audio.playWormIntro();
    audio.startBossMusic();
  }, CONFIG.GAMEPLAY.BOSS_ENTRY_DELAY * 1000);
};

gameplayScene.onGooHit = () => {
  if (ship.isAlive && !ship.isInvincible) {
    ship.takeDamage(CONFIG.GAMEPLAY.GOO_DAMAGE);
    audio.playOuch();
  }
};

// ==================== WAVE WORM CALLBACKS ====================
waveWormManager.onWormSpawn  = () => audio.playWaveWormSfx(); // 🎵 8-SEC SPAWN CUE

waveWormManager.onWormKilled = (x, y) => {
  projectileManager.createExplosion(x, y, 'zap'); // ⚡ ZAP SPRITE — 6 FRAMES
};

// ==================== WORM CALLBACKS ====================
wormBoss.onAttack        = null; 
wormBoss.onIntro = () => {
  audio.stopMusic();      
  audio.startBossMusic(); 
  ImageLoader.load('slime'); 
};
wormBoss.onDeathPauseEnd = () => audio.playWormDeath2();
wormBoss.onSpawnBabyWorms = (mx, my) => {
  babyWormManager.spawnWave(mx, my);
  audio.playBabyWorms();
  babyWormManager.triggerSlimeSplat(gameCanvas.width, gameCanvas.height);
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
  updateBossHealthBar(0);
  showBossDefeated();
  const cx = window.innerWidth  / 2;
  const cy = window.innerHeight / 2;
  scoreManager.addScore(2000, cx, cy - 60);

  // RESPAWN AFTER 10s — TIMED TO LET wormDeath3 FINISH BEFORE MUSIC RETURNS
  setTimeout(() => {
    if (!isGameOver) {
      wormBoss.activate();
      ship.exitCinematic();
      audio.playWormIntro();
      audio.startBossMusic();  
    }
  }, 10000);
};

// ==================== SHIP CALLBACKS ====================
ship.onHPChange    = (hp, max)   => updateHPBar(hp, max);
ship.onLivesChange = (lives)     => updateLivesDisplay(lives);
ship.onDeath       = (livesLeft) => {
  audio.stopMusic();
  if (livesLeft <= 0) {
    isGameOver = true;
    showGameOver();
  } else {
    const inWormBattle = wormBoss.isActive && !wormBoss.isDead;
    showDiedScreen(inWormBattle);
  }
};

// ==================== BOSS HEALTH BAR ====================
const _bossBarFill      = document.getElementById('boss-bar-fill');
const _bossBarContainer = document.getElementById('boss-health-container');
const _bossHPText       = document.getElementById('boss-hp-text');
const _bossDefeated     = document.getElementById('boss-defeated');
const WORM_MAX_HP       = 150; 

function updateBossHealthBar(pct) {
  if (_bossBarFill) _bossBarFill.style.width = (pct * 100) + '%';
  if (_bossHPText)  _bossHPText.textContent  = Math.ceil(pct * WORM_MAX_HP) + ' / ' + WORM_MAX_HP;
  if (_bossBarContainer) {
    const vis = wormBoss.isActive && !wormBoss.isDead && wormBoss.alpha > 0.15;
    _bossBarContainer.style.opacity = vis ? Math.min(1, (wormBoss.alpha - 0.15) / 0.25) : 0;
  }
}

function flashBossBar() {
  if (!_bossBarFill) return;
  _bossBarFill.classList.remove('hit-flash');
  void _bossBarFill.offsetWidth; 
  _bossBarFill.classList.add('hit-flash');
}

let _bossDefeatedTimeout = null;
function showBossDefeated() {
  if (!_bossDefeated) { console.warn('boss-defeated element not found'); return; }
  _bossDefeated.classList.add('active');
  clearTimeout(_bossDefeatedTimeout);
  _bossDefeatedTimeout = setTimeout(() => _bossDefeated.classList.remove('active'), 6000);
}

function hideBossDefeated() {
  if (_bossDefeated) _bossDefeated.classList.remove('active');
  clearTimeout(_bossDefeatedTimeout);
}

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

// ==================== OVERLAY HELPERS ====================
function showGameOver() {
  const overlay = document.getElementById('gameover-overlay');
  if (overlay) overlay.classList.add('active');
}

function hideGameOver() {
  const overlay = document.getElementById('gameover-overlay');
  if (overlay) overlay.classList.remove('active');
}

function showDiedScreen(inWormBattle) {
  isDeadScreen = true;
  const overlay   = document.getElementById('died-overlay');
  const subEl     = document.getElementById('died-sub');
  const livesEl   = document.getElementById('died-lives');
  const livesLeft = ship.getLives();

  if (subEl) {
    subEl.textContent = inWormBattle
      ? 'pull yourself up by your bootstraps and get back out there, kiddo!'
      : 'returning to last checkpoint';
  }
  if (livesEl) livesEl.textContent = `${livesLeft} ${livesLeft === 1 ? 'life' : 'lives'} remaining`;
  if (overlay) overlay.classList.add('active');
}

function hideDiedScreen() {
  isDeadScreen = false;
  const overlay = document.getElementById('died-overlay');
  if (overlay) overlay.classList.remove('active');
}

// ==================== CHECKPOINT ====================
function saveCheckpoint() {
  const raw = document.getElementById('score-value')?.textContent?.replace(/,/g, '') ?? '0';
  checkpointScore = parseInt(raw, 10) || 0;
}

function restoreCheckpoint() {
  scoreManager.reset();
  if (checkpointScore > 0) {
    scoreManager.addScore(checkpointScore, -9999, -9999); // OFF SCREEN = NO POPUP
  }
}

// ==================== SHOOT ====================
function doShoot() {
  if (isPaused || ship.isBarrelRolling) return;
  const crosshairPos = crosshair.getPosition();
  const shootData    = ship.shoot(crosshairPos.x, crosshairPos.y);
  if (shootData) {
    projectileManager.shoot(shootData.x, shootData.y, shootData.targetX, shootData.targetY);
    muzzleFlash.trigger(shootData.x, shootData.y);
    audio.playLaser();
  }
}

// ==================== RESTART / CONTINUE ====================
function restartGame() {
  isGameOver         = false;
  isDeadScreen       = false;
  _warningSounded    = false;
  _wormBattleStarted = false;
  checkpointScore    = 0;
  hideGameOver();
  hideDiedScreen();
  hideBossDefeated();
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

  CONFIG.ENEMIES.MAX_COUNT = (currentMode === 'gameplay') ? currentEnemyCount : 0;  // RESTORE MODE — ENEMY COUNT AND WORM STATE MATCH ORIGINAL MENU SELECTION
  if (currentMode === 'bossBattle') wormBoss.activate();
  if (currentMode === 'gameplay')   gameplayScene.start();

  updateBossHealthBar(1);
  audio.stop();
  audio.start();
  if (currentMode !== 'bossBattle') audio.startWaveMusic(0); // WAVE 1 ON FULL RESTART
}

function handleContinue() {
  if (!isDeadScreen) return;
  const inWormBattle = wormBoss.isActive && !wormBoss.isDead;
  const inGameplay   = gameplayScene.isActive();
  hideDiedScreen();
  restoreCheckpoint();

  if (inWormBattle) {
    wormBoss.activate();
    babyWormManager.clear();
    updateBossHealthBar(1);
    _wormBattleStarted = false;
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
}

// ==================== GAME STATE ====================
let isPaused           = false;
let isMuted            = false;
let isGameOver         = false;
let isDeadScreen       = false;
let _warningSounded    = false;
let _prevBarrelRolling = false;
let checkpointScore    = 0;
let _wormBattleStarted = false;

let currentMode       = 'bossBattle'; 
let currentEnemyCount = 5;

// ==================== KEYBOARD SHORTCUTS ====================
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
  if (e.code === 'KeyC' && isDeadScreen)  handleContinue();
  if (e.code === 'KeyR' && isGameOver)    restartGame();
});

// ==================== BUTTON EVENTS ====================
document.getElementById('btn-continue')?.addEventListener('click', handleContinue);
document.getElementById('btn-restart')?.addEventListener('click', restartGame);
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

  if (!isPaused && !isGameOver && !isDeadScreen) {
    tunnel.update(dt);
    const shipOffset = ship.getOffset();
    tunnel.updateShipOffset(shipOffset.x, shipOffset.y);

    const suctionOn = wormBoss.isActive && wormBoss.attackPhase === 'loop'; // TUNNEL REACTS TO WORM SUCTION ATTACK
    tunnel.setSuctionIntensity(suctionOn ? 1 : 0);

    //  SLIME ATTACK UPDATE 
    const glorks     = enemyManager.getEnemies().filter(e => e.type === 'TANK');
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
    projectileManager.update(dt);
    muzzleFlash.update(dt);
    scoreManager.update(dt);
    ocularPrism.update(dt);
    wormBoss.update(dt);
    babyWormManager.update(dt, ship);

    // BARREL ROLL RISING EDGE — DETACH ALL LATCHED BABY WORMS
    if (ship.isBarrelRolling && !_prevBarrelRolling) {
      const detached = babyWormManager.detachAll();
      if (detached > 0) audio.playImpact();
    }
    _prevBarrelRolling = ship.isBarrelRolling;

    // WORM SUCTION PHYSICS — ONLY DURING SUCTION ATTACK LOOP
    if (wormBoss.isActive && !wormBoss.isDead
        && wormBoss.attackPhase === 'loop'
        && wormBoss.attackType  === 'suction') {

      if (ship.isAlive && !ship.consumedMode) {
        const headPos = wormBoss.getHeadPosition();
        ship.applySuction(headPos.x, headPos.y, dt);
      }

      // WARNING — FIRES ONCE WHEN SHIP IS ~HALFWAY TO THE MOUTH
      if (!_warningSounded && ship.getSuctionScale() < 0.65) {
        _warningSounded = true;
        audio.playWarning();
      }

      // FULLY CONSUMED — INSTANT KILL
      if (ship.getSuctionScale() < CONFIG.SHIP_HP.SUCTION_DEATH_SCALE
          && ship.isAlive && !ship.isInvincible) {
        ship.takeDamage(ship.maxHP);
      }
    } else {
      if (!ship.consumedMode) ship.clearSuction();
      _warningSounded = false;
    }

    // CHECKPOINT — SAVE WHEN WORM FIRST BECOMES VISIBLE
    if (!_wormBattleStarted && wormBoss.isActive && wormBoss.alpha >= 0.15) {
      _wormBattleStarted = true;
      saveCheckpoint();
    }

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
          const destroyed = enemy.takeDamage(1);
          if (destroyed) {
            projectileManager.createExplosion(pos.x, pos.y);
            scoreManager.addScore(enemy.score, pos.x, pos.y);
          }
          audio.playImpact();
          break;
        }
      }

      // PROJECTILE vs WORM BOSS
      if (!projectile.isDead) {
        const wormHit = wormBoss.checkProjectileHit(projectile.getSegment());
        if (wormHit.hit) {
          projectileManager.removeProjectile(projectile);
          audio.playImpact();
          flashBossBar();
          updateBossHealthBar(wormBoss.getHealthPercent());
          projectileManager.createExplosion(wormHit.x, wormHit.y);
          if (wormHit.killed) {
            scoreManager.addScore(500, wormHit.x, wormHit.y);
            audio.stopMusic();
            audio.playWormDeath1();
            ship.enterCinematic();
          } else {
            const segScore = wormHit.segIndex === 0 ? 25 : 10;
            scoreManager.addScore(segScore, wormHit.x, wormHit.y);
          }
        }
      }

      if (!projectile.isDead) {
        const babyHit = babyWormManager.checkProjectileHit(projectile.getSegment());
        if (babyHit.hit) {
          projectileManager.removeProjectile(projectile);
          audio.playImpact();
          projectileManager.createExplosion(babyHit.x, babyHit.y);
          scoreManager.addScore(15, babyHit.x, babyHit.y);
        }
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
        const wormHit = gameplayScene.checkWormHit(projectile.getSegment());
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


  tunnel.render();
  updateBossHealthBar(wormBoss.getHealthPercent()); // MUST RUN EVEN PAUSED SO BAR DOESN'T FREEZE
  ctx.clearRect(0, 0, gameCanvas.width, gameCanvas.height);
  projectileManager.draw(ctx);
  crosshair.draw(ctx);
  wormBoss.draw(ctx);
  babyWormManager.draw(ctx);
  gameplayScene.drawBehindEnemies(ctx);  // WORM IS DISTANT — DRAW UNDER ENEMIES
  enemyManager.draw(ctx);
  gameplayScene.drawAboveEnemies(ctx);   // WORM IS LARGE — DRAW OVER ENEMIES, UNDER SHIP

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

  muzzleFlash.draw(ctx);
  ship.draw();

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
}

// ==================== STARTUP ====================
async function startup() {
  await ImageLoader.preloadCritical();
  console.log('✔ Images ready');

  const { mode, enemyCount } = await menu.show(tunnel, () => audio.start());

  if (mode === 'bossBattle') audio.startBossMusic(); // GAMEPLAY WAVE MUSIC FIRES VIA onWaveStart
  currentMode       = mode;
  currentEnemyCount = enemyCount;
  console.log(`▶ Mode: ${mode} | Enemies: ${enemyCount}`);

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
    () => doShoot()
  );


  lastTime = performance.now();
  console.log('=== Starting game loop ===');
  gameLoop();
}

startup();