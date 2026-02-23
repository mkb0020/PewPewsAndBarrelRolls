// audio.js
export class AudioManager {
  constructor() {
    this.context    = null;
    this.masterGain = null;
    this.sfxGain    = null;
    this.isStarted  = false;
    this.isMuted    = false;
    this._preMuteVolume = 1.0;

    this.musicEl = new Audio('./audio/wormholeTheme.m4a'); // BACKGROUND MUSIC 
    this.musicEl.loop    = true;
    this.musicEl.preload = 'auto';

    this.MUSIC_VOLUME       = 0.75;
    this.LASER_VOLUME       = 0.3;
    this.IMPACT_VOLUME      = 0.2;
    this.SPAWN_VOLUME       = 0.15;
    this.BARREL_ROLL_VOLUME = 0.15;
    this.WORM_INTRO_VOLUME  = 0.7;
    this.WORM_RATTLE_VOLUME = 0.5;

    this.musicEl.volume = this.MUSIC_VOLUME;

    this.sfxPools = {
      laser:      this._createPool('./audio/laser.m4a',      6),
      impact:     this._createPool('./audio/impact.m4a',     6),
      spawn:      this._createPool('./audio/spawn.m4a',      4), // ENEMY SPAWN
      barrelRoll: this._createPool('./audio/barrelRoll.m4a', 2), // WOOSH SOUND
      wormNoise:  this._createPool('./audio/wormNoise.m4a',  2), // CREEPY WORM SOUND
      wormIntro:  this._createPool('./audio/wormIntro.m4a',  1), // WORM ENTERS THE SCENE
      wormRattle:  this._createPool('./audio/wormRattle.m4a',  2), // CREEPY WORM RATTLE SOUND
      wormDeath1:  this._createPool('./audio/wormDeath1.m4a', 1), // KILL SHOT — PLAYS DURING FREEZE PAUSE
      wormDeath2:  this._createPool('./audio/wormDeath2.m4a', 1), // SEGMENT POP WAVE — PLAYS WHEN POPPING STARTS
      wormDeath3:  this._createPool('./audio/wormDeath3.m4a', 1), // HEAD POP + COOLDOWN (~10s) — PLAYS ON FINAL SEGMENT
      consumed:    this._createPool('./audio/consumed.m4a',   1), // SHIP SPIRALS INTO WORM MOUTH
      warning:     this._createPool('./audio/warning.m4a',    1),
    };

    this._initContext();
    console.log('âœ” AudioManager initialized');
  }

  _initContext() {  // WEB AUDIO - SFX ONLY
    try {
      this.context    = new (window.AudioContext || window.webkitAudioContext)();
      this.masterGain = this.context.createGain();
      this.sfxGain    = this.context.createGain();

      this.masterGain.gain.value = 1.0;
      this.sfxGain.gain.value    = 1.0;

      this.sfxGain.connect(this.masterGain);
      this.masterGain.connect(this.context.destination);
    } catch (e) {
      console.warn('âš  Web Audio API not supported:', e);
    }
  }

  _createPool(src, size) {
    return {
      instances: Array.from({ length: size }, () => {
        const a = new Audio(src);
        a.preload = 'auto';
        return a;
      }),
      index: 0,
    };
  }

  _playSfx(poolName, volume = 1.0) {
    if (this.isMuted) return;
    const pool = this.sfxPools[poolName];
    if (!pool) return;
    const instance = pool.instances[pool.index];
    pool.index = (pool.index + 1) % pool.instances.length;
    instance.volume = Math.min(1, volume);
    instance.currentTime = 0;
    instance.play().catch(() => {});
  }

  // ==================== PUBLIC API ====================

