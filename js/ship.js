// ship.js
// ~~~~~~~~~~~~~~~~~~~~ IMPORTS ~~~~~~~~~~~~~~~~~~~~
import { CONFIG } from './config.js';
import { keys, virtualKeys, isKeyPressed } from './controls.js';
import { ParticleSystem } from './particles.js';
// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

export class Ship {
  constructor(canvas, ctx) {
    this.canvas = canvas;
    this.ctx = ctx;
    
    this.x = window.innerWidth / 2;
    this.y = window.innerHeight / 2;
    this.width = CONFIG.SHIP.WIDTH;
    this.height = CONFIG.SHIP.HEIGHT;
    this.rotation = 0;
    
    this.offset = { x: 0, y: 0 };

    // ================= VELOCITY =================

    this.velocity = { x: 0, y: 0 };

    this.targetRotation = 0;
    this.currentRotation = 0;
    
    this.currentFrame = CONFIG.SHIP.NEUTRAL_FRAME;
    this.currentFrameFloat = CONFIG.SHIP.NEUTRAL_FRAME;
    this.targetFrame = CONFIG.SHIP.NEUTRAL_FRAME;
    this.spriteLoaded = false;
    this.spriteWidth = 0;
    this.frameWidth = 0;
    
    this.isBarrelRolling = false;
    this.barrelRollProgress = 0;
    this.barrelRollDirection = 1;
    
    this.shootCooldown = 0;
    this.canShoot = true;

    // ================= HP & LIVES =================
    this.maxHP             = CONFIG.SHIP_HP.MAX_HP;
    this.hp                = CONFIG.SHIP_HP.MAX_HP;
    this.lives             = CONFIG.SHIP_HP.MAX_LIVES;
    this.isInvincible      = false;
    this.invincibilityTimer = 0;
    this.isAlive           = true;   // FALSE DURING DEATH SEQUENCE
    this.onDeath           = null;   // CALLBACK → main.js (game over / lose life)
    this.onHPChange        = null;   // CALLBACK → main.js (update HUD)
    this.onLivesChange     = null;   // CALLBACK → main.js (update HUD)

    // ================= SUCTION STATE =================
    this.suctionActive    = false;
    this.suctionScale     = 1.0;    // VISUAL SHRINK — 1.0 = NORMAL, 0.3 = NEARLY GONE
    this.suctionShakeX    = 0;      // FRAME SHAKE OFFSET
    this.suctionShakeY    = 0;
    this._rollBurstFired  = false;  // PREVENT DOUBLE-FIRING BURST PER ROLL

    this.particles = new ParticleSystem();
    
    this.loadSprite();
    console.log('âœ” Ship initialized');
  }

  loadSprite() {
    this.spaceshipImg = new Image();
    this.spaceshipImg.src = './images/spaceship.png';
    
    this.spaceshipImg.onload = () => {
      console.log('âœ” Spaceship sprite loaded');
      this.spriteLoaded = true;
      this.spriteWidth = this.spaceshipImg.width;
      this.frameWidth = this.spriteWidth / CONFIG.SHIP.SPRITE_FRAMES;
    };
    
    this.spaceshipImg.onerror = () => {
      console.error('âœ— Failed to load spaceship sprite');
    };
  }

  startBarrelRoll(direction = 1) {
    if (!this.isBarrelRolling) {
      this.isBarrelRolling = true;
      this.barrelRollProgress = 0;
      this.barrelRollDirection = direction;
      this._rollBurstFired = false; // RESET SO BURST CAN FIRE AT PEAK
      console.log('DO A BARREL ROLL!');
    }
  }

