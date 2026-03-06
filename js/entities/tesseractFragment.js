// Updated 3/6/26 @ 6:30PM
// tesseractFragment.js 
// ~~~~~~~~~~~~~~~~~~~~ IMPORTS ~~~~~~~~~~~~~~~~~~~~
import { CONFIG } from '../utils/config.js';
// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

// ── PRE-COMPUTED GEOMETRY  ──
const VERTS = [
  [-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],
  [-1,-1, 1],[1,-1, 1],[1,1, 1],[-1,1, 1],
];
const EDGES = [
  [0,1],[1,2],[2,3],[3,0],   // BACK FACE
  [4,5],[5,6],[6,7],[7,4],   // FRONT FACE
  [0,4],[1,5],[2,6],[3,7],   // CONNECTORS
];

const _outerP = Array.from({ length: 8 }, () => new Float32Array(2));
const _innerP = Array.from({ length: 8 }, () => new Float32Array(2));

function _ry(x, y, z, c, s) { return [x * c + z * s, y, -x * s + z * c]; }
function _rx(x, y, z, c, s) { return [x, y * c - z * s, y * s + z * c]; }

function _pj(x, y, z, scale, buf, i) {
  const iz  = 1 / (3.4 - z);
  buf[i][0] = x * iz * scale;
  buf[i][1] = y * iz * scale;
}

class TesseractFragment {
  constructor(x, y) {
    this.x        = x;
    this.baseY    = y;
    this.y        = y;
    this.angleA   = Math.random() * Math.PI * 2;
    this.angleB   = Math.random() * Math.PI * 0.5;
    this.time     = 0;
    this.bobTimer = Math.random() * Math.PI * 2;
    this.life     = CONFIG.TESSERACT_FRAGMENT.LIFETIME;
    this.radius   = CONFIG.TESSERACT_FRAGMENT.RADIUS;
    this.collected = false;

    this.sparks = Array.from({ length: 3 }, (_, i) => ({
      angle:  (i / 3) * Math.PI * 2,
      speed:  1.3 + Math.random() * 0.5,
      orbitR: this.radius * 2.3 + Math.random() * 5,
      hue:    i * 120,
    }));
  }

  update(dt) {
    const C       = CONFIG.TESSERACT_FRAGMENT;
    this.time     += dt;
    this.angleA   += dt * C.ROTATION_SPEED;
    this.angleB   += dt * C.ROTATION_SPEED * 0.65;
    this.bobTimer += dt;
    this.y         = this.baseY + Math.sin(this.bobTimer * 1.1) * 7;
    this.life      -= dt;
    for (const s of this.sparks) s.angle += dt * s.speed;
  }

  isDead()   { return this.life <= 0 || this.collected; }

  getAlpha() {
    const C      = CONFIG.TESSERACT_FRAGMENT;
    const fadeIn  = Math.min(1, (C.LIFETIME - this.life) / 1.2);
    const fadeOut = this.life < 2.5 ? this.life / 2.5 : 1;
    return fadeIn * fadeOut;
  }

