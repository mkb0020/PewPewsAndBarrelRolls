// ui.js
export class GameUI {
  constructor() {
    this._btnSound = document.getElementById('btn-sound');
    this._btnPause = document.getElementById('btn-pause');
    this._overlay  = document.getElementById('pause-overlay');

    console.log('✔ GameUI initialized');
  }

  // CALL ON STATE CHANGE ONLY - NOT EVERY FRAME
  update(isMuted, isPaused) {
    this._btnSound.classList.toggle('muted',  isMuted);
    this._btnPause.classList.toggle('paused', isPaused);
    this._overlay.classList.toggle('active',  isPaused);
  }

  handleResize() { /* CSS HANDLES LAYOUT */ }
}