// Updated 4/18/26 @ 5:30AM
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
  LASER_THREAT_RADIUS:      95,     // px — EVASION BUBBLE AROUND INCOMING LASER
  GOO_THREAT_RADIUS:        105,    // px — GOO ARC PREDICTION BUBBLE
  ENEMY_BODY_RADIUS:        115,    // px
  BABY_WORM_RADIUS:          60,    // px
  BOSS_SUCTION_THRESHOLD:    0.72,  // SUCTION SCALE — BELOW THIS EVADE THE WORM HEAD
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

  // ── STRESS SYSTEM ─────────────────────────────────────────────────────────
  STRESS_HP_WEIGHT:          0.35,  // CONTRIBUTION FROM LOW HP
  STRESS_DAMAGE_WEIGHT:      0.30,  // CONTRIBUTION FROM RECENT DAMAGE
  STRESS_ENEMY_WEIGHT:       0.35,  // CONTRIBUTION FROM NEARBY COMBAT ENEMIES
  STRESS_ENEMY_RADIUS:       280,   // px — "NEARBY" THRESHOLD
  STRESS_ENEMY_CAP:          3,     // ENEMY COUNT THAT MAXES THIS COMPONENT
  STRESS_RISE_RATE:          0.12,  // HOW FAST STRESS CLIMBS (LERP FACTOR PER FRAME)
  STRESS_DECAY_RATE:         0.025, // HOW FAST STRESS FALLS (SLOW — RECOVERY TAKES TIME)
  DAMAGE_DECAY_RATE:         18,    // HP/s AT WHICH RECENT-DAMAGE MEMORY FADES

  // ── IMPERFECTION RANGES ──
  AIM_NOISE_AMP_MIN:         0.02,  // NEAR-PERFECT AIM WHEN CALM
  AIM_NOISE_AMP_MAX:         0.20,  // SHAKY AIM WHEN OVERWHELMED
  AIM_NOISE_SPEED:           1.5,   // WOBBLE FREQUENCY
  SHOOT_CHANCE_MIN:          0.97,  // FIRES ALMOST EVERY ELIGIBLE FRAME WHEN CALM
  SHOOT_CHANCE_MAX:          0.72,  // HESITANT TRIGGER WHEN STRESSED
  REACTION_MIN:              0.06,  // FAST TARGET ACQUISITION WHEN CALM (s)
  REACTION_MAX:              0.30,  // SLOW ACQUISITION UNDER PRESSURE (s)
  MOVE_IMPRECISION_MIN:       8,    // px NAV NOISE WHEN CALM
  MOVE_IMPRECISION_MAX:      42,    // px NAV NOISE WHEN STRESSED

  // ── BRAIN FART (STRESS) ─────────────────────
  BRAIN_FART_STRESS_MIN:     0.62,  // STRESS LEVEL BELOW WHICH BRAIN FARTS NEVER OCCUR
  BRAIN_FART_CHANCE_MAX:     0.003, // PER-FRAME CHANCE AT MAXIMUM STRESS
  BRAIN_FART_DURATION_MIN:   0.35,  // SHORTEST CONFUSION WINDOW (s)
  BRAIN_FART_DURATION_MAX:   0.70,  // LONGEST CONFUSION WINDOW (s)

  // ── TARGET LOCK ──────
  LOCK_DURATION_MIN:         0.35,  // SECONDS BEFORE SWITCHING TARGETS WHEN CALM
  LOCK_DURATION_MAX:         0.80,  // LONGER TUNNEL VISION WHEN STRESSED

  // ── AUTO-CLICK CONTINUE / RESTART ────────────────────────────────────────
  AUTO_CLICK_DELAY:          2.2,   // SECONDS AFTER OVERLAY APPEARS BEFORE CLICKING

  DEFAULT_BATCH:             30,    // DEFAULT NUMBER OF RUNS PER BATCH
  RESET_DELAY_S:             4.5,   // MUST OUTLAST FULL SHIP DEATH ANIMATION
};

