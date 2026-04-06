// Updated 3/12/26 @ 2AM
// tentacleLab.js — TENTACLE PARAMETER TUNING SANDBOX
import { CONFIG }          from '../utils/config.js';
import { TentacleSystem }  from '../entities/tentacles.js';
import { ImageLoader }     from '../utils/imageLoader.js';


const PARAMS = [
  // ── STRUCTURE ──────────────────────────────────────────────────────────────
  { key: 'TENTACLE_COUNT',              label: 'Count',           min: 1,    max: 8,    step: 1,    rebuild: true },
  { key: 'TENTACLE_SEGMENTS',           label: 'Segments',        min: 2,    max: 14,   step: 1,    rebuild: true },
  { key: 'TENTACLE_SEGMENT_LENGTH',     label: 'Seg Length',      min: 3,    max: 70,   step: 0.5,  live: 'segLen' },
  { key: 'TENTACLE_BASE_WIDTH',         label: 'Base Width',      min: 2,    max: 50,   step: 0.5,  live: 'baseWidth' },
  // ── MOTION ────────────────────────────────────────────────────────────────
  { key: 'TENTACLE_CURL_STRENGTH',      label: 'Curl Strength',   min: 0,    max: 2.0,  step: 0.01, live: 'curlStr' },
  { key: 'TENTACLE_MAX_BEND',           label: 'Max Bend (°)',    min: 10,   max: 180,  step: 1,    live: '_maxBendDeg' },
  { key: 'TENTACLE_ANCHOR_SWAY',        label: 'Anchor Sway',     min: 0,    max: 30,   step: 0.5,  live: 'anchorSway' },
  // ── ANCHORING ─────────────────────────────────────────────────────────────
  { key: 'TENTACLE_ANCHOR_RADIUS',      label: 'Anchor Radius',   min: 0,    max: 100,  step: 0.5,  live: 'anchorRad' },
  { key: 'TENTACLE_ANCHOR_Y_OFFSET',    label: 'Anchor Y Offset', min: -30,  max: 80,   step: 0.5,  live: 'anchorYOff' },
  // ── TIP PHYSICS ───────────────────────────────────────────────────────────
  { key: 'TENTACLE_TIP_GRAVITY',        label: 'Tip Gravity',     min: 0,    max: 250,  step: 1,    live: 'tipGravity' },
  { key: 'TENTACLE_TIP_STIFFNESS',      label: 'Tip Stiffness',   min: 1,    max: 25,   step: 0.5,  live: 'tipStiffness' },
  { key: 'TENTACLE_TIP_DRAG',           label: 'Tip Drag',        min: 0.70, max: 0.99, step: 0.01, live: 'tipDrag' },
  { key: 'TENTACLE_TIP_BIAS',           label: 'Tip Bias',        min: 0,    max: 150,  step: 1,    live: '_tipBias' },
  // ── REPULSION ─────────────────────────────────────────────────────────────
  { key: 'TENTACLE_TIP_REPEL_RADIUS',   label: 'Tip Repel Rad',   min: 10,   max: 150,  step: 1,    live: 'tipRepelRad' },
  { key: 'TENTACLE_TIP_REPEL_STRENGTH', label: 'Tip Repel Str',   min: 50,   max: 1000, step: 5,    live: 'tipRepelStr' },
  { key: 'TENTACLE_REPEL_RADIUS',       label: 'Body Repel Rad',  min: 5,    max: 150,  step: 1,    live: 'repelRadius' },
  { key: 'TENTACLE_REPEL_STRENGTH',     label: 'Body Repel Str',  min: 50,   max: 1000, step: 5,    live: 'repelStr' },
];

const SECTION_BEFORE = {
  TENTACLE_CURL_STRENGTH:    '── MOTION ──',
  TENTACLE_ANCHOR_RADIUS:    '── ANCHORING ──',
  TENTACLE_TIP_GRAVITY:      '── TIP PHYSICS ──',
  TENTACLE_TIP_REPEL_RADIUS: '── REPULSION ──',
};

