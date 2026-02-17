// audio.js

export class AudioManager {
  constructor() {
    this.context    = null;
    this.musicBuffer = null;
    this.musicSource = null;
    this.masterGain = null;
    this.musicGain  = null;
    this.sfxGain    = null;
    this.isStarted  = false;
    this.isMuted    = false;
    this._preMuteVolume = 1.0;

    // SFX POOLS
    this.sfxPools = {
      laser:  this._createPool('assets/audio/laser.wav',  6),
      impact: this._createPool('assets/audio/impact.wav', 6),
      spawn:  this._createPool('assets/audio/spawn.wav',  4),
    };

    this.MUSIC_VOLUME  = 0.75;
    this.LASER_VOLUME  = 0.3;
    this.IMPACT_VOLUME = 0.2;
    this.SPAWN_VOLUME  = 0.15;

    this._initContext();
    console.log('✔ AudioManager initialized');
  }

  //  CONTEXT + GAIN GRAPH
  _initContext() {
    try {
      this.context    = new (window.AudioContext || window.webkitAudioContext)();
      this.masterGain = this.context.createGain();
      this.musicGain  = this.context.createGain();
      this.sfxGain    = this.context.createGain();

      this.masterGain.gain.value = 1.0;
      this.musicGain.gain.value  = this.MUSIC_VOLUME;
      this.sfxGain.gain.value    = 1.0;

      this.musicGain.connect(this.masterGain);
      this.sfxGain.connect(this.masterGain);
      this.masterGain.connect(this.context.destination);
    } catch (e) {
      console.warn('⚠ Web Audio API not supported:', e);
    }
  }

  //  SFX POOL 
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

  // ~~~~~~~~~~~~~~~ MUSIC ~~~~~~~~~~~~~~~
  async _loadMusicBuffer(url) {
    const res = await fetch(url);
    const arr = await res.arrayBuffer();
    return this.context.decodeAudioData(arr);
  }

  _scheduleMusicSource(offset = 0) {
    if (!this.musicBuffer || !this.context) return;
    const source = this.context.createBufferSource();
    source.buffer = this.musicBuffer;
    source.loop   = false; // NO GAP BETWEEN LOOPS
    source.connect(this.musicGain);
    source.start(this.context.currentTime, offset);
    this.musicSource = source;
    source.onended = () => {
      if (this.isStarted) this._scheduleMusicSource(0);
    };
  }

  // ───────────────────────────────────────────────── PUBLIC API ─────────────────────────────────────────────────
  /** MUST BE CALLED FROM A USER-INTERACTION HANDLER (BROWSER AUTOPLAY POLICY) */
  async start() {
    if (this.isStarted || !this.context) return;
    this.isStarted = true;
    try {
      if (this.context.state === 'suspended') await this.context.resume();
      this.musicBuffer = await this._loadMusicBuffer('assets/audio/spaceSong.wav');
      this._scheduleMusicSource(0);
      console.log('✔ Background music started — seamless loop active');
    } catch (e) {
      console.warn('⚠ Could not start music:', e);
    }
  }

  stop() {
    this.isStarted = false;
    if (this.musicSource) {
      try { this.musicSource.stop(); } catch (e) {}
      this.musicSource = null;
    }
  }

  /** Toggle mute — preserves volume level for unmute */
  toggleMute() {
    if (!this.masterGain) return;
    this.isMuted = !this.isMuted;
    if (this.isMuted) {
      this._preMuteVolume = this.masterGain.gain.value;
      this.masterGain.gain.setTargetAtTime(0, this.context.currentTime, 0.05);
    } else {
      this.masterGain.gain.setTargetAtTime(this._preMuteVolume, this.context.currentTime, 0.05);
    }
    return this.isMuted;
  }

  // SFX SHORTCUTS
  playLaser()  { this._playSfx('laser',  this.LASER_VOLUME);  }
  playImpact() { this._playSfx('impact', this.IMPACT_VOLUME); }
  playSpawn()  { this._playSfx('spawn',  this.SPAWN_VOLUME);  }
}