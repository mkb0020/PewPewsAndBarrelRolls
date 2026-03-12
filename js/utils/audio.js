// Updated 3/12/26 @ 7AM
// audio.js
export class AudioManager {
  constructor() {
    this.context    = null;
    this.masterGain = null;
    this.sfxGain    = null;
    this.isStarted  = false;
    this.isMuted    = false;
    this._preMuteVolume = 1.0;

    this.MUSIC_VOLUME        = 0.3;
    this.LASER_VOLUME        = 0.5;
    this.ENEMY_LASER_VOLUME  = 0.5;
    this.IMPACT_VOLUME       = 0.2;
    this.SPAWN_VOLUME        = 0.5;
    this.BARREL_ROLL_VOLUME  = 0.15;

    // ====== ACTIVE LOOP REGISTRY — ALL LOOPING SFX TRACKED HERE FOR EMERGENCY KILL ======
    this._activeLoops = []; // [{ source, gain }]

    // ====== MUSIC — WEB AUDIO API ======
    this._introBuffer        = null;
    this._bossBuffer         = null;
    this._creditsBuffer      = null;
    this._musicSource        = null;
    this._introSource        = null;
    this._musicGain          = null;
    this._introDecodePromise = null;
    this._bossDecodePromise  = null;
    this._creditsDecodePromise = null;

    // ====== WAVE MUSIC — ONE BUFFER PER WAVE + ONE TRANSITION PER WAVE (1–4) ======
    this._waveMusicBuffers        = new Array(5).fill(null);
    this._transitionBuffers       = new Array(4).fill(null);
    this._waveMusicDecodePromises = [];
    this._transitionDecodePromises = [];

    // GAME OVER MUSIC — TRACKED SEPARATELY FROM _musicSource ======
    // GAMEOVER1: LOOPING — REGULAR GAMEPLAY GAME OVER. STOPPED BY audio.stop() ON RESTART.
    // GAMEOVER2: ONE-SHOT, SCHEDULED FADE-OUT — BOSS GAME OVER / WORMHOLE SEQUENCE.
    this._gameover1Buffer = null;
    this._gameover1Source = null;
    this._gameover1Gain   = null;
    this._gameover2Buffer = null;
    this._gameover2Source = null;
    this._gameover2Gain   = null;

    // ====== SFX — WEB AUDIO API BUFFERS ======
    this._sfxBuffers = {};

    this._initContext();
    // console.log('✔ AudioManager initialized');
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
      this._creditsDecodePromise = this._prefetchAndDecode('./audio/credits.m4a')
        .then(buf => { this._creditsBuffer = buf; console.log('✔ Credits music buffer ready'); return buf; });

      //  PRELOAD GAME OVER MUSIC
      this._prefetchAndDecode('./audio/gameover1.m4a')
        .then(buf => { this._gameover1Buffer = buf; console.log('✔ GameOver1 buffer ready'); });
      this._prefetchAndDecode('./audio/gameover2.m4a')
        .then(buf => { this._gameover2Buffer = buf; console.log('✔ GameOver2 buffer ready'); });

      // PRELOAD WAVE MUSIC (wave1–5)
      for (let i = 0; i < 5; i++) {
        const idx = i;
        const p = this._prefetchAndDecode(`./audio/wave${idx + 1}.m4a`)
          .then(buf => { this._waveMusicBuffers[idx] = buf; console.log(`✔ Wave ${idx + 1} music buffer ready`); return buf; });
        this._waveMusicDecodePromises.push(p);
      }

      // PRELOAD TRANSITION STINGS
      for (let i = 0; i < 4; i++) {
        const idx = i;
        const p = this._prefetchAndDecode(`./audio/transition${idx + 1}.m4a`)
          .then(buf => { this._transitionBuffers[idx] = buf; console.log(`✔ Transition ${idx + 1} buffer ready`); return buf; });
        this._transitionDecodePromises.push(p);
      }

      // PRELOAD ALL SFX AS WEB AUDIO BUFFERS
      const sfxFiles = {
        laser:       './audio/laser.m4a',
        enemyLasers: './audio/enemyLasers.m4a',
        impact:      './audio/impact.m4a',
        spawn:       './audio/enemySpawn.m4a',
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
        waveWorms:        './audio/waveWorms.m4a',
        bossTransition1:  './audio/bossTransition1.m4a',
        bossTransition2:  './audio/bossTransition2.m4a',
        static:           './audio/static.m4a',
        waveStart:        './audio/waveStart.m4a',
        // ====== POWER-UPS ======
        powerUp1:       './audio/powerUp1.m4a',      // COSMIC PRISM HP HEAL COLLECT
        powerUp2:       './audio/powerUp2.m4a',      // LASER BOOST
        powerUp3:       './audio/powerUp3.m4a',      // SINGULARITY BOMB COLLECT
        babyBlackhole:  './audio/babyBlackhole.m4a', // SINGULARITY BOMB DEPLOY
        enemyDeath:     './audio/enemyDeath.m4a',    // BIOLOGICAL MELT COLLAPSE
        glitchOut:      './audio/glitchOut.m4a',     // SHIP DEATH GLITCH SEQUENCE
        boost:          './audio/boost.m4a',         // SHIP BOOST DRIVE
        slimeSounds:    './audio/slimeSounds.m4a',   // GLORK SLIME TELEGRAPH
      };

      for (const [name, src] of Object.entries(sfxFiles)) {
        this._sfxBuffers[name] = null;
        this._prefetchAndDecode(src)
          .then(buf => {
            this._sfxBuffers[name] = buf;
            // console.log(`✔ SFX buffer ready: ${name}`);
          });
      }

    } catch (e) {
      console.warn('⚠ Web Audio API not supported:', e);
    }
  }

  _prefetchAndDecode(url) {
    return fetch(url)
      .then(r  => r.arrayBuffer())
      .then(ab => this.context.decodeAudioData(ab))
      .catch(e  => { console.warn(`⚠ Audio pre-decode failed (${url}):`, e); return null; });
  }

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

  // STOP BOTH GAME OVER TRACKS. CALLED FROM stop() ON FULL RESTART.
  _stopGameOverSources() {
    try { this._gameover1Source?.stop(); } catch (_) {}
    this._gameover1Source = null;
    this._gameover1Gain   = null;

    try { this._gameover2Source?.stop(); } catch (_) {}
    this._gameover2Source = null;
    this._gameover2Gain   = null;
  }

  // ==================== PUBLIC API ====================
  start() {
    if (this.isStarted) return;
    this.isStarted = true;
    if (this.context?.state === 'suspended') {
      this.context.resume().catch(() => {});
    }
    // console.log('✔ Audio unlocked');
  }

  stop() {
    this.isStarted = false;
    this._stopMusicSource();
    this._stopGameOverSources(); //  CLEAN UP GAME OVER TRACKS ON FULL RESTART
  }

  stopMusic() {
    this._stopMusicSource();
  }

  startCreditsMusic(fadeDuration = 3.0) {
    if (this.isMuted) return;
    const play = () => {
      if (!this._creditsBuffer || !this.context) return;
      this._stopMusicSource();
      const source  = this.context.createBufferSource();
      source.buffer = this._creditsBuffer;
      source.loop   = true;
      source.connect(this._musicGain);
      this._musicGain.gain.setValueAtTime(0, this.context.currentTime);
      this._musicGain.gain.linearRampToValueAtTime(this.MUSIC_VOLUME, this.context.currentTime + fadeDuration);
      source.start(0);
      this._musicSource = source;
      // console.log('♫ Credits music fading in');
    };
    if (!this._creditsBuffer) {
      this._creditsDecodePromise.then(() => { if (!this.isMuted) play(); });
      return;
    }
    play();
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
    this._musicSource = boss;

    // console.log(`♫ Intro → Boss scheduled (handoff in ${this._introBuffer.duration.toFixed(2)}s)`);
  }

  //  REGULAR GAMEPLAY GAME OVER — LOOPING, NO FADE - STOPS CURRENT MUSIC IMMEDIATELY. CLEANED UP BY audio.stop() ON RESTART.
  playGameOver1() {
    if (this.isMuted || !this.context) return;
    if (!this._gameover1Buffer) {
      console.warn('[AudioManager] playGameOver1: buffer not ready');
      return;
    }

    this._stopMusicSource();      // CUT GAMEPLAY MUSIC IMMEDIATELY
    this._stopGameOverSources();  // PREVENT DOUBLE-TRIGGER

    const gain = this.context.createGain();
    gain.gain.value = this.MUSIC_VOLUME;
    gain.connect(this.masterGain);

    const source = this.context.createBufferSource();
    source.buffer = this._gameover1Buffer;
    source.loop   = true;
    source.connect(gain);
    source.start(0);

    this._gameover1Source = source;
    this._gameover1Gain   = gain;
    // console.log('♫ GameOver1 started (looping)');
  }

  //  BOSS GAME OVER — ONE-SHOT, SCHEDULED FADE-OUT OVER LAST fadeDuration SECONDS.
  // STOPS CURRENT MUSIC IMMEDIATELY. CLEANED UP BY audio.stop() ON RESTART.
  playGameOver2(fadeDuration = 4.0) {
    if (this.isMuted || !this.context) return;
    if (!this._gameover2Buffer) {
      console.warn('[AudioManager] playGameOver2: buffer not ready');
      return;
    }

    this._stopMusicSource();      // CUT BOSS MUSIC IMMEDIATELY
    this._stopGameOverSources();  // PREVENT DOUBLE-TRIGGER

    const gain = this.context.createGain();
    gain.gain.value = this.MUSIC_VOLUME;
    gain.connect(this.masterGain);

    const source = this.context.createBufferSource();
    source.buffer = this._gameover2Buffer;
    source.loop   = false;
    source.connect(gain);

    // SCHEDULE FADE-OUT: HOLD FULL VOLUME → RAMP TO 0 OVER LAST fadeDuration SECONDS
    const duration  = this._gameover2Buffer.duration;
    const now       = this.context.currentTime;
    const fadeStart = now + Math.max(0, duration - fadeDuration);
    gain.gain.setValueAtTime(this.MUSIC_VOLUME, fadeStart);
    gain.gain.linearRampToValueAtTime(0, now + duration);

    source.start(now);

    this._gameover2Source = source;
    this._gameover2Gain   = gain;
    // console.log(`♫ GameOver2 started (fade-out starts at ${(duration - fadeDuration).toFixed(2)}s, over ${fadeDuration}s)`);
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
    }

    return this.isMuted;
  }

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

    const entry = { source, gain };
    this._activeLoops.push(entry);

    return () => {
      try {
        gain.gain.setTargetAtTime(0, this.context.currentTime, 0.08);
        setTimeout(() => { try { source.stop(); } catch (_) {} }, 200);
      } catch (_) {}
      const idx = this._activeLoops.indexOf(entry);
      if (idx !== -1) this._activeLoops.splice(idx, 1);
    };
  }

  startLoopStatic(volume = 0.55)    { return this._startLoop('static',    volume); }
  startLoopTelegraph(volume = 0.9)  { return this._startLoop('telegraph', volume); }
  startLoopPrism(volume = 0.65)     { return this._startLoop('prism',     volume); }

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

    const entry = { source, gain };
    this._activeLoops.push(entry);

    return () => {
      try {
        gain.gain.setTargetAtTime(0, this.context.currentTime, 0.08);
        setTimeout(() => { try { source.stop(); } catch (_) {} }, 200);
      } catch (_) {}
      const idx = this._activeLoops.indexOf(entry);
      if (idx !== -1) this._activeLoops.splice(idx, 1);
    };
  }

  // ====== KILL ALL LOOPING SFX — CALLED ON BOSS TRANSITION / FULL RESET ======
  // CATCHES ANY LOOP WHOSE STOP HANDLE WAS LOST (e.g. TWO FLIM FLAMS TELEGRAPHING SIMULTANEOUSLY)
  stopAllLoopingSfx() {
    if (!this.context) return;
    const loops = this._activeLoops.slice(); // SNAPSHOT — STOP CALLS WILL MUTATE THE ARRAY
    for (const { source, gain } of loops) {
      try {
        gain.gain.setTargetAtTime(0, this.context.currentTime, 0.05);
        setTimeout(() => { try { source.stop(); } catch (_) {} }, 150);
      } catch (_) {}
    }
    this._activeLoops = [];
    // console.log(`♪ stopAllLoopingSfx: killed ${loops.length} active loop(s)`);
  }

  // ==================== PUBLIC PLAY METHODS ====================
  playOuch()        { this._playSfx('ouch',        0.5); }
  playPop()         { this._playSfx('pop',          0.9); }
  playSplat()       { this._playSfx('splat',        0.7); }
  startSlimeSounds(volume = 0.8) {
    if (this.isMuted || !this.context) return () => {};
    const buffer = this._sfxBuffers['slimeSounds'];
    if (!buffer) return () => {};

    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.loop   = false;

    const gain = this.context.createGain();
    gain.gain.value = Math.min(1, volume);
    source.connect(gain);
    gain.connect(this.sfxGain);
    source.start(0);

    const entry = { source, gain };
    this._activeLoops.push(entry);

    const stop = () => {
      try {
        gain.gain.setTargetAtTime(0, this.context.currentTime, 0.08);
        setTimeout(() => { try { source.stop(); } catch (_) {} }, 200);
      } catch (_) {}
      const idx = this._activeLoops.indexOf(entry);
      if (idx !== -1) this._activeLoops.splice(idx, 1);
    };

    source.onended = () => {
      const idx = this._activeLoops.indexOf(entry);
      if (idx !== -1) this._activeLoops.splice(idx, 1);
    };

    return stop;
  }
  playLaser()       { this._playSfx('laser',        this.LASER_VOLUME);       }
  playEnemyLaser()  { this._playSfx('enemyLasers',  this.ENEMY_LASER_VOLUME); }
  playImpact()      { this._playSfx('impact',       this.IMPACT_VOLUME);      }
  playSpawn()       { this._playSfx('spawn',         this.SPAWN_VOLUME);      }
  playBarrelRoll()  { this._playSfx('barrelRoll',    this.BARREL_ROLL_VOLUME);}
  playWormDeath1()  { this._playSfx('wormDeath1',    0.9); }
  playWormDeath2()  { this._playSfx('wormDeath2',    0.9); }
  playWormDeath3()  { this._playSfx('wormDeath3',    0.9); }
  playConsumed()    { this._playSfx('consumed',      0.9); }
  playBabyWorms()   { this._playSfx('babyWorms',     1.0); }
  playWarning()     { this._playSfx('warning',       0.8); }
  playWaveWormSfx()     { this._playSfx('waveWorms',       0.4); }
  playBossTransition1() { this._playSfx('bossTransition1', 0.9); }
  playBossTransition2() { this._playSfx('bossTransition2', 0.9); }
  playWaveStart()       { this._playSfx('waveStart',       0.55); }

  // ====== POWER-UP SFX ======
  playPowerUp1() { this._playSfx('powerUp1', 0.5); }  // COSMIC PRISM HP HEAL COLLECT
  playPowerUp2() { this._playSfx('powerUp2', 0.5); }  // LASER BOOST
  playPowerUp3() { this._playSfx('powerUp3', 0.5); }  // SINGULARITY BOMB COLLECT
  playBoost()    { this._playSfx('boost',    0.6); }  // SHIP BOOST DRIVE
  playBabyBlackhole() { this._playSfx('babyBlackhole', 0.5); } // SINGULARITY BOMB DEPLOY
  playEnemyDeath()    { this._playSfx('enemyDeath',    0.1); } // BIOLOGICAL MELT COLLAPSE
  playGlitchOut()     { this._playSfx('glitchOut',     0.7); } // SHIP DEATH GLITCH

  startWaveMusic(waveIndex) {
    if (this.isMuted) return;
    const buf = this._waveMusicBuffers[waveIndex];
    if (!buf) {
      this._waveMusicDecodePromises[waveIndex]?.then(() => {
        if (!this.isMuted) this._playBuffer(this._waveMusicBuffers[waveIndex]);
      });
      return;
    }
    this._playBuffer(buf);
  }

  playWaveTransition(waveNumber) {
    if (this.isMuted || !this.context) return;
    this._stopMusicSource();

    const idx = waveNumber - 1;
    if (idx < 0 || idx > 3) {
      console.warn(`[AudioManager] playWaveTransition: invalid waveNumber ${waveNumber} — expected 1–4`);
      return;
    }

    const play = (buf) => {
      if (!buf) return;
      const source  = this.context.createBufferSource();
      source.buffer = buf;
      source.loop   = false;
      source.connect(this._musicGain);
      source.start(0);
      this._musicSource = source;
    };

    const buf = this._transitionBuffers[idx];
    if (buf) {
      play(buf);
    } else {
      this._transitionDecodePromises[idx]?.then(b => { if (!this.isMuted) play(b); });
    }
  }
}