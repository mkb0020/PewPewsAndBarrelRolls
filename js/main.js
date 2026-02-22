// main.js
// ~~~~~~~~~~~~~~~~~~~~ IMPORTS ~~~~~~~~~~~~~~~~~~~~
import { CONFIG } from './config.js';
import { initKeyboard, initMobileControls, isMobile, keys, isKeyPressed } from './controls.js';
import { Tunnel } from './tunnel.js';
import { Ship } from './ship.js';
import { EnemyManager } from './enemies.js';
import { ProjectileManager, Crosshair, MuzzleFlash } from './projectiles.js';
import { circleCollision, segmentCircleCollision } from './collision.js';
import { AudioManager } from './audio.js';
import { GameUI } from './ui.js';
import { ScoreManager } from './score.js';
import { WormBoss } from './worm.js';
import { BabyWormManager } from './babyWorm.js';
import { Monster } from './monster.js';


console.log('=== YOU HAVE NOW ENTERED THE WORMHOLE! ===');
// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

// ==================== INITIALIZATION ====================
const gameCanvas = document.createElement('canvas');
gameCanvas.id = 'game-canvas';
gameCanvas.width = window.innerWidth;
gameCanvas.height = window.innerHeight;
document.body.appendChild(gameCanvas);

const ctx = gameCanvas.getContext('2d');

const tunnel          = new Tunnel();
const ship            = new Ship(gameCanvas, ctx);
const audio           = new AudioManager();
const ui              = new GameUI();
const enemyManager    = new EnemyManager(ship.particles, tunnel);
const projectileManager = new ProjectileManager();
const crosshair       = new Crosshair();
const muzzleFlash     = new MuzzleFlash();
const scoreManager    = new ScoreManager();
const wormBoss          = new WormBoss();
const babyWormManager   = new BabyWormManager();
const monster           = new Monster(); // TEMP — VISUAL TEST ONLY
wormBoss.onAttack = () => audio.playWormNoise();
wormBoss.onIntro  = () => audio.playWormIntro();
wormBoss.onDeathPauseEnd  = () => audio.playWormDeath2();
wormBoss.onSpawnBabyWorms = (mx, my) => babyWormManager.spawnWave(mx, my);
wormBoss.activate(); // PLACEHOLDER

// ==================== BOSS HEALTH BAR HELPERS ====================
const _bossBarFill      = document.getElementById('boss-bar-fill');
const _bossBarContainer = document.getElementById('boss-health-container');
const _bossHPText       = document.getElementById('boss-hp-text');
const _bossDefeated     = document.getElementById('boss-defeated');

function updateBossHealthBar(pct) {
  if (_bossBarFill)  _bossBarFill.style.width  = (pct * 100) + '%';
  if (_bossHPText)   _bossHPText.textContent    =
    Math.ceil(pct * WORM_MAX_HP) + ' / ' + WORM_MAX_HP;
  if (_bossBarContainer) {
    const vis = wormBoss.isActive && !wormBoss.isDead && wormBoss.alpha > 0.15;
    const targetOpacity = vis ? Math.min(1, (wormBoss.alpha - 0.15) / 0.25) : 0;
    _bossBarContainer.style.opacity = targetOpacity;
  }
}

function flashBossBar() {
  if (!_bossBarFill) return;
  _bossBarFill.classList.remove('hit-flash');
  void _bossBarFill.offsetWidth; // REFLOW TO RESTART ANIMATION
  _bossBarFill.classList.add('hit-flash');
}

let _bossDefeatedTimeout = null;
function showBossDefeated() {
  if (!_bossDefeated) { console.warn('boss-defeated element not found'); return; }
  _bossDefeated.classList.add('active');
  clearTimeout(_bossDefeatedTimeout);
  _bossDefeatedTimeout = setTimeout(() => {
    _bossDefeated.classList.remove('active');
  }, 6000); 
}

function hideBossDefeated() {
  if (_bossDefeated) _bossDefeated.classList.remove('active');
  clearTimeout(_bossDefeatedTimeout);
}

