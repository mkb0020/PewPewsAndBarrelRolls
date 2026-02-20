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
const wormBoss        = new WormBoss();
wormBoss.onAttack = () => audio.playWormNoise();
wormBoss.onIntro  = () => audio.playWormIntro();
wormBoss.activate(); // PLACEHOLDER

// RATTLE — AMBIENT CREEP SOUND, RANDOM INTERVAL
let rattleTimer = 12 + Math.random() * 8; // FIRST RATTLE IN 12–20s


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
let isPaused = false;
let isMuted  = false;

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

  // SHOOT - SPACE
  if (e.code === 'Space' && !isPaused && !ship.isBarrelRolling) {
    e.preventDefault();
    doShoot();
    return;
  }

  // BARREL ROLL
  if ((e.code === 'ShiftLeft' || e.code === 'ShiftRight') && !ship.isBarrelRolling) {
    e.preventDefault();
    const direction = isKeyPressed('a') || isKeyPressed('arrowleft') ? -1 : 1;
    ship.startBarrelRoll(direction);
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

  // ==================== UPDATE (SKIP WHEN PAUSED) ====================
  if (!isPaused) {
    tunnel.update(dt);
    const shipOffset = ship.getOffset();
    tunnel.updateShipOffset(shipOffset.x, shipOffset.y);

    // TUNNEL REACTS TO WORM ATTACK — FULL SUCTION ONLY DURING MOUTH-OPEN LOOP
    const suctionOn = wormBoss.isActive && wormBoss.attackPhase === 'loop';
    tunnel.setSuctionIntensity(suctionOn ? 1 : 0);
    ship.update(dt);

    crosshair.update(shipOffset.x, shipOffset.y, dt, enemyManager.getEnemies());
    enemyManager.update(dt);
    projectileManager.update(dt);
    muzzleFlash.update(dt);
    scoreManager.update(dt); 
    wormBoss.update(dt);

    // RATTLE — FIRE PERIODICALLY, RANDOM INTERVAL SO IT STAYS UNSETTLING
    if (wormBoss.isActive && !wormBoss.isDead) {
      rattleTimer -= dt;
      if (rattleTimer <= 0) {
        audio.playWormRattle();
        rattleTimer = 8 + Math.random() * 12; // NEXT RATTLE IN 8–20s
      }
    }
    
    // COLLISION
    const projectiles = projectileManager.getProjectiles();
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

      // ================== WORM BOSS COLLISION ==================
      if (!projectile.isDead) {
        const seg      = projectile.getSegment();
        const wormHit  = wormBoss.checkProjectileHit(seg);
        if (wormHit.hit) {
          projectileManager.removeProjectile(projectile);
          audio.playImpact();
          if (wormHit.killed) {
            projectileManager.createExplosion(wormHit.x, wormHit.y);
            scoreManager.addScore(500, wormHit.x, wormHit.y);
          } else {
            projectileManager.createExplosion(wormHit.x, wormHit.y);
            const segScore = wormHit.segIndex === 0 ? 25 : 10;
            scoreManager.addScore(segScore, wormHit.x, wormHit.y);
          }
        }
      }
    }
  }

  tunnel.render();

  ctx.clearRect(0, 0, gameCanvas.width, gameCanvas.height);

  projectileManager.draw(ctx);
  crosshair.draw(ctx);
  wormBoss.draw(ctx);
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

// ==================== START ====================
console.log('All systems go!');
console.log('=== Starting game loop ===');
gameLoop();