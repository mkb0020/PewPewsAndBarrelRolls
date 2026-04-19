// UPDATED 4/19/26 @ 3:00PM
// JS/TEMP/BOTPLAYER.JS
// BOT'S NAME: "NOODLE"
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
//       // IF (INTENT.SHOULDSHOOT && SHIP.CANSHOOT && SHIP.ISALIVE) { ...FIRE... }
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
  LASER_THREAT_RADIUS:      95,     // PX — EVASION BUBBLE AROUND INCOMING LASER
  GOO_THREAT_RADIUS:        105,    // PX — GOO ARC PREDICTION BUBBLE
  ENEMY_BODY_RADIUS:        115,    // PX
  BABY_WORM_RADIUS:          60,    // PX
  BOSS_SUCTION_THRESHOLD:    0.72,  // SUCTION SCALE — BELOW THIS EVADE THE WORM HEAD
  EDGE_MARGIN:               70,    // PX — KEEP SHIP INSIDE THIS BORDER
  EVADE_RANGE:              225,    // PX — HOW FAR TO PROJECT THE EVADE TARGET

  PRISM_VALUE:               90,    // HIGHEST PRIORITY
  TESSERACT_VALUE:           55,
  BOMB_VALUE:                65,
  DIST_PENALTY_PER_PX:       0.35,  // SCORE REDUCTION PER PX OF TRAVEL DISTANCE
  MIN_PICKUP_SCORE:          18,    // IGNORE PICKUPS SCORING BELOW THIS THRESHOLD

  MIN_ENEMY_SCALE_TO_SHOOT:  0.45,  // DON'T SHOOT TINY FAR-AWAY ENEMIES
  MIN_WORM_SCALE_TO_SHOOT:   0.42,

  MOVE_DEADZONE:             26,    // PX — STOP STEERING IF ALREADY THIS CLOSE TO TARGET

  // ── STRESS SYSTEM ─────────────────────────────────────────────────────────
  STRESS_HP_WEIGHT:          0.35,  // CONTRIBUTION FROM LOW HP
  STRESS_DAMAGE_WEIGHT:      0.30,  // CONTRIBUTION FROM RECENT DAMAGE
  STRESS_ENEMY_WEIGHT:       0.35,  // CONTRIBUTION FROM NEARBY COMBAT ENEMIES
  STRESS_ENEMY_RADIUS:       220,   // PX — "NEARBY" THRESHOLD (WAS 280 — TIGHTER)
  STRESS_ENEMY_CAP:          5,     // ENEMY COUNT THAT MAXES THIS COMPONENT (WAS 3 — WAVE 3 DENSITY NEEDED HIGHER CAP)
  STRESS_RISE_RATE:          0.07,  // SLOWER STRESS CLIMB — NOODLE STAYS COMPOSED LONGER
  STRESS_DECAY_RATE:         0.040, // HOW FAST STRESS FALLS (WAS 0.025 — FASTER RECOVERY AFTER THREATS CLEAR)
  DAMAGE_DECAY_RATE:         26,    // HP/S AT WHICH RECENT-DAMAGE MEMORY FADES (WAS 18 — FADES SOONER)

  // ── IMPERFECTION RANGES ──
  AIM_NOISE_AMP_MIN:         0.02,  // NEAR-PERFECT AIM WHEN CALM
  AIM_NOISE_AMP_MAX:         0.11,  // SLIGHTLY SHAKY AT PEAK STRESS
  AIM_NOISE_SPEED:           1.5,   // WOBBLE FREQUENCY
  SHOOT_CHANCE_MIN:          0.97,  // FIRES ALMOST EVERY ELIGIBLE FRAME WHEN CALM
  SHOOT_CHANCE_MAX:          0.84,  // MILD HESITATION UNDER STRESS
  REACTION_MIN:              0.06,  // FAST TARGET ACQUISITION WHEN CALM (S)
  REACTION_MAX:              0.22,  // SLOWER ACQUISITION UNDER STRESS
  MOVE_IMPRECISION_MIN:       8,    // PX NAV NOISE WHEN CALM
  MOVE_IMPRECISION_MAX:      28,    // PX NAV NOISE WHEN STRESSED

  // ── BRAIN FART (STRESS) ─────────────────────
  BRAIN_FART_STRESS_MIN:     0.78,  // HIGHER THRESHOLD — ONLY PANICS WHEN TRULY OVERWHELMED
  BRAIN_FART_CHANCE_MAX:     0.0015, // LESS FREQUENT CONFUSION
  BRAIN_FART_DURATION_MIN:   0.20,  // SHORTER CONFUSION WINDOW
  BRAIN_FART_DURATION_MAX:   0.45,  // SHORTER MAX CONFUSION

  // ── TARGET LOCK ──────
  LOCK_DURATION_MIN:         0.35,  // SECONDS BEFORE SWITCHING TARGETS WHEN CALM
  LOCK_DURATION_MAX:         0.80,  // LONGER TUNNEL VISION WHEN STRESSED

  // ── AUTO-CLICK CONTINUE / RESTART ────────────────────────────────────────
  AUTO_CLICK_DELAY:          2.2,   // SECONDS AFTER OVERLAY APPEARS BEFORE CLICKING

  DEFAULT_BATCH:             30,    // DEFAULT NUMBER OF RUNS PER BATCH
  RESET_DELAY_S:             4.5,   // MUST OUTLAST FULL SHIP DEATH ANIMATION
};

