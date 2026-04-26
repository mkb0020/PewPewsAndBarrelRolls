// main.js - Updated 4/26/26 @ 6am
// ~~~~~~~~~~~~~~~~~~~~ IMPORTS ~~~~~~~~~~~~~~~~~~~~
import { CONFIG }                                    from './utils/config.js';
import { initKeyboard, initMobileControls, revealMobileControls } from './utils/controls.js';
import { segmentCircleCollision }                    from './utils/collision.js';
import { AudioManager }                              from './utils/audio.js';
import { GameUI }                                    from './utils/ui.js';
import { ScoreManager }                              from './utils/score.js';
import { ImageLoader }                               from './utils/imageLoader.js';
import { Tunnel }                                    from './visuals/tunnel.js';
import { Ship }                                      from './entities/ship.js';
import { EnemyManager, setActiveSingularityBH }      from './entities/enemies.js';
import { ProjectileManager, Crosshair, MuzzleFlash } from './entities/projectiles.js';
import { WormBoss }                                  from './entities/worm.js';
import { BabyWormManager }                           from './entities/babyWorm.js';
import { Menu }                                      from './scenes/menu.js';
import { SlimeAttack }                               from './entities/slimeAttack.js';
import { OcularPrism }                               from './entities/ocularPrism.js';
import { WaveWormManager }                           from './entities/waveWorm.js';
import { GameplayScene }                             from './scenes/gameplay.js';
import { SurvivalScene }                             from './scenes/survivalScene.js';
import { TransitionScene }                           from './scenes/transitions.js';
import { BossBattleScene }                           from './scenes/bossBattle.js';
import { StarfieldScene }                            from './visuals/starfieldScene.js';
import { OpeningScene }                              from './scenes/openingScene.js';
import { ClosingScene }                              from './scenes/closingScene.js';
import { BossTransmission }                          from './scenes/bossTransmission.js';
import { CosmicPrismManager }                        from './entities/cosmicPrism.js';
import { TesseractFragmentManager }                  from './entities/tesseractFragment.js';
import { SingularityBombManager }                    from './entities/singularityBomb.js';
import { EnemyDeathManager }                         from './visuals/enemyDeath.js';
import { FractalCascade }                            from './entities/fractalCascade.js';
import { DevTools, SessionRecorder }                 from './temp/devTools.js';
import { BotPlayer }                                 from './temp/botPlayer.js';  
import { HighScores }                                from './utils/highScores.js';
import { HighScoreUI }                               from './utils/highScoreUI.js';

// ==================== CANVAS ====================
const gameCanvas    = document.createElement('canvas');
gameCanvas.id       = 'game-canvas';
gameCanvas.width    = window.innerWidth;
gameCanvas.height   = window.innerHeight;
document.body.appendChild(gameCanvas);
const ctx = gameCanvas.getContext('2d');

// ==================== INSTANCES ====================
const tunnel            = new Tunnel();
const ship              = new Ship(gameCanvas, ctx);
const audio             = new AudioManager();
const ui                = new GameUI();
const enemyManager      = new EnemyManager(ship.particles, tunnel);
const projectileManager = new ProjectileManager();
const crosshair         = new Crosshair();
const muzzleFlash       = new MuzzleFlash();
const scoreManager      = new ScoreManager();
const wormBoss          = new WormBoss();
const babyWormManager   = new BabyWormManager(audio);
const menu              = new Menu();
const slimeAttack       = new SlimeAttack();
const ocularPrism       = new OcularPrism();
const fractalCascade    = new FractalCascade();
const waveWormManager   = new WaveWormManager();
const cosmicPrismManager = new CosmicPrismManager();
cosmicPrismManager.audio = audio; 
const tesseractManager   = new TesseractFragmentManager();
tesseractManager.audio   = audio;
const singularityBombManager = new SingularityBombManager();
singularityBombManager.audio = audio;
singularityBombManager.onSpinorCollect = () => tunnel.triggerSpinor(); // 💠 SPINOR PICKUP → 720° TUNNEL ROLL
const enemyDeathManager      = new EnemyDeathManager();
const gameplayScene     = new GameplayScene({
  enemyManager,
  waveWormManager,
  scoreManager,
  audio,
  singularityBombManager,
});
const survivalScene     = new SurvivalScene({
  enemyManager,
  audio,
  singularityBombManager,
  cosmicPrismManager,
  tesseractManager,
});
const transitionScene   = new TransitionScene();
const bot = new BotPlayer();
bot.onRequestContinue = () => transitionScene._handleContinue();
bot.onRequestRestart  = () => transitionScene._handleRestart();
window.bot = bot;
const starfield         = new StarfieldScene(tunnel.renderer);
const openingScene      = new OpeningScene(starfield, audio);
const bossTransmission  = new BossTransmission();
const closingScene      = new ClosingScene(starfield, tunnel, audio);
const bossBattleScene   = new BossBattleScene({
  wormBoss,
  babyWormManager,
  audio,
  scoreManager,
  projectileManager,
  transitionScene,
  singularityBombManager,
  tunnel,
});
const highScoreUI = new HighScoreUI();

//  ============================== CALLBACKS  ==============================

enemyManager.onLaserFired  = () => audio.playEnemyLaser();
enemyManager.onTelegraph   = () => { ocularPrism._stopTelegraph = audio.startLoopTelegraph(); };
enemyManager.onOcularPrism = (w, h) => {
  ocularPrism._stopTelegraph?.(); 
  ocularPrism._stopTelegraph = null;
  if (ocularPrism.activate(w, h)) {
    ocularPrism._stopPrism?.();  
    ocularPrism._stopPrism = audio.startLoopPrism();
    SessionRecorder.log('ocular_prism_attack');
  }
};
enemyManager.onSlimeTelegraph = () => {
  if (slimeAttack.isActive()) return;
  audio._stopSlimeSounds?.();  
  audio._stopSlimeSounds = audio.startSlimeSounds();
};
enemyManager.onSlimeAttack = (glorkX, glorkY) => {
  ImageLoader.load('slimeDrip');
  slimeAttack.trigger(glorkX, glorkY);
  SessionRecorder.log('slime_attack');
};
enemyManager.onEnemyKilled = (type) => {   // STOP ORPHANED TELEGRAPH SFX IF THE ENEMY WHO STARTED IT DIES MID-TELEGRAPH
  if (type === 'TANK') {
    audio._stopSlimeSounds?.(); audio._stopSlimeSounds = null;
  }
  if (type === 'FLIMFLAM') {
    ocularPrism._stopTelegraph?.(); ocularPrism._stopTelegraph = null;
  }
  if (type === 'ZIGZAG') {
    audio._stopFractalCode?.(); audio._stopFractalCode = null;
  }
};

enemyManager.onFractalTelegraph = () => {
  if (fractalCascade.isActive()) return;
  audio._stopFractalCode?.();                  // KILL ANY ORPHANED PRIOR INSTANCE
  audio._stopFractalCode = audio.startFractalCode();
};
enemyManager.onFractalCascade = () => {
  audio._stopFractalCode?.(); audio._stopFractalCode = null;
  fractalCascade.activate();
  SessionRecorder.log('fractal_cascade_attack');
};
fractalCascade.onRecompile = () => {
};

