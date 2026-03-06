// Updated 3/5/26 @ 7:15PM

// cosmicPrism.js
// ~~~~~~~~~~~~~~~~~~~~ IMPORTS ~~~~~~~~~~~~~~~~~~~~
import { CONFIG } from '../utils/config.js';
// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

class Prism {
  constructor(x, y) {
    this.x        = x;
    this.baseY    = y;
    this.y        = y;
    this.rotation      = Math.random() * Math.PI * 2;
    this.innerRotation = Math.random() * Math.PI * 2;
    this.pulse    = Math.random() * Math.PI * 2;
    this.bobTimer = Math.random() * Math.PI * 2;
    this.life     = CONFIG.COSMIC_PRISM.LIFETIME;
    this.radius   = CONFIG.COSMIC_PRISM.RADIUS;
    this.collected = false;

    this.orbitDots = Array.from({ length: 4 }, (_, i) => ({
      angle:       (i / 4) * Math.PI * 2,
      speed:       1.1 + Math.random() * 0.6,
      orbitRadius: CONFIG.COSMIC_PRISM.RADIUS * 1.7 + Math.random() * 6,
      hue:         i * 90,
    }));
  }

  update(dt) {
    const C = CONFIG.COSMIC_PRISM;
    this.rotation      += dt * C.ROTATION_SPEED;
    this.innerRotation -= dt * C.ROTATION_SPEED * 1.5;
    this.pulse         += dt * C.PULSE_SPEED;
    this.bobTimer      += dt;
    this.y              = this.baseY + Math.sin(this.bobTimer * C.BOB_SPEED) * C.BOB_AMPLITUDE;
    this.life          -= dt;

    for (const d of this.orbitDots) {
      d.angle += dt * d.speed;
    }
  }

  isDead()   { return this.life <= 0 || this.collected; }
  getAlpha() {
    const C      = CONFIG.COSMIC_PRISM;
    const fadeIn  = Math.min(1, (C.LIFETIME - this.life) / 0.8);
    const fadeOut = this.life < 2.0 ? this.life / 2.0 : 1;
    return fadeIn * fadeOut;
  }

