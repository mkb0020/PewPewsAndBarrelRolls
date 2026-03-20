// UPDATED 3/19/26 @ 3:30am
// JS/TEMP/BOTPLAYER.JS
//
// ─── PLAYTEST BOT — AUTOMATED PLAYER FOR BALANCE SIMULATION ─────────────────
//
// CONTROLS: F8 TO TOGGLE ON/OFF. WHEN ACTIVE, THE BOT TAKES OVER MOVEMENT
// AND AIMING. PLAYER CAN STILL OVERRIDE BY PRESSING KEYS (INPUTS STACK).
// CONSOLE ACCESS: WINDOW.BOT (SET THIS IN MAIN.JS — SEE STEP 2 BELOW)
//
// ── MAIN.JS INTEGRATION — 3 STEPS ───────────────────────────────────────────
//
// STEP 1 — IMPORT ALONGSIDE OTHER TEMP MODULES:
//   IMPORT { BOTPLAYER } FROM '../TEMP/BOTPLAYER.JS';
//
// STEP 2 — INSTANTIATE AFTER TRANSITIONSCENE, WIRE CALLBACKS, EXPOSE GLOBALLY:
//   CONST BOT = NEW BOTPLAYER();
//   BOT.ONREQUESTCONTINUE = () => TRANSITIONSCENE._HANDLECONTINUE();
//   BOT.ONREQUESTRESTART  = () => TRANSITIONSCENE._HANDLERESTART();
//   WINDOW.BOT = BOT;
//
// STEP 3 — IN THE MAIN GAME LOOP, AFTER SHIP.UPDATE() AND BEFORE
//          YOUR SHOOTING / CROSSHAIR CODE, ADD THIS BLOCK:
//
//   IF (BOT.ENABLED && !ISPAUSED && !TRANSITIONSCENE.ISBLOCKING) {
//     CONST INTENT = BOT.UPDATE(DT, {
//       SHIP: {
//         X: SHIP.X, Y: SHIP.Y,
//         HP: SHIP.HP, MAXHP: SHIP.MAXHP,
//         LIVES: SHIP.LIVES, ISALIVE: SHIP.ISALIVE,
//         ISINVINCIBLE: SHIP.ISINVINCIBLE,
//         SUCTIONSCALE: SHIP.SUCTIONSCALE,
//       },
//       ENEMIES:         ENEMYMANAGER.GETENEMIES(),
//       ENEMYLASERS:     ENEMYMANAGER.LASERS,
//       GOOPROJECTILES:  WAVEWORMMANAGER.WORM?.GOOS ?? [],
//       WAVEWORM:        WAVEWORMMANAGER.WORM,
//       WORMBOSS:        WORMBOSS,
//       BABYWORMS:       BABYWORMMANAGER.WORMS,
//       PICKUPS: {
//         PRISMS:           COSMICPRISMMANAGER.PRISMS,
//         TESSERACTS:       TESSERACTFRAGMENTMANAGER.FRAGMENTS,
//         SINGULARITYITEMS: SINGULARITYBOMBMANAGER._ITEMS,
//       },
//       SCORE:        SCOREMANAGER.SCORE,
//       ELAPSED:      TOTALELAPSED,       // YOUR RUNNING GAME-TIME CLOCK (SECONDS)
//       INBOSSBATTLE: /* YOUR BOOLEAN */,
//     });
//     IF (INTENT) {
//       CROSSHAIR.SETMOUSEINPUT(INTENT.AIMNX, INTENT.AIMNY);
//       // IN YOUR SHOOT BLOCK, REPLACE THE FIRE CONDITION WITH:
//       // IF (INTENT.SHOOTSHOOT && SHIP.CANSHOOT && SHIP.ISALIVE) { ...FIRE... }
//     }
//   }
//
// ── OPTIONAL — ADD BOT CONTROLS TO THE EXISTING DEVTOOLS PANEL ───────────────
//   AFTER DEVTOOLS.INIT(), CALL:
//   BOT.MOUNTTODEVPANEL(DEVTOOLS.PANEL);
//
// ── CONSOLE COMMANDS ─────────────────────────────────────────────────────────
//   WINDOW.BOT.TOGGLE()            — ENABLE / DISABLE
//   WINDOW.BOT.STARTBATCH(30)      — AUTO-RUN 30 GAMES IN SEQUENCE
//   WINDOW.BOT.EXPORTRESULTS()     — DOWNLOAD JSON WITH PER-RUN STATS
//   WINDOW.BOT.GETRESULTS()        — ARRAY OF RUN OBJECTS IN THE CONSOLE
// ─────────────────────────────────────────────────────────────────────────────

