// main.js
// ~~~~~~~~~~~~~~~~~~~~ IMPORTS ~~~~~~~~~~~~~~~~~~~~
import { CONFIG } from './config.js';
import { initKeyboard, initMobileControls, keys, isKeyPressed } from './controls.js';
import { Tunnel } from './tunnel.js';
import { Ship } from './ship.js';
import { EnemyManager } from './enemies.js';
import { ProjectileManager, Crosshair, MuzzleFlash } from './projectiles.js';
import { circleCollision } from './collision.js';

console.log('=== YOU HAVE NOW ENTERED THE NEON WORMHOLE! ===');
// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

// ==================== INITIALIZATION ====================
const gameCanvas = document.createElement('canvas');
gameCanvas.id = 'game-canvas';
gameCanvas.width = window.innerWidth;
gameCanvas.height = window.innerHeight;
document.body.appendChild(gameCanvas);

const ctx = gameCanvas.getContext('2d');

const tunnel = new Tunnel();
const ship = new Ship(gameCanvas, ctx);
const enemyManager = new EnemyManager(ship.particles, tunnel);
const projectileManager = new ProjectileManager();
const crosshair = new Crosshair();
const muzzleFlash = new MuzzleFlash();

initKeyboard();

initMobileControls((direction) => {
  ship.startBarrelRoll(direction);
});

window.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && !ship.isBarrelRolling) {
    e.preventDefault();
    
   
    const crosshairPos = crosshair.getPosition();
    const shootData = ship.shoot(crosshairPos.x, crosshairPos.y);
    
    if (shootData) {
      projectileManager.shoot(shootData.x, shootData.y, shootData.targetX, shootData.targetY);
      muzzleFlash.trigger(shootData.x, shootData.y);
    }
  }
});

gameCanvas.addEventListener('click', (e) => {
  const crosshairPos = crosshair.getPosition();
  const shootData = ship.shoot(crosshairPos.x, crosshairPos.y);
  
  if (shootData) {
    projectileManager.shoot(shootData.x, shootData.y, shootData.targetX, shootData.targetY);
    muzzleFlash.trigger(shootData.x, shootData.y);
  }
});
 
// ==================== GAME LOOP ====================
let lastTime = performance.now();
function gameLoop() {
  requestAnimationFrame(gameLoop);
  const now = performance.now();
  const dt = (now - lastTime) / 1000; 
  lastTime = now;
  tunnel.update(dt);
  const shipOffset = ship.getOffset();
  tunnel.updateShipOffset(shipOffset.x, shipOffset.y);
  ship.update(dt);
  crosshair.update(shipOffset.x, shipOffset.y);
  enemyManager.update(dt);
  projectileManager.update(dt);
  muzzleFlash.update(dt);

  const projectiles = projectileManager.getProjectiles();
  const enemies = enemyManager.getEnemies();

  for (let i = projectiles.length - 1; i >= 0; i--) {
    const projectile = projectiles[i];
    const projPos = projectile.getPosition();
    const projRadius = projectile.getRadius();

    for (let j = enemies.length - 1; j >= 0; j--) {
      const enemy = enemies[j];
      const enemyPos = enemy.getPosition();
      const enemySize = enemy.getSize();

      if (circleCollision(
        { x: projPos.x, y: projPos.y, radius: projRadius },
        { x: enemyPos.x, y: enemyPos.y, radius: enemySize }
      )) {
        projectileManager.removeProjectile(projectile);
        
        const destroyed = enemy.takeDamage(1);
        if (destroyed) {
          projectileManager.createExplosion(enemyPos.x, enemyPos.y);
        }
        
        break; 
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
}

// ==================== WINDOW RESIZE HANDLER ====================
window.addEventListener('resize', () => {
  const w = window.innerWidth;
  const h = window.innerHeight;
  
  tunnel.handleResize();
  
  gameCanvas.width = w;
  gameCanvas.height = h;
  
  ship.handleResize();
});

// ==================== START GAME ====================
console.log('✓ All systems initialized');
console.log('=== Starting game loop ===');
gameLoop();