// ship.js
// ~~~~~~~~~~~~~~~~~~~~ IMPORTS ~~~~~~~~~~~~~~~~~~~~
import { CONFIG } from '../utils/config.js';
import { keys, virtualKeys, isKeyPressed } from '../utils/controls.js';
import { ParticleSystem } from '../visuals/particles.js';
import { ImageLoader } from '../utils/imageLoader.js';
// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

export class Ship {
  constructor(canvas, ctx) {
    this.canvas = canvas;
    this.ctx    = ctx;

    this.x = window.innerWidth  / 2;
    this.y = window.innerHeight / 2;
    this.width  = CONFIG.SHIP.WIDTH;
    this.height = CONFIG.SHIP.HEIGHT;
    this.rotation = 0;

    this.offset   = { x: 0, y: 0 };
    this.velocity = { x: 0, y: 0 };

    this.targetRotation  = 0;
    this.currentRotation = 0;

    this.currentFrame      = CONFIG.SHIP.NEUTRAL_FRAME;
    this.currentFrameFloat = CONFIG.SHIP.NEUTRAL_FRAME;
    this.targetFrame       = CONFIG.SHIP.NEUTRAL_FRAME;

    this.isBarrelRolling    = false;
    this.barrelRollProgress = 0;
    this.barrelRollDirection = 1;

    this.shootCooldown = 0;
    this.canShoot      = true;

    this.maxHP              = CONFIG.SHIP_HP.MAX_HP;
    this.hp                 = CONFIG.SHIP_HP.MAX_HP;
    this.lives              = CONFIG.SHIP_HP.MAX_LIVES;
    this.isInvincible       = false;
    this.invincibilityTimer = 0;
    this.isAlive            = true;
    this.onDeath            = null; 
    this.onHPChange         = null;
    this.onLivesChange      = null;

    this.suctionActive = false;
    this.suctionScale  = 1.0;
    this.suctionShakeX = 0;
    this.suctionShakeY = 0;
    this._rollBurstFired = false;

    this.consumedMode        = false;
    this.consumedTimer       = 0;
    this.consumedDuration    = 1.1;
    this.consumedTargetX     = 0;
    this.consumedTargetY     = 0;
    this._consumedDeathFired = false;
    this.consumedFlashAlpha  = 0;

    this.cinematicMode          = false;
    this.cinematicScale         = 1.0;
    this.CINEMATIC_SCALE_TARGET = 1.5;
    this.CINEMATIC_LERP         = 0.08;

    this.particles = new ParticleSystem();

    console.log('✔ Ship initialized');
  }

  startBarrelRoll(direction = 1) {
    if (!this.isBarrelRolling) {
      this.isBarrelRolling     = true;
      this.barrelRollProgress  = 0;
      this.barrelRollDirection = direction;
      this._rollBurstFired     = false;
      console.log('DO A BARREL ROLL!');
    }
  }

