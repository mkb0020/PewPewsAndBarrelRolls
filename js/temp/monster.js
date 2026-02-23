// monster.js — TEMPORARY VISUAL TEST, NO GAMEPLAY INTERACTIONS
// ~~~~~~~~~~~~~~~~~~~~ IMPORTS ~~~~~~~~~~~~~~~~~~~~
import { CONFIG } from '../utils/config.js';
// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

const MONSTER = {
  SPRITE_PATH:   './images/glork.png',
  SPRITE_FRAMES: 5,
  ANIM_FPS:      5,       // FRAMES PER SECOND
  SIZE:          150,     // RENDER SIZE IN PX
  // LAZY FIGURE-8 DRIFT — TWO SINE WAVES ON DIFFERENT AXES
  DRIFT_X_AMP:   180,     // PX HORIZONTAL RANGE
  DRIFT_Y_AMP:   110,     // PX VERTICAL RANGE
  DRIFT_X_SPEED: 0.2,     // RAD/S
  DRIFT_Y_SPEED: 0.35,    // RAD/S — DIFFERENT FROM X = LISSAJOUS PATH
  BOB_AMP:       8,       // SUBTLE VERTICAL BOB ON TOP OF DRIFT
  BOB_SPEED:     1.5,
  PHASE_X:       0.0,     // STARTING PHASE OFFSETS
  PHASE_Y:       1.2,
};

export class Monster {
  constructor() {
    this.time       = Math.random() * Math.PI * 2; // RANDOM PHASE SO IT DOESN'T ALWAYS START CENTER
    this.animFrame  = 0;
    this.animTimer  = 0;
    this.frameWidth = 0;

    this.x = window.innerWidth  / 2;
    this.y = window.innerHeight / 2;

    this.sprite       = new Image();
    this.spriteLoaded = false;
    this.sprite.src   = MONSTER.SPRITE_PATH;
    this.sprite.onload = () => {
      this.spriteLoaded = true;
      this.frameWidth   = this.sprite.width / MONSTER.SPRITE_FRAMES;
      console.log('✔ Monster sprite loaded');
    };
    this.sprite.onerror = () => {
      console.warn('⚠ monster.png not found');
    };
  }

  update(dt) {
    this.time      += dt;
    this.animTimer += dt;

    // ADVANCE SPRITE FRAME
    const frameDur = 1 / MONSTER.ANIM_FPS;
    if (this.animTimer >= frameDur) {
      this.animTimer -= frameDur;
      this.animFrame  = (this.animFrame + 1) % MONSTER.SPRITE_FRAMES;
    }

    // LISSAJOUS DRIFT — FLOATS IN A LAZY FIGURE-8 AROUND SCREEN CENTER
    const cx = window.innerWidth  / 2;
    const cy = window.innerHeight / 2;
    this.x = cx + Math.sin(this.time * MONSTER.DRIFT_X_SPEED + MONSTER.PHASE_X) * MONSTER.DRIFT_X_AMP;
    this.y = cy + Math.sin(this.time * MONSTER.DRIFT_Y_SPEED + MONSTER.PHASE_Y) * MONSTER.DRIFT_Y_AMP
               + Math.sin(this.time * MONSTER.BOB_SPEED) * MONSTER.BOB_AMP;
  }

  draw(ctx) {
    if (!this.spriteLoaded) return;

    const size = MONSTER.SIZE;
    ctx.save();
    ctx.drawImage(
      this.sprite,
      this.animFrame * this.frameWidth, 0,
      this.frameWidth, this.sprite.height,
      this.x - size / 2,
      this.y - size / 2,
      size, size
    );
    ctx.restore();
  }
}