ocularPrism.onDefeated = () => {
  ocularPrism._stopPrism?.();     
  ocularPrism._stopPrism = null;
  ocularPrism._stopTelegraph?.(); 
  ocularPrism._stopTelegraph = null;
  audio.playPop();
  scoreManager.addScore(CONFIG.OCULAR_PRISM.PUPIL_KILL_SCORE, gameCanvas.width / 2, gameCanvas.height / 2);
  audio.playImpact();
};
ocularPrism.onExpired = () => {
  ocularPrism._stopPrism?.();     
  ocularPrism._stopPrism = null;
};

cosmicPrismManager.onCollect = (healAmt) => {
  ship.heal(healAmt);
};

singularityBombManager.onInventoryChange = (count) => {
  updateBombDisplay(count);
};

singularityBombManager.onEnemyKilledByBH = (x, y) => {
  projectileManager.createExplosion(x, y, 'bam');
  audio.playImpact();
};

gameplayScene.onCheckpoint = () => {
  const raw = document.getElementById('score-value')?.textContent?.replace(/,/g, '') ?? '0';
  transitionScene.saveCheckpoint(parseInt(raw, 10) || 0);
};

gameplayScene.onWormKill = (kills, required) => {
  updateWaveCounter(kills, required);
};

gameplayScene.onWaveStart = (waveIndex) => {
  SessionRecorder.log('wave_start', { waveIndex });  // TRACK PROGRESS — WHICH WAVE DID PLAYER REACH?
  updateWaveCounter(0, waveWormManager.getRequired());
  showWaveHUD(true);
  audio.playWaveStart();
  if (waveIndex > 0) audio.startWaveMusic(waveIndex); // 🎵 WAVE 1 MUSIC FIRED BY openingScene
  if (waveIndex === 0) {
    cosmicPrismManager.start();        // 🔮 BEGIN PRISM SPAWNING FROM WAVE 1
    tesseractManager.start();          // ◈ BEGIN TESSERACT SPAWNING FROM WAVE 1
    singularityBombManager.start();    // 💣 BEGIN SINGULARITY BOMB SPAWNING FROM WAVE 1
  }
};

gameplayScene.onWaveCleared = (waveIndex) => {
  SessionRecorder.log('wave_cleared', { waveIndex }); // TRACK HOW FAR PLAYER PROGRESSED
  unlockWaveBadge(waveIndex);
  audio.playImpact();

  if (waveIndex < 4) {
    audio.playWaveTransition(waveIndex + 1); // WAVES 1-4 ONLY
    tunnel.setWavePulse(1);
    setTimeout(() => tunnel.setWavePulse(0), 3500); // FADE BACK BEFORE NEXT WAVE STARTS
    return;
  }

  showWaveHUD(false); //  AFTER KILLING FINAL WAVE WORM - DRAMATIC TRANSITION TO BOSS BATTLE  🧹 CLEAR ALL IN-PROGRESS GAMEPLAY EFFECTS BEFORE THE BOSS SEQUENCE
  audio.stopAllLoopingSfx();                         // KILL ALL LOOPING SFX — CATCHES ANY LOOP HANDLE LOST TO RACE CONDITIONS
  enemyManager.clear();                              // REMOVE ALL ACTIVE ENEMIES FROM SCREEN
  enemyDeathManager.clear();                        // 💀 CANCEL ANY IN-PROGRESS MELT EFFECTS
  slimeAttack.reset();                               // CANCEL ANY ACTIVE SLIME ATTACK
  ocularPrism.active = false;                        // CANCEL ANY ACTIVE OCULAR PRISM
  ocularPrism._stopPrism?.();     ocularPrism._stopPrism = null;
  ocularPrism._stopTelegraph?.(); ocularPrism._stopTelegraph = null;
  fractalCascade.reset();                            // CANCEL ANY ACTIVE FRACTAL CASCADE
  singularityBombManager.blackHole = null;           // KILL ANY ACTIVE BLACK HOLE (keep inventory)

  cosmicPrismManager.stop(); // 🔮 NO PRISMS DURING BOSS SEQUENCE
  tesseractManager.stop();   // ◈ NO TESSERACT FRAGMENTS DURING BOSS SEQUENCE
  singularityBombManager.stop(); // 💣 NO NEW BOMB PICKUPS DURING BOSS SEQUENCE (keep inventory)
  tunnel.setBossTransitionSurge(1); // PHASE 1 (t=0s): SURGE — TUNNEL SPEEDS AND TURNS RED - TRACERS ON
  _bossTracerTarget = 1;
  audio.playBossTransition1(); // PHASE 1 SFX — TUNNEL SURGE

  setTimeout(() => tunnel.setBossFlash(1), 1000); // PHASE 2 (t=1s): RED -> FLASHES

  setTimeout(() => {
    tunnel.setBossFlash(0);
    tunnel.setBossTransitionSurge(0);
    tunnel.setBossEmergenceFog(1);
    audio.playBossTransition2(); // PHASE 3 SFX — DARKNESS HITS
  }, 5000); // PHASE 3 (t=5s): FLASHES STOP AND CUT TO DARKNESS

  setTimeout(() => {
    bossTransmission.play();
  }, 7000); // (t=7s): DEEP SPACE COMMAND TRANSMISSION BEGINS - TRANSMISSION APPEARS 2 SECONDS INTO BLACKOUT

  setTimeout(() => {
    const raw = document.getElementById('score-value')?.textContent?.replace(/,/g, '') ?? '0';
    transitionScene.saveCheckpoint(parseInt(raw, 10) || 0);
    bossTransmission.hide();
    wormBoss.activate();
    ship.deathSequenceEnabled = false; // BOSS BATTLE HAS ITS OWN DEATH HANDLING
    audio.stopMusic();
  }, 16000); // PHASE 4 (t=16s): WORM ACTIVATES — EMERGES FROM FOG

};

gameplayScene.onGooHit = () => {
  if (ship.isAlive && !ship.isInvincible) {
    ship.takeDamage(CONFIG.GAMEPLAY.GOO_DAMAGE);
    audio.playOuch();
  }
};

waveWormManager.onWormSpawn  = () => audio.playWaveWormSfx(); 
waveWormManager.onWormKilled = (x, y) => {
  projectileManager.createExplosion(x, y, 'zap'); 
};

bossBattleScene.onCinematicStart = () => ship.enterCinematic();
bossBattleScene.onCinematicEnd   = () => ship.exitCinematic();
bossBattleScene.onCheckpoint     = () => {
  const raw = document.getElementById('score-value')?.textContent?.replace(/,/g, '') ?? '0';
  transitionScene.saveCheckpoint(parseInt(raw, 10) || 0);
};