  draw(ctx) {
    const alpha = this.getAlpha();
    if (alpha <= 0) return;

    const r = this.radius + Math.sin(this.pulse) * 2;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(this.x, this.y);

    //  OUTER GLOW RING 
    ctx.save();
    ctx.globalAlpha = alpha * 0.18;
    ctx.shadowBlur  = 0;
    const glowR = r * 1.3 + Math.sin(this.pulse) * 4;
    const glowGrad = ctx.createRadialGradient(0, 0, r * 0.5, 0, 0, glowR);
    glowGrad.addColorStop(0, `hsla(${(this.pulse * 45) % 360}, 100%, 70%, 0.6)`);
    glowGrad.addColorStop(1, 'hsla(0,0%,0%,0)');
    ctx.fillStyle = glowGrad;
    ctx.beginPath();
    ctx.arc(0, 0, glowR, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    //  OUTER HEXAGON 
    ctx.save();
    ctx.rotate(this.rotation);
    ctx.shadowBlur  = 14 + Math.sin(this.pulse) * 4;
    ctx.shadowColor = `hsl(${(this.pulse * 45) % 360}, 100%, 70%)`;

    const hexGrad = ctx.createLinearGradient(-r, -r, r, r);
    hexGrad.addColorStop(0,    '#ff0080');
    hexGrad.addColorStop(0.17, '#ff8800');
    hexGrad.addColorStop(0.34, '#ffff00');
    hexGrad.addColorStop(0.50, '#00ff88');
    hexGrad.addColorStop(0.67, '#0088ff');
    hexGrad.addColorStop(0.84, '#8800ff');
    hexGrad.addColorStop(1,    '#ff0080');

    ctx.strokeStyle = hexGrad;
    ctx.lineWidth   = 2.5;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a  = (i / 6) * Math.PI * 2;
      const vx = Math.cos(a) * r;
      const vy = Math.sin(a) * r;
      i === 0 ? ctx.moveTo(vx, vy) : ctx.lineTo(vx, vy);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.restore();

    //  INNER COUNTER-ROTATING DIAMOND 
    ctx.save();
    ctx.rotate(this.innerRotation);
    const ir = r * 0.55;
    ctx.shadowBlur  = 10;
    ctx.shadowColor = `hsl(${(this.pulse * 60 + 180) % 360}, 100%, 75%)`;

    const diaGrad = ctx.createLinearGradient(-ir, -ir, ir, ir);
    diaGrad.addColorStop(0,   '#ffffff');
    diaGrad.addColorStop(0.4, `hsl(${(this.pulse * 60) % 360}, 100%, 80%)`);
    diaGrad.addColorStop(1,   '#ffffff');
    ctx.strokeStyle = diaGrad;
    ctx.lineWidth   = 1.8;
    ctx.beginPath();
    ctx.moveTo(0, -ir);
    ctx.lineTo(ir, 0);
    ctx.lineTo(0, ir);
    ctx.lineTo(-ir, 0);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();

    //  BRIGHT CORE PIXEL 
    ctx.save();
    ctx.shadowBlur  = 8;
    ctx.shadowColor = '#ffffff';
    ctx.fillStyle   = `rgba(255,255,255,${0.6 + Math.sin(this.pulse * 2) * 0.3})`;
    ctx.beginPath();
    ctx.arc(0, 0, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    //  ORBIT SATELLITES 
    for (const d of this.orbitDots) {
      const ox = Math.cos(d.angle) * d.orbitRadius;
      const oy = Math.sin(d.angle) * d.orbitRadius;
      ctx.save();
      ctx.globalAlpha = alpha * 0.85;
      ctx.shadowBlur  = 7;
      ctx.shadowColor = `hsl(${d.hue}, 100%, 70%)`;
      ctx.fillStyle   = `hsl(${d.hue}, 100%, 80%)`;
      ctx.beginPath();
      ctx.arc(ox, oy, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    ctx.restore();
  }
}

// ======================= COLLECTION EFFECT =======================
class CollectEffect {
  constructor(px, py, shipX, shipY) {
    this.px    = px;   
    this.py    = py;
    this.shipX = shipX;
    this.shipY = shipY;
    this.timer    = 0;
    this.duration = 1.0;

    this.shards = Array.from({ length: 6 }, (_, i) => {
      const angle = (i / 6) * Math.PI * 2 + Math.random() * 0.3;
      return {
        angle,
        vx:  Math.cos(angle) * (110 + Math.random() * 40),
        vy:  Math.sin(angle) * (110 + Math.random() * 40),
        hue: i * 60,
        size: 7 + Math.random() * 4,
      };
    });

    this.sparks = Array.from({ length: 8 }, (_, i) => {
      const a = (i / 8) * Math.PI * 2 + Math.random() * 0.5;
      return {
        vx:  Math.cos(a) * (60 + Math.random() * 60),
        vy:  Math.sin(a) * (60 + Math.random() * 60),
        hue: Math.random() * 360,
      };
    });
  }

  isDead() { return this.timer >= this.duration; }

  update(dt) { this.timer += dt; }

  draw(ctx) {
    const t = this.timer / this.duration;

    //  EXPANDING HEALING RINGS  
    if (t < 0.85) {
      const rT = t / 0.85;

      const ring1R = rT * 130;
      ctx.save();
      ctx.globalAlpha = (1 - rT) * 0.75;
      ctx.strokeStyle = '#ccffee';
      ctx.shadowBlur  = 18;
      ctx.shadowColor = '#44ffaa';
      ctx.lineWidth   = 3;
      ctx.beginPath();
      ctx.arc(this.px, this.py, ring1R, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      if (rT > 0.12) {
        const ring2R = (rT - 0.12) * 130;
        ctx.save();
        ctx.globalAlpha = (1 - rT) * 0.35;
        ctx.strokeStyle = '#ffffff';
        ctx.shadowBlur  = 8;
        ctx.shadowColor = '#88ffcc';
        ctx.lineWidth   = 1.5;
        ctx.beginPath();
        ctx.arc(this.px, this.py, ring2R, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }

    // ── RAINBOW TRIANGLE SHARDS ───────────────────────────────────
    for (const shard of this.shards) {
      let sx, sy, alpha, sz;

      if (t < 0.18) {
        // BURST OUTWARD
        const st = t / 0.18;
        sx    = this.px + shard.vx * st * 0.18;
        sy    = this.py + shard.vy * st * 0.18;
        alpha = st;
        sz    = shard.size * (0.5 + st * 0.5);
      } else if (t < 0.22) {
        // FREEZE BRIEFLY
        sx    = this.px + shard.vx * 0.18;
        sy    = this.py + shard.vy * 0.18;
        alpha = 1;
        sz    = shard.size;
      } else if (t < 0.7) {
        const st  = (t - 0.22) / 0.48;
        const eased = st * st * (3 - 2 * st); 
        const frozenX = this.px + shard.vx * 0.18;
        const frozenY = this.py + shard.vy * 0.18;
        sx    = frozenX + (this.shipX - frozenX) * eased;
        sy    = frozenY + (this.shipY - frozenY) * eased;
        alpha = 1 - eased * 0.6;
        sz    = shard.size * (1 - eased * 0.4);
      } else {
        continue;
      }

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle   = `hsl(${shard.hue}, 100%, 68%)`;
      ctx.shadowBlur  = 12;
      ctx.shadowColor = `hsl(${shard.hue}, 100%, 70%)`;
      ctx.translate(sx, sy);
      ctx.rotate(t * Math.PI * 3 + shard.angle);
      ctx.beginPath();
      ctx.moveTo(0, -sz);
      ctx.lineTo(sz * 0.65, sz * 0.7);
      ctx.lineTo(-sz * 0.65, sz * 0.7);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // ── STARDUST SPARKS  ────
    if (t > 0.35) {
      const st = (t - 0.35) / 0.65;
      for (const spark of this.sparks) {
        const sx    = this.shipX + spark.vx * st * 0.65;
        const sy    = this.shipY + spark.vy * st * 0.65;
        const alpha = (1 - st) * 0.9;
        if (alpha < 0.01) continue;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle   = `hsl(${spark.hue}, 100%, 80%)`;
        ctx.shadowBlur  = 6;
        ctx.shadowColor = `hsl(${spark.hue}, 100%, 70%)`;
        ctx.beginPath();
        ctx.arc(sx, sy, 2 * (1 - st * 0.7), 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
  }
}

// ======================= MANAGER =======================
export class CosmicPrismManager {
  constructor() {
    this.prisms  = [];
    this.effects = [];
    this._active     = false;
    this._spawnTimer = 0;

    this.onCollect = null;

 
    this.audio = null;
  }

  start() {
    this._active     = true;
    this._spawnTimer = CONFIG.COSMIC_PRISM.FIRST_SPAWN_DELAY;
    this.prisms      = [];
    this.effects     = [];
  }

  reset() {
    this._active     = false;
    this._spawnTimer = 0;
    this.prisms      = [];
    this.effects     = [];
  }

  stop() {
    this._active = false;
    this.prisms  = [];
  }

  update(dt, shipX, shipY) {
    if (this._active) {
      this._spawnTimer -= dt;
      if (this._spawnTimer <= 0 && this.prisms.length < CONFIG.COSMIC_PRISM.MAX_COUNT) {
        this._spawnPrism();
        this._spawnTimer = CONFIG.COSMIC_PRISM.SPAWN_INTERVAL;
      }
    }

    for (let i = this.prisms.length - 1; i >= 0; i--) {
      const p = this.prisms[i];
      p.update(dt);

      if (!p.collected) {
        const dx = shipX - p.x;
        const dy = shipY - p.y;
        if (Math.sqrt(dx * dx + dy * dy) < CONFIG.COSMIC_PRISM.COLLECT_RADIUS) {
          p.collected = true;
          this._triggerCollect(p, shipX, shipY);
        }
      }

      if (p.isDead()) this.prisms.splice(i, 1);
    }

    for (let i = this.effects.length - 1; i >= 0; i--) {
      const e = this.effects[i];
      e.update(dt);
      if (e.isDead()) this.effects.splice(i, 1);
    }
  }

  draw(ctx) {
    for (const p of this.prisms)  p.draw(ctx);
    for (const e of this.effects) e.draw(ctx);
  }

  _spawnPrism() {
    const C      = CONFIG.COSMIC_PRISM;
    const margin = 140;
    const x      = margin + Math.random() * (window.innerWidth  - margin * 2);
    const y      = margin + Math.random() * (window.innerHeight - margin * 2);
    this.prisms.push(new Prism(x, y));
  }

  _triggerCollect(prism, shipX, shipY) {
    this.effects.push(new CollectEffect(prism.x, prism.y, shipX, shipY));
    this.audio?.playPowerUp1();
    if (this.onCollect) this.onCollect(CONFIG.COSMIC_PRISM.HEAL_AMOUNT);
  }
}