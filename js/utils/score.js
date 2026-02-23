// score.js
const COMBO_WINDOW = 2.5;
const COMBO_MAX    = 8;
const SCORE_LERP_FRAMES = 8;

export class ScoreManager {
  constructor() {
    this.score         = 0;
    this.displayScore  = 0;
    this.highScore     = 0;
    this.combo         = 1;
    this.comboTimer    = 0;
    this.isComboActive = false;

    this.elScore    = document.getElementById('score-value');
    this.elHiScore  = document.getElementById('hiscore-value');
    this.elCombo    = document.getElementById('combo-display');
    this.elComboVal = document.getElementById('combo-value');
    this.elComboBar = document.getElementById('combo-bar-fill');

    console.log('✔ Score manager initialized');
  }

  addScore(basePoints, x, y) {
    const total = basePoints * this.combo;
    this.score += total;

    this.comboTimer    = COMBO_WINDOW;
    this.isComboActive = true;
    if (this.combo < COMBO_MAX) this.combo++;

    this._spawnFloat(total, this.combo - 1, x, y);
    this._updateComboDisplay();

    if (this.score > this.highScore) this.highScore = this.score;
  }

  update(dt) {
    if (this.isComboActive) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) {
        this.combo = 1; this.comboTimer = 0; this.isComboActive = false;
        this._hideCombo();
      }
      this._updateComboBar();
    }

    // SMOOTH SCORE ROLL
    if (this.displayScore < this.score) {
      const diff = this.score - this.displayScore;
      this.displayScore = Math.min(this.score, this.displayScore + Math.max(1, Math.ceil(diff / SCORE_LERP_FRAMES)));
      if (this.elScore) this.elScore.textContent = this._fmt(this.displayScore);
    }

    if (this.elHiScore) this.elHiScore.textContent = this._fmt(this.highScore);
  }

  reset() {
    this.score = 0; this.displayScore = 0; this.combo = 1;
    this.comboTimer = 0; this.isComboActive = false;
    this._hideCombo();
    if (this.elScore) this.elScore.textContent = '000,000';
  }

  _fmt(n) {
    return String(Math.floor(n)).padStart(6, '0').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  _updateComboDisplay() {
    if (!this.elCombo || !this.elComboVal) return;
    const c = Math.min(this.combo, COMBO_MAX);
    this.elCombo.classList.remove('hidden');
    const hue = Math.max(0, 180 - (c - 1) * 22);   
    this.elCombo.style.setProperty('--combo-hue', hue);
    this.elComboVal.textContent = `×${c}`;
    this.elComboVal.classList.remove('combo-pulse');
    void this.elComboVal.offsetWidth;             
    this.elComboVal.classList.add('combo-pulse');
  }

  _updateComboBar() {
    if (!this.elComboBar) return;
    const pct = Math.max(0, (this.comboTimer / COMBO_WINDOW) * 100);
    this.elComboBar.style.width = pct + '%';
    this.elComboBar.style.opacity = pct < 20
      ? 0.5 + 0.5 * Math.sin(Date.now() / 80)      // FLASH RED WHEN LOW
      : 1;
  }

  _hideCombo() {
    if (this.elCombo) this.elCombo.classList.add('hidden');
  }

  _spawnFloat(points, comboMult, x, y) {
    const el = document.createElement('div');
    el.className = 'float-score';
    const tag = comboMult > 1 ? ` <span class="float-combo">×${comboMult}</span>` : '';
    el.innerHTML = `+${points}${tag}`;
    const drift = (Math.random() - 0.5) * 60;
    el.style.cssText = `left:${x + drift}px; top:${y - 20}px; --drift:${drift}px;
      font-size:${1 + Math.min(comboMult - 1, 5) * 0.12}rem`;
    document.body.appendChild(el);
    el.addEventListener('animationend', () => el.remove());
  }
}