bossBattleScene.onCollapseHit = () => { // CELLULAR AUTOMATTACK COLLAPSE — TRIGGERS REALITY DISTORTION INSTEAD OF FLAT DAMAGE
  bossBattleScene.activateCellularDistort(ship);
  audio.playOuch();
};

wormBoss.onScreenShake = (strength, duration) => triggerScreenShake(strength, duration); // LUNGE BITE SCREEN SHAKE — CANVAS-LEVEL IMPACT FEEDBACK

wormBoss.onDeath = () => {
  SessionRecorder.log('boss_battle_end');
  SessionRecorder.endSession('boss_defeated'); // *** AUTO SESSION RECORDER ***
  audio.stopMusic();
  ship.exitCinematic();
  ship.suctionScale  = 1.0;
  ship.suctionActive = false;
  ship.suctionShakeX = 0;
  ship.suctionShakeY = 0;
  document.querySelectorAll('#hud, #hp-container, #lives-container, #boss-health-container, #wave-hud, #ui-buttons, #bomb-container')
    .forEach(el => el.classList.add('pre-game-hidden'));
  const rawScore = document.getElementById('score-value')?.textContent?.replace(/,/g, '') ?? '0';
  const finalScore = parseInt(rawScore, 10) || 0;
  closingScene.start(finalScore);

  // PAUSE SCENE TIMER AFTER A SHORT BEAT, SHOW HIGH SCORE ENTRY + LEADERBOARD. CINEMATIC RESUMES (YOU DID IT → CREDITS → BACK TO MENU) ONCE THE PLAYER CLOSES THE LEADERBOARD.
  setTimeout(() => {
    closingScene.pause();
    highScoreUI.showEntry(finalScore, null, 'gameplay', () => {
      closingScene.resume();
    });
  }, 12000);

  setTimeout(() => projectileManager.clear(), 11000);
};

closingScene.onBackToMenu = () => { //  CLOSING SCENE → BACK TO MENU 
  SessionRecorder.stop(); // *** AUTO SESSION RECORDER ***
  audio.stop();
  window.location.reload();
};
ship.onHPChange    = (hp, max)   => updateHPBar(hp, max);
ship.onLivesChange = (lives)     => updateLivesDisplay(lives);

ship.onDeathSequenceStart = () => {
  audio.playGlitchOut();
};

function wireShipOnDeath() { // EXTRACTED AS A NAMED FUNCTION SO IT CAN BE RE-WIRED AFTER A WORMHOLE GAME OVER
  ship.onDeath = (livesLeft) => {
    audio.stopMusic();

    if (currentMode === 'survival') { //  SURVIVAL MODE — ONE LIFE, SKIP NORMAL FLOW, SHOW RESULTS SCREEN
      enemyManager.clear();
      projectileManager.clear();
      slimeAttack.reset();
      audio._stopSlimeSounds?.();     audio._stopSlimeSounds = null;
      ocularPrism.active = false;
      ocularPrism._stopPrism?.();     ocularPrism._stopPrism = null;
      ocularPrism._stopTelegraph?.(); ocularPrism._stopTelegraph = null;
      fractalCascade.reset();
      audio.stopAllLoopingSfx();
      // SHOW NAME ENTRY FIRST, THEN REVEAL SURVIVAL RESULTS SCREEN AFTER SUBMIT
      highScoreUI.showEntry(scoreManager.score, null, 'survival', () => {
        survivalScene.showResults(scoreManager.score);
      });
      return;
    }

    const inWormBattle = wormBoss.isActive && !wormBoss.isDead;

    if (livesLeft <= 0 && inWormBattle) { // BOSS GAME OVER — SWALLOW SEQUENCE INSTEAD OF INSTANT GAME OVER SCREEN
      babyWormManager.clear();
      bossBattleScene.startWormholeGameOver(ship);
      return;
    }

    // SUCTION KILL WITH LIVES LEFT — SPIRAL INTO MOUTH, SNAP SHUT, THEN "YOU DIED"
    if (inWormBattle && bossBattleScene.isSuctionActive) {
      babyWormManager.clear();
      bossBattleScene.startEatenDeathSequence(ship, () => {
        transitionScene.handleDeath(livesLeft, inWormBattle);
      });
      return;
    }

    if (inWormBattle) {     // BOSS REGULAR DEATH — CLEAR BABY WORMS SO THEY DON'T PERSIST ON THE DIED SCREEN
      babyWormManager.clear();
    }

    if (!inWormBattle) { // GAMEPLAY DEATH (REGULAR OR GAME OVER) — CLEAR ALL ENEMIES AND CANCEL ANY ACTIVE ATTACKS
      enemyManager.clear();
      slimeAttack.reset();
      audio._stopSlimeSounds?.(); audio._stopSlimeSounds = null;
      ocularPrism.active = false;
      ocularPrism._stopPrism?.();     ocularPrism._stopPrism = null;
      ocularPrism._stopTelegraph?.(); ocularPrism._stopTelegraph = null;
      fractalCascade.reset();
    }

    transitionScene.handleDeath(livesLeft, inWormBattle);
  };
}
wireShipOnDeath();

// ==================== HUD HELPERS ====================
function updateHPBar(hp, maxHP) {
  const pct   = Math.max(0, (hp / maxHP) * 100);
  const fill  = document.getElementById('hp-bar-fill');
  const track = document.getElementById('hp-bar-track');
  if (fill)  fill.style.width = pct + '%';
  if (track) track.classList.toggle('hp-critical', pct < 30);
}

function updateLivesDisplay(lives) {
  const el = document.getElementById('lives-count');
  if (el) el.textContent = lives;
}

function updateBombDisplay(count) {
  const el = document.getElementById('bomb-count');
  if (el) el.textContent = `x ${count}`;
  const container = document.getElementById('bomb-container');
  if (container) {
    container.classList.toggle('bomb-empty', count === 0);
    container.classList.remove('bomb-flash');
    void container.offsetWidth;
    container.classList.add('bomb-flash');
  }
}

function updateWaveCounter(kills, required) { //  WAVE HUD HELPERS 
  const el = document.getElementById('wave-counter');
  if (!el) return;
  el.textContent = `${kills} / ${required}`;
  el.classList.remove('pop');
  void el.offsetWidth;
  el.classList.add('pop');
}

function unlockWaveBadge(waveIndex) {
  const badge = document.getElementById(`wave-badge-${waveIndex}`);
  if (!badge) return;
  badge.classList.remove('greyed');
  badge.classList.add('unlocked');
  badge.classList.remove('badge-flash');
  void badge.offsetWidth; 
  badge.classList.add('badge-flash');
}

function showWaveHUD(visible) {
  const el = document.getElementById('wave-hud');
  if (el) el.classList.toggle('hidden', !visible);
}

function resetWaveBadges() {
  for (let i = 0; i < 5; i++) {
    const badge = document.getElementById(`wave-badge-${i}`);
    if (!badge) continue;
    badge.classList.remove('unlocked', 'badge-flash');
    badge.classList.add('greyed');
  }
}

function triggerScreenShake(strength, duration) {
  _screenShakeStrength = strength;
  _screenShakeDuration = duration || 1;
  _screenShakeTimer    = _screenShakeDuration;
}

