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


console.log('=== YOU HAVE NOW ENTERED THE NEON WORMHOLE! ===');
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
const enemyManager    = new EnemyManager(ship.particles, tunnel, audio);
const projectileManager = new ProjectileManager();
const crosshair       = new Crosshair();
const muzzleFlash     = new MuzzleFlash();
const scoreManager = new ScoreManager();


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
  (direction) => ship.startBarrelRoll(direction),
  () => doShoot()
);

// ==================== GAME STATE ====================
let isPaused = false;
let isMuted  = false;

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

  if (e.code === 'KeyP') {  // PAUSE — P KEY
    isPaused = !isPaused;
    return;
  }

  if (e.code === 'KeyM') { // MUTE — M KEY
    isMuted = audio.toggleMute();
    return;
  }

  // SHOOT — SPACE
  if (e.code === 'Space' && !isPaused && !ship.isBarrelRolling) {
    e.preventDefault();
    doShoot();
    return;
  }

  // BARREL ROLL — SHIFT
  if ((e.code === 'ShiftLeft' || e.code === 'ShiftRight') && !ship.isBarrelRolling) {
    e.preventDefault();
    const direction = isKeyPressed('a') || isKeyPressed('arrowleft') ? -1 : 1;
    ship.startBarrelRoll(direction);
    return;
  }
});

// ==================== CLICK / TAP HANDLER ====================
gameCanvas.addEventListener('click', (e) => {
  const hit = ui.hitTest(e.clientX, e.clientY);

  if (hit === 'pause') {
    isPaused = !isPaused;
    return;
  }

  if (hit === 'sound') {
    isMuted = audio.toggleMute();
    return;
  }

  if (!isMobile && !isPaused) {
    doShoot();
  }
});

// ==================== GAME LOOP ====================
let lastTime = performance.now();

function gameLoop() {
  requestAnimationFrame(gameLoop);
  const now = performance.now();
  const dt  = Math.min((now - lastTime) / 1000, 0.05); 
  lastTime  = now;

  // ==================== UPDATE (SKIP WHEN PAUSED ====================
  if (!isPaused) {
    tunnel.update(dt);
    const shipOffset = ship.getOffset();
    tunnel.updateShipOffset(shipOffset.x, shipOffset.y);
    ship.update(dt);
    crosshair.update(shipOffset.x, shipOffset.y, dt, enemyManager.getEnemies());
    enemyManager.update(dt);
    projectileManager.update(dt);
    muzzleFlash.update(dt);
    scoreManager.update(dt); 
    
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
    }
  }

  tunnel.render();

  ctx.clearRect(0, 0, gameCanvas.width, gameCanvas.height);

  projectileManager.draw(ctx);
  crosshair.draw(ctx);
  enemyManager.draw(ctx);
  muzzleFlash.draw(ctx);
  ship.draw();

  ui.draw(ctx, isMuted, isPaused);
}

// ==================== WINDOW RESIZE ====================
window.addEventListener('resize', () => {
  const w = window.innerWidth;
  const h = window.innerHeight;

  tunnel.handleResize();
  gameCanvas.width  = w;
  gameCanvas.height = h;
  ship.handleResize();
  ui.handleResize();
});

// ==================== START ====================
console.log('✔ All systems initialized');
console.log('=== Starting game loop ===');
gameLoop();