const WORM_MAX_HP = 150; // READ WORM MAX HP FROM WORM'S OWN CONFIG (INTERNAL CONST) — USE 150 AS DEFINED IN WORM.JS

// ==================== WORM CALLBACKS ====================
wormBoss.onSegmentDeath = (x, y, segIndex) => {
  projectileManager.createExplosion(x, y); // CHAIN EXPLOSIONS — BIGGER BURST FOR THE HEAD (SEGMENT 0)
  if (segIndex === 0) {
    audio.playWormDeath3(); // HEAD POPPED — CUE 3 STARTS NOW (PLAYS THROUGH THE 10s COOLDOWN)
    audio.stopMusic(); // ENSURE MUSIC IS STILL OFF THROUGH COOLDOWN
    setTimeout(() => projectileManager.createExplosion(x + 20, y - 15), 60);  // EXTRA HEAD EXPLOSIONS — SPECTACULAR FINALE
    setTimeout(() => projectileManager.createExplosion(x - 15, y + 20), 120);
  }
};

wormBoss.onDeath = () => {
  updateBossHealthBar(0);
  showBossDefeated();           
  const cx = window.innerWidth / 2;
  const cy = window.innerHeight / 2;
  scoreManager.addScore(2000, cx, cy - 60);

  setTimeout(() => { // RESPAWN AFTER 10 SECONDS — TIMED TO LET wormDeath3 FINISH BEFORE MUSIC RETURNS
    if (!isGameOver) {
      wormBoss.activate();
      ship.exitCinematic();
      audio.playWormIntro();
      audio.startMusic();
    }
  }, 10000);
};

// ==================== SHIP HP CALLBACKS ====================
ship.onHPChange    = (hp, max) => updateHPBar(hp, max);
ship.onLivesChange = (lives)   => updateLivesDisplay(lives);
ship.onDeath       = (livesLeft) => {
  audio.stopMusic();
  if (livesLeft <= 0) {
    isGameOver = true;
    showGameOver();
  } else {
    const inWormBattle = wormBoss.isActive && !wormBoss.isDead;     // SHOW DIED SCREEN 
    showDiedScreen(inWormBattle);
  }
};

updateHPBar(ship.getHP(), CONFIG.SHIP_HP.MAX_HP); // INIT HUD TO STARTING VALUES
updateLivesDisplay(ship.getLives());

let rattleTimer = 12 + Math.random() * 8; // RATTLE — AMBIENT CREEP SOUND, RANDOM INTERVAL - FIRST RATTLE IN 12–20s


initKeyboard();


// ==================== SHARED SHOOT FUNCTION ====================
function doShoot() {
  if (isPaused || ship.isBarrelRolling) return;
  const crosshairPos = crosshair.getPosition();
  const shootData = ship.shoot(crosshairPos.x, crosshairPos.y);
  if (shootData) {
    projectileManager.shoot(shootData.x, shootData.y, shootData.targetX, shootData.targetY);
    muzzleFlash.trigger(shootData.x, shootData.y);
    audio.playLaser();
  }
}

initMobileControls(
  (direction) => { ship.startBarrelRoll(direction); audio.playBarrelRoll(); },
  () => doShoot()
);

// ==================== GAME STATE ====================
let isPaused        = false;
let isMuted         = false;
let isGameOver      = false;
let isDeadScreen    = false;
let _warningSounded  = false;
let _prevBarrelRolling = false; // TRACK RISING EDGE OF BARREL ROLL FOR DETACH

// ==================== CHECKPOINT SYSTEM ====================
// SAVED AT GAME START AND WHEN WORM BATTLE BEGINS
// RESTORED ON DEATH-WITH-LIVES SO PLAYER DOESN'T LOSE EVERYTHING
let checkpointScore  = 0;
let _wormBattleStarted = false; // TRACKS WHETHER WE'VE ENTERED WORM PHASE THIS LIFE

// ==================== HUD HELPERS / QUERY AT CALL TIME — AVOIDS TEMPORAL DEAD ZONE DURING INITIALIZATION ====================
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

