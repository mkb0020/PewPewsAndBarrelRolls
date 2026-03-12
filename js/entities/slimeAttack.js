// Updated 3/12/26 @ 7AM
// slimeAttack.js
// ~~~~~~~~~~~~~~~~~~~~ IMPORTS ~~~~~~~~~~~~~~~~~~~~
import { ImageLoader }  from '../utils/imageLoader.js';
import { CONFIG }       from '../utils/config.js';
import { ScreenSlime }  from '../visuals/screenSlime.js';
// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

const DRIP_FRAMES_HALF = 5;   // slimeDrip.png — 5 FRAMES PER WING (0-4 RIGHT, 5-9 LEFT)

export class SlimeAttack {
  constructor() {
    // ── PHASE STATE ────────────────────────────────────────────────
    // IDLE → WARPING → RECOVERING → IDLE
    this.phase       = 'idle';
    this.glorkX      = 0;
    this.glorkY      = 0;

    // ── WARP PHASE ────────────────────────────────────────────────
    this.warpTimer        = 0;
    this.WARP_DURATION    = 7.2;
    this.recoverTimer     = 0;
    this.RECOVER_DURATION = 1.8;

    // ── SLIME INTENSITY — DRIVES TUNNEL GREEN + SHIP PHYSICS + SCREEN SLIME ──
    this.slimeIntensity = 0;
    this._slimeTarget   = 0;

    // ── WING DRIP ANIMATION  ──────────
    this.dripActive    = false;
    this.dripFrame     = 0;
    this.dripAnimTimer = 0;
    this.DRIP_FRAME_DUR = 0.1;

    // ── SCREEN SLIME ──────────────────────────────────────────────
    this.screenSlime = new ScreenSlime();

    this.cooldownUntil = 0;
  }

  // ── PUBLIC: TRIGGER  ──
  trigger(glorkX, glorkY) {
    if (this.phase !== 'idle' || Date.now() < this.cooldownUntil) return;
    this.phase         = 'warping';
    this.glorkX        = glorkX;
    this.glorkY        = glorkY;
    this.warpTimer     = this.WARP_DURATION;
    this.dripActive    = true;
    this.dripFrame     = 0;
    this.dripAnimTimer = 0;
    this._slimeTarget  = 1;
    this.screenSlime.spawn();
    // console.log('[SlimeAttack] Phase: warping — screen slime deployed');
  }

  // ── UPDATE — CALLED EVERY FRAME ──────────────────────────────────
  update(dt, glorkX, glorkY, shipX, shipY) {
    // ── PHASE: WARPING ──
    if (this.phase === 'warping') {
      this.warpTimer -= dt;
      this._animateDrip(dt);

      if (this.warpTimer <= 0) {
        this.phase        = 'recovering';
        this.recoverTimer = this.RECOVER_DURATION;
        this._slimeTarget = 0;
        // console.log('[SlimeAttack] Phase: recovering');
      }
    }

    // ── PHASE: RECOVERING ──
    if (this.phase === 'recovering') {
      this.recoverTimer -= dt;
      this._animateDrip(dt);

      if (this.recoverTimer <= 0) {
        this.phase         = 'idle';
        this.cooldownUntil = Date.now() + 5000;
        this.dripActive    = false;
        // console.log('[SlimeAttack] Phase: idle (attack complete)');
      }
    }

    // ── INTENSITY LERP — START FAST, SLOW FADE OUT ──
    const lSpeed = this._slimeTarget > this.slimeIntensity ? 0.05 : 0.025;
    this.slimeIntensity += (this._slimeTarget - this.slimeIntensity) * lSpeed;

    // ── SCREEN SLIME UPDATE ──
    this.screenSlime.update(dt, this.slimeIntensity);
  }

  _animateDrip(dt) {
    this.dripAnimTimer += dt;
    if (this.dripAnimTimer >= this.DRIP_FRAME_DUR) {
      this.dripAnimTimer -= this.DRIP_FRAME_DUR;
      this.dripFrame = (this.dripFrame + 1) % DRIP_FRAMES_HALF;
    }
  }

  // ── DRAW: SCREEN SLIME OVERLAY ───────────────────────────────────
  drawScreenSlime(ctx) {
    this.screenSlime.draw(ctx, this.slimeIntensity);
  }

  // ── DRAW: WING DRIP ON SHIP ──────────────────────────────────────
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

    // RIGHT WING
    ctx.drawImage(
      sprite,
      this.dripFrame * frameW, 0, frameW, frameH,
      shipWidth * 0.08, -dripH * 0.35,
      dripW, dripH
    );

    // LEFT WING
    const leftFrame = DRIP_FRAMES_HALF + this.dripFrame;
    ctx.drawImage(
      sprite,
      leftFrame * frameW, 0, frameW, frameH,
      -shipWidth * 0.48, -dripH * 0.35,
      dripW, dripH
    );

    ctx.restore();
  }

  // ── GETTERS ──────────────────────────────────────────────────────
  getSlimeIntensity() { return this.slimeIntensity; }
  isActive()          { return this.phase !== 'idle'; }

  reset() {
    this.phase          = 'idle';
    this.slimeIntensity = 0;
    this._slimeTarget   = 0;
    this.dripActive     = false;
    this.warpTimer      = 0;
    this.recoverTimer   = 0;
    this.screenSlime.reset();
  }
}