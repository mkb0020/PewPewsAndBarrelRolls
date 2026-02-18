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
    this.musicEl = new Audio('./audio/spaceSong.wav');
    this.musicEl.loop    = true;
    this.musicEl.preload = 'auto';

    this.MUSIC_VOLUME  = 0.75;
    this.LASER_VOLUME  = 0.3;
    this.IMPACT_VOLUME = 0.2;
    this.SPAWN_VOLUME  = 0.15;

    this.musicEl.volume = this.MUSIC_VOLUME;

    // SFX POOLS
    this.sfxPools = {
      laser:  this._createPool('./audio/laser.wav',  6),
      impact: this._createPool('./audio/impact.wav', 6),
      spawn:  this._createPool('./audio/spawn.wav',  4),
    };

    this._initContext();
    console.log('✔ AudioManager initialized');
  }

  // WEB AUDIO — SFX ONLY
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
      console.warn('⚠ Web Audio API not supported:', e);
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
  async start() {
    if (this.isStarted) return;
    this.isStarted = true;

    try {
      if (this.context && this.context.state === 'suspended') {
        await this.context.resume();
      }
    } catch (e) {
      console.warn('⚠ Could not resume AudioContext:', e);
    }


    try {
      await this.musicEl.play();
      console.log('✔ Background music started');
    } catch (e) {
      console.warn('⚠ Could not autoplay music (will retry on next interaction):', e);
      const retry = async () => {
        try {
          await this.musicEl.play();
          console.log('✔ Music started on retry');
        } catch (_) {}
        window.removeEventListener('touchstart', retry);
        window.removeEventListener('click', retry);
      };
      window.addEventListener('touchstart', retry, { once: true });
      window.addEventListener('click',      retry, { once: true });
    }
  }

  stop() {
    this.isStarted = false;
    this.musicEl.pause();
    this.musicEl.currentTime = 0;
  }

  /** Toggle mute — affects both music and SFX */
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

  // SFX SHORTCUTS
  playLaser()  { this._playSfx('laser',  this.LASER_VOLUME);  }
  playImpact() { this._playSfx('impact', this.IMPACT_VOLUME); }
  playSpawn()  { this._playSfx('spawn',  this.SPAWN_VOLUME);  }
}