// DISPLAY NAMES FOR THE THREE OCTOPUS ENEMY TYPES
const TYPE_INFO = {
  ZIGZAG:   { label: 'Phil',     emoji: '🔵', sprite: 'quadropus' },
  FAST:     { label: 'ZipZap',   emoji: '🟣', sprite: 'quadropus' },
  FLIMFLAM: { label: 'FlimFlam', emoji: '🟠', sprite: 'quadropus' },
};

// ── PANEL CSS ─────────────────────────────────────────────────────────────────
const PANEL_CSS = `
  #tlab-panel {
    position: fixed; top: 0; right: 0;
    width: 450px; height: 100vh;
    background: rgba(4, 0, 18, 0.94);
    border-left: 1px solid #261640;
    color: #c0aaff;
    font-family: 'Courier New', monospace;
    font-size: 11px;
    display: flex; flex-direction: column;
    z-index: 9999;
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    box-shadow: -4px 0 24px rgba(0,0,0,0.6);
  }
  #tlab-header {
    padding: 10px 12px 8px;
    border-bottom: 1px solid #261640;
    flex-shrink: 0;
  }
  #tlab-title {
    font-size: 13px; font-weight: bold;
    color: #e8d8ff; letter-spacing: 3px;
    text-transform: uppercase; margin-bottom: 8px;
  }
  #tlab-type-btns { display: flex; gap: 5px; }
  .tlab-type-btn {
    flex: 1;
    background: rgba(70,35,110,0.3);
    border: 1px solid #3a1f66;
    color: #a090dd;
    font-family: 'Courier New', monospace;
    font-size: 10px;
    padding: 4px 3px;
    cursor: pointer; border-radius: 3px;
    transition: all 0.15s; text-align: center;
    white-space: nowrap; overflow: hidden;
  }
  .tlab-type-btn:hover { background: rgba(100,55,160,0.45); border-color: #6040aa; color: #d0c0ff; }
  .tlab-type-btn.active {
    background: rgba(130,70,210,0.5);
    border-color: #9060ee; color: #fff;
    box-shadow: 0 0 7px rgba(150,90,255,0.45);
  }
  #tlab-sliders {
    flex: 1; overflow-y: auto;
    padding: 4px 10px 8px;
  }
  #tlab-sliders::-webkit-scrollbar { width: 4px; }
  #tlab-sliders::-webkit-scrollbar-track { background: #08001a; }
  #tlab-sliders::-webkit-scrollbar-thumb { background: #3d2070; border-radius: 2px; }
  .tlab-section {
    color: #5a4a9a; font-size: 9px;
    letter-spacing: 1px; text-transform: uppercase;
    margin: 8px 0 4px;
    border-top: 1px solid #180a36;
    padding-top: 6px;
  }
  .tlab-row {
    display: grid;
    grid-template-columns: 100px 1fr 44px;
    align-items: center; gap: 5px;
    margin-bottom: 5px;
  }
  .tlab-row label { color: #9a8aee; font-size: 10px; white-space: nowrap; }
  .tlab-row input[type=range] {
    -webkit-appearance: none; appearance: none;
    height: 3px; background: #22124a;
    border-radius: 2px; outline: none; cursor: pointer;
  }
  .tlab-row input[type=range]::-webkit-slider-thumb {
    -webkit-appearance: none; appearance: none;
    width: 11px; height: 11px; border-radius: 50%;
    background: #8855d8; cursor: pointer;
    box-shadow: 0 0 5px rgba(150,90,255,0.65);
    transition: background 0.1s;
  }
  .tlab-row input[type=range]:hover::-webkit-slider-thumb { background: #aa77ff; }
  .tlab-val { color: #e0d0ff; text-align: right; font-size: 10px; font-weight: bold; }
  #tlab-footer {
    padding: 8px 10px; border-top: 1px solid #261640;
    display: flex; gap: 6px; flex-shrink: 0;
  }
  .tlab-btn {
    flex: 1;
    background: rgba(70,35,110,0.4);
    border: 1px solid #4a2a8a;
    color: #b8a8ee;
    font-family: 'Courier New', monospace;
    font-size: 10px; padding: 5px 4px;
    cursor: pointer; border-radius: 3px;
    text-transform: uppercase; letter-spacing: 1px;
    transition: all 0.15s;
  }
  .tlab-btn:hover { background: rgba(110,60,170,0.5); border-color: #8060cc; color: #fff; }
  .tlab-btn.copy  { border-color: #2a7a3a; color: #70e890; }
  .tlab-btn.copy:hover { background: rgba(30,100,50,0.4); border-color: #50cc70; color: #aaffc0; }
  #tlab-toast {
    position: fixed; bottom: 28px; left: calc(50% - 290px/2);
    transform: translateX(-50%);
    background: rgba(30,160,60,0.92);
    color: #000; padding: 6px 16px; border-radius: 5px;
    font-family: 'Courier New', monospace; font-size: 11px; font-weight: bold;
    pointer-events: none; opacity: 0;
    transition: opacity 0.25s;
    z-index: 10000; white-space: nowrap;
  }
  #tlab-toast.show { opacity: 1; }
`;