  updateMovement(dt) {
    const movingUp    = isKeyPressed('w') || isKeyPressed('arrowup');
    const movingDown  = isKeyPressed('s') || isKeyPressed('arrowdown');
    const movingLeft  = isKeyPressed('a') || isKeyPressed('arrowleft');
    const movingRight = isKeyPressed('d') || isKeyPressed('arrowright');

    // ================= BUILD INPUT VECTOR =================
    let inputX = 0;
    let inputY = 0;
    if (movingRight) inputX += 1;
    if (movingLeft)  inputX -= 1;
    if (movingUp)    inputY += 1;   
    if (movingDown)  inputY -= 1;

    const mag = Math.sqrt(inputX * inputX + inputY * inputY);
    if (mag > 1) { inputX /= mag; inputY /= mag; }

    // ================= ACCELERATION + DAMPING =================
    const accel = CONFIG.SHIP.ACCELERATION * dt;
    this.velocity.x += inputX * accel;
    this.velocity.y += inputY * accel;

    // DAMPING - EXPONENTIAL DECAY
    const damp = Math.pow(CONFIG.SHIP.DAMPING, dt * 60);
    this.velocity.x *= damp;
    this.velocity.y *= damp;

    // ================= INTEGRATE =================
    this.offset.x += this.velocity.x * dt;
    this.offset.y += this.velocity.y * dt;

    // ================= CLAMP TO PLAY FIELD =================
    // EXPAND BOUNDS DURING SUCTION SO THE WORM CAN ACTUALLY DRAG THE SHIP
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

    // ================= SPRITE FRAME SELECTION =================
    let desiredFrame = CONFIG.SHIP.NEUTRAL_FRAME;
    if (movingUp)        desiredFrame = CONFIG.SHIP.UP_FRAME;
    else if (movingDown) desiredFrame = CONFIG.SHIP.DOWN_FRAME;
    
    const interpolationSpeed = (movingUp || movingDown)
      ? CONFIG.SHIP.FRAME_INTERPOLATION_ACTIVE
      : CONFIG.SHIP.FRAME_INTERPOLATION_IDLE;

    this.targetFrame = desiredFrame;
    this.currentFrameFloat += (this.targetFrame - this.currentFrameFloat) * interpolationSpeed;
    this.currentFrame = Math.round(this.currentFrameFloat);

    // ================= BARREL ROLL =================
    if (this.isBarrelRolling) {
      this.barrelRollProgress += dt / CONFIG.BARREL_ROLL.DURATION;
      
      if (this.barrelRollProgress >= 1.0) {
        this.isBarrelRolling = false;
        this.barrelRollProgress = 0;
        this.currentRotation = 0;
      } else {
        const rollAngle = this.barrelRollProgress * 360 * this.barrelRollDirection;
        this.rotation = rollAngle * Math.PI / 180;
        
        if (this.particles.getCount() < CONFIG.PARTICLES.MAX_COUNT * CONFIG.BARREL_ROLL.PARTICLE_SPAWN_MULTIPLIER) {
          for (let i = 0; i < 2; i++) {
            this.particles.spawn(this.x, this.y);
          }
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
    if (!this.isAlive) return; // DON'T UPDATE DEAD SHIP

    this.updateMovement(dt);
    
    if (this.shootCooldown > 0) {
      this.shootCooldown -= dt;
      if (this.shootCooldown <= 0) {
        this.canShoot = true;
      }
    }

    // INVINCIBILITY COUNTDOWN
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

  // ======================= WORM SUCTION =======================
  // mouthX/Y = SCREEN SPACE COORDINATES OF WORM HEAD
  applySuction(mouthX, mouthY, dt) {
    this.suctionActive = true;
    const SC = CONFIG.WORM_SUCTION;

    // ── SHIP POSITION IN SCREEN SPACE ──
    const shipScreenX = window.innerWidth  / 2 + this.offset.x;
    const shipScreenY = window.innerHeight / 2 - this.offset.y; // offset Y is up-positive

    // ── SCREEN-SPACE DELTA: SHIP → MOUTH ──
    const sdx  = mouthX - shipScreenX;
    const sdy  = mouthY - shipScreenY;
    const dist = Math.sqrt(sdx * sdx + sdy * sdy);

    // LERP SCALE: CLOSER = SMALLER
    const closeness   = Math.max(0, 1 - dist / SC.MAX_DISTANCE);
    const targetScale = SC.SCALE_FAR - closeness * (SC.SCALE_FAR - SC.SCALE_NEAR);
    this.suctionScale += (targetScale - this.suctionScale) * SC.SCALE_LERP;

    // SHAKE — SUBTLE TREMOR PROPORTIONAL TO PULL STRENGTH
    if (closeness > 0.1) {
      const shakeAmt = SC.SHAKE_INTENSITY * closeness;
      this.suctionShakeX = (Math.random() - 0.5) * shakeAmt;
      this.suctionShakeY = (Math.random() - 0.5) * shakeAmt;
    } else {
      this.suctionShakeX = 0;
      this.suctionShakeY = 0;
    }

    if (dist < 1) return; // AT MOUTH — DON'T DIVIDE BY ZERO

    // ── NORMALIZED SCREEN-SPACE DIRECTIONS ──
    const snx = sdx / dist; // RADIAL (toward mouth), screen X
    const sny = sdy / dist; // RADIAL (toward mouth), screen Y (down-positive)

    // CCW TANGENTIAL IN SCREEN SPACE: rotate radial 90° CCW = (-sny, snx)
    const stx = -sny;
    const sty =  snx;

    // ── FORCE MAGNITUDE — RAMPS UP EXPONENTIALLY AS SHIP CLOSES IN ──
    const rawForce   = SC.BASE_FORCE * Math.pow(closeness, SC.RAMP_EXPONENT);
    const forceMag   = Math.min(rawForce, SC.MAX_FORCE);

    // ── BARREL ROLL RESISTANCE ──
    // ROLLING GENERATES COUNTER-ANGULAR MOMENTUM — FIGHTS THE SPIRAL PULL
    const rolling    = this.isBarrelRolling;
    const spinMult   = rolling ? SC.ROLL_SPIN_RESIST : 1.0;
    const pullMult   = rolling ? SC.ROLL_PULL_RESIST : 1.0;

    // OUTWARD BURST AT ROLL PEAK (progress 0.4→0.6) — FIRES ONCE PER ROLL
    if (rolling && this.barrelRollProgress > 0.45 && !this._rollBurstFired) {
      this._rollBurstFired = true;
      // PUSH AWAY FROM MOUTH IN OFFSET SPACE (flip Y for screen→offset)
      this.velocity.x -= snx * SC.ROLL_BURST_FORCE;
      this.velocity.y += sny * SC.ROLL_BURST_FORCE; // flip Y: screen down → offset up
    }

    // ── COMPOSE FINAL FORCE IN SCREEN SPACE → CONVERT TO OFFSET SPACE ──
    // Offset X = screen X  →  forceOffsetX = screenForceX
    // Offset Y = -screen Y →  forceOffsetY = -screenForceY
    const screenFX = (snx * SC.PULL_STRENGTH  * pullMult +
                      stx * SC.SPIN_STRENGTH   * spinMult) * forceMag;
    const screenFY = (sny * SC.PULL_STRENGTH  * pullMult +
                      sty * SC.SPIN_STRENGTH   * spinMult) * forceMag;

    this.velocity.x += screenFX * dt;
    this.velocity.y -= screenFY * dt; // FLIP: screen Y down → offset Y up
  }

  clearSuction() {
    this.suctionActive = false;
    this.suctionShakeX = 0;
    this.suctionShakeY = 0;
    // SCALE RECOVERS NATURALLY VIA LERP IN NEXT applySuction CALL — OR HERE
    this.suctionScale += (1.0 - this.suctionScale) * CONFIG.WORM_SUCTION.SCALE_LERP;
  }

  getSuctionScale() {
    return this.suctionScale;
  }

  // ======================= HP & LIVES =======================
  takeDamage(amount) {
    if (this.isInvincible || !this.isAlive) return false;

    this.hp = Math.max(0, this.hp - amount);
    if (this.onHPChange) this.onHPChange(this.hp, this.maxHP);

    if (this.hp <= 0) {
      this._triggerDeath();
    } else {
      // BRIEF IFRAMES SO ONE HIT DOESN'T SHRED THE WHOLE BAR
      this._startInvincibility(CONFIG.SHIP_HP.INVINCIBILITY_DURATION);
    }
    return true;
  }

  _triggerDeath() {
    this.isAlive       = false;
    this.lives         = Math.max(0, this.lives - 1);
    if (this.onLivesChange) this.onLivesChange(this.lives);
    if (this.onDeath)       this.onDeath(this.lives);
  }

  respawn() {
    this.hp      = this.maxHP;
    this.isAlive = true;
    // RESET POSITION TO CENTER
    this.offset.x   = 0;
    this.offset.y   = 0;
    this.velocity.x = 0;
    this.velocity.y = 0;
    this.x = window.innerWidth  / 2;
    this.y = window.innerHeight / 2;
    // CLEAR SUCTION
    this.suctionScale  = 1.0;
    this.suctionActive = false;
    if (this.onHPChange)    this.onHPChange(this.hp, this.maxHP);
    // LONGER IFRAMES AFTER RESPAWN FROM DEATH
    this._startInvincibility(CONFIG.SHIP_HP.RESPAWN_INVINCIBILITY);
  }

  resetForNewGame() {
    this.hp    = this.maxHP;
    this.lives = CONFIG.SHIP_HP.MAX_LIVES;
    this.isAlive = true;
    this.isInvincible = false;
    this.invincibilityTimer = 0;
    this.offset.x = 0; this.offset.y = 0;
    this.velocity.x = 0; this.velocity.y = 0;
    this.suctionScale = 1.0;
    this.suctionActive = false;
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
    
    this.canShoot = false;
    this.shootCooldown = CONFIG.SHOOTING.FIRE_RATE;
    
    return {
      x: this.x,
      y: this.y,
      targetX: targetX,
      targetY: targetY
    };
  }

  draw() {
    if (!this.isAlive) return; // DON'T DRAW DEAD SHIP

    // INVINCIBILITY FLASH — SKIP EVERY OTHER FLASH INTERVAL SO SHIP BLINKS
    if (this.isInvincible) {
      const flashInterval = 1 / CONFIG.SHIP_HP.INVINCIBILITY_FLASH_HZ;
      const flashPhase = Math.floor(this.invincibilityTimer / flashInterval);
      if (flashPhase % 2 === 0) return; // BLINK OFF
    }

    if (this.isBarrelRolling) {
      const flashIntensity = Math.sin(this.barrelRollProgress * Math.PI) * 0.15;
      this.ctx.fillStyle = `rgba(0, 255, 255, ${flashIntensity})`;
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }

    // SUCTION VIGNETTE — SCREEN EDGES PULSE RED AS PULL INTENSIFIES
    if (this.suctionActive && this.suctionScale < 0.92) {
      const intensity = Math.max(0, (0.92 - this.suctionScale) / 0.62);
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
    
    if (this.spriteLoaded) {
      this.ctx.save();
      this.ctx.translate(this.x, this.y);
      this.ctx.rotate(this.rotation);

      if (this.suctionScale < 0.999) {
        this.ctx.scale(this.suctionScale, this.suctionScale);
      }
      
      const sx = this.currentFrame * this.frameWidth;
      const sy = 0;
      const sw = this.frameWidth;
      const sh = this.spaceshipImg.height;
      
      this.ctx.drawImage(
        this.spaceshipImg,
        sx, sy, sw, sh,
        -this.width / 2, -this.height / 2, this.width, this.height
      );
      
      this.ctx.restore();
    } else {
      this.ctx.fillStyle = '#0ff';
      this.ctx.fillRect(this.x - 20, this.y - 20, 40, 40);
    }
    
    this.particles.draw(this.ctx);
  }

  getOffset() {
    return { x: this.offset.x, y: this.offset.y };
  }

  handleResize() {
    this.x = window.innerWidth  / 2 + this.offset.x;
    this.y = window.innerHeight / 2 - this.offset.y;
  }
}