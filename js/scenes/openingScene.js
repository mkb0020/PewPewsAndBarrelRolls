// scenes/openingScene.js
const TRANSMISSION_LINES = [
  'This is Deep Space Command.',
  'Commander Rosen has crossed the event horizon.',
  'Gravitational interference increasing.',
  'Signal integrity failing\u2026',
  'We\'ve lost all communication.',
];

// TYPING SPEED - AND PAUSE BETWEEN LINES
const CHAR_DELAY_MS   = 42;
const LINE_PAUSE_MS   = 520;
const HOLD_AFTER_MS   = 2200;  
const FADE_DURATION_S = 1.4;  

export class OpeningScene {

  /**
   * @param {import('../visuals/starfieldScene.js').StarfieldScene} starfield
   */
  constructor(starfield, audio) {
    this._starfield  = starfield;
    this._audio      = audio;
    this._active     = false;
    this._rafId      = null;
    this._resolve    = null;
    this._lastTime   = 0;
    this._stopStatic = null;  

    // DOM ELEMENTS — CREATED ONCE, HIDDEN UNTIL play()
    this._cockpitImg   = document.getElementById('opening-cockpit');
    this._terminalEl   = document.getElementById('opening-terminal');
    this._terminalText = document.getElementById('opening-terminal-text');

    console.log('✔ OpeningScene initialized');
  }

  // ======================== PUBLIC API ========================

  /**
   * RUN FULL OPENING SEQUENCE
   * @returns {Promise<void>}  
   */
  play() {
    this._active = true;

    this._starfield.speed   = 3;
    this._starfield.opacity = 0;
    this._starfield.start();

    // CUT MENU MUSIC, START STATIC LOOP
    this._audio?.stopMusic();
    this._stopStatic = this._audio?.startLoopStatic() ?? null;

    // SELF-CONTAINED RENDER LOOP 
    this._lastTime = performance.now();
    const tick = (now) => {
      if (!this._active) return;
      const dt = Math.min((now - this._lastTime) / 1000, 0.05);
      this._lastTime = now;
      this._starfield.update(dt);
      this._starfield.render();
      this._rafId = requestAnimationFrame(tick);
    };
    this._rafId = requestAnimationFrame(tick);

    return new Promise(resolve => {
      this._resolve = resolve;
      this._runSequence();
    });
  }

  /** Remove the two old update/render/isActive methods — loop is self-contained */
  isActive() { return this._active; }

  _stopLoop() {
    cancelAnimationFrame(this._rafId);
    this._rafId = null;
  }

  // ======================== SEQUENCE ========================

  async _runSequence() {
    // ── PHASE 1: FADE IN STARS + COCKPIT ──
    await this._fadeIn(FADE_DURATION_S);

    // ── PHASE 2: SHOW TERMINAL, START TYPEWRITER ──
    this._showTerminal();
    await this._typeAllLines();

    // ── PHASE 3: HOLD ──
    await this._wait(HOLD_AFTER_MS);

    // ── PHASE 4: FADE OUT ──
    this._hideTerminal();
    await this._fadeOut(FADE_DURATION_S);

    // ── DONE ──
    this._stopLoop();
    this._starfield.stop();
    this._stopStatic?.();
    this._stopStatic = null;
    this._audio?.startWaveMusic(0);  // WAVE 1 MUSIC KICKS OFF
    this._active = false;
    this._resolve?.();
  }

  // ======================== FADE HELPERS ========================

  _fadeIn(durationSec) {
    return new Promise(resolve => {
      const start = performance.now();
      const tick  = (now) => {
        const t = Math.min((now - start) / (durationSec * 1000), 1);
        this._starfield.opacity = t;
        if (this._cockpitImg) this._cockpitImg.style.opacity = t;
        if (t < 1) {
          requestAnimationFrame(tick);
        } else {
          resolve();
        }
      };
      requestAnimationFrame(tick);
    });
  }

  _fadeOut(durationSec) {
    return new Promise(resolve => {
      const start = performance.now();
      const tick  = (now) => {
        const t = Math.min((now - start) / (durationSec * 1000), 1);
        this._starfield.opacity = 1 - t;
        if (this._cockpitImg) this._cockpitImg.style.opacity = 1 - t;
        if (t < 1) {
          requestAnimationFrame(tick);
        } else {
          if (this._cockpitImg) this._cockpitImg.style.opacity = 0;
          resolve();
        }
      };
      requestAnimationFrame(tick);
    });
  }

  // ======================== TERMINAL ========================

  _showTerminal() {
    if (!this._terminalEl) return;
    this._terminalText.textContent = '';
    this._terminalEl.classList.add('visible');
  }

  _hideTerminal() {
    if (!this._terminalEl) return;
    this._terminalEl.classList.remove('visible');
  }

  async _typeAllLines() {
    for (const line of TRANSMISSION_LINES) {
      await this._typeLine(line);
      await this._wait(LINE_PAUSE_MS);
    }
  }

  _typeLine(text) {
    return new Promise(resolve => {
      let i = 0;
      const el = this._terminalText;

      // INSERT NEW LINE ELEMENT
      const lineEl = document.createElement('div');
      lineEl.className = 'opening-line';
      lineEl.textContent = '';
      el.appendChild(lineEl);
      el.scrollTop = el.scrollHeight;

      const type = () => {
        if (i < text.length) {
          lineEl.textContent += text[i++];
          el.scrollTop = el.scrollHeight;
          setTimeout(type, CHAR_DELAY_MS);
        } else {
          resolve();
        }
      };
      setTimeout(type, CHAR_DELAY_MS);
    });
  }

  _wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}