function showGameOver() {
  const overlay = document.getElementById('gameover-overlay');
  if (overlay) overlay.classList.add('active');
}

function hideGameOver() {
  const overlay = document.getElementById('gameover-overlay');
  if (overlay) overlay.classList.remove('active');
}

// ==================== DIED OVERLAY  ====================
function showDiedScreen(inWormBattle) {
  isDeadScreen = true;
  const overlay  = document.getElementById('died-overlay');
  const subEl    = document.getElementById('died-sub');
  const livesEl  = document.getElementById('died-lives');
  const livesLeft = ship.getLives();

  if (subEl) {
    subEl.textContent = inWormBattle
      ? 'pull yourself up by your bootstraps and get back out there, kiddo!'
      : 'returning to last checkpoint';
  }
  if (livesEl) {
    livesEl.textContent = `${livesLeft} ${livesLeft === 1 ? 'life' : 'lives'} remaining`;
  }
  if (overlay) overlay.classList.add('active');
}

function hideDiedScreen() {
  isDeadScreen = false;
  const overlay = document.getElementById('died-overlay');
  if (overlay) overlay.classList.remove('active');
}

function saveCheckpoint() {   // READ CURRENT SCORE FROM THE HUD — SCORE MANAGER UPDATES THIS EACH FRAME
  const raw = document.getElementById('score-value')?.textContent?.replace(/,/g, '') ?? '0';
  checkpointScore = parseInt(raw, 10) || 0;
}

function restoreCheckpoint() {   // RESET SCORE MANAGER THEN RE-ADD CHECKPOINT SILENTLY (NO POPUP — X/Y OFF SCREEN)
  scoreManager.reset();
  if (checkpointScore > 0) {
    scoreManager.addScore(checkpointScore, -9999, -9999); // FAR OFF SCREEN = NO VISIBLE POPUP
  }
}

function restartGame() {
  isGameOver           = false;
  isDeadScreen         = false;
  _warningSounded      = false;
  _wormBattleStarted   = false;
  checkpointScore      = 0;
  hideGameOver();
  hideDiedScreen();
  hideBossDefeated();
  ship.resetForNewGame();
  scoreManager.reset();
  enemyManager.clear();
  projectileManager.clear();
  babyWormManager.clear();
  wormBoss.activate();
  updateBossHealthBar(1);
  audio.stop();
  audio.start();
}

function handleContinue() {
  if (!isDeadScreen) return;
  const inWormBattle = wormBoss.isActive && !wormBoss.isDead;

  hideDiedScreen();
  restoreCheckpoint();       // SCORE SNAPS BACK TO CHECKPOINT

  if (inWormBattle) {
    wormBoss.activate();
    babyWormManager.clear(); // KILL ANY WORMS STILL ON SCREEN
    updateBossHealthBar(1);
    _wormBattleStarted = false;
  }

  ship.respawn();            // IFRAMES + FULL HP + CENTERED
  audio.startMusic();
}

// ==================== UI BUTTON EVENTS (DOM - NOT CANVAS) ====================
document.getElementById('btn-sound').addEventListener('click', () => {
  isMuted = audio.toggleMute();
  ui.update(isMuted, isPaused);
});

document.getElementById('btn-pause').addEventListener('click', () => {
  isPaused = !isPaused;
  ui.update(isMuted, isPaused);
});

// ==================== START AUDIO ON FIRST INTERACTION ====================
const startAudio = () => {
  audio.start();
  window.removeEventListener('keydown',    startAudio);
  window.removeEventListener('click',      startAudio);
  window.removeEventListener('touchstart', startAudio);
};
window.addEventListener('keydown',    startAudio, { once: true });
window.addEventListener('click',      startAudio, { once: true });
window.addEventListener('touchstart', startAudio, { once: true });

