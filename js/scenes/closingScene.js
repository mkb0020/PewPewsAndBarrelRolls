// scenes/closingScene.js
const CREDITS = [
  { role: null,   name: 'WORMHOLES'               },  
  { role: null,   name: 'ALL THE WAY DOWN'        },  
  { role: null,   name: null                      },  
  { role: 'Concept · Art · Music · SFX',  name: 'MK'      },
  { role: 'Chief Space Tunnel Officer',   name: 'Claude'   },
  { role: 'Director, Worm Physics Lab',   name: 'ChatGPT'  },
  { role: 'Head of Chaos Department',     name: 'Grok'     },
];

const BURST_FLASH_DELAY    = 0.7;
const BURST_FLASH_DURATION = 13;
const WARP_SPEED_START     = 2;
const WARP_SPEED_END       = 7;
const WARP_DECEL_DURATION  = 3.5;
const VICTORY_FADE_START   = 14;
const VICTORY_FADE_END = 22; 
const CREDITS_FADE_START   = 23; 
const CREDITS_LINE_INTERVAL = 2;   
const CREDITS_FADE_EACH    = 2;    

export class ClosingScene {

  /**
   * @param {import('../visuals/starfieldScene.js').StarfieldScene} starfield
   * @param {import('../visuals/tunnel.js').Tunnel}                 tunnel
   * @param {import('../utils/audio.js').AudioManager}              audio
   */
  constructor(starfield, tunnel, audio) {
    this._starfield = starfield;
    this._tunnel    = tunnel;
    this._audio     = audio;

    this._active    = false;
    this._elapsed   = 0;

    this._flashAlpha  = 0;
    this._flashActive = false;

    // DOM REFS
    this._creditsEl    = document.getElementById('closing-credits');
    this._creditLines  = [];  
    this._victoryStarted  = false;
    this._creditsStarted  = false;
    this._linesRevealed   = 0;

    console.log('✔ ClosingScene initialized');
  }

  //  PUBLIC API 
  isActive() { return this._active; }
  start(finalScore = 0) {
    if (this._active) return;
    this._active    = true;
    this._elapsed   = 0;
    this._finalScore = finalScore;

    this._flashAlpha  = 0;
    this._flashActive = false;
    this._flashPending = true; 

    this._starfield.speed   = WARP_SPEED_START;
    this._starfield.opacity = 0;
    this._starfield.start();

    this._creditsStarted = false;
    this._linesRevealed  = 0;
    this._buildCreditLines();

    this._audio?.stopMusic();
    setTimeout(() => this._audio?.startCreditsMusic(), 6800);

    console.log('★ ClosingScene started');
}

  /**
   * CALLED EVERY FRAME FROM MAIN GAME LOOP
   * @param {number} dt  
   */
  update(dt) {
    if (!this._active) return;

    this._elapsed += dt;

    // ── BURST FLASH DELAY + FADE ──
    if (this._flashPending && this._elapsed >= BURST_FLASH_DELAY) {
      this._flashPending = false;
      this._flashAlpha   = 1.0;
      this._flashActive  = true;
    }
    if (this._flashActive) {
      this._flashAlpha -= dt / BURST_FLASH_DURATION;
      if (this._flashAlpha <= 0) {
        this._flashAlpha  = 0;
        this._flashActive = false;
      }
    }

    const warpT = Math.min(this._elapsed / WARP_DECEL_DURATION, 1);
    this._starfield.speed = WARP_SPEED_START + (WARP_SPEED_END - WARP_SPEED_START) * easeOut(warpT);

    this._starfield.opacity = Math.max(0, Math.min((this._elapsed - BURST_FLASH_DELAY) / BURST_FLASH_DURATION, 1));

    this._starfield.update(dt);

    if (!this._victoryStarted && this._elapsed >= VICTORY_FADE_START) {
      this._victoryStarted = true;
      this._showVictoryText();
    }
    if (this._victoryStarted && this._elapsed >= VICTORY_FADE_END) {
      document.getElementById('closing-victory')?.classList.remove('visible');
    }

    if (!this._creditsStarted && this._elapsed >= CREDITS_FADE_START) {
      this._creditsStarted = true;
      this._creditsEl?.classList.add('visible');
      this._revealNextLine();
    }
  }

  /**
    DRAWS BURST FLASH OVERLAY ON 2D CANVAS
   * @param {CanvasRenderingContext2D} ctx
   */
  renderFlash(ctx) {
    if (!this._active || this._flashAlpha <= 0) return;
    ctx.save();
    ctx.globalAlpha = this._flashAlpha;
    ctx.fillStyle   = '#dac1f8';
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.restore();
  }

  shouldRenderStarfield() {
    return this._active;
  }

  get shouldHideTunnel() { return this._active && !this._flashPending; }

  _showVictoryText() {
    const el = document.getElementById('closing-victory');
    if (!el) return;
    el.querySelector('#victory-score').textContent = 
      'SCORE: ' + this._finalScore.toLocaleString();
    el.classList.add('visible');
  }

  _buildCreditLines() {
    if (!this._creditsEl) return;
    this._creditsEl.innerHTML = '';
    this._creditsEl.classList.remove('visible');
    this._creditLines = [];

    for (const entry of CREDITS) {
      const lineEl = document.createElement('div');

      if (!entry.role && !entry.name) {
        // SPACER
        lineEl.className = 'credit-spacer';
      } else if (!entry.role) {
        // TITLE / SUBTITLE
        lineEl.className = 'credit-title-line';
        lineEl.textContent = entry.name;
      } else {
        // NORMAL CREDIT
        lineEl.className = 'credit-entry';
        const roleEl = document.createElement('span');
        roleEl.className   = 'credit-role';
        roleEl.textContent = entry.role;
        const nameEl = document.createElement('span');
        nameEl.className   = 'credit-name';
        nameEl.textContent = entry.name;
        lineEl.appendChild(roleEl);
        lineEl.appendChild(nameEl);
      }

      lineEl.classList.add('credit-hidden');
      this._creditsEl.appendChild(lineEl);
      this._creditLines.push(lineEl);
    }
  }

  _revealNextLine() {
    if (this._linesRevealed >= this._creditLines.length) return;

    const el = this._creditLines[this._linesRevealed];
    el.classList.remove('credit-hidden');
    el.classList.add('credit-visible');
    this._linesRevealed++;

    if (this._linesRevealed < this._creditLines.length) {
      setTimeout(() => this._revealNextLine(), CREDITS_LINE_INTERVAL * 1000);
    }
  }
}

function easeOut(t) {
  return 1 - Math.pow(1 - t, 3);
}