// slimeAttack.js
// ~~~~~~~~~~~~~~~~~~~~ IMPORTS ~~~~~~~~~~~~~~~~~~~~
import { ImageLoader } from '../utils/imageLoader.js';
import { CONFIG } from '../utils/config.js';
// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

const PROJECTILE_FRAMES = 4;   
const DRIP_FRAMES_HALF  = 5;   // slimeDrip.png — 5 FRAMES PER WING (0-4 RIGHT, 5-9 LEFT)

export class SlimeAttack {
  constructor() {
    // ── PHASE STATE ────────────────────────────────────────────────
    // IDLE → SPIT → WARP → RECOVER → IDLE
    this.phase       = 'idle';
    this.glorkX      = 0;
    this.glorkY      = 0;

    // ── PROJECTILE DROPS ──────────────────────────────────────────
    this.drops       = [];
    this.dropTimer   = 0;
    this.dropsFired  = 0;
    this.DROPS_TOTAL      = 7;
    this.DROP_INTERVAL    = 0.15;  
    this.DROP_SPEED_MIN   = 290;
    this.DROP_SPEED_MAX   = 370;
    this.DROP_SIZE_MIN    = 20;
    this.DROP_SIZE_MAX    = 34;

    // ── WARP PHASE ────────────────────────────────────────────────
    this.warpTimer        = 0;
    this.WARP_DURATION    = 7.0;
    this.recoverTimer     = 0;
    this.RECOVER_DURATION = 1.8;

    // ========= SLIME INTENSITY — DRIVES TUNNEL GREEN + TIME WARP  =========
    this.slimeIntensity = 0;
    this._slimeTarget   = 0;

    // ========= WING DRIP ANIMATION =========
    this.dripActive    = false;
    this.dripFrame     = 0;         
    this.dripAnimTimer = 0;
    this.DRIP_FRAME_DUR = 0.09;     

    // ========= CALLBACKS =========
    this.onSplat = null;            // () => audio.playSplat()
  }

  // ========= PUBLIC: TRIGGER FROM ENEMY MANAGER =========
  trigger(glorkX, glorkY) {
    if (this.phase !== 'idle') return;
    this.phase      = 'spitting';
    this.glorkX     = glorkX;
    this.glorkY     = glorkY;
    this.drops      = [];
    this.dropTimer  = 0;
    this.dropsFired = 0;
    this.dripActive = false;
    this.dripFrame  = 0;
    this.dripAnimTimer = 0;
    this._slimeTarget  = 0;
    console.log('[SlimeAttack] Glork spits! Phase: spitting');
  }

  _spawnDrop(shipX, shipY) {
    const spreadX  = (Math.random() - 0.5) * 90;
    const spreadY  = (Math.random() - 0.5) * 40;
    const tx = shipX + spreadX;
    const ty = shipY + spreadY;

    const dx   = tx - this.glorkX;
    const dy   = ty - this.glorkY;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;

  
    const baseRotation = Math.atan2(dy, dx) + Math.PI / 2;  // ROTATE DROP SPRITE TO POINT IN CORRECT DIRECTION

    this.drops.push({
      x:           this.glorkX,
      y:           this.glorkY,
      dirX:        dx / dist,
      dirY:        dy / dist,
      speed:       this.DROP_SPEED_MIN + Math.random() * (this.DROP_SPEED_MAX - this.DROP_SPEED_MIN),
      frame:       Math.floor(Math.random() * PROJECTILE_FRAMES),  
      size:        this.DROP_SIZE_MIN + Math.random() * (this.DROP_SIZE_MAX - this.DROP_SIZE_MIN),
      rotation:    baseRotation,
      wobble:      Math.random() * Math.PI * 2,  // PHASE OFFSET FOR GENTLE WOBBLE 
      wobbleSpeed: 2.5 + Math.random() * 2,
      wobbleAmp:   0.18,
      isDead:      false,
      hasHit:      false,
    });
  }

