// audio.js
export class AudioManager {
  constructor() {
    this.context    = null;
    this.masterGain = null;
    this.sfxGain    = null;
    this.isStarted  = false;
    this.isMuted    = false;
    this._preMuteVolume = 1.0;

    this.MUSIC_VOLUME        = 0.4;
    this.LASER_VOLUME        = 0.5;
    this.ENEMY_LASER_VOLUME  = 0.5;
    this.IMPACT_VOLUME       = 0.2;
    this.SPAWN_VOLUME        = 0.15;
    this.BARREL_ROLL_VOLUME  = 0.15;

    // ====== MUSIC — WEB AUDIO API ======
    this._introBuffer        = null;
    this._bossBuffer         = null;
    this._musicSource        = null;
    this._introSource        = null;
    this._musicGain          = null;
    this._introDecodePromise = null;
    this._bossDecodePromise  = null;

    // ====== WAVE MUSIC — ONE BUFFER PER WAVE + TRANSITION ======
    this._waveMusicBuffers      = new Array(5).fill(null); // wave1–5.m4a
    this._transitionBuffer      = null;                    // transition.m4a
    this._waveMusicDecodePromises = [];
    this._transitionDecodePromise = null;

    // ====== SFX — WEB AUDIO API BUFFERS ======
    // ALL SFX USE WEB AUDIO BUFFERSOURCE NODES — NO HTML AUDIO ELEMENTS.
    // THIS MEANS ONLY THE AUDIOCONTEXT NEEDS TO BE UNLOCKED (ONE context.resume()
    // IN A USER GESTURE), AND ALL SUBSEQUENT PLAYS WORK WITHOUT ANY PER-ELEMENT
    // UNLOCKING DANCE — SOLVING THE IOS "ALL SFX FIRE AT ONCE" BUG FOR GOOD.
    this._sfxBuffers = {};

    this._initContext();
    console.log('✔ AudioManager initialized');
  }

  _initContext() {
    try {
      this.context    = new (window.AudioContext || window.webkitAudioContext)();
      this.masterGain = this.context.createGain();
      this.sfxGain    = this.context.createGain();
      this._musicGain = this.context.createGain();

      this.masterGain.gain.value = 0.7;
      this.sfxGain.gain.value    = 1.0;
      this._musicGain.gain.value = this.MUSIC_VOLUME;

      this.sfxGain.connect(this.masterGain);
      this._musicGain.connect(this.masterGain);
      this.masterGain.connect(this.context.destination);

      // PRELOAD MUSIC
      this._introDecodePromise = this._prefetchAndDecode('./audio/wormIntro.m4a')
        .then(buf => { this._introBuffer = buf; console.log('✔ Intro buffer ready');      return buf; });
      this._bossDecodePromise  = this._prefetchAndDecode('./audio/bossBattle.m4a')
        .then(buf => { this._bossBuffer  = buf; console.log('✔ Boss music buffer ready'); return buf; });

      // PRELOAD WAVE MUSIC (wave1–5) + TRANSITION
      for (let i = 0; i < 5; i++) {
        const idx = i;
        const p = this._prefetchAndDecode(`./audio/wave${idx + 1}.m4a`)
          .then(buf => { this._waveMusicBuffers[idx] = buf; console.log(`✔ Wave ${idx + 1} music buffer ready`); return buf; });
        this._waveMusicDecodePromises.push(p);
      }
      this._transitionDecodePromise = this._prefetchAndDecode('./audio/transition.m4a')
        .then(buf => { this._transitionBuffer = buf; console.log('✔ Transition buffer ready'); return buf; });

      // PRELOAD ALL SFX AS WEB AUDIO BUFFERS
      const sfxFiles = {
        laser:       './audio/laser.m4a',
        enemyLasers: './audio/enemyLasers.m4a',
        impact:      './audio/impact.m4a',
        spawn:       './audio/spawn.m4a',
        barrelRoll:  './audio/barrelRoll.m4a',
        wormDeath1:  './audio/wormDeath1.m4a',
        wormDeath2:  './audio/wormDeath2.m4a',
        wormDeath3:  './audio/wormDeath3.m4a',
        consumed:    './audio/consumed.m4a',
        warning:     './audio/warning.m4a',
        babyWorms:   './audio/babyWorms.m4a',
        ouch:        './audio/ouch.m4a',
        splat:       './audio/splat.m4a',
        buzz:        './audio/buzz.m4a',
        telegraph:   './audio/telegraph.m4a',
        prism:       './audio/prism.m4a',
        pop:         './audio/pop.m4a',
        waveWorms:   './audio/waveWorms.m4a',
      };

      for (const [name, src] of Object.entries(sfxFiles)) {
        this._sfxBuffers[name] = null;
        this._prefetchAndDecode(src)
          .then(buf => {
            this._sfxBuffers[name] = buf;
            console.log(`✔ SFX buffer ready: ${name}`);
          });
      }

    } catch (e) {
      console.warn('⚠ Web Audio API not supported:', e);
    }
  }

