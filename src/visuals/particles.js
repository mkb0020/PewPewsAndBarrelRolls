// Updated 3/12/26 @ 7AM
// particles.js
// ~~~~~~~~~~~~~~~~~~~~ IMPORTS ~~~~~~~~~~~~~~~~~~~~
import { CONFIG } from '../utils/config.js';
// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

export class Particle {
  constructor(x, y) {
    this.x = x + (Math.random() - 0.5) * CONFIG.PARTICLES.SPAWN_SPREAD;
    this.y = y + (Math.random() - 0.5) * CONFIG.PARTICLES.SPAWN_SPREAD;
    this.vx = (Math.random() - 0.5) * CONFIG.PARTICLES.VELOCITY_X_RANGE;
    this.vy = CONFIG.PARTICLES.VELOCITY_Y_BASE + Math.random() * CONFIG.PARTICLES.VELOCITY_Y_VARIANCE;
    this.life = CONFIG.PARTICLES.LIFE_MIN + Math.random() * CONFIG.PARTICLES.LIFE_VARIANCE;
    this.maxLife = this.life;
    this.radius = CONFIG.PARTICLES.RADIUS;
    this.color = Math.random() > 0.5 ? CONFIG.PARTICLES.COLOR_PRIMARY : CONFIG.PARTICLES.COLOR_SECONDARY;
  }

  update(dt) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.life -= dt;
  }

  isDead() {
    return this.life <= 0 || this.y > window.innerHeight + 50;
  }
}

export class ParticleSystem {
  constructor() {
    this.particles = [];
    this.maxParticles = CONFIG.PARTICLES.MAX_COUNT;
    this.spawnRate = CONFIG.PARTICLES.SPAWN_RATE;
  }

  spawn(x, y, count = 1) {
    for (let i = 0; i < count; i++) {
      if (this.particles.length < this.maxParticles) {
        this.particles.push(new Particle(x, y));
      }
    }
  }

  update(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      this.particles[i].update(dt);
      if (this.particles[i].isDead()) {
        this.particles.splice(i, 1);
      }
    }
  }

  draw(ctx) {
    if (this.particles.length === 0) return;

    // SINGLE SAVE/RESTORE FOR ENTIRE SYSTEM — NOT PER PARTICLE
    // globalAlpha AND fillStyle ARE SET DIRECTLY PER PARTICLE (CHEAP PROPERTY WRITES)
    ctx.save();
    const baseOpacity = CONFIG.PARTICLES.OPACITY;
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife) * baseOpacity;
      ctx.fillStyle   = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  clear() {
    this.particles = [];
  }

  getCount() {
    return this.particles.length;
  }
}