  draw(ctx) {
    const alpha = this.getAlpha();
    if (alpha <= 0) return;

    const C     = CONFIG.TESSERACT_FRAGMENT;
    const scale = C.RADIUS * 2.6;
    const t     = this.time;
    const w     = Math.sin(t * 0.85);          
    const doWarp = Math.abs(w) > 0.25;         
    const hueBase = (t * 90) % 360;

    const cA = Math.cos(this.angleA), sA = Math.sin(this.angleA);
    const cB = Math.cos(this.angleB), sB = Math.sin(this.angleB);

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.globalAlpha = alpha;

    // ── OUTER GLOW HALO ──────────────────────────────────────────
    ctx.save();
    ctx.globalAlpha = alpha * 0.14;
    const glowR = C.RADIUS * 3.2;
    const gGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, glowR);
    gGrad.addColorStop(0, `hsla(${hueBase}, 100%, 65%, 0.9)`);
    gGrad.addColorStop(1, 'hsla(0,0%,0%,0)');
    ctx.fillStyle = gGrad;
    ctx.beginPath();
    ctx.arc(0, 0, glowR, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // ── PROJECT OUTER CUBE ───────────────────────────────────────
    const s4 = 1 + w * 0.38;
    for (let i = 0; i < 8; i++) {
      let [vx, vy, vz] = VERTS[i];
      vx *= s4; vy *= s4; vz += w * 0.45; 
      [vx, vy, vz] = _ry(vx, vy, vz, cA, sA);
      [vx, vy, vz] = _rx(vx, vy, vz, cB, sB);
      _pj(vx, vy, vz, scale, _outerP, i);
    }

    // ── OUTER EDGES ──────────────────────────────────────────────
    ctx.save();
    ctx.lineWidth  = 1.8;
    ctx.lineCap    = 'round';
    ctx.shadowBlur = 9;
    for (let e = 0; e < EDGES.length; e++) {
      const [ai, bi] = EDGES[e];
      const x1 = _outerP[ai][0], y1 = _outerP[ai][1];
      const x2 = _outerP[bi][0], y2 = _outerP[bi][1];
      const hue = (hueBase + e * 22) % 360;
      ctx.strokeStyle = `hsl(${hue},100%,65%)`;
      ctx.shadowColor = `hsl(${hue},100%,65%)`;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      if (doWarp) {
        // NON-EUCLIDEAN EDGE WARP — 
        const mx = (x1 + x2) / 2;
        const my = (y1 + y2) / 2;
        const wa = w * 13;
        ctx.quadraticCurveTo(mx + wa, my - wa, x2, y2);
      } else {
        ctx.lineTo(x2, y2);
      }
      ctx.stroke();
    }
    ctx.restore();

    // ── OUTER VERTEX GLOW DOTS ───────────────────────────────────
    ctx.save();
    ctx.shadowBlur = 7;
    for (let i = 0; i < 8; i++) {
      const hue = (hueBase + i * 45) % 360;
      ctx.fillStyle   = `hsl(${hue}, 100%, 88%)`;
      ctx.shadowColor = `hsl(${hue}, 100%, 88%)`;
      ctx.beginPath();
      ctx.arc(_outerP[i][0], _outerP[i][1], 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // ── PROJECT INNER CUBE  ──
    const is4 = 1 - w * 0.28;
    const icA = -this.angleA * 1.25;
    const icB = -this.angleB * 0.85;
    const innerScale = scale * 0.48;
    for (let i = 0; i < 8; i++) {
      let [vx, vy, vz] = VERTS[i];
      vx *= is4; vy *= is4; vz -= w * 0.3;
      [vx, vy, vz] = _ry(vx, vy, vz, Math.cos(icA), Math.sin(icA));
      [vx, vy, vz] = _rx(vx, vy, vz, Math.cos(icB), Math.sin(icB));
      _pj(vx, vy, vz, innerScale, _innerP, i);
    }

    // ── INNER EDGES ──────────────────────────────────────────────
    ctx.save();
    ctx.lineWidth  = 1.2;
    ctx.lineCap    = 'round';
    ctx.shadowBlur = 6;
    for (let e = 0; e < EDGES.length; e++) {
      const [ai, bi] = EDGES[e];
      const hue = (hueBase + e * 22 + 180) % 360;
      ctx.strokeStyle = `hsl(${hue},100%,75%)`;
      ctx.shadowColor = `hsl(${hue},100%,75%)`;
      ctx.beginPath();
      ctx.moveTo(_innerP[ai][0], _innerP[ai][1]);
      ctx.lineTo(_innerP[bi][0], _innerP[bi][1]);
      ctx.stroke();
    }
    ctx.restore();

    // ── ORBIT SPARKS ─────────────────────────────────────────────
    ctx.save();
    ctx.shadowBlur = 7;
    for (const s of this.sparks) {
      const ox = Math.cos(s.angle) * s.orbitR;
      const oy = Math.sin(s.angle) * s.orbitR;
      ctx.fillStyle   = `hsl(${s.hue}, 100%, 75%)`;
      ctx.shadowColor = `hsl(${s.hue}, 100%, 75%)`;
      ctx.beginPath();
      ctx.arc(ox, oy, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    ctx.restore(); 
  }
}

class TesseractCollectEffect {
  constructor(x, y, shipX, shipY) {
    this.x        = x;
    this.y        = y;
    this.shipX    = shipX;
    this.shipY    = shipY;
    this.timer    = 0;
    this.duration = 1.2;

    this.shards = Array.from({ length: 8 }, (_, i) => {
      const angle = (i / 8) * Math.PI * 2 + Math.random() * 0.3;
      return {
        angle,
        vx:   Math.cos(angle) * (90 + Math.random() * 50),
        vy:   Math.sin(angle) * (90 + Math.random() * 50),
        hue:  i * 45,
        size: 6 + Math.random() * 4,
      };
    });

    this.sparks = Array.from({ length: 6 }, (_, i) => {
      const a = (i / 6) * Math.PI * 2 + Math.random() * 0.6;
      return {
        vx:  Math.cos(a) * (70 + Math.random() * 55),
        vy:  Math.sin(a) * (70 + Math.random() * 55),
        hue: Math.random() * 360,
      };
    });
  }

  isDead()   { return this.timer >= this.duration; }
  update(dt) { this.timer += dt; }

  draw(ctx) {
    const t = this.timer / this.duration;

    // ── EXPANDING RINGS ───────────────────────────────────────────
    if (t < 0.7) {
      const rt = t / 0.7;

      ctx.save();
      ctx.globalAlpha = (1 - rt) * 0.9;
      ctx.strokeStyle = '#ffffff';
      ctx.shadowBlur  = 20;
      ctx.shadowColor = '#88ffff';
      ctx.lineWidth   = 3 - rt * 2;
      ctx.beginPath();
      ctx.arc(this.x, this.y, rt * 110, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      if (rt > 0.15) {
        const rt2 = rt - 0.15;
        ctx.save();
        ctx.globalAlpha = (1 - rt) * 0.45;
        ctx.strokeStyle = `hsl(${(t * 360) % 360}, 100%, 70%)`;
        ctx.lineWidth   = 1.5;
        ctx.shadowBlur  = 10;
        ctx.shadowColor = `hsl(${(t * 360) % 360}, 100%, 70%)`;
        ctx.beginPath();
        ctx.arc(this.x, this.y, rt2 * 110, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }

    // ── SHARD DIAMONDS ─────────────
    for (const shard of this.shards) {
      let sx, sy, alpha, sz;

      if (t < 0.15) {
        const st = t / 0.15;
        sx    = this.x + shard.vx * st * 0.15;
        sy    = this.y + shard.vy * st * 0.15;
        alpha = st;
        sz    = shard.size * (0.4 + st * 0.6);
      } else if (t < 0.22) {
        sx    = this.x + shard.vx * 0.15;
        sy    = this.y + shard.vy * 0.15;
        alpha = 1;
        sz    = shard.size;
      } else if (t < 0.72) {
        const st    = (t - 0.22) / 0.50;
        const eased = st * st * (3 - 2 * st); // SMOOTHSTEP
        const fx    = this.x + shard.vx * 0.15;
        const fy    = this.y + shard.vy * 0.15;
        sx    = fx + (this.shipX - fx) * eased;
        sy    = fy + (this.shipY - fy) * eased;
        alpha = 1 - eased * 0.65;
        sz    = shard.size * (1 - eased * 0.5);
      } else {
        continue;
      }

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle   = `hsl(${shard.hue}, 100%, 68%)`;
      ctx.shadowBlur  = 12;
      ctx.shadowColor = `hsl(${shard.hue}, 100%, 70%)`;
      ctx.translate(sx, sy);
      ctx.rotate(t * Math.PI * 4 + shard.angle);
      // DIAMOND SHAPE 
      ctx.beginPath();
      ctx.moveTo(0,          -sz);
      ctx.lineTo(sz * 0.55,   0);
      ctx.lineTo(0,           sz);
      ctx.lineTo(-sz * 0.55,  0);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // ── STARBURST SPARKS  ────
    if (t > 0.3) {
      const st = (t - 0.3) / 0.7;
      for (const spark of this.sparks) {
        const sx    = this.shipX + spark.vx * st * 0.6;
        const sy    = this.shipY + spark.vy * st * 0.6;
        const alpha = (1 - st) * 0.85;
        if (alpha < 0.01) continue;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle   = `hsl(${spark.hue}, 100%, 80%)`;
        ctx.shadowBlur  = 6;
        ctx.shadowColor = `hsl(${spark.hue}, 100%, 80%)`;
        ctx.beginPath();
        ctx.arc(sx, sy, 2.5 * (1 - st * 0.7), 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
  }
}

export class TesseractFragmentManager {
  constructor() {
    this.fragments   = [];
    this.effects     = [];
    this._active     = false;
    this._spawnTimer = 0;
    this._boostTimer = 0;   
    this._boostTime  = 0;   

    this.onCollect = null;  
    this.audio     = null;  
  }

  isBoostActive() { return this._boostTimer > 0; }
  getBoostTimer() { return this._boostTimer; }

  start() {
    this._active     = true;
    this._spawnTimer = CONFIG.TESSERACT_FRAGMENT.FIRST_SPAWN_DELAY;
    this.fragments   = [];
    this.effects     = [];
    this._boostTimer = 0;
    this._boostTime  = 0;
  }

  stop() {
    this._active   = false;
    this.fragments = [];
  }

  reset() {
    this._active     = false;
    this._spawnTimer = 0;
    this.fragments   = [];
    this.effects     = [];
    this._boostTimer = 0;
    this._boostTime  = 0;
  }

  update(dt, shipX, shipY) {
    // ── SPAWN ──────────────────────────────────────────────────────
    if (this._active) {
      this._spawnTimer -= dt;
      if (this._spawnTimer <= 0 && this.fragments.length < CONFIG.TESSERACT_FRAGMENT.MAX_COUNT) {
        this._spawnFragment();
        this._spawnTimer = CONFIG.TESSERACT_FRAGMENT.SPAWN_INTERVAL;
      }
    }

    // ── BOOST TIMER ────────────────────────────────────────────────
    if (this._boostTimer > 0) {
      this._boostTimer = Math.max(0, this._boostTimer - dt);
      this._boostTime  += dt;
    }

    // ── FRAGMENTS + COLLECTION CHECK ──────────────────────────────
    for (let i = this.fragments.length - 1; i >= 0; i--) {
      const f = this.fragments[i];
      f.update(dt);
      if (!f.collected) {
        const dx = shipX - f.x;
        const dy = shipY - f.y;
        const cr = CONFIG.TESSERACT_FRAGMENT.COLLECT_RADIUS;
        if (dx * dx + dy * dy < cr * cr) {
          f.collected = true;
          this._triggerCollect(f, shipX, shipY);
        }
      }
      if (f.isDead()) this.fragments.splice(i, 1);
    }

    // ── COLLECT EFFECTS ───────────────────────────────────────────
    for (let i = this.effects.length - 1; i >= 0; i--) {
      this.effects[i].update(dt);
      if (this.effects[i].isDead()) this.effects.splice(i, 1);
    }
  }

  drawItems(ctx) {
    for (const f of this.fragments) f.draw(ctx);
    for (const e of this.effects)   e.draw(ctx);
  }

  drawAuraAndHUD(ctx, shipX, shipY) {
    if (!this.isBoostActive()) return;

    const C   = CONFIG.TESSERACT_FRAGMENT;
    const t   = this._boostTime;
    const pct = Math.max(0, this._boostTimer / C.BOOST_DURATION);
    const isLow  = pct < 0.25;

    // ── SHIP AURA  ──────────────────────
    const ring1R = 90 + Math.sin(t * 5)   * 8;
    const ring2R = 65 + Math.sin(t * 6.3) * 6;
    const ring3R = 48 + Math.sin(t * 8.1) * 4;
    const hue1   = (t * 120) % 360;
    const hue2   = (hue1 + 120) % 360;
    const hue3   = (hue1 + 240) % 360;
    const flash  = isLow ? 0.4 * Math.abs(Math.sin(t * 8)) : 0;

    ctx.save();

    ctx.lineWidth   = 2;
    ctx.globalAlpha = 0.55 + flash;
    ctx.strokeStyle = `hsl(${hue3}, 100%, 70%)`;
    ctx.shadowBlur  = 14;
    ctx.shadowColor = `hsl(${hue3}, 100%, 70%)`;
    ctx.beginPath();
    ctx.arc(shipX, shipY, ring3R, 0, Math.PI * 2);
    ctx.stroke();

    ctx.lineWidth   = 1.5;
    ctx.globalAlpha = 0.4 + flash;
    ctx.strokeStyle = `hsl(${hue2}, 100%, 65%)`;
    ctx.shadowColor = `hsl(${hue2}, 100%, 65%)`;
    ctx.beginPath();
    ctx.arc(shipX, shipY, ring2R, 0, Math.PI * 2);
    ctx.stroke();

    ctx.lineWidth   = 1;
    ctx.globalAlpha = 0.25 + flash;
    ctx.strokeStyle = `hsl(${hue1}, 100%, 65%)`;
    ctx.shadowColor = `hsl(${hue1}, 100%, 65%)`;
    ctx.beginPath();
    ctx.arc(shipX, shipY, ring1R, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();

    // ── BOOST TIMER HUD  ──────────────────────────
    const barW  = 160;
    const barH  = 5;
    const barX  = window.innerWidth  / 2 - barW / 2;
    const barY  = 40;
    const fillW = barW * pct;
    const barHue = (t * 120) % 360;

    ctx.save();

    // LABEL
    ctx.globalAlpha = isLow ? (0.7 + 0.3 * Math.abs(Math.sin(t * 7))) : 0.9;
    ctx.fillStyle   = `hsl(${isLow ? (t * 600 % 360) : barHue}, 100%, 75%)`;
    ctx.shadowBlur  = 8;
    ctx.shadowColor = ctx.fillStyle;
    ctx.font        = '11px Orbitron, monospace';
    ctx.textAlign   = 'center';
    ctx.fillText('◈ PHOTON OVERDRIVE', window.innerWidth / 2, barY - 9);

    // BAR TRACK
    ctx.globalAlpha = 0.28;
    ctx.fillStyle   = '#ffffff';
    ctx.shadowBlur  = 0;
    ctx.fillRect(barX, barY, barW, barH);

    // BAR FILL
    ctx.globalAlpha = isLow ? (0.6 + 0.4 * Math.abs(Math.sin(t * 8))) : 0.9;
    const barGrad = ctx.createLinearGradient(barX, 0, barX + fillW, 0);
    barGrad.addColorStop(0,    `hsl(${barHue},            100%, 55%)`);
    barGrad.addColorStop(0.5,  `hsl(${(barHue + 60)  % 360}, 100%, 70%)`);
    barGrad.addColorStop(1,    `hsl(${(barHue + 120) % 360}, 100%, 65%)`);
    ctx.fillStyle   = barGrad;
    ctx.shadowBlur  = 6;
    ctx.shadowColor = `hsl(${barHue}, 100%, 65%)`;
    if (fillW > 0) ctx.fillRect(barX, barY, fillW, barH);

    ctx.restore();
  }

  _spawnFragment() { // SPAWN IN SHIP'S REACHABLE ZONE
    const SHIP   = CONFIG.SHIP;
    const cx     = window.innerWidth  / 2;
    const cy     = window.innerHeight / 2;
    const rangeX = SHIP.MAX_OFFSET_X - 50;
    const rangeY = SHIP.MAX_OFFSET_Y - 50;
    const x      = cx + (Math.random() * 2 - 1) * rangeX;
    const y      = cy + (Math.random() * 2 - 1) * rangeY;
    this.fragments.push(new TesseractFragment(x, y));
    console.log('◈ Tesseract Fragment spawned');
  }

  _triggerCollect(frag, shipX, shipY) {
    this.effects.push(new TesseractCollectEffect(frag.x, frag.y, shipX, shipY));
    this._boostTimer = CONFIG.TESSERACT_FRAGMENT.BOOST_DURATION;
    this._boostTime  = 0;
    this.audio?.playPowerUp2();
    this.onCollect?.();
    console.log(`◈ Laser boost active for ${CONFIG.TESSERACT_FRAGMENT.BOOST_DURATION}s!`);
  }
}