  updateMovement(dt) {
    const movingUp    = isKeyPressed('w') || isKeyPressed('arrowup');
    const movingDown  = isKeyPressed('s') || isKeyPressed('arrowdown');
    const movingLeft  = isKeyPressed('a') || isKeyPressed('arrowleft');
    const movingRight = isKeyPressed('d') || isKeyPressed('arrowright');

    let inputX = 0, inputY = 0;
    if (movingRight) inputX += 1;
    if (movingLeft)  inputX -= 1;
    if (movingUp)    inputY += 1;
    if (movingDown)  inputY -= 1;

    const mag = Math.sqrt(inputX * inputX + inputY * inputY);
    if (mag > 1) { inputX /= mag; inputY /= mag; }

    // ACCELERATION + DAMPING
    const accel = CONFIG.SHIP.ACCELERATION * dt;
    this.velocity.x += inputX * accel;
    this.velocity.y += inputY * accel;

    const damp = Math.pow(CONFIG.SHIP.DAMPING, dt * 60);
    this.velocity.x *= damp;
    this.velocity.y *= damp;

    // INTEGRATE
    this.offset.x += this.velocity.x * dt;
    this.offset.y += this.velocity.y * dt;

    // CLAMP — EXPAND DURING SUCTION SO WORM CAN DRAG SHIP
    const clampMult = this.suctionActive ? CONFIG.WORM_SUCTION.MAX_OFFSET_EXPAND : 1.0;
    const maxX = CONFIG.SHIP.MAX_OFFSET_X * clampMult;
    const maxY = CONFIG.SHIP.MAX_OFFSET_Y * clampMult;

    const prevX = this.offset.x;
    const prevY = this.offset.y;
    this.offset.x = Math.max(-maxX, Math.min(maxX, this.offset.x));
    this.offset.y = Math.max(-maxY, Math.min(maxY, this.offset.y));
    if (this.offset.x !== prevX) this.velocity.x = 0;
    if (this.offset.y !== prevY) this.velocity.y = 0;

    this.x = window.innerWidth  / 2 + this.offset.x + this.suctionShakeX;
    this.y = window.innerHeight / 2 - this.offset.y + this.suctionShakeY;

    // SPRITE FRAME
    let desiredFrame = CONFIG.SHIP.NEUTRAL_FRAME;
    if (movingUp)        desiredFrame = CONFIG.SHIP.UP_FRAME;
    else if (movingDown) desiredFrame = CONFIG.SHIP.DOWN_FRAME;

    const interpSpeed = (movingUp || movingDown)
      ? CONFIG.SHIP.FRAME_INTERPOLATION_ACTIVE
      : CONFIG.SHIP.FRAME_INTERPOLATION_IDLE;

    this.targetFrame = desiredFrame;
    this.currentFrameFloat += (this.targetFrame - this.currentFrameFloat) * interpSpeed;
    this.currentFrame = Math.round(this.currentFrameFloat);

    // BARREL ROLL
    if (this.isBarrelRolling) {
      this.barrelRollProgress += dt / CONFIG.BARREL_ROLL.DURATION;
      if (this.barrelRollProgress >= 1.0) {
        this.isBarrelRolling    = false;
        this.barrelRollProgress = 0;
        this.currentRotation    = 0;
      } else {
        const rollAngle = this.barrelRollProgress * 360 * this.barrelRollDirection;
        this.rotation   = rollAngle * Math.PI / 180;
        if (this.particles.getCount() < CONFIG.PARTICLES.MAX_COUNT * CONFIG.BARREL_ROLL.PARTICLE_SPAWN_MULTIPLIER) {
          for (let i = 0; i < 2; i++) this.particles.spawn(this.x, this.y);
        }
      }
    } else {
      this.targetRotation = 0;
      if (movingLeft)  this.targetRotation = -CONFIG.SHIP.TILT_ANGLE;
      if (movingRight) this.targetRotation =  CONFIG.SHIP.TILT_ANGLE;
      this.currentRotation += (this.targetRotation - this.currentRotation) * CONFIG.SHIP.ROTATION_SMOOTHING;
      this.rotation = this.currentRotation * Math.PI / 180;
    }
  }

  update(dt) {
    if (!this.isAlive) return;

    // CONSUMED — CONTROLS LOCKED, SPIRAL TO MOUTH
    if (this.consumedMode) {
      this._updateConsumed(dt);
      this.particles.update(dt);
      return;
    }

    // CINEMATIC — CONTROLS LOCKED, DRIFT TO BOTTOM-CENTER
    if (this.cinematicMode) {
      const targetOffsetX =  0;
      const targetOffsetY = -(window.innerHeight * 0.30);
      this.velocity.x = 0;
      this.velocity.y = 0;
      this.offset.x += (targetOffsetX - this.offset.x) * this.CINEMATIC_LERP;
      this.offset.y += (targetOffsetY - this.offset.y) * this.CINEMATIC_LERP;
      this.x = window.innerWidth  / 2 + this.offset.x;
      this.y = window.innerHeight / 2 - this.offset.y;
      this.cinematicScale += (this.CINEMATIC_SCALE_TARGET - this.cinematicScale) * this.CINEMATIC_LERP;
      this.currentRotation += (0 - this.currentRotation) * 0.1;
      this.rotation = this.currentRotation * Math.PI / 180;
      this.isBarrelRolling = false;
      this.particles.update(dt);
      return;
    }

    this.updateMovement(dt);

    if (this.shootCooldown > 0) {
      this.shootCooldown -= dt;
      if (this.shootCooldown <= 0) this.canShoot = true;
    }

    if (this.isInvincible) {
      this.invincibilityTimer -= dt;
      if (this.invincibilityTimer <= 0) {
        this.isInvincible       = false;
        this.invincibilityTimer = 0;
      }
    }

    if (!this.isBarrelRolling) {
      this.particles.spawn(this.x, this.y, CONFIG.PARTICLES.SPAWN_RATE);
    }
    this.particles.update(dt);
  }