function doShoot() { //  SHOOT 
  if (isPaused) return;
  const crosshairPos = crosshair.getPosition();
  const shootData    = ship.shoot(crosshairPos.x, crosshairPos.y);
  if (shootData) {
    projectileManager.shoot(
      shootData.x, shootData.y,
      shootData.targetX, shootData.targetY,
      tesseractManager.isBoostActive()   // BOOSTED = RAINBOW, WIDER BEAM
    );
    muzzleFlash.trigger(shootData.x, shootData.y);
    audio.playLaser();
  }
}

transitionScene.onRestart = () => { //  TRANSITION CALLBACKS
  ship.resetForNewGame();
  ship.deathSequenceEnabled = true; // RESTORE FOR GAMEPLAY
  scoreManager.reset();
  enemyManager.clear();
  projectileManager.clear();
  babyWormManager.clear();
  slimeAttack.reset();
  audio._stopSlimeSounds?.(); audio._stopSlimeSounds = null;
  ocularPrism.active = false;
  ocularPrism._stopPrism?.();     ocularPrism._stopPrism = null;
  ocularPrism._stopTelegraph?.(); ocularPrism._stopTelegraph = null;
  gameplayScene.reset();
  resetWaveBadges();          // RESET BADGES BACK TO GREYED-OUT FOR FRESH RUN
  cosmicPrismManager.reset();
  tesseractManager.reset();
  singularityBombManager.reset();

  bossBattleScene.reset(ship);
  tunnel.resetBossTransition();
  _bossTracerTarget    = 0;
  _bossTracerIntensity = 0;
  CONFIG.ENEMIES.MAX_COUNT = (currentMode === 'gameplay') ? currentEnemyCount : 0;
  if (currentMode === 'bossBattle') wormBoss.activate();
  if (currentMode === 'gameplay')   gameplayScene.start();

  bossBattleScene.updateHUD();
  audio.stop();
  audio.start();
  if (currentMode !== 'bossBattle') audio.startWaveMusic(0);
};

bossBattleScene.onWormholeGameOver = () => { //  WORMHOLE GAME OVER → RESTART FROM WAVE 1 - FIRES AFTER THE VORTEX SEQUENCE COMPLETES — FULL RESET, BACK TO WAVE 1 
  wormBoss.isActive = false;  // HIDE WORM IMMEDIATELY — WILL RE-ACTIVATE WHEN PLAYER REACHES BOSS BATTLE AGAIN
  ship.resetForNewGame();
  ship.deathSequenceEnabled = true; // RESTORE — BACK TO GAMEPLAY
  scoreManager.reset();
  enemyManager.clear();
  projectileManager.clear();
  babyWormManager.clear();
  slimeAttack.reset();
  ocularPrism.active = false;
  ocularPrism._stopPrism?.();     ocularPrism._stopPrism = null;
  ocularPrism._stopTelegraph?.(); ocularPrism._stopTelegraph = null;
  enemyDeathManager.clear(); 
  gameplayScene.reset();
  resetWaveBadges();          // RESET BADGES BACK TO GREYED-OUT FOR FRESH RUN
  bossBattleScene.reset(ship);
  tunnel.resetBossTransition();
  _bossTracerTarget    = 0;
  _bossTracerIntensity = 0;

  currentMode = 'gameplay'; // ALWAYS RETURN TO WAVE 1 — NEVER BACK TO BOSS DIRECTLY
  CONFIG.ENEMIES.MAX_COUNT = currentEnemyCount;
  cosmicPrismManager.reset();
  tesseractManager.reset();
  singularityBombManager.reset();
  wireShipOnDeath(); // RE-WIRE — startWormholeGameOver() NULLS ship.onDeath; RESTORE NOW

  gameplayScene.start();
  bossBattleScene.updateHUD();
  showWaveHUD(true);

  audio.stop();
  audio.start();
  audio.startWaveMusic(0);
  // console.log('★ Wormhole game over — restarting from wave 1');
};

transitionScene.onContinue = () => {
  const inWormBattle = wormBoss.isActive && !wormBoss.isDead;
  const inGameplay   = gameplayScene.isActive();

  scoreManager.reset();
  const cpScore = transitionScene.getCheckpointScore();
  if (cpScore > 0) scoreManager.addScore(cpScore, -9999, -9999);

  if (inWormBattle) {
    wormBoss.activate();
    ship.deathSequenceEnabled = false; // BOSS BATTLE HAS ITS OWN DEATH HANDLING
    babyWormManager.clear();
    bossBattleScene.reset(ship);
    bossBattleScene.updateHUD();
  }

  if (inGameplay) {
    gameplayScene.restartCurrentWave();
  }

  ship.respawn();
  if (inWormBattle) {
    audio.startBossMusic();
  } else {
    audio.startWaveMusic(gameplayScene.getWaveIndex());
  }
};

survivalScene.onRestart = () => { //  SURVIVAL SCENE RESTART
  ship.resetForNewGame();
  ship.lives = 1; // ONE LIFE ONLY IN SURVIVAL MODE
  ship.deathSequenceEnabled = true;
  scoreManager.reset();
  enemyManager.clear();
  projectileManager.clear();
  babyWormManager.clear();
  slimeAttack.reset();
  audio._stopSlimeSounds?.(); audio._stopSlimeSounds = null;
  ocularPrism.active = false;
  ocularPrism._stopPrism?.();     ocularPrism._stopPrism = null;
  ocularPrism._stopTelegraph?.(); ocularPrism._stopTelegraph = null;
  fractalCascade.reset();
  enemyDeathManager.clear();
  survivalScene.reset();
  showWaveHUD(false);
  updateHPBar(ship.getHP(), CONFIG.SHIP_HP.MAX_HP);
  updateLivesDisplay(ship.lives);
  updateBombDisplay(0);
  wireShipOnDeath(); // RE-WIRE SO SURVIVAL DEATH ROUTING STAYS ACTIVE
  survivalScene.start();
  audio.stop();
  audio.start();
  audio.startSurvivalMusic();
};

survivalScene.onMenu = () => {
  SessionRecorder.stop(); // *** AUTO SESSION RECORDER ***
  audio.stop();
  window.location.reload();
};


transitionScene.onGameOver = () => {
  SessionRecorder.endSession('game_over'); // AUTO SESSION RECORDER
  audio.playGameOver1();
  const score = scoreManager.score;
  setTimeout(() => {
    highScoreUI.showEntry(
      score,
      gameplayScene.getWaveIndex(),
      'gameplay',
      () => {}
    );
  }, 50000); 
};

transitionScene.onMenu = () => {
  audio.stop();
  window.location.reload();
};