  // IOS REQUIRES EVERY <audio> ELEMENT TO BE INDIVIDUALLY UNLOCKED VIA A USER GESTURE.
  // SILENTLY PLAYS+PAUSES EVERY POOL INSTANCE AT VOLUME 0 ON FIRST INTERACTION,
  // SO LATER CALLS FROM setTimeout / GAME LOOP WONT BE BLOCKED BY THE AUTOPLAY POLICY.
  _primeAllAudio() {
    for (const pool of Object.values(this.sfxPools)) {
      for (const instance of pool.instances) {
        instance.volume = 0;
        instance.play().then(() => {
          instance.pause();
          instance.currentTime = 0;
        }).catch(() => {});
      }
    }
  }

  start() {
    if (this.isStarted) return;
    this.isStarted = true;

    if (this.context && this.context.state === 'suspended') { // RESUME AUDIOCONTEXT
      this.context.resume().catch(() => {});
    }

    this._primeAllAudio();  // UNLOCK ALL SFX POOL ELEMENTS WHILE WE ARE INSIDE A USER GESTURE

    // PLAY MUSIC - IOS SAFARI BLOCKS .play() IF ANY AWAIT HAS OCCURRED FIRST IN THE CALL STACK
    this.musicEl.play().then(() => {
      console.log('Background music started');
    }).catch(e => {
      console.warn('Could not autoplay music (will retry on next interaction):', e);
      const retry = () => {
        this.musicEl.play().then(() => {
          console.log('Music started on retry');
        }).catch(() => {});
        window.removeEventListener('touchstart', retry);
        window.removeEventListener('click',      retry);
      };
      window.addEventListener('touchstart', retry, { once: true });
      window.addEventListener('click',      retry, { once: true });
    });
  }

  stop() {
    this.isStarted = false;
    this.musicEl.pause();
    this.musicEl.currentTime = 0;
  }

  stopMusic() {
    this.musicEl.pause();
  }

  startMusic() { // IOS: .play() FROM setTimeout IS NOT A USER GESTURE — RETRY ON NEXT TOUCH/CLICK IF BLOCKED
    if (this.isMuted) return;
    this.musicEl.play().catch(() => {
      const retry = () => {
        this.musicEl.play().catch(() => {});
      };
      window.addEventListener('touchstart', retry, { once: true });
      window.addEventListener('click',      retry, { once: true });
    });
  }

  toggleMute() {
    this.isMuted = !this.isMuted;

    if (this.isMuted) {
      this.musicEl.volume = 0;
      if (this.masterGain && this.context) {
        this._preMuteVolume = this.masterGain.gain.value;
        this.masterGain.gain.setTargetAtTime(0, this.context.currentTime, 0.05);
      }
    } else {
      this.musicEl.volume = this.MUSIC_VOLUME;
      if (this.masterGain && this.context) {
        this.masterGain.gain.setTargetAtTime(this._preMuteVolume, this.context.currentTime, 0.05);
      }
    }

    return this.isMuted;
  }

  playLaser()      { this._playSfx('laser',      this.LASER_VOLUME);       }
  playImpact()     { this._playSfx('impact',     this.IMPACT_VOLUME);      }
  playSpawn()      { this._playSfx('spawn',      this.SPAWN_VOLUME);       }
  playBarrelRoll() { this._playSfx('barrelRoll', this.BARREL_ROLL_VOLUME); }
  playWormNoise()  { this._playSfx('wormNoise',  0.75);                    }
  playWormIntro()  { this._playSfx('wormIntro',  this.WORM_INTRO_VOLUME);  }
  playWormRattle()  { this._playSfx('wormRattle',  this.WORM_RATTLE_VOLUME); }
  playWormDeath1()  { this._playSfx('wormDeath1',  0.9); } // KILL SHOT / FREEZE
  playWormDeath2()  { this._playSfx('wormDeath2',  0.9); } // SEGMENT POP WAVE
  playWormDeath3()  { this._playSfx('wormDeath3',  0.9); } // HEAD POP + COOLDOWN
  playConsumed()    { this._playSfx('consumed',     0.9); } // SHIP SPIRAL-IN DEATH
  playWarning()     { this._playSfx('warning',     0.8); }
}