  //  WORM SUCTION 
  applySuction(mouthX, mouthY, dt) {
    if (this.consumedMode) return;
    this.suctionActive = true;
    const SC = CONFIG.WORM_SUCTION;

    const shipScreenX = window.innerWidth  / 2 + this.offset.x;
    const shipScreenY = window.innerHeight / 2 - this.offset.y;

    const sdx  = mouthX - shipScreenX;
    const sdy  = mouthY - shipScreenY;
    const dist = Math.sqrt(sdx * sdx + sdy * sdy);

    const closeness   = Math.max(0, 1 - dist / SC.MAX_DISTANCE);
    const targetScale = SC.SCALE_FAR - closeness * (SC.SCALE_FAR - SC.SCALE_NEAR);
    this.suctionScale += (targetScale - this.suctionScale) * SC.SCALE_LERP;

    if (closeness > 0.1) {
      const shakeAmt   = SC.SHAKE_INTENSITY * closeness;
      this.suctionShakeX = (Math.random() - 0.5) * shakeAmt;
      this.suctionShakeY = (Math.random() - 0.5) * shakeAmt;
    } else {
      this.suctionShakeX = 0;
      this.suctionShakeY = 0;
    }

    if (dist < 1) return;

    const snx = sdx / dist;
    const sny = sdy / dist;
    const stx = -sny;
    const sty =  snx;

    const rawForce = SC.BASE_FORCE * Math.pow(closeness, SC.RAMP_EXPONENT);
    const forceMag = Math.min(rawForce, SC.MAX_FORCE);

    const rolling  = this.isBarrelRolling;
    const spinMult = rolling ? SC.ROLL_SPIN_RESIST : 1.0;
    const pullMult = rolling ? SC.ROLL_PULL_RESIST : 1.0;

    if (rolling && this.barrelRollProgress > 0.45 && !this._rollBurstFired) {
      this._rollBurstFired = true;
      this.velocity.x -= snx * SC.ROLL_BURST_FORCE;
      this.velocity.y += sny * SC.ROLL_BURST_FORCE;
    }

    const screenFX = (snx * SC.PULL_STRENGTH * pullMult + stx * SC.SPIN_STRENGTH * spinMult) * forceMag;
    const screenFY = (sny * SC.PULL_STRENGTH * pullMult + sty * SC.SPIN_STRENGTH * spinMult) * forceMag;

    this.velocity.x += screenFX * dt;
    this.velocity.y -= screenFY * dt;
  }

  clearSuction() {
    if (this.consumedMode) return;
    this.suctionActive = false;
    this.suctionShakeX = 0;
    this.suctionShakeY = 0;
    this.suctionScale += (1.0 - this.suctionScale) * CONFIG.WORM_SUCTION.SCALE_LERP;
  }

  getSuctionScale() { return this.suctionScale; }

  //  CONSUMED SEQUENCE 
  enterConsumed(targetX, targetY) {
    if (this.consumedMode || !this.isAlive) return;
    this.consumedMode        = true;
    this.consumedTimer       = 0;
    this.consumedTargetX     = targetX;
    this.consumedTargetY     = targetY;
    this._consumedDeathFired = false;
    this.consumedFlashAlpha  = 0;
    this.isInvincible        = true;
    this.isBarrelRolling     = false;
    this.velocity.x          = 0;
    this.velocity.y          = 0;
  }

