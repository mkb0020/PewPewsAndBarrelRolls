// Updated at 3/15/26 @ 3:30PM

import { CONFIG } from '../utils/config.js';


export const SessionRecorder = {
  recording: false,
  startTime: 0,
  events: [],

  start() {
    if (this.recording) return;
    this.recording = true;
    this.startTime = performance.now();
    this.events = [];
    this.log('session_start', {});
    DevTools?.updateRecorderUI?.();
  },

  stop() {
    if (!this.recording) return;
    this.log('session_end', {});
    this.recording = false;
    DevTools?.updateRecorderUI?.();
    this.download();
  },

  toggle() {
    if (this.recording) this.stop();
    else this.start();
  },

  log(type, data = {}) {
    if (!this.recording) return;
    this.events.push({
      type,
      time: performance.now() - this.startTime,
      ...data,
    });
    DevTools?.updateRecorderUI?.();
  },

  _computeSummary() {
    const summary = {
      totalEvents: this.events.length,
      damageEvents: 0,
      enemyKills: 0,
      enemySpawns: 0,
      playerDamageCount: 0,
      bossBattleDuration: null,
      avgTimeToKill: null,
    };

    const spawnTimes = new Map();
    const killDurations = [];
    let bossStart = null;
    let bossEnd = null;

    for (const evt of this.events) {
      switch (evt.type) {
        case 'player_damage':
          summary.playerDamageCount += 1;
          summary.damageEvents += 1;
          break;
        case 'enemy_spawn':
          summary.enemySpawns += 1;
          if (evt.id != null) spawnTimes.set(evt.id, evt.time);
          break;
        case 'enemy_killed':
          summary.enemyKills += 1;
          if (evt.id != null && spawnTimes.has(evt.id)) {
            killDurations.push(evt.time - spawnTimes.get(evt.id));
          }
          break;
        case 'boss_battle_start':
          bossStart = evt.time;
          break;
        case 'boss_battle_end':
          bossEnd = evt.time;
          break;
      }
    }

    if (killDurations.length > 0) {
      const sum = killDurations.reduce((acc, v) => acc + v, 0);
      summary.avgTimeToKill = sum / killDurations.length;
    }

    if (bossStart != null && bossEnd != null && bossEnd > bossStart) {
      summary.bossBattleDuration = bossEnd - bossStart;
    }

    return summary;
  },

  download() {
    const payload = {
      meta: {
        generatedAt: new Date().toISOString(),
      },
      summary: this._computeSummary(),
      events: this.events,
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `wormhole_session_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    a.click();
  },
};

// -----------------------------------------------------------------------------
// Dev Overlay / Live Tuning Panel
// -----------------------------------------------------------------------------
export const DevTools = {
  panel: null,
  recorderStatusEl: null,
  recorderCountEl: null,

  init() {
    if (this.panel) return;
    this._createPanel();
    this._attachKeyListeners();
    this.updateRecorderUI();
  },

  _createPanel() {
    const panel = document.createElement('div');
    panel.id = 'devPanel';
    panel.style.position = 'fixed';
    panel.style.right = '10px';
    panel.style.top = '10px';
    panel.style.width = '320px';
    panel.style.maxHeight = '92vh';
    panel.style.overflowY = 'auto';
    panel.style.background = 'rgba(0,0,0,0.86)';
    panel.style.color = 'white';
    panel.style.padding = '14px';
    panel.style.fontFamily = 'ui-monospace, Menlo, Monaco, monospace';
    panel.style.fontSize = '12px';
    panel.style.zIndex = 99999;
    panel.style.border = '1px solid rgba(255,255,255,0.15)';
    panel.style.borderRadius = '8px';
    panel.style.boxShadow = '0 0 0 1px rgba(255,255,255,0.05), 0 20px 40px rgba(0,0,0,0.7)';
    panel.style.display = 'none';

    //const title = document.createElement('div');
    //title.textContent = 'DEV TOOLS';
    //title.style.fontWeight = '700';
    //title.style.marginBottom = '10px';
    //panel.appendChild(title);

   // const hint = document.createElement('div');
    //hint.innerHTML = 'Toggle: <kbd>`</kbd> · Record: <kbd>F9</kbd> · Export: <kbd>F10</kbd>';
    //hint.style.fontSize = '11px';
    //hint.style.opacity = '0.8';
    //hint.style.marginBottom = '10px';
    //panel.appendChild(hint);

    // SESSION RECORDER SECTION
    const recorderSection = document.createElement('div');
    recorderSection.style.marginBottom = '12px';
    recorderSection.style.padding = '8px';
    recorderSection.style.border = '1px solid rgba(255,255,255,0.12)';
    recorderSection.style.borderRadius = '6px';

    const recorderTitle = document.createElement('div');
    recorderTitle.textContent = 'Session Recorder';
    recorderTitle.style.fontWeight = '600';
    recorderTitle.style.marginBottom = '8px';
    recorderSection.appendChild(recorderTitle);

    const recorderStatus = document.createElement('div');
    recorderStatus.style.marginBottom = '6px';
    recorderStatus.textContent = 'Status: stopped';
    this.recorderStatusEl = recorderStatus;
    recorderSection.appendChild(recorderStatus);

    const recorderCount = document.createElement('div');
    recorderCount.textContent = 'Events: 0';
    this.recorderCountEl = recorderCount;
    recorderSection.appendChild(recorderCount);

    const recorderButtons = document.createElement('div');
    recorderButtons.style.display = 'flex';
    recorderButtons.style.gap = '6px';

    const btnStart = document.createElement('button');
    btnStart.textContent = 'Start';
    btnStart.style.flex = '1';
    btnStart.style.padding = '6px 8px';
    btnStart.style.border = '1px solid rgba(255,255,255,0.2)';
    btnStart.style.background = 'rgba(255,255,255,0.06)';
    btnStart.style.color = 'white';
    btnStart.style.cursor = 'pointer';
    btnStart.addEventListener('click', () => SessionRecorder.start());

    const btnStop = document.createElement('button');
    btnStop.textContent = 'Stop + Export';
    btnStop.style.flex = '1';
    btnStop.style.padding = '6px 8px';
    btnStop.style.border = '1px solid rgba(255,255,255,0.2)';
    btnStop.style.background = 'rgba(255,255,255,0.06)';
    btnStop.style.color = 'white';
    btnStop.style.cursor = 'pointer';
    btnStop.addEventListener('click', () => SessionRecorder.stop());

    recorderButtons.appendChild(btnStart);
    recorderButtons.appendChild(btnStop);
    recorderSection.appendChild(recorderButtons);

    panel.appendChild(recorderSection);

    // BALANCE SLIDERS
    //const buildHeading = (text) => {
     // const h = document.createElement('div');
    //  h.textContent = text;
    //  h.style.fontWeight = '600';
    //  h.style.margin = '10px 0 6px 0';
    //  return h;
    //};

    //panel.appendChild(buildHeading('Balance Tuning'));

   // this.addSlider(panel, 'SHIP HP', CONFIG.SHIP_HP, 'MAX_HP', 20, 300, 1);
   // this.addSlider(panel, 'ENEMY SPAWN MIN', CONFIG.ENEMIES, 'SPAWN_INTERVAL_MIN', 0.5, 10, 0.1);
   // this.addSlider(panel, 'ENEMY SPAWN MAX', CONFIG.ENEMIES, 'SPAWN_INTERVAL_MAX', 0.5, 12, 0.1);
   // this.addSlider(panel, 'GLIP GLOP HP', CONFIG.ENEMIES.TYPES.BASIC, 'HEALTH', 1, 30, 1);
   // this.addSlider(panel, 'PHIL HP', CONFIG.ENEMIES.TYPES.FAST, 'HEALTH', 1, 30, 1);
   // this.addSlider(panel, 'GLORK HP', CONFIG.ENEMIES.TYPES.TANK, 'HEALTH', 1, 40, 1);
   // this.addSlider(panel, 'ZIP ZAP HP', CONFIG.ENEMIES.TYPES.ZIGZAG, 'HEALTH', 1, 30, 1);
   // this.addSlider(panel, 'FLIM FLAM HP', CONFIG.ENEMIES.TYPES.FLIMFLAM, 'HEALTH', 1, 40, 1);
   // this.addSlider(panel, 'WAVE WORM HP', CONFIG.WAVE_WORM, 'HEALTH', 1, 80, 1);
   // this.addSlider(panel, 'COSMIC PRISMS', CONFIG.COSMIC_PRISM, 'SPAWN_INTERVAL', 5, 90, 1);
    //this.addSlider(panel, 'TESSERACT FRAGMENTS', CONFIG.TESSERACT_FRAGMENT, 'SPAWN_INTERVAL', 5, 90, 1);
   // this.addSlider(panel, 'SPINORS', CONFIG.SINGULARITY_BOMB, 'SPAWN_INTERVAL', 10, 120, 1);

    document.body.appendChild(panel);
    this.panel = panel;
  },

  addSlider(panel, label, obj, key, min, max, step = 1) {
    const container = document.createElement('div');
    container.style.marginBottom = '8px';

    const text = document.createElement('div');
    text.textContent = `${label}: ${obj[key]}`;
    text.style.marginBottom = '4px';
    container.appendChild(text);

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = min;
    slider.max = max;
    slider.step = step;
    slider.value = obj[key];
    slider.style.width = '100%';

    slider.addEventListener('input', () => {
      const val = Number(slider.value);
      obj[key] = val;
      text.textContent = `${label}: ${val}`;
    });

    container.appendChild(slider);
    panel.appendChild(container);
    return slider;
  },

  togglePanel() {
    if (!this.panel) return;
    this.panel.style.display = this.panel.style.display === 'none' ? 'block' : 'none';
  },

  _attachKeyListeners() {
    window.addEventListener('keydown', (e) => {
      if (e.key === '`') {
        e.preventDefault();
        this.togglePanel();
        return;
      }
      if (e.key === 'F9') {
        e.preventDefault();
        SessionRecorder.toggle();
        return;
      }
      if (e.key === 'F10') {
        e.preventDefault();
        SessionRecorder.download();
        return;
      }
    });
  },

  updateRecorderUI() {
    if (!this.recorderStatusEl || !this.recorderCountEl) return;
    this.recorderStatusEl.textContent = 'Status: ' + (SessionRecorder.recording ? 'recording' : 'stopped');
    this.recorderCountEl.textContent = `Events: ${SessionRecorder.events.length}`;
  },
};

window.DevTools = DevTools;
window.SessionRecorder = SessionRecorder;