  // ========== UPDATE - CALLED EVERY FRAME ==========
  update(dt, glorkX, glorkY, shipX, shipY) {
    if (this.phase === 'spitting') {
      this.glorkX = glorkX;
      this.glorkY = glorkY;
    }

    // ========== PHASE: SPITTING ==========
    if (this.phase === 'spitting') {
      this.dropTimer -= dt;
      if (this.dropTimer <= 0 && this.dropsFired < this.DROPS_TOTAL) {
        this._spawnDrop(shipX, shipY);
        this.dropsFired++;
        this.dropTimer = this.DROP_INTERVAL;
      }

      if (this.dropsFired >= this.DROPS_TOTAL && this.drops.length === 0) {
        this.phase      = 'warping';
        this.warpTimer  = this.WARP_DURATION;
        this.dripActive = true;
        this._slimeTarget = 1;
        console.log('[SlimeAttack] Phase: warping');
      }
    }

    // =========== PHASE: WARPING ==========
    if (this.phase === 'warping') {
      this.warpTimer -= dt;
      this._animateDrip(dt);

      if (this.warpTimer <= 0) {
        this.phase        = 'recovering';
        this.recoverTimer = this.RECOVER_DURATION;
        this._slimeTarget = 0;
        console.log('[SlimeAttack] Phase: recovering');
      }
    }

    // ========== PHASE: RECOVERING ==========
    if (this.phase === 'recovering') {
      this.recoverTimer -= dt;
      this._animateDrip(dt);

      if (this.recoverTimer <= 0) {
        this.phase      = 'idle';
        this.dripActive = false;
        console.log('[SlimeAttack] Phase: idle (attack complete)');
      }
    }

    // =========== INTENSITY LERP - START FAST, SLOW FADE OUT ===========
    const lSpeed = this._slimeTarget > this.slimeIntensity ? 0.05 : 0.025;
    this.slimeIntensity += (this._slimeTarget - this.slimeIntensity) * lSpeed;

    // =========== UPDATE DROPS ===========
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      d.x += d.dirX * d.speed * dt;
      d.y += d.dirY * d.speed * dt;
      d.wobble += d.wobbleSpeed * dt;
      d.rotation = Math.atan2(d.dirY, d.dirX) + Math.PI / 2
                 + Math.sin(d.wobble) * d.wobbleAmp;

      if (!d.hasHit) {
        const ex = d.x - shipX;
        const ey = d.y - shipY;
        if (ex * ex + ey * ey < 65 * 65) {
          d.hasHit = true;
          d.isDead = true;
          if (this.onSplat) this.onSplat();
        }
      }

      const pad = 120;
      if (d.x < -pad || d.x > window.innerWidth + pad ||
          d.y < -pad || d.y > window.innerHeight + pad) {
        d.isDead = true;
      }

      if (d.isDead) this.drops.splice(i, 1);
    }
  }

  _animateDrip(dt) {
    this.dripAnimTimer += dt;
    if (this.dripAnimTimer >= this.DRIP_FRAME_DUR) {
      this.dripAnimTimer -= this.DRIP_FRAME_DUR;
      this.dripFrame = (this.dripFrame + 1) % DRIP_FRAMES_HALF; 
    }
  }

  draw(ctx) {
    if (this.drops.length === 0) return;
    const sprite = ImageLoader.get('slimeProjectiles');
    if (!sprite) return;

    const frameW = sprite.width / PROJECTILE_FRAMES;
    const frameH = sprite.height;

    for (const d of this.drops) {
      ctx.save();
      ctx.translate(d.x, d.y);
      ctx.rotate(d.rotation);
      ctx.shadowBlur  = 10;
      ctx.shadowColor = '#44ff44';
      ctx.drawImage(
        sprite,
        d.frame * frameW, 0, frameW, frameH,
        -d.size / 2, -d.size / 2, d.size, d.size
      );
      ctx.restore();
    }
  }

  drawWingDrip(ctx, shipX, shipY, shipRotation, shipWidth, shipHeight) {
    if (!this.dripActive) return;
    const sprite = ImageLoader.get('slimeDrip');
    if (!sprite) return;

    let alpha = 1;
    if (this.phase === 'recovering') {
      alpha = Math.max(0, this.recoverTimer / this.RECOVER_DURATION);
    }
    if (alpha <= 0.01) return;

    const frameW = sprite.width / (DRIP_FRAMES_HALF * 2);  
    const frameH = sprite.height;

    const dripW = shipWidth * 0.40;
    const dripH = frameH * (dripW / frameW);

    ctx.save();
    ctx.translate(shipX, shipY);
    ctx.rotate(shipRotation);
    ctx.globalAlpha = alpha;

    // RIGHT wing — FRAMES 0-4
    const rightFrame = this.dripFrame;
    ctx.drawImage(
      sprite,
      rightFrame * frameW, 0, frameW, frameH,
      shipWidth * 0.08, -dripH * 0.35,
      dripW, dripH
    );

    // LEFT wing — frames 5-9
    const leftFrame = DRIP_FRAMES_HALF + this.dripFrame;
    ctx.drawImage(
      sprite,
      leftFrame * frameW, 0, frameW, frameH,
      -shipWidth * 0.48, -dripH * 0.35,
      dripW, dripH
    );

    ctx.restore();
  }

  // ── GETTERS ───────────────────────────────────────────────────────
  getSlimeIntensity() { return this.slimeIntensity; }
  isActive()          { return this.phase !== 'idle'; }

  reset() {
    this.phase          = 'idle';
    this.drops          = [];
    this.dropsFired     = 0;
    this.slimeIntensity = 0;
    this._slimeTarget   = 0;
    this.dripActive     = false;
    this.warpTimer      = 0;
    this.recoverTimer   = 0;
  }
}