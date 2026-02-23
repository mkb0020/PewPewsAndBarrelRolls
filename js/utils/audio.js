// audio.js
export class AudioManager {
  constructor() {
    this.context    = null;
    this.masterGain = null;
    this.sfxGain    = null;
    this.isStarted  = false;
    this.isMuted    = false;
    this._preMuteVolume = 1.0;

    this.MUSIC_VOLUME       = 0.75;
    this.LASER_VOLUME       = 0.3;
    this.IMPACT_VOLUME      = 0.2;
    this.SPAWN_VOLUME       = 0.15;
    this.BARREL_ROLL_VOLUME = 0.15;

    // ====== MUSIC — WEB AUDIO API ======
    this._musicBuffer        = null;  
    this._introBuffer        = null;  
    this._bossBuffer         = null;  
    this._musicSource        = null;  
    this._introSource        = null; 
    this._musicGain          = null;  
    this._musicDecodePromise = null;
    this._introDecodePromise = null;
    this._bossDecodePromise  = null;

    this.sfxPools = {
      laser:      this._createPool('./audio/laser.m4a',      6),
      impact:     this._createPool('./audio/impact.m4a',     6),
      spawn:      this._createPool('./audio/spawn.m4a',      4), // ENEMY SPAWN
      barrelRoll: this._createPool('./audio/barrelRoll.m4a', 2), // WOOSH SOUND
      wormDeath1: this._createPool('./audio/wormDeath1.m4a', 1), // KILL SHOT — PLAYS DURING FREEZE PAUSE
      wormDeath2: this._createPool('./audio/wormDeath2.m4a', 1), // SEGMENT POP WAVE — PLAYS WHEN POPPING STARTS
      wormDeath3: this._createPool('./audio/wormDeath3.m4a', 1), // HEAD POP + COOLDOWN (~10s) — PLAYS ON FINAL SEGMENT
      consumed:   this._createPool('./audio/consumed.m4a',   1), // SHIP SPIRALS INTO WORM MOUTH
      warning:    this._createPool('./audio/warning.m4a',    1),
    };

    this._initContext();
    console.log('✔ AudioManager initialized');
  }

  _initContext() {
    try {
      this.context    = new (window.AudioContext || window.webkitAudioContext)();
      this.masterGain = this.context.createGain();
      this.sfxGain    = this.context.createGain();
      this._musicGain = this.context.createGain();

      this.masterGain.gain.value = 1.0;
      this.sfxGain.gain.value    = 1.0;
      this._musicGain.gain.value = this.MUSIC_VOLUME;

      this.sfxGain.connect(this.masterGain);
      this._musicGain.connect(this.masterGain);
      this.masterGain.connect(this.context.destination);

      this._musicDecodePromise = this._prefetchAndDecode('./audio/wormholeTheme.m4a')
        .then(buf => { this._musicBuffer = buf; console.log('✔ Theme buffer ready');      return buf; });

      this._introDecodePromise = this._prefetchAndDecode('./audio/wormIntro.m4a')
        .then(buf => { this._introBuffer = buf; console.log('✔ Intro buffer ready');      return buf; });

      this._bossDecodePromise  = this._prefetchAndDecode('./audio/bossBattle.m4a')
        .then(buf => { this._bossBuffer  = buf; console.log('✔ Boss music buffer ready'); return buf; });

    } catch (e) {
      console.warn('⚠ Web Audio API not supported:', e);
    }
  }

