// scenes/closingScene.js

//  CREDITS DATA 
const CREDITS = [
  { role: null,   name: 'WORMHOLE'               },  
  { role: null,   name: 'ALL THE WAY DOWN'        },  
  { role: null,   name: null                      },  
  { role: 'Concept · Art · Music · SFX',  name: 'MK'      },
  { role: 'Chief Space Tunnel Officer',   name: 'Claude'   },
  { role: 'Director, Worm Physics Lab',   name: 'ChatGPT'  },
  { role: 'Head of Chaos Department',     name: 'Grok'     },
];

//  TIMING 
const BURST_FLASH_DURATION = 0.45;
const WARP_SPEED_START     = 28;
const WARP_SPEED_END       = 3.5;
const WARP_DECEL_DURATION  = 3.2;
const CREDITS_FADE_START   = 5;
const CREDITS_LINE_INTERVAL = 3;   
const CREDITS_FADE_EACH    = 1;    

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

    // BURST FLASH STATE — drawn on 2D canvas
    this._flashAlpha  = 0;
    this._flashActive = false;

    // DOM REFS
    this._creditsEl    = document.getElementById('closing-credits');
    this._creditLines  = [];  

    this._creditsStarted  = false;
    this._linesRevealed   = 0;

    console.log('✔ ClosingScene initialized');
  }

  //  PUBLIC API 
  isActive() { return this._active; }
  start() {
    if (this._active) return;
    this._active  = true;
    this._elapsed = 0;

    // START BURST
    this._flashAlpha  = 1.0;
    this._flashActive = true;

    // STARFIELD 
    this._starfield.speed   = WARP_SPEED_START;
    this._starfield.opacity = 0;
    this._starfield.start();

    this._creditsStarted = false;
    this._linesRevealed  = 0;
    this._buildCreditLines();

    this._audio?.stopMusic();
    this._audio?.startCreditsMusic();

    console.log('★ ClosingScene started');
  }

  /**
   * Called every frame from the main game loop.
   * @param {number} dt  delta time seconds
   */
  update(dt) {
    if (!this._active) return;

    this._elapsed += dt;

    // ── BURST FLASH FADE ──
    if (this._flashActive) {
      this._flashAlpha -= dt / BURST_FLASH_DURATION;
      if (this._flashAlpha <= 0) {
        this._flashAlpha  = 0;
        this._flashActive = false;
      }
    }

    // ── WARP DECELERATION ──
    const warpT = Math.min(this._elapsed / WARP_DECEL_DURATION, 1);
    this._starfield.speed = WARP_SPEED_START + (WARP_SPEED_END - WARP_SPEED_START) * easeOut(warpT);

    // ── STARFIELD FADE IN ── 
    this._starfield.opacity = Math.min(this._elapsed / BURST_FLASH_DURATION, 1);

    // ── STARFIELD UPDATE ──
    this._starfield.update(dt);

    // ── CREDITS REVEAL ──
    if (!this._creditsStarted && this._elapsed >= CREDITS_FADE_START) {
      this._creditsStarted = true;
      this._creditsEl?.classList.add('visible');
      this._revealNextLine();
    }
  }

  /**
   * Draws the burst flash overlay on the 2D canvas.
   * Call this AFTER all other 2D draws so the flash sits on top.
   * @param {CanvasRenderingContext2D} ctx
   */
  renderFlash(ctx) {
    if (!this._active || this._flashAlpha <= 0) return;
    ctx.save();
    ctx.globalAlpha = this._flashAlpha;
    ctx.fillStyle   = '#ffffff';
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.restore();
  }

  shouldRenderStarfield() {
    return this._active;
  }

  //  CREDITS 

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

      // ALL LINES START INVISIBLE
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

//  HELPERS 
function easeOut(t) {
  return 1 - Math.pow(1 - t, 3);
}