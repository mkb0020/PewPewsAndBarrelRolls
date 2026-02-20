// audio.js
export class AudioManager {
  constructor() {
    this.context    = null;
    this.masterGain = null;
    this.sfxGain    = null;
    this.isStarted  = false;
    this.isMuted    = false;
    this._preMuteVolume = 1.0;

    // BACKGROUND MUSIC 
    this.musicEl = new Audio('./audio/wormholeTheme.m4a');
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

    // SFX POOLS
    this.sfxPools = {
      laser:      this._createPool('./audio/laser.m4a',      6),
      impact:     this._createPool('./audio/impact.m4a',     6),
      spawn:      this._createPool('./audio/spawn.m4a',      4),
      barrelRoll: this._createPool('./audio/barrelRoll.m4a', 2),
      wormNoise:  this._createPool('./audio/wormNoise.m4a',  2),
      wormIntro:  this._createPool('./audio/wormIntro.m4a',  1),
      wormRattle: this._createPool('./audio/wormRattle.m4a', 2),
      wormDeath:  this._createPool('./audio/wormDeath.m4a',  1),
      warning:    this._createPool('./audio/warning.m4a',    1),
    };

    this._initContext();
    console.log('âœ” AudioManager initialized');
  }

  // WEB AUDIO - SFX ONLY
  _initContext() {
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
  start() {
    if (this.isStarted) return;
    this.isStarted = true;

    // RESUME AUDIOCONTEXT 
    if (this.context && this.context.state === 'suspended') {
      this.context.resume().catch(() => {});
    }

    // PLAY MUSIC - IOS SAFARI BLOCKS .play() IF ANY AWAIT HAS OCCURED FIRST IN THE CALL STACK
    this.musicEl.play().then(() => {
      console.log('âœ” Background music started');
    }).catch(e => {
      console.warn('âš  Could not autoplay music (will retry on next interaction):', e);
      const retry = () => {
        this.musicEl.play().then(() => {
          console.log('âœ” Music started on retry');
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

  startMusic() {
    if (this.isMuted) return;
    this.musicEl.play().catch(() => {});
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
  playWormRattle() { this._playSfx('wormRattle', this.WORM_RATTLE_VOLUME); }
  playWormDeath()  { this._playSfx('wormDeath',  0.9);                     }
  playWarning()    { this._playSfx('warning',    0.8);                     }
}