// menu.js
import { setMobileMode } from '../utils/controls.js';

const DEV_MODE = true;

export class Menu {
  constructor() {
    this._overlay      = document.getElementById('menu-overlay');
    this._resolve      = null;
    this._tunnel       = null;
    this._rafId        = null;
    this._onKey        = null;
    this._deviceScreen = null;

    this._atmosContext = null;  
    this._atmosSource  = null;  
    this._atmosGain    = null; 
    this._atmosBuffer  = null;  
    this._atmosRawProm = null;  

    if (DEV_MODE) this._overlay?.classList.add('dev-mode');
  }

  // ======================= PUBLIC: SHOW =======================
  show(tunnel, onStart) {
    this._tunnel  = tunnel;
    this._onStart = onStart ?? null; // CALLED SYNCHRONOUSLY INSIDE THE GAME MODE CLICK — WHILE STILL IN USER GESTURE

    if (!this._overlay) {
      console.error('[Menu] #menu-overlay not found in DOM');
      return Promise.resolve({ mode: 'bossBattle', enemyCount: 5 });
    }

    this._buildDeviceScreen();
    this._animateTunnel();

    if (!this._atmosRawProm) {
      this._atmosRawProm = fetch('./audio/menuAtmosphere.m4a')
        .then(r  => r.arrayBuffer())
        .catch(e => { console.warn('⚠ Atmosphere prefetch failed:', e); return null; });
    }

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        this._overlay.classList.add('visible');
        setTimeout(() => this._deviceScreen?.classList.add('visible'), 180);
      });
    });

    return new Promise(resolve => { this._resolve = resolve; });
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

    // UNLOCK AUDIO HERE — THIS IS THE EARLIEST USER GESTURE IN THE GAME.
    // MUST BE CALLED SYNCHRONOUSLY INSIDE THE CLICK HANDLER (NOT AFTER AN AWAIT)
    // SO IOS SAFARI RECOGNISES IT AS PART OF THE GESTURE AND RESUMES THE CONTEXT.
    if (this._onStart) { this._onStart(); this._onStart = null; }

    this._startAtmosphere();
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

    if (this._onStart) { this._onStart(); this._onStart = null; } // FALLBACK — NORMALLY FIRED IN _onDeviceSelect

    this._stopAtmosphere();

    this._overlay?.classList.remove('visible');
    window.removeEventListener('keydown', this._onKey);
    cancelAnimationFrame(this._rafId);

    setTimeout(() => {
      this._overlay?.classList.add('hidden');
      this._resolve({ mode, enemyCount });
    }, 650);
  }

  // ======================= ATMOSPHERE AUDIO =======================
  _startAtmosphere() {
    // IOS FIX: NO async/await HERE — this is called synchronously inside _onDeviceSelect
    // which is a user gesture click handler. Any await would break the gesture trust
    // chain and cause the AudioContext to remain suspended on iOS Safari.
    try {
      if (!this._atmosContext) {
        this._atmosContext = new (window.AudioContext || window.webkitAudioContext)();
      }
      // FIRE-AND-FORGET 
      if (this._atmosContext.state === 'suspended') {
        this._atmosContext.resume().catch(() => {});
      }

      // DECODE AND PLAY ASYNCHRONOUSLY 
      const doPlay = (arrayBuf) => {
        if (!arrayBuf) return;
        this._atmosContext.decodeAudioData(arrayBuf).then(buffer => {
          this._atmosBuffer = buffer;
          this._stopAtmosphereSource();

          const source    = this._atmosContext.createBufferSource();
          source.buffer   = this._atmosBuffer;
          source.loop     = true; // SAMPLE-ACCURATE GAPLESS LOOP

          const gain      = this._atmosContext.createGain();
          gain.gain.value = 0.6;

          source.connect(gain);
          gain.connect(this._atmosContext.destination);
          source.start(0);

          this._atmosSource = source;
          this._atmosGain   = gain;
          console.log('♫ Menu atmosphere started (gapless loop)');
        }).catch(e => console.warn('⚠ Atmosphere decode failed:', e));
      };

      if (this._atmosBuffer) {
        this._stopAtmosphereSource();
        const source    = this._atmosContext.createBufferSource();
        source.buffer   = this._atmosBuffer;
        source.loop     = true;
        const gain      = this._atmosContext.createGain();
        gain.gain.value = 0.6;
        source.connect(gain);
        gain.connect(this._atmosContext.destination);
        source.start(0);
        this._atmosSource = source;
        this._atmosGain   = gain;
      } else {
        this._atmosRawProm.then(doPlay).catch(() => {});
      }
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
    this._stopAtmosphereSource();  // CLOSE THE CONTEXT SO IT DOESN'T LINGER — GAME AUDIO CREATES ITS OWN
    if (this._atmosContext) {
      this._atmosContext.close().catch(() => {});
      this._atmosContext = null;
      this._atmosBuffer  = null;
    }
    console.log('♫ Menu atmosphere stopped');
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