// LINEAR INTERPOLATION HELPER — CLAMPS T TO [0,1] SO CALLERS DON'T NEED TO
function _lerp(a, b, t) { return a + (b - a) * Math.max(0, Math.min(1, t)); }

// ─────────────────────────────────────────────────────────────────────────────
export class BotPlayer {

  constructor() {
    this.enabled = false;

    // WAVE-ONLY MODE — STOP EACH RUN CLEANLY WHEN THE BOSS BATTLE BEGINS
    // RATHER THAN WAITING FOR THE BOT TO DIE IN THE BOSS. THIS KEEPS
    // WAVE 1–5 BALANCE DATA CLEAN AND UNCONTAMINATED BY BOSS MECHANICS.
    this.waveOnlyMode = true;

    this._batchActive    = false;
    this._batchTarget    = BOT.DEFAULT_BATCH;
    this._runStats       = [];
    this._currentRun     = null;
    this._resetPending   = false;
    this._resetTimer     = 0;
    this._pendingAction  = null;  // 'CONTINUE' | 'RESTART' — SET WHEN _RESETPENDING ARMS; NEVER INFERRED FROM STALE RUN STATS
    this._prevInBoss     = false;  // EDGE-DETECT: FALSE → TRUE TRANSITION

    // CALLBACKS 
    this.onRequestContinue = null;  // () => TRANSITIONSCENE._HANDLECONTINUE()
    this.onRequestRestart  = null;  // () => TRANSITIONSCENE._HANDLERESTART()

    this._overlay = null;
    this._statsEl = null;
    this._buildOverlay();
    this._attachHotkey();

    // ── STRESS SYSTEM ────────────────────────────────────────────────────────
    this._stress       = 0;      // 0=CALM, 1=PANIC! 
    this._recentDamage = 0;     
    this._lastShipHP   = null;   

    // ── AIM NOISE  ────────────────────────────────
    this._aimNoiseX  = 0;
    this._aimNoiseY  = 0;
    this._aimPhaseX  = Math.random() * Math.PI * 2;
    this._aimPhaseY  = Math.random() * Math.PI * 2;

    // ── REACTION DELAY ────────────────────────────────────────────────────────
    this._reactionTimer   = 0;
    this._lastAimTarget   = null; 

    // ── BRAIN FART / HIGH STRESS ─────────────────────────────────────
    this._brainFartTimer  = 0;

    // ── TARGET LOCK —──────────
    this._lockedTargetId  = null; 
    this._targetLockTimer = 0;   

    // ── MOVE IMPRECISION (CACHED PER-FRAME SO _SETMOVEMENTKEYS CAN READ IT) ───
    this._currentMoveImprecision = BOT.MOVE_IMPRECISION_MIN;
    // ── AUTO-CLICK STATE ─────────────────────────────────────────────────────
    this._autoClickTimer = 0;
  }
  // ── LIFECYCLE ──────────────────────────────────────────────────────────────

  enable() {
    this.enabled = true;
    this._overlay.style.display = 'block';
    // CONSOLE.LOG('🤖 BOT ENABLED — F8 TO TOGGLE');
  }

  disable() {
    this.enabled = false;
    this._clearKeys();
    this._overlay.style.display = 'none';
    // CONSOLE.LOG('🤖 BOT DISABLED');
  }

  toggle() { this.enabled ? this.disable() : this.enable(); }

  /**
   * START AN AUTOMATED BATCH OF N FULL GAMES.
   * IN WAVEONLYMODE (DEFAULT) EACH RUN ENDS WHEN THE BOSS BATTLE BEGINS —
   * GIVING CLEAN WAVE 1–5 DATA WITHOUT BOSS DEATHS CONTAMINATING THE STATS.
   * @param {NUMBER} SIZE
   */
  startBatch(size = BOT.DEFAULT_BATCH) {
    this._batchTarget  = size;
    this._batchActive  = true;
    this._runStats     = [];
    this._currentRun   = null;
    this._resetPending = false;
    this._prevInBoss   = false;
    this.enable();
    const modeLabel = this.waveOnlyMode ? 'WAVES 1–5 ONLY' : 'FULL GAME';
    console.log(`🤖 BATCH STARTED — ${size} RUNS QUEUED (${modeLabel})`);
  }

