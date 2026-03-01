// waveWorm.js
// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ IMPORTS ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
import { CONFIG } from '../utils/config.js';
import { ImageLoader } from '../utils/imageLoader.js';
// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

const WW  = CONFIG.WAVE_WORM;
const GOO = CONFIG.GOO_PROJECTILE;

class GooProjectile {
  constructor(x, y, targetX, targetY) {
    this.x  = x;
    this.y  = y;

    const dx   = targetX - x;
    const dy   = targetY - y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const t    = dist / GOO.SPEED;          

    this.vx = (dx / dist) * GOO.SPEED;
    this.vy = (dy / t) - 0.5 * GOO.GRAVITY * t;   // KINEMATICS: y = vy*t + ½g*t²

    this.isDead = false;

    this.impacting    = false; // SIZZLE STATE
    this.sizzleFrame  = 0;
    this.sizzleTimer  = 0;
    this.impactX      = 0;
    this.impactY      = 0;
  }

  update(dt, shipX, shipY) {
    if (this.isDead) return;

    if (this.impacting) {
      this.sizzleTimer += dt;
      this.sizzleFrame  = Math.floor(this.sizzleTimer * GOO.SIZZLE_FPS);
      if (this.sizzleFrame >= GOO.SIZZLE_FRAMES) this.isDead = true;
      return;
    }

    this.vy += GOO.GRAVITY * dt;  // PHYSICS
    this.x  += this.vx * dt;
    this.y  += this.vy * dt;

    const dx = this.x - shipX; // HIT CHECK vs SHIP
    const dy = this.y - shipY;
    if (dx * dx + dy * dy < GOO.HIT_RADIUS * GOO.HIT_RADIUS) {
      this._startSizzle();
      return true;   
    }

    const pad = 120;
    if (
      this.x < -pad || this.x > window.innerWidth  + pad ||
      this.y < -pad || this.y > window.innerHeight + pad
    ) this.isDead = true;

    return false;
  }

  _startSizzle() {
    this.impacting   = true;
    this.impactX     = this.x;
    this.impactY     = this.y;
    this.sizzleFrame = 0;
    this.sizzleTimer = 0;
  }

