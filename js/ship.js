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

    this.particles = new ParticleSystem();
    
    this.loadSprite();
    console.log('✔ Ship initialized');
  }

  loadSprite() {
    this.spaceshipImg = new Image();
    this.spaceshipImg.src = './images/spaceship.png';
    
    this.spaceshipImg.onload = () => {
      console.log('✔ Spaceship sprite loaded');
      this.spriteLoaded = true;
      this.spriteWidth = this.spaceshipImg.width;
      this.frameWidth = this.spriteWidth / CONFIG.SHIP.SPRITE_FRAMES;
    };
    
    this.spaceshipImg.onerror = () => {
      console.error('✗ Failed to load spaceship sprite');
    };
  }

  startBarrelRoll(direction = 1) {
    if (!this.isBarrelRolling) {
      this.isBarrelRolling = true;
      this.barrelRollProgress = 0;
      this.barrelRollDirection = direction;
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
    const prevX = this.offset.x;
    const prevY = this.offset.y;
    this.offset.x = Math.max(-CONFIG.SHIP.MAX_OFFSET_X, Math.min(CONFIG.SHIP.MAX_OFFSET_X, this.offset.x));
    this.offset.y = Math.max(-CONFIG.SHIP.MAX_OFFSET_Y, Math.min(CONFIG.SHIP.MAX_OFFSET_Y, this.offset.y));

    if (this.offset.x !== prevX) this.velocity.x = 0;
    if (this.offset.y !== prevY) this.velocity.y = 0;

    this.x = window.innerWidth  / 2 + this.offset.x;
    this.y = window.innerHeight / 2 - this.offset.y;

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
    this.updateMovement(dt);
    
    if (this.shootCooldown > 0) {
      this.shootCooldown -= dt;
      if (this.shootCooldown <= 0) {
        this.canShoot = true;
      }
    }
    
    if (!this.isBarrelRolling) {
      this.particles.spawn(this.x, this.y, CONFIG.PARTICLES.SPAWN_RATE);
    }
    
    this.particles.update(dt);
  }

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
    if (this.isBarrelRolling) {
      const flashIntensity = Math.sin(this.barrelRollProgress * Math.PI) * 0.15;
      this.ctx.fillStyle = `rgba(0, 255, 255, ${flashIntensity})`;
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
    
    this.ctx.globalAlpha = 1;
    
    if (this.spriteLoaded) {
      this.ctx.save();
      this.ctx.translate(this.x, this.y);
      this.ctx.rotate(this.rotation);
      
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