// ==================== GAME STATE ====================
let isPaused           = false;
let isMuted            = false;
let _prevBarrelRolling = false;
let _bossTracerIntensity = 0;   // CRIMSON SHIP TRACER — DRIVES BOSS TRANSITION VISUAL
let _bossTracerTarget    = 0;
let _screenShakeTimer    = 0;   // CANVAS-LEVEL SCREEN SHAKE — COUNTS DOWN FROM DURATION
let _screenShakeStrength = 0;   // PEAK PIXEL DISPLACEMENT
let _screenShakeDuration = 1;   // TOTAL SHAKE DURATION (STORED FOR DECAY CALCULATION)
let _totalElapsed        = 0;   // RUNNING GAME-TIME CLOCK IN SECONDS — USED BY BOT FOR RUN TIMING
let _bombHoldTimer       = null; // SINGULARITY BOMB — HOLD-TO-FIRE PREVENTS ACCIDENTAL DEPLOYS

let currentMode       = 'bossBattle'; 
let currentEnemyCount = 5;
let _gameStarted      = false;  // SET AFTER OPENING SCENE — GATES CURSOR HIDING

// ==================== KEYBOARD SHORTCUTS ====================
function deployBomb() {
  if (isPaused || !ship.isAlive) return;
  singularityBombManager.deploy(ship.x, ship.y);
}

window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyP') {
    isPaused = !isPaused;
    ui.update(isMuted, isPaused);
    return;
  }
  if (e.code === 'KeyM') {
    isMuted = audio.toggleMute();
    ui.update(isMuted, isPaused);
    return;
  }
  if (e.code === 'Space' && !isPaused) {
    e.preventDefault();
    doShoot();
    return;
  }
  if (e.code === 'KeyQ' && !ship.isBarrelRolling) {
    e.preventDefault();
    ship.startBarrelRoll(-1);
    audio.playBarrelRoll();
    return;
  }
  if (e.code === 'KeyE' && !ship.isBarrelRolling) {
    e.preventDefault();
    ship.startBarrelRoll(1);
    audio.playBarrelRoll();
    return;
  }
  if (e.code === 'KeyR' && !isPaused && ship.isAlive && !_bombHoldTimer) {
    e.preventDefault();
    _bombHoldTimer = setTimeout(() => {
      deployBomb();
      _bombHoldTimer = null;
    }, 400);
    return;
  }
  if ((e.code === 'ShiftRight' || e.code === 'ShiftLeft') && !isPaused) {
    e.preventDefault();
    ship.activateBoost();
    return;
  }
});

window.addEventListener('keyup', (e) => {
  if (e.code === 'KeyR') {
    clearTimeout(_bombHoldTimer);
    _bombHoldTimer = null;
  }
});

// ==================== MOUSE CONTROLS NOTE: LISTENERS ON window (NOT gameCanvas) — #game-canvas HAS pointer-events:none SO CANVAS EVENTS NEVER FIRE
window.addEventListener('mousedown', (e) => {
  if (e.button === 0 && !isPaused) {  // LEFT CLICK — SHOOT
    doShoot();
  }
});

window.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  if (isPaused || !ship.isAlive || ship.isBarrelRolling) return;
  const direction = ship.currentRotation < 0 ? -1 : 1;   // DIRECTION INFERRED FROM SHIP TILT — NEGATIVE ROTATION = TILTED LEFT = ROLL LEFT
  ship.startBarrelRoll(direction);
  audio.playBarrelRoll();
});

// ==================== BUTTON EVENTS ====================
document.getElementById('btn-sound')?.addEventListener('click', () => {
  isMuted = audio.toggleMute();
  ui.update(isMuted, isPaused);
});
document.getElementById('btn-pause')?.addEventListener('click', () => {
  isPaused = !isPaused;
  ui.update(isMuted, isPaused);
});

window.addEventListener('resize', () => {
  tunnel.handleResize();
  gameCanvas.width  = window.innerWidth;
  gameCanvas.height = window.innerHeight;
  ship.handleResize();
  crosshair.handleResize();
});

window.addEventListener('orientationchange', () => {
  setTimeout(() => {
    tunnel.handleResize();
    gameCanvas.width  = window.innerWidth;
    gameCanvas.height = window.innerHeight;
    ship.handleResize();
    crosshair.handleResize();
  }, 300);
});

