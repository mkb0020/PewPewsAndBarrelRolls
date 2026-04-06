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
    this.onGameOver = null;   // ★ NEW — FIRED WHEN REGULAR GAMEPLAY GAME OVER SCREEN SHOWS
                              //   WIRE IN main.js: transitionScene.onGameOver = () => audio.playGameOver1();

    //  DOM REFS 
    this._diedOverlay     = document.getElementById('died-overlay');
    this._gameoverOverlay = document.getElementById('gameover-overlay');
    this._bossDefeated    = document.getElementById('boss-defeated');
    this._diedSubEl       = document.getElementById('died-sub');
    this._diedLivesEl     = document.getElementById('died-lives');

    //  WIRE BUTTONS 
    document.getElementById('btn-continue')?.addEventListener('click', () => this._handleContinue());
    document.getElementById('btn-restart')?.addEventListener('click',  () => this._handleRestart());

    //  KEYBOARD SHORTCUTS 
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyC' && this._isDeadScreen) this._handleContinue();
      if (e.code === 'KeyR' && this._isGameOver)   this._handleRestart();
    });

    console.log('✔ TransitionScene initialized');
  }

  //  PUBLIC API
  get isBlocking()   { return this._isGameOver || this._isDeadScreen; }
  get isDeadScreen() { return this._isDeadScreen; }
  get isGameOver()   { return this._isGameOver;   }

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

  saveCheckpoint(score) {
    this._checkpointScore = score || 0;
    console.log(`✔ Checkpoint saved: ${this._checkpointScore}`);
  }

  getCheckpointScore() {
    return this._checkpointScore;
  }

  resetCheckpoint() {
    this._checkpointScore = 0;
  }

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
        : 'but we still believe in you! head back to the last checkpoint and make us proud!';
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
    this.onGameOver?.(); // TRIGGER GAMEOVER1 MUSIC VIA CALLBACK
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
    this.onRestart?.(); // onRestart calls audio.stop() in main.js — that stops gameover1 automatically
  }
}