// UPDATED 3/15/26 @ 10PM
// scenes/openingScene.js
const TRANSMISSION_LINES = [
  'This is Deep Space Command.',
  'Commander Rosen has crossed the event horizon.',
  'Gravitational interference increasing.',
  'Signal integrity failing\u2026',
  'We\'ve lost all communication...',
];


// TYPING SPEED - AND PAUSE BETWEEN LINES
const CHAR_DELAY_MS   = 42;
const LINE_PAUSE_MS   = 520;
const HOLD_AFTER_MS   = 4500;  
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
   * @param {boolean} skipFadeIn  
   * @returns {Promise<void>}  
   */
  play(skipFadeIn = false) {
    this._active = true;

    if (!skipFadeIn) {
      this._starfield.speed   = 3;
      this._starfield.opacity = 0;
      this._starfield.start();
    }

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
      this._runSequence(skipFadeIn);
    });
  }

  /** Remove the two old update/render/isActive methods — loop is self-contained */
  isActive() { return this._active; }

  _stopLoop() {
    cancelAnimationFrame(this._rafId);
    this._rafId = null;
  }

  // ======================== SEQUENCE ========================
  async _runSequence(skipFadeIn = false) {
    // ── PHASE 1: FADE IN STARS + COCKPIT ──
    if (!skipFadeIn) {
      await this._fadeIn(FADE_DURATION_S);
    }

    // ── PHASE 2: SHOW TERMINAL, START TYPEWRITER ──
    this._showTerminal();
    await this._typeAllLines();

    // ── PHASE 3-11: TRANSITION SEQUENCE ──
    await this._runTransitionSequence();

    this._stopLoop();
    this._starfield.stop();
    this._stopStatic?.();
    this._stopStatic = null;
    this._audio?.startWaveMusic(0);  // WAVE 1 MUSIC KICKS OFF
    this._active = false;
    this._resolve?.();
  }

  async _runTransitionSequence() {
    await this._signalCorruption();
    this._activateScanlineGlitch();
    this._activateCockpitFlicker();
    await this._starfieldAcceleration();
    await this._glitchBars();
    this._activateScreenShake();
    await this._starfieldCollapse();
    await this._whiteFlash();
    this._hideCockpit();
  }

  async _signalCorruption() {
    const lines = this._terminalText.querySelectorAll('.opening-line');
    if (lines.length > 0) {
      const lastLine = lines[lines.length - 1];
      this._glitchText(lastLine);
      await this._wait(800);
    }
  }

  _activateScanlineGlitch() {
    const glitchEl = document.getElementById('glitch-lines');
    if (glitchEl) glitchEl.style.display = 'block';
  }

  _activateCockpitFlicker() {
    if (this._cockpitImg) this._cockpitImg.classList.add('power-flicker');
  }

  async _starfieldAcceleration() {
    this._starfield.speed = 25;
    await this._wait(300);
    this._starfield.speed = 80;
    await this._wait(500);
  }

  async _glitchBars() {
    const canvas = document.getElementById('game-canvas');
    const ctx = canvas.getContext('2d');
    const duration = 1000;
    const start = performance.now();

    const tick = (now) => {
      const elapsed = now - start;
      if (elapsed > duration) return;

      this._drawGlitchBars(ctx, canvas.width, canvas.height);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    await this._wait(duration);
  }

  _activateScreenShake() {
    const canvas = document.getElementById('game-canvas');
    if (canvas) canvas.classList.add('shake');
  }

  async _starfieldCollapse() {
    this._starfield.speed = 150;
    await this._wait(800);
  }

  async _whiteFlash() {
    const canvas = document.getElementById('game-canvas');
    const originalBg = canvas.style.background;
    canvas.style.background = 'white';
    await this._wait(80);
    canvas.style.background = originalBg;
  }

  _hideCockpit() {
    if (this._cockpitImg) this._cockpitImg.style.display = 'none';
    this._hideTerminal();
    const glitchEl = document.getElementById('glitch-lines');
    if (glitchEl) glitchEl.style.display = 'none';
    const canvas = document.getElementById('game-canvas');
    if (canvas) canvas.classList.remove('shake');
  }

  _glitchText(el) {
    const chars = "!@#$%^&*█▒░<>/\\";
    const original = el.textContent;
    let iterations = 0;
    const interval = setInterval(() => {
      el.textContent = original
        .split("")
        .map(c => Math.random() < 0.25 ? chars[Math.floor(Math.random() * chars.length)] : c)
        .join("");
      iterations++;
      if (iterations > 10) {
        clearInterval(interval);
        el.textContent = original;
      }
    }, 40);
  }

  _drawGlitchBars(ctx, width, height) {
    const bars = Math.floor(Math.random() * 8);
    for (let i = 0; i < bars; i++) {
      const y = Math.random() * height;
      const h = Math.random() * 6 + 2;
      ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.35})`;
      ctx.fillRect(-20, y, width + 40, h);
    }
  }

  _wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
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