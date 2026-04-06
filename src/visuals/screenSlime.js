// Updated 3/12/26 @ 11:30AM
// screenSlime.js

import { ImageLoader } from '../utils/imageLoader.js';

// ── CONFIG ────────────────────────────────────────────────────────────────────
const FRAME_COUNT = 9;      // TOTAL FRAMES IN screenSlimeDrip.png (HORIZONTAL STRIP)
const FRAME_DUR   = 0.22;   // SECONDS PER FRAME (~1.6s TOTAL ANIMATION)
const OPACITY     = 0.7;    // TRANSLUCENT OVERLAY

export class ScreenSlime {
  constructor() {
    this._frame      = 0;
    this._frameTimer = 0;
    this._active     = false;
    this._done       = false;
  }

  // ── CALLED BY SlimeAttack.trigger() ──────────────────────────────────────────
  spawn() {
    this._frame      = 0;
    this._frameTimer = 0;
    this._active     = true;
    this._done       = false;
    ImageLoader.load('screenSlimeDrip'); // KICK OFF LAZY LOAD IF NOT ALREADY CACHED
  }

  // ── UPDATE — ADVANCE FRAME; MARK DONE AFTER LAST FRAME ───────────────────────
  update(dt, _intensity) {
    if (!this._active || this._done) return;

    this._frameTimer += dt;
    if (this._frameTimer >= FRAME_DUR) {
      this._frameTimer -= FRAME_DUR;
      this._frame++;
      if (this._frame >= FRAME_COUNT) {
        // ANIMATION COMPLETE — CLEAR OVERLAY SO PLAYER CAN SEE THE SCREEN
        this._active = false;
        this._done   = true;
      }
    }
  }

  // ── DRAW — STRETCH CURRENT FRAME TO FILL CANVAS ──────────────────────────────
  draw(ctx, _intensity) {
    if (!this._active || this._done) return;

    const sprite = ImageLoader.get('screenSlimeDrip');
    if (!sprite) return;

    const W      = window.innerWidth;
    const H      = window.innerHeight;
    const frameW = sprite.width / FRAME_COUNT;
    const frameH = sprite.height;

    ctx.save();
    ctx.globalAlpha = OPACITY;
    ctx.drawImage(
      sprite,
      this._frame * frameW, 0, frameW, frameH,  // SOURCE: CURRENT FRAME
      0, 0, W, H                                  // DEST: FILL ENTIRE CANVAS
    );
    ctx.restore();
  }

  // ── RESET — CALLED ON PLAYER DEATH / SCENE RESET ─────────────────────────────
  reset() {
    this._frame      = 0;
    this._frameTimer = 0;
    this._active     = false;
    this._done       = false;
  }
}