  // SHARED HELPER — FETCH RAW BYTES THEN DECODE. RETURNS Promise<AudioBuffer|null>.
  _prefetchAndDecode(url) {
    return fetch(url)
      .then(r  => r.arrayBuffer())
      .then(ab => this.context.decodeAudioData(ab))
      .catch(e  => { console.warn(`⚠ Audio pre-decode failed (${url}):`, e); return null; });
  }

  // PLAY AN SFX BUFFER VIA A DISPOSABLE BUFFERSOURCE NODE.
  _playSfx(name, volume = 1.0) {
    if (this.isMuted || !this.context) return;
    const buffer = this._sfxBuffers[name];
    if (!buffer) return;

    const source = this.context.createBufferSource();
    source.buffer = buffer;

    const gain = this.context.createGain();
    gain.gain.value = Math.min(1, volume);

    source.connect(gain);
    gain.connect(this.sfxGain);
    source.start(0);
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
  // IOS FIX: EVERYTHING IS NOW WEB AUDIO API. ONE context.resume() IN A USER
  // GESTURE UNLOCKS ALL FUTURE AUDIO — NO PER-ELEMENT HTML AUDIO PRIMING NEEDED.
  start() {
    if (this.isStarted) return;
    this.isStarted = true;
    if (this.context?.state === 'suspended') {
      this.context.resume().catch(() => {});
    }
    console.log('✔ Audio unlocked');
  }

  stop() {
    this.isStarted = false;
    this._stopMusicSource();
  }

  stopMusic() {
    this._stopMusicSource();
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

    const now           = this.context.currentTime;
    const bossStartTime = now + this._introBuffer.duration;

    const intro  = this.context.createBufferSource();
    intro.buffer = this._introBuffer;
    intro.loop   = false;
    intro.connect(this._musicGain);
    intro.start(now);
    this._introSource = intro;

    const boss  = this.context.createBufferSource();
    boss.buffer = this._bossBuffer;
    boss.loop   = true;
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
      if (!this._musicSource) {
        // MUSIC RESTART ON UNMUTE IS HANDLED BY THE CALLER (startWaveMusic / startBossMusic)
      }
    }

    return this.isMuted;
  }

  // CREATE A LOOPING BUZZ FOR ONE FLIM FLAM — RETURNS A stopFn TO CALL WHEN ENEMY DIES.
  startLoopBuzz(volume = 0.35) {
    if (this.isMuted || !this.context) return () => {};
    const buffer = this._sfxBuffers['buzz'];
    if (!buffer) return () => {};

    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.loop   = true;

    const gain = this.context.createGain();
    gain.gain.value = Math.min(1, volume);
    source.connect(gain);
    gain.connect(this.sfxGain);
    source.start(0);

    return () => {
      try {
        gain.gain.setTargetAtTime(0, this.context.currentTime, 0.08);
        setTimeout(() => { try { source.stop(); } catch (_) {} }, 200);
      } catch (_) {}
    };
  }

