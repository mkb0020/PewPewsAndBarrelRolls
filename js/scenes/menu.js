// menu.js
import { setMobileMode } from '../utils/controls.js';

const DEV_MODE = true;

export class Menu {
  constructor() {
    this._overlay      = document.getElementById('menu-overlay');
    this._resolve      = null;
    this._starfield    = null;
    this._rafId        = null;
    this._onKey        = null;
    this._deviceScreen = null;
    this._photoScreen  = null;
    this._cockpitImg   = document.getElementById('opening-cockpit');
    this._lastTime     = 0;

    this._atmosContext = null;
    this._atmosSource  = null;
    this._atmosGain    = null;
    this._atmosBuffer  = null;
    this._atmosRawProm = null;

    if (DEV_MODE) this._overlay?.classList.add('dev-mode');
  }

  // ======================= PUBLIC: SHOW =======================
  show(starfield, onStart) {
    this._starfield = starfield;
    this._onStart   = onStart ?? null; // CALLED SYNCHRONOUSLY INSIDE THE GAME MODE CLICK — WHILE STILL IN USER GESTURE

    if (!this._overlay) {
      console.error('[Menu] #menu-overlay not found in DOM');
      return Promise.resolve({ mode: 'bossBattle', enemyCount: 5 });
    }

    this._buildDeviceScreen();
    this._animateStarfield();

    if (!this._atmosRawProm) {
      this._atmosRawProm = fetch('./audio/menuAtmosphere.m4a')
        .then(r  => r.arrayBuffer())
        .catch(e => { console.warn('⚠ Atmosphere prefetch failed:', e); return null; });
    }

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        this._overlay.classList.add('visible');
        setTimeout(() => this._showPhotoWarning(), 180);
      });
    });

    return new Promise(resolve => { this._resolve = resolve; });
  }

  // ======================= PHOTOSENSITIVITY WARNING =======================
  _showPhotoWarning() {
    this._photoScreen = this._overlay.querySelector('#photosensitivity-screen');
    if (!this._photoScreen) {
      this._deviceScreen?.classList.add('visible');
      return;
    }

    this._photoScreen.classList.remove('visible', 'exit');
    this._photoScreen.style.display = '';
    this._photoScreen.classList.add('visible');

    this._photoScreen.querySelector('#photo-btn-ok')
      ?.addEventListener('click', () => this._onPhotoAck(), { once: true });
  }

  _onPhotoAck() {
    if (!this._photoScreen?.classList.contains('visible')) return;

    // START ATMOSPHERE HERE — THIS IS THE FIRST USER GESTURE, EARLIER THAN DEVICE SELECT.
    // THE CLICK UNLOCKS THE AudioContext SO WE KICK OFF THE FADE-IN IMMEDIATELY.
    this._startAtmosphere();

    this._photoScreen.classList.remove('visible');
    this._photoScreen.classList.add('exit');

    setTimeout(() => {
      this._photoScreen.style.display = 'none';
      this._deviceScreen?.classList.add('visible');
    }, 460);
  }

  // ======================= DEVICE SCREEN =======================
  _buildDeviceScreen() {
    this._deviceScreen = this._overlay.querySelector('#device-select-screen');
    if (!this._deviceScreen) {
      console.error('[Menu] #device-select-screen not found — did you add the HTML snippet to index.html?');
      return;
    }

    this._deviceScreen.classList.remove('visible', 'exit'); // RESET STATE IN CASE show() IS CALLED MORE THAN ONCE (E.G. AFTER RESTART)
    this._deviceScreen.style.display = '';

    this._deviceScreen.querySelector('#device-btn-desktop') // { once: true } — CLEANS UP LISTENERS AUTOMATICALLY AFTER FIRST CLICK
      ?.addEventListener('click', () => this._onDeviceSelect(false), { once: true });
    this._deviceScreen.querySelector('#device-btn-mobile')
      ?.addEventListener('click', () => this._onDeviceSelect(true),  { once: true });
  }

  _onDeviceSelect(mobile) {
    if (!this._deviceScreen?.classList.contains('visible')) return;
    setMobileMode(mobile);
    // NOTE: _startAtmosphere() HAS ALREADY BEEN CALLED FROM _onPhotoAck() —
    // NO NEED TO CALL IT AGAIN HERE.

    const blackout = this._overlay?.querySelector('#menu-blackout');
    if (blackout) blackout.classList.add('fade-out');

    this._deviceScreen.classList.remove('visible');
    this._deviceScreen.classList.add('exit');

    setTimeout(() => {
      this._deviceScreen.style.display = 'none';
      this._attachMainMenuListeners();
    }, 420);
  }

  // ======================= MAIN MENU =======================
  _attachMainMenuListeners() {
    if (DEV_MODE) {
      const slider = this._overlay.querySelector('#dev-enemy-count');
      const label  = this._overlay.querySelector('#dev-enemy-value');
      slider?.addEventListener('input', () => {
        if (label) label.textContent = slider.value;
      });
    }

    this._overlay.querySelectorAll('.menu-btn[data-mode]').forEach(btn => {
      btn.addEventListener('click', () => this._select(btn.dataset.mode));
    });

    this._onKey = (e) => {
      if (e.code === 'Digit1') this._select('gameplay');
      if (e.code === 'Digit2') this._select('bossBattle');
    };
    window.addEventListener('keydown', this._onKey);
  }

  // ======================= GAME MODE SELECTED =======================
  _select(mode) {
    const slider     = this._overlay?.querySelector('#dev-enemy-count');
    const enemyCount = DEV_MODE ? parseInt(slider?.value ?? '5', 10) : 5;

    if (this._onStart) { this._onStart(); this._onStart = null; }

    this._stopAtmosphere(); // FADES OUT, THEN CLOSES THE CONTEXT

    this._overlay?.classList.remove('visible');
    window.removeEventListener('keydown', this._onKey);

    // KEEP STARFIELD RAF RUNNING THROUGH THE MENU'S EXIT FADE
    // SO THERE'S NO GAP BEFORE THE OPENING SCENE TAKES OVER
    setTimeout(() => {
      cancelAnimationFrame(this._rafId); // OPENING SCENE WILL START ITS OWN LOOP NOW
      this._overlay?.classList.add('hidden');
      this._resolve({ mode, enemyCount });
    }, 650);
  }

  // ======================= ATMOSPHERE AUDIO =======================
  async _startAtmosphere() {
    try {
      if (!this._atmosContext) {
        this._atmosContext = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (this._atmosContext.state === 'suspended') {
        await this._atmosContext.resume();
      }

      if (!this._atmosBuffer) {
        const arrayBuf = await this._atmosRawProm;
        if (!arrayBuf) return;
        this._atmosBuffer = await this._atmosContext.decodeAudioData(arrayBuf);
      }

      this._stopAtmosphereSource();

      const source    = this._atmosContext.createBufferSource();
      source.buffer   = this._atmosBuffer;
      source.loop     = true; // SAMPLE-ACCURATE GAPLESS LOOP

      const gain      = this._atmosContext.createGain();
      gain.gain.value = 0; // START SILENT — FADE IN BELOW

      source.connect(gain);
      gain.connect(this._atmosContext.destination);
      source.start(0);

      // FADE IN TO TARGET VOLUME OVER ~1.5s
      const TARGET_VOLUME = 0.6;
      const FADE_IN_SEC   = 1.5;
      gain.gain.setValueAtTime(0, this._atmosContext.currentTime);
      gain.gain.linearRampToValueAtTime(TARGET_VOLUME, this._atmosContext.currentTime + FADE_IN_SEC);

      this._atmosSource = source;
      this._atmosGain   = gain;
      console.log('♫ Menu atmosphere started (fade-in)');
    } catch (e) {
      console.warn('⚠ Atmosphere audio failed:', e);
    }
  }

  _stopAtmosphereSource() {
    try { this._atmosSource?.stop(); } catch (_) {}
    this._atmosSource = null;
    this._atmosGain   = null;
  }

  _stopAtmosphere() {
    // FADE OUT OVER ~0.8s, THEN CLOSE THE CONTEXT SO IT DOESN'T LINGER.
    // GAME AUDIO CREATES ITS OWN AudioContext SEPARATELY.
    if (this._atmosGain && this._atmosContext) {
      const FADE_OUT_SEC = 0.8;
      this._atmosGain.gain.setTargetAtTime(0, this._atmosContext.currentTime, FADE_OUT_SEC / 3);
      setTimeout(() => {
        this._stopAtmosphereSource();
        if (this._atmosContext) {
          this._atmosContext.close().catch(() => {});
          this._atmosContext = null;
          this._atmosBuffer  = null;
        }
        console.log('♫ Menu atmosphere stopped (fade-out complete)');
      }, FADE_OUT_SEC * 1000 + 200); // SMALL BUFFER AFTER FADE COMPLETES
    } else {
      // CONTEXT EXISTS BUT GAIN NODE DOESN'T (E.G. STILL LOADING) — CLOSE IMMEDIATELY
      this._stopAtmosphereSource();
      if (this._atmosContext) {
        this._atmosContext.close().catch(() => {});
        this._atmosContext = null;
        this._atmosBuffer  = null;
      }
    }
  }

  // ======================= STARFIELD ANIMATION =======================
  _animateStarfield() {
    const cockpit = this._cockpitImg;

    // FADE IN COCKPIT OVER ~1s WHILE MENU OPENS
    const FADE_MS = 1000;
    const fadeStart = performance.now();
    const fadeTick = (now) => {
      const t = Math.min((now - fadeStart) / FADE_MS, 1);
      if (cockpit) cockpit.style.opacity = t;
      if (t < 1) requestAnimationFrame(fadeTick);
    };
    requestAnimationFrame(fadeTick);

    this._starfield.opacity = 0;
    this._starfield.speed   = 3;
    this._starfield.start();

    this._lastTime = performance.now();
    const tick = (now) => {
      this._rafId = requestAnimationFrame(tick);
      const dt = Math.min((now - this._lastTime) / 1000, 0.05);
      this._lastTime = now;
      this._starfield.opacity = Math.min(this._starfield.opacity + dt * 1.2, 1); // MATCHES ~1s FADE
      this._starfield.update(dt);
      this._starfield.render();
    };
    this._rafId = requestAnimationFrame(tick);
  }

  // ======================= TUNNEL ANIMATION =======================
  _animateTunnel() {
    const tick = () => {
      this._rafId = requestAnimationFrame(tick);
      if (this._tunnel) {
        this._tunnel.update(0.016 * 0.35);
        this._tunnel.render();
      }
    };
    this._rafId = requestAnimationFrame(tick);
  }

  hide() {
    this._select('gameplay');
  }
}