  stopBatch() {
    this._batchActive = false;
    this._updateOverlay();
    console.log(
      `🤖 BATCH COMPLETE — ${this._runStats.length} RUNS RECORDED. ` +
      `CALL BOT.EXPORTRESULTS() TO DOWNLOAD JSON.`
    );
  }

  /**
   * CALLED EVERY FRAME FROM MAIN.JS OUTSIDE THE TRANSITIONSCENE.ISBLOCKING GATE.
   * TICKS THE RESET-PENDING COUNTDOWN SO IT ALWAYS DRAINS EVEN WHILE THE DIED/
   * GAMEOVER OVERLAY IS VISIBLE (AT WHICH POINT BOT.UPDATE() STOPS BEING CALLED).
   * @param {NUMBER} DT
   */
  tickBlocked(dt) {
    if (!this.enabled) return;

    // AUTO-CLICK CONTINUE / RESTART — BOT HANDLES ITS OWN DEATH SCREENS VIA DOM
    this._tickAutoClick(dt);

    if (!this._resetPending) return;
    this._resetTimer -= dt;
    if (this._resetTimer <= 0) {
      this._resetPending  = false;
      this._prevInBoss    = false;  // RESET EDGE DETECTOR FOR NEXT RUN
      const action        = this._pendingAction;
      this._pendingAction = null;
      if (action === 'continue') {
        this.onRequestContinue?.();
      } else {
        this.onRequestRestart?.();
      }
    }
  }

  // ── MAIN FRAME UPDATE ──────────────────────────────────────────────────────