  _updateConsumed(dt) {
    this.consumedTimer += dt;
    const t    = Math.min(this.consumedTimer / this.consumedDuration, 1.0);
    const ease = t * t * t; // CUBIC — ROCKETS INTO MOUTH AT END

    const targetOffsetX =  this.consumedTargetX - window.innerWidth  / 2;
    const targetOffsetY = -(this.consumedTargetY - window.innerHeight / 2);

    const chaseSpeed = 0.08 + ease * 0.28;
    this.offset.x += (targetOffsetX - this.offset.x) * chaseSpeed;
    this.offset.y += (targetOffsetY - this.offset.y) * chaseSpeed;
    this.x = window.innerWidth  / 2 + this.offset.x;
    this.y = window.innerHeight / 2 - this.offset.y;

    this.rotation -= Math.PI * 4 * dt * (0.6 + ease * 3.5); // RAPID CCW SPIN
    this.suctionScale = Math.max(0, 1.0 - ease * 0.98);     // SHRINK INTO MOUTH

    this.consumedFlashAlpha = t > 0.7 ? (t - 0.7) / 0.3 : 0; // FLASH IN FINAL 30%

    if (t >= 1.0 && !this._consumedDeathFired) {
      this._consumedDeathFired = true;
      this.consumedFlashAlpha  = 0;
      this.consumedMode        = false;
      this._triggerDeath();
    }
  }

  takeLatchDamage(amount) {
    if (!this.isAlive || this.isInvincible) return;
    this.hp = Math.max(0, this.hp - amount);
    if (this.onHPChange) this.onHPChange(this.hp, this.maxHP);
    if (this.hp <= 0) this._triggerDeath();
  }

  takeDamage(amount) {
    if (this.isInvincible || !this.isAlive) return false;
    this.hp = Math.max(0, this.hp - amount);
    if (this.onHPChange) this.onHPChange(this.hp, this.maxHP);
    if (this.hp <= 0) {
      this._triggerDeath();
    } else {
      this._startInvincibility(CONFIG.SHIP_HP.INVINCIBILITY_DURATION);
    }
    return true;
  }

  _triggerDeath() {
    this.isAlive = false;
    this.lives   = Math.max(0, this.lives - 1);
    if (this.onLivesChange) this.onLivesChange(this.lives);
    if (this.onDeath)       this.onDeath(this.lives);
  }

  respawn() {
    this.hp      = this.maxHP;
    this.isAlive = true;
    this.offset.x    = 0;
    this.offset.y    = 0;
    this.velocity.x  = 0;
    this.velocity.y  = 0;
    this.x = window.innerWidth  / 2;
    this.y = window.innerHeight / 2;
    this.suctionScale  = 1.0;
    this.suctionActive = false;
    this.suctionShakeX = 0;
    this.suctionShakeY = 0;
    this.consumedMode        = false;
    this.consumedTimer       = 0;
    this.consumedFlashAlpha  = 0;
    this._consumedDeathFired = false;
    if (this.onHPChange) this.onHPChange(this.hp, this.maxHP);
    this._startInvincibility(CONFIG.SHIP_HP.RESPAWN_INVINCIBILITY);
  }

  resetForNewGame() {
    this.hp    = this.maxHP;
    this.lives = CONFIG.SHIP_HP.MAX_LIVES;
    this.isAlive          = true;
    this.isInvincible     = false;
    this.invincibilityTimer = 0;
    this.offset.x = 0; this.offset.y = 0;
    this.velocity.x = 0; this.velocity.y = 0;
    this.suctionScale  = 1.0;
    this.suctionActive = false;
    this.consumedMode        = false;
    this.consumedTimer       = 0;
    this.consumedFlashAlpha  = 0;
    this._consumedDeathFired = false;
    this.cinematicMode  = false;
    this.cinematicScale = 1.0;
    this.x = window.innerWidth  / 2;
    this.y = window.innerHeight / 2;
    if (this.onHPChange)    this.onHPChange(this.hp, this.maxHP);
    if (this.onLivesChange) this.onLivesChange(this.lives);
  }

  _startInvincibility(duration) {
    this.isInvincible       = true;
    this.invincibilityTimer = duration;
  }

