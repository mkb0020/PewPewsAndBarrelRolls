// transitions.js
export class TransitionScene {

  constructor() {
    //  STATE 
    this._isGameOver   = false;
    this._isDeadScreen = false;
    this._checkpointScore = 0;
    this._bossDefeatedTimeout = null;

    //  CALLBACKS (main.js) 
    this.onContinue = null;   
    this.onRestart  = null;  

    //  DOM REFS 
    this._diedOverlay    = document.getElementById('died-overlay');
    this._gameoverOverlay = document.getElementById('gameover-overlay');
    this._bossDefeated   = document.getElementById('boss-defeated');
    this._diedSubEl      = document.getElementById('died-sub');
    this._diedLivesEl    = document.getElementById('died-lives');

    //  WIRE BUTTONS 
    document.getElementById('btn-continue')?.addEventListener('click',  () => this._handleContinue());
    document.getElementById('btn-restart')?.addEventListener('click',   () => this._handleRestart());

    //  KEYBOARD SHORTCUTS 
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyC' && this._isDeadScreen) this._handleContinue();
      if (e.code === 'KeyR' && this._isGameOver)   this._handleRestart();
    });

    console.log('✔ TransitionScene initialized');
  }

  //  PUBLIC API
  get isBlocking() { return this._isGameOver || this._isDeadScreen; }
  get isDeadScreen() { return this._isDeadScreen; }
  get isGameOver()   { return this._isGameOver;   }

  /**
   *  CALLED FROM ship.onDeath
   * @param {number}  livesLeft    
   * @param {boolean} inWormBattle  
   */
  handleDeath(livesLeft, inWormBattle) {
    if (livesLeft <= 0) {
      this._isGameOver = true;
      this._showGameOver();
    } else {
      this._showDied(inWormBattle, livesLeft);
    }
  }

  showBossDefeated() {
    if (!this._bossDefeated) { console.warn('boss-defeated element not found'); return; }
    this._bossDefeated.classList.add('active');
    clearTimeout(this._bossDefeatedTimeout);
    this._bossDefeatedTimeout = setTimeout(
      () => this._bossDefeated.classList.remove('active'),
      6000
    );
  }

  hideBossDefeated() {
    if (this._bossDefeated) this._bossDefeated.classList.remove('active');
    clearTimeout(this._bossDefeatedTimeout);
  }

  /**
   *  SNAPSHOT CURRENT SCORE AT A SAGE POINT - RAW INTEGER  SCORE VALUE
   * @param {number} score 
   */
  saveCheckpoint(score) {
    this._checkpointScore = score || 0;
    console.log(`✔ Checkpoint saved: ${this._checkpointScore}`);
  }

  /** RETURNS SAVED CHECKPOINT SCORE SO MAIN.JS CAN RESTORE IT */
  getCheckpointScore() {
    return this._checkpointScore;
  }

  /** RESTORE CHECKPOINT ON FULL RESTART - CLEARS SAVED SCORE TOO */
  resetCheckpoint() {
    this._checkpointScore = 0;
  }

  /** FULL SCENE RESET - CALLED ON GAME RESTART  */
  reset() {
    this._isGameOver   = false;
    this._isDeadScreen = false;
    this._hideDied();
    this._hideGameOver();
    this.hideBossDefeated();
  }

  //  PRIVATE — OVERLAY SHOW / HIDE
  _showDied(inWormBattle, livesLeft) {
    this._isDeadScreen = true;

    if (this._diedSubEl) {
      this._diedSubEl.textContent = inWormBattle
        ? 'pull yourself up by your bootstraps and get back out there, kiddo!'
        : 'returning to last checkpoint';
    }
    if (this._diedLivesEl) {
      this._diedLivesEl.textContent =
        `${livesLeft} ${livesLeft === 1 ? 'life' : 'lives'} remaining`;
    }
    if (this._diedOverlay) this._diedOverlay.classList.add('active');
  }

  _hideDied() {
    this._isDeadScreen = false;
    if (this._diedOverlay) this._diedOverlay.classList.remove('active');
  }

  _showGameOver() {
    if (this._gameoverOverlay) this._gameoverOverlay.classList.add('active');
  }

  _hideGameOver() {
    this._isGameOver = false;
    if (this._gameoverOverlay) this._gameoverOverlay.classList.remove('active');
  }

  //  PRIVATE — BUTTON DISPATCH
  _handleContinue() {
    if (!this._isDeadScreen) return;
    this._hideDied();
    this.onContinue?.();
  }

  _handleRestart() {
    this._hideGameOver();
    this.resetCheckpoint();
    this.onRestart?.();
  }
}