  /**
   * CALL EVERY FRAME FROM MAIN.JS WHEN BOT.ENABLED IS TRUE.
   * RETURNS CONTROL INTENT FOR MAIN.JS TO ACT ON; NULL IF BOT IS IDLE / WAITING.
   *
   * @param {NUMBER} DT
   * @param {OBJECT} SNAP
   * @returns {{ AIMNX: NUMBER, AIMNY: NUMBER, SHOULDSHOOT: BOOLEAN } | NULL}
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
      // RESTART SESSION RECORDER FOR EACH RUN SO EVENTS STAY CLEAN PER-RUN.
      // RESTARTFORBOT() RESETS EVENTS WITHOUT TRIGGERING A DOWNLOAD.
      window.SessionRecorder?.restartForBot?.();
    }

    // ── WAVE-ONLY MODE: TREAT BOSS BATTLE ENTRY AS A CLEAN RUN END ───────
    // DETECTS THE FRAME INBOSSBATTLE FIRST BECOMES TRUE — THAT'S THE END OF WAVE 5.
    // WE FINISH THE RUN IMMEDIATELY AND RESTART WITHOUT WAITING FOR THE BOT TO DIE.
    if (this.waveOnlyMode && inBossBattle && !this._prevInBoss && this._currentRun && !this._resetPending) {
      this._finishRun(elapsed, score, ship.lives, true /* BOSSREACHED */);
      if (this._batchActive && this._runStats.length >= this._batchTarget) {
        this.stopBatch();
      } else {
        this._resetPending  = true;
        this._resetTimer    = BOT.RESET_DELAY_S;
        this._pendingAction = 'restart'; // BOSS REACHED = END OF WAVE RUN → RESTART FROM WAVE 1
      }
    }
    this._prevInBoss = inBossBattle;

    // ── NORMAL DEATH HANDLING (FIRES WHEN BOT DIES DURING WAVES 1–5) ─────
    // A "RUN" SPANS ALL 3 LIVES — ONLY FINALIZE IT WHEN LIVES HIT 0 (GAME OVER).
    // MID-RUN DEATHS SET _PENDINGACTION='CONTINUE' SO TICKBLOCKED() FIRES ONREQUESTCONTINUE.
    if (this._currentRun && !ship.isAlive && !this._resetPending) {
      if (ship.lives <= 0) {
        // GAME OVER — THIS RUN IS TRULY DONE
        this._finishRun(elapsed, score, ship.lives, false);
        if (this._batchActive && this._runStats.length >= this._batchTarget) {
          this.stopBatch();
        } else {
          this._resetPending  = true;
          this._resetTimer    = BOT.RESET_DELAY_S;
          this._pendingAction = 'restart'; // GAME OVER → RESTART FROM WAVE 1
        }
      } else {
        // MID-RUN DEATH — CONTINUE WITH REMAINING LIVES, DON'T END THE RUN
        // _PENDINGACTION='CONTINUE' IS THE KEY FIX: PREVIOUSLY THIS FELL THROUGH TO STALE
        // RUN-STATS LOGIC WHICH DEFAULTED TO 'RESTART' ON THE FIRST DEATH OF ANY RUN.
        this._resetPending  = true;
        this._resetTimer    = BOT.RESET_DELAY_S;
        this._pendingAction = 'continue'; // LIVES REMAIN → RESPAWN ON CURRENT WAVE
      }
    }

    // ── WAITING TO RESTART / CONTINUE ─────────────────────────────────────

    if (!ship.isAlive || this._resetPending) {
      this._clearKeys();
      // NOTE: TIMER IS TICKED EXCLUSIVELY IN TICKBLOCKED() — WHICH RUNS EVERY FRAME
      // REGARDLESS OF THE ISBLOCKING GATE. DO NOT DECREMENT HERE TO AVOID DOUBLE-TICKING
      // DURING THE BRIEF WINDOW WHERE SHIP IS DEAD BUT THE OVERLAY HASN'T BLOCKED YET.
      this._updateOverlay();
      return null;
    }

    // ── IN BOSS BATTLE AND NOT WAVE-ONLY — JUST DRIFT TO CENTER AND SHOOT ─
    // (BASIC PLACEHOLDER; NOT USED IN WAVEONLY MODE BY DEFAULT)
    if (inBossBattle && this.waveOnlyMode) {
      this._clearKeys();
      this._updateOverlay();
      return null;
    }

    // ── STRESS & IMPERFECTION ──────────────────────────────────────────────

    this._updateRecentDamage(dt, ship);
    this._computeStress(ship, enemies);
    const stress = this._stress;

    // DERIVE ALL IMPERFECTION PARAMETERS FROM STRESS
    const aimNoiseAmp   = _lerp(BOT.AIM_NOISE_AMP_MIN,     BOT.AIM_NOISE_AMP_MAX,    stress);
    const shootChance   = _lerp(BOT.SHOOT_CHANCE_MIN,       BOT.SHOOT_CHANCE_MAX,     stress);
    const reactionRange = _lerp(BOT.REACTION_MIN,           BOT.REACTION_MAX,         stress);
    this._currentMoveImprecision = _lerp(BOT.MOVE_IMPRECISION_MIN, BOT.MOVE_IMPRECISION_MAX, stress);

    // BRAIN FART — ONLY POSSIBLE ABOVE THE STRESS THRESHOLD
    if (this._brainFartTimer > 0) {
      this._brainFartTimer -= dt;
    } else if (stress > BOT.BRAIN_FART_STRESS_MIN) {
      const scaledChance = ((stress - BOT.BRAIN_FART_STRESS_MIN) / (1 - BOT.BRAIN_FART_STRESS_MIN))
                         * BOT.BRAIN_FART_CHANCE_MAX;
      if (Math.random() < scaledChance) {
        this._brainFartTimer = _lerp(BOT.BRAIN_FART_DURATION_MIN, BOT.BRAIN_FART_DURATION_MAX, stress);
      }
    }
    const confused = this._brainFartTimer > 0;

    // ── AWARENESS ─────────────────────────────────────────────────────────
    // ALWAYS GATHER THREATS, EVEN DURING BRAIN FART.
    // BRAIN FART ONLY AFFECTS AIMING AND SHOOTING, NOT EVASION.
    const threats   = this._gatherThreats(enemyLasers, gooProjectiles, enemies, waveWorm, babyWorms, wormBoss, ship);
    const pickupPts = this._gatherPickups(pickups);

    // ── MOVEMENT DECISION — PRIORITY: EVADE > PICKUP > DRIFT TO CENTER ────

    const evadeDir  = this._evadeDirection(threats, ship);
    //PASS SHIP TO _BESTPICKUP SO DISTANCE IS MEASURED FROM SHIP POSITION, NOT SCREEN CENTER
    const pickupTgt = this._bestPickup(pickupPts, ship);

    let tX, tY;
    const cx = window.innerWidth  / 2;
    const cy = window.innerHeight / 2;

    if (evadeDir) {
      tX = Math.max(BOT.EDGE_MARGIN, Math.min(window.innerWidth  - BOT.EDGE_MARGIN, ship.x + evadeDir.x * BOT.EVADE_RANGE));
      tY = Math.max(BOT.EDGE_MARGIN, Math.min(window.innerHeight - BOT.EDGE_MARGIN, ship.y + evadeDir.y * BOT.EVADE_RANGE));
    } else if (pickupTgt) {
      tX = pickupTgt.x;
      tY = pickupTgt.y;
    } else {
      tX = cx;
      tY = cy;
    }

    this._setMovementKeys(tX, tY, ship);

    // ── AIMING — TARGET LOCK KEEPS THE BOT COMMITTED TO ONE ENEMY ─────────

    this._targetLockTimer -= dt;

    let aimTgt = null;
    if (!confused) {
      if (inBossBattle && wormBoss?.isActive && !wormBoss.isDead) {
        // BOSS BATTLE: ALWAYS AIM AT THE HEAD, NO LOCK NEEDED
        const head = wormBoss.segments?.[0];
        if (head && !head.isDead && head.drawSize > 1) {
          aimTgt = { x: head.screenX, y: head.screenY };
        }
      } else if (this._lockedTargetId !== null && this._targetLockTimer > 0) {
        // TRY TO HONOUR THE CURRENT LOCK (TUNNEL VISION ON EXISTING TARGET)
        const locked = enemies.find(e => !e.isDead && e.id === this._lockedTargetId
                                      && e.scale >= BOT.MIN_ENEMY_SCALE_TO_SHOOT);
        if (locked) aimTgt = { x: locked.x, y: locked.y };
      }

      if (!aimTgt) {
        // LOCK EXPIRED OR TARGET GONE — PICK A NEW ONE AND START A FRESH LOCK
        const best = this._pickAimTarget(enemies, waveWorm, wormBoss, inBossBattle, ship);
        if (best) {
          aimTgt = best;
          const lockDur = _lerp(BOT.LOCK_DURATION_MIN, BOT.LOCK_DURATION_MAX, stress)
                        + Math.random() * 0.15;
          this._targetLockTimer = lockDur;
          // STORE THE ID SO WE CAN RE-FIND THIS ENEMY NEXT FRAME
          const matched = enemies.find(e => !e.isDead && Math.abs(e.x - best.x) < 5 && Math.abs(e.y - best.y) < 5);
          this._lockedTargetId = matched?.id ?? null;
        } else {
          this._lockedTargetId  = null;
          this._targetLockTimer = 0;
        }
      }
    }

    // REACTION DELAY — RESET WHEN TARGET CHANGES (KEY = ROUNDED POSITION)
    const tgtKey = aimTgt ? `${Math.round(aimTgt.x / 10)},${Math.round(aimTgt.y / 10)}` : null;
    if (tgtKey !== this._lastAimTarget) {
      this._lastAimTarget = tgtKey;
      this._reactionTimer = reactionRange * (0.5 + Math.random() * 0.5);
    }
    if (this._reactionTimer > 0) this._reactionTimer -= dt;
    const hasReacted = this._reactionTimer <= 0;

    // AIM NOISE — SINE-WAVE WOBBLE SCALED BY STRESS
    this._updateAimNoise(dt, aimNoiseAmp);

    let aimNX = 0, aimNY = 0;
    if (aimTgt && hasReacted) {
      const dx  = aimTgt.x - cx;
      const dy  = aimTgt.y - cy;
      const mag = Math.sqrt(dx * dx + dy * dy) || 1;
      aimNX = dx / mag + this._aimNoiseX;
      aimNY = -dy / mag + this._aimNoiseY; // CROSSHAIR RAWY: POSITIVE = UP
    }

    // SHOOT HESITATION — MISS SHOTS MORE WHEN STRESSED
    const shouldShoot = !!aimTgt && hasReacted && !confused && (Math.random() < shootChance);

    this._updateOverlay();
    return { aimNX, aimNY, shouldShoot };
  }
  

  // ── AUTO-CLICK ────────────────────────────────────────────────────────────

  /**
   * WATCHES FOR ACTIVE DEATH/GAMEOVER OVERLAYS AND CLICKS THE RIGHT BUTTON
   * AFTER AUTO_CLICK_DELAY SECONDS. FULLY DOM-DRIVEN — NO RELIANCE ON
   * CALLBACK TIMING SO IT WORKS RELIABLY WITH THE DEATH ANIMATION SEQUENCE.
   */
  _tickAutoClick(dt) {
    const diedActive     = document.getElementById('died-overlay')?.classList.contains('active');
    const gameoverActive = document.getElementById('gameover-overlay')?.classList.contains('active');

    if (diedActive || gameoverActive) {
      this._autoClickTimer += dt;
      if (this._autoClickTimer >= BOT.AUTO_CLICK_DELAY) {
        this._autoClickTimer = 0;
        if (diedActive) {
          document.getElementById('btn-continue')?.click();
        } else {
          document.getElementById('btn-restart')?.click();
        }
      }
    } else {
      this._autoClickTimer = 0; // RESET WHEN OVERLAY IS GONE — PREVENTS DOUBLE-FIRE
    }
  }

  // ── STRESS SYSTEM ─────────────────────────────────────────────────────────

  /**
   * DETECTS HP DROPS SINCE LAST FRAME AND ACCUMULATES THEM INTO _RECENTDAMAGE,
   * WHICH DECAYS OVER TIME. THIS GIVES THE STRESS SYSTEM A "DAMAGE MEMORY"
   * SO GETTING HIT ONCE RAISES STRESS EVEN IF HP IS STILL HIGH.
   */
  _updateRecentDamage(dt, ship) {
    if (this._lastShipHP !== null && ship.hp < this._lastShipHP) {
      this._recentDamage += (this._lastShipHP - ship.hp);
    }
    this._lastShipHP = ship.hp;
    this._recentDamage = Math.max(0, this._recentDamage - BOT.DAMAGE_DECAY_RATE * dt);
  }

  /**
   * COMPUTES STRESS (0–1) FROM THREE INPUTS:
   *   HP LEVEL   — LOW HP = HIGH STRESS
   *   RECENT DAMAGE — GETTING HIT SPIKES STRESS EVEN WITH HP TO SPARE
   *   NEARBY ENEMIES — MULTIPLE ENEMIES IN RANGE = PRESSURE
   *
   * STRESS RISES QUICKLY BUT FALLS SLOWLY, MATCHING HOW REAL PLAYERS FEEL:
   * ONE BAD MOMENT CAN RATTLE YOU FOR SEVERAL SECONDS.
   */
  _computeStress(ship, enemies) {
    const hpPct    = ship.hp / (ship.maxHP || 100);
    const hpStress = 1 - hpPct;

    const nearbyCount = enemies.filter(e => {
      if (e.isDead || e.scale < 0.50) return false;
      const dx = e.x - ship.x, dy = e.y - ship.y;
      return (dx * dx + dy * dy) < BOT.STRESS_ENEMY_RADIUS * BOT.STRESS_ENEMY_RADIUS;
    }).length;
    const enemyStress  = Math.min(1, nearbyCount / BOT.STRESS_ENEMY_CAP);
    const damageStress = Math.min(1, this._recentDamage / 40);

    const target = Math.min(1,
      hpStress    * BOT.STRESS_HP_WEIGHT     +
      enemyStress * BOT.STRESS_ENEMY_WEIGHT  +
      damageStress * BOT.STRESS_DAMAGE_WEIGHT,
    );

    // ASYMMETRIC LERP — SPIKES FAST, DECAYS SLOW
    const rate = target > this._stress ? BOT.STRESS_RISE_RATE : BOT.STRESS_DECAY_RATE;
    this._stress = Math.max(0, Math.min(1, this._stress + (target - this._stress) * rate));
  }

  // ── AIM NOISE ─────────────────────────────────────────────────────────────

  /**
   * ADVANCES TWO DE-SYNCED SINE WAVES AND SETS _AIMNOISEX/Y.
   * AMPLITUDE IS PASSED IN PER-FRAME FROM THE STRESS-SCALED VALUE SO NOISE
   * IS ALMOST ZERO WHEN CALM AND PEAKS ONLY WHEN THE BOT IS OVERWHELMED.
   */
  _updateAimNoise(dt, amp) {
    this._aimPhaseX += BOT.AIM_NOISE_SPEED * dt;
    this._aimPhaseY += BOT.AIM_NOISE_SPEED * 1.13 * dt; // SLIGHT FREQ OFFSET — DESYNC X/Y
    this._aimNoiseX  = Math.sin(this._aimPhaseX) * amp;
    this._aimNoiseY  = Math.cos(this._aimPhaseY) * amp;
  }

  // ── THREAT GATHERING ──────────────────────────────────────────────────────
  _gatherThreats(lasers, goos, enemies, waveWorm, babyWorms, wormBoss, ship) {
    const threats = [];
    const la      = BOT.EVADE_LOOKAHEAD_S;
    const gravity = CONFIG.GOO_PROJECTILE.GRAVITY;
    for (const l of lasers) {     // ── ENEMY LASER BOLTS — LINEAR POSITION PREDICTION
      if (l.isDead) continue;
      threats.push({
        fx: l.x + l.dirX * l.speed * la,
        fy: l.y + l.dirY * l.speed * la,
        r:  BOT.LASER_THREAT_RADIUS,
        w:  1.3,   // SLIGHTLY HIGHER WEIGHT — FAST AND ACCURATE
      });
    }

    for (const g of goos) {     // ── GOO ARCS — APPROXIMATE THE PARABOLA WITH A MIDPOINT GRAVITY STEP
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
      if (e.isDead || e.scale < 0.55) continue;
      threats.push({ fx: e.x, fy: e.y, r: BOT.ENEMY_BODY_RADIUS, w: 0.8 });
    }

    if (waveWorm && !waveWorm.isDead && waveWorm.scale > 0.45) {     // ── WAVE WORM (LARGER BUBBLE — IT'S FAST AT HIGH SCALE)
      threats.push({ fx: waveWorm.x, fy: waveWorm.y, r: BOT.ENEMY_BODY_RADIUS * 1.5, w: 1.1 });
    }

    for (const b of (babyWorms ?? [])) {     // ── BABY WORMS (SEEKING; IGNORE LATCHED ONES — BARREL ROLL HANDLES THOSE)
      if (b.isDead || b.isLatched) continue;
      threats.push({ fx: b.x, fy: b.y, r: BOT.BABY_WORM_RADIUS, w: 0.75 });
    }

    if (wormBoss?.isActive && !wormBoss.isDead && ship.suctionScale < BOT.BOSS_SUCTION_THRESHOLD) {     // ── BOSS SUCTION — WORM HEAD BECOMES A GRAVITY WELL WHEN SHIP IS SHRINKING
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

      const strength = (1 - dist / t.r) * t.w;       // IF SHIP IS EXACTLY ON TOP OF A THREAT, PICK A RANDOM ESCAPE DIRECTION
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

  // ── PICKUP LOGIC 
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

  _bestPickup(list, ship) {
    let best = null, bestScore = BOT.MIN_PICKUP_SCORE;

    for (const p of list) {
      const dx    = p.x - ship.x;
      const dy    = p.y - ship.y;
      const dist  = Math.sqrt(dx * dx + dy * dy);
      const score = p.v - dist * BOT.DIST_PENALTY_PER_PX;
      if (score > bestScore) { bestScore = score; best = p; }
    }

    return best;
  }

  // ── MOVEMENT 
  _setMovementKeys(tx, ty, ship) { // ADD STRESS-SCALED POSITION NOISE — 
    const noiseX = (Math.random() - 0.5) * this._currentMoveImprecision;
    const noiseY = (Math.random() - 0.5) * this._currentMoveImprecision;
    const dx = (tx + noiseX) - ship.x;
    const dy = (ty + noiseY) - ship.y;
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

  _pickAimTarget(enemies, waveWorm, wormBoss, inBossBattle, ship) {  // ── AIMING 
    let best = null, bestScore = -Infinity;

    if (inBossBattle && wormBoss?.isActive && !wormBoss.isDead) {  // BOSS BATTLE: ALWAYS AIM AT THE WORM HEAD
      const head = wormBoss.segments?.[0];
      if (head && !head.isDead && head.drawSize > 1) {
        return { x: head.screenX, y: head.screenY };
      }
    }

    for (const e of enemies) {  // REGULAR ENEMIES: SCORE BY SIZE * PROXIMITY, SLIGHT BONUS FOR TANK (HIGH HP = MORE WORTH KILLING)
      if (e.isDead || e.scale < BOT.MIN_ENEMY_SCALE_TO_SHOOT) continue;
      const dx    = e.x - ship.x;
      const dy    = e.y - ship.y;
      const dist  = Math.sqrt(dx * dx + dy * dy);
      const score = e.scale * 110 - dist * 0.22 + (e.type === 'TANK' ? 18 : 0);
      if (score > bestScore) { bestScore = score; best = { x: e.x, y: e.y }; }
    }

    // HIGH-PRIORITY: WAVE WORM
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
  /**
   * @param {NUMBER}  ELAPSED
   * @param {NUMBER}  SCORE
   * @param {NUMBER}  LIVESATEND
   * @param {BOOLEAN} BOSSREACHED  TRUE WHEN RUN ENDED BY REACHING BOSS (WAVE-ONLY MODE SUCCESS)
   */
  _finishRun(elapsed, score, livesAtEnd, bossReached = false) {
    if (!this._currentRun) return;
    const r = this._currentRun;
    this._runStats.push({
      run:          this._runStats.length + 1,
      survivalTime: +(elapsed - r.startTime).toFixed(1),
      score:        Math.max(0, score - r.startScore),
      livesLost:    Math.max(0, r.startLives - livesAtEnd),
      livesAtEnd,
      bossReached,   // USEFUL FOR FILTERING: TRUE = MADE IT THROUGH ALL 5 WAVES
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
        '🤖 NOODLE IS NOW PLAYING' +
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
      const stressBar = '█'.repeat(Math.round(this._stress * 8)).padEnd(8, '░');
      this._statsEl.textContent = (this._currentRun ? 'RUN 1 — IN PROGRESS' : 'WAITING…')
        + `\nSTRESS: [${stressBar}]`;
      return;
    }

    const modeTag  = this.waveOnlyMode ? ' [WAVES 1–5]' : '';
    const bStr     = this._batchActive ? ` / ${this._batchTarget}` : '';
    const avgSurv  = (this._runStats.reduce((s, r) => s + r.survivalTime, 0) / n).toFixed(1);
    const avgScore = Math.round(this._runStats.reduce((s, r) => s + r.score, 0) / n);
    const avgLost  = (this._runStats.reduce((s, r) => s + r.livesLost, 0) / n).toFixed(1);
    const bossHits = this._runStats.filter(r => r.bossReached).length;
    const last     = this._runStats[n - 1];
    const inProg   = this._currentRun ? `\nRUN ${n + 1} — IN PROGRESS` : '';

    const stressBar  = '█'.repeat(Math.round(this._stress * 8)).padEnd(8, '░');
    const stressLabel = this._stress < 0.3 ? 'CALM' : this._stress < 0.62 ? 'PRESSURED' : 'STRESSED';

    this._statsEl.textContent =
      `RUNS:      ${n}${bStr}${modeTag}\n` +
      `AVG SURV:  ${avgSurv}S\n` +
      `AVG SCORE: ${avgScore}\n` +
      `AVG LIVES: ${avgLost} LOST\n` +
      `BOSS REACH:${bossHits} / ${n}\n` +
      `──────────────────\n` +
      `LAST: ${last.survivalTime}S  ${last.score}PTS\n` +
      `      ×${last.livesLost} LIVES LOST\n` +
      `──────────────────\n` +
      `STRESS: [${stressBar}] ${stressLabel}` +
      inProg;
  }

  _attachHotkey() {
    window.addEventListener('keydown', e => {
      if (e.code === 'F8') { e.preventDefault(); this.toggle(); }
    });
  }

  // ── PUBLIC API ────────────────────────────────────────────────────────────

  /**
   * APPEND BOT CONTROL BUTTONS TO THE EXISTING DEVTOOLS PANEL - CALL AFTER DEVTOOLS.INIT(): BOT.MOUNTTODEVPANEL(DEVTOOLS.PANEL)
   * @param {HTMLELEMENT} PANEL EL
   */
  mountToDevPanel(panelEl) {
    if (!panelEl) return;

    const heading = document.createElement('div');
    heading.textContent = 'PLAYTEST BOT: NOODLE';
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
    batchLabel.textContent = 'BATCH SIZE:';
    batchLabel.style.cssText = 'font-size:11px; opacity:0.7;';

    // WAVE-ONLY MODE TOGGLE
    const waveOnlyRow = document.createElement('div');
    waveOnlyRow.style.cssText = 'display:flex; align-items:center; gap:6px; font-size:11px;';
    const waveOnlyCheck = document.createElement('input');
    waveOnlyCheck.type    = 'checkbox';
    waveOnlyCheck.checked = this.waveOnlyMode;
    waveOnlyCheck.style.cursor = 'pointer';
    waveOnlyCheck.addEventListener('change', () => {
      this.waveOnlyMode = waveOnlyCheck.checked;
    });
    const waveOnlyLabel = document.createElement('label');
    waveOnlyLabel.textContent = 'WAVES 1–5 ONLY';
    waveOnlyLabel.style.cssText = 'cursor:pointer; opacity:0.85;';
    waveOnlyLabel.addEventListener('click', () => {
      waveOnlyCheck.checked = !waveOnlyCheck.checked;
      this.waveOnlyMode = waveOnlyCheck.checked;
    });
    waveOnlyRow.appendChild(waveOnlyCheck);
    waveOnlyRow.appendChild(waveOnlyLabel);

    row.appendChild(batchLabel);
    row.appendChild(batchSizeInput);
    row.appendChild(waveOnlyRow);
    row.appendChild(makeBtn('LET NOODLE PLAY  [F8]',       () => this.toggle()));
    row.appendChild(makeBtn('▶ START BATCH',           () => this.startBatch(parseInt(batchSizeInput.value, 10) || BOT.DEFAULT_BATCH)));
    row.appendChild(makeBtn('⏹ STOP BATCH',            () => this.stopBatch()));
    row.appendChild(makeBtn('⬇ EXPORT RESULTS JSON',  () => this.exportResults()));

    panelEl.appendChild(row);
  }

  /** @returns {ARRAY} COPY OF PER-RUN STAT OBJECTS */
  getResults() { return [...this._runStats]; }

  /** DOWNLOAD A JSON FILE WITH FULL RUN STATS + SUMMARY */
  exportResults() {
    if (!this._runStats.length) {
      console.warn('🤖 NO BOT RESULTS TO EXPORT YET.');
      return;
    }
    const n        = this._runStats.length;
    const avgSurv  = +(this._runStats.reduce((s, r) => s + r.survivalTime, 0) / n).toFixed(1);
    const avgScore = Math.round(this._runStats.reduce((s, r) => s + r.score, 0) / n);
    const avgLives = +(this._runStats.reduce((s, r) => s + r.livesLost, 0) / n).toFixed(2);
    const bossReachRate = +(this._runStats.filter(r => r.bossReached).length / n * 100).toFixed(1);

    const payload  = {
      meta: {
        generatedAt:   new Date().toISOString(),
        totalRuns:     n,
        waveOnlyMode:  this.waveOnlyMode,
      },
      summary: {
        avgSurvivalTime:  avgSurv,
        avgScore,
        avgLivesLost:     avgLives,
        bossReachRatePct: bossReachRate,  // % OF RUNS THAT MADE IT THROUGH ALL 5 WAVES
      },
      runs: this._runStats,
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `bot_results_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);  // FREE MEMORY AFTER CLICK

    console.log(`🤖 EXPORTED ${n} RUNS.`);
  }
}