// ==================== KEYBOARD SHORTCUTS ====================
window.addEventListener('keydown', (e) => {

  if (e.code === 'KeyP') {  // PAUSE - P KEY
    isPaused = !isPaused;
    ui.update(isMuted, isPaused);
    return;
  }

  if (e.code === 'KeyM') { // MUTE - M KEY
    isMuted = audio.toggleMute();
    ui.update(isMuted, isPaused);
    return;
  }

  if (e.code === 'Space' && !isPaused && !ship.isBarrelRolling) {  // SHOOT - SPACE
    e.preventDefault();
    doShoot();
    return;
  }

  if (e.code === 'KeyQ' && !ship.isBarrelRolling) {   // BARREL ROLL — Q = LEFT (CCW), E = RIGHT (CW / the actual counter to suction spiral)
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
});

// ==================== GAME LOOP ====================
let lastTime = performance.now();

function gameLoop() {
  requestAnimationFrame(gameLoop);
  const now = performance.now();
  const dt  = Math.min((now - lastTime) / 1000, 0.05); 
  lastTime  = now;

  if (!isPaused && !isGameOver && !isDeadScreen) { //  UPDATE (SKIP WHEN PAUSED, GAME OVER, OR DIED SCREEN)
    tunnel.update(dt);
    const shipOffset = ship.getOffset();
    tunnel.updateShipOffset(shipOffset.x, shipOffset.y);

    const suctionOn = wormBoss.isActive && wormBoss.attackPhase === 'loop';     // TUNNEL REACTS TO WORM ATTACK — FULL SUCTION ONLY DURING MOUTH-OPEN LOOP
    tunnel.setSuctionIntensity(suctionOn ? 1 : 0);
    ship.update(dt);

    crosshair.update(shipOffset.x, shipOffset.y, dt, enemyManager.getEnemies());
    enemyManager.update(dt);
    projectileManager.update(dt);
    muzzleFlash.update(dt);
    scoreManager.update(dt); 
    wormBoss.update(dt);

    babyWormManager.update(dt, ship); // BABY WORM UPDATE 
    monster.update(dt); // TEMP

    if (ship.isBarrelRolling && !_prevBarrelRolling) { // BARREL ROLL RISING EDGE — DETACH ALL LATCHED BABY WORMS
      const detached = babyWormManager.detachAll();
      if (detached > 0) audio.playImpact();
    }
    _prevBarrelRolling = ship.isBarrelRolling;

    if (wormBoss.isActive && !wormBoss.isDead     // WORM SUCTION PHYSICS - ACTIVE ONLY DURING SUCTION ATTACK LOOP — NOT DURING BABY WORM ATTACK

        && wormBoss.attackPhase === 'loop'
        && wormBoss.attackType  === 'suction') {
      if (ship.isAlive && !ship.consumedMode) {       // ONLY APPLY SUCTION PHYSICS WHEN SHIP IS ALIVE — PREVENTS SUCTIONSCALE FROM BEING DRAGGED DOWN DURING THE DEAD WINDOW BETWEEN DEATH AND RESPAWN
        const headPos = wormBoss.getHeadPosition();
        ship.applySuction(headPos.x, headPos.y, dt);
      }

      if (!_warningSounded && ship.getSuctionScale() < 0.65) {       // WARNING ALARM — FIRES ONCE WHEN SHIP IS ~HALFWAY TO THE MOUTH

        _warningSounded = true;
        audio.playWarning();
      }

      if (ship.getSuctionScale() < CONFIG.SHIP_HP.SUCTION_DEATH_SCALE       // FULLY CONSUMED — DIE IMMEDIATELY (animation + audio added back once mechanics confirmed)

          && ship.isAlive
          && !ship.isInvincible) {
        ship.takeDamage(ship.maxHP); // INSTANT KILL — BYPASSES ANIMATION FOR NOW
      }
    } else {
      if (!ship.consumedMode) ship.clearSuction();
      _warningSounded = false;
    }

    // ============= CHECKPOINT — SAVE WHEN WORM FIRST BECOMES VISIBLE =============
    if (!_wormBattleStarted && wormBoss.isActive && wormBoss.alpha >= 0.15) {
      _wormBattleStarted = true;
      saveCheckpoint(); // LOCK IN SCORE BEFORE THE HARD PART
    }

    if (wormBoss.isActive && !wormBoss.isDead) {  // RATTLE — FIRE PERIODICALLY, RANDOM INTERVAL SO IT STAYS UNSETTLING
      rattleTimer -= dt;
      if (rattleTimer <= 0) {
        audio.playWormRattle();
        rattleTimer = 8 + Math.random() * 12; // 8–20s BETWEEN RATTLES
      }
    }
    
    const projectiles = projectileManager.getProjectiles(); // COLLISION
    const enemies     = enemyManager.getEnemies();

    for (let i = projectiles.length - 1; i >= 0; i--) {
      const projectile = projectiles[i];
      for (let j = enemies.length - 1; j >= 0; j--) {
        const enemy    = enemies[j];
        const enemyPos = enemy.getPosition();
        const enemySize = enemy.getSize();

        const seg = projectile.getSegment();
        const hit = segmentCircleCollision(
          seg,
          { x: enemyPos.x, y: enemyPos.y, radius: enemySize }
        );

        if (hit) {
          projectileManager.removeProjectile(projectile);
          const destroyed = enemy.takeDamage(1);
          if (destroyed) {
            projectileManager.createExplosion(enemyPos.x, enemyPos.y);
            scoreManager.addScore(enemy.score, enemyPos.x, enemyPos.y);  
          }
          audio.playImpact();
          break;
        }
      }

      if (!projectile.isDead) { //  WORM BOSS COLLISION
        const seg      = projectile.getSegment();
        const wormHit  = wormBoss.checkProjectileHit(seg);
        if (wormHit.hit) {
          projectileManager.removeProjectile(projectile);
          audio.playImpact();
          flashBossBar();
          updateBossHealthBar(wormBoss.getHealthPercent());
          if (wormHit.killed) {
            projectileManager.createExplosion(wormHit.x, wormHit.y);
            scoreManager.addScore(500, wormHit.x, wormHit.y);
            audio.stopMusic();
            audio.playWormDeath1();
            ship.enterCinematic();
          } else {
            projectileManager.createExplosion(wormHit.x, wormHit.y);
            const segScore = wormHit.segIndex === 0 ? 25 : 10;
            scoreManager.addScore(segScore, wormHit.x, wormHit.y);
          }
        }
      }

      if (!projectile.isDead) { // BABY WORM COLLISION - LATCHED BABY WORMS ARE IMMUNE TO PROJECTILES — BARREL ROLL ONLY
        const seg      = projectile.getSegment();
        const babyHit  = babyWormManager.checkProjectileHit(seg);
        if (babyHit.hit) {
          projectileManager.removeProjectile(projectile);
          audio.playImpact();
          projectileManager.createExplosion(babyHit.x, babyHit.y);
          scoreManager.addScore(15, babyHit.x, babyHit.y);
        }
      }
    }
  }

  tunnel.render();

  updateBossHealthBar(wormBoss.getHealthPercent()); // ALWAYS UPDATE BOSS BAR — MUST RUN EVEN WHEN PAUSED/DEAD SO IT DOESN'T FREEZE OR VANISH

  ctx.clearRect(0, 0, gameCanvas.width, gameCanvas.height);

  projectileManager.draw(ctx);
  crosshair.draw(ctx);
  wormBoss.draw(ctx);
  babyWormManager.draw(ctx);
  monster.draw(ctx); // TEMP
  enemyManager.draw(ctx);
  muzzleFlash.draw(ctx);
  ship.draw();
}

// ==================== WINDOW RESIZE ====================
window.addEventListener('resize', () => {
  const w = window.innerWidth;
  const h = window.innerHeight;

  tunnel.handleResize();
  gameCanvas.width  = w;
  gameCanvas.height = h;
  ship.handleResize();
  crosshair.handleResize();
});

// ==================== RESTART ====================
document.getElementById('btn-continue')?.addEventListener('click', handleContinue);

document.getElementById('btn-restart')?.addEventListener('click', restartGame);
window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyC' && isDeadScreen) handleContinue();
  if (e.code === 'KeyR' && isGameOver)   restartGame();
});
console.log('All systems go!');
console.log('=== Starting game loop ===');
gameLoop();