// LINEAR INTERPOLATION HELPER — CLAMPS t TO [0,1] SO CALLERS DON'T NEED TO
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
    this._prevInBoss     = false;  // EDGE-DETECT: FALSE → TRUE TRANSITION

    // CALLBACKS 
    this.onRequestContinue = null;  // () => transitionScene._handleContinue()
    this.onRequestRestart  = null;  // () => transitionScene._handleRestart()

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

    // ── MOVE IMPRECISION (cached per-frame so _setMovementKeys can read it) ───
    this._currentMoveImprecision = BOT.MOVE_IMPRECISION_MIN;
    // ── AUTO-CLICK STATE ─────────────────────────────────────────────────────
    this._autoClickTimer = 0;
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
   * In waveOnlyMode (default) each run ends when the boss battle begins —
   * giving clean wave 1–5 data without boss deaths contaminating the stats.
   * @param {number} size
   */
  startBatch(size = BOT.DEFAULT_BATCH) {
    this._batchTarget  = size;
    this._batchActive  = true;
    this._runStats     = [];
    this._currentRun   = null;
    this._resetPending = false;
    this._prevInBoss   = false;
    this.enable();
    const modeLabel = this.waveOnlyMode ? 'waves 1–5 only' : 'full game';
    console.log(`🤖 Batch started — ${size} runs queued (${modeLabel})`);
  }

  stopBatch() {
    this._batchActive = false;
    this._updateOverlay();
    console.log(
      `🤖 Batch complete — ${this._runStats.length} runs recorded. ` +
      `Call bot.exportResults() to download JSON.`
    );
  }

  /**
   * Called every frame from main.js OUTSIDE the transitionScene.isBlocking gate.
   * Ticks the reset-pending countdown so it always drains even while the died/
   * gameover overlay is visible (at which point bot.update() stops being called).
   * @param {number} dt
   */
  tickBlocked(dt) {
    if (!this.enabled) return;

    // AUTO-CLICK CONTINUE / RESTART — bot handles its own death screens via DOM
    this._tickAutoClick(dt);

    if (!this._resetPending) return;
    this._resetTimer -= dt;
    if (this._resetTimer <= 0) {
      this._resetPending = false;
      this._prevInBoss   = false;  // RESET EDGE DETECTOR FOR NEXT RUN
      const last = this._runStats[this._runStats.length - 1];
      // RESTART RULES:
      //   bossReached=true  → ALWAYS RESTART (RUN ENDED CLEANLY AT BOSS ENTRY; RESET TO WAVE 1)
      //   livesAtEnd=0      → ALWAYS RESTART (GAME OVER)
      //   died w/ lives left → CONTINUE (RESPAWN ON CURRENT WAVE, USE REMAINING LIVES)
      if ((last?.bossReached) || (last?.livesAtEnd ?? 0) <= 0) {
        this.onRequestRestart?.();
      } else {
        this.onRequestContinue?.();
      }
    }
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

    // ── WAVE-ONLY MODE: TREAT BOSS BATTLE ENTRY AS A CLEAN RUN END ───────
    // DETECTS THE FRAME inBossBattle FIRST BECOMES TRUE — THAT'S THE END OF WAVE 5.
    // WE FINISH THE RUN IMMEDIATELY AND RESTART WITHOUT WAITING FOR THE BOT TO DIE.
    if (this.waveOnlyMode && inBossBattle && !this._prevInBoss && this._currentRun && !this._resetPending) {
      this._finishRun(elapsed, score, ship.lives, true /* bossReached */);
      if (this._batchActive && this._runStats.length >= this._batchTarget) {
        this.stopBatch();
      } else {
        this._resetPending = true;
        this._resetTimer   = BOT.RESET_DELAY_S;
      }
    }
    this._prevInBoss = inBossBattle;

    // ── NORMAL DEATH HANDLING (FIRES WHEN BOT DIES DURING WAVES 1–5) ─────
    // A "run" spans all 3 lives — only finalize it when lives hit 0 (game over).
    // Mid-run deaths just set _resetPending so tickBlocked() fires onRequestContinue.
    if (this._currentRun && !ship.isAlive) {
      if (ship.lives <= 0) {
        // GAME OVER — THIS RUN IS TRULY DONE
        this._finishRun(elapsed, score, ship.lives, false);
        if (this._batchActive && this._runStats.length >= this._batchTarget) {
          this.stopBatch();
        } else {
          this._resetPending = true;
          this._resetTimer   = BOT.RESET_DELAY_S;
        }
      } else {
        // MID-RUN DEATH — CONTINUE WITH REMAINING LIVES, DON'T END THE RUN
        this._resetPending = true;
        this._resetTimer   = BOT.RESET_DELAY_S;
      }
    }

    // ── WAITING TO RESTART ─────────────────────────────────────────────────

    if (!ship.isAlive || this._resetPending) {
      this._clearKeys();
      if (this._resetPending) {
        this._resetTimer -= dt;
        if (this._resetTimer <= 0) {
          this._resetPending = false;
          this._prevInBoss   = false;  // RESET EDGE DETECTOR FOR NEXT RUN
          const last = this._runStats[this._runStats.length - 1];
          // RESTART RULES:
          //   bossReached=true  → ALWAYS RESTART (RUN ENDED CLEANLY AT BOSS ENTRY; RESET TO WAVE 1)
          //   livesAtEnd=0      → ALWAYS RESTART (GAME OVER)
          //   died w/ lives left → CONTINUE (RESPAWN ON CURRENT WAVE, USE REMAINING LIVES)
          if ((last?.bossReached) || (last?.livesAtEnd ?? 0) <= 0) {
            this.onRequestRestart?.();
          } else {
            this.onRequestContinue?.();
          }
        }
      }
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

    // Derive all imperfection parameters from stress
    const aimNoiseAmp   = _lerp(BOT.AIM_NOISE_AMP_MIN,     BOT.AIM_NOISE_AMP_MAX,    stress);
    const shootChance   = _lerp(BOT.SHOOT_CHANCE_MIN,       BOT.SHOOT_CHANCE_MAX,     stress);
    const reactionRange = _lerp(BOT.REACTION_MIN,           BOT.REACTION_MAX,         stress);
    this._currentMoveImprecision = _lerp(BOT.MOVE_IMPRECISION_MIN, BOT.MOVE_IMPRECISION_MAX, stress);

    // BRAIN FART — only possible above the stress threshold
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

    const threats   = confused ? [] : this._gatherThreats(enemyLasers, gooProjectiles, enemies, waveWorm, babyWorms, wormBoss, ship);
    const pickupPts = this._gatherPickups(pickups);

    // ── MOVEMENT DECISION — priority: evade > pickup > drift to center ────

    const evadeDir  = this._evadeDirection(threats, ship);
    const pickupTgt = this._bestPickup(pickupPts);

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

    // ── AIMING — target lock keeps the bot committed to one enemy ─────────

    this._targetLockTimer -= dt;

    let aimTgt = null;
    if (!confused) {
      if (inBossBattle && wormBoss?.isActive && !wormBoss.isDead) {
        // Boss battle: always aim at the head, no lock needed
        const head = wormBoss.segments?.[0];
        if (head && !head.isDead && head.drawSize > 1) {
          aimTgt = { x: head.screenX, y: head.screenY };
        }
      } else if (this._lockedTargetId !== null && this._targetLockTimer > 0) {
        // Try to honour the current lock (tunnel vision on existing target)
        const locked = enemies.find(e => !e.isDead && e.id === this._lockedTargetId
                                      && e.scale >= BOT.MIN_ENEMY_SCALE_TO_SHOOT);
        if (locked) aimTgt = { x: locked.x, y: locked.y };
      }

      if (!aimTgt) {
        // Lock expired or target gone — pick a new one and start a fresh lock
        const best = this._pickAimTarget(enemies, waveWorm, wormBoss, inBossBattle, ship);
        if (best) {
          aimTgt = best;
          const lockDur = _lerp(BOT.LOCK_DURATION_MIN, BOT.LOCK_DURATION_MAX, stress)
                        + Math.random() * 0.15;
          this._targetLockTimer = lockDur;
          // Store the ID so we can re-find this enemy next frame
          const matched = enemies.find(e => !e.isDead && Math.abs(e.x - best.x) < 5 && Math.abs(e.y - best.y) < 5);
          this._lockedTargetId = matched?.id ?? null;
        } else {
          this._lockedTargetId  = null;
          this._targetLockTimer = 0;
        }
      }
    }

    // REACTION DELAY — reset when target changes (key = rounded position)
    const tgtKey = aimTgt ? `${Math.round(aimTgt.x / 10)},${Math.round(aimTgt.y / 10)}` : null;
    if (tgtKey !== this._lastAimTarget) {
      this._lastAimTarget = tgtKey;
      this._reactionTimer = reactionRange * (0.5 + Math.random() * 0.5);
    }
    if (this._reactionTimer > 0) this._reactionTimer -= dt;
    const hasReacted = this._reactionTimer <= 0;

    // AIM NOISE — sine-wave wobble scaled by stress
    this._updateAimNoise(dt, aimNoiseAmp);

    let aimNX = 0, aimNY = 0;
    if (aimTgt && hasReacted) {
      const dx  = aimTgt.x - cx;
      const dy  = aimTgt.y - cy;
      const mag = Math.sqrt(dx * dx + dy * dy) || 1;
      aimNX = dx / mag + this._aimNoiseX;
      aimNY = -dy / mag + this._aimNoiseY; // crosshair rawY: positive = up
    }

    // SHOOT HESITATION — miss shots more when stressed
    const shouldShoot = !!aimTgt && hasReacted && !confused && (Math.random() < shootChance);

    this._updateOverlay();
    return { aimNX, aimNY, shouldShoot };
  }
  

  // ── AUTO-CLICK ────────────────────────────────────────────────────────────

  /**
   * Watches for active death/gameover overlays and clicks the right button
   * after AUTO_CLICK_DELAY seconds. Fully DOM-driven — no reliance on
   * callback timing so it works reliably with the death animation sequence.
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
   * Detects HP drops since last frame and accumulates them into _recentDamage,
   * which decays over time. This gives the stress system a "damage memory"
   * so getting hit once raises stress even if HP is still high.
   */
  _updateRecentDamage(dt, ship) {
    if (this._lastShipHP !== null && ship.hp < this._lastShipHP) {
      this._recentDamage += (this._lastShipHP - ship.hp);
    }
    this._lastShipHP = ship.hp;
    this._recentDamage = Math.max(0, this._recentDamage - BOT.DAMAGE_DECAY_RATE * dt);
  }

  /**
   * Computes stress (0–1) from three inputs:
   *   HP level   — low HP = high stress
   *   Recent damage — getting hit spikes stress even with HP to spare
   *   Nearby enemies — multiple enemies in range = pressure
   *
   * Stress rises quickly but falls slowly, matching how real players feel:
   * one bad moment can rattle you for several seconds.
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

    // ASYMMETRIC LERP — spikes fast, decays slow
    const rate = target > this._stress ? BOT.STRESS_RISE_RATE : BOT.STRESS_DECAY_RATE;
    this._stress = Math.max(0, Math.min(1, this._stress + (target - this._stress) * rate));
  }

  // ── AIM NOISE ─────────────────────────────────────────────────────────────

  /**
   * Advances two de-synced sine waves and sets _aimNoiseX/Y.
   * Amplitude is passed in per-frame from the stress-scaled value so noise
   * is almost zero when calm and peaks only when the bot is overwhelmed.
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

    // ── ENEMY LASER BOLTS — LINEAR POSITION PREDICTION
    for (const l of lasers) {
      if (l.isDead) continue;
      threats.push({
        fx: l.x + l.dirX * l.speed * la,
        fy: l.y + l.dirY * l.speed * la,
        r:  BOT.LASER_THREAT_RADIUS,
        w:  1.3,   // SLIGHTLY HIGHER WEIGHT — FAST AND ACCURATE
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
    // ADD STRESS-SCALED POSITION NOISE — 
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
   * @param {number}  elapsed
   * @param {number}  score
   * @param {number}  livesAtEnd
   * @param {boolean} bossReached  TRUE WHEN RUN ENDED BY REACHING BOSS (WAVE-ONLY MODE SUCCESS)
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
      this._statsEl.textContent = (this._currentRun ? 'Run 1 — in progress' : 'Waiting…')
        + `\nStress: [${stressBar}]`;
      return;
    }

    const modeTag  = this.waveOnlyMode ? ' [waves 1–5]' : '';
    const bStr     = this._batchActive ? ` / ${this._batchTarget}` : '';
    const avgSurv  = (this._runStats.reduce((s, r) => s + r.survivalTime, 0) / n).toFixed(1);
    const avgScore = Math.round(this._runStats.reduce((s, r) => s + r.score, 0) / n);
    const avgLost  = (this._runStats.reduce((s, r) => s + r.livesLost, 0) / n).toFixed(1);
    const bossHits = this._runStats.filter(r => r.bossReached).length;
    const last     = this._runStats[n - 1];
    const inProg   = this._currentRun ? `\nRun ${n + 1} — in progress` : '';

    const stressBar  = '█'.repeat(Math.round(this._stress * 8)).padEnd(8, '░');
    const stressLabel = this._stress < 0.3 ? 'calm' : this._stress < 0.62 ? 'pressured' : 'stressed';

    this._statsEl.textContent =
      `Runs:      ${n}${bStr}${modeTag}\n` +
      `Avg surv:  ${avgSurv}s\n` +
      `Avg score: ${avgScore}\n` +
      `Avg lives: ${avgLost} lost\n` +
      `Boss reach:${bossHits} / ${n}\n` +
      `──────────────────\n` +
      `Last: ${last.survivalTime}s  ${last.score}pts\n` +
      `      ×${last.livesLost} lives lost\n` +
      `──────────────────\n` +
      `Stress: [${stressBar}] ${stressLabel}` +
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
    heading.textContent = 'Playtest Bot: Noodle';
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
    waveOnlyLabel.textContent = 'Waves 1–5 only';
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
    row.appendChild(makeBtn('Let Noodle Play  [F8]',       () => this.toggle()));
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

    console.log(`🤖 Exported ${n} runs.`);
  }
}