  // LOOPING TELEGRAPH WHISPER
  startLoopTelegraph(volume = 0.9) {
    return this._startLoop('telegraph', volume);
  }

  // LOOPING PRISM FREQUENCY — PLAYS FOR FULL PRISM ATTACK DURATION
  startLoopPrism(volume = 0.65) {
    return this._startLoop('prism', volume);
  }

  // SHARED LOOP HELPER — CREATES A LOOPING BUFFERSOURCE, RETURNS A STOP CLOSURE
  _startLoop(name, volume) {
    if (this.isMuted || !this.context) return () => {};
    const buffer = this._sfxBuffers[name];
    if (!buffer) return () => {};

    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.loop   = true;

    const gain = this.context.createGain();
    gain.gain.value = Math.min(1, volume);
    source.connect(gain);
    gain.connect(this.sfxGain);
    source.start(0);

    return () => {
      try {
        gain.gain.setTargetAtTime(0, this.context.currentTime, 0.08);
        setTimeout(() => { try { source.stop(); } catch (_) {} }, 200);
      } catch (_) {}
    };
  }

  // ==================== PUBLIC PLAY METHODS ====================
  playOuch()        { this._playSfx('ouch',        0.5); } // SHIP TAKES DAMAGE
  playPop()         { this._playSfx('pop',          0.9); } // OCULAR PRISM PUPIL DESTROYED
  playSplat()       { this._playSfx('splat',       0.7); } // SLIME HITS SHIP
  playLaser()       { this._playSfx('laser',       this.LASER_VOLUME);       }
  playEnemyLaser()  { this._playSfx('enemyLasers', this.ENEMY_LASER_VOLUME); } // ENEMY LASER FIRE
  playImpact()      { this._playSfx('impact',      this.IMPACT_VOLUME);      }
  playSpawn()       { this._playSfx('spawn',        this.SPAWN_VOLUME);      }
  playBarrelRoll()  { this._playSfx('barrelRoll',   this.BARREL_ROLL_VOLUME);}
  playWormDeath1()  { this._playSfx('wormDeath1',   0.9); } // KILL SHOT / FREEZE
  playWormDeath2()  { this._playSfx('wormDeath2',   0.9); } // SEGMENT POP WAVE
  playWormDeath3()  { this._playSfx('wormDeath3',   0.9); } // HEAD POP + COOLDOWN
  playConsumed()    { this._playSfx('consumed',     0.9); } // SHIP SPIRAL-IN DEATH
  playBabyWorms()   { this._playSfx('babyWorms',    1.0); } // BABY WORM SPIT ATTACK
  playWarning()     { this._playSfx('warning',      0.8); }
  playWaveWormSfx() { this._playSfx('waveWorms',    0.4); } // WAVE WORM SPAWN CUE

  // START LOOPING MUSIC FOR THE GIVEN WAVE (0-INDEXED)
  startWaveMusic(waveIndex) {
    if (this.isMuted) return;
    const buf = this._waveMusicBuffers[waveIndex];
    if (!buf) {
      // BUFFER NOT READY YET — WAIT FOR IT
      this._waveMusicDecodePromises[waveIndex]?.then(() => {
        if (!this.isMuted) this._playBuffer(this._waveMusicBuffers[waveIndex]);
      });
      return;
    }
    this._playBuffer(buf);
  }

  
  playWaveTransition() { // PLAY TRANSITION STING ONCE — NO LOOP
    if (this.isMuted || !this.context) return;
    this._stopMusicSource(); // CUT WAVE MUSIC IMMEDIATELY

    const play = (buf) => {
      if (!buf) return;
      const source  = this.context.createBufferSource();
      source.buffer = buf;
      source.loop   = false;
      source.connect(this._musicGain);
      source.start(0);
      this._musicSource = source; // SO stopMusic() / toggleMute() CAN REACH IT
    };

    if (this._transitionBuffer) {
      play(this._transitionBuffer);
    } else {
      this._transitionDecodePromise?.then(buf => { if (!this.isMuted) play(buf); });
    }
  }
}