import { virtualKeys } from '../utils/controls.js';
import { CONFIG }      from '../utils/config.js';

const BOT = {
  EVADE_LOOKAHEAD_S:        0.20,   // SECONDS AHEAD TO PREDICT THREAT POSITIONS
  LASER_THREAT_RADIUS:      95,     // px — EVASION BUBBLE AROUND INCOMING LASER
  GOO_THREAT_RADIUS:        105,    // px — GOO ARC PREDICTION BUBBLE
  ENEMY_BODY_RADIUS:        115,    // px — 
  BABY_WORM_RADIUS:          60,    // px
  BOSS_SUCTION_THRESHOLD:    0.72,  // SUCTION SCALE - BELOW THIS EVADETHE WORM HEAD
  EDGE_MARGIN:               70,    // px — KEEP SHIP INSIDE THIS BORDER
  EVADE_RANGE:              225,    // px — HOW FAR TO PROJECT THE EVADE TARGET

  PRISM_VALUE:               90,    // HIGHEST PRIORITY
  TESSERACT_VALUE:           55,
  BOMB_VALUE:                65,
  DIST_PENALTY_PER_PX:       0.35,  // SCORE REDUCTION PER PX OF TRAVEL DISTANCE
  MIN_PICKUP_SCORE:          18,    // IGNORE PICKUPS SCORING BELOW THIS THRESHOLD

  MIN_ENEMY_SCALE_TO_SHOOT:  0.45,  // DON'T SHOOT TINY FAR-AWAY ENEMIES
  MIN_WORM_SCALE_TO_SHOOT:   0.42,

  MOVE_DEADZONE:             26,    // px — STOP STEERING IF ALREADY THIS CLOSE TO TARGET

  DEFAULT_BATCH:             30,    //DEFAULT NUMBER OF RUNS PER BATCH
  RESET_DELAY_S:             1.3,   // SECONFS TO PAUSE AFTER DEATH BEFORE TRIGGERING RESTART
};

// ─────────────────────────────────────────────────────────────────────────────
export class BotPlayer {

  constructor() {
    this.enabled = false;

    
    this._batchActive  = false;
    this._batchTarget  = BOT.DEFAULT_BATCH;
    this._runStats     = [];
    this._currentRun   = null;
    this._resetPending = false;
    this._resetTimer   = 0;

    // CALLBACKS — wire in main.js 
    this.onRequestContinue = null;  // () => transitionScene._handleContinue()
    this.onRequestRestart  = null;  // () => transitionScene._handleRestart()

    this._overlay = null;
    this._statsEl = null;
    this._buildOverlay();
    this._attachHotkey();
  }

  // ── LIFECYCLE ──────────────────────────────────────────────────────────────

  enable() {
    this.enabled = true;
    this._overlay.style.display = 'block';
    // console.log('🤖 Bot enabled — F8 to toggle');
  }

  disable() {
    this.enabled = false;
    this._clearKeys();
    this._overlay.style.display = 'none';
    // console.log('🤖 Bot disabled');
  }

  toggle() { this.enabled ? this.disable() : this.enable(); }

  /**
   * Start an automated batch of N full games.
   * Bot auto-continues/restarts after each death until N runs complete,
   * then stops. Results available via getResults() / exportResults().
   * @param {number} size
   */
  startBatch(size = BOT.DEFAULT_BATCH) {
    this._batchTarget  = size;
    this._batchActive  = true;
    this._runStats     = [];
    this._currentRun   = null;
    this._resetPending = false;
    this.enable();
    console.log(`🤖 Batch started — ${size} runs queued`);
  }

  stopBatch() {
    this._batchActive = false;
    this._updateOverlay();
    console.log(
      `🤖 Batch complete — ${this._runStats.length} runs recorded. ` +
      `Call bot.exportResults() to download JSON.`
    );
  }

  // ── MAIN FRAME UPDATE ──────────────────────────────────────────────────────