  getHP()    { return this.hp; }
  getLives() { return this.lives; }

  shoot(targetX, targetY) {
    if (!this.canShoot) return false;
    this.canShoot      = false;
    this.shootCooldown = CONFIG.SHOOTING.FIRE_RATE;
    return { x: this.x, y: this.y, targetX, targetY };
  }

  draw() {
    if (!this.isAlive && !this.consumedMode) return;

    // INVINCIBILITY BLINK
    if (this.isInvincible && !this.consumedMode) {
      const flashInterval = 1 / CONFIG.SHIP_HP.INVINCIBILITY_FLASH_HZ;
      const flashPhase    = Math.floor(this.invincibilityTimer / flashInterval);
      if (flashPhase % 2 === 0) return;
    }

    // BARREL ROLL SCREEN FLASH
    if (this.isBarrelRolling) {
      const flashIntensity = Math.sin(this.barrelRollProgress * Math.PI) * 0.15;
      this.ctx.fillStyle = `rgba(0, 255, 255, ${flashIntensity})`;
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }

    // SUCTION VIGNETTE
    if (this.suctionActive && this.suctionScale < 0.92) {
      const intensity  = Math.max(0, (0.92 - this.suctionScale) / 0.62);
      const pulseAlpha = intensity * (0.12 + 0.07 * Math.sin(Date.now() * 0.008));
      const grad = this.ctx.createRadialGradient(
        this.canvas.width / 2, this.canvas.height / 2, this.canvas.height * 0.35,
        this.canvas.width / 2, this.canvas.height / 2, this.canvas.height * 0.85
      );
      grad.addColorStop(0, `rgba(180, 0, 0, 0)`);
      grad.addColorStop(1, `rgba(200, 0, 30, ${pulseAlpha})`);
      this.ctx.fillStyle = grad;
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }

    this.ctx.globalAlpha = 1;

    const sprite = ImageLoader.get('ship');
    if (sprite) {
      this.ctx.save();
      this.ctx.translate(this.x, this.y);
      this.ctx.rotate(this.rotation);

      const totalScale = this.suctionScale * this.cinematicScale;
      if (totalScale !== 1.0) this.ctx.scale(totalScale, totalScale);

      const frameWidth = sprite.width / CONFIG.SHIP.SPRITE_FRAMES;
      this.ctx.drawImage(
        sprite,
        this.currentFrame * frameWidth, 0, frameWidth, sprite.height,
        -this.width / 2, -this.height / 2, this.width, this.height
      );
      this.ctx.restore();
    } else {
      // FALLBACK
      this.ctx.fillStyle = '#0ff';
      this.ctx.fillRect(this.x - 20, this.y - 20, 40, 40);
    }

    this.particles.draw(this.ctx);

    if (this.consumedFlashAlpha > 0) {
      const r    = window.innerHeight * 1.2;
      const grad = this.ctx.createRadialGradient(
        this.consumedTargetX, this.consumedTargetY, 0,
        this.consumedTargetX, this.consumedTargetY, r
      );
      grad.addColorStop(0,    `rgba(255, 220, 220, ${this.consumedFlashAlpha * 0.95})`);
      grad.addColorStop(0.15, `rgba(255,  60,  80, ${this.consumedFlashAlpha * 0.85})`);
      grad.addColorStop(0.5,  `rgba(180,   0,  40, ${this.consumedFlashAlpha * 0.5})`);
      grad.addColorStop(1,    `rgba( 80,   0,  20, 0)`);
      this.ctx.fillStyle = grad;
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
  }

  enterCinematic() {
    this.cinematicMode   = true;
    this.velocity.x      = 0;
    this.velocity.y      = 0;
    this.isBarrelRolling = false;
  }

  exitCinematic() {
    this.cinematicMode  = false;
    this.cinematicScale = 1.0;
  }

  getOffset()     { return { x: this.offset.x, y: this.offset.y }; }
  handleResize()  {
    this.x = window.innerWidth  / 2 + this.offset.x;
    this.y = window.innerHeight / 2 - this.offset.y;
  }
}