  // SHARED HELPER — FETCH RAW BYTES THEN DECODE. RETURNS Promise<AudioBuffer|null>.
  _prefetchAndDecode(url) {
    return fetch(url)
      .then(r  => r.arrayBuffer())
      .then(ab => this.context.decodeAudioData(ab))
      .catch(e  => { console.warn(`⚠ Music pre-decode failed (${url}):`, e); return null; });
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

  // ====== INTERNAL MUSIC PLAYBACK ======
  _playBuffer(buffer) {
    if (!buffer || !this.context) return;
    this._stopMusicSource();

    const source  = this.context.createBufferSource();
    source.buffer = buffer;
    source.loop   = true; 

    source.connect(this._musicGain);
    source.start(0);
    this._musicSource = source;
  }

  _stopMusicSource() {
    try { this._introSource?.stop(); } catch (_) {}
    this._introSource = null;
    try { this._musicSource?.stop(); } catch (_) {}
    this._musicSource = null;
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

  async start() {
    if (this.isStarted) return;
    this.isStarted = true;
    if (this.context?.state === 'suspended') {
      await this.context.resume();
    }

    this._primeAllAudio(); // UNLOCK ALL SFX POOL ELEMENTS INSIDE USER GESTURE
    console.log('✔ Audio unlocked');
  }

  stop() {
    this.isStarted = false;
    this._stopMusicSource();
  }

  stopMusic() {
    this._stopMusicSource();
  }

  startMusic() { // RESTART REGULAR GAMEPLAY THEME
    if (this.isMuted) return;
    if (!this._musicBuffer) {
      this._musicDecodePromise?.then(() => {
        if (!this.isMuted) this._playBuffer(this._musicBuffer);
      });
      return;
    }
    this._playBuffer(this._musicBuffer);
  }

  startBossMusic() {
    if (this.isMuted) return;
    if (!this._introBuffer || !this._bossBuffer) {
      Promise.all([this._introDecodePromise, this._bossDecodePromise]).then(() => {
        if (!this.isMuted) this._playIntroBoss();
      });
      return;
    }
    this._playIntroBoss();
  }

  _playIntroBoss() {
    this._stopMusicSource(); 

    const now = this.context.currentTime;
    const bossStartTime = now + this._introBuffer.duration; // EXACT HANDOFF POINT

    const intro    = this.context.createBufferSource();  // INTRO — ONE-SHOT, NO LOOP
    intro.buffer   = this._introBuffer;
    intro.loop     = false;
    intro.connect(this._musicGain);
    intro.start(now);
    this._introSource = intro;

    
    const boss    = this.context.createBufferSource(); // BOSS — SCHEDULED TO START THE INSTANT INTRO ENDS, THEN LOOPS FOREVER
    boss.buffer   = this._bossBuffer;
    boss.loop     = true;
    boss.connect(this._musicGain);
    boss.start(bossStartTime);
    this._musicSource = boss; // MAIN REFERENCE — USED BY stopMusic() AND toggleMute()

    console.log(`♫ Intro → Boss scheduled (handoff in ${this._introBuffer.duration.toFixed(2)}s)`);
  }

  toggleMute() {
    this.isMuted = !this.isMuted;

    if (this.isMuted) {
      if (this._musicGain && this.context) {
        this._preMuteVolume = this._musicGain.gain.value;
        this._musicGain.gain.setTargetAtTime(0, this.context.currentTime, 0.05);
        this.masterGain.gain.setTargetAtTime(0, this.context.currentTime, 0.05);
      }
    } else {
      if (this._musicGain && this.context) {
        this._musicGain.gain.setTargetAtTime(this.MUSIC_VOLUME, this.context.currentTime, 0.05);
        this.masterGain.gain.setTargetAtTime(1.0, this.context.currentTime, 0.05);
      }
      if (!this._musicSource) this.startMusic(); // RESTART MUSIC IF IT WASN'T PLAYING 
    }

    return this.isMuted;
  }

  playLaser()      { this._playSfx('laser',      this.LASER_VOLUME);       }
  playImpact()     { this._playSfx('impact',     this.IMPACT_VOLUME);      }
  playSpawn()      { this._playSfx('spawn',      this.SPAWN_VOLUME);       }
  playBarrelRoll() { this._playSfx('barrelRoll', this.BARREL_ROLL_VOLUME); }
  playWormDeath1() { this._playSfx('wormDeath1', 0.9); } // KILL SHOT / FREEZE
  playWormDeath2() { this._playSfx('wormDeath2', 0.9); } // SEGMENT POP WAVE
  playWormDeath3() { this._playSfx('wormDeath3', 0.9); } // HEAD POP + COOLDOWN
  playConsumed()   { this._playSfx('consumed',   0.9); } // SHIP SPIRAL-IN DEATH
  playWarning()    { this._playSfx('warning',    0.8); }
}