// ─────────────────────────────────────────────────────────────────────────────
export class TentacleLab {
  constructor(canvas, ctx) {
    this._canvas  = canvas;
    this._ctx     = ctx;
    this._rafId   = null;
    this._time    = 0;
    this._lastNow = performance.now();

    this._type   = 'ZIGZAG';
    this._enemy  = null;
    this._system = null;

    this._panel   = null;
    this._toast   = null;
    this._sliders = {};          // key → { input, valueEl, param }
    this._pendingRebuild = false;

    // BIND TICK SO addEventListener CLEANUP WORKS
    this._tick = this._tick.bind(this);
  }

  // ─── PUBLIC ──────────────────────────────────────────────────────────────
  start() {
    this._injectStyles();
    this._buildPanel();
    this._rebuildEnemy();
    this._rafId = requestAnimationFrame(this._tick);
  }

  stop() {
    cancelAnimationFrame(this._rafId);
    this._panel?.remove();
    this._toast?.remove();
    document.getElementById('_tlab-style')?.remove();
  }

  // ─── STYLES ───────────────────────────────────────────────────────────────
  _injectStyles() {
    const el = document.createElement('style');
    el.id    = '_tlab-style';
    el.textContent = PANEL_CSS;
    document.head.appendChild(el);
  }

  // ─── DOM PANEL ────────────────────────────────────────────────────────────
  _buildPanel() {
    const panel = document.createElement('div');
    panel.id = 'tlab-panel';

    // HEADER — TITLE + TYPE SELECTOR
    const typeBtns = Object.entries(TYPE_INFO).map(([t, info]) => `
      <button class="tlab-type-btn${t === this._type ? ' active' : ''}" data-type="${t}">
        ${info.emoji} ${info.label}
      </button>`).join('');

    panel.innerHTML = `
      <div id="tlab-header">
        <div id="tlab-title">🐙 Tentacle Lab</div>
        <div id="tlab-type-btns">${typeBtns}</div>
      </div>
      <div id="tlab-sliders"></div>
      <div id="tlab-footer">
        <button class="tlab-btn copy" id="tlab-copy-btn">⎘ Copy Config</button>
        <button class="tlab-btn"      id="tlab-exit-btn">✕ Exit</button>
      </div>
    `;
    document.body.appendChild(panel);
    this._panel = panel;

    // TOAST NOTIFICATION
    const toast = document.createElement('div');
    toast.id = 'tlab-toast';
    toast.textContent = '✔ Config copied to clipboard!';
    document.body.appendChild(toast);
    this._toast = toast;

    // TYPE BUTTON EVENTS
    panel.querySelectorAll('.tlab-type-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this._type = btn.dataset.type;
        panel.querySelectorAll('.tlab-type-btn')
             .forEach(b => b.classList.toggle('active', b === btn));
        this._syncSlidersToConfig();
        this._rebuildEnemy();
      });
    });

    // BUILD SLIDERS
    this._buildSliders();

    // COPY CONFIG
    panel.querySelector('#tlab-copy-btn').addEventListener('click', () => this._copyConfig());

    // EXIT — CLEANEST WAY BACK IS A RELOAD (AVOIDS PARTIAL GAME STATE)
    panel.querySelector('#tlab-exit-btn').addEventListener('click', () => {
      this.stop();
      window.location.reload();
    });
  }

  // ─── SLIDERS ──────────────────────────────────────────────────────────────
  _buildSliders() {
    const container = this._panel.querySelector('#tlab-sliders');
    container.innerHTML = '';
    this._sliders = {};

    const cfg = CONFIG.ENEMIES.TYPES[this._type];

    for (const param of PARAMS) {
      // SECTION DIVIDERS
      if (SECTION_BEFORE[param.key]) {
        const sec = document.createElement('div');
        sec.className   = 'tlab-section';
        sec.textContent = SECTION_BEFORE[param.key];
        container.appendChild(sec);
      }

      let rawVal = cfg[param.key];
      if (param.key === 'TENTACLE_MAX_BEND') rawVal = Math.round((rawVal ?? Math.PI) * (180 / Math.PI));
      if (rawVal === undefined) rawVal = param.min;

      const row = document.createElement('div');
      row.className = 'tlab-row';
      row.innerHTML = `
        <label>${param.label}</label>
        <input type="range" min="${param.min}" max="${param.max}" step="${param.step}" value="${rawVal}">
        <span class="tlab-val">${this._fmt(rawVal, param)}</span>
      `;
      container.appendChild(row);

      const input   = row.querySelector('input');
      const valueEl = row.querySelector('.tlab-val');
      this._sliders[param.key] = { input, valueEl, param };

      input.addEventListener('input', () => {
        const v = parseFloat(input.value);
        valueEl.textContent = this._fmt(v, param);
        this._applyParam(param, v);
      });
    }
  }

  _syncSlidersToConfig() {
    // PULL CURRENT CONFIG VALUES INTO SLIDERS AFTER TYPE SWITCH
    const cfg = CONFIG.ENEMIES.TYPES[this._type];
    for (const [key, { input, valueEl, param }] of Object.entries(this._sliders)) {
      let v = cfg[key];
      if (key === 'TENTACLE_MAX_BEND') v = Math.round((v ?? Math.PI) * (180 / Math.PI));
      if (v === undefined) v = param.min;
      input.value = v;
      valueEl.textContent = this._fmt(v, param);
    }
  }

  _fmt(v, param) {
    if (param.step >= 1)   return Math.round(v).toString();
    if (param.step >= 0.1) return v.toFixed(1);
    return v.toFixed(2);
  }

  // ─── APPLY SINGLE PARAM CHANGE ────────────────────────────────────────────
  _applyParam(param, value) {
    const cfg = CONFIG.ENEMIES.TYPES[this._type];

    // ── SPECIAL: MAX BEND — SLIDER IN DEGREES, CONFIG IN RADIANS ─────────────
    if (param.key === 'TENTACLE_MAX_BEND') {
      const rad = value * (Math.PI / 180);
      cfg[param.key] = rad;
      if (this._system) {
        for (const t of this._system.tentacles) t.maxBend = rad;
      }
      return;
    }

    // ── SPECIAL: TIP BIAS — FANS PER TENTACLE INDEX ──────────────────────────
    if (param.key === 'TENTACLE_TIP_BIAS') {
      cfg[param.key] = value;
      if (this._system) {
        const n = this._system.tentacles.length;
        this._system.tentacles.forEach((t, i) => {
          if      (i === 0)     { t.tipBiasX =  value; t.tipBiasY = 0; }
          else if (i === n - 1) { t.tipBiasX = -value; t.tipBiasY = 0; }
          else                  { t.tipBiasX = 0;      t.tipBiasY = value; }
        });
      }
      return;
    }

    // WRITE CONFIG
    cfg[param.key] = value;

    // STRUCTURAL CHANGE — QUEUE REBUILD (FLOAT32ARRAYS MUST BE REALLOCATED)
    if (param.rebuild) {
      this._pendingRebuild = true;
      return;
    }

    // SCALAR CHANGE — HOT-PATCH LIVE TENTACLE INSTANCES
    if (param.live && this._system) {
      for (const t of this._system.tentacles) {
        t[param.live] = value;
      }
    }
  }

  // ─── REBUILD MOCK ENEMY + TENTACLE SYSTEM ─────────────────────────────────
  _rebuildEnemy() {
    const playW = this._canvas.width - 290; // EXCLUDE PANEL
    const cx    = playW / 2;
    const cy    = this._canvas.height / 2;
    const cfg   = CONFIG.ENEMIES.TYPES[this._type];

    this._enemy = {
      x:         cx,
      y:         cy,
      scale:     1.0,
      config:    cfg,
      glowColor: cfg.GLOW_COLOR,
      type:      this._type,
    };

    // TentacleSystem READS ALL PARAMS FROM config AT CONSTRUCTION
    this._system = new TentacleSystem(this._enemy);
    this._pendingRebuild = false;
  }

  // ─── RAF TICK ─────────────────────────────────────────────────────────────
  _tick(now) {
    this._rafId = requestAnimationFrame(this._tick);

    const dt = Math.min((now - this._lastNow) / 1000, 0.05);
    this._lastNow = now;
    this._time   += dt;

    // STRUCTURAL REBUILD REQUESTED BY A SLIDER
    if (this._pendingRebuild) this._rebuildEnemy();

    const ctx  = this._ctx;
    const W    = this._canvas.width;
    const H    = this._canvas.height;
    const playW = W - 290;

    // ── CLEAR PLAY AREA ───────────────────────────────────────────────────────
    ctx.clearRect(0, 0, playW, H);

    // ── DARK BACKGROUND ───────────────────────────────────────────────────────
    ctx.fillStyle = '#050012';
    ctx.fillRect(0, 0, playW, H);

    // ── SUBTLE GRID ───────────────────────────────────────────────────────────
    ctx.strokeStyle = 'rgba(50,25,90,0.22)';
    ctx.lineWidth   = 1;
    const G = 55;
    for (let x = 0; x < playW; x += G) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    for (let y = 0; y < H; y += G) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(playW, y); ctx.stroke();
    }

    // ── CROSSHAIR GUIDES AT ENEMY POSITION ───────────────────────────────────
    if (this._enemy) {
      const ex = this._enemy.x;
      const ey = this._enemy.y;
      ctx.strokeStyle = 'rgba(100,60,180,0.15)';
      ctx.lineWidth   = 1;
      ctx.setLineDash([4, 8]);
      ctx.beginPath(); ctx.moveTo(ex, 0); ctx.lineTo(ex, H); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, ey); ctx.lineTo(playW, ey); ctx.stroke();
      ctx.setLineDash([]);
    }

    // ── WATERMARK ─────────────────────────────────────────────────────────────
    ctx.save();
    ctx.globalAlpha = 0.04;
    ctx.fillStyle   = '#8040c0';
    ctx.font        = 'bold 90px Courier New';
    ctx.textAlign   = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('LAB', playW / 2, H / 2);
    ctx.restore();

    if (!this._system || !this._enemy) return;

    // ── TENTACLES (DRAWN BEHIND BODY) ─────────────────────────────────────────
    this._system.update(dt, this._time);
    this._system.draw(ctx);

    // ── ENEMY BODY ────────────────────────────────────────────────────────────
    this._drawBody(ctx);

    // ── TYPE LABEL ────────────────────────────────────────────────────────────
    const info = TYPE_INFO[this._type];
    ctx.save();
    ctx.font         = 'bold 12px Courier New';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle    = this._enemy.glowColor;
    ctx.shadowBlur   = 8;
    ctx.shadowColor  = this._enemy.glowColor;
    ctx.fillText(`${info.emoji} ${info.label.toUpperCase()}`, playW / 2, 14);
    ctx.restore();

    // ── PARAM READOUT (BOTTOM-LEFT) ───────────────────────────────────────────
    const cfg = CONFIG.ENEMIES.TYPES[this._type];
    ctx.save();
    ctx.font         = '9px Courier New';
    ctx.fillStyle    = 'rgba(140,110,220,0.55)';
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText(
      `count:${cfg.TENTACLE_COUNT}  segs:${cfg.TENTACLE_SEGMENTS}  curl:${cfg.TENTACLE_CURL_STRENGTH?.toFixed(2)}`,
      8, H - 8
    );
    ctx.restore();
  }

  // ─── DRAW ENEMY BODY SPRITE ───────────────────────────────────────────────
  _drawBody(ctx) {
    const e    = this._enemy;
    const cfg  = CONFIG.ENEMIES.TYPES[this._type];
    const size = cfg.SIZE * e.scale;

    ctx.save();
    ctx.shadowBlur  = 20;
    ctx.shadowColor = e.glowColor;

    const sprite = ImageLoader.get('quadropus');
    if (sprite && cfg.BODY_FRAME !== undefined) {
      const frameW = sprite.width / cfg.SPRITE_FRAMES;
      ctx.drawImage(
        sprite,
        cfg.BODY_FRAME * frameW, 0, frameW, sprite.height,
        e.x - size / 2, e.y - size / 2, size, size
      );
    } else {
      // FALLBACK CIRCLE — SHOWN IF SPRITE NOT YET LOADED
      ctx.globalAlpha = 0.75;
      ctx.fillStyle   = e.glowColor;
      ctx.beginPath();
      ctx.arc(e.x, e.y, size * 0.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // ─── COPY CONFIG TO CLIPBOARD ─────────────────────────────────────────────
  _copyConfig() {
    const cfg   = CONFIG.ENEMIES.TYPES[this._type];
    const info  = TYPE_INFO[this._type];
    const lines = PARAMS.map(p => {
      const val = cfg[p.key];
      if (val === undefined) return null;

      let valStr;
      if (p.key === 'TENTACLE_MAX_BEND') {
        valStr = this._nicePI(val / Math.PI);
        const deg = Math.round(val * 180 / Math.PI);
        return `        ${p.key}: ${valStr},  // ~${deg}°`;
      } else if (p.step < 1) {
        valStr = val.toFixed(p.step < 0.1 ? 2 : 2);
      } else {
        valStr = String(val);
      }
      return `        ${p.key}: ${valStr},`;
    }).filter(Boolean);

    const out = [
      `// ${this._type} (${info.label}) TENTACLE CONFIG`,
      `// Exported from Tentacle Lab — paste into CONFIG.ENEMIES.TYPES.${this._type} in config.js`,
      ...lines,
    ].join('\n');

    navigator.clipboard.writeText(out)
      .then(() => this._showToast('✔ Copied to clipboard!'))
      .catch(() => {
        console.log('[TentacleLab] Config output:\n', out);
        this._showToast('✔ Logged to console (clipboard unavailable)');
      });
  }

  _showToast(msg) {
    if (!this._toast) return;
    this._toast.textContent = msg;
    this._toast.classList.add('show');
    setTimeout(() => this._toast?.classList.remove('show'), 1800);
  }

  // CONVERT A PI FRACTION TO A READABLE EXPRESSION
  _nicePI(f) {
    const twelfths = Math.round(f * 12);
    const map = { 12: 'Math.PI', 6: 'Math.PI / 2', 4: 'Math.PI / 3', 3: 'Math.PI / 4', 2: 'Math.PI / 6', 1: 'Math.PI / 12' };
    return map[twelfths] ?? `Math.PI * ${f.toFixed(3)}`;
  }
}