  /**
   * Call every frame from main.js when bot.enabled is true.
   * Returns control intent for main.js to act on; null if bot is idle / waiting.
   *
   * @param {number} dt
   * @param {object} snap  
   * @returns {{ aimNX: number, aimNY: number, shouldShoot: boolean } | null}
   */
  update(dt, snap) {
    if (!this.enabled) return null;

    const {
      ship, enemies, enemyLasers, gooProjectiles,
      waveWorm, wormBoss, babyWorms,
      pickups, score, elapsed, inBossBattle,
    } = snap;

    // ── RUN LIFECYCLE ──────────────────────────────────────────────────────

    if (!this._currentRun && ship.isAlive && !this._resetPending) {
      this._currentRun = { startTime: elapsed, startLives: ship.lives, startScore: score };
    }

    if (this._currentRun && !ship.isAlive) {
      this._finishRun(elapsed, score, ship.lives);
      if (this._batchActive) {
        if (this._runStats.length >= this._batchTarget) {
          this.stopBatch();
        } else {
          this._resetPending = true;
          this._resetTimer   = BOT.RESET_DELAY_S;
        }
      }
    }

    // ── WAITING TO RESTART ─────────────────────────────────────────────────

    if (!ship.isAlive || this._resetPending) {
      this._clearKeys();
      if (this._resetPending) {
        this._resetTimer -= dt;
        if (this._resetTimer <= 0) {
          this._resetPending = false;
          const last = this._runStats[this._runStats.length - 1];
          if ((last?.livesAtEnd ?? 0) > 0) {
            this.onRequestContinue?.();
          } else {
            this.onRequestRestart?.();
          }
        }
      }
      this._updateOverlay();
      return null;
    }

    // ── AWARENESS ─────────────────────────────────────────────────────────

    const threats   = this._gatherThreats(enemyLasers, gooProjectiles, enemies, waveWorm, babyWorms, wormBoss, ship);
    const pickupPts = this._gatherPickups(pickups);

    // ── MOVEMENT DECISION — priority: evade > pickup > drift to center ────

    const evadeDir  = this._evadeDirection(threats, ship);
    const pickupTgt = this._bestPickup(pickupPts);

    let tX, tY;
    const cx = window.innerWidth  / 2;
    const cy = window.innerHeight / 2;

    if (evadeDir) {
      // PROJECT EVADE VECTOR AND CLAMP INSIDE SAFE VIEWPORT BORDER
      tX = Math.max(BOT.EDGE_MARGIN, Math.min(window.innerWidth  - BOT.EDGE_MARGIN, ship.x + evadeDir.x * BOT.EVADE_RANGE));
      tY = Math.max(BOT.EDGE_MARGIN, Math.min(window.innerHeight - BOT.EDGE_MARGIN, ship.y + evadeDir.y * BOT.EVADE_RANGE));
    } else if (pickupTgt) {
      tX = pickupTgt.x;
      tY = pickupTgt.y;
    } else {
      tX = cx;   // DEFAULT: DRIFT TO SCREEN CENTER (SAFE GROUND)
      tY = cy;
    }

    this._setMovementKeys(tX, tY, ship);

    // ── AIMING ────────────────────────────────────────────────────────────

    const aimTgt = this._pickAimTarget(enemies, waveWorm, wormBoss, inBossBattle, ship);
    let aimNX = 0, aimNY = 0;
    if (aimTgt) {
      // CONVERT WORLD TARGET TO NORMALIZED CROSSHAIR INPUT (RELATIVE TO SCREEN CENTER)
      const dx  = aimTgt.x - cx;
      const dy  = aimTgt.y - cy;
      const mag = Math.sqrt(dx * dx + dy * dy) || 1;
      aimNX =  dx / mag;
      aimNY = -dy / mag;  // crosshair rawY: positive = up; screen dy is positive-down
    }

    this._updateOverlay();
    return { aimNX, aimNY, shouldShoot: !!aimTgt };
  }

  // ── THREAT GATHERING ──────────────────────────────────────────────────────

