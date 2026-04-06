// scenes/bossTransmission.js
const BOSS_TRANSMISSION_LINES = [
  'Commander Rosen, this is Deep Space Command.',
  "We're receiving your signal.",
  'Repeat, we are receiving your signal \u2014 we thought we lost you.',
  "We've mapped a non-Euclidean distortion intersecting your trajectory.",
  'A rupture in spacetime\u2026',
  '\u2026and something is forcing its way thr\u2014',
];

const CHAR_DELAY_MS    = 24;
const LINE_PAUSE_MS    = 250;
const GLITCH_DURATION  = 1400;   
const GLITCH_CHARS     = '@#$%!?*&<>|~^░▒▓▄▀■□Ξ≡≈±';

export class BossTransmission {

  constructor() {
    this._el      = document.getElementById('boss-terminal');
    this._textEl  = document.getElementById('boss-terminal-text');
    this._cursor  = document.getElementById('boss-terminal-cursor');
    this._lineEls = [];
    this._active  = false;
  }

  // ──────────────────── PUBLIC API ────────────────────

  /** BEGIN FULL TRANSMISSION SEQUENCE */
  play() {
    if (!this._el || this._active) return;
    this._active  = true;
    this._lineEls = [];
    this._textEl.textContent = '';

    // RESET ANY LEFTOVER GLITCH STATE
    this._el.style.transform   = 'translate(-50%, -50%)';
    this._el.style.borderColor = '';
    this._el.style.boxShadow   = '';
    this._el.style.opacity     = '0';
    this._el.classList.add('visible');

    // FADE IN
    requestAnimationFrame(() => {
      this._el.style.transition = 'opacity 0.5s ease';
      this._el.style.opacity    = '1';
    });

    this._runSequence();
  }

  /** IMMEDIATELY HIDE TERMINAL - CALLED WHEN BOSS ACTIVATES */
  hide() {
    if (!this._el) return;
    this._active = false;
    this._el.classList.remove('visible');
    this._el.style.opacity     = '0';
    this._el.style.transform   = 'translate(-50%, -50%)';
    this._el.style.borderColor = '';
    this._el.style.boxShadow   = '';
  }

  //  SEQUENCE 
  async _runSequence() {
    await this._wait(350); // BRIEF SETTLE AFTER FADE IN

    for (let i = 0; i < BOSS_TRANSMISSION_LINES.length; i++) {
      await this._typeLine(BOSS_TRANSMISSION_LINES[i]);
      if (i < BOSS_TRANSMISSION_LINES.length - 1) {
        await this._wait(LINE_PAUSE_MS);
      }
    }

    await this._glitch();

    if (this._active) this.hide();
  }

  //  TYPEWRITER 
  _typeLine(text) {
    return new Promise(resolve => {
      const lineEl = document.createElement('div');
      lineEl.className = 'opening-line';
      lineEl.textContent = '';
      this._textEl.appendChild(lineEl);
      this._lineEls.push(lineEl);
      this._textEl.scrollTop = this._textEl.scrollHeight;

      let i = 0;
      const type = () => {
        if (!this._active) { resolve(); return; }
        if (i < text.length) {
          lineEl.textContent += text[i++];
          this._textEl.scrollTop = this._textEl.scrollHeight;
          setTimeout(type, CHAR_DELAY_MS);
        } else {
          resolve();
        }
      };
      setTimeout(type, CHAR_DELAY_MS);
    });
  }

  //  GLITCH FINALE 

  _glitch() {
    return new Promise(resolve => {
      if (!this._active) { resolve(); return; }

      const startTime    = performance.now();
      const origTexts    = this._lineEls.map(el => el.textContent);
      const cursorChars  = ['█', '▓', '░', '▒', '|', '▄', '▀'];
      let   cursorIdx    = 0;

      const tick = (now) => {
        const elapsed  = now - startTime;
        const progress = Math.min(elapsed / GLITCH_DURATION, 1);

        if (elapsed >= GLITCH_DURATION || !this._active) {
          this._lineEls.forEach((el, i) => { el.textContent = origTexts[i]; });
          if (this._cursor) this._cursor.textContent = '█';
          this._el.style.transform   = 'translate(-50%, -50%)';
          this._el.style.borderColor = '';
          this._el.style.boxShadow   = '';
          resolve();
          return;
        }

        // GLITCH INTENSITY RAMPS UP OVER TIME 
        const intensity = Math.pow(progress, 0.7); 
        //CORRUPT RANDOM CHARACTERS IN RANDOM LINES
        if (Math.random() < 0.55 + intensity * 0.45) {
          const lineIdx = Math.floor(Math.random() * this._lineEls.length);
          const el      = this._lineEls[lineIdx];
          const orig    = origTexts[lineIdx];
          let   glitched = '';

          for (let i = 0; i < orig.length; i++) {
            glitched += Math.random() < intensity * 0.45
              ? GLITCH_CHARS[Math.floor(Math.random() * GLITCH_CHARS.length)]
              : orig[i];
          }
          el.textContent = glitched;

          // BRIEFLY FLASH THEN RESTORE
          const restoreMs = 40 + Math.random() * 60;
          setTimeout(() => {
            if (el && origTexts[lineIdx] !== undefined) el.textContent = origTexts[lineIdx];
          }, restoreMs);
        }

        //  CURSOR GOING CRAZY 
        if (this._cursor && Math.random() < 0.5 + intensity * 0.5) {
          cursorIdx = (cursorIdx + 1) % cursorChars.length;
          this._cursor.textContent = cursorChars[cursorIdx];
        }

        // SCREEN SHAKE - INCREASES
        const shakeAmt = intensity * 5;
        const dx = (Math.random() - 0.5) * shakeAmt;
        const dy = (Math.random() - 0.5) * shakeAmt;
        this._el.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;

        //  COLOR SHIFT: GREEN > AMBER > RED
        const r   = Math.floor(103  + intensity * 152);
        const g   = Math.floor(254  - intensity * 224);
        const b   = Math.floor(189  - intensity * 189);
        const glow = 18 + intensity * 28;
        this._el.style.borderColor = `rgba(${r}, ${g}, ${b}, 0.7)`;
        this._el.style.boxShadow   =
          `0 0 ${glow}px rgba(${r}, ${g}, ${b}, 0.35), ` +
          `0 0 2px rgba(${r}, ${g}, ${b}, 0.6), ` +
          `inset 0 1px 0 rgba(${r}, ${g}, ${b}, 0.08)`;

        // FLICKER OPACITY (FAST / LATE PHASE)
        if (progress > 0.55 && Math.random() < intensity * 0.35) {
          this._el.style.opacity = `${0.3 + Math.random() * 0.7}`;
        } else if (progress <= 0.85) {
          this._el.style.opacity = '1';
        }

        // FINAL FADE OUT
        if (progress > 0.78) {
          const fadeT = (progress - 0.78) / 0.22;
          this._el.style.opacity = `${Math.max(0, 1 - fadeT)}`;
        }

        requestAnimationFrame(tick);
      };

      requestAnimationFrame(tick);
    });
  }

  _wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}