// ==================== GAME LOOP ====================
let lastTime = performance.now();
function gameLoop() {
  requestAnimationFrame(gameLoop);
  const now = performance.now();
  const dt  = Math.min((now - lastTime) / 1000, 0.05);
  lastTime  = now;

  if (!isPaused && !transitionScene.isBlocking) {
    _totalElapsed += dt; // ADVANCE GAME-TIME CLOCK — USED BY BOT FOR PER-RUN SURVIVAL TIMING

    const enemies = enemyManager.getEnemies(); // SINGLE CALL PER FRAME — REUSED THROUGHOUT LOOP

    if (closingScene.isActive()) { //  THREE.JS BACKGROUND 
      closingScene.update(dt);         
      starfield.render();              
      ship.update(dt);                 // SHIP STAYS CONTROLLABLE IN OPEN SPACE
    } else {
      tunnel.update(dt);
      const shipOffset = ship.getOffset();
      tunnel.updateShipOffset(shipOffset.x, shipOffset.y);

      const suctionOn = bossBattleScene.isSuctionActive;
      tunnel.setSuctionIntensity(suctionOn ? 1 : 0);

      const activeGlork = enemies.find(e => e.type === 'TANK' && e.scale > CONFIG.SLIME_ATTACK.MIN_SCALE);
      const gx = activeGlork ? activeGlork.x : window.innerWidth  / 2;
      const gy = activeGlork ? activeGlork.y : window.innerHeight / 2;
      slimeAttack.update(dt, gx, gy, ship.x, ship.y);

      tunnel.setSlimeIntensity(slimeAttack.getSlimeIntensity());
      ship.setSlimeHeaviness(slimeAttack.getSlimeIntensity());

      ship.update(dt);

      // ==================== BOT UPDATE ====================
      if (bot.enabled) {
        const intent = bot.update(dt, {
          ship: {
            x:            ship.x,
            y:            ship.y,
            hp:           ship.hp,
            maxHP:        ship.maxHP,
            lives:        ship.lives,
            isAlive:      ship.isAlive,
            isInvincible: ship.isInvincible,
            suctionScale: ship.suctionScale,
            bombs:        singularityBombManager.inventory ?? 0,
          },
          enemies:         enemies,
          enemyLasers:     enemyManager.lasers,
          gooProjectiles:  waveWormManager.worm?.goos ?? [],
          waveWorm:        waveWormManager.worm,
          wormBoss:        wormBoss,
          babyWorms:       babyWormManager.worms,
          pickups: {
            prisms:           cosmicPrismManager.prisms,
            tesseracts:       tesseractManager.fragments,
            singularityItems: singularityBombManager._items,
          },
          score:        scoreManager.score,
          elapsed:      _totalElapsed,
          inBossBattle: wormBoss.isActive && !wormBoss.isDead,
        });
        if (intent) {
          crosshair.setMouseInput(intent.aimNX, intent.aimNY);
          if (intent.shouldShoot) doShoot();
          if (intent.shouldUseBomb) deployBomb(); 
        }
      }

      crosshair.update(shipOffset.x, shipOffset.y, dt, enemies);
      enemyManager.update(dt, ship.x, ship.y);
      gameplayScene.update(dt, ship.x, ship.y);
      if (currentMode === 'survival') survivalScene.update(dt);
      bossBattleScene.update(dt, ship);

      singularityBombManager.update(dt, ship.x, ship.y); 
      singularityBombManager.applyGravityAndBossEffect(dt, enemies, wormBoss);
      setActiveSingularityBH(
        singularityBombManager.blackHole && !singularityBombManager.blackHole.isDead()
          ? singularityBombManager.blackHole
          : null
      );

      if (wormBoss.isActive) {
        if (wormBoss.alpha > 0.5)  tunnel.setBossEmergenceFog(0);
        if (wormBoss.alpha > 0.85) _bossTracerTarget = 0;
      }
      _bossTracerIntensity += (_bossTracerTarget - _bossTracerIntensity) * 0.04;
    }
    projectileManager.update(dt);
    muzzleFlash.update(dt);
    scoreManager.update(dt);
    ocularPrism.update(dt);
    if (_screenShakeTimer > 0) _screenShakeTimer = Math.max(0, _screenShakeTimer - dt); // SCREEN SHAKE DECAY
    if (gameplayScene.isActive()) fractalCascade.update(dt, ship.x, ship.y, ship);
    cosmicPrismManager.update(dt, ship.x, ship.y);
    tesseractManager.update(dt, ship.x, ship.y);
    enemyDeathManager.update(dt); // 💀

    if (ship.isBarrelRolling && !_prevBarrelRolling) { // BARREL ROLL RISING EDGE — DETACH ALL LATCHED BABY WORMS
      const detached = babyWormManager.detachAll(ship, ship.barrelRollDirection);
      if (detached > 0) audio.playImpact();
    }
    _prevBarrelRolling = ship.isBarrelRolling;

    // ========================= COLLISION  =========================
    const projectiles = projectileManager.getProjectiles();

    for (let i = projectiles.length - 1; i >= 0; i--) {
      const projectile = projectiles[i];

      for (let j = enemies.length - 1; j >= 0; j--) { // PROJECTILE vs ENEMIES
        const enemy   = enemies[j];
        const pos     = enemy.getPosition();
        const hit     = segmentCircleCollision(
          projectile.getSegment(),
          { x: pos.x, y: pos.y, radius: enemy.getSize() }
        );
        if (hit) {
          projectileManager.removeProjectile(projectile);
          const boostActive = tesseractManager.isBoostActive();
          const destroyed   = enemy.takeDamage(boostActive ? 2 : 1);
          if (destroyed) {
            projectileManager.createExplosion(pos.x, pos.y, boostActive ? 'boom' : 'bam');
            scoreManager.addScore(enemy.score, pos.x, pos.y);
            enemyDeathManager.spawn(enemy); // 💀 BIOLOGICAL MELT COLLAPSE
            audio.playEnemyDeath();         // 💀 MELT SFX
          }
          audio.playImpact();
          break;
        }
      }

      if (!projectile.isDead) { // PROJECTILE vs WORM BOSS + BABY WORMS
        if (bossBattleScene.processProjectileHit(projectile)) continue;
      }

      if (!projectile.isDead && ocularPrism.active) { // PROJECTILE vs OCULAR PRISM PUPIL
        const seg = projectile.getSegment();
        if (ocularPrism.checkProjectileHit(seg.x1, seg.y1)) {
          projectileManager.removeProjectile(projectile);
          audio.playImpact();
          scoreManager.addScore(CONFIG.OCULAR_PRISM.PUPIL_HIT_SCORE, gameCanvas.width / 2, gameCanvas.height / 2);
        }
      }

      if (!projectile.isDead && gameplayScene.isActive()) { // PROJECTILE vs WAVE WORM
        const wormHit = gameplayScene.checkWormHit(
          projectile.getSegment(),
          tesseractManager.isBoostActive() ? 2 : 1
        );
        if (wormHit.hit) {
          projectileManager.removeProjectile(projectile);
          audio.playImpact();
          if (wormHit.killed) {
            scoreManager.addScore(CONFIG.GAMEPLAY.WAVE_WORM_KILL_SCORE, wormHit.x, wormHit.y);
          }
        }
      }
    }

    if (ship.isAlive && !ship.isInvincible) { // ENEMY BODY COLLISION vs SHIP
      const collisionDamage = enemyManager.checkCollisions(ship.x, ship.y);
      if (collisionDamage > 0) { ship.takeDamage(collisionDamage); audio.playOuch(); }
    }

    if (ship.isAlive && !ship.isInvincible) {  // ENEMY LASER vs SHIP
        const result = enemyManager.checkLaserHits(ship.x, ship.y, ship.isBarrelRolling);
        if (result.damage > 0) { // NORMAL HIT = DAMAGE
            ship.takeDamage(result.damage);
            audio.playOuch();
        }
        for (const def of result.deflected) { // BARREL ROLL DEFLECT + SPARKLING PRISM RICOCHET
            projectileManager.createPrismRicochet(
                def.x,
                def.y,
                def.dirX,
                def.dirY
            );
        }
    }
  }

  if (!closingScene.shouldHideTunnel) tunnel.render();

  bossBattleScene.updateHUD(); // MUST RUN EVEN PAUSED SO BAR DOESN'T FREEZE
  if (bot.enabled) bot.tickBlocked(dt); // MUST RUN EVEN WHEN isBlocking — DRAINS RESET TIMER WHILE DIED SCREEN IS UP

  document.body.classList.toggle('hide-cursor', // HIDE CURSOR DURING GAMEPLAY; SHOW ON PAUSE / OVERLAY / MENU
    _gameStarted && !isPaused && !transitionScene.isBlocking && !closingScene.isActive());

  ctx.clearRect(0, 0, gameCanvas.width, gameCanvas.height);

  const shakeDecay = _screenShakeDuration > 0 ? _screenShakeTimer / _screenShakeDuration : 0; // CANVAS SCREEN SHAKE — TRANSLATES THE ENTIRE DRAW PASS FOR IMPACT FEEL
  const shakeX = _screenShakeTimer > 0 ? (Math.random() - 0.5) * 2 * _screenShakeStrength * shakeDecay : 0;
  const shakeY = _screenShakeTimer > 0 ? (Math.random() - 0.5) * 2 * _screenShakeStrength * shakeDecay : 0;
  ctx.save();
  ctx.translate(shakeX, shakeY);
 
  projectileManager.draw(ctx); // ALWAYS DRAW — EXPLOSIONS MUST SURVIVE INTO CLOSING SCENE
  if (!closingScene.isActive()) {
    wormBoss.draw(ctx);
    bossBattleScene.drawLarvae(ctx);
    bossBattleScene.drawCellular(ctx); // 🧬 CELLULAR INFECTION — ABOVE WORM, BELOW EVERYTHING ELSE
    babyWormManager.draw(ctx);
    crosshair.draw(ctx);
    gameplayScene.drawBehindEnemies(ctx);
    singularityBombManager.drawBlackHole(ctx); // 💣 BLACK HOLE BEHIND ENEMIES
    enemyManager.draw(ctx);
    enemyDeathManager.draw(ctx); // 💀 MELT EFFECTS — DRAWN OVER ENEMY LAYER
    gameplayScene.drawAboveEnemies(ctx);
    if (gameplayScene.isActive()) cosmicPrismManager.draw(ctx); // 🔮 PRISMS ABOVE ENEMIES, BELOW SHIP
    if (gameplayScene.isActive()) tesseractManager.drawItems(ctx); // ◈ TESSERACT FRAGMENTS
    if (gameplayScene.isActive()) singularityBombManager.drawItems(ctx); // 💣 SPINOR COLLECTIBLES
    if (gameplayScene.isActive()) fractalCascade.drawEchoes(ctx, ship.x, ship.y); // 🌀 FRACTAL ECHOES BEHIND SHIP
  }

  slimeAttack.drawScreenSlime(ctx);

  if (slimeAttack.getSlimeIntensity() > 0.02) {
    const sprite     = ImageLoader.isLoaded('ship') ? ImageLoader.get('ship') : null;
    const frameW     = sprite ? sprite.width / CONFIG.SHIP.SPRITE_FRAMES : 0;
    const trailSnaps = ship.getTrailPositions();
    if (sprite && trailSnaps.length > 0) {
      const si = slimeAttack.getSlimeIntensity();
      for (let i = 0; i < trailSnaps.length; i++) {
        const snap       = trailSnaps[i];
        const ageFrac    = (trailSnaps.length - i) / trailSnaps.length; 
        const alpha      = si * 0.5 * (1 - ageFrac * 0.9);
        if (alpha < 0.01) continue;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(snap.x, snap.y);
        ctx.rotate(snap.rotation);
        ctx.drawImage(
          sprite,
          snap.frame * frameW, 0, frameW, sprite.height,
          -CONFIG.SHIP.WIDTH / 2, -CONFIG.SHIP.HEIGHT / 2,
          CONFIG.SHIP.WIDTH, CONFIG.SHIP.HEIGHT
        );
        ctx.globalCompositeOperation = 'source-atop';
        ctx.globalAlpha = alpha * 0.7;
        ctx.fillStyle   = '#22ff66';
        ctx.fillRect(-CONFIG.SHIP.WIDTH / 2, -CONFIG.SHIP.HEIGHT / 2, CONFIG.SHIP.WIDTH, CONFIG.SHIP.HEIGHT);
        ctx.restore();
      }
    }
  }

  if (ship._cellularDistortActive) {   //  CELLULAR DISTORTION TRACERS — MAGENTA/PURPLE GHOST SHIPS WHILE INFECTED
    const sprite     = ImageLoader.isLoaded('ship') ? ImageLoader.get('ship') : null;
    const frameW     = sprite ? sprite.width / CONFIG.SHIP.SPRITE_FRAMES : 0;
    const trailSnaps = ship.getTrailPositions();
    if (sprite && trailSnaps.length > 0) {
      for (let i = 0; i < trailSnaps.length; i++) { // PASS 1 — MAGENTA GHOST SHIPS
        const snap    = trailSnaps[i];
        const ageFrac = (trailSnaps.length - i) / trailSnaps.length;
        const alpha   = 0.55 * (1 - ageFrac * 0.88);
        if (alpha < 0.01) continue;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(snap.x, snap.y);
        ctx.rotate(snap.rotation);
        ctx.drawImage(sprite, snap.frame * frameW, 0, frameW, sprite.height,
          -CONFIG.SHIP.WIDTH / 2, -CONFIG.SHIP.HEIGHT / 2,
          CONFIG.SHIP.WIDTH, CONFIG.SHIP.HEIGHT);
        ctx.globalCompositeOperation = 'source-atop';
        ctx.globalAlpha = alpha * 0.85;
        ctx.fillStyle   = '#cc0099'; // CELLULAR MAGENTA — MATCHES INFECTION PALETTE
        ctx.fillRect(-CONFIG.SHIP.WIDTH / 2, -CONFIG.SHIP.HEIGHT / 2, CONFIG.SHIP.WIDTH, CONFIG.SHIP.HEIGHT);
        ctx.restore();
      }
      for (let i = Math.max(0, trailSnaps.length - 3); i < trailSnaps.length; i++) { // PASS 2 — ADDITIVE PURPLE GLOW ON FRESHEST 3 GHOSTS
        const snap    = trailSnaps[i];
        const ageFrac = (trailSnaps.length - i) / trailSnaps.length;
        const alpha   = 0.28 * (1 - ageFrac * 0.5);
        if (alpha < 0.01) continue;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.globalCompositeOperation = 'lighter';
        ctx.translate(snap.x, snap.y);
        ctx.rotate(snap.rotation);
        ctx.drawImage(sprite, snap.frame * frameW, 0, frameW, sprite.height,
          -CONFIG.SHIP.WIDTH * 0.6, -CONFIG.SHIP.HEIGHT * 0.6,
          CONFIG.SHIP.WIDTH * 1.2, CONFIG.SHIP.HEIGHT * 1.2);
        ctx.restore();
      }
    }
  }

  if (_bossTracerIntensity > 0.01) {  //  BOSS TRANSITION CRIMSON TRACERS
    const sprite     = ImageLoader.isLoaded('ship') ? ImageLoader.get('ship') : null;
    const frameW     = sprite ? sprite.width / CONFIG.SHIP.SPRITE_FRAMES : 0;
    const trailSnaps = ship.getTrailPositions();
    if (sprite && trailSnaps.length > 0) {
      const ti = _bossTracerIntensity;

      for (let i = 0; i < trailSnaps.length; i++) { // PASS 1 — CRIMSON GHOST SHIPS
        const snap    = trailSnaps[i];
        const ageFrac = (trailSnaps.length - i) / trailSnaps.length;
        const alpha   = ti * 0.55 * (1 - ageFrac * 0.88);
        if (alpha < 0.01) continue;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(snap.x, snap.y);
        ctx.rotate(snap.rotation);
        ctx.drawImage(sprite, snap.frame * frameW, 0, frameW, sprite.height,
          -CONFIG.SHIP.WIDTH / 2, -CONFIG.SHIP.HEIGHT / 2,
          CONFIG.SHIP.WIDTH, CONFIG.SHIP.HEIGHT);
        ctx.globalCompositeOperation = 'source-atop';
        ctx.globalAlpha = alpha * 0.85;
        ctx.fillStyle   = '#ff1133';
        ctx.fillRect(-CONFIG.SHIP.WIDTH / 2, -CONFIG.SHIP.HEIGHT / 2, CONFIG.SHIP.WIDTH, CONFIG.SHIP.HEIGHT);
        ctx.restore();
      }

      for (let i = Math.max(0, trailSnaps.length - 3); i < trailSnaps.length; i++) { // PASS 2 — HOT ADDITIVE GLOW ON FRESHEST 3 GHOSTS
        const snap    = trailSnaps[i];
        const ageFrac = (trailSnaps.length - i) / trailSnaps.length;
        const alpha   = ti * 0.28 * (1 - ageFrac * 0.5);
        if (alpha < 0.01) continue;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.globalCompositeOperation = 'lighter';
        ctx.translate(snap.x, snap.y);
        ctx.rotate(snap.rotation);
        ctx.drawImage(sprite, snap.frame * frameW, 0, frameW, sprite.height,
          -CONFIG.SHIP.WIDTH * 0.6, -CONFIG.SHIP.HEIGHT * 0.6,
          CONFIG.SHIP.WIDTH * 1.2, CONFIG.SHIP.HEIGHT * 1.2);
        ctx.restore();
      }
    }
  }

  muzzleFlash.draw(ctx);
  ship.draw();
  fractalCascade.drawTelegraph(ctx, ship.x, ship.y); // 🌀 FRACTAL TRIANGLES ABOVE SHIP
  tesseractManager.drawAuraAndHUD(ctx, ship.x, ship.y); // ◈ LASER BOOST AURA + HUD TIMER
  slimeAttack.drawWingDrip(
    ctx,
    ship.x, ship.y, ship.rotation,
    CONFIG.SHIP.WIDTH, CONFIG.SHIP.HEIGHT
  );
  babyWormManager.drawSlime(ctx);

  if (ocularPrism.active) {
    ocularPrism.captureFrame(tunnel.renderer.domElement, gameCanvas);
    ocularPrism.render(ctx);
  }

  if (closingScene.isActive()) closingScene.renderWhale(ctx); 
  closingScene.renderFlash(ctx);
  ctx.restore(); // END SCREEN SHAKE TRANSLATE
}