  _gatherThreats(lasers, goos, enemies, waveWorm, babyWorms, wormBoss, ship) {
    const threats = [];
    const la      = BOT.EVADE_LOOKAHEAD_S;
    const gravity = CONFIG.GOO_PROJECTILE.GRAVITY;

    // ── ENEMY LASER BOLTS — LINEAR POSITION PREDICTION
    for (const l of lasers) {
      if (l.isDead) continue;
      threats.push({
        fx: l.x + l.dirX * l.speed * la,
        fy: l.y + l.dirY * l.speed * la,
        r:  BOT.LASER_THREAT_RADIUS,
        w:  1.3,   //SLIGHTLY HIGHER WEIGHT — FAST AND ACCURATE
      });
    }

    // ── GOO ARCS — APPROXIMATE THE PARABOLA WITH A MIDPOINT GRAVITY STEP
    for (const g of goos) {
      if (g.isDead || g.impacting) continue;
      const vyMid = g.vy + gravity * la * 0.5;
      threats.push({
        fx: g.x + g.vx  * la,
        fy: g.y + vyMid * la,
        r:  BOT.GOO_THREAT_RADIUS,
        w:  1.0,
      });
    }

    // ── LARGE ENEMY BODIES (BODY-COLLISION RISK WHEN AT COMBAT SCALE)
    for (const e of enemies) {
      if (e.isDead || e.scale < 0.68) continue;
      threats.push({ fx: e.x, fy: e.y, r: BOT.ENEMY_BODY_RADIUS, w: 0.8 });
    }

    // ── WAVE WORM (LARGER BUBBLE — IT'S FAST AT HIGH SCALE)
    if (waveWorm && !waveWorm.isDead && waveWorm.scale > 0.45) {
      threats.push({ fx: waveWorm.x, fy: waveWorm.y, r: BOT.ENEMY_BODY_RADIUS * 1.5, w: 1.1 });
    }

    // ── BABY WORMS (SEEKING; IGNORE LATCHED ONES — BARREL ROLL HANDLES THOSE)
    for (const b of (babyWorms ?? [])) {
      if (b.isDead || b.isLatched) continue;
      threats.push({ fx: b.x, fy: b.y, r: BOT.BABY_WORM_RADIUS, w: 0.75 });
    }

    // ── BOSS SUCTION — WORM HEAD BECOMES A GRAVITY WELL WHEN SHIP IS SHRINKING
    if (wormBoss?.isActive && !wormBoss.isDead && ship.suctionScale < BOT.BOSS_SUCTION_THRESHOLD) {
      const head = wormBoss.segments?.[0];
      if (head && !head.isDead) {
        threats.push({ fx: head.screenX, fy: head.screenY, r: 300, w: 2.2 });
      }
    }

    return threats;
  }

  _evadeDirection(threats, ship) {
    let evX = 0, evY = 0, totalW = 0;

    for (const t of threats) {
      const dx   = ship.x - t.fx;
      const dy   = ship.y - t.fy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist >= t.r) continue;

      const strength = (1 - dist / t.r) * t.w;
      // IF SHIP IS EXACTLY ON TOP OF A THREAT, PICK A RANDOM ESCAPE DIRECTION
      const nx = dist > 0.5 ? dx / dist : Math.random() * 2 - 1;
      const ny = dist > 0.5 ? dy / dist : Math.random() * 2 - 1;
      evX += nx * strength;
      evY += ny * strength;
      totalW += strength;
    }