  draw(ctx) {
    if (this.isDead) return;

    if (this.impacting) {
      const sprite = ImageLoader.isLoaded('gooSizzle') ? ImageLoader.get('gooSizzle') : null;
      if (sprite) {
        const fw = sprite.width / GOO.SIZZLE_FRAMES;
        const sz = GOO.SIZZLE_SIZE;
        ctx.save();
        ctx.globalAlpha = 1 - (this.sizzleTimer / (GOO.SIZZLE_FRAMES / GOO.SIZZLE_FPS)) * 0.4;
        ctx.drawImage(
          sprite,
          this.sizzleFrame * fw, 0, fw, sprite.height,
          this.impactX - sz / 2, this.impactY - sz / 2 - 70, sz, sz
        );
        ctx.restore();
      } else {  // FALLBACK
        const frac = 1 - this.sizzleFrame / GOO.SIZZLE_FRAMES;
        ctx.save();
        ctx.globalAlpha = frac * 0.9;
        ctx.shadowColor = '#44ff44';
        ctx.shadowBlur  = 18;
        ctx.fillStyle   = '#22cc33';
        ctx.beginPath();
        ctx.arc(this.impactX, this.impactY, GOO.SIZZLE_SIZE * 0.5 * (1.4 - frac * 0.4), 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      return;
    }

    const angle = Math.atan2(this.vy, this.vx) + Math.PI / 2;  //  FLYING BLOB 
    const speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
    const stretch = 1 + Math.min(speed / GOO.SPEED, 1) * 0.5;  // ELONGATE WITH SPEED

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(angle);
    ctx.scale(1, stretch);

    ctx.shadowColor = '#33ff55';
    ctx.shadowBlur  = 12;
    ctx.fillStyle   = '#1a9922';
    ctx.beginPath();
    ctx.arc(0, 0, GOO.BLOB_RADIUS, 0, Math.PI * 2);
    ctx.fill();

    ctx.shadowBlur  = 0;
    ctx.fillStyle   = 'rgba(255,255,255,0.45)';
    ctx.beginPath();
    ctx.arc(-GOO.BLOB_RADIUS * 0.28, -GOO.BLOB_RADIUS * 0.28, GOO.BLOB_RADIUS * 0.28, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }
}



class WaveWorm {
  constructor(waveIndex, lateralOffset) {
    this.waveIndex = waveIndex;  

    this.progress = 0;  //  3D APPROACH PROGRESS 
    this.speed    = WW.PASS_SPEED;    // PROGRESS UNITS PER SECOND

    this.lateralOffset = lateralOffset; // HOW FAR OFF SCREEN CENTER THE WORM ENTERS

   
    this.scale   = 0;  //  SCREEN POSITION 
    this.screenX = window.innerWidth  / 2 + WW.TUNNEL_BEND_X_OFFSET + lateralOffset;
    this.screenY = window.innerHeight / 2;
    this.x       = this.screenX;
    this.y       = this.screenY;

    this.segments = Array.from({ length: WW.NUM_SEGMENTS }, () => ({  //  IK SEGMENT CHAIN 
      x: this.screenX, y: this.screenY,
    }));

  
    this.wigglePhase = Math.random() * Math.PI * 2; //  WIGGLE 
    this.time        = 0;

    this.gooTimer    = WW.GOO_FIRST_SHOT_MIN 
                     + Math.random() * (WW.GOO_FIRST_SHOT_MAX - WW.GOO_FIRST_SHOT_MIN);  //  GOO ATTACK 
    this.goos        = [];           

  
    this.prevX = this.screenX;  //  VELOCITY 
    this.prevY = this.screenY;
    this.vx    = 0;
    this.vy    = 0;

    //  STATE 
    this.health      = WW.HEALTH;
    this.maxHealth   = WW.HEALTH;
    this.flashTimer  = 0;
    this.isDead      = false;
    this.hasExited   = false;   
    this.alpha       = 0;       // FADE IN
  }

  update(dt, shipX, shipY) {
    if (this.isDead) return;

    this.time  += dt;
    this.alpha  = Math.min(1, this.alpha + dt * 4);

    this.progress = Math.min(1, this.progress + this.speed * dt);  //  PROGRESS & SCALE 
    this.scale    = Math.sin(this.progress * Math.PI);  // BELL CURVE 0→1→0

    if (this.progress >= 1) {
      this.hasExited = true;
      this.isDead    = true;
      return;
    }

    const cx = window.innerWidth  / 2 + WW.TUNNEL_BEND_X_OFFSET; //  SCREEN POSITION - ANCHOR TO TUNNEL BEND -  CENTER LEFT 
    const cy = window.innerHeight / 2;

    this.prevX = this.screenX;
    this.prevY = this.screenY;

    const vertDrift = Math.sin(this.wigglePhase + this.time * WW.WIGGLE_FREQ) // SUBTLE VERTICAL SINE DRIFT - ORGANIC PATH
                    * WW.WIGGLE_AMP * this.scale;

    this.screenX = cx + this.lateralOffset * (1 - this.scale * 0.3);  //  OFFSET - SHRINKS A BIT AT PEAK
    this.screenY = cy + vertDrift;
    this.x = this.screenX;
    this.y = this.screenY;

   
    this.vx = this.screenX - this.prevX;  // HEAD VELOCITY 
    this.vy = this.screenY - this.prevY;

    //  IK SEGMENT CHAIN 
    this.segments[0].x = this.x;
    this.segments[0].y = this.y;
    const spacing = WW.SEGMENT_SPACING * this.scale;
    for (let i = 1; i < this.segments.length; i++) {
      const prev = this.segments[i - 1];
      const curr = this.segments[i];
      const sdx  = curr.x - prev.x;
      const sdy  = curr.y - prev.y;
      const sd   = Math.sqrt(sdx * sdx + sdy * sdy);
      if (sd > spacing && sd > 0) {
        const r  = spacing / sd;
        curr.x   = prev.x + sdx * r;
        curr.y   = prev.y + sdy * r;
      }
    }

    //  GOO ATTACK 
    if (this.scale > WW.GOO_MIN_SCALE) {
      this.gooTimer -= dt;
      if (this.gooTimer <= 0) {
        this.goos.push(new GooProjectile(this.x, this.y, shipX, shipY));
        this.gooTimer = WW.GOO_INTERVAL_MIN
                      + Math.random() * (WW.GOO_INTERVAL_MAX - WW.GOO_INTERVAL_MIN);
      }
    }

    //  UPDATE GOOS 
    if (this.flashTimer > 0) this.flashTimer -= dt;

    let gooHit = false;
    for (let i = this.goos.length - 1; i >= 0; i--) {
      const hit = this.goos[i].update(dt, shipX, shipY);
      if (hit) gooHit = true;
      if (this.goos[i].isDead && !this.goos[i].impacting) {
        this.goos.splice(i, 1);
      }
    }
    return gooHit;   
  }

  draw(ctx) {
    if (this.isDead && !this.goos.length) return;

    const sprite   = ImageLoader.isLoaded('waveWorms') ? ImageLoader.get('waveWorms') : null;
    const fw       = sprite ? sprite.width / WW.SPRITE_FRAMES : 0;
    const bodyFrameX = this.waveIndex * 2;       
    const headFrameX = this.waveIndex * 2 + 1;  

    const headSize = WW.HEAD_SIZE * this.scale;
    const segSize  = WW.HEAD_SIZE * WW.SEGMENT_SIZE_RATIO * this.scale;

    ctx.save();
    ctx.globalAlpha = this.alpha;

    for (let i = this.segments.length - 1; i >= 0; i--) {  //  BODY SEGMENTS — TAIL 1ST 
      const seg    = this.segments[i];
      const taper  = i / (this.segments.length - 1);         // 0=HEAD END, 1=TAIL
      const sz     = segSize * (1 - taper * WW.TAPER_RATIO); // TAPER TOWARDS TAIL

      const ref    = i > 0 ? this.segments[i - 1] : { x: this.x, y: this.y };
      const angle  = Math.atan2(ref.y - seg.y, ref.x - seg.x) - Math.PI / 2;

      ctx.save();
      ctx.translate(seg.x, seg.y);
      ctx.rotate(angle);

      if (this.flashTimer > 0) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.7 * this.alpha;
      }

      if (sprite && fw > 0) {
        ctx.drawImage(sprite,
          bodyFrameX * fw, 0, fw, sprite.height,
          -sz / 2, -sz / 2, sz, sz);
      } else {
        ctx.fillStyle = `hsl(${120 + this.waveIndex * 40}, 80%, 45%)`; // FALLBACK
        ctx.beginPath();
        ctx.arc(0, 0, sz / 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    const mag      = Math.sqrt(this.vx * this.vx + this.vy * this.vy); //  HEAD 
    //const headAngle = -Math.PI / 2;
    const headAngle = 0;

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(headAngle);

    if (this.flashTimer > 0) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.8 * this.alpha;
    }

    if (sprite && fw > 0) {
      ctx.drawImage(sprite,
        headFrameX * fw, 0, fw, sprite.height,
        -headSize / 2, -headSize / 2, headSize, headSize);
    } else {
      ctx.shadowColor = `hsl(${120 + this.waveIndex * 40}, 100%, 60%)`;
      ctx.shadowBlur  = 18;
      ctx.fillStyle   = `hsl(${120 + this.waveIndex * 40}, 90%, 55%)`;
      ctx.beginPath();
      ctx.arc(0, 0, headSize / 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    ctx.restore();   // GLOBAL ALPHA

   
    if (this.scale > 0.35 && this.health < this.maxHealth) { //  HEALTH BAR  
      const barW  = headSize * 1.4;
      const barH  = 5;
      const barX  = this.x - barW / 2;
      const barY  = this.y - headSize * 0.8;
      const pct   = this.health / this.maxHealth;

      ctx.save();
      ctx.globalAlpha = Math.min(1, (this.scale - 0.35) / 0.2) * this.alpha;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(barX - 1, barY - 1, barW + 2, barH + 2);
      ctx.fillStyle = pct > 0.5 ? '#44ff66' : (pct > 0.25 ? '#ffcc00' : '#ff2200');
      ctx.fillRect(barX, barY, barW * pct, barH);
      ctx.restore();
    }
    for (const g of this.goos) g.draw(ctx);  //  GOO PROJECTILES 
  }

  takeDamage(amount = 1) {  //  DAMAGE 
    this.health     -= amount;
    this.flashTimer  = 0.08;
    if (this.health <= 0) {
      this.isDead = true;
      return true;   // KILLED
    }
    return false;
  }

  checkProjectileHit(seg) { //  HIT CHECK 
    if (this.isDead || this.scale < WW.HIT_MIN_SCALE) return false;
    const r  = (WW.HEAD_SIZE * this.scale) * 0.45;  // SLIGHTLY FORGIVING
    const dx = seg.x1 - this.x;
    const dy = seg.y1 - this.y;
    return (dx * dx + dy * dy) < r * r;
  }

  getPosition() { return { x: this.x, y: this.y }; }
  getSize()     { return (WW.HEAD_SIZE * this.scale) * 0.45; }

  cleanGoo() {
    for (let i = this.goos.length - 1; i >= 0; i--) {
      if (this.goos[i].isDead) this.goos.splice(i, 1);
    }
  }
}


// WAVE WORM MANAGER
export class WaveWormManager {
  constructor() {
    this.currentWave  = 0;     
    this.active       = false;  
    this.worm         = null;   
    this.spawnTimer   = 0;      
    this.kills        = 0;      
    this.required     = 0;      

    //  CALLBACKS 
    this.onKill       = null;   // KILLS REQUIRED
    this.onWaveCleared = null;  // WAVE IS COMPLETE
    this.onGooHit     = null;   //  GOO HIT SHIP
    this.onWormExit   = null;   // PASSED WITHOUT BEING KILLED

    console.log('✔ WaveWormManager initialized');
  }


  startWave(waveIndex) {
    ImageLoader.load('waveWorms');
    ImageLoader.load('gooSizzle');

    this.currentWave = waveIndex;
    this.required    = WW.KILLS_PER_WAVE[waveIndex];
    this.kills       = 0;
    this.active      = true;
    this.worm        = null;

 
    this.spawnTimer  = WW.FIRST_SPAWN_DELAY_MIN
                     + Math.random() * (WW.FIRST_SPAWN_DELAY_MAX - WW.FIRST_SPAWN_DELAY_MIN);
  }

  stop() {
    this.active = false;
    this.worm   = null;
  }

  update(dt, shipX, shipY) {
    if (!this.active) return;

    if (!this.worm) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        this._spawnWorm();
      }
      return;
    }

    const gooHit = this.worm.update(dt, shipX, shipY);  //  UPDATE ACTIVE WORM 
    if (gooHit) this.onGooHit?.();

    this.worm.cleanGoo();

    if (this.worm.hasExited) { //  WORM EXITED WITHOUT BEING KILLED 
      this.onWormExit?.();
      this.worm       = null;
      this.spawnTimer = WW.SPAWN_GAP_MIN
                      + Math.random() * (WW.SPAWN_GAP_MAX - WW.SPAWN_GAP_MIN);
    }

    if (this.worm?.isDead && !this.worm.hasExited) { //  WORM KILLED 
      this.kills++;
      this.onKill?.(this.kills, this.required);

      this.worm       = null;
      this.spawnTimer = WW.SPAWN_GAP_MIN
                      + Math.random() * (WW.SPAWN_GAP_MAX - WW.SPAWN_GAP_MIN);

      if (this.kills >= this.required) {
        this.active = false;
        this.onWaveCleared?.();
      }
    }
  }

  draw(ctx) {
    this.worm?.draw(ctx);
  }

  checkProjectileHit(seg) {  //  PROJECTILE HIT CHECK  
    if (!this.worm || this.worm.isDead) return { hit: false };
    const hit = this.worm.checkProjectileHit(seg);
    if (hit) {
      const killed = this.worm.takeDamage(1);
      return { hit: true, x: this.worm.x, y: this.worm.y, killed };
    }
    return { hit: false };
  }

  _spawnWorm() {
    const lateralOffset = (Math.random() < 0.5 ? -1 : 1)
                        * (WW.LATERAL_MIN + Math.random() * (WW.LATERAL_MAX - WW.LATERAL_MIN));
    this.worm = new WaveWorm(this.currentWave, lateralOffset);
  }

  //  GETTERS 
  getKills()    { return this.kills; }
  getRequired() { return this.required; }
  hasWorm()     { return !!this.worm && !this.worm.isDead; }
  clear()       { this.worm = null; this.active = false; }
}