//========= HIDE LOADING SCREEN HELPER =====
function hideLoadingScreen() {
  const screen = document.getElementById('loading-screen');
  screen.style.opacity = '0';
  screen.addEventListener('transitionend', () => {
    screen.style.display = 'none';
  }, { once: true }); 
}

// ==================== STARTUP ====================
async function startup() {
  await ImageLoader.preloadCritical();
  // console.log('✔ Images ready');
  hideLoadingScreen();


  const { mode, enemyCount } = await menu.show(starfield, () => audio.start(), highScoreUI);

  currentMode       = mode;
  currentEnemyCount = enemyCount;
  // console.log(`▶ Mode: ${mode} | Enemies: ${enemyCount}`);

  if (mode === 'tentacleLab') { //  TENTACLE LAB — SKIP OPENING SCENE, LAUNCH SANDBOX DIRECTLY 
    document.getElementById('menu-overlay')?.classList.add('hidden');  // HIDE MENU OVERLAY IMMEDIATELY — LAB USES RAW CANVAS
    const { TentacleLab } = await import('./temp/tentacleLab.js'); // DYNAMIC IMPORT — LAB CODE IS ONLY LOADED WHEN ACTUALLY NEEDED
    const lab = new TentacleLab(gameCanvas, ctx);
    lab.start();
    return; // DON'T START GAME LOOP OR OPENING SCENE
  }

  if (mode === 'survival') { //  SURVIVAL MODE — SKIP OPENING CINEMATIC, GO STRAIGHT TO GAMEPLAY 
    document.getElementById('mode-transition')?.classList.add('active');
    document.getElementById('mode-transition2')?.classList.add('active');
    document.getElementById('glitch-cockpit')?.classList.add('active');

    //document.getElementById('menu-overlay')?.classList.add('hidden');  // HIDE COCKPIT OVERLAY — openingScene.play() never runs in survival mode
    const cockpit = document.getElementById('opening-cockpit');//GET COCKPIT IMG
    cockpit.style.display = 'none'; // HIDE COCKPIT IMG

    setTimeout(() => {
      document.getElementById('menu-overlay')?.classList.add('hidden');
    }, 333); 

    setTimeout(() => {
      document.getElementById('glitch-cockpit')?.classList.remove('active');
    }, 667); 

    audio.start(); // UNLOCK WEB AUDIO — NORMALLY DONE INSIDE menu.show() CALLBACK
    _gameStarted = true;

    DevTools.init();
    bot.mountToDevPanel(DevTools.panel);

    document.querySelectorAll('.pre-game-hidden').forEach(el => el.classList.remove('pre-game-hidden'));
    revealMobileControls();

    CONFIG.ENEMIES.MAX_COUNT = 0;
    ship.lives = 1; // ONE LIFE ONLY — THE CORE SURVIVAL RULE
    ship.deathSequenceEnabled = true;
    updateHPBar(ship.getHP(), CONFIG.SHIP_HP.MAX_HP);
    updateLivesDisplay(ship.lives);
    updateBombDisplay(0);
    showWaveHUD(false); // WAVE HUD NOT USED IN SURVIVAL

    initKeyboard();
    ship.onBoost = () => audio.playBoost();
    initMobileControls(
      (direction) => { ship.startBarrelRoll(direction); audio.playBarrelRoll(); },
      () => doShoot(),
      () => ship.activateBoost(),
      () => deployBomb()
    );

    lastTime = performance.now();
    gameLoop(); // START LOOP FIRST — TUNNEL ANIMATES BEHIND COUNTDOWN

    audio.startSurvivalSequence();
    await survivalScene.show(); // OVERLAY ON TOP; start() FIRES WHEN DONE
    return;
  }

  await openingScene.play(true); 
  // console.log('✔ Opening scene complete');
  _gameStarted = true;  // CURSOR HIDING NOW ACTIVE;

  DevTools.init();  // DEV TOOLS (SLIDERS + SESSION RECORDER)
  bot.mountToDevPanel(DevTools.panel);

  document.querySelectorAll('.pre-game-hidden').forEach(el => el.classList.remove('pre-game-hidden')); // REVEAL HUD AND MOBILE CONTROLS AFTER OPENING SCENE
  revealMobileControls();

  if (mode === 'bossBattle') {
    CONFIG.ENEMIES.MAX_COUNT = 0;
    wormBoss.activate();
    ship.deathSequenceEnabled = false; // BOSS BATTLE HAS ITS OWN DEATH HANDLING
  } else {
    CONFIG.ENEMIES.MAX_COUNT = 0;  
    gameplayScene.start();
    showWaveHUD(true);
  }

  updateHPBar(ship.getHP(), CONFIG.SHIP_HP.MAX_HP);
  updateLivesDisplay(ship.getLives());

  initKeyboard();
  ship.onBoost = () => audio.playBoost(); // ⚡ BOOST DRIVE SFX
  initMobileControls(
    (direction) => { ship.startBarrelRoll(direction); audio.playBarrelRoll(); },
    () => doShoot(),
    () => ship.activateBoost(),   // X BUTTON — BOOST (was: playPowerUp1 placeholder)
    () => deployBomb()            // Y BUTTON — SINGULARITY BOMB
  );

  lastTime = performance.now(); 
  gameLoop();
}

startup();