    if (totalW < 0.01) return null;
    const mag = Math.sqrt(evX * evX + evY * evY) || 1;
    return { x: evX / mag, y: evY / mag };
  }

  // ── PICKUP LOGIC ──────────────────────────────────────────────────────────

  _gatherPickups({ prisms = [], tesseracts = [], singularityItems = [] }) {
    const list = [];

    for (const p of prisms) {
      if (!p.collected && !p.isDead()) list.push({ x: p.x, y: p.y, v: BOT.PRISM_VALUE });
    }
    for (const t of tesseracts) {
      if (!t.collected && !t.isDead()) list.push({ x: t.x, y: t.y, v: BOT.TESSERACT_VALUE });
    }
    for (const s of singularityItems) {
      if (!s.collected && !s.isDead()) list.push({ x: s.x, y: s.y, v: BOT.BOMB_VALUE });
    }

    return list;
  }

  _bestPickup(list) {
    let best = null, bestScore = BOT.MIN_PICKUP_SCORE;
    const cx = window.innerWidth  / 2;
    const cy = window.innerHeight / 2;

    for (const p of list) {
      const dx    = p.x - cx;
      const dy    = p.y - cy;
      const dist  = Math.sqrt(dx * dx + dy * dy);
      const score = p.v - dist * BOT.DIST_PENALTY_PER_PX;
      if (score > bestScore) { bestScore = score; best = p; }
    }

    return best;
  }

  // ── MOVEMENT ──────────────────────────────────────────────────────────────

  _setMovementKeys(tx, ty, ship) {
    const dx = tx - ship.x;
    const dy = ty - ship.y;
    const dz = BOT.MOVE_DEADZONE;

    this._clearKeys();
    if (dx >  dz) virtualKeys['d'] = virtualKeys['arrowright'] = true;
    if (dx < -dz) virtualKeys['a'] = virtualKeys['arrowleft']  = true;
    if (dy >  dz) virtualKeys['s'] = virtualKeys['arrowdown']  = true;
    if (dy < -dz) virtualKeys['w'] = virtualKeys['arrowup']    = true;
  }

  _clearKeys() {
    virtualKeys['w']          = false;
    virtualKeys['s']          = false;
    virtualKeys['a']          = false;
    virtualKeys['d']          = false;
    virtualKeys['arrowup']    = false;
    virtualKeys['arrowdown']  = false;
    virtualKeys['arrowleft']  = false;
    virtualKeys['arrowright'] = false;
  }

  // ── AIMING ────────────────────────────────────────────────────────────────

  _pickAimTarget(enemies, waveWorm, wormBoss, inBossBattle, ship) {
    let best = null, bestScore = -Infinity;

    // BOSS BATTLE: ALWAYS AIM AT THE WORM HEAD
    if (inBossBattle && wormBoss?.isActive && !wormBoss.isDead) {
      const head = wormBoss.segments?.[0];
      if (head && !head.isDead && head.drawSize > 1) {
        return { x: head.screenX, y: head.screenY };
      }
    }

    // REGULAR ENEMIES: SCORE BY SIZE * PROXIMITY, SLIGHT BONUS FOR TANK (HIGH HP = MORE WORTH KILLING)
    for (const e of enemies) {
      if (e.isDead || e.scale < BOT.MIN_ENEMY_SCALE_TO_SHOOT) continue;
      const dx    = e.x - ship.x;
      const dy    = e.y - ship.y;
      const dist  = Math.sqrt(dx * dx + dy * dy);
      const score = e.scale * 110 - dist * 0.22 + (e.type === 'TANK' ? 18 : 0);
      if (score > bestScore) { bestScore = score; best = { x: e.x, y: e.y }; }
    }

    // HIGH-PRIORITY
    if (waveWorm && !waveWorm.isDead && waveWorm.scale >= BOT.MIN_WORM_SCALE_TO_SHOOT) {
      const dx    = waveWorm.x - ship.x;
      const dy    = waveWorm.y - ship.y;
      const dist  = Math.sqrt(dx * dx + dy * dy);
      const score = waveWorm.scale * 150 - dist * 0.20;
      if (score > bestScore) { best = { x: waveWorm.x, y: waveWorm.y }; }
    }

    return best;
  }

  // ── RUN TRACKING ──────────────────────────────────────────────────────────

  _finishRun(elapsed, score, livesAtEnd) {
    if (!this._currentRun) return;
    const r = this._currentRun;
    this._runStats.push({
      run:          this._runStats.length + 1,
      survivalTime: +(elapsed - r.startTime).toFixed(1),
      score:        Math.max(0, score - r.startScore),
      livesLost:    Math.max(0, r.startLives - livesAtEnd),
      livesAtEnd,
    });
    this._currentRun = null;
  }

  // ── OVERLAY ───────────────────────────────────────────────────────────────

  _buildOverlay() {
    const el = document.createElement('div');
    el.id = 'bot-overlay';
    Object.assign(el.style, {
      position:      'fixed',
      bottom:        '24px',
      left:          '20px',
      width:         '230px',
      background:    'rgba(0,0,0,0.86)',
      border:        '1px solid #00ff88',
      borderRadius:  '6px',
      color:         '#00ff88',
      fontFamily:    "'Courier New', monospace",
      fontSize:      '11px',
      lineHeight:    '1.75',
      padding:       '10px 14px',
      zIndex:        '99999',
      pointerEvents: 'none',
      display:       'none',
      whiteSpace:    'pre',
    });
    el.innerHTML =
      '<div style="font-weight:bold;letter-spacing:.15em;' +
        'border-bottom:1px solid rgba(0,255,136,0.25);margin-bottom:6px;padding-bottom:4px">' +
        '🤖 BOT ACTIVE' +
      '</div>' +
      '<div id="bot-stats-inner">warming up…</div>';
    document.body.appendChild(el);
    this._overlay = el;
    this._statsEl = el.querySelector('#bot-stats-inner');
  }

  _updateOverlay() {
    if (!this._statsEl) return;
    const n = this._runStats.length;

    if (n === 0) {
      this._statsEl.textContent = this._currentRun ? 'Run 1 — in progress' : 'Waiting…';
      return;
    }

    const bStr     = this._batchActive ? ` / ${this._batchTarget}` : '';
    const avgSurv  = (this._runStats.reduce((s, r) => s + r.survivalTime, 0) / n).toFixed(1);
    const avgScore = Math.round(this._runStats.reduce((s, r) => s + r.score, 0) / n);
    const avgLost  = (this._runStats.reduce((s, r) => s + r.livesLost, 0) / n).toFixed(1);
    const last     = this._runStats[n - 1];
    const inProg   = this._currentRun ? `\nRun ${n + 1} — in progress` : '';

    this._statsEl.textContent =
      `Runs:      ${n}${bStr}\n` +
      `Avg surv:  ${avgSurv}s\n` +
      `Avg score: ${avgScore}\n` +
      `Avg lives: ${avgLost} lost\n` +
      `──────────────────\n` +
      `Last: ${last.survivalTime}s  ${last.score}pts\n` +
      `      ×${last.livesLost} lives lost` +
      inProg;
  }

  _attachHotkey() {
    window.addEventListener('keydown', e => {
      // F8 — toggle bot (F9/F10 are taken by SessionRecorder, backtick by DevTools panel)
      if (e.code === 'F8') { e.preventDefault(); this.toggle(); }
    });
  }

  // ── PUBLIC API ────────────────────────────────────────────────────────────

  /**
   * Append bot control buttons to the existing DevTools panel.
   * Call after DevTools.init(): bot.mountToDevPanel(DevTools.panel)
   * @param {HTMLElement} panelEl
   */
  mountToDevPanel(panelEl) {
    if (!panelEl) return;

    const heading = document.createElement('div');
    heading.textContent = 'Playtest Bot';
    heading.style.cssText = 'font-weight:600; margin:10px 0 6px 0;';
    panelEl.appendChild(heading);

    const row = document.createElement('div');
    row.style.cssText = 'display:flex; flex-direction:column; gap:6px;';

    const btnStyle = 'flex:1; padding:6px 8px; border:1px solid rgba(255,255,255,0.2); ' +
                     'background:rgba(255,255,255,0.06); color:white; cursor:pointer; font-size:11px;';

    const makeBtn = (label, onClick) => {
      const b = document.createElement('button');
      b.textContent = label;
      b.style.cssText = btnStyle;
      b.addEventListener('click', onClick);
      return b;
    };

    const batchSizeInput = document.createElement('input');
    batchSizeInput.type  = 'number';
    batchSizeInput.value = String(BOT.DEFAULT_BATCH);
    batchSizeInput.min   = '1';
    batchSizeInput.max   = '200';
    batchSizeInput.style.cssText = 'width:100%; padding:4px 6px; background:rgba(255,255,255,0.06); ' +
                                   'border:1px solid rgba(255,255,255,0.2); color:white; font-size:11px;';

    const batchLabel = document.createElement('div');
    batchLabel.textContent = 'Batch size:';
    batchLabel.style.cssText = 'font-size:11px; opacity:0.7;';

    row.appendChild(batchLabel);
    row.appendChild(batchSizeInput);
    row.appendChild(makeBtn('Toggle Bot  [F8]',       () => this.toggle()));
    row.appendChild(makeBtn('▶ Start Batch',           () => this.startBatch(parseInt(batchSizeInput.value, 10) || BOT.DEFAULT_BATCH)));
    row.appendChild(makeBtn('⏹ Stop Batch',            () => this.stopBatch()));
    row.appendChild(makeBtn('⬇ Export Results JSON',  () => this.exportResults()));

    panelEl.appendChild(row);
  }

  /** @returns {Array} Copy of per-run stat objects */
  getResults() { return [...this._runStats]; }

  /** Download a JSON file with full run stats + summary */
  exportResults() {
    if (!this._runStats.length) {
      console.warn('🤖 No bot results to export yet.');
      return;
    }
    const n        = this._runStats.length;
    const avgSurv  = +(this._runStats.reduce((s, r) => s + r.survivalTime, 0) / n).toFixed(1);
    const avgScore = Math.round(this._runStats.reduce((s, r) => s + r.score, 0) / n);
    const avgLives = +(this._runStats.reduce((s, r) => s + r.livesLost, 0) / n).toFixed(2);
    const payload  = {
      meta: {
        generatedAt: new Date().toISOString(),
        totalRuns:   n,
      },
      summary: {
        avgSurvivalTime: avgSurv,
        avgScore,
        avgLivesLost: avgLives,
      },
      runs: this._runStats,
    };
    const a    = document.createElement('a');
    a.href     = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
    a.download = `bot_results_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    console.log(`🤖 Exported ${n} runs.`);
  }
}