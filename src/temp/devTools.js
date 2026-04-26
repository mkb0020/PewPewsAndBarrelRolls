// Updated at 4/21/26 @ 12PM
import { CONFIG } from '../utils/config.js';
import { WAVE_CONFIGS } from '../scenes/gameplay.js';

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

  endSession(reason = 'unknown') { // AUTOMATICALLY ENDS SESSION RECORDER AND DOWNLOADS JSON
  if (!this.recording) return;
  this.log('session_end_trigger', { reason }); 
  this.stop(); 
},

  // CALLED BY BOTPLAYER AT THE START OF EACH NEW RUN — RESETS EVENTS WITHOUT DOWNLOADING.
  // KEEPS SESSIONS CLEAN PER RUN WITHOUT SPAMMING DOWNLOAD FILES.
  restartForBot() {
    this.recording = false;
    this.events    = [];
    this.startTime = performance.now();
    this.recording = true;
    this.log('session_start', { source: 'bot' });
    DevTools?.updateRecorderUI?.();
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
      hpHealCount: 0,
      totalHpHealed: 0,
      fractalCascadeCount: 0,
      slimeAttackCount: 0,
      ocularPrismCount: 0,
      bossEntryShipHp:    null,  // SHIP HP WHEN BOSS BATTLE BEGAN
      bossEntryShipLives: null,  // LIVES REMAINING WHEN BOSS BATTLE BEGAN
      bossBattleDuration: null,
      avgTimeToKill: null,
      // ── PROGRESS TRACKING ───────────────────────────────────────────────────
      waveReached:  null,   // HIGHEST WAVE NUMBER ENTERED (1-BASED, e.g. "Wave 3")
      waveCleared:  null,   // HIGHEST WAVE NUMBER FULLY CLEARED (1-BASED)
      bossReached:  false,  // DID PLAYER REACH THE BOSS BATTLE?
      gameBeaten:   false,  // DID PLAYER DEFEAT THE WORM BOSS?
      runOutcome:   null,   // 'game_over' | 'boss_defeated' | 'in_progress'
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
          summary.bossEntryShipHp    = evt.shipHp    ?? null;
          summary.bossEntryShipLives = evt.shipLives ?? null;
          summary.bossReached        = true;
          break;
        case 'boss_battle_end':
          bossEnd = evt.time;
          break;
        case 'hp_heal':
          summary.hpHealCount++;
          summary.totalHpHealed += evt.amount ?? 0;
          break;
        case 'fractal_cascade_attack':
          summary.fractalCascadeCount++;
          break;
        case 'slime_attack':
          summary.slimeAttackCount++;
          break;
        case 'ocular_prism_attack':
          summary.ocularPrismCount++;
          break;
        // ── PROGRESS EVENTS (logged by main.js) ─────────────────────────────
        case 'wave_start':
          if (evt.waveIndex != null) {
            const waveNum = evt.waveIndex + 1; // CONVERT 0-BASED INDEX → 1-BASED NUMBER
            if (summary.waveReached === null || waveNum > summary.waveReached) {
              summary.waveReached = waveNum;
            }
          }
          break;
        case 'wave_cleared':
          if (evt.waveIndex != null) {
            const waveNum = evt.waveIndex + 1;
            if (summary.waveCleared === null || waveNum > summary.waveCleared) {
              summary.waveCleared = waveNum;
            }
          }
          break;
        case 'session_end_trigger':
          if (evt.reason === 'boss_defeated') summary.gameBeaten = true;
          summary.runOutcome = evt.reason ?? 'unknown';
          break;
      }
    }

    // IF BOSS WAS REACHED AND BOSS BATTLE END WAS LOGGED, CHECK FOR VICTORY
    if (summary.bossReached && summary.gameBeaten) {
      summary.runOutcome = 'boss_defeated';
    } else if (summary.runOutcome === null) {
      summary.runOutcome = 'in_progress';
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

  _snapshotConfig() {
    const C = CONFIG;
    const types = {};
    for (const [key, t] of Object.entries(C.ENEMIES.TYPES)) {
      types[key] = {
        HEALTH:          t.HEALTH,
        LASER_INTERVAL:  t.LASER_INTERVAL,
        COMBAT_DURATION: t.COMBAT_DURATION,
        ...(key === 'FLIMFLAM' ? {
          PRISM_FIRST_DELAY_MIN: t.PRISM_FIRST_DELAY_MIN,
          PRISM_FIRST_DELAY_MAX: t.PRISM_FIRST_DELAY_MAX,
          PRISM_COOLDOWN_MIN:    t.PRISM_COOLDOWN_MIN,
          PRISM_COOLDOWN_MAX:    t.PRISM_COOLDOWN_MAX,
        } : {}),
      };
    }
    return {
      COSMIC_PRISM:    { HEAL_AMOUNT: C.COSMIC_PRISM.HEAL_AMOUNT },
      ENEMIES: {
        SPAWN_INTERVAL_MIN: C.ENEMIES.SPAWN_INTERVAL_MIN,
        SPAWN_INTERVAL_MAX: C.ENEMIES.SPAWN_INTERVAL_MAX,
        TYPES: types,
      },
      SLIME_ATTACK: {
        FIRST_ATTACK_MIN: C.SLIME_ATTACK.FIRST_ATTACK_MIN,
        FIRST_ATTACK_MAX: C.SLIME_ATTACK.FIRST_ATTACK_MAX,
        REPEAT_INTERVAL:  C.SLIME_ATTACK.REPEAT_INTERVAL,
      },
      FRACTAL_CASCADE: {
        FIRST_DELAY_MIN: C.FRACTAL_CASCADE.FIRST_DELAY_MIN,
        FIRST_DELAY_MAX: C.FRACTAL_CASCADE.FIRST_DELAY_MAX,
        COOLDOWN_MIN:    C.FRACTAL_CASCADE.COOLDOWN_MIN,
        COOLDOWN_MAX:    C.FRACTAL_CASCADE.COOLDOWN_MAX,
      },
      WAVE_CONFIGS,
    };
  },

  download() {
    const payload = {
      meta: {
        generatedAt: new Date().toISOString(),
      },
      configSnapshot: this._snapshotConfig(),
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


export const DevTools = {
  panel: null,
  recorderStatusEl: null,
  recorderCountEl: null,

  init() {
    if (this.panel) return;
    this._createPanel();
    this._attachKeyListeners();
    this.updateRecorderUI();
    // SessionRecorder.start(); // AUTO START SESSION RECORDER *******
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